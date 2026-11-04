import { describe, expect, it } from "vitest";
import {
  agregarEquipo,
  describirEquipos,
  equipoEnUso,
  equipoEsValido,
  equiposIguales,
  etiquetaEquipo,
  ponerEnUso,
  quitarEquipo
} from "./equipos";
import { CATALOGO_EQUIPOS } from "./catalogos";
import type { EquipoEnSala } from "./tipos";

describe("nombres de equipos", () => {
  it("se nombran por modelo y número: Savina 1, Vela 8, Meckis 3", () => {
    expect(etiquetaEquipo({ tipo: "VENTILADOR", modelo: "Savina", numero: 1, enUso: true })).toBe("Savina 1");
    expect(etiquetaEquipo({ tipo: "VENTILADOR", modelo: "Vela", numero: 8, enUso: true })).toBe("Vela 8");
    expect(etiquetaEquipo({ tipo: "VENTILADOR", modelo: "Meckis", numero: 3, enUso: true })).toBe("Meckis 3");
  });

  it("el Servo U es único: no lleva número", () => {
    expect(etiquetaEquipo({ tipo: "VENTILADOR", modelo: "Servo U", numero: null, enUso: true })).toBe("Servo U");
    expect(equipoEsValido("Servo U", null)).toBe(true);
    expect(equipoEsValido("Servo U", 2)).toBe(false);
  });

  it("los demás modelos exigen un número entero positivo", () => {
    expect(equipoEsValido("Savina", 1)).toBe(true);
    expect(equipoEsValido("Savina", null)).toBe(false);
    expect(equipoEsValido("Savina", 0)).toBe(false);
    expect(equipoEsValido("Savina", 1.5)).toBe(false);
  });

  it("el catálogo incluye los equipos que dijo la unidad", () => {
    const modelos = CATALOGO_EQUIPOS.map((e) => e.modelo);
    for (const m of ["Servo U", "Savina", "Vela", "Avea", "Meckis", "PB 840", "PB 980", "B60", "Humidificador MR850", "NBZ Aerogen"]) {
      expect(modelos).toContain(m);
    }
  });

  it("un modelo desconocido no es válido", () => expect(equipoEsValido("Inventado", 1)).toBe(false));
});

describe("equipos de la sala", () => {
  it("el primer ventilador que entra queda en uso; los accesorios no compiten por el soporte", () => {
    let l: readonly EquipoEnSala[] = [];
    l = agregarEquipo(l, "Vela", 8);
    l = agregarEquipo(l, "Humidificador MR850", 2);
    expect(l[0]?.enUso).toBe(true);
    expect(equipoEnUso(l)?.modelo).toBe("Vela");
  });

  it("conviven ventilador pesado, liviano y humidificador en una misma unidad", () => {
    let l: readonly EquipoEnSala[] = [];
    l = agregarEquipo(l, "Servo U", null);
    l = agregarEquipo(l, "Savina", 1);
    l = agregarEquipo(l, "Humidificador MR850", 2);
    expect(l).toHaveLength(3);
    // El segundo ventilador queda en la sala sin uso.
    expect(l.filter((e) => e.tipo === "VENTILADOR" && e.enUso)).toHaveLength(1);
  });

  it("no duplica el mismo equipo ni agrega uno inválido", () => {
    const l = agregarEquipo([], "Vela", 8);
    expect(agregarEquipo(l, "Vela", 8)).toHaveLength(1);
    expect(agregarEquipo(l, "Savina", null)).toBe(l);
  });

  it("ponerEnUso deja un solo soporte activo", () => {
    let l: readonly EquipoEnSala[] = agregarEquipo(agregarEquipo([], "Vela", 8), "Savina", 1);
    l = ponerEnUso(l, l[1]!);
    expect(equipoEnUso(l)?.modelo).toBe("Savina");
    expect(l.filter((e) => e.enUso)).toHaveLength(1);
  });

  it("quitar un equipo no toca los demás", () => {
    const l = agregarEquipo(agregarEquipo([], "Vela", 8), "Savina", 1);
    expect(quitarEquipo(l, l[0]!).map(etiquetaEquipo)).toEqual(["Savina 1"]);
  });

  it("compara conjuntos sin importar el orden", () => {
    const a = agregarEquipo(agregarEquipo([], "Vela", 8), "Savina", 1);
    expect(equiposIguales(a, [a[1]!, a[0]!])).toBe(true);
    expect(equiposIguales(a, [a[0]!])).toBe(false);
  });

  it("describe el estado para la nota", () => {
    const l = agregarEquipo(agregarEquipo([], "Vela", 8), "Humidificador MR850", 2);
    expect(describirEquipos(l)).toBe("Vela 8 (en uso) · Humidificador MR850 2");
    expect(describirEquipos([])).toBe("sin equipos registrados");
  });
});
