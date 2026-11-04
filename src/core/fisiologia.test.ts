import { describe, expect, it } from "vitest";
import {
  calcularDerivados,
  calcularGlasgow,
  calcularPam,
  calcularPbw,
  calcularPpc,
  semaforoPcf
} from "./fisiologia";
import { unControl, unEsfuerzo, unSoporte } from "./fixtures";

describe("calcularPbw (Devine)", () => {
  it("calcula el peso predicho de un hombre de 172 cm", () => {
    expect(calcularPbw(172, "M")).toBe(67.8);
  });

  it("usa la base femenina (45.5) para mujeres", () => {
    expect(calcularPbw(162, "F")).toBe(54.2);
  });

  it("aplica piso de seguridad: una talla mal tipeada no produce Vt/kg absurdo", () => {
    expect(calcularPbw(20, "M")).toBe(30);
  });
});

describe("presiones", () => {
  it("calcula PAM = PAD + (PAS-PAD)/3", () => {
    expect(calcularPam(120, 60)).toBe(80);
  });

  it("devuelve null si falta un componente", () => {
    expect(calcularPam(null, 60)).toBeNull();
    expect(calcularPam(120, null)).toBeNull();
  });

  it("devuelve null ante una PA incoherente (sistolica <= diastolica)", () => {
    expect(calcularPam(60, 90)).toBeNull();
  });

  it("calcula PPC solo si hay neuromonitoreo", () => {
    expect(calcularPpc(90, 19)).toBe(71);
    expect(calcularPpc(90, null)).toBeNull();
  });
});

describe("calcularGlasgow condicionado por via aerea", () => {
  it("con via aerea artificial reporta verbal NT y total sobre 11T", () => {
    const g = calcularGlasgow({ ocular: 3, verbal: 1, motora: 5 }, "TET");
    expect(g.intubado).toBe(true);
    expect(g.verbal).toBe("NT");
    expect(g.total).toBe(9);
    expect(g.display).toBe("9T");
    expect(g.completo).toBe("9T/11T (O3 V:NT M5)");
  });

  it("ignora el verbal registrado cuando el paciente esta intubado", () => {
    // Un verbal 5 en un paciente con TET es un error metodologico: no debe sumar.
    const conVerbalAlto = calcularGlasgow({ ocular: 3, verbal: 5, motora: 5 }, "TQT");
    expect(conVerbalAlto.total).toBe(9);
  });

  it("con via aerea natural usa el verbal real y total sobre 15", () => {
    const g = calcularGlasgow({ ocular: 4, verbal: 5, motora: 6 }, "NATURAL");
    expect(g.verbal).toBe(5);
    expect(g.total).toBe(15);
    expect(g.completo).toBe("15/15 (O4 V5 M6)");
  });
});

describe("calcularDerivados", () => {
  const pbw = calcularPbw(172, "M");

  it("calcula driving pressure, compliance y Vt/kg en VMI sincronica", () => {
    const d = calcularDerivados(unControl(), pbw);
    expect(d.drivingPressure).toBe(10); // 20 - 10
    expect(d.compliance).toBe(43); // 430 / 10
    expect(d.vtPorKg).toBe(6.3); // 430 / 67.8
  });

  it("calcula el indice de Tobin en VMI", () => {
    const d = calcularDerivados(unControl(), pbw);
    expect(d.tobin).toBe(47); // 20 / 0.43
  });

  it("no calcula ROX en VMI (es un indice de soporte no invasivo)", () => {
    expect(calcularDerivados(unControl(), pbw).rox).toBeNull();
  });

  it("calcula ROX en CNAF", () => {
    const c = unControl({
      spo2: 94,
      soporte: unSoporte({ tipo: "CNAF", modoVMI: null, fio2: 40, fr: 24, flujo: 50 })
    });
    // (94 / 0.40) / 24 = 9.79
    expect(calcularDerivados(c, pbw).rox).toBe(9.79);
  });

  it("no calcula mecanica estatica si no hay plateau registrado", () => {
    const c = unControl({ soporte: unSoporte({ pPlateau: null }) });
    const d = calcularDerivados(c, pbw);
    expect(d.drivingPressure).toBeNull();
    expect(d.compliance).toBeNull();
  });
});

describe("semaforoPcf (flujo pico de tos)", () => {
  it("clasifica segun el corte institucional de exito de extubacion", () => {
    expect(semaforoPcf(null)).toBe("SIN_DATO");
    expect(semaforoPcf(40)).toBe("INSUFICIENTE");
    expect(semaforoPcf(57)).toBe("LIMITE");
    expect(semaforoPcf(70)).toBe("OPTIMO");
  });

  it("se expone a traves de los derivados del control", () => {
    const c = unControl({ esfuerzo: unEsfuerzo({ pcf: 80 }) });
    expect(calcularDerivados(c, 67.9).semaforoPcf).toBe("OPTIMO");
  });
});
