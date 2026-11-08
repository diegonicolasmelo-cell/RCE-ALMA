import { describe, expect, it } from "vitest";
import { DOTACION, buscarProfesional, buscarUsuario, tituloProfesional } from "./dotacion";

describe("dotación", () => {
  it("son los 16 profesionales de los cuatro turnos, la coordinación y los reemplazos", () => {
    expect(DOTACION).toHaveLength(16);
    expect(DOTACION.filter((p) => p.turno === "T3").map((p) => p.nombre)).toEqual(["Eduardo Gonzalez", "Diego Melo", "Karen Gonzalez"]);
    expect(DOTACION.filter((p) => p.rol === "COORDINACION")).toHaveLength(2);
  });

  it("el login acepta el RUT con puntos, sin puntos, sin guion y con k minúscula", () => {
    for (const rut of ["16.452.891-K", "16452891-K", "16452891K", "16.452.891-k", "  16452891-k "]) {
      expect(buscarProfesional(rut)?.nombre, rut).toBe("Diego Melo");
    }
  });

  it("un RUT que no está en la dotación no entra", () => {
    expect(buscarProfesional("12.345.678-5")).toBeUndefined();
    expect(buscarProfesional("")).toBeUndefined();
  });

  it("el título profesional para la nota", () => {
    expect(tituloProfesional(buscarProfesional("16452891-K")!)).toBe("Klgo. Diego Melo");
  });
});

describe("usuario por nombre o RUT", () => {
  it("encuentra por nombre sin importar tildes ni mayúsculas", () => {
    expect(buscarUsuario("diego melo")?.rut).toBe("16.452.891-K");
    expect(buscarUsuario(" DiegoNicolas.Melo@gmail.com ")?.rut).toBe("16.452.891-K");
    expect(buscarUsuario("otro@gmail.com")).toBeUndefined();
    expect(buscarUsuario("  María  José Vega ")?.nombre).toBe("Maria Jose Vega");
  });
  it("también por RUT", () => {
    expect(buscarUsuario("16452891k")?.nombre).toBe("Diego Melo");
  });
  it("no adivina si es ambiguo o no existe", () => {
    expect(buscarUsuario("Gonzalez")).toBeUndefined();
    expect(buscarUsuario("Nadie Aqui")).toBeUndefined();
    expect(buscarUsuario("")).toBeUndefined();
  });
});
