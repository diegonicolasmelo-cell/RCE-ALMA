import { describe, expect, it } from "vitest";
import { describirDva, semaforoCatecolamina, semaforoDva, usaDva } from "./dva";

describe("semaforo de catecolaminas", () => {
  it("aplica los cortes institucionales", () => {
    expect(semaforoCatecolamina(null)).toBe("SIN_DVA");
    expect(semaforoCatecolamina(0)).toBe("SIN_DVA");
    expect(semaforoCatecolamina(0.05)).toBe("BAJA");
    expect(semaforoCatecolamina(0.2)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.45)).toBe("ALTA");
  });

  it("trata los limites exactos de forma determinista", () => {
    expect(semaforoCatecolamina(0.1)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.3)).toBe("MEDIA");
    expect(semaforoCatecolamina(0.31)).toBe("ALTA");
  });
});

describe("semaforoDva (global del paciente)", () => {
  it("se queda con el nivel mas alto entre las catecolaminas", () => {
    // NAD baja pero adrenalina alta: el paciente esta en riesgo alto.
    const nivel = semaforoDva({ noradrenalina: 0.05, adrenalina: 0.5, vasopresina: null });
    expect(nivel).toBe("ALTA");
  });

  it("la vasopresina no entra en el semaforo (no se pondera por peso)", () => {
    expect(semaforoDva({ noradrenalina: null, adrenalina: null, vasopresina: 0.03 })).toBe(
      "SIN_DVA"
    );
  });
});

describe("usaDva", () => {
  it("detecta vasopresina aislada aunque no afecte el semaforo", () => {
    expect(usaDva({ noradrenalina: null, adrenalina: null, vasopresina: 0.02 })).toBe(true);
    expect(usaDva({ noradrenalina: null, adrenalina: null, vasopresina: null })).toBe(false);
  });
});

describe("describirDva", () => {
  it("lista las infusiones activas con unidades", () => {
    expect(describirDva({ noradrenalina: 0.08, adrenalina: null, vasopresina: 0.02 })).toBe(
      "Noradrenalina 0.08 mcg/kg/min + Vasopresina 0.02 UI/min"
    );
  });

  it("es explicito cuando no hay requerimiento", () => {
    expect(describirDva({ noradrenalina: null, adrenalina: null, vasopresina: null })).toBe(
      "sin requerimiento de DVA"
    );
  });
});
