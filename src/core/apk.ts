/**
 * Modulo APK digital — Autorizacion de Procedimiento Kinesico.
 *
 * UNA POR TURNO. La pauta se firma una vez por turno (dos al dia, por
 * profesionales distintos). Lo firmado ahora vale para los controles siguientes
 * del mismo turno, sin volver a firmar.
 *
 * DECISION DE DISENO (docs/PLAN-MAESTRO.md cap. 6): el toque unico NO marca N
 * criterios individuales como verificados. Un registro que afirma revisiones que
 * quiza nadie hizo, con una firma nominal detras, expone a quien firma. En su
 * lugar registra UNA asercion atestiguada global, con via rapida de excepcion:
 * si un criterio falla, se nombra y la APK queda NO_CUMPLE.
 *
 * Los criterios son la transcripcion de un formato en papel; su contenido es
 * responsabilidad de la jefatura de kinesiologia y debe ratificarse antes de la
 * marcha blanca.
 */

import { esViaAereaArtificial } from "./fisiologia";
import { turnoDe } from "./turnos";
import type { TurnoClave, Uuid, ValidacionApk, ViaAerea } from "./tipos";

/** Al cambiar los criterios se sube la version: lo ya firmado no se reescribe. */
export const VERSION_PAUTA_APK = "2026.1";

export type PerfilApk = "VIA_AEREA_ARTIFICIAL" | "VIA_AEREA_NATURAL";

export interface PautaApk {
  readonly perfil: PerfilApk;
  readonly version: string;
  readonly titulo: string;
  readonly criterios: readonly string[];
}

const PAUTA_ARTIFICIAL: PautaApk = {
  perfil: "VIA_AEREA_ARTIFICIAL",
  version: VERSION_PAUTA_APK,
  titulo: "Pauta APK · Soporte ventilatorio invasivo (TET / TQT)",
  criterios: [
    "Hemodinamia estable: PAM ≥ 65 mmHg y DVA sin escalada en la última hora",
    "Oxigenación suficiente: SpO₂ ≥ 90% con FiO₂ ≤ 60%",
    "PEEP ≤ 12 cmH₂O",
    "Sin arritmia de novo ni isquemia activa",
    "Presión de cuff en rango (20-30 cmH₂O)",
    "Vía aérea permeable, fijación verificada y circuito indemne",
    "Sin sangrado activo de vía aérea ni hemoptisis",
    "PIC < 20 mmHg si existe neuromonitoreo",
    "Sin contraindicación quirúrgica ni tórax abierto"
  ]
};

const PAUTA_NATURAL: PautaApk = {
  perfil: "VIA_AEREA_NATURAL",
  version: VERSION_PAUTA_APK,
  titulo: "Pauta APK · Vía aérea natural",
  criterios: [
    "Hemodinamia estable: PAM ≥ 65 mmHg sin DVA en ascenso",
    "Oxigenación suficiente con el soporte actual (SpO₂ ≥ 90%)",
    "Estado de conciencia que permite el procedimiento",
    "Tos efectiva o asistencia de la tos disponible",
    "Sin riesgo de aspiración no controlado",
    "Sin broncoespasmo severo activo",
    "Sin contraindicación quirúrgica reciente"
  ]
};

/** La pauta se discrimina por la via aerea del episodio: sin llenado redundante. */
export function pautaApk(via: ViaAerea): PautaApk {
  return esViaAereaArtificial(via) ? PAUTA_ARTIFICIAL : PAUTA_NATURAL;
}

export interface DatosFirmaApk {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly via: ViaAerea;
  readonly rutAutor: string;
  readonly ahora: Date;
  readonly observacion?: string;
}

function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Firma de cumplimiento con un toque: una asercion global atestiguada. */
export function firmarApkCumple(datos: DatosFirmaApk): ValidacionApk {
  const pauta = pautaApk(datos.via);
  return {
    id: datos.id,
    episodioId: datos.episodioId,
    turno: turnoDe(datos.ahora).clave,
    hora: horaDe(datos.ahora),
    registradoEn: datos.ahora.toISOString(),
    rutAutor: datos.rutAutor,
    versionPauta: pauta.version,
    perfil: pauta.perfil,
    resultado: "CUMPLE",
    criteriosNoCumplidos: [],
    observacion: datos.observacion ?? ""
  };
}

/** Via de excepcion: se nombran los criterios que impidieron el procedimiento. */
export function firmarApkNoCumple(
  datos: DatosFirmaApk,
  criteriosNoCumplidos: readonly string[]
): ValidacionApk {
  return { ...firmarApkCumple(datos), resultado: "NO_CUMPLE", criteriosNoCumplidos: [...criteriosNoCumplidos] };
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

/** APK vigente ahora: la del turno en curso. Lo firmado vale para los controles siguientes. */
export function apkVigente(
  apks: readonly ValidacionApk[],
  episodioId: Uuid,
  ahora: Date
): ValidacionApk | null {
  return apkDelTurno(apks, episodioId, turnoDe(ahora).clave);
}

/** Con una APK "no cumple" vigente, la kinesiterapia respiratoria queda diferida. */
export function kineRespiratoriaPermitida(apk: ValidacionApk | null): boolean {
  return apk === null || apk.resultado === "CUMPLE";
}

/** Texto exacto que queda atestiguado: se muestra antes de firmar. */
export function textoAsercionApk(v: ValidacionApk, nombreAutor: string): string {
  if (v.resultado === "CUMPLE") {
    return (
      `Declaro haber verificado los criterios de seguridad de la pauta APK ` +
      `(versión ${v.versionPauta}, perfil ${etiquetaPerfil(v.perfil)}) y no ` +
      `encontrar contraindicación para el procedimiento kinésico. ` +
      `${nombreAutor} · ${v.hora} hrs.`
    );
  }
  return (
    `Pauta APK (versión ${v.versionPauta}, perfil ${etiquetaPerfil(v.perfil)}) ` +
    `NO CUMPLE. Criterio(s) que lo impiden: ${v.criteriosNoCumplidos.join("; ")}. ` +
    `Procedimiento kinésico diferido. ${nombreAutor} · ${v.hora} hrs.`
  );
}

export function etiquetaPerfil(perfil: PerfilApk): string {
  return perfil === "VIA_AEREA_ARTIFICIAL" ? "vía aérea artificial" : "vía aérea natural";
}
