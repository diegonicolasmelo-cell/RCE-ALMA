/**
 * Repositorio: unico punto de escritura y lectura de datos clinicos.
 *
 * Cada escritura guarda localmente y encola para subir en UNA transaccion, de
 * modo que nunca queda un dato guardado sin su subida pendiente (ni al reves).
 */

import { aplicarEventoAEpisodio, altaVentilador, derivarInventario, moverVentilador } from "@core/index";
import { normalizarControl } from "@core/index";
import type {
  Control,
  DatosDestino,
  Episodio,
  EventoClinico,
  ModeloVentilador,
  MovimientoVentilador,
  ResultadoMovimiento,
  UbicacionVentilador,
  ValidacionApk,
  Ventilador
} from "@core/index";
import type { BaseLocal } from "./db";
import { filaDeApk, filaDeControl, filaDeEpisodio, filaDeEvento, filaDeMovimientoVentilador } from "./nube";
import type { FilaNube } from "./nube";
import type { Sincronizador } from "./sync";

export class Repositorio {
  constructor(
    readonly db: BaseLocal,
    readonly sync: Sincronizador,
    private readonly ahora: () => Date = () => new Date()
  ) {}

  private tablas() {
    return [this.db.episodios, this.db.controles, this.db.eventos, this.db.apk, this.db.movVentiladores, this.db.cola, this.db.meta];
  }

  /** Guarda una version nueva del episodio. Devuelve la fila para encolarla. */
  private async poner(e: Episodio): Promise<FilaNube> {
    const t = this.ahora();
    await this.db.episodios.put(e);
    await this.sync.marcarVersionLocal(e.id, t.toISOString());
    return filaDeEpisodio(e, t.getTime(), t);
  }

  async guardarEpisodio(e: Episodio): Promise<void> {
    await this.db.transaction("rw", this.tablas(), async () => {
      await this.sync.encolar([await this.poner(e)]);
    });
  }

  async guardarControl(c: Control): Promise<void> {
    await this.db.transaction("rw", this.tablas(), async () => {
      await this.db.controles.add(c);
      await this.sync.encolar([filaDeControl(c)]);
    });
  }

  /**
   * Registra un evento y aplica su efecto sobre la via aerea del episodio, todo
   * en una transaccion. Devuelve el episodio resultante.
   */
  async registrarEvento(ev: EventoClinico): Promise<Episodio | null> {
    return this.db.transaction("rw", this.tablas(), async () => {
      await this.db.eventos.add(ev);
      const filas: FilaNube[] = [filaDeEvento(ev)];
      const ep = await this.db.episodios.get(ev.episodioId);
      let resultado: Episodio | null = ep ?? null;
      if (ep) {
        const nuevo = aplicarEventoAEpisodio(ep, ev);
        if (nuevo !== ep) {
          filas.push(await this.poner(nuevo));
          resultado = nuevo;
        }
      }
      await this.sync.encolar(filas);
      return resultado;
    });
  }

  async firmarApk(a: ValidacionApk): Promise<void> {
    await this.db.transaction("rw", this.tablas(), async () => {
      await this.db.apk.add(a);
      await this.sync.encolar([filaDeApk(a)]);
    });
  }

  /** El semaforo "Transcrito": dice que se copio la evolucion, no que ALMA la recibio. */
  async marcarTranscrito(episodioId: string, hora: string, transcrito = true): Promise<void> {
    await this.db.transaction("rw", this.tablas(), async () => {
      const ep = await this.db.episodios.get(episodioId);
      if (!ep) return;
      await this.sync.encolar([await this.poner({ ...ep, transcritoAlma: transcrito, horaTranscripcion: transcrito ? hora : null })]);
    });
  }

  async darAlta(episodioId: string): Promise<void> {
    await this.db.transaction("rw", this.tablas(), async () => {
      const ep = await this.db.episodios.get(episodioId);
      if (!ep) return;
      await this.sync.encolar([await this.poner({ ...ep, activo: false })]);
    });
  }

  /**
   * Mover un ventilador (o darlo de alta). Lee el inventario, decide con las reglas
   * del nucleo y escribe los movimientos, todo en una transaccion: dos toques seguidos
   * nunca ven un inventario a medias.
   */
  async moverVentilador(
    ventiladorId: string,
    destino: UbicacionVentilador,
    datos: DatosDestino,
    rutAutor: string,
    nuevoId: () => string
  ): Promise<ResultadoMovimiento> {
    return this.decidirVentilador((inv, ctx) => moverVentilador(inv, ventiladorId, destino, datos, ctx), rutAutor, nuevoId);
  }

  async altaVentilador(
    modelo: ModeloVentilador,
    numero: number,
    destino: UbicacionVentilador,
    rutAutor: string,
    nuevoId: () => string
  ): Promise<ResultadoMovimiento> {
    return this.decidirVentilador((inv, ctx) => altaVentilador(inv, modelo, numero, destino, ctx), rutAutor, nuevoId);
  }

  private async decidirVentilador(
    decidir: (inv: readonly Ventilador[], ctx: { rutAutor: string; ahora: Date; nuevoId: () => string }) => ResultadoMovimiento,
    rutAutor: string,
    nuevoId: () => string
  ): Promise<ResultadoMovimiento> {
    return this.db.transaction("rw", this.tablas(), async () => {
      const inv = derivarInventario(await this.db.movVentiladores.toArray());
      const r = decidir(inv, { rutAutor, ahora: this.ahora(), nuevoId });
      if (r.ok) {
        await this.db.movVentiladores.bulkAdd([...r.movimientos]);
        await this.sync.encolar(r.movimientos.map(filaDeMovimientoVentilador));
      }
      return r;
    });
  }

  async inventarioVentiladores(): Promise<readonly Ventilador[]> {
    return derivarInventario(await this.db.movVentiladores.toArray());
  }

  /** El registro completo de movimientos de un equipo, del mas antiguo al mas nuevo. */
  async movimientosDe(ventiladorId: string): Promise<readonly MovimientoVentilador[]> {
    const m = await this.db.movVentiladores.where("ventiladorId").equals(ventiladorId).toArray();
    return m.sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  }

  // ---- lectura ----

  async episodiosActivos(): Promise<readonly Episodio[]> {
    const todos = await this.db.episodios.toArray();
    return todos.filter((e) => e.activo).sort((a, b) => a.cama.localeCompare(b.cama, "es", { numeric: true }));
  }

  async controlesDe(episodioId: string): Promise<readonly Control[]> {
    const c = await this.db.controles.where("episodioId").equals(episodioId).toArray();
    return c.map(normalizarControl).sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  }

  async eventosDe(episodioId: string): Promise<readonly EventoClinico[]> {
    const e = await this.db.eventos.where("episodioId").equals(episodioId).toArray();
    return e.sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  }

  async apkDe(episodioId: string): Promise<readonly ValidacionApk[]> {
    return this.db.apk.where("episodioId").equals(episodioId).toArray();
  }
}
