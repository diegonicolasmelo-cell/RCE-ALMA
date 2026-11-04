/**
 * Documento APK: copia fiel de la hoja de papel "Pauta de cotejo preparacion del
 * paciente para ejecucion de KTR", rellenada con lo firmado en la app.
 *
 * Funcion pura: recibe las firmas y devuelve HTML autocontenido (carta
 * apaisada, una pagina por cada 10 firmas, igual que las 10 columnas "Fecha" de
 * la hoja). El mismo HTML sirve para ver, imprimir, "guardar como PDF" y para el
 * PDF que arma Apps Script en la carpeta de Drive.
 *
 * Lleva RUN del paciente: se arma SOLO en la estacion (canal de identidad), nunca
 * en el celular ni en la hoja clinica.
 */

import { COLUMNAS_APK, CRITERIOS_APK, FILA_INICIALES_APK, LEYENDA_APK, TITULO_APK } from "./apk";
import type { ValidacionApk } from "./tipos";

export interface DatosDocumentoApk {
  readonly apks: readonly ValidacionApk[];
  /** Ficha o RUN del paciente, tal como se escribe a mano. */
  readonly runPaciente: string;
  readonly servicio: string;
  /** Imagenes como data URI (logo Gobierno de Chile y acreditacion). Opcionales. */
  readonly logoIzquierdo?: string;
  readonly logoDerecho?: string;
}

const esc = (t: string): string =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** AAAA-MM-DD -> dd/mm/aa, como se anota a mano en la celda. */
export function fechaCorta(ymd: string): string {
  const [a = "", m = "", d = ""] = ymd.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

const MARCA_TEXTO = { "1": "1", "0": "0", NA: "N/A" } as const;

function pagina(datos: DatosDocumentoApk, lote: readonly ValidacionApk[], ultima: boolean): string {
  const cols = Array.from({ length: COLUMNAS_APK }, (_, i) => lote[i] ?? null);
  const celdas = (f: (a: ValidacionApk) => string, clase = ""): string =>
    cols.map((a) => `<td class="c ${clase}">${a ? esc(f(a)) : ""}</td>`).join("");
  const filas = CRITERIOS_APK.map(
    (c, i) => `<tr class="fila"><td class="act">${esc(c.texto)}</td>${celdas((a) => MARCA_TEXTO[a.marcas[i] ?? "NA"])}</tr>`
  ).join("");
  const img = (src: string | undefined, lado: string): string =>
    src ? `<img class="logo ${lado}" src="${src}" alt="">` : `<span class="logo ${lado}"></span>`;
  return `<section class="hoja${ultima ? " ultima" : ""}">
<div class="cab">${img(datos.logoIzquierdo, "izq")}${img(datos.logoDerecho, "der")}</div>
<h1>${esc(TITULO_APK)}</h1>
<p class="ident"><b>Ficha o RUN del paciente:</b> <span class="sub">${esc(datos.runPaciente)}</span> &nbsp; <b>Servicio:</b> <span class="sub">${esc(datos.servicio)}</span></p>
<table>
<tr class="enc"><th class="act">Actividad</th>${cols.map(() => "<th>Fecha</th>").join("")}</tr>
<tr class="fechas"><td class="act"></td>${celdas((a) => fechaCorta(a.fecha))}</tr>
${filas}
<tr class="fila ini"><td class="act">${esc(FILA_INICIALES_APK)}</td>${celdas((a) => a.siglas)}</tr>
</table>
<p class="ley">${esc(LEYENDA_APK)}</p>
</section>`;
}

export function documentoApkHtml(datos: DatosDocumentoApk): string {
  const ordenadas = [...datos.apks].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const lotes: ValidacionApk[][] = [];
  for (let i = 0; i < ordenadas.length; i += COLUMNAS_APK) lotes.push(ordenadas.slice(i, i + COLUMNAS_APK));
  if (lotes.length === 0) lotes.push([]);
  const paginas = lotes.map((l, i) => pagina(datos, l, i === lotes.length - 1)).join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>APK ${esc(datos.runPaciente)}</title>
<style>
@page{size:letter landscape;margin:.3in .4in}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
.hoja{width:10.04in;height:7.4in;margin:0 auto;padding:0;position:relative;page-break-after:always;break-after:page}
.hoja.ultima{page-break-after:auto;break-after:auto}
.cab{height:.95in;position:relative}
.logo{position:absolute;top:0;height:.9in;width:auto}
.logo.izq{left:.1in}.logo.der{right:.1in}
h1{font-size:14.5px;text-align:center;margin:.05in 0 .3in;font-weight:700}
.ident{text-align:center;font-size:11.5px;margin:0 0 .22in}
.sub{display:inline-block;min-width:1.45in;border-bottom:1px solid #000;text-align:center}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5px}
td,th{border:1px solid #000;padding:0;height:.255in;text-align:center}
col{width:auto}
.act{width:28.5%;text-align:left;padding:0 6px;line-height:.27in}
th.act{text-align:center}
.enc th{font-size:11.5px;height:.235in}
.fechas td{height:.235in;font-size:10px}
.fila td{height:.27in;font-size:13px;font-weight:700}
.fila td.act{font-weight:400;font-size:12.6px}
.fila.ini td{font-size:12px}
.ley{font-size:9.5px;margin:.2in 0 0 .3in}
</style></head><body>
${paginas}
</body></html>`;
}
