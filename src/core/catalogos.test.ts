import { describe, expect, it } from "vitest";
import { CAMAS_UNIDAD, nombreCama, textoEdad } from "./catalogos";

describe("camas de la unidad", () => {
  it("son 18, de UCI-01 a UCI-18", () => {
    expect(CAMAS_UNIDAD).toHaveLength(18);
    expect(CAMAS_UNIDAD[0]).toBe("UCI-01");
    expect(CAMAS_UNIDAD[17]).toBe("UCI-18");
  });
  it("se nombran como en voz alta: Cama 2", () => {
    expect(nombreCama("UCI-02")).toBe("Cama 2");
    expect(nombreCama("UCI-18")).toBe("Cama 18");
    expect(nombreCama("Box A")).toBe("Box A");
  });
  it("la edad que aun no pone el PC se dice pendiente", () => {
    expect(textoEdad(64)).toBe("64 a");
    expect(textoEdad(0)).toBe("edad pendiente");
  });
});
