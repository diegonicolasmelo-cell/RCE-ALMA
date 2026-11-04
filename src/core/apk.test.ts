import { describe, expect, it } from "vitest";
import {
  COLUMNAS_APK,
  CRITERIOS_APK,
  apkDelTurno,
  apkVigente,
  criteriosNoCumplidos,
  firmarApk,
  firmarApkCumple,
  inicialesDe,
  kineRespiratoriaPermitida,
  marcasPorDefecto
} from "./apk";
import { documentoApkHtml, fechaCorta } from "./apk-documento";
import type { MarcaApk } from "./tipos";
import { turnoDe } from "./turnos";

const f = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);

const firmar = (id: string, ahora: Date, rut = "16.452.891-K", via: "TET" | "NATURAL" = "TET") =>
  firmarApkCumple({ id, episodioId: "ep-1", via, rutAutor: rut, siglas: "DM", ahora });
const conMarcas = (id: string, ahora: Date, marcas: MarcaApk[]) =>
  firmarApk({ id, episodioId: "ep-1", rutAutor: "x", siglas: "DM", ahora, marcas });

describe("pauta: transcripción exacta de la hoja de papel", () => {
  it("tiene las 8 filas en el orden y con el texto impresos", () => {
    expect(CRITERIOS_APK.map((c) => c.texto)).toEqual([
      "Ficha clínica y registros de evolución del paciente disponible. (*)",
      "Ausencia de contraindicaciones (*)",
      "Materiales necesarios para evaluación, monitoreo y atención del paciente.",
      "Se cuenta con los materiales e insumos necesarios",
      "Red central de oxígeno y de aspiración funcionando correctamente. (*)",
      "Paciente posicionado y monitorizado (saturó metro y/o monitor) (*)",
      "Catéteres, drenajes y vía aérea artificial en correcta posición según corresponda",
      "Alimentación suspendida (*)"
    ]);
    expect(COLUMNAS_APK).toBe(10);
  });
});

describe("marcas según la vía aérea", () => {
  it("vía aérea artificial: todo en 1", () => {
    expect(marcasPorDefecto("TET")).toEqual(Array(8).fill("1"));
    expect(marcasPorDefecto("TQT")).toEqual(Array(8).fill("1"));
  });

  it("vía aérea natural: lo invasivo y la alimentación parten en N/A", () => {
    expect(marcasPorDefecto("NATURAL")).toEqual(["1", "1", "1", "1", "1", "1", "NA", "NA"]);
  });

  it("N/A no es incumplimiento; un 0 sí", () => {
    expect(firmar("a", f(4, 9), "x", "NATURAL").resultado).toBe("CUMPLE");
    const v = conMarcas("b", f(4, 9), ["1", "0", "1", "1", "1", "1", "1", "1"]);
    expect(v.resultado).toBe("NO_CUMPLE");
    expect(criteriosNoCumplidos(v)).toEqual(["Ausencia de contraindicaciones (*)"]);
  });

  it("rechaza un número de marcas distinto al de filas de la hoja", () => {
    expect(() => conMarcas("c", f(4, 9), ["1", "1"])).toThrow();
  });
});

describe("firma", () => {
  it("congela fecha, hora, turno, iniciales y versión del formato", () => {
    const v = firmar("a1", f(4, 9, 5));
    expect(v.fecha).toBe("2026-11-04");
    expect(v.hora).toBe("09:05");
    expect(v.turno).toBe("2026-11-04:DIA");
    expect(v.siglas).toBe("DM");
    expect(v.versionPauta).toBe("HSP-APK-1.2-2017");
    expect(v.rutAutor).toBe("16.452.891-K");
  });

  it("siglas a partir del nombre", () => {
    expect(inicialesDe("Diego Melo")).toBe("DM");
    expect(inicialesDe("Maria Jose Vega")).toBe("MJV");
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

  it("dos al día: cada turno tiene la suya", () => {
    const todas = [apkDia, firmar("a2", f(4, 21, 10), "RUT-NOCHE")];
    expect(apkVigente(todas, "ep-1", f(4, 18))?.rutAutor).toBe("RUT-DIA");
    expect(apkVigente(todas, "ep-1", f(5, 3))?.rutAutor).toBe("RUT-NOCHE");
  });

  it("la noche cruza la medianoche y no mezcla episodios", () => {
    const n = firmar("a3", f(4, 23, 0));
    expect(apkVigente([n], "ep-1", f(5, 3, 0))?.id).toBe("a3");
    expect(apkVigente([apkDia], "ep-OTRO", f(4, 15))).toBeNull();
  });

  it("si hay varias en el turno, vale la última registrada", () => {
    const no = conMarcas("n1", f(4, 10), ["1", "0", "1", "1", "1", "1", "1", "1"]);
    const luego = firmar("c1", f(4, 12));
    expect(apkDelTurno([no, luego], "ep-1", turnoDe(f(4, 13)).clave)?.id).toBe("c1");
    expect(apkDelTurno([luego, no], "ep-1", turnoDe(f(4, 13)).clave)?.id).toBe("c1");
  });
});

describe("kinesiterapia respiratoria y APK", () => {
  it("permitida sin APK registrada o con APK que cumple; diferida si no cumple", () => {
    expect(kineRespiratoriaPermitida(null)).toBe(true);
    expect(kineRespiratoriaPermitida(firmar("a", f(4, 9)))).toBe(true);
    expect(kineRespiratoriaPermitida(conMarcas("n", f(4, 9), ["1", "1", "1", "1", "1", "0", "1", "1"]))).toBe(false);
  });
});

describe("documento: copia fiel de la hoja", () => {
  const base = { runPaciente: "12.345.678-5", servicio: "UCI Adulto" };

  it("reproduce título, encabezado, filas, leyenda y las 10 columnas", () => {
    const html = documentoApkHtml({ ...base, apks: [firmar("a", f(4, 9, 5))] });
    expect(html).toContain("PAUTA DE COTEJO PREPARACIÓN DEL PACIENTE PARA EJECUCIÓN DE KTR");
    expect(html).toContain("Ficha o RUN del paciente:");
    expect(html).toContain("12.345.678-5");
    for (const c of CRITERIOS_APK) expect(html).toContain(c.texto);
    expect(html).toContain("Iniciales del profesional que ejecuta KTR");
    expect(html).toContain("En cada atributo señale lo siguiente: 1= SI 0= NO o N/A según corresponda");
    expect(html.match(/<th>Fecha<\/th>/g)).toHaveLength(10);
  });

  it("rellena la columna con fecha, marcas e iniciales", () => {
    const html = documentoApkHtml({ ...base, apks: [firmar("a", f(4, 9, 5), "x", "NATURAL")] });
    expect(html).toContain("04/11/26");
    expect(html).toContain(">N/A<");
    expect(html).toContain(">DM<");
  });

  it("agrega una página nueva al llenarse las 10 columnas", () => {
    const once = Array.from({ length: 11 }, (_, i) => firmar("a" + i, f(1 + (i % 20), 9, i)));
    expect(documentoApkHtml({ ...base, apks: once }).match(/<section class="hoja/g)).toHaveLength(2);
    expect(documentoApkHtml({ ...base, apks: once.slice(0, 10) }).match(/<section class="hoja/g)).toHaveLength(1);
  });

  it("escapa texto y funciona sin firmas (hoja en blanco)", () => {
    const html = documentoApkHtml({ ...base, runPaciente: "<b>x</b>", apks: [] });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("fecha corta dd/mm/aa", () => {
    expect(fechaCorta("2026-11-04")).toBe("04/11/26");
  });
});
