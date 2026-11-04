/**
 * Infusiones: sedoanalgesia y farmacos cardiovasculares con un mismo modelo.
 *
 * Un farmaco "en curso" es una entrada en `Control.infusiones`; suspendido es
 * la ausencia. Iniciar -> titular -> suspender.
 */

import { INFUSIONES } from "./catalogos";
import type { DefinicionInfusion, GrupoInfusion } from "./catalogos";
import type { IdInfusion, InfusionEnCurso, Infusiones, NivelRiesgoDva } from "./tipos";

export const ESCALON_MIN = 1;
export const ESCALON_MAX = 6;

const POR_ID: ReadonlyMap<IdInfusion, DefinicionInfusion> = new Map(INFUSIONES.map((i) => [i.id, i]));

export function definicionInfusion(id: IdInfusion): DefinicionInfusion {
  const def = POR_ID.get(id);
  // Imposible por construccion: IdInfusion y el catalogo se derivan del mismo dominio.
  if (!def) throw new Error(`Infusión desconocida: ${id}`);
  return def;
}

export function infusionesDelGrupo(grupo: GrupoInfusion): readonly DefinicionInfusion[] {
  return INFUSIONES.filter((i) => i.grupo === grupo);
}

// ---------------------------------------------------------------------------
// Escalones
// ---------------------------------------------------------------------------

/**
 * Dosis de un escalon, interpolada linealmente entre el 1 y el 6. `null` si el
 * farmaco no tiene escalones definidos (solo dosis libre). Ver la advertencia
 * sobre la tabla en catalogos.TABLA_ESCALONES_CONFIRMADA.
 */
export function dosisDeEscalon(id: IdInfusion, escalon: number): number | null {
  const esc = definicionInfusion(id).escalones;
  if (!esc) return null;
  const n = Math.min(Math.max(Math.round(escalon), ESCALON_MIN), ESCALON_MAX);
  const paso = (esc.sexto - esc.primero) / (ESCALON_MAX - ESCALON_MIN);
  const f = 10 ** esc.decimales;
  return Math.round((esc.primero + paso * (n - ESCALON_MIN)) * f) / f;
}

/** Tabla de escalones para los botones de la UI. Vacia si no hay escalones. */
export function escalonesDe(id: IdInfusion): readonly { escalon: number; dosis: number }[] {
  const out: { escalon: number; dosis: number }[] = [];
  for (let e = ESCALON_MIN; e <= ESCALON_MAX; e++) {
    const dosis = dosisDeEscalon(id, e);
    if (dosis !== null) out.push({ escalon: e, dosis });
  }
  return out;
}

export function infusionPorEscalon(id: IdInfusion, escalon: number): InfusionEnCurso | null {
  const dosis = dosisDeEscalon(id, escalon);
  return dosis === null ? null : { dosis, escalon: Math.round(escalon) };
}

/** Dosis fuera de protocolo (coma inducido, estatus epileptico): sin escalon. */
export function infusionLibre(dosis: number): InfusionEnCurso {
  return { dosis, escalon: null };
}

// ---------------------------------------------------------------------------
// Estado del conjunto
// ---------------------------------------------------------------------------

export function enCurso(infusiones: Infusiones, id: IdInfusion): InfusionEnCurso | null {
  const x = infusiones[id];
  return x !== undefined && x.dosis > 0 ? x : null;
}

export interface InfusionActiva {
  readonly id: IdInfusion;
  readonly nombre: string;
  readonly unidad: string;
  readonly grupo: GrupoInfusion;
  readonly dosis: number;
  readonly escalon: number | null;
}

/** Infusiones en curso, en el orden del catalogo. */
export function infusionesActivas(
  infusiones: Infusiones,
  grupo?: GrupoInfusion
): readonly InfusionActiva[] {
  const out: InfusionActiva[] = [];
  for (const def of INFUSIONES) {
    if (grupo !== undefined && def.grupo !== grupo) continue;
    const x = enCurso(infusiones, def.id);
    if (x) {
      out.push({ id: def.id, nombre: def.nombre, unidad: def.unidad, grupo: def.grupo, dosis: x.dosis, escalon: x.escalon });
    }
  }
  return out;
}

