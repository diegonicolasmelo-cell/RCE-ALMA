/**
 * Lista de pacientes del día para imprimir (28-nov-2026, Diego: «el médico jefe solo mira el APK, anota
 * en un papel y manda un correo»). Una hoja carta con una fila por cama ocupada y una columna ancha EN
 * BLANCO para lo que el médico escribe a mano. Sale en blanco y negro (la impresora de la unidad).
 *
 * Función pura: recibe las filas ya armadas y devuelve HTML autocontenido. Nunca lleva RUT; el nombre
 * solo si el RCE lo mandó al celular (vive en memoria).
 */

export interface FilaListaDia {
  readonly cama: string;
  readonly nombre: string;
  readonly edad: number | null;
  readonly diaEstadia: number | null;
  /** «TOT · VM 3 d», «Natural · O2»… */
  readonly via: string;
  /** «10:40 · VCV · FiO2 40 · PEEP 8 · SpO2 95», o «sin controles». */
  readonly ultimo: string;
  /** «Cumple 09:40 DM», «No cumple», «Pendiente». */
  readonly apk: string;
  readonly alertas: readonly string[];
}

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function listaDelDiaHtml(filas: readonly FilaListaDia[], cuando: string, turno: string): string {
  const cuerpo = filas.length
    ? filas.map((f) => `<tr>
<td class="cama">${esc(f.cama)}</td>
<td><b>${esc(f.nombre || "—")}</b>${f.edad ? ` · ${f.edad} a` : ""}${f.diaEstadia !== null ? `<br><span class="m">Día ${f.diaEstadia}</span>` : ""}</td>
<td>${esc(f.via)}</td>
<td>${esc(f.ultimo)}</td>
<td class="${/^No cumple/.test(f.apk) ? "neg" : ""}">${esc(f.apk)}</td>
<td>${f.alertas.map(esc).join("<br>")}</td>
<td class="nota"></td>
</tr>`).join("\n")
    : `<tr><td colspan="7" class="m">Sin pacientes en la unidad.</td></tr>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Pacientes UCI ${esc(cuando)}</title>
<style>
@page{size:letter landscape;margin:.35in}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:11px}
h1{font-size:15px;margin:0 0 2px}
.sub{margin:0 0 8px;font-size:11px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #000;padding:4px 5px;vertical-align:top;text-align:left;word-wrap:break-word}
th{font-size:10.5px;background:#fff}
tr{page-break-inside:avoid}
.cama{font-weight:800;font-size:13px;text-align:center}
.m{font-size:10px}
.neg{font-weight:800}
.nota{height:52px}
</style></head><body>
<h1>Pacientes UCI · ${esc(cuando)} · Turno ${esc(turno)}</h1>
<p class="sub">Generado desde Kaptus. La columna «Notas» queda en blanco para escribir a mano.</p>
<table>
<colgroup><col style="width:5%"><col style="width:16%"><col style="width:12%"><col style="width:20%"><col style="width:10%"><col style="width:12%"><col style="width:25%"></colgroup>
<tr><th>Cama</th><th>Paciente</th><th>Vía aérea</th><th>Último control</th><th>APK</th><th>Alertas</th><th>Notas</th></tr>
${cuerpo}
</table>
</body></html>`;
}
