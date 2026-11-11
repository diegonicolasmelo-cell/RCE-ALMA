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
    for (const m of ["Servo U", "Savina", "Vela", "Avea", "Meckis", "PB 840", "PB 980", "V60", "Airvo 2", "Humidificador MR850", "NBZ Aerogen"]) {
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

describe("equipos segun la via aerea y la cama", async () => {
  const { equiposParaVia, problemaEquipos, cambioDeVentilador, equiposDeLaCama, equiposDelTraslado, modelosOfrecidos } = await import("./equipos");
  const { aplicarEventoAEpisodio } = await import("./eventos");
  const { unEpisodio, unEvento } = await import("./fixtures");
  const vent = (n: number, enUso: boolean) => ({ tipo: "VENTILADOR" as const, modelo: "Savina", numero: n, enUso });
  const airvo = (enUso: boolean) => ({ tipo: "ALTO_FLUJO" as const, modelo: "Airvo 2", numero: 1, enUso });

  it("ofrece CNAF y V60 con via natural y TQT, no con TET; el ventilador siempre", () => {
    const modelos = (v: "TET" | "TQT" | "NATURAL") => modelosOfrecidos(v).map((d) => d.modelo);
    expect(modelos("TET")).not.toContain("Airvo 2");
    expect(modelos("TET")).not.toContain("V60");
    expect(modelos("TQT")).toEqual(expect.arrayContaining(["Airvo 2", "V60", "Servo U", "PB 980"]));
    expect(modelos("NATURAL")).toEqual(expect.arrayContaining(["Airvo 2", "V60", "Savina", "Humidificador MR850", "NBZ Aerogen"]));
  });

  it("toda cama tiene ventilador; con TET en uso; con via natural no puede estar en uso", () => {
    expect(problemaEquipos([], "NATURAL")).toMatch(/ventilador de la sala/);
    expect(problemaEquipos([vent(1, false)], "TET")).toMatch(/en uso/);
    expect(problemaEquipos([vent(1, true)], "TET")).toBeNull();
    expect(problemaEquipos([vent(1, true)], "NATURAL")).toMatch(/no puede estar en uso/);
    expect(problemaEquipos([vent(1, false), airvo(true)], "NATURAL")).toBeNull();
  });

  it("al pasar a la via, se ordena solo: TET deja el ventilador en uso, natural lo apaga", () => {
    expect(equiposParaVia([vent(1, false)], "TET")[0]!.enUso).toBe(true);
    expect(equiposParaVia([vent(1, true)], "NATURAL")[0]!.enUso).toBe(false);
    expect(equiposParaVia([vent(1, true), airvo(false)], "TET").map((e) => e.modelo)).toEqual(["Savina"]);
  });

  it("cambiar el ventilador pide motivo; cambiar solo su uso, no", () => {
    expect(cambioDeVentilador([vent(1, true)], [vent(2, true)])).toBe(true);
    expect(cambioDeVentilador([vent(1, true)], [vent(1, false), airvo(true)])).toBe(false);
  });

  it("una cama libre recuerda lo que dejo su ultimo paciente, sin uso", () => {
    const viejo = unEpisodio({ id: "v", cama: "UCI-04", activo: false, equipos: [vent(4, true)], egreso: { motivo: "ALTA", en: "2026-11-01T10:00:00.000Z" } });
    expect(equiposDeLaCama("UCI-04", [viejo], [])).toEqual([vent(4, false)]);
    const traslado = unEvento({ tipo: "TRASLADO_CAMA", desde: "UCI-04", hasta: "UCI-09", registradoEn: "2026-11-05T10:00:00.000Z", equiposDejados: [vent(7, false)] } as never);
    expect(equiposDeLaCama("UCI-04", [viejo], [traslado])).toEqual([vent(7, false)]);
  });

  it("al cambiar de cama el paciente toma el ventilador de la nueva, y el uso pasa con el", () => {
    const r = equiposDelTraslado([vent(1, true)], [vent(9, false)]);
    expect(r.equiposNuevos).toEqual([vent(9, true)]);
    expect(r.equiposDejados).toEqual([vent(1, false)]);
    expect(equiposDelTraslado([vent(1, true)], []).equiposNuevos).toEqual([vent(1, true)]);
  });

  it("extubar deja el ventilador sin uso y pone en uso la CNAF de la sala; reintubar lo vuelve a usar", () => {
    const ep = unEpisodio({ viaAereaActual: "TET", equipos: [vent(1, true), { tipo: "HUMIDIFICADOR", modelo: "Humidificador MR850", numero: 1, enUso: true }] });
    const ext = aplicarEventoAEpisodio(ep, unEvento({ tipo: "AUTOEXTUBACION", dispositivo: "CNAF" } as never));
    expect(ext.equipos.find((e) => e.tipo === "VENTILADOR")!.enUso).toBe(false);
    const conAirvo = { ...ext, equipos: [...ext.equipos, airvo(false)] };
    const ext2 = aplicarEventoAEpisodio({ ...conAirvo, viaAereaActual: "TQT" }, unEvento({ tipo: "DECANULACION", dispositivo: "CNAF", accidental: false } as never));
    expect(ext2.equipos.find((e) => e.tipo === "ALTO_FLUJO")!.enUso).toBe(true);
    const re = aplicarEventoAEpisodio(ext, unEvento({ tipo: "REINTUBACION", via: "TET", calibre: "7.5", fijacionCm: "22" } as never));
    expect(re.equipos.find((e) => e.tipo === "VENTILADOR")!.enUso).toBe(true);
  });
});
