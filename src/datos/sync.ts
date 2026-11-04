/**
 * Sincronizacion: empujar la cola local y traer lo de los demas.
 *
 * IDEMPOTENTE. El servidor ignora los ids que ya tiene, asi que reintentar una
 * subida cortada a medias es siempre seguro y nunca duplica.
 *
 * El cursor de lectura NO confia en el reloj de los celulares: un telefono con
 * la hora atrasada escribe filas "antiguas" que un cursor estricto se perderia.
 * Por eso se relee una ventana de 24 h y se deduplica por id (la hoja es chica).
 */

import { leerMeta, guardarMeta } from "./db";
import type { BaseLocal, EntradaCola } from "./db";
import type { ClienteApi, LoteSync } from "./api";
import {
  apkDeNube,
  controlDeNube,
  eventoDeNube,
  ultimasVersiones,
  versionDeEpisodioNube
} from "./nube";
import type { FilaNube, VersionEpisodio } from "./nube";

/** 2 s, 4 s, 8 s ... hasta un maximo de 5 minutos. */
export function esperaReintentoMs(intentos: number): number {
  return Math.min(2000 * 2 ** Math.max(0, intentos - 1), 300_000);
}

export const VENTANA_LECTURA_MS = 24 * 3600 * 1000;

export interface ResultadoEmpuje {
  readonly enviados: number;
  readonly pendientes: number;
  readonly bloqueadas: number;
  readonly error: string | null;
}

export interface ResultadoTraer {
  readonly controles: number;
  readonly eventos: number;
  readonly apk: number;
  readonly episodios: number;
  readonly error: string | null;
}

const CLAVE_ULTIMA_LECTURA = "ultimaLectura";
const prefijoVersion = (episodioId: string): string => `verEpisodio:${episodioId}`;

export class Sincronizador {
  constructor(
    private readonly db: BaseLocal,
    private readonly api: ClienteApi,
    private readonly ahora: () => number = Date.now,
    private readonly tamLote = 50
  ) {}

  async encolar(filas: readonly FilaNube[]): Promise<void> {
    const t = this.ahora();
    await this.db.cola.bulkAdd(
      filas.map((f): EntradaCola => ({
        tipo: f.tipo,
        registroId: f.registroId,
        payload: f.payload,
        intentos: 0,
        creadoEn: t,
        proximoIntento: 0,
        ultimoError: null,
        estado: "pendiente"
      }))
    );
  }

  async pendientes(): Promise<number> {
    return this.db.cola.where("estado").equals("pendiente").count();
  }

  async bloqueadas(): Promise<readonly EntradaCola[]> {
    return this.db.cola.where("estado").equals("bloqueada").toArray();
  }

  /** Sube hasta un lote de la cola. Llamar de nuevo para seguir con el resto. */
  async empujar(): Promise<ResultadoEmpuje> {
    const t = this.ahora();
    const lista = (await this.db.cola.where("estado").equals("pendiente").sortBy("id"))
      .filter((e) => e.proximoIntento <= t)
      .slice(0, this.tamLote);

    if (lista.length === 0) return this.resumen(0, null);

    const lote: LoteSync = { episodios: [], controles: [], eventos: [], apk: [] };
    for (const e of lista) {
      const destino = e.tipo === "episodio" ? lote.episodios : e.tipo === "control" ? lote.controles : e.tipo === "evento" ? lote.eventos : lote.apk;
      destino.push(e.payload);
    }

    const r = await this.api.sincronizar(lote);
    const ids = lista.map((e) => e.id!).filter((id): id is number => id !== undefined);

    if (r.ok) {
      await this.db.cola.bulkDelete(ids);
      await guardarMeta(this.db, "ultimaSubida", t);
      return this.resumen(ids.length, null);
    }

    if (r.error === "PAYLOAD_CON_IDENTIDAD") {
      // Es un defecto, no un fallo de red: reintentar no lo arregla.
      const detalle = `El servidor rechazó datos identificables: ${(r.llaves ?? []).join(", ")}`;
      await Promise.all(ids.map((id) => this.db.cola.update(id, { estado: "bloqueada", ultimoError: detalle })));
      return this.resumen(0, detalle);
    }

    await Promise.all(
      lista.map((e) =>
        this.db.cola.update(e.id!, {
          intentos: e.intentos + 1,
          proximoIntento: t + esperaReintentoMs(e.intentos + 1),
          ultimoError: r.error
        })
      )
    );
    return this.resumen(0, r.error);
  }

