/**
 * Modulo APK digital — "Pauta de cotejo preparacion del paciente para
 * ejecucion de KTR" (formato del hospital, version 1.2 / 2017).
 *
 * Es transcripcion EXACTA de la hoja en papel: mismas filas, mismo orden, mismo
 * texto (incluidos los "(*)"), misma leyenda. Cada firma llena UNA columna
 * "Fecha" de la hoja: la fecha, una marca por fila y las iniciales de quien
 * ejecuta la KTR. Marcas: "1" = SI, "NA" = no aplica, "0" = NO.
 *
 * UNA POR TURNO (dos al dia, por profesionales distintos). Lo firmado vale para
 * los controles siguientes del mismo turno.
 *
 * Via aerea: con via aerea artificial (ventilado) todo parte en 1. Con via aerea
 * natural, las filas ligadas a lo invasivo y a la alimentacion parten en N/A.
 * Siempre se pueden cambiar una a una antes de firmar. Un "0" deja la APK en
 * NO_CUMPLE y difiere la kinesiterapia respiratoria; "NA" no es incumplimiento.
 */

import { esViaAereaArtificial } from "./fisiologia";
import { turnoDe } from "./turnos";
import type { MarcaApk, TurnoClave, Uuid, ValidacionApk, ViaAerea } from "./tipos";

/** Identifica el formato de papel transcrito. Si cambia la hoja, se sube. */
export const VERSION_PAUTA_APK = "HSP-APK-1.2-2017";

export const TITULO_APK = "PAUTA DE COTEJO PREPARACIÓN DEL PACIENTE PARA EJECUCIÓN DE KTR";
export const LEYENDA_APK = "En cada atributo señale lo siguiente: 1= SI 0= NO o N/A según corresponda";
export const FILA_INICIALES_APK = "Iniciales del profesional que ejecuta KTR";
/** Columnas "Fecha" que trae la hoja impresa. */
export const COLUMNAS_APK = 10;

export interface CriterioApk {
  readonly texto: string;
  /** Ligado a lo invasivo o a la alimentacion: parte en N/A con via aerea natural. */
  readonly invasivo: boolean;
}

/** Orden y texto tal cual el papel. */
export const CRITERIOS_APK: readonly CriterioApk[] = [
  { texto: "Ficha clínica y registros de evolución del paciente disponible. (*)", invasivo: false },
  { texto: "Ausencia de contraindicaciones (*)", invasivo: false },
  { texto: "Materiales necesarios para evaluación, monitoreo y atención del paciente.", invasivo: false },
  { texto: "Se cuenta con los materiales e insumos necesarios", invasivo: false },
  { texto: "Red central de oxígeno y de aspiración funcionando correctamente. (*)", invasivo: false },
  { texto: "Paciente posicionado y monitorizado (saturó metro y/o monitor) (*)", invasivo: false },
  { texto: "Catéteres, drenajes y vía aérea artificial en correcta posición según corresponda", invasivo: true },
  { texto: "Alimentación suspendida (*)", invasivo: true }
];

/** Marcas iniciales segun la via aerea del momento. */
export function marcasPorDefecto(via: ViaAerea): MarcaApk[] {
  const artificial = esViaAereaArtificial(via);
  return CRITERIOS_APK.map((c): MarcaApk => (c.invasivo && !artificial ? "NA" : "1"));
}

/** "Diego Melo" -> "DM". Son las siglas con que hoy se firma a mano. */
export function inicialesDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export interface DatosFirmaApk {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly rutAutor: string;
  readonly siglas: string;
  readonly ahora: Date;
  readonly marcas: readonly MarcaApk[];
  readonly observacion?: string;
}

function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function resultadoDeMarcas(marcas: readonly MarcaApk[]): "CUMPLE" | "NO_CUMPLE" {
  return marcas.includes("0") ? "NO_CUMPLE" : "CUMPLE";
}

