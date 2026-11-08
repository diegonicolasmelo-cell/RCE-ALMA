import { describe, expect, it } from "vitest";
import { contieneDatoIdentificable } from "./sanitizar";
import {
  CAMAS_UNIDAD,
  VENTANAS_VENTILADORES,
  altaVentilador,
  camaDeEpisodio,
  derivarInventario,
  diaIso,
  equiposEfectivos,
  enCama,
  enZona,
  estadoPrestamo,
  etiquetaVentilador,
  fechaDiaMes,
  hayPrestamosAtrasados,
  idVentilador,
  moverVentilador,
  movimientoVentiladorDeNube,
  serializarMovimientoParaNube,
  ventiladorEnCama,
  ventiladoresEnZona
} from "./ventiladores";
import type { ContextoMovimiento, MovimientoVentilador, Ventilador } from "./ventiladores";

const HOY = new Date(2026, 10, 7, 10, 0);

function ctx(minutos = 0): ContextoMovimiento {
  let n = 0;
  return { rutAutor: "16.452.891-K", ahora: new Date(HOY.getTime() + minutos * 60_000), nuevoId: () => `m${minutos}-${n++}` };
}

/** Arma un inventario aplicando altas y movimientos, como lo haria la app. */
function inventario(...altas: readonly [Parameters<typeof altaVentilador>[1], number, ReturnType<typeof enCama>][]): {
  movs: MovimientoVentilador[];
  inv: readonly Ventilador[];
} {
  const movs: MovimientoVentilador[] = [];
  let min = 0;
  for (const [modelo, numero, destino] of altas) {
    const r = altaVentilador(derivarInventario(movs), modelo, numero, destino, ctx(min++));
    if (!r.ok) throw new Error(r.mensaje);
    movs.push(...r.movimientos);
  }
  return { movs, inv: derivarInventario(movs) };
}

describe("nombres", () => {
  it("el nombre es modelo y número", () => {
    expect(etiquetaVentilador("PB840", 1)).toBe("PB840 1");
    expect(etiquetaVentilador("MEKICS_EVO5", 2)).toBe("Mekics Evo 5 2");
    expect(idVentilador("SAVINA300", 1)).toBe("SAVINA300-1");
  });

  it("la unidad tiene 18 camas y cinco ventanas que las cubren una sola vez", () => {
    expect(CAMAS_UNIDAD).toHaveLength(18);
    const enVentanas = VENTANAS_VENTILADORES.flatMap((v) => v.camas);
    expect([...enVentanas].sort((a, b) => Number(a) - Number(b))).toEqual(CAMAS_UNIDAD);
    expect(VENTANAS_VENTILADORES).toHaveLength(5);
    expect(VENTANAS_VENTILADORES.flatMap((v) => v.zonas).sort()).toEqual(["BODEGA", "FUERA", "MANTENCION", "PASILLO"]);
  });
});

describe("inventario derivado de los movimientos", () => {
  it("manda el último movimiento de cada equipo", () => {
    const { movs } = inventario(["PB840", 1, enCama("2")]);
    const r = moverVentilador(derivarInventario(movs), "PB840-1", enZona("PASILLO"), {}, ctx(30));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inv = derivarInventario([...movs, ...r.movimientos]);
    expect(inv).toHaveLength(1);
    expect(inv[0]?.ubicacion).toEqual(enZona("PASILLO"));
  });

  it("el orden de llegada no importa: converge igual (dos celulares)", () => {
    const { movs } = inventario(["PB840", 1, enCama("2")]);
    const r = moverVentilador(derivarInventario(movs), "PB840-1", enCama("5"), {}, ctx(30));
    if (!r.ok) throw new Error(r.mensaje);
    const todos = [...movs, ...r.movimientos];
    expect(derivarInventario([...todos].reverse())).toEqual(derivarInventario(todos));
  });

  it("dos celulares que dan de alta el mismo equipo no lo duplican", () => {
    const a = altaVentilador([], "VELA", 1, enZona("BODEGA"), ctx(1));
    const b = altaVentilador([], "VELA", 1, enZona("BODEGA"), ctx(2));
    if (!a.ok || !b.ok) throw new Error("alta");
    expect(derivarInventario([...a.movimientos, ...b.movimientos])).toHaveLength(1);
  });

  it("consulta por cama y por zona", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")], ["AVEA", 1, enZona("PASILLO")]);
    expect(ventiladorEnCama(inv, "2")?.etiqueta).toBe("PB840 1");
    expect(ventiladorEnCama(inv, "3")).toBeNull();
    expect(ventiladoresEnZona(inv, "PASILLO").map((v) => v.etiqueta)).toEqual(["Avea 1"]);
  });
});

