import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { CATEGORIAS_REM, consolidarRemMensual } from "@core/index";
import { unControl, unEpisodio } from "../core/fixtures";
import { FILA_BS, FILA_CATEGORIA, FILA_EGRESO, nombreArchivoRem, rellenarRem } from "./remExcel";

const plantilla = new Uint8Array(readFileSync(fileURLToPath(new URL("./rem28-plantilla.xlsx", import.meta.url))));

/** Valor de una celda: numero, texto en linea o texto compartido. */
async function leer(zip: JSZip, hoja: string): Promise<(ref: string) => string | null> {
  const xml = await zip.file(hoja)!.async("string");
  const compartidos = [...(await zip.file("xl/sharedStrings.xml")!.async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")
  );
  return (ref) => {
    const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
    if (!m || !m[2]) return null;
    if (/t="s"/.test(m[1]!)) return compartidos[Number(/<v>(\d+)<\/v>/.exec(m[2])![1])] ?? null;
    return /<v>([^<]*)<\/v>/.exec(m[2])?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(m[2])?.[1] ?? null;
  };
}

describe("planilla REM 28 en Excel", () => {
  it("cada fila del mapa apunta a la etiqueta correcta de la planilla", async () => {
    const a = await leer(await JSZip.loadAsync(plantilla), "xl/worksheets/sheet1.xml");
    for (const c of CATEGORIAS_REM) expect(a(`A${FILA_CATEGORIA[c]}`)?.trim(), c).toBe(c);
    expect(a(`A${FILA_EGRESO.ALTA}`)).toBe("Egresos por alta");
    expect(a(`A${FILA_EGRESO.FALLECIMIENTO}`)).toBe("Egresos por fallecimiento");
    expect(a(`A${FILA_EGRESO.OTROS}`)).toBe("Otros");
    expect(a("A89")).toBe("Ejercicios terapéuticos");
    expect(a("A109")).toBe("Terapia respiratoria y funcional pulmonar");
    for (const ref of ["A51", "A63", "A74"]) expect(a(ref)).toBe("Kinesiólogo/a");
    const bs = await leer(await JSZip.loadAsync(plantilla), "xl/worksheets/sheet2.xml");
    expect(bs(`A${FILA_BS.evaluacionIntegral}`)).toBe("0601101");
    expect(bs(`A${FILA_BS.atencionIntegralUpc}`)).toBe("0601104");
    expect(bs(`A${FILA_BS.reeducacionMotriz}`)).toBe("0601024");
    expect(bs(`A${FILA_BS.permeabilizacionViaAerea}`)).toBe("0601030");
    expect(bs(`A${FILA_BS.asistenciaIotCanula}`)).toBe("0601171");
  });

  it("la plantilla viene en blanco y sin nombres ni vinculos externos", async () => {
    const zip = await JSZip.loadAsync(plantilla);
    const todo = (await Promise.all(Object.values(zip.files).filter((f) => !f.dir).map((f) => f.async("string")))).join("");
    expect(todo).not.toMatch(/Fabi|Le[oó]n|upc\.adulto|UPC ADULTO 6|ESTADISTICA|externalLink/);
    const a = await leer(zip, "xl/worksheets/sheet1.xml");
    expect(a("S12")).toBe("0");
    expect(a("W74")).toBe("0");
  });

  it("escribe el mes en las celdas de datos y deja intactas las formulas", async () => {
    const ep = unEpisodio({ id: "a", sexo: "M", rangoEdad: "60–64", categoriaRem: "Enfermedades respiratorias", ingresadoEn: "2026-11-03T15:00:00.000Z", activo: false, egreso: { motivo: "ALTA", en: "2026-11-09T15:00:00.000Z" } });
    const base = unControl();
    const controles = new Map([["a", [{ ...base, episodioId: "a", registradoEn: "2026-11-04T12:00:00.000Z", terapiaFisica: { ...base.terapiaFisica, estado: "REALIZADA" as const } }]]]);
    const r = consolidarRemMensual("2026-11", [ep], controles, new Map());
    const zip = await JSZip.loadAsync(await rellenarRem(plantilla, r));
    const a = await leer(zip, "xl/worksheets/sheet1.xml");
    expect(a("A4")).toBe("MES: NOVIEMBRE (11)");
    expect(a("A5")).toBe("AÑO: 2026");
    // 60-64 es el rango 13: hombres en la columna AC.
    expect(a("AC12")).toBe("1");
    expect(a("AC26")).toBe("1");
    expect(a("AN12")).toBe("1");
    expect(a("AC42")).toBe("1");
    expect(a("O51")).toBe("1");
    expect(a("W51")).toBe("1");
    expect(a("O74")).toBe("1");
    expect(a("B89")).toBe("1");
    expect(a("B109")).toBe("1");
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(xml).toContain(">SUM(C12:D12)</f>");
    expect(xml).not.toMatch(/<c r="B12"[^>]*><v>/);
    const bs = await leer(zip, "xl/worksheets/sheet2.xml");
    expect(bs("E5")).toBe("1");
    expect(bs("H5")).toBe("1");
    expect(bs("F5")).toBe("0");
    expect(nombreArchivoRem("2026-11")).toBe("REM28_KINESIOLOGIA_UCI_ADULTO_NOVIEMBRE_2026.xlsx");
  });
});
