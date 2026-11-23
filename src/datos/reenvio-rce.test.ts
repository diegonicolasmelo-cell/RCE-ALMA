import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Carga Codigo.gs con un Google de mentira: hojas en memoria, propiedades y UrlFetchApp. */
function servidorKaptus(props: Record<string, string>, rce: (cuerpo: Record<string, unknown>) => { code: number; body?: unknown }) {
  const hojas: Record<string, unknown[][]> = {};
  const hoja = (nombre: string) => ({
    getLastRow: () => hojas[nombre]!.length,
    appendRow: (f: unknown[]) => { hojas[nombre]!.push(f); },
    setFrozenRows: () => {},
    getRange: (fila: number, col: number, n: number, m: number) => ({
      getValues: () => hojas[nombre]!.slice(fila - 1, fila - 1 + n).map((f) => f.slice(col - 1, col - 1 + m)),
      setValues: (v: unknown[][]) => { v.forEach((f, i) => { hojas[nombre]![fila - 1 + i] = f; }); }
    }),
    deleteRows: (desde: number, cuantas: number) => { hojas[nombre]!.splice(desde - 1, cuantas); }
  });
  for (const n of ["episodios", "controles", "eventos", "apk", "auditoria"]) hojas[n] = [["id", "episodioId", "registradoEn", "json"]];
  const llamadas: Record<string, unknown>[] = [];
  const g = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n: string) => (hojas[n] ? hoja(n) : null),
      insertSheet: (n: string) => { hojas[n] = []; return hoja(n); }
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: (_url: string, o: { payload: string }) => {
      const cuerpo = JSON.parse(o.payload) as Record<string, unknown>;
      llamadas.push(cuerpo);
      const r = rce(cuerpo);
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body ?? {}) };
    } },
    Logger: { log: () => {} }, Utilities: {}, ContentService: {}, HtmlService: {}
  };
  const codigo = readFileSync("backend/apps-script/Codigo.gs", "utf8");
  const fn = new Function(...Object.keys(g), `${codigo}\nreturn { sincronizar, historiasDesdeRce };`) as (...a: unknown[]) => { sincronizar: (c: unknown) => Record<string, unknown>; historiasDesdeRce: (c: unknown) => Record<string, unknown> };
  return { ...fn(...Object.values(g)), hojas, llamadas };
}

const item = (id: string) => ({ id, tipo: "CONTROL", cama: 3, horaToma: "2026-11-22 09:10", autor: "kine@demo", datos: { KAP_FC: 90 } });
const lote = (ids: string[]) => ({ episodios: [], controles: [], eventos: [], apk: [], paraRce: ids.map(item) });

describe("RCE by Kaptus: el servidor de Kaptus reenvía al RCE al tiro", () => {
  it("sin RCE_URL ni RCE_TOKEN el enlace está apagado y no se llama a nadie", () => {
    const s = servidorKaptus({}, () => ({ code: 200 }));
    expect(s.sincronizar(lote(["a"])).rce).toEqual({ estado: "apagado" });
    expect(s.llamadas).toHaveLength(0);
  });

  it("con el enlace encendido manda los items con la llave del RCE, que no viaja nunca al teléfono", () => {
    const s = servidorKaptus({ RCE_URL: "https://rce/exec", RCE_TOKEN: "LLAVE" }, () => ({ code: 200, body: { ok: true } }));
    expect(s.sincronizar(lote(["a", "b"]))).toMatchObject({ ok: true, rce: { estado: "entregado", enviados: 2 } });
    expect(s.llamadas[0]).toMatchObject({ accion: "desdeKaptus", token: "LLAVE" });
    expect((s.llamadas[0]!["items"] as unknown[]).length).toBe(2);
  });

  it("si el RCE no contesta, el guardado igual sale bien y lo enviado espera; sale con la próxima sincronía", () => {
    let caido = true;
    const s = servidorKaptus({ RCE_URL: "https://rce/exec", RCE_TOKEN: "LLAVE" }, () => (caido ? { code: 500 } : { code: 200, body: { ok: true } }));
    expect(s.sincronizar(lote(["a"]))).toMatchObject({ ok: true, rce: { estado: "en_espera", pendientes: 1 } });
    expect(s.hojas["pendientes_rce"]).toHaveLength(2);
    caido = false;
    expect(s.sincronizar(lote(["b"]))).toMatchObject({ rce: { estado: "entregado", enviados: 2 } });
    expect(s.hojas["pendientes_rce"]).toHaveLength(1);
  });

  it("un item con nombre o RUT se rechaza entero, como el resto del lote", () => {
    const s = servidorKaptus({ RCE_URL: "https://rce/exec", RCE_TOKEN: "LLAVE" }, () => ({ code: 200, body: { ok: true } }));
    const malo = { ...lote([]), paraRce: [{ ...item("x"), datos: { nombre: "X" } }] };
    expect(s.sincronizar(malo)).toMatchObject({ ok: false, error: "PAYLOAD_CON_IDENTIDAD" });
    expect(s.llamadas).toHaveLength(0);
  });
});

describe("historias de la entrega: se piden al RCE y no se guardan", () => {
  it("el pendiente y el plan del RCE viajan aunque no haya historia escrita", () => {
    const s = servidorKaptus({ RCE_URL: "https://rce/exec", RCE_TOKEN: "LLAVE" }, () => ({ code: 200, body: { ok: true, historias: [
      { cama: 5, texto: "", firma: "", fecha: "", pendientes: ["Rx control 18:00"], plan: "Progresar PS" }
    ] } }));
    expect(s.historiasDesdeRce([5])).toEqual({ ok: true, historias: [{ cama: 5, texto: "", firma: "", fecha: "", pendientes: ["Rx control 18:00"], plan: "Progresar PS" }] });
  });
  it("sin enlace no se llama a nadie", () => {
    const s = servidorKaptus({}, () => ({ code: 200 }));
    expect(s.historiasDesdeRce([3])).toEqual({ ok: true, historias: [], estado: "apagado" });
    expect(s.llamadas).toHaveLength(0);
  });
  it("pide las camas al RCE, devuelve las historias y descarta un texto con RUT; no escribe ninguna hoja", () => {
    const s = servidorKaptus({ RCE_URL: "https://rce/exec", RCE_TOKEN: "LLAVE" }, () => ({ code: 200, body: { ok: true, historias: [
      { cama: 3, texto: "Paciente de 64 años, neumonía grave.", firma: "MCC", fecha: "2026-11-17" },
      { cama: 4, texto: "RUT 12.345.678-9 colado", firma: "DMV", fecha: "2026-11-18" }
    ] } }));
    const antes = JSON.stringify(s.hojas);
    const r = s.historiasDesdeRce([3, 4, "x", 99]);
    expect(s.llamadas[0]).toMatchObject({ accion: "historiasEntrega", token: "LLAVE", camas: [3, 4] });
    expect(r).toEqual({ ok: true, historias: [{ cama: 3, texto: "Paciente de 64 años, neumonía grave.", firma: "MCC", fecha: "2026-11-17", pendientes: [], plan: "" }] });
    expect(JSON.stringify(s.hojas)).toBe(antes);
  });
});
