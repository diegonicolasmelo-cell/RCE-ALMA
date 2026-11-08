import { describe, expect, it } from "vitest";
import { ESCALAS, GRUPO_PVE_EXTUBACION, calcularEscala, escalaDe, momentoDeEvaluacion, resumenEvaluacion } from "./evaluaciones";

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

  it("hay diez escalas con id único", () => {
    expect(new Set(ESCALAS.map((e) => e.id)).size).toBe(ESCALAS.length);
    expect(ESCALAS).toHaveLength(10);
  });
});

describe("PVE y extubación", () => {
  it("es el primer apartado y reúne VISAGE, vía aérea, flujo pico de tos y deglución", () => {
    expect(ESCALAS[0]?.grupo).toBe(GRUPO_PVE_EXTUBACION);
    expect(ESCALAS.filter((e) => e.grupo === GRUPO_PVE_EXTUBACION).map((e) => e.id)).toEqual(["VISAGE", "VIA_AEREA", "FLUJO_PICO_TOS", "DEGLUCION", "ECOGRAFIA"]);
    expect(ESCALAS.some((e) => e.grupo === "Neurológico")).toBe(false);
  });

  it("la deglución es una categoría: se lee como texto y no tiene total", () => {
    const r = calcularEscala("DEGLUCION", { nivel: 1 });
    expect(r.total).toBeNull();
    expect(r.lineas).toEqual(["Esporádica"]);
    expect(resumenEvaluacion("DEGLUCION", { nivel: 1 }, null)).toBe("Deglución: esporádica");
    expect(calcularEscala("DEGLUCION", { nivel: 3 }).errores).toHaveLength(1);
  });

  it("el flujo pico de tos se registra en L/min, sin un corte inventado", () => {
    const r = calcularEscala("FLUJO_PICO_TOS", { pef: 60 });
    expect(r.total).toBe(60);
    expect(r.interpretacion).toBeNull();
    expect(resumenEvaluacion("FLUJO_PICO_TOS", { pef: 60 }, 60)).toBe("Flujo pico de tos: 60 L/min");
  });
});

describe("nota clínica, ecografía y hora real", () => {
  it("la ecografía es su hallazgo: exige nota y se lee como tal", () => {
    expect(escalaDe("ECOGRAFIA").exigeNota).toBe(true);
    expect(escalaDe("ECOGRAFIA").campos).toHaveLength(0);
    expect(resumenEvaluacion("ECOGRAFIA", {}, null, " Patrón B bilateral ")).toBe("Ecografía: Patrón B bilateral");
  });

  it("cualquier evaluación puede llevar una nota clínica al final", () => {
    expect(resumenEvaluacion("DEGLUCION", { nivel: 0 }, null, "Se suspende vía oral")).toBe("Deglución: ausente · Se suspende vía oral");
    expect(resumenEvaluacion("VISAGE", { puntaje: 3 }, 3)).toBe("VISAGE (neurológicos y neuroquirúrgicos): 3");
  });

  const ahora = new Date(2026, 10, 8, 14, 30);

  it("la hora real puede ser minutos antes de registrarla", () => {
    expect(momentoDeEvaluacion("14:12", ahora)?.getTime()).toBe(new Date(2026, 10, 8, 14, 12).getTime());
    expect(momentoDeEvaluacion("14:30", ahora)?.getTime()).toBe(ahora.getTime());
  });

  it("una hora posterior a la actual es de la noche anterior", () => {
    const madrugada = new Date(2026, 10, 9, 0, 10);
    expect(momentoDeEvaluacion("23:50", madrugada)?.getTime()).toBe(new Date(2026, 10, 8, 23, 50).getTime());
  });

  it("no acepta una hora inválida ni de más de 12 horas atrás", () => {
    expect(momentoDeEvaluacion("25:00", ahora)).toBeNull();
    expect(momentoDeEvaluacion("abc", ahora)).toBeNull();
    expect(momentoDeEvaluacion("01:00", ahora)).toBeNull();
    expect(momentoDeEvaluacion("02:31", ahora)).not.toBeNull();
  });
});
