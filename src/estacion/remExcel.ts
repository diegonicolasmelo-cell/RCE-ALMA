/**
 * Rellena la planilla REM 28 de la unidad (copia fiel del archivo que entrega estadistica).
 *
 * La plantilla es el archivo original en blanco: mismas hojas, celdas combinadas, estilos,
 * formulas de totales y reglas de comprobacion. Se le quitaron los nombres de quien la armo,
 * la ruta del disco del hospital y el vinculo externo (en otro equipo pedia "actualizar
 * vinculos"). Aqui solo se escriben las celdas de datos; los totales los calcula Excel al
 * abrir (fullCalcOnLoad).
 */

import JSZip from "jszip";
import { RANGOS_EDAD } from "@core/index";
import type { CategoriaRem, FilaRango, FilaSexoRango, MotivoEgreso, RemMensual } from "@core/index";

const HOJA_A = "xl/worksheets/sheet1.xml";
const HOJA_BS = "xl/worksheets/sheet2.xml";

/** Fila de cada categoria en la seccion B.1 de la hoja "REM A". */
export const FILA_CATEGORIA: Readonly<Record<CategoriaRem, number>> = {
  "Ataque cerebro vascular (ACV)": 14,
  "Traumatismo encéfalo craneano (TEC)": 15,
  "Lesión medular": 16,
  "Neuromusculares agudas": 17,
  "Neuromusculares crónicas": 18,
  "Otras neurológicas": 20,
  "COVID-19": 25,
  "Enfermedades respiratorias": 26,
  "Enfermedades cardíacas": 27,
  Traumatológicos: 31,
  "Otros pre y post quirúrgicos": 32,
  Oncológicos: 33,
  Genitourinarias: 34,
  Amputación: 35,
  Quemados: 36,
  Otros: 40
};

export const FILA_EGRESO: Readonly<Record<MotivoEgreso, number>> = { ALTA: 42, FALLECIMIENTO: 44, OTROS: 46 };

/** Filas de la hoja "REM BS" (codigos de prestacion). */
export const FILA_BS = { evaluacionIntegral: 5, atencionIntegralUpc: 7, reeducacionMotriz: 41, permeabilizacionViaAerea: 44, asistenciaIotCanula: 46 } as const;

const NOMBRE_MES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** 1 -> A, 27 -> AA. */
export function columna(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const escaparXml = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Reemplaza el contenido de una celda que ya existe en la plantilla, conservando su estilo. */
function escribir(xml: string, ref: string, contenido: { numero: number } | { texto: string }): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) throw new Error(`La plantilla del REM no tiene la celda ${ref}`);
  if (/<f[ >]/.test(m[0])) throw new Error(`La celda ${ref} es una fórmula de la plantilla: no se escribe`);
  const estilo = /\ss="\d+"/.exec(m[1] ?? "")?.[0] ?? "";
  const nueva = "numero" in contenido
    ? `<c r="${ref}"${estilo}><v>${contenido.numero}</v></c>`
    : `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(contenido.texto)}</t></is></c>`;
  return xml.slice(0, m.index) + nueva + xml.slice(m.index + m[0].length);
}

/** Las celdas a escribir: referencia -> valor. Separado del XML para poder probarlo. */
export function celdasRem(r: RemMensual): { readonly a: ReadonlyMap<string, number | string>; readonly bs: ReadonlyMap<string, number> } {
  const a = new Map<string, number | string>();
  const bs = new Map<string, number>();
  const [anio, mm] = r.mes.split("-");
  a.set("A4", `MES: ${NOMBRE_MES[Number(mm) - 1]} (${mm})`);
  a.set("A5", `AÑO: ${anio}`);

  // B.1: hombres y mujeres por rango desde la columna E; tipo de atencion cerrada UPC en AN.
  const filaB1 = (fila: number, f: FilaSexoRango): void => {
    RANGOS_EDAD.forEach((g, i) => {
      a.set(`${columna(5 + 2 * i)}${fila}`, f.porRango[g].hombres);
      a.set(`${columna(6 + 2 * i)}${fila}`, f.porRango[g].mujeres);
    });
    a.set(`AN${fila}`, f.total - f.sinRango);
  };
  filaB1(12, r.ingresos);
  // Todo ingreso a la UCI tiene plan de tratamiento integral.
  filaB1(13, r.ingresos);
  for (const [c, fila] of Object.entries(FILA_CATEGORIA) as [CategoriaRem, number][]) filaB1(fila, r.ingresosPorCategoria[c]);
  for (const [m, fila] of Object.entries(FILA_EGRESO) as [MotivoEgreso, number][]) filaB1(fila, r.egresosPorMotivo[m]);

  // B.2 a B.4: kinesiologo/a por rango desde la columna C; cerrada UPC en W.
  const filaRango = (fila: number, f: FilaRango): void => {
    RANGOS_EDAD.forEach((g, i) => a.set(`${columna(3 + i)}${fila}`, f.porRango[g]));
    a.set(`W${fila}`, f.total - f.sinRango);
  };
  filaRango(51, r.evaluacionInicial);
  filaRango(63, r.evaluacionIntermedia);
  filaRango(74, r.sesionesMotoras);

  // B.6
  a.set("B89", r.ejerciciosTerapeuticos);
  a.set("B109", r.terapiaRespiratoria);

  // BS: una atencion por persona; todo es MAI (beneficiarios FONASA) y atencion cerrada.
  for (const [k, fila] of Object.entries(FILA_BS) as [keyof typeof FILA_BS, number][]) {
    bs.set(`E${fila}`, r.bs[k]);
    bs.set(`H${fila}`, r.bs[k]);
  }
  return { a, bs };
}

/** Devuelve el .xlsx del mes a partir de la plantilla en blanco. */
export async function rellenarRem(plantilla: Uint8Array, r: RemMensual): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(plantilla);
  const { a, bs } = celdasRem(r);
  let xa = await zip.file(HOJA_A)!.async("string");
  for (const [ref, v] of a) xa = escribir(xa, ref, typeof v === "number" ? { numero: v } : { texto: v });
  let xbs = await zip.file(HOJA_BS)!.async("string");
  for (const [ref, v] of bs) xbs = escribir(xbs, ref, { numero: v });
  zip.file(HOJA_A, xa);
  zip.file(HOJA_BS, xbs);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function nombreArchivoRem(mes: string): string {
  const [anio, mm] = mes.split("-");
  return `REM28_KINESIOLOGIA_UCI_ADULTO_${NOMBRE_MES[Number(mm) - 1]}_${anio}.xlsx`;
}
