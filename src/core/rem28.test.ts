import { describe, expect, it } from "vitest";
import { consolidarRem28, resumirTurno } from "./rem28";
import { unControl, unEvento } from "./fixtures";
import { firmarApkCumple, firmarApkNoCumple } from "./apk";
import type { EventoClinico } from "./tipos";

const DATOS_APK = {
  id: "apk-1",
  episodioId: "ep-1",
  controlId: null,
  rutAutor: "16.452.891-K",
  ahora: new Date("2026-11-04T16:00:00.000Z"),
  via: "TET" as const
};

describe("resumirTurno", () => {
  it("cuenta kinesiterapia respiratoria y aspiraciones", () => {
    const r = resumirTurno(
      [
        unControl({ intervencion: { ...unControl().intervencion, respiratoriaRealizada: true } }),
        unControl({
          intervencion: {
            ...unControl().intervencion,
            respiratoriaRealizada: false,
            aspiracion: "NO_REQUIERE"
          }
        })
      ],
      []
    );
    expect(r.totalControles).toBe(2);
    expect(r.kineRespiratoria).toBe(1);
    expect(r.aspiraciones).toBe(1);
  });

  it("separa kine motora realizada de contraindicada", () => {
    const base = unControl().intervencion;
    const r = resumirTurno(
      [
        unControl({ intervencion: { ...base, actividadesMotoras: ["Giros en cama / posicionamiento"] } }),
        unControl({
          intervencion: {
            ...base,
            motoraContraindicada: true,
            motivoContraindicacion: "Sangrado activo o procedimiento invasivo en curso",
            actividadesMotoras: []
          }
        })
      ],
      []
    );
    expect(r.kineMotoraRealizada).toBe(1);
    expect(r.kineMotoraContraindicada).toBe(1);
  });

  it("clasifica la movilizacion por nivel 1-4", () => {
    const base = unControl().intervencion;
    const r = resumirTurno(
      [
        unControl({
          intervencion: {
            ...base,
            actividadesMotoras: ["Sedestacion al borde de cama (SBC)", "Bipedestacion asistida"]
          }
        }),
        unControl({
          intervencion: { ...base, actividadesMotoras: ["Marcha asistida en el box / pasillo UPC"] }
        })
      ],
      []
    );
    expect(r.movilizacionPorNivel[2]).toBe(1);
    expect(r.movilizacionPorNivel[3]).toBe(1);
    expect(r.movilizacionPorNivel[4]).toBe(1);
    expect(r.movilizacionPorNivel[1]).toBe(0);
  });

  it("cuenta una sola vez por nivel aunque la sesion tenga varias actividades del mismo", () => {
    const base = unControl().intervencion;
    const r = resumirTurno(
      [
        unControl({
          intervencion: {
            ...base,
            actividadesMotoras: [
              "Giros en cama / posicionamiento",
              "Movilizacion pasiva / activo-asistida",
              "IMT (entrenamiento muscular inspiratorio)"
            ]
          }
        })
      ],
      []
    );
    expect(r.movilizacionPorNivel[1]).toBe(1);
  });

  it("registra el IMS maximo alcanzado en el turno", () => {
    const base = unControl().intervencion;
    const r = resumirTurno(
      [
        unControl({ intervencion: { ...base, ims: 1 } }),
        unControl({ intervencion: { ...base, ims: 4 } }),
        unControl({ intervencion: { ...base, ims: 3 } })
      ],
      []
    );
    expect(r.imsMaximo).toBe(4);
  });

  it("un ajuste de tubo no cuenta como reintubacion", () => {
    const ajuste = unEvento<Extract<EventoClinico, { tipo: "AJUSTE_TUBO" }>>({
      tipo: "AJUSTE_TUBO",
      fijacionCm: "23",
      motivo: "DESPLAZAMIENTO_SUPERFICIAL"
    });
    expect(resumirTurno([], [ajuste]).reintubaciones).toBe(0);
  });

  it("cuenta ciclos de prono al supinar, no al iniciar", () => {
    const iniciar = unEvento<Extract<EventoClinico, { tipo: "INICIO_PRONO" }>>({
      tipo: "INICIO_PRONO"
    });
    const supinar = unEvento<Extract<EventoClinico, { tipo: "SUPINACION" }>>({
      tipo: "SUPINACION"
    });
    // Un prono en curso todavia no es un ciclo cerrado.
    expect(resumirTurno([], [iniciar]).ciclosProno).toBe(0);
    expect(resumirTurno([], [iniciar, supinar]).ciclosProno).toBe(1);
  });

  it("distingue PVE iniciadas de PVE exitosas", () => {
    const inicio = unEvento<Extract<EventoClinico, { tipo: "INICIO_PVE" }>>({
      tipo: "INICIO_PVE",
      duracionMin: 30
    });
    const finOk = unEvento<Extract<EventoClinico, { tipo: "FIN_PVE" }>>({
      tipo: "FIN_PVE",
      exitosa: true
    });
    const finMal = unEvento<Extract<EventoClinico, { tipo: "FIN_PVE" }>>({
      tipo: "FIN_PVE",
      exitosa: false
    });
    const r = resumirTurno([], [inicio, inicio, finOk, finMal]);
    expect(r.pve).toBe(2);
    expect(r.pveExitosas).toBe(1);
  });

  it("cuenta las pautas APK validadas y las no cumplidas", () => {
    const r = resumirTurno(
      [],
      [],
      [firmarApkCumple(DATOS_APK), firmarApkNoCumple(DATOS_APK, ["PEEP <= 12 cmH2O"])]
    );
    expect(r.apkCumple).toBe(1);
    expect(r.apkNoCumple).toBe(1);
  });

  it("cuenta eventos de seguridad del paciente", () => {
    const autoext = unEvento<Extract<EventoClinico, { tipo: "AUTOEXTUBACION" }>>({
      tipo: "AUTOEXTUBACION",
      dispositivoSalida: "CNAF"
    });
    const r = resumirTurno([], [autoext]);
    expect(r.autoextubaciones).toBe(1);
  });
});

describe("consolidarRem28 (mensual)", () => {
  it("suma los resumenes de varios episodios y conserva el IMS maximo global", () => {
    const base = unControl().intervencion;
    const a = resumirTurno(
      [unControl({ intervencion: { ...base, ims: 3, actividadesMotoras: ["Bipedestacion asistida"] } })],
      []
    );
    const b = resumirTurno(
      [
        unControl({
          intervencion: {
            ...base,
            ims: 8,
            actividadesMotoras: ["Marcha asistida en el box / pasillo UPC"]
          }
        })
      ],
      []
    );

    const total = consolidarRem28([a, b]);
    expect(total.totalControles).toBe(2);
    expect(total.kineRespiratoria).toBe(2);
    expect(total.movilizacionPorNivel[3]).toBe(1);
    expect(total.movilizacionPorNivel[4]).toBe(1);
    expect(total.imsMaximo).toBe(8);
  });

  it("consolidar una lista vacia no rompe", () => {
    const total = consolidarRem28([]);
    expect(total.totalControles).toBe(0);
    expect(total.imsMaximo).toBeNull();
    expect(total.movilizacionPorNivel[1]).toBe(0);
  });
});
