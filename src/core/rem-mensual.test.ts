import { describe, expect, it } from "vitest";
import { unControl, unEpisodio, unEvento } from "./fixtures";
import { consolidarRemMensual, remMensualCsv } from "./rem-mensual";
import type { Control, EventoClinico } from "./tipos";

const NOV = "2026-11";
const ep1 = unEpisodio({ id: "a", sexo: "M", rangoEdad: "60–64", categoriaRem: "Enfermedades respiratorias", ingresadoEn: "2026-11-03T15:00:00.000Z" });
const ep2 = unEpisodio({ id: "b", sexo: "F", rangoEdad: "80 y más", categoriaRem: null, ingresadoEn: "2026-11-05T15:00:00.000Z", activo: false, egreso: { motivo: "FALLECIMIENTO", en: "2026-11-09T15:00:00.000Z" } });
const ep3 = unEpisodio({ id: "c", sexo: "M", rangoEdad: "40–44", categoriaRem: "Otros", ingresadoEn: "2026-10-20T15:00:00.000Z" });

const ctl = (episodioId: string, registradoEn: string, motora: boolean): Control => {
  const base = unControl();
  return { ...base, id: `${episodioId}-${registradoEn}`, episodioId, registradoEn, terapiaFisica: { ...base.terapiaFisica, estado: motora ? "REALIZADA" : "NO" } };
};
const controles = new Map<string, Control[]>([
  ["a", [ctl("a", "2026-11-04T12:00:00.000Z", true), ctl("a", "2026-11-04T20:00:00.000Z", false)]],
  ["c", [ctl("c", "2026-10-25T12:00:00.000Z", true), ctl("c", "2026-11-02T12:00:00.000Z", true)]]
]);
const evalMrc = (episodioId: string, registradoEn: string): EventoClinico =>
  unEvento({ tipo: "EVALUACION_PUNTUAL", episodioId, registradoEn, escala: "MRC", valores: {}, total: 40 } as never);
const eventos = new Map<string, EventoClinico[]>([
  ["a", [evalMrc("a", "2026-11-04T12:00:00.000Z"), evalMrc("a", "2026-11-08T12:00:00.000Z"), unEvento({ tipo: "CAMBIO_CANULA", episodioId: "a", registradoEn: "2026-11-06T12:00:00.000Z", calibre: "8", motivo: "PROGRAMADO" } as never)]]
]);

describe("REM 28 del mes", () => {
  const r = consolidarRemMensual(NOV, [ep1, ep2, ep3], controles, eventos);

  it("B.1 cuenta ingresos del mes por sexo, rango y categoria; avisa la categoria faltante", () => {
    expect(r.ingresos.total).toBe(2);
    expect(r.ingresos.hombres).toBe(1);
    expect(r.ingresos.porRango["60–64"].hombres).toBe(1);
    expect(r.ingresos.porRango["80 y más"].mujeres).toBe(1);
    expect(r.ingresosPorCategoria["Enfermedades respiratorias"].total).toBe(1);
    expect(r.ingresosSinCategoria).toBe(1);
  });

  it("B.1 cuenta egresos por motivo en el mes del egreso", () => {
    expect(r.egresos.total).toBe(1);
    expect(r.egresosPorMotivo.FALLECIMIENTO.mujeres).toBe(1);
  });

  it("B.2 una evaluacion inicial por ingreso; B.3 solo reevaluaciones; B.4 solo sesiones motoras del mes", () => {
    expect(r.evaluacionInicial.total).toBe(2);
    expect(r.evaluacionIntermedia.total).toBe(1);
    expect(r.sesionesMotoras.total).toBe(2);
    expect(r.sesionesMotoras.porRango["40–44"]).toBe(1);
  });

  it("B.6 y BS: respiratoria = controles del mes; BS cuenta personas", () => {
    expect(r.terapiaRespiratoria).toBe(3);
    expect(r.bs.evaluacionIntegral).toBe(2);
    expect(r.bs.atencionIntegralUpc).toBe(2);
    expect(r.bs.reeducacionMotriz).toBe(2);
    expect(r.bs.asistenciaIotCanula).toBe(1);
  });

  it("el CSV trae las 17 columnas de rango por sexo y los codigos BS", () => {
    const csv = remMensualCsv(r);
    expect(csv).toContain("Total ingresos (Nº de personas);2;1;1;");
    expect(csv.split("\r\n")[3]!.split(";")).toHaveLength(4 + 17 * 2);
    expect(csv).toContain("0601171 Asistencia en IOT, VMNI, cambio de cánula de TQT;1");
  });
});