  private async resumen(enviados: number, error: string | null): Promise<ResultadoEmpuje> {
    return {
      enviados,
      pendientes: await this.pendientes(),
      bloqueadas: (await this.bloqueadas()).length,
      error
    };
  }

  /** Lee lo que subieron los demas y lo fusiona en la base local, sin pisar cambios locales mas nuevos. */
  async traer(opciones: { todo?: boolean } = {}): Promise<ResultadoTraer> {
    const vacio: ResultadoTraer = { controles: 0, eventos: 0, apk: 0, episodios: 0, error: null };
    const ultima = await leerMeta<number>(this.db, CLAVE_ULTIMA_LECTURA);
    const desde = opciones.todo || ultima === undefined ? null : new Date(ultima - VENTANA_LECTURA_MS).toISOString();

    const r = await this.api.leer(desde);
    if (!r.ok) return { ...vacio, error: r.error };
    const d = r.datos;

    const controles = d.controles.map(controlDeNube).filter((x): x is NonNullable<typeof x> => x !== null);
    const eventos = d.eventos.map(eventoDeNube).filter((x): x is NonNullable<typeof x> => x !== null);
    const apk = d.apk.map(apkDeNube).filter((x): x is NonNullable<typeof x> => x !== null);
    const versiones = d.episodios.map(versionDeEpisodioNube).filter((x): x is VersionEpisodio => x !== null);

    // Un registro propio (id ya existente) no se pisa: la nube y lo local coinciden por construccion.
    const nuevos = async <T extends { id: string }>(tabla: { bulkGet(k: string[]): Promise<(T | undefined)[]>; bulkPut(v: T[]): Promise<unknown> }, filas: readonly T[]): Promise<number> => {
      if (filas.length === 0) return 0;
      const existentes = await tabla.bulkGet(filas.map((f) => f.id));
      const faltan = filas.filter((_, i) => existentes[i] === undefined);
      if (faltan.length > 0) await tabla.bulkPut(faltan);
      return faltan.length;
    };

    const nC = await nuevos(this.db.controles, controles);
    const nE = await nuevos(this.db.eventos, eventos);
    const nA = await nuevos(this.db.apk, apk);

    // Episodios: solo se aplica una version remota si es mas nueva que la local.
    let nEp = 0;
    const marcaDe = new Map(versiones.map((v) => [v.episodio.id, v.registradoEn] as const));
    for (const ep of ultimasVersiones(versiones)) {
      const marcaLocal = await leerMeta<string>(this.db, prefijoVersion(ep.id));
      const marcaRemota = marcaDe.get(ep.id) ?? "";
      if (marcaLocal === undefined || marcaRemota > marcaLocal) {
        await this.db.episodios.put(ep);
        await guardarMeta(this.db, prefijoVersion(ep.id), marcaRemota);
        nEp += 1;
      }
    }

    if (d.servidorEn) await guardarMeta(this.db, CLAVE_ULTIMA_LECTURA, Date.parse(d.servidorEn) || this.ahora());
    return { controles: nC, eventos: nE, apk: nA, episodios: nEp, error: null };
  }

  /** Marca local de la version de un episodio (para no pisarla al leer). */
  async marcarVersionLocal(episodioId: string, registradoEn: string): Promise<void> {
    await guardarMeta(this.db, prefijoVersion(episodioId), registradoEn);
  }

  /** Un ciclo completo: subir y luego traer. */
  async ciclo(): Promise<{ empuje: ResultadoEmpuje; lectura: ResultadoTraer }> {
    const empuje = await this.empujar();
    const lectura = await this.traer();
    return { empuje, lectura };
  }
}
