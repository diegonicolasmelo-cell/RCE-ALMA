import { describe, expect, it, vi } from "vitest";
import { crearApiRemota } from "./api";
import { transporteAppsScript, ubicacionExterna } from "./gas";

/** Un google.script.run de mentira: responde lo que diga `responder`. */
function googleFalso(responder: (fn: "rcePost" | "rceGet", arg: unknown) => { ok?: unknown; falla?: unknown } | null) {
  const llamadas: { fn: string; arg: unknown }[] = [];
  const ejecutor = (ok: (r: unknown) => void, falla: (e: unknown) => void): Record<string, unknown> => ({
    withSuccessHandler: (f: (r: unknown) => void) => ejecutor(f, falla),
    withFailureHandler: (f: (e: unknown) => void) => ejecutor(ok, f),
    rcePost: (t: string) => {
      llamadas.push({ fn: "rcePost", arg: t });
      const r = responder("rcePost", t);
      if (r && "ok" in r) ok(r.ok);
      else if (r && "falla" in r) falla(r.falla);
    },
    rceGet: (q: unknown) => {
      llamadas.push({ fn: "rceGet", arg: q });
      const r = responder("rceGet", q);
      if (r && "ok" in r) ok(r.ok);
      else if (r && "falla" in r) falla(r.falla);
    }
  });
  const gs = {
    run: ejecutor(() => {}, () => {}),
    url: { getLocation: (cb: (l: { hash?: string; parameter?: Record<string, string> }) => void) => cb({ hash: "estacion?t=X", parameter: { demo: "1" } }) },
    history: { replace: vi.fn() }
  };
  return { gs: gs as never, llamadas };
}

describe("la app servida por Apps Script", () => {
  it("manda las peticiones por google.script.run con el token y entiende la respuesta en texto", async () => {
    const { gs, llamadas } = googleFalso(() => ({ ok: JSON.stringify({ ok: true, correo: "diego.melo@demo.upc" }) }));
    const api = crearApiRemota(transporteAppsScript(gs), { appToken: "APP", stationToken: null });
    expect(await api.login("diego.melo@demo.upc", "1234")).toEqual({ ok: true, correo: "diego.melo@demo.upc" });
    expect(JSON.parse(String(llamadas[0]?.arg))).toMatchObject({ token: "APP", accion: "login", correo: "diego.melo@demo.upc" });
  });

  it("si Google falla o no contesta, es 'sin conexión' y la cola reintenta", async () => {
    const falla = googleFalso(() => ({ falla: new Error("x") }));
    const api = crearApiRemota(transporteAppsScript(falla.gs), { appToken: "APP", stationToken: null });
    expect(await api.sincronizar({ episodios: [], controles: [], eventos: [], apk: [] })).toEqual({ ok: false, error: "SIN_CONEXION" });

    vi.useFakeTimers();
    const mudo = googleFalso(() => null);
    const p = transporteAppsScript(mudo.gs, 1000).get({ token: "APP" });
    vi.advanceTimersByTime(1001);
    expect(await p).toEqual({ ok: false, error: "SIN_CONEXION" });
    vi.useRealTimers();
  });

  it("una respuesta que no es JSON no tumba la app", async () => {
    const { gs } = googleFalso(() => ({ ok: "<html>error</html>" }));
    expect(await transporteAppsScript(gs).get({})).toEqual({ ok: false, error: "RESPUESTA_INVALIDA" });
  });

  it("las referencias (identidad cifrada) se piden con la llave de la estación, nunca con la de app", async () => {
    const { gs, llamadas } = googleFalso(() => ({ ok: JSON.stringify({ ok: true, referencias: [] }) }));
    const sin = crearApiRemota(transporteAppsScript(gs), { appToken: "APP", stationToken: null });
    expect(await sin.leerReferencias()).toEqual({ ok: false, error: "SIN_TOKEN_ESTACION" });
    expect(llamadas).toHaveLength(0);
    const con = crearApiRemota(transporteAppsScript(gs), { appToken: "APP", stationToken: "EST" });
    await con.leerReferencias();
    expect(llamadas[0]?.arg).toEqual({ recurso: "referencia", token: "EST" });
  });

  it("lee el fragmento y los parámetros de la barra de afuera del iframe", async () => {
    const { gs } = googleFalso(() => null);
    expect(await ubicacionExterna(gs)).toEqual({ hash: "estacion?t=X", parametros: { demo: "1" } });
    expect(await ubicacionExterna(null)).toEqual({ hash: "", parametros: {} });
  });
});

describe("dotación desde la hoja", () => {
  it("un Codigo.gs anterior (responde sin la lista) no deja la dotación vacía: avisa que falta actualizar el servidor", async () => {
    const { gs } = googleFalso(() => ({ ok: JSON.stringify({ ok: true, episodios: [], controles: [] }) }));
    const api = crearApiRemota(transporteAppsScript(gs), { appToken: "APP", stationToken: null });
    expect(await api.leerDotacion()).toEqual({ ok: false, error: "SERVIDOR_SIN_DOTACION" });
  });
  it("con el Codigo.gs nuevo llega la lista", async () => {
    const { gs, llamadas } = googleFalso(() => ({ ok: JSON.stringify({ ok: true, dotacion: [{ correo: "a@b.cl", nombre: "A" }] }) }));
    const api = crearApiRemota(transporteAppsScript(gs), { appToken: "APP", stationToken: null });
    expect(await api.leerDotacion()).toEqual({ ok: true, dotacion: [{ correo: "a@b.cl", nombre: "A" }] });
    expect(llamadas[0]?.arg).toMatchObject({ token: "APP", recurso: "dotacion" });
  });
});