/** "Hay sedoanalgesia" se deduce: si ningun sedante esta en curso, es "No". */
export function sedoanalgesiaActiva(infusiones: Infusiones): boolean {
  return infusionesActivas(infusiones, "SEDANTE").length > 0;
}

/**
 * Sube o baja una dosis libre un paso (▲ / ▼). Nunca baja de 0 y redondea a los
 * decimales del paso para no arrastrar errores de punto flotante (0.1 + 0.2).
 */
export function titularDosis(actual: string, paso: number, sentido: 1 | -1): string {
  const n = Number(actual.replace(",", "."));
  const base = Number.isFinite(n) && actual.trim() !== "" ? n : 0;
  const decimales = (String(paso).split(".")[1] ?? "").length;
  const nuevo = Math.max(0, base + sentido * paso);
  return String(Number(nuevo.toFixed(decimales)));
}

/** Bloqueo neuromuscular en curso segun las infusiones del control. */
export function bnmEnCurso(infusiones: Infusiones | undefined | null): boolean {
  return infusiones ? infusionesActivas(infusiones, "BNM").length > 0 : false;
}

export function iniciar(infusiones: Infusiones, id: IdInfusion, dosis: InfusionEnCurso): Infusiones {
  return { ...infusiones, [id]: dosis };
}

export function suspender(infusiones: Infusiones, id: IdInfusion): Infusiones {
  const { [id]: _quitada, ...resto } = infusiones;
  void _quitada;
  return resto;
}

/** Texto para la nota clinica: "Fentanilo 1.2 mcg/kg/h (esc. 2) + Propofol 1 mg/kg/h". */
export function describirInfusiones(infusiones: Infusiones, grupo?: GrupoInfusion): string {
  return infusionesActivas(infusiones, grupo)
    .map((a) => `${a.nombre} ${a.dosis} ${a.unidad}${a.escalon !== null ? ` (esc. ${a.escalon})` : ""}`)
    .join(" + ");
}

// ---------------------------------------------------------------------------
// Semaforo de riesgo hemodinamico (noradrenalina y adrenalina)
// ---------------------------------------------------------------------------

export const CORTE_DVA_MEDIA = 0.1;
export const CORTE_DVA_ALTA = 0.3;

export function semaforoCatecolamina(dosis: number | null): NivelRiesgoDva {
  if (dosis === null || dosis <= 0) return "SIN_DVA";
  if (dosis < CORTE_DVA_MEDIA) return "BAJA";
  if (dosis <= CORTE_DVA_ALTA) return "MEDIA";
  return "ALTA";
}

const PESO: Readonly<Record<NivelRiesgoDva, number>> = { SIN_DVA: 0, BAJA: 1, MEDIA: 2, ALTA: 3 };

/**
 * Semaforo global: el nivel mas alto entre las catecolaminas. NAD baja con
 * adrenalina alta es riesgo alto. Vasopresina, dobutamina y milrinona no entran
 * (no se ponderan igual) pero si cuentan como DVA/inotropo en uso.
 */
export function semaforoDva(infusiones: Infusiones): NivelRiesgoDva {
  let peor: NivelRiesgoDva = "SIN_DVA";
  for (const def of INFUSIONES) {
    if (!def.semaforo) continue;
    const nivel = semaforoCatecolamina(enCurso(infusiones, def.id)?.dosis ?? null);
    if (PESO[nivel] > PESO[peor]) peor = nivel;
  }
  return peor;
}

/** Algun DVA o inotropo en curso. */
export function usaSoporteCardiovascular(infusiones: Infusiones): boolean {
  return infusionesActivas(infusiones, "DVA").length + infusionesActivas(infusiones, "INOTROPO").length > 0;
}

export function describirCardiovasculares(infusiones: Infusiones): string {
  const dva = describirInfusiones(infusiones, "DVA");
  const ino = describirInfusiones(infusiones, "INOTROPO");
  const partes = [dva, ino].filter((t) => t !== "");
  return partes.length > 0 ? partes.join(" + ") : "sin requerimiento de DVA ni inotrópicos";
}
