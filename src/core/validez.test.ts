import { describe, expect, it } from "vitest";
import { mecanicaBloqueadaPorAsincronia, plateauEsValido, presionParaDriving, validezMecanicaEstatica } from "./validez";
import { calcularDerivados } from "./fisiologia";
import { unControl, unaVentilacion } from "./fixtures";

/**
 * Candado de mecánica (informe 3.G): reportar compliance sobre un plateau
 * contaminado por esfuerzo activo no es un dato imperfecto, es un dato falso.
 */
describe("candado de mecánica estática", () => {
  it("valida en ACVC sincrónico", () => {
    expect(plateauEsValido(unaVentilacion({ modalidad: "ACVC", asincronico: false }))).toBe(true);
  });

  it("INVALIDA en ACVC con asincronía", () => {
    const v = validezMecanicaEstatica(unaVentilacion({ modalidad: "ACVC", asincronico: true }));
    expect(v.valido).toBe(false);
    expect(v.motivo).toBe("ASINCRONIA_EN_MODO_CONTROLADO");
    expect(v.leyenda).toContain("asincronía");
  });

  it("INVALIDA en PCV con asincronía", () => {
    expect(plateauEsValido(unaVentilacion({ modalidad: "PCV", asincronico: true }))).toBe(false);
  });

  it("CPAP+PS y CNAF: la mecánica estática no aplica (no es lo mismo que invalidada)", () => {
    for (const modalidad of ["CPAP_PS", "CNAF"] as const) {
      const v = validezMecanicaEstatica(unaVentilacion({ modalidad, asincronico: true }));
      expect(v.motivo).toBe("NO_APLICA");
      expect(mecanicaBloqueadaPorAsincronia(unaVentilacion({ modalidad, asincronico: true }))).toBe(false);
    }
  });

  it("sin plateau registrado no es válida, pero tampoco se acusa asincronía", () => {
    const v = unaVentilacion({ pPlateau: null });
    expect(validezMecanicaEstatica(v).motivo).toBe("SIN_DATO");
    expect(mecanicaBloqueadaPorAsincronia(v)).toBe(false);
  });

  it("bloquea ΔP y compliance en los derivados, no solo en la UI", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    const d = calcularDerivados(c, 67.8);
    expect(d.drivingPressure).toBeNull();
    expect(d.compliance).toBeNull();
    expect(d.leyendaMecanica).toContain("asincronía");
  });

  it("deja intactas las medidas que sí son reales bajo asincronía", () => {
    const c = unControl({ ventilacion: unaVentilacion({ asincronico: true }) });
    const d = calcularDerivados(c, 67.8);
    expect(d.vtEspiradoPorKg).toBe(6.3);
    expect(d.volumenMinuto).toBe(8.6);
  });
});

describe("presionParaDriving", () => {
  it("ACVC: solo plateau", () => {
    expect(presionParaDriving(unaVentilacion({ modalidad: "ACVC", pPlateau: 20 }))).toEqual({ valor: 20, origen: "PLATEAU" });
    expect(presionParaDriving(unaVentilacion({ modalidad: "ACVC", pPlateau: null, pPico: 25 }))).toBeNull();
  });

  it("PCV: plateau si se mide; si no, la presión pico", () => {
    expect(presionParaDriving(unaVentilacion({ modalidad: "PCV", pPlateau: 20, pPico: 25 }))?.origen).toBe("PLATEAU");
    expect(presionParaDriving(unaVentilacion({ modalidad: "PCV", pPlateau: null, pPico: 25 }))).toEqual({ valor: 25, origen: "PICO" });
  });

  it("CPAP+PS y CNAF no tienen ΔP", () => {
    expect(presionParaDriving(unaVentilacion({ modalidad: "CPAP_PS" }))).toBeNull();
    expect(presionParaDriving(unaVentilacion({ modalidad: "CNAF" }))).toBeNull();
  });
});
