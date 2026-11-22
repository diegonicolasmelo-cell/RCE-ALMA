import { describe, expect, it } from "vitest";
import { archivados, calcularIndicadores, diaLocal, minutosValvula, periodoDe, puedeDeshacerAlta, resumenPorCama } from "./estadistica";
import type { Periodo } from "./estadistica";
import { unControl, unEpisodio, unEvento, unaVentilacion } from "./fixtures";
import type { Control, EventoClinico } from "./tipos";

// Fechas relativas a un "ahora" fijo dentro de la prueba (no al reloj real).
const AHORA = new Date(2026, 10, 15, 14, 0, 0);
const hace = (h: number): string => new Date(AHORA.getTime() - h * 3600_000).toISOString();
const MES: Periodo = { desde: new Date(2026, 10, 1), hasta: new Date(2026, 11, 1), etiqueta: "nov" };
const ev = (o: Record<string, unknown>): EventoClinico => unEvento(o as never);
const describir = (e: EventoClinico): string => e.tipo;

describe("periodos", () => {
  it("el turno del día va de 8 a 20 y el mes, del 1 al 1", () => {
    const t = periodoDe("TURNO", AHORA);
    expect([t.desde.getHours(), t.hasta.getHours()]).toEqual([8, 20]);
    const m = periodoDe("MES", AHORA);
    expect([diaLocal(m.desde), diaLocal(m.hasta)]).toEqual(["2026-11-01", "2026-12-01"]);
  });
});

