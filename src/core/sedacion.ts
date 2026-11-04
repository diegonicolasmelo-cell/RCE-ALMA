/**
 * Titulacion de sedoanalgesia por escalones 1-6, con dosis libre.
 *
 * La dosis efectiva es siempre la fuente de verdad del registro; el escalon es
 * una ayuda de tipeo. Por eso la dosis libre esta siempre disponible: la
 * plataforma acelera el caso frecuente, no impide registrar la realidad clinica
 * (coma inducido, estatus epileptico).
 */

import { SEDANTES } from "./catalogos";
import type { DefinicionSedante } from "./catalogos";
import type { IdSedante, InfusionSedante, Sedacion } from "./tipos";

export const ESCALON_MIN = 1;
export const ESCALON_MAX = 6;

const PORID: ReadonlyMap<IdSedante, DefinicionSedante> = new Map(
  SEDANTES.map((s) => [s.id, s])
);

export function definicionSedante(id: IdSedante): DefinicionSedante {
  const def = PORID.get(id);
  // Imposible por construccion: IdSedante y SEDANTES se derivan del mismo dominio.
  if (!def) throw new Error(`Sedante desconocido: ${id}`);
  return def;
}

/**
 * Dosis correspondiente a un escalon, interpolada linealmente entre el 1 y el 6.
 * Se redondea a la precision del farmaco (midazolam necesita 3 decimales).
 */
export function dosisDeEscalon(id: IdSedante, escalon: number): number {
  const def = definicionSedante(id);
  const n = Math.min(Math.max(Math.round(escalon), ESCALON_MIN), ESCALON_MAX);
  const paso = (def.escalon6 - def.escalon1) / (ESCALON_MAX - ESCALON_MIN);
  const dosis = def.escalon1 + paso * (n - ESCALON_MIN);
  const decimales = def.escalon6 < 1 ? 3 : 2;
  const f = 10 ** decimales;
  return Math.round(dosis * f) / f;
}

/** Tabla completa de escalones de un farmaco, para los botones de la UI. */
export function escalonesDe(id: IdSedante): readonly { escalon: number; dosis: number }[] {
  const out: { escalon: number; dosis: number }[] = [];
  for (let e = ESCALON_MIN; e <= ESCALON_MAX; e++) {
    out.push({ escalon: e, dosis: dosisDeEscalon(id, e) });
  }
  return out;
}

export function infusionPorEscalon(id: IdSedante, escalon: number): InfusionSedante {
  return { escalon, dosis: dosisDeEscalon(id, escalon) };
}

/** Dosis fuera de protocolo: se registra sin escalon asociado. */
export function infusionLibre(dosis: number): InfusionSedante {
  return { escalon: null, dosis };
}

function estaActiva(inf: InfusionSedante | undefined): inf is InfusionSedante {
  return inf !== undefined && inf.dosis !== null && inf.dosis > 0;
}

export interface SedanteActivo {
  readonly id: IdSedante;
  readonly label: string;
  readonly unidad: string;
  readonly dosis: number;
  readonly escalon: number | null;
}

/** Sedantes con infusion efectiva, en el orden del protocolo. */
export function sedantesActivos(sedacion: Sedacion): readonly SedanteActivo[] {
  const activos: SedanteActivo[] = [];
  for (const def of SEDANTES) {
    const inf = sedacion[def.id];
    if (estaActiva(inf) && inf.dosis !== null) {
      activos.push({
        id: def.id,
        label: def.label,
        unidad: def.unidad,
        dosis: inf.dosis,
        escalon: inf.escalon
      });
    }
  }
  return activos;
}

/** Texto para la nota clinica: "Fentanilo 1.2 mcg/kg/h (esc. 2) + Propofol 1 mg/kg/h". */
export function describirSedacion(sedacion: Sedacion): string {
  const activos = sedantesActivos(sedacion);
  if (activos.length === 0) return "sin sedantes activos";
  return activos
    .map((a) => `${a.label} ${a.dosis} ${a.unidad}${a.escalon !== null ? ` (esc. ${a.escalon})` : ""}`)
    .join(" + ");
}

/** Suspension de un farmaco con un solo toque. */
export function suspender(sedacion: Sedacion, id: IdSedante): Sedacion {
  return { ...sedacion, [id]: { escalon: null, dosis: 0 } };
}
