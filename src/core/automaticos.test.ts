import { describe, expect, it } from "vitest";
import { unControl } from "./fixtures";
import { eventosAutomaticosDelControl } from "./automaticos";

const ctl = (id: string, min: number, infusiones: Record<string, { dosis: number; escalon?: number }>, extra = {}) =>
  unControl({ id, registradoEn: `2026-11-23T10:${String(min).padStart(2, "0")}:00.000Z`, hora: `07:${String(min).padStart(2, "0")}`, infusiones, ...extra });

describe("suspensión de sedación y de BNM, automática al guardar el control", () => {
  it("con sedantes antes y ninguno ahora: suspensión de sedación, con los fármacos y la hora del control", () => {
    const antes = ctl("c1", 0, { fentanilo: { dosis: 1.2 }, propofol: { dosis: 1 } });
    const ahora = ctl("c2", 30, {});
    const ev = eventosAutomaticosDelControl(ahora, [antes, ahora]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ tipo: "SUSPENSION_SEDACION", id: "c2-sed", hora: "07:30", farmacos: ["Fentanilo", "Propofol"] });
  });

  it("bajar la dosis o cambiar de sedante no es suspensión", () => {
    const antes = ctl("c1", 0, { fentanilo: { dosis: 1.2 } });
    expect(eventosAutomaticosDelControl(ctl("c2", 30, { fentanilo: { dosis: 0.6 } }), [antes])).toEqual([]);
    expect(eventosAutomaticosDelControl(ctl("c3", 30, { dexmedetomidina: { dosis: 0.4 } }), [antes])).toEqual([]);
  });

  it("con BNM antes y sin BNM ahora: fin del bloqueo neuromuscular (la sedación sigue)", () => {
    const antes = ctl("c1", 0, { fentanilo: { dosis: 1.2 }, rocuronio: { dosis: 0.5 } });
    const ev = eventosAutomaticosDelControl(ctl("c2", 30, { fentanilo: { dosis: 1.2 } }), [antes]);
    expect(ev.map((e) => e.tipo)).toEqual(["FIN_BNM"]);
  });

  it("se suspenden las dos cosas a la vez: dos eventos", () => {
    const antes = ctl("c1", 0, { midazolam: { dosis: 0.05 }, rocuronio: { dosis: 0.5 } });
    expect(eventosAutomaticosDelControl(ctl("c2", 30, {}), [antes]).map((e) => e.tipo)).toEqual(["SUSPENSION_SEDACION", "FIN_BNM"]);
  });

  it("el primer control del episodio y una corrección no generan nada", () => {
    expect(eventosAutomaticosDelControl(ctl("c1", 0, {}), [])).toEqual([]);
    const antes = ctl("c1", 0, { fentanilo: { dosis: 1.2 } });
    expect(eventosAutomaticosDelControl(ctl("c2", 30, {}, { corrige: "c1" }), [antes])).toEqual([]);
  });

  it("se compara con el control vigente: si el anterior fue corregido, manda la corrección", () => {
    const original = ctl("c1", 0, { fentanilo: { dosis: 1.2 } });
    const correccion = ctl("c1b", 10, {}, { corrige: "c1" });
    expect(eventosAutomaticosDelControl(ctl("c2", 30, {}), [original, correccion])).toEqual([]);
  });
});
