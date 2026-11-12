import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { BaseLocal } from "./db";
import { Sincronizador, esperaReintentoMs } from "./sync";
import { Repositorio } from "./repositorio";
import type { ClienteApi, DatosNube, LoteSync, RespuestaSync } from "./api";
import { crearApiLocal } from "./api";
import { filaDeControl, filaDeEpisodio } from "./nube";
import { unControl, unEpisodio, unEvento } from "@core/fixtures";
import type { EventoClinico } from "@core/index";

let n = 0;
const nuevaDb = () => new BaseLocal(`test-${++n}-${Math.random()}`);

/** API de mentira con un "servidor" que deduplica por id, como Apps Script. */
function servidorFalso() {
  const guardado: Record<keyof LoteSync, Map<string, Record<string, unknown>>> = {
    episodios: new Map(),
    controles: new Map(),
    eventos: new Map(),
    apk: new Map()
  };
  const estado = { falla: null as string | null, llamadas: 0, llaves: [] as string[], epoca: "", borrados: [] as string[] };
  const api: ClienteApi = {
    ...crearApiLocal(),
    local: false,
    async sincronizar(lote): Promise<RespuestaSync> {
      estado.llamadas += 1;
      if (estado.falla) return { ok: false, error: estado.falla, ...(estado.llaves.length ? { llaves: estado.llaves } : {}) };
      for (const k of Object.keys(guardado) as (keyof LoteSync)[]) {
        for (const fila of lote[k]) if (!guardado[k].has(String(fila["id"]))) guardado[k].set(String(fila["id"]), fila);
      }
      return { ok: true, servidorEn: new Date(2026, 10, 4, 12, 0).toISOString() };
    },
    async leer() {
      const datos: DatosNube = {
        episodios: [...guardado.episodios.values()],
        controles: [...guardado.controles.values()],
        eventos: [...guardado.eventos.values()],
        apk: [...guardado.apk.values()],
        servidorEn: new Date(2026, 10, 4, 12, 0).toISOString(),
        epoca: estado.epoca,
        borrados: estado.borrados
      };
      return { ok: true, datos };
    }
  };
  return { api, guardado, estado };
}

describe("esperaReintentoMs", () => {
  it("crece de forma exponencial y se topa en 5 minutos", () => {
    expect(esperaReintentoMs(1)).toBe(2000);
    expect(esperaReintentoMs(2)).toBe(4000);
    expect(esperaReintentoMs(3)).toBe(8000);
    expect(esperaReintentoMs(20)).toBe(300_000);
  });
});

describe("cola de subida", () => {
  let db: BaseLocal;
  let reloj: number;
  beforeEach(() => {
    db = nuevaDb();
    reloj = 1_000_000;
  });

  it("guardar un control lo deja en la base local Y en la cola, juntos", async () => {
    const { api } = servidorFalso();
    const sync = new Sincronizador(db, api, () => reloj);
    const repo = new Repositorio(db, sync);
    await repo.guardarControl(unControl());
    expect(await db.controles.count()).toBe(1);
    expect(await sync.pendientes()).toBe(1);
  });

  it("empujar sube lo pendiente y vacía la cola", async () => {
    const { api, guardado } = servidorFalso();
    const sync = new Sincronizador(db, api, () => reloj);
    await new Repositorio(db, sync).guardarControl(unControl());
    const r = await sync.empujar();
    expect(r.enviados).toBe(1);
    expect(r.pendientes).toBe(0);
    expect(guardado.controles.has("ct-1")).toBe(true);
  });

  it("sin conexión conserva todo y reintenta más tarde con espera creciente", async () => {
    const { api, estado } = servidorFalso();
    estado.falla = "SIN_CONEXION";
    const sync = new Sincronizador(db, api, () => reloj);
    await new Repositorio(db, sync).guardarControl(unControl());

    const r1 = await sync.empujar();
    expect(r1.enviados).toBe(0);
    expect(r1.pendientes).toBe(1);
    expect(r1.error).toBe("SIN_CONEXION");

    // Todavía dentro de la espera: no vuelve a llamar al servidor.
    estado.llamadas = 0;
    await sync.empujar();
    expect(estado.llamadas).toBe(0);

    // Pasada la espera, reintenta y esta vez funciona.
    estado.falla = null;
    reloj += esperaReintentoMs(1) + 1;
    const r2 = await sync.empujar();
    expect(r2.enviados).toBe(1);
    expect(r2.pendientes).toBe(0);
  });

  it("es idempotente: reenviar lo ya subido no duplica en el servidor", async () => {
    const { api, guardado } = servidorFalso();
    const sync = new Sincronizador(db, api, () => reloj);
    const fila = filaDeControl(unControl());
    await sync.encolar([fila]);
    await sync.empujar();
    await sync.encolar([fila]);
    await sync.empujar();
    expect(guardado.controles.size).toBe(1);
  });

  it("sube en lotes sin perder nada", async () => {
    const { api, guardado } = servidorFalso();
    const sync = new Sincronizador(db, api, () => reloj, 2);
    const repo = new Repositorio(db, sync);
    for (let i = 1; i <= 5; i++) await repo.guardarControl(unControl({ id: `ct-${i}`, numero: i }));
    let r = await sync.empujar();
    expect(r.enviados).toBe(2);
    expect(r.pendientes).toBe(3);
    while (r.pendientes > 0) r = await sync.empujar();
    expect(guardado.controles.size).toBe(5);
  });

  it("si el servidor rechaza por identidad, bloquea y no reintenta (es un defecto, no la red)", async () => {
    const { api, estado } = servidorFalso();
    estado.falla = "PAYLOAD_CON_IDENTIDAD";
    estado.llaves = ["nombre"];
    const sync = new Sincronizador(db, api, () => reloj);
    await new Repositorio(db, sync).guardarControl(unControl());
    const r = await sync.empujar();
    expect(r.bloqueadas).toBe(1);
    expect(r.pendientes).toBe(0);
    expect((await sync.bloqueadas())[0]?.ultimoError).toContain("nombre");
  });
});

