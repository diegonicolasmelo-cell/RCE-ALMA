/**
 * Candado de mecanica ventilatoria.
 *
 * Si la modalidad es controlada (ACVC o PCV) y el paciente esta asincronico, la
 * presion plateau esta contaminada por esfuerzo muscular activo. En ese caso
 * plateau, driving pressure y compliance estatica NO son datos imperfectos: son
 * datos falsos.
 *
 * Esta es la UNICA fuente de verdad de esa regla. La consumen la UI, la nota
 * para ALMA y el REM 28, de modo que la pantalla no puede mostrar una compliance
 * que la nota oficial contradiga.
 */

import { MODALIDADES_CONTROLADAS } from "./tipos";
import type { Modalidad, Ventilacion } from "./tipos";

export type MotivoInvalidez = "NO_APLICA" | "ASINCRONIA_EN_MODO_CONTROLADO" | "SIN_DATO";

export interface Validez {
  readonly valido: boolean;
  readonly motivo: MotivoInvalidez | null;
  /** Texto corto para mostrar en lugar del valor bloqueado. */
  readonly leyenda: string | null;
}

export function esModalidadControlada(m: Modalidad): boolean {
  return MODALIDADES_CONTROLADAS.includes(m);
}

export type OrigenPresion = "PLATEAU" | "PICO";

export interface PresionParaDriving {
  readonly valor: number;
  readonly origen: OrigenPresion;
}

/**
 * Presion con la que se calcula la driving pressure.
 *
 * ACVC: solo plateau (meseta). PCV: algunos ventiladores miden plateau y otros
 * no lo permiten; en ese caso se usa la presion pico (ΔP = P. pico - PEEP).
 */
export function presionParaDriving(v: Ventilacion): PresionParaDriving | null {
  if (v.modalidad === "ACVC") {
    return v.pPlateau !== null ? { valor: v.pPlateau, origen: "PLATEAU" } : null;
  }
  if (v.modalidad === "PCV") {
    if (v.pPlateau !== null) return { valor: v.pPlateau, origen: "PLATEAU" };
    if (v.pPico !== null) return { valor: v.pPico, origen: "PICO" };
  }
  return null;
}

export function validezMecanicaEstatica(v: Ventilacion): Validez {
  if (!esModalidadControlada(v.modalidad)) {
    return { valido: false, motivo: "NO_APLICA", leyenda: "No aplica en esta modalidad" };
  }
  if (v.asincronico) {
    return {
      valido: false,
      motivo: "ASINCRONIA_EN_MODO_CONTROLADO",
      leyenda: "Invalidado por asincronía en modalidad controlada"
    };
  }
  if (presionParaDriving(v) === null || v.peep === null) {
    return { valido: false, motivo: "SIN_DATO", leyenda: "Sin registro" };
  }
  return { valido: true, motivo: null, leyenda: null };
}

/** Atajo booleano para la UI. */
export function plateauEsValido(v: Ventilacion): boolean {
  return validezMecanicaEstatica(v).valido;
}

/** Verdadero si la mecanica se bloquea POR asincronia (no por falta de dato). */
export function mecanicaBloqueadaPorAsincronia(v: Ventilacion): boolean {
  return validezMecanicaEstatica(v).motivo === "ASINCRONIA_EN_MODO_CONTROLADO";
}
