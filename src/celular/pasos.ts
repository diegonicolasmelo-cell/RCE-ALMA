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

export type TabControl = "monitoreo" | "ventilacion" | "kine";
export type SegmentoId = "fc" | "pa" | "neuro" | "glasgow" | "sas" | "modo" | "vent" | "kine" | "apk" | "tf";

export interface DefSegmento {
  readonly id: SegmentoId;
  readonly corto: string;
}

export const SEGMENTOS: Readonly<Record<TabControl, readonly DefSegmento[]>> = {
  monitoreo: [
    { id: "fc", corto: "FC" },
    { id: "pa", corto: "PA" },
    { id: "neuro", corto: "PIC" },
    { id: "glasgow", corto: "Glasgow" },
    { id: "sas", corto: "SAS" }
  ],
  ventilacion: [
    { id: "modo", corto: "Modo" },
    { id: "vent", corto: "Ventilación" }
  ],
  kine: [
    { id: "kine", corto: "Kine" },
    { id: "apk", corto: "APK" }
  ]
};

export const ORDEN_TABS: readonly TabControl[] = ["monitoreo", "ventilacion", "kine"];

const SEDANTES = ["fentanilo", "propofol", "midazolam", "dexmedetomidina", "lorazepam"];

/** Donde esta un campo que falta, para llevar a la persona hasta el. */
export function ubicacionDeCampo(campo: string): { tab: TabControl; seg: SegmentoId } {
  if (campo === "fc") return { tab: "monitoreo", seg: "fc" };
  if (campo === "pas" || campo === "pad") return { tab: "monitoreo", seg: "pa" };
  if (campo === "glasgow") return { tab: "monitoreo", seg: "glasgow" };
  if (campo === "sas" || campo === "vigilia") return { tab: "monitoreo", seg: "sas" };
  if (campo.startsWith("infusion:")) {
    return SEDANTES.includes(campo.slice("infusion:".length)) ? { tab: "monitoreo", seg: "sas" } : { tab: "monitoreo", seg: /amiodarona|dobutamina|milrinona/.test(campo) ? "fc" : "pa" };
  }
  if (campo === "frTotal") return { tab: "ventilacion", seg: "vent" };
  if (campo === "spo2") return { tab: "ventilacion", seg: "vent" };
  if (campo === "kine") return { tab: "kine", seg: "kine" };
  if (campo === "apk") return { tab: "kine", seg: "apk" };
  return { tab: "monitoreo", seg: "fc" };
}