describe("episodios por versión (la hoja es append-only)", () => {
  it("guardar un episodio dos veces genera dos versiones con ids distintos", () => {
    const e = unEpisodio();
    const a = filaDeEpisodio(e, 1, new Date(2026, 10, 4, 9));
    const b = filaDeEpisodio(e, 2, new Date(2026, 10, 4, 10));
    expect(a.registroId).not.toBe(b.registroId);
    expect(a.payload["episodioId"]).toBe("ep-1");
  });

  it("al leer, gana la versión más reciente", async () => {
    const db = nuevaDb();
    const { api } = servidorFalso();
    const sync = new Sincronizador(db, api, () => 1);
    const repo = new Repositorio(db, sync, () => new Date(2026, 10, 4, 9));
    await repo.guardarEpisodio(unEpisodio({ viaAereaActual: "TET" }));
    await sync.empujar();

    const db2 = nuevaDb();
    const sync2 = new Sincronizador(db2, api, () => 1);
    const repo2 = new Repositorio(db2, sync2, () => new Date(2026, 10, 4, 10));
    await sync2.traer({ todo: true });
    await repo2.guardarEpisodio({ ...(await db2.episodios.get("ep-1"))!, viaAereaActual: "NATURAL" });
    await sync2.empujar();

    const db3 = nuevaDb();
    await new Sincronizador(db3, api, () => 1).traer({ todo: true });
    expect((await db3.episodios.get("ep-1"))?.viaAereaActual).toBe("NATURAL");
  });

  it("un cambio local todavía sin subir no se pisa al leer una versión más vieja", async () => {
    const db = nuevaDb();
    const { api } = servidorFalso();
    const sync = new Sincronizador(db, api, () => 1);
    const repoViejo = new Repositorio(db, sync, () => new Date(2026, 10, 4, 9));
    await repoViejo.guardarEpisodio(unEpisodio({ transcritoAlma: false }));
    await sync.empujar();

    // Cambio local posterior que aún no se sube.
    const repoNuevo = new Repositorio(db, sync, () => new Date(2026, 10, 4, 11));
    await repoNuevo.marcarTranscrito("ep-1", "11:00");
    await sync.traer({ todo: true });
    expect((await db.episodios.get("ep-1"))?.transcritoAlma).toBe(true);
  });
});

