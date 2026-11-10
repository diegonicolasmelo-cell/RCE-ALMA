import { describe, expect, it } from "vitest";
import { ESCALAS, NE, calcularEscala, camposVisibles, claveChk, escalaDe, escalasDePestana, momentoDeEvaluacion, momentoPreciso, resumenEvaluacion } from "./evaluaciones";

const todos = (id: Parameters<typeof escalaDe>[0], v: number) => Object.fromEntries(escalaDe(id).campos.map((c) => [c.id, v]));

describe("pestañas", () => {
  it("cuatro bloques: previa a la UCI, fuerza y función, PVE y extubación, imagen", () => {
    expect(escalasDePestana("PREVIA").map((e) => e.id)).toEqual(["FRAGILIDAD", "BARTHEL", "CHARLSON"]);
    expect(escalasDePestana("FUERZA").map((e) => e.id)).toEqual(["MRC_SS", "FSS_ICU", "CPAX", "IMS", "DINAMOMETRIA", "FUERZA_RESPIRATORIA"]);
    expect(escalasDePestana("PVE").map((e) => e.id)).toEqual(["TOS_DEGLUCION", "VISAGE", "VIA_AEREA"]);
    expect(escalasDePestana("IMAGEN").map((e) => e.id)).toEqual(["ECOGRAFIA"]);
  });
  it("fragilidad, Barthel y Charlson son datos únicos del episodio", () => {
    expect(ESCALAS.filter((e) => e.unico).map((e) => e.id)).toEqual(["FRAGILIDAD", "BARTHEL", "CHARLSON"]);
  });
});

describe("MRC-ss (como en el RCE)", () => {
  it("12 movimientos de 0 a 5: subtotales /30 y total /60", () => {
    const r = calcularEscala("MRC_SS", todos("MRC_SS", 5));
    expect(r.total).toBe(60);
    expect(r.interpretacion).toBe("Sin DAUCI");
  });
  it("menos de 48 es DAUCI y menos de 36 DAUCI severa", () => {
    expect(calcularEscala("MRC_SS", { ...todos("MRC_SS", 4), m1d: 3 }).interpretacion).toMatch(/^DAUCI \(< 48\)/);
    expect(calcularEscala("MRC_SS", todos("MRC_SS", 4)).interpretacion).toBe("Sin DAUCI");
    expect(calcularEscala("MRC_SS", todos("MRC_SS", 2)).interpretacion).toMatch(/severa/);
  });
  it("sin los 12 no se guarda; con un NE se guarda sin total", () => {
    expect(calcularEscala("MRC_SS", { m1d: 5 }).completa).toBe(false);
    const ne = calcularEscala("MRC_SS", { ...todos("MRC_SS", 5), m3i: NE });
    expect(ne.completa).toBe(true);
    expect(ne.total).toBeNull();
  });
});

describe("FSS-ICU (manual: hasta 2 NE se promedian)", () => {
  it("5 actividades de 0 a 7, total /35", () => {
    expect(calcularEscala("FSS_ICU", todos("FSS_ICU", 7)).total).toBe(35);
  });
  it("2 NE se imputan con el promedio; con 3 no hay total", () => {
    expect(calcularEscala("FSS_ICU", { a1: 4, a2: 4, a3: 4, a4: NE, a5: NE }).total).toBe(20);
    expect(calcularEscala("FSS_ICU", { a1: 4, a2: 4, a3: NE, a4: NE, a5: NE }).total).toBeNull();
  });
});

describe("Previa a la UCI", () => {
  it("fragilidad: un nivel de 1 a 9 con su nombre", () => {
    expect(calcularEscala("FRAGILIDAD", { nivel: 5 }).lineas[0]).toBe("ECF 5 · Vive con fragilidad leve");
    expect(calcularEscala("FRAGILIDAD", {}).completa).toBe(false);
  });
  it("Barthel: las 10 actividades; 90 es dependencia moderada", () => {
    const v = { ...todos("BARTHEL", 10), b2: 5, b4: 5 };
    expect(calcularEscala("BARTHEL", v).total).toBe(90);
    expect(calcularEscala("BARTHEL", v).interpretacion).toBe("Dependencia moderada");
  });
  it("Charlson suma los pesos del RCE; la edad la agrega el PC", () => {
    const r = calcularEscala("CHARLSON", { [claveChk("c", 4)]: 1, [claveChk("c", 17)]: 1 });
    expect(r.total).toBe(7);
    expect(r.lineas[0]).toBe("Charlson 7 pts sin edad");
    expect(calcularEscala("CHARLSON", {}).total).toBe(0);
  });
});

