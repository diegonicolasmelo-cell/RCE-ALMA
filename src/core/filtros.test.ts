import { describe, expect, it } from "vitest";
import { fechaEtiquetaAhora, filtrosPorCambiar, reglaFiltro, vigenciaFiltros } from "./filtros";
import type { EventoClinico } from "./tipos";

const base = (d: Date, id: string) => ({ id, episodioId: "ep", hora: "10:00", registradoEn: d.toISOString(), rutAutor: "x", comentario: "" });
const fil = (d: Date, elemento: "TRACHCARE" | "HEPA"): EventoClinico => ({ ...base(d, "f" + d.getTime() + elemento), tipo: "CAMBIO_FILTRO", elemento });
const hme = (d: Date): EventoClinico => ({ ...base(d, "h" + d.getTime()), tipo: "CAMBIO_HMEF" });
const dia = (n: number, h = 10) => new Date(2026, 10, n, h);
const v = (evs: EventoClinico[], ahora: Date) => Object.fromEntries(vigenciaFiltros(evs, ahora).map((x) => [x.elemento, x]));

describe("vigencia de filtros y TrachCare", () => {
  it("sin registro no inventa fechas", () => {
    expect(v([], dia(4))["HME"]!.estado).toBe("SIN_REGISTRO");
  });

  it("TrachCare y HEPA duran 3 días; HME 2 días", () => {
    const evs = [fil(dia(4), "TRACHCARE"), fil(dia(4), "HEPA"), hme(dia(4))];
    const r = v(evs, dia(4, 15));
    expect(r["TRACHCARE"]).toMatchObject({ venceFecha: "2026-11-07", diasRestantes: 3, estado: "VIGENTE" });
    expect(r["HEPA"]!.venceFecha).toBe("2026-11-07");
    expect(r["HME"]).toMatchObject({ venceFecha: "2026-11-06", diasRestantes: 2 });
  });

  it("el día del vencimiento avisa 'vence hoy' y después queda vencido", () => {
    const evs = [hme(dia(4))];
    expect(v(evs, dia(6))["HME"]!.estado).toBe("VENCE_HOY");
    expect(v(evs, dia(7))["HME"]).toMatchObject({ estado: "VENCIDO", diasRestantes: -1 });
  });

  it("un cambio nuevo reinicia el plazo (vale el último)", () => {
    const evs = [hme(dia(4)), hme(dia(6))];
    expect(v(evs, dia(7))["HME"]).toMatchObject({ estado: "VIGENTE", venceFecha: "2026-11-08" });
  });

  it("lista lo que hay que cambiar hoy", () => {
    const evs = [fil(dia(1), "TRACHCARE"), hme(dia(6)), fil(dia(3), "HEPA")];
    expect(filtrosPorCambiar(evs, dia(6)).map((x) => x.elemento).sort()).toEqual(["HEPA", "TRACHCARE"]);
  });
});

