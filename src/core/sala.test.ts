import { describe, expect, it } from "vitest";
import { SECCIONES_SALA, equipoParaDibujar, numeroValido, rangoNumeroEquipo, salaAlElegir } from "./sala";
import type { EquipoEnSala } from "./tipos";

const savina = (n: number, enUso = true): EquipoEnSala => ({ tipo: "VENTILADOR", modelo: "Savina", numero: n, enUso });

describe("sala en 8 bits", () => {
  it("tres secciones de 6 camas que cubren la unidad sin repetir", () => {
    const todas = SECCIONES_SALA.flatMap((s) => s.camas);
    expect(SECCIONES_SALA.map((s) => s.camas.length)).toEqual([6, 6, 6]);
    expect(new Set(todas).size).toBe(18);
  });
  it("el teclado acepta Meckis 1–20, Vela y el resto 1–10, Servo U sin número", () => {
    expect(rangoNumeroEquipo("Meckis")).toEqual({ min: 1, max: 20 });
    expect(rangoNumeroEquipo("Vela")).toEqual({ min: 1, max: 10 });
    expect(rangoNumeroEquipo("Servo U")).toBeNull();
    expect([numeroValido("Meckis", 20), numeroValido("Savina", 11), numeroValido("Servo U", null), numeroValido("Savina", null)]).toEqual([true, false, true, false]);
  });
  it("elegir otro ventilador lo deja en uso y saca el anterior; lo demás se queda", () => {
    const mr: EquipoEnSala = { tipo: "HUMIDIFICADOR", modelo: "Humidificador MR850", numero: 2, enUso: true };
    const r = salaAlElegir([savina(1), mr], "Vela", 3, "TET");
    expect(r).toEqual([mr, { tipo: "VENTILADOR", modelo: "Vela", numero: 3, enUso: true }]);
  });
  it("con vía aérea natural un ventilador entra a la sala sin uso", () => {
    expect(salaAlElegir([], "Savina", 2, "NATURAL")).toEqual([savina(2, false)]);
  });
  it("un número fuera de rango no cambia nada", () => {
    expect(salaAlElegir([savina(1)], "Savina", 14, "TET")).toEqual([savina(1)]);
  });
  it("se dibuja el que da el soporte", () => {
    expect(equipoParaDibujar([savina(1, false), savina(2)])?.numero).toBe(2);
    expect(equipoParaDibujar([])).toBeNull();
  });
});