describe("Fuerza y función", () => {
  it("Pimáx: valor absoluto y cargas al 50, 60, 70 y 80 %", () => {
    const r = calcularEscala("FUERZA_RESPIRATORIA", { pim: -60 });
    expect(r.total).toBe(60);
    expect(r.lineas[1]).toBe("Cargas (cmH₂O): 50% 30 · 60% 36 · 70% 42 · 80% 48");
    expect(r.interpretacion).toMatch(/Disminuida/);
  });
  it("prensión: los cortes dependen del sexo (11 kg hombre, 7 kg mujer)", () => {
    expect(calcularEscala("DINAMOMETRIA", { kg: 8 }, { sexo: "M" }).interpretacion).toMatch(/DAUCI \(corte 11/);
    expect(calcularEscala("DINAMOMETRIA", { kg: 8 }, { sexo: "F" }).interpretacion).toMatch(/Normal/);
  });
  it("CPAx: 10 dominios, total /50; IMS: nivel 0 a 10", () => {
    expect(calcularEscala("CPAX", todos("CPAX", 3)).total).toBe(30);
    expect(calcularEscala("IMS", { nivel: 3 }).interpretacion).toMatch(/sin marcha/);
  });
});

describe("PVE y extubación", () => {
  it("VISAGE: 4 ítems sí/no; ≥ 3 es alta probabilidad de éxito", () => {
    expect(calcularEscala("VISAGE", { v: 1, i: 1, a: 0, g: 1 }).interpretacion).toMatch(/alta probabilidad/);
    expect(calcularEscala("VISAGE", { v: 1 }).completa).toBe(false);
  });
  it("score de cuidados de vía aérea: 6 ítems de 0 a 3, total /18", () => {
    expect(calcularEscala("VIA_AEREA", todos("VIA_AEREA", 2)).total).toBe(12);
  });
  it("tos y deglución: el flujo pico interpreta la tos; azul de metileno y PTT solo con TQT", () => {
    expect(calcularEscala("TOS_DEGLUCION", { pcf: 55 }).interpretacion).toMatch(/ineficaz/);
    expect(camposVisibles(escalaDe("TOS_DEGLUCION"), "TET").map((c) => c.id)).toEqual(["pcf", "deg"]);
    expect(camposVisibles(escalaDe("TOS_DEGLUCION"), "TQT").map((c) => c.id)).toEqual(["pcf", "deg", "bdt", "ptt"]);
  });
});

describe("ecografía", () => {
  it("una fracción de engrosamiento bajo 20 % sugiere disfunción diafragmática", () => {
    const r = calcularEscala("ECOGRAFIA", { fd: 15, [claveChk("h", 1)]: 1 });
    expect(r.lineas[0]).toBe("FED D 15 % · Patrón B bilateral");
    expect(r.interpretacion).toMatch(/disfunción diafragmática/);
  });
});

describe("resumen", () => {
  it("una línea con el resultado, la interpretación y la nota", () => {
    expect(resumenEvaluacion("MRC_SS", todos("MRC_SS", 5), 60, "post sedación")).toBe("MRC-ss 60/60 · Sin DAUCI · post sedación");
    expect(resumenEvaluacion("FRAGILIDAD", { nivel: 5 }, 5)).toBe("Fragilidad: ECF 5 · Vive con fragilidad leve");
    expect(resumenEvaluacion("TOS_DEGLUCION", { pcf: 180, deg: 3 }, 180)).toBe("Tos y deglución: PCF 180 L/min · deglución adecuada · Tos eficaz (≥ 160 L/min)");
  });
  it("los registros de una versión anterior se siguen leyendo", () => {
    expect(resumenEvaluacion("DEGLUCION", { nivel: 1 }, null)).toBe("Deglución: Esporádica");
    expect(resumenEvaluacion("FLUJO_PICO_TOS", { pef: 60 }, 60)).toBe("Flujo pico de tos: 60 L/min");
  });
});

describe("hora real de la evaluación", () => {
  const ahora = new Date(2026, 10, 9, 0, 10);
  it("una hora posterior a la actual es de ayer; más de 12 h atrás no se acepta", () => {
    expect(momentoDeEvaluacion("23:50", ahora)?.getDate()).toBe(8);
    expect(momentoDeEvaluacion("10:00", ahora)).toBeNull();
    expect(momentoDeEvaluacion("25:00", ahora)).toBeNull();
  });
});

describe("momento preciso", () => {
  it("dos registros del mismo minuto quedan en el orden en que se anotaron, y nunca en el futuro", () => {
    const real = new Date(2026, 10, 10, 15, 9);
    const a = momentoPreciso(real, new Date(2026, 10, 10, 15, 9, 10));
    const b = momentoPreciso(real, new Date(2026, 10, 10, 15, 9, 40));
    expect(a.getTime()).toBeLessThan(b.getTime());
    expect(momentoPreciso(new Date(2026, 10, 10, 15, 0), new Date(2026, 10, 10, 15, 9, 40)).getMinutes()).toBe(0);
  });
});