describe("leer lo que subieron los demás", () => {
  it("fusiona controles, eventos y APK sin duplicar y descarta filas corruptas", async () => {
    const { api, guardado } = servidorFalso();
    const dbA = nuevaDb();
    const syncA = new Sincronizador(dbA, api, () => 1);
    const repoA = new Repositorio(dbA, syncA);
    await repoA.guardarControl(unControl());
    await syncA.empujar();
    // Una celda editada a mano que no tiene la forma esperada.
    guardado.controles.set("basura", { id: "basura", episodioId: "ep-1", registradoEn: "x" });

    const dbB = nuevaDb();
    const syncB = new Sincronizador(dbB, api, () => 1);
    const r1 = await syncB.traer({ todo: true });
    expect(r1.controles).toBe(1);
    const r2 = await syncB.traer({ todo: true });
    expect(r2.controles).toBe(0);
    expect(await dbB.controles.count()).toBe(1);
  });
});

describe("limpiezas hechas en el servidor", () => {
  it("si se limpio todo (cambia la epoca) el equipo vacia su copia y baja de nuevo", async () => {
    const { api, guardado, estado } = servidorFalso();
    const db = nuevaDb();
    const sync = new Sincronizador(db, api, () => 1);
    const repo = new Repositorio(db, sync);
    await repo.guardarEpisodio(unEpisodio());
    await repo.guardarControl(unControl());
    await sync.empujar();
    estado.epoca = "2026-11-01T00:00:00.000Z";
    await sync.traer();
    expect(await db.controles.count()).toBe(1);
    // Se limpio la planilla: el servidor ya no tiene nada y la epoca cambia.
    for (const m of Object.values(guardado)) m.clear();
    estado.epoca = "2026-11-12T10:00:00.000Z";
    await sync.traer();
    expect(await db.episodios.count()).toBe(0);
    expect(await db.controles.count()).toBe(0);
    await sync.traer();
    expect(await db.controles.count()).toBe(0);
  });

  it("un equipo que ya tenia datos y llega despues de la limpieza tambien se vacia", async () => {
    const { api, estado } = servidorFalso();
    const db = nuevaDb();
    const sync = new Sincronizador(db, api, () => 1);
    await new Repositorio(db, sync).guardarEpisodio(unEpisodio());
    await db.cola.clear();
    estado.epoca = "2026-11-12T10:00:00.000Z";
    await sync.traer();
    expect(await db.episodios.count()).toBe(0);
  });

  it("un paciente borrado en el servidor se quita de la copia local y de la cola", async () => {
    const { api, estado } = servidorFalso();
    const db = nuevaDb();
    const sync = new Sincronizador(db, api, () => 1);
    const repo = new Repositorio(db, sync);
    await repo.guardarEpisodio(unEpisodio({ id: "ep-1" }));
    await repo.guardarEpisodio(unEpisodio({ id: "ep-2", cama: "UCI-02" }));
    await repo.guardarControl(unControl({ id: "c1", episodioId: "ep-1" }));
    await repo.guardarControl(unControl({ id: "c2", episodioId: "ep-2" }));
    estado.borrados = ["ep-1"];
    await sync.traer();
    expect((await db.episodios.toArray()).map((e) => e.id)).toEqual(["ep-2"]);
    expect((await db.controles.toArray()).map((c) => c.id)).toEqual(["c2"]);
    expect((await db.cola.toArray()).every((e) => e.payload["episodioId"] !== "ep-1")).toBe(true);
  });
});

describe("eventos que mutan la vía aérea", () => {
  it("una autoextubación deja el episodio con vía natural y sube evento y episodio", async () => {
    const db = nuevaDb();
    const { api } = servidorFalso();
    const sync = new Sincronizador(db, api, () => 1);
    const repo = new Repositorio(db, sync);
    await repo.guardarEpisodio(unEpisodio());
    await sync.empujar();

    const ev = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({ tipo: "AUTOEXTUBACION", dispositivo: "CNAF" });
    const ep = await repo.registrarEvento(ev);
    expect(ep?.viaAereaActual).toBe("NATURAL");
    expect(ep?.calibreVia).toBeNull();
    expect(await sync.pendientes()).toBe(2);
  });

  it("un evento que no toca la vía aérea sube solo el evento", async () => {
    const db = nuevaDb();
    const { api } = servidorFalso();
    const sync = new Sincronizador(db, api, () => 1);
    const repo = new Repositorio(db, sync);
    await repo.guardarEpisodio(unEpisodio());
    await sync.empujar();
    await repo.registrarEvento(unEvento<Extract<EventoClinico, { tipo: "CAMBIO_HMEF" }>>({ tipo: "CAMBIO_HMEF" }));
    expect(await sync.pendientes()).toBe(1);
  });
});
