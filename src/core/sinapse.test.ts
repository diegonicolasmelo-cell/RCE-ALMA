import { describe, expect, it } from "vitest";
import { construirRut, enlaceSinapse, formatearRut, normalizarRut, validarRut } from "./sinapse";

describe("RUT", () => {
  it("normaliza puntos, guion y mayusculas", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("16452891k")).toBe("16452891-K");
  });

  it("rechaza lo que no tiene forma de RUT", () => {
    expect(normalizarRut("abc")).toBeNull();
    expect(normalizarRut("")).toBeNull();
  });

  it("valida el digito verificador (modulo 11)", () => {
    expect(validarRut("12.345.678-5")).toBe(true);
    expect(validarRut("16.452.891-K")).toBe(true);
    expect(validarRut("12.345.678-9")).toBe(false);
  });

  it("formatea con puntos", () => {
    expect(formatearRut("123456785")).toBe("12.345.678-5");
  });
});

describe("enlaceSinapse", () => {
  const plantilla = "https://sinapse.example/paciente?rut={rut}";

  it("arma el enlace con el RUT normalizado", () => {
    expect(enlaceSinapse("12.345.678-5", plantilla)).toBe(
      "https://sinapse.example/paciente?rut=12345678-5"
    );
  });

  it("soporta los demas marcadores", () => {
    expect(enlaceSinapse("12345678-5", "/x/{cuerpo}/{dv}")).toBe("/x/12345678/5");
  });

  it("no genera enlace con un RUT de digito invalido: evita abrir otra ficha", () => {
    expect(enlaceSinapse("12.345.678-9", plantilla)).toBeNull();
  });

  it("no genera enlace sin RUT o sin plantilla", () => {
    expect(enlaceSinapse(null, plantilla)).toBeNull();
    expect(enlaceSinapse("12345678-5", "  ")).toBeNull();
  });
});

describe("construirRut", () => {
  it("arma RUT con dígito verificador válido", () => {
    expect(construirRut(12345678)).toBe("12345678-5");
    expect(validarRut(construirRut(16452891))).toBe(true);
    expect(construirRut(16452891)).toBe("16452891-K");
  });
});
