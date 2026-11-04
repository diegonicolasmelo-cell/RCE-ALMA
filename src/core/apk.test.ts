import { describe, expect, it } from "vitest";
import { firmarApkCumple, firmarApkNoCumple, pautaApk, textoAsercionApk } from "./apk";

const DATOS = {
  id: "apk-1",
  episodioId: "ep-1",
  controlId: "ct-1",
  rutAutor: "16.452.891-K",
  ahora: new Date("2026-11-04T16:45:00.000Z")
};

describe("pauta condicional por via aerea", () => {
  it("aplica la pauta completa con soporte invasivo", () => {
    const p = pautaApk("TET");
    expect(p.perfil).toBe("VIA_AEREA_ARTIFICIAL");
    expect(p.criterios.some((c) => c.includes("cuff"))).toBe(true);
  });

  it("aplica el mismo perfil invasivo en TQT", () => {
    expect(pautaApk("TQT").perfil).toBe("VIA_AEREA_ARTIFICIAL");
  });

  it("aplica criterios de via aerea natural sin llenado redundante", () => {
    const p = pautaApk("NATURAL");
    expect(p.perfil).toBe("VIA_AEREA_NATURAL");
    expect(p.criterios.some((c) => c.includes("cuff"))).toBe(false);
    expect(p.criterios.some((c) => c.includes("Tos efectiva"))).toBe(true);
  });
});

/**
 * Decision de diseno: el toque unico NO fabrica N verificaciones individuales.
 * Registra una asercion global atestiguada. Ver docs/PLAN-MAESTRO.md cap. 6.
 */
describe("firma de cumplimiento con un toque", () => {
  it("registra una asercion global, no una lista de criterios marcados", () => {
    const v = firmarApkCumple({ ...DATOS, via: "TET" });
    expect(v.resultado).toBe("CUMPLE");
    expect(v.criteriosNoCumplidos).toEqual([]);
  });

  it("deja la firma atribuida y con hora", () => {
    const v = firmarApkCumple({ ...DATOS, via: "TET" });
    expect(v.rutAutor).toBe("16.452.891-K");
    expect(v.hora).toMatch(/^\d{2}:\d{2}$/);
    expect(v.registradoEn).toBe("2026-11-04T16:45:00.000Z");
  });

  it("guarda la version de la pauta: un cambio futuro no reescribe lo ya firmado", () => {
    expect(firmarApkCumple({ ...DATOS, via: "TET" }).versionPauta).toBe("2026.1");
  });

  it("guarda el perfil aplicado al momento de firmar", () => {
    expect(firmarApkCumple({ ...DATOS, via: "NATURAL" }).perfil).toBe("VIA_AEREA_NATURAL");
  });
});

describe("via de excepcion", () => {
  it("nombra el criterio que impidio el procedimiento", () => {
    const v = firmarApkNoCumple({ ...DATOS, via: "TET" }, ["PEEP <= 12 cmH2O"]);
    expect(v.resultado).toBe("NO_CUMPLE");
    expect(v.criteriosNoCumplidos).toEqual(["PEEP <= 12 cmH2O"]);
  });
});

describe("textoAsercionApk", () => {
  it("el profesional puede leer exactamente que declara antes de firmar", () => {
    const texto = textoAsercionApk(firmarApkCumple({ ...DATOS, via: "TET" }), "Klgo. Diego Melo");
    expect(texto).toContain("Declaro haber verificado los criterios de seguridad");
    expect(texto).toContain("no encontrar contraindicacion");
    expect(texto).toContain("version 2026.1");
    expect(texto).toContain("Klgo. Diego Melo");
  });

  it("el texto de no cumplimiento deja constancia del procedimiento diferido", () => {
    const v = firmarApkNoCumple({ ...DATOS, via: "TET" }, ["Sin sangrado activo de via aerea ni hemoptisis"]);
    const texto = textoAsercionApk(v, "Klgo. Diego Melo");
    expect(texto).toContain("NO CUMPLE");
    expect(texto).toContain("Procedimiento kinesico diferido");
    expect(texto).toContain("hemoptisis");
  });
});
