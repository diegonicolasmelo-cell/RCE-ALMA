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

import { borrarMeta, leerMeta, guardarMeta } from "./db";
import type { BaseLocal, EntradaCola } from "./db";
import type { ClienteApi, LoteSync } from "./api";
import { controlParaRce, eventoParaRce, normalizarControl } from "@core/index";
import type { ItemParaRce } from "@core/index";
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

/** Ultimo error de sincronizacion (se borra al sincronizar bien): para mostrar el motivo. */
export const CLAVE_ERROR_SYNC = "ultimoErrorSync";
export interface ErrorSync {
  readonly error: string;
  readonly en: number;
}

/** El motivo de un error de sincronizacion, dicho para quien usa la app. */
export function textoErrorSync(codigo: string): string {
  switch (codigo) {
    case "TOKEN_INVALIDO":
      return "La llave de este equipo ya no vale: se crearon llaves nuevas. Abre o pega el enlace nuevo que entrega coordinación.";
    case "SIN_CONEXION":
      return "No se pudo llegar al servidor: sin señal, o cambió la dirección de Apps Script.";
    case "RESPUESTA_NO_ES_LA_APP":
    case "RESPUESTA_INVALIDA":
      return "El servidor no respondió como la app: revisa que la implementación de Apps Script tenga acceso «Cualquier persona».";
    case "OCUPADO_REINTENTAR":
      return "El servidor estaba ocupado: se reintenta solo.";
    case "SOLO_LECTURA":
      return "Este perfil es de solo lectura: no se guardan registros.";
    case "REGISTRO_CERRADO":
      return "El registro de llaves está cerrado.";
    default:
      return codigo.startsWith("El servidor rechazó") ? codigo : `Error del servidor (${codigo}).`;
  }
}

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
const CLAVE_EPOCA = "epocaDatos";
const CLAVE_BORRADOS = "borradosAplicados";
/** Una vez por equipo: el relleno de lo anterior al enlace ya se mandó al RCE. */
export const CLAVE_RELLENO_RCE = "rellenoRce:v1";
const CLAVE_RELLENO_INTENTO = "rellenoRce:intento";
const RELLENO_POR_ENVIO = 150;

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
  async empujar(opciones: { forzar?: boolean } = {}): Promise<ResultadoEmpuje> {
    const t = this.ahora();
    const lista = (await this.db.cola.where("estado").equals("pendiente").sortBy("id"))
      // «Sincronizar ahora» no espera el reintento programado.
      .filter((e) => opciones.forzar || e.proximoIntento <= t)
      .slice(0, this.tamLote);

    if (lista.length === 0) return this.resumen(0, null);

    const lote: LoteSync = { episodios: [], controles: [], eventos: [], apk: [] };
    for (const e of lista) {
      const destino = e.tipo === "episodio" ? lote.episodios : e.tipo === "control" ? lote.controles : e.tipo === "evento" ? lote.eventos : lote.apk;
      destino.push(e.payload);
    }

    // RCE by Kaptus (22-nov-2026): con el lote va la traduccion al idioma del RCE. Si algo falla al
    // traducir, el lote sube igual: el RCE es un destino mas, nunca un freno para guardar.
    try {
      const paraRce: ItemParaRce[] = [];
      for (const e of lista) {
        if (e.tipo !== "control" && e.tipo !== "evento") continue;
        if (e.tipo === "control") {
          const c = await this.db.controles.get(e.registroId);
          const ep = c ? await this.db.episodios.get(c.episodioId) : undefined;
          const evs = ep ? await this.db.eventos.where("episodioId").equals(ep.id).toArray() : [];
          const it = c && ep ? controlParaRce(normalizarControl(c), ep, evs) : null;
          if (it) paraRce.push(it);
        } else {
          const ev = await this.db.eventos.get(e.registroId);
          const ep = ev ? await this.db.episodios.get(ev.episodioId) : undefined;
          const it = ev && ep ? eventoParaRce(ev, ep) : null;
          if (it) paraRce.push(it);
        }
      }
      if (paraRce.length) lote.paraRce = paraRce;
    } catch {
      /* sin traduccion: el RCE lo recibira en el siguiente envio */
    }

    const r = await this.api.sincronizar(lote);
    const ids = lista.map((e) => e.id!).filter((id): id is number => id !== undefined);

    if (r.ok) {
      await this.db.cola.bulkDelete(ids);
      await guardarMeta(this.db, "ultimaSubida", t);
      return this.resumen(ids.length, null);
    }

    if (r.error === "SOLO_LECTURA") {
      // Perfil médico: el servidor no guarda nada suyo. Reintentar no lo cambia.
      const detalle = "Este perfil es de solo lectura: el servidor no guarda registros suyos.";
      await Promise.all(ids.map((id) => this.db.cola.update(id, { estado: "bloqueada", ultimoError: detalle })));
      return this.resumen(0, detalle);
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

    // Se limpio todo en el servidor (limpiarTodoCONFIRMAR): se vacia esta copia y se baja de nuevo.
    const epoca = d.epoca ?? "";
    const mia = await leerMeta<string>(this.db, CLAVE_EPOCA);
    if (epoca !== "" && mia !== epoca) {
      const conDatos = (await this.db.episodios.count()) > 0;
      await guardarMeta(this.db, CLAVE_EPOCA, epoca);
      if (mia !== undefined || conDatos) {
        await this.vaciarCopiaLocal(Date.parse(epoca) || this.ahora());
        return this.traer({ todo: true });
      }
    }
    if (d.borrados?.length) await this.quitarBorrados(d.borrados);

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

  /**
   * Vacia la copia local tras una limpieza total del servidor. Lo que se registro sin senal
   * DESPUES de la limpieza sigue en la cola y se sube; lo anterior se descarta.
   */
  private async vaciarCopiaLocal(limpiezaMs: number): Promise<void> {
    await Promise.all([this.db.episodios.clear(), this.db.controles.clear(), this.db.eventos.clear(), this.db.apk.clear(), this.db.identidades.clear()]);
    const viejas = (await this.db.cola.toArray()).filter((e) => e.creadoEn <= limpiezaMs).map((e) => e.id!);
    if (viejas.length) await this.db.cola.bulkDelete(viejas);
    const marcas = (await this.db.meta.toArray()).filter((m) => m.clave.startsWith("verEpisodio:") || m.clave === CLAVE_ULTIMA_LECTURA || m.clave === CLAVE_BORRADOS);
    await this.db.meta.bulkDelete(marcas.map((m) => m.clave));
  }

  /** Quita de la copia local los episodios borrados en el servidor (limpiarPacienteCONFIRMAR). */
  private async quitarBorrados(ids: readonly string[]): Promise<void> {
    const hechos = new Set((await leerMeta<string[]>(this.db, CLAVE_BORRADOS)) ?? []);
    const nuevos = ids.filter((id) => !hechos.has(id));
    if (nuevos.length === 0) return;
    for (const id of nuevos) {
      await this.db.episodios.delete(id);
      await this.db.controles.where("episodioId").equals(id).delete();
      await this.db.eventos.where("episodioId").equals(id).delete();
      await this.db.apk.where("episodioId").equals(id).delete();
      await this.db.identidades.delete(id);
      await this.db.meta.delete(prefijoVersion(id));
    }
    const enCola = (await this.db.cola.toArray()).filter((e) => nuevos.includes(String(e.payload["episodioId"] ?? "")));
    if (enCola.length) await this.db.cola.bulkDelete(enCola.map((e) => e.id!));
    await guardarMeta(this.db, CLAVE_BORRADOS, [...hechos, ...nuevos]);
  }

  /** Marca local de la version de un episodio (para no pisarla al leer). */
  async marcarVersionLocal(episodioId: string, registradoEn: string): Promise<void> {
    await guardarMeta(this.db, prefijoVersion(episodioId), registradoEn);
  }

  /**
   * RCE by Kaptus (23-nov-2026, Diego: «no veo datos aportados por Kaptus, solo los del RCE»). El
   * enlace reenvía solo lo que se sube DESPUÉS de encenderlo; lo registrado antes nunca llegó a la
   * sábana del RCE. Una vez por equipo se manda todo lo de los pacientes en cama, marcado como
   * relleno: el RCE lo guarda por id (repetirlo no duplica) y no lo aplica. Traslados, equipos,
   * filtros y rondas viejos no van: ya ocurrieron y en el RCE se ven de otra forma.
   * Devuelve cuántos se mandaron; si el enlace está apagado o algo falla, se reintenta otro día.
   */
  async rellenarRce(): Promise<number> {
    if (this.api.local || (await leerMeta<number>(this.db, CLAVE_RELLENO_RCE))) return 0;
    // Con el enlace apagado no se insiste en cada sincronía: se vuelve a probar a las 6 horas.
    const intento = await leerMeta<number>(this.db, CLAVE_RELLENO_INTENTO);
    if (intento && this.ahora() - intento < 6 * 3600 * 1000) return 0;
    await guardarMeta(this.db, CLAVE_RELLENO_INTENTO, this.ahora());
    const SIN_RELLENO = new Set(["TRASLADO", "EQUIPOS", "FILTRO", "RONDA"]);
    const items: ItemParaRce[] = [];
    for (const ep of (await this.db.episodios.toArray()).filter((e) => e.activo)) {
      const evs = await this.db.eventos.where("episodioId").equals(ep.id).toArray();
      const ctls = await this.db.controles.where("episodioId").equals(ep.id).toArray();
      for (const c of ctls) {
        const it = controlParaRce(normalizarControl(c), ep, evs);
        if (it) { const { equipos: _sinEquipos, ...resto } = it; void _sinEquipos; items.push({ ...resto, relleno: true }); }
      }
      for (const ev of evs) {
        const it = eventoParaRce(ev, ep);
        if (it && !SIN_RELLENO.has(String(it.evento ?? ""))) { const { equipos: _sinEquipos, ...resto } = it; void _sinEquipos; items.push({ ...resto, relleno: true }); }
      }
    }
    for (let i = 0; i < items.length; i += RELLENO_POR_ENVIO) {
      const r = await this.api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [], paraRce: items.slice(i, i + RELLENO_POR_ENVIO) });
      const rce = r.ok ? r.rce : undefined;
      // «en_espera»: el RCE no respondió, pero el servidor de Kaptus lo guardó y lo reintenta solo.
      if (!r.ok || !rce || (rce.estado !== "entregado" && rce.estado !== "en_espera")) return 0;
    }
    await guardarMeta(this.db, CLAVE_RELLENO_RCE, this.ahora());
    return items.length;
  }

  /** Un ciclo completo: subir y luego traer. */
  async ciclo(opciones: { forzar?: boolean } = {}): Promise<{ empuje: ResultadoEmpuje; lectura: ResultadoTraer }> {
    const empuje = await this.empujar(opciones);
    const lectura = await this.traer();
    const error = empuje.error ?? lectura.error;
    // Con la base al día (traer), una sola vez: lo anterior al enlace también al RCE.
    if (!error) { try { await this.rellenarRce(); } catch { /* se reintenta en el próximo ciclo */ } }
    if (error) await guardarMeta(this.db, CLAVE_ERROR_SYNC, { error, en: this.ahora() } satisfies ErrorSync);
    // Mientras queden registros esperando su reintento, el motivo sigue a la vista.
    else if (empuje.enviados > 0 || empuje.pendientes === 0) await borrarMeta(this.db, CLAVE_ERROR_SYNC);
    return { empuje, lectura };
  }
}
