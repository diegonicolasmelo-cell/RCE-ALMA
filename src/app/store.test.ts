import { describe, expect, it } from "vitest";
import { temaEfectivo } from "./store";

describe("apariencia dia / noche", () => {
  it("en automatico sigue al turno", () => {
    expect(temaEfectivo("auto", "DIA")).toBe("light");
    expect(temaEfectivo("auto", "NOCHE")).toBe("dark");
  });
  it("la eleccion de la persona manda sobre el turno", () => {
    expect(temaEfectivo("dia", "NOCHE")).toBe("light");
    expect(temaEfectivo("noche", "DIA")).toBe("dark");
  });
});
