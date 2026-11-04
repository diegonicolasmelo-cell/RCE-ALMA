/**
 * Modulo APK digital — Autorizacion de Procedimiento Kinesico.
 *
 * DECISION DE DISENO (docs/PLAN-MAESTRO.md cap. 6)
 * El informe pedia que un clic marcara como verificados todos los puntos de la
 * pauta. No se implementa asi, y la razon es de seguridad del paciente y de
 * exposicion del profesional: un registro que afirma N verificaciones
 * individuales que quiza nadie hizo, con una firma nominal detras, es peor que
 * el papel. Si luego hay un evento adverso y se audita la pauta, el expuesto es
 * quien firmo.
 *
 * En su lugar, el toque unico registra UNA asercion atestiguada global, que es
 * exactamente lo que el profesional hace frente al paciente: revisa la pauta y
 * la aprueba en bloque. Misma velocidad, mismo clic, pero el registro dice la
 * verdad de lo ocurrido. Si un criterio falla, se nombra ese criterio y la APK
 * queda NO_CUMPLE.
 *
 * Los criterios de abajo deben ser revisados y ratificados por la jefatura de
 * kinesiologia de la unidad antes de la marcha blanca: son la transcripcion de
 * un formato en papel y su contenido es responsabilidad clinica, no tecnica.
 */

import { esViaAereaArtificial } from "./fisiologia";
import type { Uuid, ValidacionApk, ViaAerea } from "./tipos";

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
    "Hemodinamia estable: PAM >= 65 mmHg y DVA sin escalada en la ultima hora",
    "Oxigenacion suficiente: SpO2 >= 90% con FiO2 <= 60%",
    "PEEP <= 12 cmH2O",
    "Sin arritmia de novo ni isquemia activa",
    "Presion de cuff en rango (20-30 cmH2O)",
    "Via aerea permeable, fijacion verificada y circuito indemne",
    "Sin sangrado activo de via aerea ni hemoptisis",
    "PIC < 20 mmHg si existe neuromonitoreo",
    "Sin contraindicacion quirurgica ni torax abierto"
  ]
};

const PAUTA_NATURAL: PautaApk = {
  perfil: "VIA_AEREA_NATURAL",
  version: VERSION_PAUTA_APK,
  titulo: "Pauta APK · Via aerea natural",
  criterios: [
    "Hemodinamia estable: PAM >= 65 mmHg sin DVA en ascenso",
    "Oxigenacion suficiente con el soporte actual (SpO2 >= 90%)",
    "Estado de conciencia que permite el procedimiento",
    "Tos efectiva o asistencia de la tos disponible",
    "Sin riesgo de aspiracion no controlado",
    "Sin broncoespasmo severo activo",
    "Sin contraindicacion quirurgica reciente"
  ]
};

/** La pauta se discrimina por la via aerea del episodio: sin llenado redundante. */
export function pautaApk(via: ViaAerea): PautaApk {
  return esViaAereaArtificial(via) ? PAUTA_ARTIFICIAL : PAUTA_NATURAL;
}

export interface DatosFirmaApk {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly controlId: Uuid | null;
  readonly via: ViaAerea;
  readonly rutAutor: string;
  readonly ahora: Date;
  readonly observacion?: string;
}

function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Firma de cumplimiento con un toque: una asercion global atestiguada.
 * No fabrica N verificaciones individuales.
 */
export function firmarApkCumple(datos: DatosFirmaApk): ValidacionApk {
  const pauta = pautaApk(datos.via);
  return {
    id: datos.id,
    episodioId: datos.episodioId,
    controlId: datos.controlId,
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

/**
 * Via de excepcion: se nombran los criterios que impidieron el procedimiento.
 * Dos toques para el caso excepcional, uno para el normal.
 */
export function firmarApkNoCumple(
  datos: DatosFirmaApk,
  criteriosNoCumplidos: readonly string[]
): ValidacionApk {
  const base = firmarApkCumple(datos);
  return {
    ...base,
    resultado: "NO_CUMPLE",
    criteriosNoCumplidos: [...criteriosNoCumplidos]
  };
}

/**
 * Texto exacto que queda atestiguado. Es lo que se muestra al firmar: el
 * profesional debe poder leer que esta declarando antes de tocar el boton.
 */
export function textoAsercionApk(v: ValidacionApk, nombreAutor: string): string {
  if (v.resultado === "CUMPLE") {
    return (
      `Declaro haber verificado los criterios de seguridad de la pauta APK ` +
      `(version ${v.versionPauta}, perfil ${etiquetaPerfil(v.perfil)}) y no ` +
      `encontrar contraindicacion para el procedimiento kinesico. ` +
      `${nombreAutor} · ${v.hora} hrs.`
    );
  }
  return (
    `Pauta APK (version ${v.versionPauta}, perfil ${etiquetaPerfil(v.perfil)}) ` +
    `NO CUMPLE. Criterio(s) que lo impiden: ${v.criteriosNoCumplidos.join("; ")}. ` +
    `Procedimiento kinesico diferido. ${nombreAutor} · ${v.hora} hrs.`
  );
}

export function etiquetaPerfil(perfil: PerfilApk): string {
  return perfil === "VIA_AEREA_ARTIFICIAL" ? "via aerea artificial" : "via aerea natural";
}
