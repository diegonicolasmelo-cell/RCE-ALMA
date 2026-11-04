import { describe, expect, it } from "vitest";
import { consolidarRem28, resumirTurno } from "./rem28";
import { unControl, unEvento } from "./fixtures";
import { firmarApkCumple, firmarApkNoCumple } from "./apk";
import type { Control, EventoClinico } from "./tipos";

const AHORA = new Date(2026, 10, 4, 9, 0);
const DATOS_APK = { id: "a", episodioId: "ep-1", via: "TET" as const, rutAutor: "x", ahora: AHORA };

const conTf = (acts: string[], ims: number | null = null, estado: Control["terapiaFisica"]["estado"] = "REALIZADA"): Control =>
  unControl({ terapiaFisica: { estado, actividades: acts, ims, motivoContraindicacion: null } });

describe("resumirTurno", () => {
  it("cuenta kinesiterapia respiratoria y aspiraciones", () => {
    const r = resumirTurno(
      [
        unControl(),
        unControl({ kineResp: { realizada: false, aspiracion: "NO", aspecto: null, reologia: null, cantidad: null } }),
        unControl({ kineResp: { realizada: true, aspiracion: "NO", aspecto: null, reologia: null, cantidad: null } })
      ],
      []
    );
    expect(r.totalControles).toBe(3);
    expect(r.kineRespiratoria).toBe(2);
    expect(r.aspiraciones).toBe(1);
  });

  it("separa terapia física realizada de contraindicada", () => {
    const r = resumirTurno([conTf(["Giros en cama / posicionamiento"]), conTf([], null, "CONTRAINDICADA"), conTf([], null, "NO")], []);
    expect(r.terapiaFisicaRealizada).toBe(1);
    expect(r.terapiaFisicaContraindicada).toBe(1);
  });

  it("clasifica la movilización por nivel 1-4", () => {
    const r = resumirTurno(
      [conTf(["Sedestación al borde de cama", "Bipedestación asistida"]), conTf(["Marcha asistida en el box"])],
      []
    );
    expect(r.movilizacionPorNivel).toEqual({ 1: 0, 2: 1, 3: 1, 4: 1 });
  });

  it("IMT y EMS cuentan como nivel 1 (terapia física las engloba)", () => {
    const r = resumirTurno([conTf(["IMT (entrenamiento muscular inspiratorio)", "EMS (electroestimulación neuromuscular)"])], []);
    expect(r.movilizacionPorNivel[1]).toBe(1);
  });

  it("una sesión cuenta una sola vez por nivel aunque tenga varias actividades de él", () => {
    const r = resumirTurno([conTf(["Giros en cama / posicionamiento", "Movilización pasiva / activo-asistida"])], []);
    expect(r.movilizacionPorNivel[1]).toBe(1);
  });

  it("registra el IMS máximo del turno", () => {
    expect(resumirTurno([conTf([], 1), conTf([], 4), conTf([], 3)], []).imsMaximo).toBe(4);
  });

  it("un ajuste de tubo no cuenta como reintubación", () => {
    const ajuste = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({ tipo: "AJUSTE_TUBO", fijacionCm: "23", motivo: "DESPLAZAMIENTO_SUPERFICIAL" });
    expect(resumirTurno([], [ajuste]).reintubaciones).toBe(0);
  });

  it("cuenta ciclos de prono al supinar, no al iniciar", () => {
    const ini = unEvento<Extract<EventoClinico, { tipo: "INICIO_PRONO" }>>({ tipo: "INICIO_PRONO" });
    const sup = unEvento<Extract<EventoClinico, { tipo: "SUPINACION" }>>({ tipo: "SUPINACION" });
    expect(resumirTurno([], [ini]).ciclosProno).toBe(0);
    expect(resumirTurno([], [ini, sup]).ciclosProno).toBe(1);
  });

  it("distingue PVE iniciadas de exitosas", () => {
    const ini = unEvento<Extract<EventoClinico, { tipo: "INICIO_PVE" }>>({ tipo: "INICIO_PVE", duracionMin: 30 });
    const ok = unEvento<Extract<EventoClinico, { tipo: "FIN_PVE" }>>({ tipo: "FIN_PVE", exitosa: true });
    const mal = unEvento<Extract<EventoClinico, { tipo: "FIN_PVE" }>>({ tipo: "FIN_PVE", exitosa: false });
    const r = resumirTurno([], [ini, ini, ok, mal]);
    expect(r.pve).toBe(2);
    expect(r.pveExitosas).toBe(1);
  });

  it("cuenta fibrobroncoscopías y cambios de filtro por separado de otros procedimientos", () => {
    const fbc = unEvento<Extract<EventoClinico, { tipo: "ASISTENCIA_FBC" }>>({ tipo: "ASISTENCIA_FBC" });
    const pl = unEvento<Extract<EventoClinico, { tipo: "ASISTENCIA_PROCEDIMIENTO" }>>({ tipo: "ASISTENCIA_PROCEDIMIENTO", procedimiento: "Punción lumbar" });
    const r = resumirTurno([], [fbc, fbc, pl]);
    expect(r.asistenciasFbc).toBe(2);
    expect(r.asistenciaProcedimientos).toBe(1);
  });

  it("cuenta las APK que cumplen y las que no", () => {
    const r = resumirTurno([], [], [firmarApkCumple(DATOS_APK), firmarApkNoCumple(DATOS_APK, ["PEEP ≤ 12 cmH₂O"])]);
    expect(r.apkCumple).toBe(1);
    expect(r.apkNoCumple).toBe(1);
  });

  it("cuenta eventos de seguridad del paciente", () => {
    const a = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({ tipo: "AUTOEXTUBACION", dispositivo: "CNAF" });
    const p = unEvento<Extract<EventoClinico, { tipo: "PCR" }>>({ tipo: "PCR", duracionReanimacionMin: 8 });
    const r = resumirTurno([], [a, p]);
    expect(r.autoextubaciones).toBe(1);
    expect(r.pcr).toBe(1);
  });
});

describe("consolidarRem28 (mensual)", () => {
  it("suma los resúmenes y conserva el IMS máximo global", () => {
    const a = resumirTurno([conTf(["Bipedestación asistida"], 3)], []);
    const b = resumirTurno([conTf(["Marcha asistida en el box"], 8)], []);
    const t = consolidarRem28([a, b]);
    expect(t.totalControles).toBe(2);
    expect(t.kineRespiratoria).toBe(2);
    expect(t.movilizacionPorNivel[3]).toBe(1);
    expect(t.movilizacionPorNivel[4]).toBe(1);
    expect(t.imsMaximo).toBe(8);
  });

  it("consolidar una lista vacía no rompe", () => {
    const t = consolidarRem28([]);
    expect(t.totalControles).toBe(0);
    expect(t.imsMaximo).toBeNull();
  });
});
