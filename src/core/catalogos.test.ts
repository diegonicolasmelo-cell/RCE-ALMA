import { describe, expect, it } from "vitest";
import { CAMAS_UNIDAD, MODALIDADES_POR_VIA, nombreCama, rangoDeEdad, textoEdad, transicionSoporte } from "./catalogos";

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
  it("guarda rango etario, no la edad exacta, y la que aun no pone el PC se dice pendiente", () => {
    expect(rangoDeEdad(64)).toBe("60–69");
    expect(rangoDeEdad(18)).toBe("18–39");
    expect(rangoDeEdad(80)).toBe("80 o más");
    expect(textoEdad("60–69")).toBe("60–69 años");
    expect(textoEdad(null)).toBe("edad pendiente");
  });
});


describe("modos por vía aérea", () => {
  it("vía natural: solo oxigenoterapia y VNI; TET: ventilatorios y tubo T; TQT: además alto flujo, S/T y AVAPS", () => {
    expect(MODALIDADES_POR_VIA.NATURAL).not.toContain("CPAP_PS");
    expect(MODALIDADES_POR_VIA.NATURAL).toContain("VNI_CPAP");
    expect(MODALIDADES_POR_VIA.TET).toEqual(["ACVC", "PCV", "CPAP_PS", "TUBO_T"]);
    expect(MODALIDADES_POR_VIA.TQT).toEqual(expect.arrayContaining(["CNAF_TQT", "VNI_ST", "AVAPS"]));
  });
  it("de un modo con soporte a uno sin soporte es desvinculación; al revés, reconexión", () => {
    expect(transicionSoporte("CPAP_PS", "TUBO_T", "TET")?.tipo).toBe("DESVINCULACION");
    expect(transicionSoporte("TUBO_T", "ACVC", "TQT")?.tipo).toBe("RECONEXION");
    expect(transicionSoporte("VNI_CPAP", "O2_NARICERA", "NATURAL")?.texto).toBe("Desvinculación de VNI");
    expect(transicionSoporte("ACVC", "CPAP_PS", "TET")).toBeNull();
    expect(transicionSoporte(null, "TUBO_T", "TET")).toBeNull();
  });
});
