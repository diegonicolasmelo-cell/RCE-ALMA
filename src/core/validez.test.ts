import { describe, expect, it } from "vitest";
import { plateauEsValido, validezMecanicaEstatica } from "./validez";
import { calcularDerivados } from "./fisiologia";
import { unControl, unSoporte } from "./fixtures";

/**
 * Candado de mecanica ventilatoria (informe 3.G). Es el rasgo que distingue
 * esta plataforma de una planilla: reportar compliance sobre un plateau
 * contaminado por esfuerzo activo no es un dato imperfecto, es un dato falso.
 */
describe("candado de mecanica estatica", () => {
  it("valida la mecanica en modo controlado sincronico", () => {
    const s = unSoporte({ modoVMI: "VCV", asincronico: false });
    expect(plateauEsValido(s)).toBe(true);
  });

  it("INVALIDA la mecanica en VCV con asincronia", () => {
    const v = validezMecanicaEstatica(unSoporte({ modoVMI: "VCV", asincronico: true }));
    expect(v.valido).toBe(false);
    expect(v.motivo).toBe("ASINCRONIA_EN_MODO_CONTROLADO");
    expect(v.leyenda).toContain("asincronia");
  });

  it("INVALIDA la mecanica en PCV con asincronia", () => {
    expect(plateauEsValido(unSoporte({ modoVMI: "PCV", asincronico: true }))).toBe(false);
  });

  it("mantiene la mecanica valida en PSV con asincronia (no es modo controlado)", () => {
    // En PSV el esfuerzo del paciente es esperado y el plateau no se interpreta
    // como mecanica pasiva: el candado solo aplica a modos controlados.
    expect(plateauEsValido(unSoporte({ modoVMI: "PSV", asincronico: true }))).toBe(true);
  });

  it("no aplica fuera de VMI", () => {
    const v = validezMecanicaEstatica(unSoporte({ tipo: "CNAF", modoVMI: null }));
    expect(v.valido).toBe(false);
    expect(v.motivo).toBe("NO_ES_VMI");
  });

  it("bloquea driving pressure y compliance en los derivados, no solo en la UI", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const d = calcularDerivados(c, 67.8);
    expect(d.drivingPressure).toBeNull();
    expect(d.compliance).toBeNull();
    expect(d.leyendaMecanica).toContain("asincronia");
  });

  it("deja intactos los parametros que si son validos bajo asincronia", () => {
    const c = unControl({ soporte: unSoporte({ modoVMI: "VCV", asincronico: true }) });
    const d = calcularDerivados(c, 67.8);
    // Vt, FR y por tanto Tobin siguen siendo medidas reales del ventilador.
    expect(d.vtPorKg).toBe(6.3);
    expect(d.tobin).toBe(47);
  });
});
