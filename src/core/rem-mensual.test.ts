import { describe, expect, it } from "vitest";
import { unControl, unEpisodio, unEvento } from "./fixtures";
import { consolidarRemMensual } from "./rem-mensual";
import type { Control, EventoClinico, Modalidad } from "./tipos";

const NOV = "2026-11";
const ep1 = unEpisodio({ id: "a", sexo: "M", rangoEdad: "60–64", categoriaRem: "Enfermedades respiratorias", ingresadoEn: "2026-11-03T15:00:00.000Z" });
const ep2 = unEpisodio({ id: "b", sexo: "F", rangoEdad: "80 y más", categoriaRem: null, ingresadoEn: "2026-11-05T15:00:00.000Z", activo: false, egreso: { motivo: "FALLECIMIENTO", en: "2026-11-09T15:00:00.000Z" } });
const ep3 = unEpisodio({ id: "c", sexo: "M", rangoEdad: "40–44", categoriaRem: "Otros", ingresadoEn: "2026-10-20T15:00:00.000Z" });

const ctl = (episodioId: string, registradoEn: string, motora: boolean): Control => {
  const base = unControl();
  return { ...base, id: `${episodioId}-${registradoEn}`, episodioId, registradoEn, terapiaFisica: { ...base.terapiaFisica, estado: motora ? "REALIZADA" : "NO" } };
};
const ep4 = unEpisodio({ id: "d", sexo: "F", rangoEdad: "70–74", categoriaRem: "Enfermedades respiratorias", ingresadoEn: "2026-10-28T15:00:00.000Z" });
const enModo = (c: Control, modalidad: Modalidad): Control => ({ ...c, ventilacion: { ...c.ventilacion, modalidad } });
const controles = new Map<string, Control[]>([
  // VNI desde octubre (no es conexion de noviembre), CNAF, de nuevo VNI (1), sigue en VNI, O2 y VNI otra vez (2).
  ["d", (["VNI_ST", "CNAF", "VNI_ST", "VNI_ST", "O2_NARICERA", "VNI_CPAP"] as Modalidad[]).map((m, i) =>
    enModo(ctl("d", i === 0 ? "2026-10-30T12:00:00.000Z" : `2026-11-0${i}T12:00:00.000Z`, false), m))],
  ["a", [ctl("a", "2026-11-04T12:00:00.000Z", true), ctl("a", "2026-11-04T20:00:00.000Z", false)]],
  ["c", [ctl("c", "2026-10-25T12:00:00.000Z", true), ctl("c", "2026-11-02T12:00:00.000Z", true)]]
]);
const evalMrc = (episodioId: string, registradoEn: string): EventoClinico =>
  unEvento({ tipo: "EVALUACION_PUNTUAL", episodioId, registradoEn, escala: "MRC", valores: {}, total: 40 } as never);
const eventos = new Map<string, EventoClinico[]>([
  ["a", [evalMrc("a", "2026-11-04T12:00:00.000Z"), evalMrc("a", "2026-11-08T12:00:00.000Z"), unEvento({ tipo: "CAMBIO_CANULA", episodioId: "a", registradoEn: "2026-11-06T12:00:00.000Z", calibre: "8", motivo: "PROGRAMADO" } as never)]]
]);

describe("REM 28 del mes", () => {
  const r = consolidarRemMensual(NOV, [ep1, ep2, ep3, ep4], controles, eventos);

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

  it("B.6: ejercicios terapeuticos = sesiones motoras; respiratoria = controles del mes", () => {
    expect(r.ejerciciosTerapeuticos).toBe(2);
    expect(r.terapiaRespiratoria).toBe(8);
  });

  it("cada conexion a VMNI cuenta; seguir en VNI o venir conectado del mes anterior no", () => {
    expect(r.conexionesVmni).toBe(2);
  });

  it("BS cuenta personas: atendidas, motora, permeabilizacion y asistencia IOT/VMNI/canula", () => {
    expect(r.bs.evaluacionIntegral).toBe(2);
    expect(r.bs.atencionIntegralUpc).toBe(3);
    expect(r.bs.reeducacionMotriz).toBe(2);
    expect(r.bs.permeabilizacionViaAerea).toBe(3);
    expect(r.bs.asistenciaIotCanula).toBe(2);
  });

});
