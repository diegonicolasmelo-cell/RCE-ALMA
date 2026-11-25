import { describe, expect, it } from "vitest";
import { SECCIONES_SALA, dejarEnSala, equipoDeInventario, equipoParaDibujar, nombreRce, numeroValido, rangoNumeroEquipo, salaAlElegir, tipoDeCategoria, usarEnSala } from "./sala";
import type { EquipoEnSala } from "./tipos";
import { aplicarEventoAEpisodio } from "./eventos";
import { unEpisodio, unEvento } from "./fixtures";
import { segmentosSala } from "./sala";

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

describe("la vía aérea manda sobre el uso, no al revés (25-nov-2026)", () => {
  const inv = (nombre: string, categoria: string) => ({ nombre, categoria, ubicacion: "BODEGA", cama: null, enUso: false, estado: "" });
  it("un cambio de equipos NO cambia la vía aérea", () => {
    const ep = unEpisodio({ viaAereaActual: "TET" });
    const r = aplicarEventoAEpisodio(ep, unEvento({ tipo: "CAMBIO_EQUIPOS", equipos: [{ tipo: "VMNI", modelo: "V60 Nº1", numero: null, enUso: false }] } as never));
    expect(r.viaAereaActual).toBe("TET");
  });
  it("con TET, un V60 y un Airvo esperan en la sala SIN USO junto al ventilador en uso", () => {
    let sala = dejarEnSala([], inv("Savina 2", "VM"), "TET", true);
    sala = dejarEnSala(sala, inv("V60 Nº1", "VNI"), "TET", true);
    sala = dejarEnSala(sala, inv("Airvo 1", "CNAF"), "TET", true);
    expect(sala.map((e) => [e.modelo, e.enUso])).toEqual([["Savina 2", true], ["V60 Nº1", false], ["Airvo 1", false]]);
  });
  it("hasta 4 equipos; el cuadro se parte en 1, 2 o 4", () => {
    let sala: readonly EquipoEnSala[] = [];
    for (const n of ["A 1", "A 2", "A 3", "A 4", "A 5"]) sala = dejarEnSala(sala, inv(n, "APOYO"), "NATURAL", false);
    expect(sala).toHaveLength(4);
    expect([0, 1, 2, 3, 4].map(segmentosSala)).toEqual([1, 1, 2, 4, 4]);
  });
});

describe("anular un evento (coordinación, 25-nov-2026)", () => {
  it("el evento anulado y la marca dejan de contar; los demás quedan", async () => {
    const { sinAnulados } = await import("./eventos");
    const reint = unEvento({ id: "ev-r", tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22" } as never);
    const otra = unEvento({ id: "ev-k", tipo: "IMT" } as never);
    const anula = unEvento({ id: "ev-a", tipo: "ANULACION_EVENTO", anulaId: "ev-r", motivo: "anotada por error" } as never);
    expect(sinAnulados([reint, otra, anula]).map((e) => e.id)).toEqual(["ev-k"]);
  });
});