describe("indicadores con las definiciones del RCE", () => {
  const ep = unEpisodio({ id: "ep-1", cama: "UCI-01", ingresadoEn: new Date(2026, 10, 10, 9).toISOString(), activo: true });
  const vmi = (h: number): Control => unControl({ id: `c${h}`, episodioId: "ep-1", registradoEn: hace(h), viaAerea: "TET", ventilacion: unaVentilacion({ modalidad: "ACVC" }) });
  const controles = [vmi(100), vmi(80), vmi(50), unControl({ id: "c-cnaf", episodioId: "ep-1", registradoEn: hace(10), viaAerea: "NATURAL", ventilacion: unaVentilacion({ modalidad: "CNAF" }) })];

  it("fracaso precoz: reintubación a las 10 h de la extubación programada", () => {
    const eventos = [
      ev({ episodioId: "ep-1", tipo: "INTUBACION", via: "TET", calibre: "8", fijacionCm: "22", registradoEn: hace(120) }),
      ev({ episodioId: "ep-1", tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", registradoEn: hace(40) }),
      ev({ episodioId: "ep-1", tipo: "REINTUBACION", via: "TET", calibre: "8", fijacionCm: "22", registradoEn: hace(30) })
    ];
    const i = calcularIndicadores({ episodios: [ep], controles: new Map([["ep-1", controles]]), eventos: new Map([["ep-1", eventos]]) }, MES, AHORA);
    expect(i.extubaciones).toBe(1);
    expect([i.fracaso, i.fracasoPrecoz, i.fracasoTardio, i.fracasoPct]).toEqual([1, 1, 0, 100]);
    expect([i.fracaso48, i.fracaso48Pct]).toEqual([1, 100]);
    expect(i.diasVm).toBe(3);
    expect(i.ventilados).toBe(1);
  });

  it("reintubación a las 30 h: no es fracaso oficial (24 h) pero sí el interno a 48 h (Diego, 22-nov-2026)", () => {
    const eventos = [
      ev({ episodioId: "ep-1", tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", registradoEn: hace(60) }),
      ev({ episodioId: "ep-1", tipo: "REINTUBACION", via: "TET", calibre: "8", fijacionCm: "22", registradoEn: hace(30) })
    ];
    const i = calcularIndicadores({ episodios: [ep], controles: new Map([["ep-1", controles]]), eventos: new Map([["ep-1", eventos]]) }, MES, AHORA);
    expect([i.fracaso, i.fracasoPct]).toEqual([0, 0]);
    expect([i.fracaso48, i.fracaso48Pct]).toEqual([1, 100]);
  });

  it("una reintubación a las 49 h no es fracaso; fuera de protocolo y su motivo", () => {
    const eventos = [
      ev({ episodioId: "ep-1", tipo: "EXTUBACION_PROGRAMADA", dispositivo: "CNAF", sinPve: "MENOS_24H_VM", registradoEn: hace(100) }),
      ev({ episodioId: "ep-1", tipo: "REINTUBACION", via: "TET", calibre: "8", fijacionCm: "22", registradoEn: hace(51) })
    ];
    const i = calcularIndicadores({ episodios: [ep], controles: new Map([["ep-1", controles]]), eventos: new Map([["ep-1", eventos]]) }, MES, AHORA);
    expect(i.fracaso).toBe(0);
    expect([i.fueraProtocolo, i.fueraPct]).toEqual([1, 100]);
    expect(i.motivosFuera[0]!.total).toBe(1);
  });

  it("autoextubaciones por 100 días-VM, PVE por 100 días-paciente, desvinculación con reconexión y válvula", () => {
    const eventos = [
      ev({ episodioId: "ep-1", tipo: "AUTOEXTUBACION", dispositivo: "CNAF", registradoEn: hace(60) }),
      ev({ episodioId: "ep-1", tipo: "INICIO_PVE", duracionMin: 30, registradoEn: hace(20) }),
      ev({ episodioId: "ep-1", tipo: "DESVINCULACION", desde: "ACVC", hasta: "TUBO_T", registradoEn: hace(9) }),
      ev({ episodioId: "ep-1", tipo: "RECONEXION", desde: "TUBO_T", hasta: "ACVC", registradoEn: hace(3) })
    ];
    const valvula = unControl({ id: "cv", episodioId: "ep-1", registradoEn: hace(5), viaAerea: "TQT", ventilacion: unaVentilacion({ modalidad: "VALVULA_FONACION" }) });
    const i = calcularIndicadores({ episodios: [ep], controles: new Map([["ep-1", [...controles, valvula]]]), eventos: new Map([["ep-1", eventos]]) }, MES, AHORA);
    expect(i.autoextPor100Vm).toBe(33.3);
    expect(i.diasPaciente).toBe(6);
    expect(i.pvePor100PacDia).toBe(16.67);
    expect([i.desvinculaciones, i.desvincReconexiones, i.desvincHoras]).toEqual([1, 1, 6]);
    expect(i.turnosValvula).toBe(1);
  });

  it("egresos y mortalidad sin ajuste", () => {
    const fallecido = unEpisodio({ id: "ep-2", cama: "UCI-02", activo: false, ingresadoEn: hace(200), egreso: { motivo: "FALLECIMIENTO", en: hace(5) } });
    const alta = unEpisodio({ id: "ep-3", cama: "UCI-03", activo: false, ingresadoEn: hace(200), egreso: { motivo: "ALTA", en: hace(6) } });
    const i = calcularIndicadores({ episodios: [fallecido, alta], controles: new Map(), eventos: new Map() }, MES, AHORA);
    expect([i.egresos, i.fallecidos, i.mortalidadPct]).toEqual([2, 1, 50]);
  });
});

describe("estadística por cama", () => {
  it("KTR = controles, KTM con IMT, motivo cuando no hubo KTM, PVE como evento y filtro por kinesiólogo", () => {
    const ep1 = unEpisodio({ id: "ep-1", cama: "UCI-01" });
    const ep2 = unEpisodio({ id: "ep-2", cama: "UCI-02" });
    const conImt = unControl({ id: "a", episodioId: "ep-1", registradoEn: hace(2), rutAutor: "x@demo", terapiaFisica: { estado: "REALIZADA", actividades: ["IMT (entrenamiento muscular inspiratorio)"], ims: 2, motivoContraindicacion: null } });
    const sinKtm = unControl({ id: "b", episodioId: "ep-2", registradoEn: hace(3), rutAutor: "y@demo", terapiaFisica: { estado: "CONTRAINDICADA", actividades: [], ims: null, motivoContraindicacion: "Inestabilidad hemodinámica" } });
    const eventos = new Map([["ep-1", [ev({ episodioId: "ep-1", tipo: "FIN_PVE", exitosa: true, registradoEn: hace(1), rutAutor: "x@demo" })]]]);
    const d = { episodios: [ep2, ep1], controles: new Map([["ep-1", [conImt]], ["ep-2", [sinKtm]]]), eventos };
    const r = resumenPorCama(d, periodoDe("TURNO", AHORA), describir);
    expect(r.filas.map((f) => f.cama)).toEqual(["UCI-01", "UCI-02"]);
    expect([r.filas[0]!.ktr, r.filas[0]!.ktm, r.filas[0]!.imt]).toEqual([1, 1, 1]);
    expect(r.filas[0]!.eventos.map((e) => e.texto)).toEqual(["PVE tolerada"]);
    expect(r.filas[1]!.ktmMotivo).toBe("Inestabilidad hemodinámica");
    expect(r.motivosSinKtm).toEqual([{ motivo: "Inestabilidad hemodinámica", n: 1 }]);
    expect(resumenPorCama(d, periodoDe("TURNO", AHORA), describir, "x@demo").filas.map((f) => f.cama)).toEqual(["UCI-01"]);
  });
});

describe("archivados y deshacer alta", () => {
  it("lista los egresados con estadía y días VM; deshacer solo en 24 h y con la cama libre", () => {
    const egr = unEpisodio({ id: "ep-9", cama: "UCI-09", activo: false, ingresadoEn: new Date(2026, 10, 10, 9).toISOString(), egreso: { motivo: "ALTA", en: hace(3) } });
    const a = archivados({ episodios: [egr, unEpisodio({ id: "ep-1", activo: true })], controles: new Map(), eventos: new Map() });
    expect(a).toHaveLength(1);
    expect(a[0]!.diasEstadia).toBe(5);
    expect(puedeDeshacerAlta(egr, [], AHORA)).toBe(true);
    expect(puedeDeshacerAlta(egr, [unEpisodio({ id: "otro", cama: "UCI-09", activo: true })], AHORA)).toBe(false);
    expect(puedeDeshacerAlta({ ...egr, egreso: { motivo: "ALTA", en: hace(30) } }, [], AHORA)).toBe(false);
  });
});

describe("kinesiterapia como evento, PTO, válvula, reingresos y destinos (16-nov-2026)", () => {
  const ep = unEpisodio({ id: "ep-1", cama: "UCI-01", ingresadoEn: new Date(2026, 10, 10, 9).toISOString(), activo: true });
  const ktm = (h: number, nivel: number, extra: Record<string, unknown> = {}): EventoClinico => ev({ episodioId: "ep-1", tipo: "TERAPIA_FISICA", realizada: true, nivel, ems: false, ims: null, motivo: null, registradoEn: hace(h), ...extra });

  it("KTM con nivel, IMT y educación como eventos; el PTO es la primera bipedestación del episodio", () => {
    const eventos = [
      ktm(50, 3),
      ktm(3, 4, { ems: true, ims: 4 }),
      ktm(2, 5),
      ev({ episodioId: "ep-1", tipo: "IMT", registradoEn: hace(2.5) }),
      ev({ episodioId: "ep-1", tipo: "EDUCACION", dirigidaA: "FAMILIA", registradoEn: hace(1) })
    ];
    const d = { episodios: [ep], controles: new Map([["ep-1", [unControl({ id: "c", episodioId: "ep-1", registradoEn: hace(4), terapiaFisica: { estado: "NO", actividades: [], ims: null, motivoContraindicacion: null } })]]]), eventos: new Map([["ep-1", eventos]]) };
    const r = resumenPorCama(d, periodoDe("TURNO", AHORA), describir);
    const f = r.filas[0]!;
    expect([f.ktm, f.imt, f.nivel, f.pto, f.ims]).toEqual([2, 1, 5, true, 4]);
    expect(f.eventos.map((e) => e.texto)).toEqual(["EDUCACION"]);
    expect([r.totales.pto, r.totales.educacion]).toEqual([1, 1]);
    // El turno siguiente ya no es PTO: la primera bipedestación fue antes.
    expect(resumenPorCama(d, { desde: new Date(AHORA.getTime() + 3600_000), hasta: new Date(AHORA.getTime() + 2 * 3600_000), etiqueta: "" }, describir).filas.length).toBe(0);
    const i = calcularIndicadores(d, MES, AHORA);
    expect([i.ktm, i.imt, i.educacion, i.pto]).toEqual([3, 1, 1, 1]);
  });

  it("KTM no realizada con motivo y PVE no realizada con su razón", () => {
    const eventos = [
      ev({ episodioId: "ep-1", tipo: "TERAPIA_FISICA", realizada: false, nivel: null, ems: false, ims: null, motivo: "PIC fuera de meta", registradoEn: hace(2) }),
      ev({ episodioId: "ep-1", tipo: "PVE_NO_REALIZADA", razon: "Secreciones abundantes", registradoEn: hace(1) })
    ];
    const r = resumenPorCama({ episodios: [ep], controles: new Map(), eventos: new Map([["ep-1", eventos]]) }, periodoDe("TURNO", AHORA), describir);
    expect(r.filas[0]!.ktmMotivo).toBe("PIC fuera de meta");
    expect(r.motivosSinKtm).toEqual([{ motivo: "PIC fuera de meta", n: 1 }]);
    expect(r.motivosSinPve).toEqual([{ motivo: "Secreciones abundantes", n: 1 }]);
  });

  it("los minutos de válvula van del control que la inicia al que cambia de modo", () => {
    const c = (h: number, modalidad: string, id: string): Control => unControl({ id, episodioId: "ep-1", registradoEn: hace(h), viaAerea: "TQT", ventilacion: unaVentilacion({ modalidad: modalidad as never }) });
    const cs = [c(10, "CPAP_PS", "a"), c(8, "VALVULA_FONACION", "b"), c(7, "VALVULA_FONACION", "b2"), c(6, "CNAF_TQT", "c"), c(2, "VALVULA_FONACION", "d")];
    // 8 h a 6 h = 120 min, y de 2 h atrás a ahora = 120 min.
    expect(minutosValvula(ep, cs, MES, AHORA)).toBe(240);
  });

  it("extubación accidental cuenta con las autoextubaciones; reingresos por huella y egresos por destino", () => {
    const vmi = unControl({ id: "v", episodioId: "ep-1", registradoEn: hace(30), viaAerea: "TET", ventilacion: unaVentilacion({ modalidad: "ACVC" }) });
    const eventos = [ev({ episodioId: "ep-1", tipo: "AUTOEXTUBACION", accidental: true, dispositivo: "CNAF", registradoEn: hace(20) })];
    const antes = unEpisodio({ id: "ep-0", cama: "UCI-05", activo: false, huellaPersona: "abc", ingresadoEn: new Date(2026, 9, 1).toISOString(), egreso: { motivo: "ALTA", en: new Date(2026, 9, 5).toISOString(), destino: "Medicina" } });
    const reing = { ...ep, huellaPersona: "abc" };
    const otro = unEpisodio({ id: "ep-2", cama: "UCI-02", activo: false, huellaPersona: "zzz", ingresadoEn: new Date(2026, 10, 2).toISOString(), egreso: { motivo: "FALLECIMIENTO", en: hace(5), destino: "Fallecimiento (anatomía patológica)" } });
    const i = calcularIndicadores({ episodios: [antes, reing, otro], controles: new Map([["ep-1", [vmi]]]), eventos: new Map([["ep-1", eventos]]) }, MES, AHORA);
    expect([i.autoextubaciones, i.accidentales]).toEqual([1, 1]);
    expect([i.reingresos, i.ingresosConHuella]).toEqual([1, 2]);
    expect(i.destinos).toEqual([{ destino: "Fallecimiento (anatomía patológica)", n: 1 }]);
  });
});