describe("alta", () => {
  it("rechaza un modelo repetido, una cama ocupada y un destino que exige datos", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")]);
    expect(altaVentilador(inv, "PB840", 1, enZona("BODEGA"), ctx(5))).toMatchObject({ ok: false, error: "YA_ESTA_AHI" });
    expect(altaVentilador(inv, "PB980", 1, enCama("2"), ctx(5))).toMatchObject({ ok: false, error: "CAMA_OCUPADA" });
    expect(altaVentilador(inv, "PB980", 1, enZona("FUERA"), ctx(5))).toMatchObject({ ok: false, error: "UBICACION_INVALIDA" });
    expect(altaVentilador(inv, "PB980", 0, enZona("BODEGA"), ctx(5))).toMatchObject({ ok: false });
    expect(altaVentilador(inv, "PB980", 1, enCama("19"), ctx(5))).toMatchObject({ ok: false, error: "UBICACION_INVALIDA" });
  });
});

describe("mover", () => {
  it("no mueve a donde ya está ni algo que no existe", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")]);
    expect(moverVentilador(inv, "PB840-1", enCama("2"), {}, ctx(5))).toMatchObject({ ok: false, error: "YA_ESTA_AHI" });
    expect(moverVentilador(inv, "VELA-9", enCama("3"), {}, ctx(5))).toMatchObject({ ok: false, error: "NO_EXISTE" });
    expect(moverVentilador(inv, "PB840-1", enCama("40"), {}, ctx(5))).toMatchObject({ ok: false, error: "UBICACION_INVALIDA" });
  });

  it("el resumen dice hacia dónde fue y qué quedó en su lugar", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")], ["PB980", 1, enCama("8")]);
    const r = moverVentilador(inv, "PB840-1", enCama("8"), {}, ctx(10));
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.resumen).toBe("PB840 1 pasó a la cama 8. PB980 1 quedó en la cama 2.");
    const z = moverVentilador(inv, "PB840-1", enZona("PASILLO"), {}, ctx(10));
    if (!z.ok) throw new Error(z.mensaje);
    expect(z.resumen).toBe("PB840 1 pasó al pasillo.");
  });

  it("cama ocupada: se intercambian y quedan dos movimientos con la misma hora", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")], ["PB980", 1, enCama("8")]);
    const r = moverVentilador(inv, "PB840-1", enCama("8"), {}, ctx(10));
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.movimientos).toHaveLength(2);
    expect(new Set(r.movimientos.map((m) => m.registradoEn)).size).toBe(1);
    const nuevo = derivarInventario([...inv.map(aMov), ...r.movimientos]);
    expect(ventiladorEnCama(nuevo, "8")?.etiqueta).toBe("PB840 1");
    expect(ventiladorEnCama(nuevo, "2")?.etiqueta).toBe("PB980 1");
  });

  it("cama ocupada con origen en bodega: el que estaba vuelve a la bodega", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")], ["PB980", 1, enZona("BODEGA")]);
    const r = moverVentilador(inv, "PB980-1", enCama("2"), {}, ctx(10));
    if (!r.ok) throw new Error(r.mensaje);
    const nuevo = derivarInventario([...inv.map(aMov), ...r.movimientos]);
    expect(ventiladoresEnZona(nuevo, "BODEGA").map((v) => v.etiqueta)).toEqual(["PB840 1"]);
  });

  it("desde mantención o préstamo no se intercambia: hay que mover primero el de la cama", () => {
    const { inv } = inventario(["PB840", 1, enCama("2")], ["PB980", 1, enZona("BODEGA")]);
    const m = moverVentilador(inv, "PB980-1", enZona("MANTENCION"), { nota: "Falla de turbina" }, ctx(10));
    if (!m.ok) throw new Error(m.mensaje);
    const enTaller = derivarInventario([...inv.map(aMov), ...m.movimientos]);
    expect(moverVentilador(enTaller, "PB980-1", enCama("2"), {}, ctx(20))).toMatchObject({ ok: false, error: "CAMA_OCUPADA" });
  });
});

