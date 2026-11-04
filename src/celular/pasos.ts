/**
 * El control se llena por SECCIONES, como la hoja de papel. Cada pestana es una
 * pantalla larga con scroll libre dividida en segmentos; "Siguiente" lleva al
 * segmento que sigue y lo deja arriba, marcado. Nunca se salta uno por estar vacio.
 *
 *   Monitoreo:   FC + inotropicos/antiarritmicos · PA + vasoactivos · neuromonitoreo ·
 *                Glasgow y S5Q · SAS y escalones de sedacion
 *   Ventilacion: modo · terapia ventilatoria (con la saturacion)
 *   Kine resp.:  auscultacion y secreciones · APK
 *   (La kine motora / terapia fisica va en su propia pestana y es opcional.)
 */

export type TabControl = "kine";
export type SegmentoId = "fc" | "pa" | "neuro" | "glasgow" | "sas" | "modo" | "vent" | "kine" | "apk" | "tf";

export interface DefSegmento {
  readonly id: SegmentoId;
  readonly corto: string;
}

export const SEGMENTOS: Readonly<Record<TabControl, readonly DefSegmento[]>> = {
  kine: [
    { id: "kine", corto: "Kine" },
    { id: "apk", corto: "APK" }
  ]
};

export const ORDEN_TABS: readonly TabControl[] = ["kine"];

/** Orden de la hoja de control: monitorizacion y luego terapia ventilatoria. */
export const SEGMENTOS_HOJA: readonly SegmentoId[] = ["fc", "pa", "neuro", "glasgow", "sas", "modo", "vent"];

const SEDANTES = ["fentanilo", "propofol", "midazolam", "dexmedetomidina", "lorazepam"];

/** Donde esta un campo que falta, para llevar a la persona hasta el. */
export function ubicacionDeCampo(campo: string): { tab: "control" | TabControl; seg: SegmentoId } {
  if (campo === "fc") return { tab: "control", seg: "fc" };
  if (campo === "pas" || campo === "pad") return { tab: "control", seg: "pa" };
  if (campo === "glasgow") return { tab: "control", seg: "glasgow" };
  if (campo === "sas" || campo === "vigilia") return { tab: "control", seg: "sas" };
  if (campo.startsWith("infusion:")) {
    return SEDANTES.includes(campo.slice("infusion:".length)) ? { tab: "control", seg: "sas" } : { tab: "control", seg: /amiodarona|dobutamina|milrinona/.test(campo) ? "fc" : "pa" };
  }
  if (campo === "frTotal") return { tab: "control", seg: "vent" };
  if (campo === "spo2") return { tab: "control", seg: "vent" };
  if (campo === "kine") return { tab: "kine", seg: "kine" };
  if (campo === "apk") return { tab: "kine", seg: "apk" };
  return { tab: "control", seg: "fc" };
}
