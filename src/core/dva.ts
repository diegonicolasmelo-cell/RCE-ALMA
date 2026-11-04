/**
 * Drogas vasoactivas y semaforo de estratificacion hemodinamica.
 *
 * Cortes institucionales (informe seccion 3.F) para noradrenalina y adrenalina
 * en mcg/kg/min. La vasopresina no se pondera por peso y no entra en el semaforo.
 */

import type { Dva, NivelRiesgoDva } from "./tipos";

export const CORTE_DVA_MEDIA = 0.1;
export const CORTE_DVA_ALTA = 0.3;

/** Semaforo de una catecolamina individual. */
export function semaforoCatecolamina(dosis: number | null): NivelRiesgoDva {
  if (dosis === null || dosis <= 0) return "SIN_DVA";
  if (dosis < CORTE_DVA_MEDIA) return "BAJA";
  if (dosis <= CORTE_DVA_ALTA) return "MEDIA";
  return "ALTA";
}

const PESO: Readonly<Record<NivelRiesgoDva, number>> = {
  SIN_DVA: 0,
  BAJA: 1,
  MEDIA: 2,
  ALTA: 3
};

/**
 * Semaforo global del paciente: se queda con el nivel mas alto entre
 * noradrenalina y adrenalina. Un paciente con NAD baja pero adrenalina alta
 * esta en riesgo alto, no en riesgo bajo.
 */
export function semaforoDva(dva: Dva): NivelRiesgoDva {
  const niveles = [
    semaforoCatecolamina(dva.noradrenalina),
    semaforoCatecolamina(dva.adrenalina)
  ];
  return niveles.reduce((peor, n) => (PESO[n] > PESO[peor] ? n : peor), "SIN_DVA");
}

export function usaDva(dva: Dva): boolean {
  return (
    (dva.noradrenalina ?? 0) > 0 ||
    (dva.adrenalina ?? 0) > 0 ||
    (dva.vasopresina ?? 0) > 0
  );
}

/** Texto para la nota clinica. */
export function describirDva(dva: Dva): string {
  const partes: string[] = [];
  if ((dva.noradrenalina ?? 0) > 0) partes.push(`Noradrenalina ${dva.noradrenalina} mcg/kg/min`);
  if ((dva.adrenalina ?? 0) > 0) partes.push(`Adrenalina ${dva.adrenalina} mcg/kg/min`);
  if ((dva.vasopresina ?? 0) > 0) partes.push(`Vasopresina ${dva.vasopresina} UI/min`);
  return partes.length > 0 ? partes.join(" + ") : "sin requerimiento de DVA";
}
