/**
 * Candado de mecanica ventilatoria.
 *
 * Regla clinica (informe seccion 3.G): si el ventilador esta en modo controlado
 * (VCV o PCV) y el paciente esta asincronico, la presion plateau esta contaminada
 * por esfuerzo muscular activo. En ese caso plateau, driving pressure y compliance
 * estatica NO son datos imperfectos: son datos falsos.
 *
 * Esta es la UNICA fuente de verdad de esa regla. La consumen la UI, el generador
 * de nota para ALMA y el consolidado REM 28, de modo que es imposible que la
 * pantalla muestre una compliance que la nota oficial contradiga.
 */

import { MODOS_CONTROLADOS } from "./tipos";
import type { SoporteVentilatorio } from "./tipos";

export type MotivoInvalidez = "NO_ES_VMI" | "ASINCRONIA_EN_MODO_CONTROLADO" | "SIN_DATO";

export interface Validez {
  readonly valido: boolean;
  readonly motivo: MotivoInvalidez | null;
  /** Texto corto para mostrar en lugar del valor bloqueado. */
  readonly leyenda: string | null;
}

const VALIDO: Validez = { valido: true, motivo: null, leyenda: null };

export function esModoControlado(soporte: SoporteVentilatorio): boolean {
  return soporte.modoVMI !== null && MODOS_CONTROLADOS.includes(soporte.modoVMI);
}

/**
 * Determina si la mecanica estatica (plateau, driving pressure, compliance)
 * es interpretable para este soporte ventilatorio.
 */
export function validezMecanicaEstatica(soporte: SoporteVentilatorio): Validez {
  if (soporte.tipo !== "VMI") {
    return {
      valido: false,
      motivo: "NO_ES_VMI",
      leyenda: "No aplica (sin VMI)"
    };
  }

  if (soporte.asincronico && esModoControlado(soporte)) {
    return {
      valido: false,
      motivo: "ASINCRONIA_EN_MODO_CONTROLADO",
      leyenda: "Invalidado por asincronia en modo controlado"
    };
  }

  if (soporte.pPlateau === null || soporte.peep === null) {
    return { valido: false, motivo: "SIN_DATO", leyenda: "Sin registro" };
  }

  return VALIDO;
}

/** Atajo booleano para la UI. */
export function plateauEsValido(soporte: SoporteVentilatorio): boolean {
  return validezMecanicaEstatica(soporte).valido;
}
