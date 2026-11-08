import { describe, expect, it } from "vitest";
import { PIN_DEMO, crearApiHttp, crearApiLocal } from "./api";

type Llamada = { url: string; init?: RequestInit };

function fetchFalso(respuesta: unknown, llamadas: Llamada[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), ...(init ? { init } : {}) });
    return { json: async () => respuesta } as Response;
  }) as unknown as typeof fetch;
}

const cfg = { url: "https://script.example/exec", appToken: "APP", stationToken: "EST" };

describe("cliente HTTP de Apps Script", () => {
  it("los POST van como text/plain para evitar el preflight CORS que Apps Script no responde", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp(cfg, fetchFalso({ ok: true, servidorEn: "x" }, llamadas));
    await api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [] });
    const h = llamadas[0]?.init?.headers as Record<string, string>;
    expect(h["Content-Type"]).toContain("text/plain");
    expect(llamadas[0]?.init?.method).toBe("POST");
  });

  it("el canal clínico usa el token de app, nunca el de estación", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp(cfg, fetchFalso({ ok: true, servidorEn: "x" }, llamadas));
    await api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [] });
    const cuerpo = JSON.parse(String(llamadas[0]?.init?.body)) as Record<string, unknown>;
    expect(cuerpo["token"]).toBe("APP");
    expect(cuerpo["accion"]).toBe("sincronizar");
  });

  it("las referencias (identidad cifrada) solo se piden con el token de estación y con nombre neutro", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp(cfg, fetchFalso({ ok: true, referencias: [{ episodioId: "ep-1", registradoEn: "x", dato: "v1.aaa.bbb" }] }, llamadas));
    const r = await api.leerReferencias();
    expect(llamadas[0]?.url).toContain("recurso=referencia");
    expect(llamadas[0]?.url).not.toMatch(/identidad|nombre|rut/);
    expect(llamadas[0]?.url).toContain("token=EST");
    expect(r.ok && r.referencias[0]?.dato).toBe("v1.aaa.bbb");
  });

  it("al guardar referencias solo viajan episodio, fecha y el bloque cifrado", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp(cfg, fetchFalso({ ok: true }, llamadas));
    await api.guardarReferencias([{ episodioId: "ep-1", registradoEn: "x", dato: "v1.a.b" }]);
    const cuerpo = JSON.parse(String(llamadas[0]?.init?.body)) as Record<string, unknown>;
    expect(cuerpo["accion"]).toBe("guardarReferencia");
    expect(JSON.stringify(cuerpo)).not.toMatch(/nombre|rut|identidad/i);
  });

  it("un celular sin token de estación no puede ni intentar leer identidad", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp({ ...cfg, stationToken: null }, fetchFalso({ ok: true }, llamadas));
    expect(await api.leerReferencias()).toEqual({ ok: false, error: "SIN_TOKEN_ESTACION" });
    expect(await api.guardarReferencias([])).toEqual({ ok: false, error: "SIN_TOKEN_ESTACION" });
    expect(llamadas).toHaveLength(0);
  });

  it("una falla de red se convierte en SIN_CONEXION en vez de lanzar", async () => {
    const api = crearApiHttp(cfg, (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(await api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [] })).toEqual({ ok: false, error: "SIN_CONEXION" });
  });

  it("traduce el rechazo por identidad con las llaves infractoras", async () => {
    const api = crearApiHttp(cfg, fetchFalso({ ok: false, error: "PAYLOAD_CON_IDENTIDAD", llaves: ["nombre"] }));
    const r = await api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [] });
    expect(r).toEqual({ ok: false, error: "PAYLOAD_CON_IDENTIDAD", llaves: ["nombre"] });
  });

  it("la lectura incremental envía el cursor", async () => {
    const llamadas: Llamada[] = [];
    const api = crearApiHttp(cfg, fetchFalso({ ok: true, controles: [], servidorEn: "z" }, llamadas));
    await api.leer("2026-11-03T00:00:00.000Z");
    expect(llamadas[0]?.url).toContain("desde=2026-11-03");
  });
});

describe("API local (modo demostración)", () => {
  it("acepta el PIN de demostración para cualquier profesional de la dotación", async () => {
    const api = crearApiLocal();
    expect((await api.login("16.452.891-K", PIN_DEMO)).ok).toBe(true);
    expect((await api.login("16.452.891-K", "1234")).ok).toBe(false);
    expect((await api.login("1-9", PIN_DEMO)).ok).toBe(false);
  });
});
