import { describe, expect, it } from "vitest";
import { ESCALAS, calcularEscala, escalaDe } from "./evaluaciones";

const todos = (id: Parameters<typeof escalaDe>[0], v: number) => Object.fromEntries(escalaDe(id).campos.map((c) => [c.id, v]));

describe("MRC-ss", () => {
  it("12 movimientos de 0 a 5; subtotales /30 y total /60", () => {
    expect(escalaDe("MRC_SS").campos).toHaveLength(12);
    const r = calcularEscala("MRC_SS", todos("MRC_SS", 5));
    expect(r.total).toBe(60);
    expect(r.lineas).toEqual(["Subtotal derecho 30/30", "Subtotal izquierdo 30/30", "MRC sum score 60/60"]);
    expect(r.interpretacion).toBe("Sin debilidad adquirida en UCI");
  });

  it("≤ 48 es debilidad adquirida en UCI; 49 no", () => {
    const v = { ...todos("MRC_SS", 4) }; // 48
    expect(calcularEscala("MRC_SS", v).interpretacion).toMatch(/Debilidad adquirida/);
    expect(calcularEscala("MRC_SS", { ...v, m1d: 5 }).interpretacion).toBe("Sin debilidad adquirida en UCI");
  });

  it("sin los 12 movimientos no hay total", () => {
    const r = calcularEscala("MRC_SS", { m1d: 5 });
    expect(r.total).toBeNull();
    expect(r.completa).toBe(false);
  });

  it("rechaza valores fuera de rango", () => {
    expect(calcularEscala("MRC_SS", { m1d: 6 }).errores).toHaveLength(1);
  });
});

describe("FSS-ICU", () => {
  it("5 actividades de 0 a 7, total /35", () => {
    expect(calcularEscala("FSS_ICU", todos("FSS_ICU", 7)).total).toBe(35);
    expect(calcularEscala("FSS_ICU", { ...todos("FSS_ICU", 1), a3: 8 }).errores).toHaveLength(1);
  });
});

describe("otras escalas", () => {
  it("VISAGE: corte ≥ 3", () => {
    expect(calcularEscala("VISAGE", { puntaje: 3 }).interpretacion).toMatch(/Alcanza/);
    expect(calcularEscala("VISAGE", { puntaje: 2 }).interpretacion).toMatch(/Bajo/);
  });

  it("score de vía aérea: corte < 6", () => {
    expect(calcularEscala("VIA_AEREA", { puntaje: 5 }).interpretacion).toMatch(/Bajo/);
    expect(calcularEscala("VIA_AEREA", { puntaje: 6 }).interpretacion).toMatch(/Sobre/);
  });

  it("PIM, PEF, engrosamiento y excursión se registran sueltos, sin total", () => {
    const r = calcularEscala("FUERZA_RESPIRATORIA", { pim: -30, pef: 220 });
    expect(r.total).toBeNull();
    expect(escalaDe("FUERZA_RESPIRATORIA").campos.map((c) => c.id)).toEqual(["pim", "pef", "fed", "exc"]);
  });

  it("fragilidad 1 a 9", () => {
    expect(calcularEscala("FRAGILIDAD", { nivel: 10 }).errores).toHaveLength(1);
    expect(calcularEscala("FRAGILIDAD", { nivel: 5 }).total).toBe(5);
  });

  it("hay siete escalas con id único", () => {
    expect(new Set(ESCALAS.map((e) => e.id)).size).toBe(7);
  });
});
