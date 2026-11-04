import { describe, expect, it } from "vitest";
import { turnoDe } from "./turnos";

/** Fechas con componentes locales: el turno depende de la hora local. */
const f = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe("turnoDe", () => {
  it("de 08:00 a 19:59 es turno Día de esa fecha", () => {
    const t = turnoDe(f(2026, 11, 4, 9, 30));
    expect(t.tipo).toBe("DIA");
    expect(t.clave).toBe("2026-11-04:DIA");
  });

  it("20:00 es el inicio del turno Noche", () => {
    expect(turnoDe(f(2026, 11, 4, 20, 0)).clave).toBe("2026-11-04:NOCHE");
    expect(turnoDe(f(2026, 11, 4, 19, 59)).clave).toBe("2026-11-04:DIA");
  });

  it("después de medianoche sigue siendo la Noche que empezó el día anterior", () => {
    const t = turnoDe(f(2026, 11, 5, 2, 15));
    expect(t.tipo).toBe("NOCHE");
    expect(t.clave).toBe("2026-11-04:NOCHE");
    expect(t.fecha).toBe("2026-11-04");
  });

  it("a las 07:59 todavía es Noche y a las 08:00 empieza el Día", () => {
    expect(turnoDe(f(2026, 11, 5, 7, 59)).clave).toBe("2026-11-04:NOCHE");
    expect(turnoDe(f(2026, 11, 5, 8, 0)).clave).toBe("2026-11-05:DIA");
  });

  it("cruza bien el cambio de mes", () => {
    expect(turnoDe(f(2026, 12, 1, 1, 0)).clave).toBe("2026-11-30:NOCHE");
  });

  it("dos controles del mismo turno comparten clave", () => {
    expect(turnoDe(f(2026, 11, 4, 21, 0)).clave).toBe(turnoDe(f(2026, 11, 5, 3, 0)).clave);
  });
});