/** Firma: congela fecha, marcas e iniciales en un registro inmutable. */
export function firmarApk(datos: DatosFirmaApk): ValidacionApk {
  if (datos.marcas.length !== CRITERIOS_APK.length) {
    throw new Error(`La pauta APK tiene ${CRITERIOS_APK.length} filas; llegaron ${datos.marcas.length} marcas.`);
  }
  return {
    id: datos.id,
    episodioId: datos.episodioId,
    turno: turnoDe(datos.ahora).clave,
    // Fecha del dia en que EMPEZO el turno (la noche del 4 queda con fecha 4, aunque se firme a las 02:00 del 5).
    fecha: turnoDe(datos.ahora).fecha,
    hora: horaDe(datos.ahora),
    registradoEn: datos.ahora.toISOString(),
    rutAutor: datos.rutAutor,
    siglas: datos.siglas.trim().toUpperCase(),
    versionPauta: VERSION_PAUTA_APK,
    marcas: [...datos.marcas],
    resultado: resultadoDeMarcas(datos.marcas),
    observacion: datos.observacion ?? ""
  };
}

/** Atajo: todo segun lo esperado para la via aerea (semillas y pruebas). */
export function firmarApkCumple(datos: Omit<DatosFirmaApk, "marcas"> & { readonly via: ViaAerea }): ValidacionApk {
  const { via, ...resto } = datos;
  return firmarApk({ ...resto, marcas: marcasPorDefecto(via) });
}

/** APK de un episodio en un turno concreto: la ultima registrada. */
export function apkDelTurno(
  apks: readonly ValidacionApk[],
  episodioId: Uuid,
  turno: TurnoClave
): ValidacionApk | null {
  const delTurno = apks
    .filter((a) => a.episodioId === episodioId && a.turno === turno)
    .sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  return delTurno[delTurno.length - 1] ?? null;
}

/**
 * APK vigente ahora: la del turno en curso. Lo firmado vale para todos los controles
 * siguientes del turno. Con `rutAutor`, solo cuenta la firmada por esa persona: cada
 * kinesiologo firma la suya (nadie hace dos turnos el mismo dia).
 */
export function apkVigente(
  apks: readonly ValidacionApk[],
  episodioId: Uuid,
  ahora: Date,
  rutAutor?: string
): ValidacionApk | null {
  const clave = turnoDe(ahora).clave;
  const propias = rutAutor === undefined ? apks : apks.filter((a) => a.rutAutor === rutAutor);
  return apkDelTurno(propias, episodioId, clave);
}

/** Con una APK "no cumple" vigente, la kinesiterapia respiratoria queda diferida. */
export function kineRespiratoriaPermitida(apk: ValidacionApk | null): boolean {
  return apk === null || apk.resultado === "CUMPLE";
}

/** Filas no cumplidas, con el texto de la hoja (para avisos y nota). */
export function criteriosNoCumplidos(v: ValidacionApk): string[] {
  return CRITERIOS_APK.filter((_, i) => v.marcas[i] === "0").map((c) => c.texto);
}

/** Todas las APK de un episodio, de la mas antigua a la mas nueva (una columna cada una). */
export function columnasApk(apks: readonly ValidacionApk[], episodioId: Uuid): ValidacionApk[] {
  return apks.filter((a) => a.episodioId === episodioId).sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
}

/** Firma de las APK de un episodio: cambia cada vez que se firma una nueva. */
export function firmaApk(apks: readonly ValidacionApk[], episodioId: Uuid): string {
  return apks
    .filter((a) => a.episodioId === episodioId)
    .map((a) => a.id)
    .sort()
    .join(",");
}

/**
 * Al dar el alta, la identidad se borra de inmediato solo si la hoja APK final ya esta
 * en la carpeta del PC de respaldo. Sin APK firmadas no hay hoja que esperar.
 */
export function purgaDeIdentidadLista(
  ep: { readonly id: Uuid; readonly apkArchivada: string | null },
  apks: readonly ValidacionApk[]
): boolean {
  const firma = firmaApk(apks, ep.id);
  return firma === "" || ep.apkArchivada === firma;
}
