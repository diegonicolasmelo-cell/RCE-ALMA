import { describe, expect, it } from "vitest";
import { SECCIONES_SALA, dejarEnSala, equipoDeInventario, equipoParaDibujar, nombreRce, numeroValido, rangoNumeroEquipo, salaAlElegir, tipoDeCategoria, usarEnSala } from "./sala";
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

describe("sala con el inventario del RCE (25-nov-2026)", () => {
  const mek = { nombre: "Mek 12", categoria: "VM", ubicacion: "BODEGA", cama: null, enUso: false, estado: "Operativo" };
  const v60 = { nombre: "V60 Nº1", categoria: "VNI", ubicacion: "PASILLO", cama: null, enUso: false, estado: "Operativo" };
  it("el equipo de la sala lleva el nombre EXACTO del RCE", () => {
    expect(equipoDeInventario(mek)).toEqual({ tipo: "VENTILADOR", modelo: "Mek 12", numero: null, enUso: false });
    expect(nombreRce(equipoDeInventario(v60))).toBe("V60 Nº1");
    expect(tipoDeCategoria("APOYO", "Aerogen 2")).toBe("NEBULIZADOR");
  });
  it("tocar lo deja en la sala sin uso; con TET conectado y sin soporte, entra en uso", () => {
    expect(dejarEnSala([], mek, "TQT", false)[0]!.enUso).toBe(false);
    expect(dejarEnSala([], mek, "TET", true)[0]!.enUso).toBe(true);
    expect(dejarEnSala([equipoDeInventario(mek)], mek, "TET", true)).toHaveLength(1);
  });
  it("otro toque lo pone en uso y apaga los demás soportes", () => {
    const sala = [equipoDeInventario(mek, true), { tipo: "VENTILADOR" as const, modelo: "Savina 2", numero: null, enUso: false }];
    expect(usarEnSala(sala, sala[1]!).map((x) => x.enUso)).toEqual([false, true]);
  });
});
