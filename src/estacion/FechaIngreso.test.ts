import { describe, expect, it } from "vitest";
import { aLocal, validarIngreso } from "./FechaIngreso";

describe("corregir la hora de ingreso a la UCI", () => {
  const ahora = new Date(2026, 10, 10, 15, 0);
  it("acepta una hora pasada y la guarda en ISO", () => {
    const r = validarIngreso("2026-11-10T02:00", ahora);
    expect("iso" in r && new Date(r.iso).getHours()).toBe(2);
  });
  it("rechaza el futuro, lo de hace más de 120 días y lo vacío", () => {
    expect(validarIngreso("2026-11-10T18:00", ahora)).toEqual({ error: "El ingreso no puede quedar en el futuro." });
    expect("error" in validarIngreso("2026-06-01T10:00", ahora)).toBe(true);
    expect("error" in validarIngreso("", ahora)).toBe(true);
  });
  it("muestra la hora local en el campo", () => {
    expect(aLocal(new Date(2026, 10, 10, 2, 30).toISOString())).toBe("2026-11-10T02:30");
  });
});