describe("mantención", () => {
  it("lleva una nota libre y la pierde al salir de mantención", () => {
    const { inv } = inventario(["SERVO_U", 1, enCama("3")]);
    const a = moverVentilador(inv, "SERVO_U-1", enZona("MANTENCION"), { nota: "  Servicio técnico, sensor de flujo  " }, ctx(10));
    if (!a.ok) throw new Error(a.mensaje);
    expect(a.movimientos[0]?.nota).toBe("Servicio técnico, sensor de flujo");
    const enTaller = derivarInventario([...inv.map(aMov), ...a.movimientos]);
    expect(enTaller[0]?.nota).toBe("Servicio técnico, sensor de flujo");
    const b = moverVentilador(enTaller, "SERVO_U-1", enZona("BODEGA"), { nota: "ignorada" }, ctx(20));
    if (!b.ok) throw new Error(b.mensaje);
    expect(b.movimientos[0]?.nota).toBe("");
  });

  it("la nota puede quedar vacía, pero no pasar del largo máximo", () => {
    const { inv } = inventario(["SERVO_U", 1, enCama("3")]);
    expect(moverVentilador(inv, "SERVO_U-1", enZona("MANTENCION"), {}, ctx(10)).ok).toBe(true);
    expect(moverVentilador(inv, "SERVO_U-1", enZona("MANTENCION"), { nota: "x".repeat(201) }, ctx(10))).toMatchObject({
      ok: false,
      error: "NOTA_MUY_LARGA"
    });
  });
});

