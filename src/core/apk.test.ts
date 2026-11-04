import { describe, expect, it } from "vitest";
import {
  apkDelTurno,
  apkVigente,
  firmarApkCumple,
  firmarApkNoCumple,
  kineRespiratoriaPermitida,
  pautaApk,
  textoAsercionApk
} from "./apk";
import { turnoDe } from "./turnos";

const f = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);

const firmar = (id: string, ahora: Date, rut = "16.452.891-K", via: "TET" | "NATURAL" = "TET") =>
  firmarApkCumple({ id, episodioId: "ep-1", via, rutAutor: rut, ahora });

describe("pauta condicional por vía aérea", () => {
  it("pauta completa con soporte invasivo (TET y TQT)", () => {
    expect(pautaApk("TET").perfil).toBe("VIA_AEREA_ARTIFICIAL");
    expect(pautaApk("TQT").perfil).toBe("VIA_AEREA_ARTIFICIAL");
    expect(pautaApk("TET").criterios.some((c) => c.includes("cuff"))).toBe(true);
  });

  it("criterios de vía natural sin llenado redundante", () => {
    const p = pautaApk("NATURAL");
    expect(p.perfil).toBe("VIA_AEREA_NATURAL");
    expect(p.criterios.some((c) => c.includes("cuff"))).toBe(false);
  });
});

/** Decisión de diseño: el toque único NO fabrica N verificaciones individuales. */
describe("firma de cumplimiento con un toque", () => {
  it("registra una aserción global, no una lista de criterios marcados", () => {
    const v = firmar("a1", f(4, 9, 5));
    expect(v.resultado).toBe("CUMPLE");
    expect(v.criteriosNoCumplidos).toEqual([]);
  });

  it("queda atribuida, con hora, versión de pauta y turno", () => {
    const v = firmar("a1", f(4, 9, 5));
    expect(v.rutAutor).toBe("16.452.891-K");
    expect(v.hora).toBe("09:05");
    expect(v.versionPauta).toBe("2026.1");
    expect(v.turno).toBe("2026-11-04:DIA");
  });

  it("guarda el perfil aplicado al momento de firmar", () => {
    expect(firmar("a1", f(4, 9), "x", "NATURAL").perfil).toBe("VIA_AEREA_NATURAL");
  });

  it("la vía de excepción nombra el criterio que impidió el procedimiento", () => {
    const v = firmarApkNoCumple({ id: "a2", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: f(4, 9) }, ["PEEP ≤ 12 cmH₂O"]);
    expect(v.resultado).toBe("NO_CUMPLE");
    expect(v.criteriosNoCumplidos).toEqual(["PEEP ≤ 12 cmH₂O"]);
  });
});

/** Una APK por turno, dos al día, por profesionales distintos. */
describe("una APK por turno: lo firmado vale para los controles siguientes", () => {
  const apkDia = firmar("a1", f(4, 9, 5), "RUT-DIA");

  it("vale más tarde en el mismo turno, sin volver a firmar", () => {
    expect(apkVigente([apkDia], "ep-1", f(4, 15, 40))?.id).toBe("a1");
    expect(apkVigente([apkDia], "ep-1", f(4, 19, 59))?.id).toBe("a1");
  });

  it("NO vale en el turno siguiente: debe firmarla otro profesional", () => {
    expect(apkVigente([apkDia], "ep-1", f(4, 20, 0))).toBeNull();
    expect(apkVigente([apkDia], "ep-1", f(5, 2, 0))).toBeNull();
  });

  it("dos al día: cada turno tiene la suya, de profesionales distintos", () => {
    const apkNoche = firmar("a2", f(4, 21, 10), "RUT-NOCHE");
    const todas = [apkDia, apkNoche];
    expect(apkVigente(todas, "ep-1", f(4, 18))?.rutAutor).toBe("RUT-DIA");
    expect(apkVigente(todas, "ep-1", f(5, 3))?.rutAutor).toBe("RUT-NOCHE");
  });

  it("la noche cruza la medianoche: 23:00 y 03:00 son el mismo turno", () => {
    const n = firmar("a3", f(4, 23, 0));
    expect(apkVigente([n], "ep-1", f(5, 3, 0))?.id).toBe("a3");
  });

  it("no mezcla episodios", () => {
    expect(apkVigente([apkDia], "ep-OTRO", f(4, 15))).toBeNull();
  });

  it("si hay varias en el turno, vale la última registrada", () => {
    const noCumple = firmarApkNoCumple({ id: "n1", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: f(4, 10) }, ["PEEP ≤ 12 cmH₂O"]);
    const luegoCumple = firmar("c1", f(4, 12));
    expect(apkDelTurno([noCumple, luegoCumple], "ep-1", turnoDe(f(4, 13)).clave)?.id).toBe("c1");
    expect(apkDelTurno([luegoCumple, noCumple], "ep-1", turnoDe(f(4, 13)).clave)?.id).toBe("c1");
  });
});

describe("kinesiterapia respiratoria y APK", () => {
  it("permitida sin APK registrada (lo exige la validación aparte) o con APK que cumple", () => {
    expect(kineRespiratoriaPermitida(null)).toBe(true);
    expect(kineRespiratoriaPermitida(firmar("a", f(4, 9)))).toBe(true);
  });

  it("diferida si la APK vigente no cumple", () => {
    const no = firmarApkNoCumple({ id: "n", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: f(4, 9) }, ["Sin sangrado activo de vía aérea ni hemoptisis"]);
    expect(kineRespiratoriaPermitida(no)).toBe(false);
  });
});

describe("textoAsercionApk", () => {
  it("el profesional puede leer exactamente qué declara antes de firmar", () => {
    const t = textoAsercionApk(firmar("a", f(4, 9, 5)), "Klgo. Diego Melo");
    expect(t).toContain("Declaro haber verificado los criterios de seguridad");
    expect(t).toContain("no encontrar contraindicación");
    expect(t).toContain("versión 2026.1");
    expect(t).toContain("Klgo. Diego Melo · 09:05 hrs");
  });

  it("el texto de no cumplimiento deja constancia del procedimiento diferido", () => {
    const no = firmarApkNoCumple({ id: "n", episodioId: "ep-1", via: "TET", rutAutor: "x", ahora: f(4, 9) }, ["hemoptisis"]);
    const t = textoAsercionApk(no, "Klgo. Diego Melo");
    expect(t).toContain("NO CUMPLE");
    expect(t).toContain("Procedimiento kinésico diferido");
  });
});
