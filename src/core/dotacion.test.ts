import { afterEach, describe, expect, it } from "vitest";
import { CORREO_DEMO, DOTACION_DEMO, buscarProfesional, buscarUsuario, dotacion, fijarDotacion, tituloProfesional } from "./dotacion";

afterEach(() => fijarDotacion(DOTACION_DEMO));

describe("dotación de demostración", () => {
  it("16 profesionales con correos inventados, sin RUT", () => {
    expect(DOTACION_DEMO).toHaveLength(16);
    expect(DOTACION_DEMO.every((p) => p.correo.endsWith("@demo.upc"))).toBe(true);
    expect(DOTACION_DEMO.filter((p) => p.turno === "T3").map((p) => p.nombre)).toEqual(["Eduardo Gonzalez", "Diego Melo", "Karen Gonzalez"]);
    expect(DOTACION_DEMO.filter((p) => p.rol === "COORDINACION")).toHaveLength(2);
    expect(JSON.stringify(DOTACION_DEMO)).not.toMatch(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/);
  });
  it("el título profesional para la nota", () => {
    expect(tituloProfesional(buscarProfesional(CORREO_DEMO)!)).toBe("Klgo. Diego Melo");
  });
});

describe("usuario por correo o nombre", () => {
  it("por correo sin importar mayúsculas ni espacios", () => {
    expect(buscarUsuario(" Diego.Melo@demo.upc ")?.nombre).toBe("Diego Melo");
    expect(buscarUsuario("otro@gmail.com")).toBeUndefined();
  });
  it("por nombre sin importar tildes ni mayúsculas", () => {
    expect(buscarUsuario("diego melo")?.correo).toBe(CORREO_DEMO);
    expect(buscarUsuario("  María  José Vega ")?.nombre).toBe("Maria Jose Vega");
  });
  it("no adivina si es ambiguo o no existe", () => {
    expect(buscarUsuario("Gonzalez")).toBeUndefined();
    expect(buscarUsuario("Nadie Aqui")).toBeUndefined();
    expect(buscarUsuario("")).toBeUndefined();
  });
});

describe("dotación de la hoja", () => {
  it("reemplaza a la de demostración y descarta filas sin correo o sin nombre", () => {
    fijarDotacion([
      { correo: " Colega@Hospital.cl ", nombre: "Colega Reemplazo", turno: "REEMPLAZO", rol: "" },
      { correo: "jefa@hospital.cl", nombre: "Jefa", turno: "SUBROGANCIA", rol: "coordinacion" },
      { correo: "", nombre: "Sin correo" },
      { correo: "malo", nombre: "Correo malo" },
      { correo: "x@y.cl", nombre: "" }
    ]);
    expect(dotacion().map((p) => p.correo)).toEqual(["colega@hospital.cl", "jefa@hospital.cl"]);
    expect(buscarUsuario("colega reemplazo")?.correo).toBe("colega@hospital.cl");
    expect(buscarProfesional("JEFA@hospital.cl")?.rol).toBe("COORDINACION");
    expect(buscarProfesional(CORREO_DEMO)).toBeUndefined();
  });
});