describe("reglas de Diego (24-nov-2026): día 0, corte de etiqueta a las 20:00 y regla por equipo", () => {
  const vent = (modelo: string) => ({ tipo: "VENTILADOR" as const, modelo, numero: 1, enUso: true });
  const ctl = (modalidad: string) => ({ ventilacion: { modalidad } }) as never;
  const ep = (o: object = {}) => ({ viaAereaActual: "TET" as const, equipos: [vent("Savina")], ingresadoEn: dia(4, 10).toISOString(), ...o });
  const est = (evs: EventoClinico[], ahora: Date, e = ep(), c: unknown = ctl("ACVC")) =>
    Object.fromEntries(vigenciaFiltros(evs, ahora, { ep: e as never, ultimo: c as never }).map((x) => [x.elemento, x]));

  it("la etiqueta: desde las 20:00 va la fecha del día siguiente", () => {
    expect(fechaEtiquetaAhora(dia(24, 19))).toBe("2026-11-24");
    expect(fechaEtiquetaAhora(dia(24, 20))).toBe("2026-11-25");
    expect(fechaEtiquetaAhora(dia(25, 4))).toBe("2026-11-25");
  });

  it("día 0 al ingreso: sin ningún cambio registrado, igual vence (HME al día 2, TrachCare y HEPA al día 3)", () => {
    const r = est([], dia(6, 10));
    expect(r["HME"]).toMatchObject({ estado: "VENCE_HOY", cambiadoEn: "2026-11-04", desdeIngreso: true });
    expect(r["TRACHCARE"]!.estado).toBe("VIGENTE");
    expect(est([], dia(7, 10))["HEPA"]!.estado).toBe("VENCE_HOY");
  });

  it("una reintubación o una TQT nueva vuelve a día 0", () => {
    const tqt: EventoClinico = { ...base(dia(10, 9), "t1"), tipo: "TRAQUEOSTOMIA", calibre: "8" };
    expect(est([hme(dia(5)), tqt], dia(11, 10), ep({ viaAereaActual: "TQT" }))["HME"]).toMatchObject({ cambiadoEn: "2026-11-10", estado: "VIGENTE", desdeIngreso: true });
    expect(est([hme(dia(5))], dia(11, 10), ep({ viaAereaActual: "TQT" }))["HME"]!.cambiadoEn).toBe("2026-11-05");
    expect(est([tqt], dia(11, 10), ep({ viaAereaActual: "TQT" }))["HME"]!.cambiadoEn).toBe("2026-11-10");
  });

  it("HEPA es del ventilador: PB 840, PB 980 y AVEA uno por estadía; sin ventilador o desvinculado no hay", () => {
    expect(est([], dia(9), ep({ equipos: [vent("PB 840")] }))["HEPA"]!.estado).toBe("POR_ESTADIA");
    expect(est([], dia(9), ep({ equipos: [vent("PB 980")] }))["HEPA"]!.estado).toBe("POR_ESTADIA");
    expect(est([], dia(9), ep({ equipos: [vent("Avea")] }))["HEPA"]!.estado).toBe("POR_ESTADIA");
    expect(est([], dia(9), ep({ equipos: [] }))["HEPA"]!.estado).toBe("NO_APLICA");
    expect(est([], dia(9), ep({ viaAereaActual: "TQT" }), ctl("TUBO_T"))["HEPA"]!.estado).toBe("NO_APLICA");
    expect(reglaFiltro("HEPA", { ep: ep({ equipos: [vent("Servo U")] }) as never, ultimo: ctl("CPAP_PS") })).toBe("APLICA");
  });

  it("HME es humidificación pasiva: no va con MR850 ni con CTAF (Airvo por TQT); TrachCare sigue", () => {
    const mr = { tipo: "HUMIDIFICADOR" as const, modelo: "Humidificador MR850", numero: 1, enUso: true };
    expect(est([], dia(9), ep({ equipos: [vent("Savina"), mr] }))["HME"]!.estado).toBe("NO_APLICA");
    const r = est([], dia(9), ep({ viaAereaActual: "TQT", equipos: [] }), ctl("CNAF_TQT"));
    expect([r["HME"]!.estado, r["HEPA"]!.estado, r["TRACHCARE"]!.estado === "NO_APLICA"]).toEqual(["NO_APLICA", "NO_APLICA", false]);
    expect(est([], dia(9), ep({ viaAereaActual: "TQT" }), ctl("TUBO_T"))["HME"]!.estado).not.toBe("NO_APLICA");
  });

  it("con vía aérea natural no corresponde nada, y lo que no aplica no avisa", () => {
    expect(Object.values(est([], dia(20), ep({ viaAereaActual: "NATURAL" }))).every((x) => x.estado === "NO_APLICA")).toBe(true);
    expect(filtrosPorCambiar([], dia(20), { ep: ep({ equipos: [vent("PB 840")] }) as never, ultimo: ctl("ACVC") }).map((f) => f.elemento)).toEqual(["TRACHCARE", "HME"]);
  });
});

describe("una etiqueta anotada después del ingreso manda aunque diga una fecha anterior", () => {
  it("la ronda corrige a una fecha vieja: queda vencido", () => {
    const e = { viaAereaActual: "TET" as const, equipos: [], ingresadoEn: dia(10, 9).toISOString() };
    const corr: EventoClinico = { ...base(dia(10, 11), "c1"), tipo: "CAMBIO_HMEF", fechaEtiqueta: "2026-11-06" };
    const r = vigenciaFiltros([corr], dia(10, 12), { ep: e as never, ultimo: null });
    expect(r.find((x) => x.elemento === "HME")).toMatchObject({ cambiadoEn: "2026-11-06", estado: "VENCIDO" });
  });
});

describe("el ejemplo de Diego (24-nov-2026): la noche del 24, con etiqueta 25", () => {
  it("vence el HME con fecha 23 y el TrachCare y el HEPA con fecha 22", () => {
    const etq = (tipo: "HME" | "TRACHCARE" | "HEPA", fecha: string): EventoClinico =>
      tipo === "HME" ? { ...base(dia(20), "h" + fecha), tipo: "CAMBIO_HMEF", fechaEtiqueta: fecha } : { ...base(dia(20), tipo + fecha), tipo: "CAMBIO_FILTRO", elemento: tipo, fechaEtiqueta: fecha };
    const noche = new Date(2026, 10, 24, 22, 0);
    const estado = (e: EventoClinico) => vigenciaFiltros([e], noche).find((x) => x.estado !== "SIN_REGISTRO")!.estado;
    expect(fechaEtiquetaAhora(noche)).toBe("2026-11-25");
    expect(estado(etq("HME", "2026-11-23"))).toBe("VENCE_HOY");
    expect(estado(etq("HME", "2026-11-24"))).toBe("VIGENTE");
    expect(estado(etq("TRACHCARE", "2026-11-22"))).toBe("VENCE_HOY");
    expect(estado(etq("HEPA", "2026-11-22"))).toBe("VENCE_HOY");
    expect(estado(etq("HEPA", "2026-11-23"))).toBe("VIGENTE");
  });
});
