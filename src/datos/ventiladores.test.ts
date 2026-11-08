import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { enCama, enZona, ventiladorEnCama } from "@core/index";
import type { ClienteApi, DatosNube, LoteSync, RespuestaSync } from "./api";
import { crearApiLocal } from "./api";
import { BaseLocal } from "./db";
import { Repositorio } from "./repositorio";
import { Sincronizador } from "./sync";

let n = 0;
let ids = 0;
const nuevoId = (): string => `id-${++ids}`;
const nuevaDb = (): BaseLocal => new BaseLocal(`vent-${++n}-${Math.random()}`);

/** Un "servidor" compartido por varios celulares: deduplica por id, como Apps Script. */
function servidorFalso(): ClienteApi {
  const guardado = new Map<string, Record<string, unknown>>();
  return {
    ...crearApiLocal(),
    local: false,
    async sincronizar(lote: LoteSync): Promise<RespuestaSync> {
      for (const f of lote.ventiladores) if (!guardado.has(String(f["id"]))) guardado.set(String(f["id"]), f);
      return { ok: true, servidorEn: new Date().toISOString() };
    },
    async leer() {
      const datos: DatosNube = {
        episodios: [],
        controles: [],
        eventos: [],
        apk: [],
        ventiladores: [...guardado.values()],
        servidorEn: new Date().toISOString()
      };
      return { ok: true, datos };
    }
  };
}

function celular(api: ClienteApi) {
  const db = nuevaDb();
  const sync = new Sincronizador(db, api);
  return { db, sync, repo: new Repositorio(db, sync) };
}

describe("ventiladores en la base local y en la nube", () => {
  it("un movimiento se guarda local, se encola y sube sin identidad", async () => {
    const api = servidorFalso();
    const a = celular(api);
    const alta = await a.repo.altaVentilador("PB840", 1, enZona("BODEGA"), "16.452.891-K", nuevoId);
    expect(alta.ok).toBe(true);
    const mov = await a.repo.moverVentilador("PB840-1", enCama("2"), {}, "16.452.891-K", nuevoId);
    expect(mov.ok).toBe(true);
    expect(await a.sync.pendientes()).toBe(2);
    const r = await a.sync.empujar();
    expect(r.error).toBeNull();
    expect(r.pendientes).toBe(0);
    expect(ventiladorEnCama(await a.repo.inventarioVentiladores(), "2")?.etiqueta).toBe("PB840 1");
  });

  it("un movimiento rechazado por las reglas no escribe ni encola nada", async () => {
    const a = celular(servidorFalso());
    await a.repo.altaVentilador("VELA", 1, enZona("BODEGA"), "16.452.891-K", nuevoId);
    const antes = await a.sync.pendientes();
    const r = await a.repo.moverVentilador("VELA-1", enZona("FUERA"), {}, "16.452.891-K", nuevoId);
    expect(r).toMatchObject({ ok: false, error: "FALTA_SERVICIO" });
    expect(await a.sync.pendientes()).toBe(antes);
    expect(await a.db.movVentiladores.count()).toBe(1);
  });

  it("dos celulares terminan viendo lo mismo: manda el último movimiento", async () => {
    const api = servidorFalso();
    const a = celular(api);
    const b = celular(api);
    await a.repo.altaVentilador("AVEA", 1, enZona("BODEGA"), "16.452.891-K", nuevoId);
    await a.sync.ciclo();
    await b.sync.ciclo();
    expect((await b.repo.inventarioVentiladores()).map((v) => v.etiqueta)).toEqual(["Avea 1"]);

    await a.repo.moverVentilador("AVEA-1", enCama("5"), {}, "16.452.891-K", nuevoId);
    await a.sync.ciclo();
    await b.sync.ciclo();
    expect(ventiladorEnCama(await b.repo.inventarioVentiladores(), "5")?.etiqueta).toBe("Avea 1");
    expect(await b.db.movVentiladores.count()).toBe(2);

    // Traer dos veces no duplica nada.
    await b.sync.traer({ todo: true });
    expect(await b.db.movVentiladores.count()).toBe(2);
  });

  it("guarda la historia: cada movimiento queda con quién y cuándo", async () => {
    const a = celular(servidorFalso());
    await a.repo.altaVentilador("SAVINA300", 1, enZona("BODEGA"), "16.452.891-K", nuevoId);
    await a.repo.moverVentilador("SAVINA300-1", enZona("MANTENCION"), { nota: "Revisión anual" }, "33.333.333-3", nuevoId);
    const h = await a.repo.movimientosDe("SAVINA300-1");
    expect(h.map((m) => m.rutAutor)).toEqual(["16.452.891-K", "33.333.333-3"]);
    expect(h[1]?.nota).toBe("Revisión anual");
  });
});
