/**
 * Calculo de variables fisiologicas derivadas.
 *
 * Todas son funciones puras sobre el control. Ningun derivado se almacena:
 * guardarlos seria garantizar que algun dia queden desincronizados del dato
 * que los origino. Ver docs/PLAN-MAESTRO.md cap. 4.5.
 */

import { PCF_CORTE_EXITO, PCF_CORTE_OPTIMO } from "./catalogos";
import { validezMecanicaEstatica } from "./validez";
import type { Control, Glasgow, Medicion, Sexo, ViaAerea } from "./tipos";

export function esViaAereaArtificial(via: ViaAerea): boolean {
  return via === "TET" || via === "TQT";
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Peso corporal predicho (formula de Devine). Base de la ventilacion protectora. */
export function calcularPbw(tallaCm: number, sexo: Sexo): number {
  const base = sexo === "F" ? 45.5 : 50;
  const pbw = base + 0.91 * (tallaCm - 152.4);
  // Piso de seguridad: una talla mal tipeada no debe producir un Vt/kg absurdo.
  return redondear(Math.max(pbw, 30), 1);
}

/** Presion arterial media. */
export function calcularPam(pas: Medicion, pad: Medicion): number | null {
  if (pas === null || pad === null || pas <= pad) return null;
  return Math.round(pad + (pas - pad) / 3);
}

/** Presion de perfusion cerebral. Requiere neuromonitoreo (PIC). */
export function calcularPpc(pam: number | null, pic: Medicion): number | null {
  if (pam === null || pic === null) return null;
  return Math.round(pam - pic);
}

// ---------------------------------------------------------------------------
// Glasgow condicionado por via aerea
// ---------------------------------------------------------------------------

export interface GlasgowCalculado {
  readonly intubado: boolean;
  readonly ocular: number;
  readonly verbal: number | "NT";
  readonly motora: number;
  readonly total: number;
  readonly maximo: string;
  /** "11T" o "15". */
  readonly display: string;
  /** "8T/11T (O3 V:NT M4)". */
  readonly completo: string;
}

/**
 * Con via aerea artificial el componente verbal no es testeable: se reporta NT
 * y el total se expresa sobre 11T. Reportar un verbal numerico en un paciente
 * intubado es un error metodologico clasico.
 */
export function calcularGlasgow(glasgow: Glasgow, via: ViaAerea): GlasgowCalculado {
  const intubado = esViaAereaArtificial(via);
  const verbalEfectivo = intubado ? 1 : glasgow.verbal;
  const total = glasgow.ocular + verbalEfectivo + glasgow.motora;

  const desglose = intubado
    ? `O${glasgow.ocular} V:NT M${glasgow.motora}`
    : `O${glasgow.ocular} V${glasgow.verbal} M${glasgow.motora}`;

  return {
    intubado,
    ocular: glasgow.ocular,
    verbal: intubado ? "NT" : glasgow.verbal,
    motora: glasgow.motora,
    total,
    maximo: intubado ? "11T" : "15",
    display: intubado ? `${total}T` : `${total}`,
    completo: `${intubado ? `${total}T` : total}/${intubado ? "11T" : "15"} (${desglose})`
  };
}

// ---------------------------------------------------------------------------
// Mecanica ventilatoria e indices de destete
// ---------------------------------------------------------------------------

export type SemaforoPcf = "SIN_DATO" | "INSUFICIENTE" | "LIMITE" | "OPTIMO";

/** Flujo pico de tos frente al corte institucional de exito de extubacion. */
export function semaforoPcf(pcf: Medicion): SemaforoPcf {
  if (pcf === null) return "SIN_DATO";
  if (pcf < PCF_CORTE_EXITO) return "INSUFICIENTE";
  if (pcf < PCF_CORTE_OPTIMO) return "LIMITE";
  return "OPTIMO";
}

export interface DerivadosControl {
  readonly pbw: number;
  readonly pam: number | null;
  readonly ppc: number | null;
  /** Driving pressure. `null` si el candado de mecanica la invalida. */
  readonly drivingPressure: number | null;
  /** Compliance estatica. `null` si el candado de mecanica la invalida. */
  readonly compliance: number | null;
  readonly vtPorKg: number | null;
  /** Indice de Tobin (RSBI) = FR / Vt en litros. */
  readonly tobin: number | null;
  /** Indice ROX = (SpO2/FiO2) / FR. Solo en soporte no invasivo. */
  readonly rox: number | null;
  readonly glasgow: GlasgowCalculado;
  readonly semaforoPcf: SemaforoPcf;
  /** Por que la mecanica estatica quedo bloqueada, si corresponde. */
  readonly leyendaMecanica: string | null;
}

/**
 * Calcula todos los derivados de un control, respetando el candado de mecanica.
 *
 * `pbw` se pasa como argumento porque depende del episodio (talla y sexo), no
 * del control: asi la funcion se mantiene pura y sin acceso a otra entidad.
 */
export function calcularDerivados(control: Control, pbw: number): DerivadosControl {
  const { soporte } = control;

  const pam = calcularPam(control.pas, control.pad);
  const ppc = calcularPpc(pam, control.pic);

  const validez = validezMecanicaEstatica(soporte);

  let drivingPressure: number | null = null;
  let compliance: number | null = null;

  if (validez.valido && soporte.pPlateau !== null && soporte.peep !== null) {
    const dp = soporte.pPlateau - soporte.peep;
    if (dp > 0) {
      drivingPressure = redondear(dp, 1);
      if (soporte.vt !== null && soporte.vt > 0) {
        compliance = redondear(soporte.vt / dp, 1);
      }
    }
  }

  const vtPorKg =
    soporte.vt !== null && soporte.vt > 0 && pbw > 0 ? redondear(soporte.vt / pbw, 1) : null;

  const tobin =
    soporte.tipo === "VMI" && soporte.vt !== null && soporte.vt > 0 && soporte.fr !== null && soporte.fr > 0
      ? Math.round(soporte.fr / (soporte.vt / 1000))
      : null;

  const rox =
    soporte.tipo !== "VMI" &&
    control.spo2 !== null &&
    soporte.fio2 !== null &&
    soporte.fio2 > 0 &&
    soporte.fr !== null &&
    soporte.fr > 0
      ? redondear(control.spo2 / (soporte.fio2 / 100) / soporte.fr, 2)
      : null;

  return {
    pbw,
    pam,
    ppc,
    drivingPressure,
    compliance,
    vtPorKg,
    tobin,
    rox,
    glasgow: calcularGlasgow(control.glasgow, control.viaAerea),
    semaforoPcf: semaforoPcf(control.esfuerzo?.pcf ?? null),
    leyendaMecanica: validez.leyenda
  };
}