describe("préstamo a otro servicio", () => {
  const inv = inventario(["SAVINA300", 1, enZona("BODEGA")]).inv;
  const ok = { servicio: "Pabellón", salida: "2026-11-04", retorno: "2026-11-09" };

  it("exige servicio, las dos fechas y un retorno que no sea anterior a la salida", () => {
    expect(moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), {}, ctx(5))).toMatchObject({ ok: false, error: "FALTA_SERVICIO" });
    expect(moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), { prestamo: { ...ok, servicio: "  " } }, ctx(5))).toMatchObject({
      ok: false,
      error: "FALTA_SERVICIO"
    });
    expect(moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), { prestamo: { ...ok, retorno: "" } }, ctx(5))).toMatchObject({
      ok: false,
      error: "FECHA_INVALIDA"
    });
    expect(moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), { prestamo: { ...ok, retorno: "2026-11-01" } }, ctx(5))).toMatchObject({
      ok: false,
      error: "RETORNO_ANTES_DE_SALIDA"
    });
  });

  it("guarda el préstamo y lo borra cuando el equipo vuelve", () => {
    const a = moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), { prestamo: ok }, ctx(5));
    if (!a.ok) throw new Error(a.mensaje);
    const afuera = derivarInventario([...inv.map(aMov), ...a.movimientos]);
    expect(afuera[0]?.prestamo).toEqual(ok);
    const b = moverVentilador(afuera, "SAVINA300-1", enZona("BODEGA"), {}, ctx(50));
    if (!b.ok) throw new Error(b.mensaje);
    expect(derivarInventario([...afuera.map(aMov), ...b.movimientos])[0]?.prestamo).toBeNull();
  });

  it("el aviso es verde, amarillo o rojo según el retorno", () => {
    expect(estadoPrestamo({ ...ok, retorno: "2026-11-10" }, HOY)).toMatchObject({ nivel: "OK", dias: 3, texto: "Vuelve en 3 d" });
    expect(estadoPrestamo({ ...ok, retorno: "2026-11-07" }, HOY)).toMatchObject({ nivel: "HOY", texto: "Vuelve hoy" });
    expect(estadoPrestamo({ ...ok, retorno: "2026-11-06" }, HOY)).toMatchObject({ nivel: "ATRASADO", dias: -1, texto: "Atrasado 1 d" });
  });

  it("cruza bien el fin de mes y de año", () => {
    const fin = new Date(2026, 11, 30, 23, 59);
    expect(estadoPrestamo({ ...ok, retorno: "2027-01-02" }, fin).dias).toBe(3);
    expect(diaIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("avisa si hay algún equipo prestado y atrasado", () => {
    const a = moverVentilador(inv, "SAVINA300-1", enZona("FUERA"), { prestamo: { ...ok, retorno: "2026-11-06" } }, ctx(5));
    if (!a.ok) throw new Error(a.mensaje);
    const afuera = derivarInventario([...inv.map(aMov), ...a.movimientos]);
    expect(hayPrestamosAtrasados(afuera, HOY)).toBe(true);
    expect(hayPrestamosAtrasados(afuera, new Date(2026, 10, 5))).toBe(false);
    expect(hayPrestamosAtrasados(inv, HOY)).toBe(false);
  });

  it("muestra la fecha corta día-mes", () => expect(fechaDiaMes("2026-11-04")).toBe("04-11"));
});

describe("cama del episodio y equipos de la nota", () => {
  it("traduce 'UCI-05' a la cama 5 del inventario", () => {
    expect(camaDeEpisodio("UCI-05")).toBe("5");
    expect(camaDeEpisodio("UCI-18")).toBe("18");
    expect(camaDeEpisodio("7")).toBe("7");
  });

  it("el ventilador del inventario manda sobre el antiguo y se conserva el resto", () => {
    const { inv } = inventario(["MEKICS_EVO5", 2, enCama("13")]);
    const viejos = [
      { tipo: "VENTILADOR" as const, modelo: "Savina", numero: 1, enUso: true },
      { tipo: "HUMIDIFICADOR" as const, modelo: "Humidificador MR850", numero: 1, enUso: true }
    ];
    const r = equiposEfectivos(viejos, ventiladorEnCama(inv, "13"));
    expect(r.map((e) => `${e.modelo} ${e.numero}`)).toEqual(["Humidificador MR850 1", "Mekics Evo 5 2"]);
    expect(r.find((e) => e.tipo === "VENTILADOR")?.enUso).toBe(true);
  });

  it("sin ventilador en el inventario, quedan los equipos del episodio tal cual", () => {
    const viejos = [{ tipo: "VENTILADOR" as const, modelo: "Savina", numero: 1, enUso: true }];
    expect(equiposEfectivos(viejos, null)).toBe(viejos);
  });
});

describe("lo que sube a la nube", () => {
  const { movs } = inventario(["PB840", 1, enCama("2")]);
  const salida = moverVentilador(derivarInventario(movs), "PB840-1", enZona("FUERA"), {
    prestamo: { servicio: "Urgencia", salida: "2026-11-07", retorno: "2026-11-09" }
  }, ctx(5));

  it("no lleva ningún dato de paciente", () => {
    if (!salida.ok) throw new Error(salida.mensaje);
    for (const m of [...movs, ...salida.movimientos]) expect(contieneDatoIdentificable(serializarMovimientoParaNube(m))).toEqual([]);
  });

  it("ida y vuelta sin pérdida", () => {
    if (!salida.ok) throw new Error(salida.mensaje);
    for (const m of [...movs, ...salida.movimientos]) {
      expect(movimientoVentiladorDeNube(JSON.parse(JSON.stringify(serializarMovimientoParaNube(m))))).toEqual(m);
    }
  });

  it("una fila corrupta o editada a mano se descarta", () => {
    const base = serializarMovimientoParaNube(movs[0]!);
    expect(movimientoVentiladorDeNube(null)).toBeNull();
    expect(movimientoVentiladorDeNube({ ...base, modelo: "INVENTADO" })).toBeNull();
    expect(movimientoVentiladorDeNube({ ...base, numero: 0 })).toBeNull();
    expect(movimientoVentiladorDeNube({ ...base, hasta: { tipo: "CAMA", cama: "99" } })).toBeNull();
    expect(movimientoVentiladorDeNube({ ...base, hasta: { tipo: "ZONA", zona: "TECHO" } })).toBeNull();
    expect(movimientoVentiladorDeNube({ ...base, id: "" })).toBeNull();
  });
});

/** Reconstruye el movimiento que dejo un ventilador en su lugar actual (para encadenar pruebas). */
function aMov(v: Ventilador): MovimientoVentilador {
  return {
    id: `base-${v.id}`,
    ventiladorId: v.id,
    modelo: v.modelo,
    numero: v.numero,
    hasta: v.ubicacion,
    nota: v.nota,
    prestamo: v.prestamo,
    registradoEn: v.desde,
    rutAutor: v.rutAutor
  };
}
