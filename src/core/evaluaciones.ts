/**
 * Evaluaciones puntuales de la hoja de cuidados neuromusculares y del protocolo
 * de weaning. No son parte del control de rutina: se hacen aparte y se registran
 * como evento, con su puntaje calculado. El control es MONITORIZACION; todo lo que
 * se evalua para decidir (destete, extubacion) vive aqui.
 *
 * Los campos y rangos salen de la hoja de papel. Lo que la hoja no precisa (maximo
 * del score de cuidados de via aerea, componentes del VISAGE) queda como un unico
 * puntaje, sin inventar la forma de calcularlo.
 */

import type { IdEscala } from "./tipos";

export interface CampoEscala {
  readonly id: string;
  readonly etiqueta: string;
  readonly min: number;
  /** `null` = la hoja no fija un maximo. */
  readonly max: number | null;
  readonly unidad?: string;
  /** Si la medicion es una categoria: se elige de una lista; se guarda el numero `val`. */
  readonly opciones?: readonly { readonly val: number; readonly label: string }[];
}

export interface DefEscala {
  readonly id: IdEscala;
  readonly nombre: string;
  readonly grupo: string;
  readonly campos: readonly CampoEscala[];
  /** Si se suma: maximo del total. `null` = no hay total (mediciones sueltas). */
  readonly maxTotal: number | null;
  /** La evaluacion ES la nota (p. ej. el hallazgo de una ecografia): no puede ir vacia. */
  readonly exigeNota?: boolean;
}

const MRC_MOVIMIENTOS = ["Abducción de hombro", "Flexión de codo", "Extensión de muñeca", "Flexión de cadera", "Extensión de rodilla", "Dorsiflexión tobillo"];

/** Deglucion como categoria (las etiquetas son las del catalogo; la clasificacion es provisoria). */
export const OPCIONES_DEGLUCION_EVAL: readonly { readonly val: number; readonly label: string }[] = [
  { val: 2, label: "Presente" },
  { val: 1, label: "Esporádica" },
  { val: 0, label: "Ausente" }
];

export const GRUPO_PVE_EXTUBACION = "PVE y extubación";

/** El orden de la lista es el orden de los apartados en la pantalla. */
export const ESCALAS: readonly DefEscala[] = [
  { id: "VISAGE", nombre: "VISAGE (neurológicos y neuroquirúrgicos)", grupo: GRUPO_PVE_EXTUBACION, maxTotal: null, campos: [{ id: "puntaje", etiqueta: "Puntaje", min: 0, max: 5 }] },
  { id: "VIA_AEREA", nombre: "Score de cuidados de vía aérea", grupo: GRUPO_PVE_EXTUBACION, maxTotal: null, campos: [{ id: "puntaje", etiqueta: "Puntaje", min: 0, max: null }] },
  { id: "FLUJO_PICO_TOS", nombre: "Flujo pico de tos", grupo: GRUPO_PVE_EXTUBACION, maxTotal: null, campos: [{ id: "pef", etiqueta: "Flujo pico de tos", min: 0, max: null, unidad: "L/min" }] },
  { id: "DEGLUCION", nombre: "Deglución", grupo: GRUPO_PVE_EXTUBACION, maxTotal: null, campos: [{ id: "nivel", etiqueta: "Deglución", min: 0, max: 2, opciones: OPCIONES_DEGLUCION_EVAL }] },
  { id: "ECOGRAFIA", nombre: "Ecografía", grupo: GRUPO_PVE_EXTUBACION, maxTotal: null, campos: [], exigeNota: true },
  {
    id: "MRC_SS",
    nombre: "Fuerza muscular MRC-ss",
    grupo: "Fuerza muscular",
    maxTotal: 60,
    campos: MRC_MOVIMIENTOS.flatMap((m, i) => [
      { id: `m${i + 1}d`, etiqueta: `${i + 1}. ${m} · derecho`, min: 0, max: 5 },
      { id: `m${i + 1}i`, etiqueta: `${i + 1}. ${m} · izquierdo`, min: 0, max: 5 }
    ])
  },
  {
    id: "FSS_ICU",
    nombre: "Estado funcional FSS-ICU",
    grupo: "Funcional",
    maxTotal: 35,
    campos: ["Girar en la cama", "Transferencia de supino a sedente", "Sedente al borde de la cama", "Transferencia de sedente a bípedo", "Marcha"].map((a, i) => ({
      id: `a${i + 1}`,
      etiqueta: `${i + 1}. ${a}`,
      min: 0,
      max: 7
    }))
  },
  {
    id: "FUERZA_RESPIRATORIA",
    nombre: "Fuerza respiratoria y diafragma",
    grupo: "Fuerza muscular",
    maxTotal: null,
    campos: [
      { id: "pim", etiqueta: "Presión inspiratoria máxima", min: 0, max: null, unidad: "cmH₂O" },
      { id: "pef", etiqueta: "Flujo espiratorio máximo", min: 0, max: null, unidad: "L/min" },
      { id: "fed", etiqueta: "Fracción de engrosamiento diafragmático", min: 0, max: 100, unidad: "%" },
      { id: "exc", etiqueta: "Excursión diafragmática", min: 0, max: null, unidad: "cm" }
    ]
  },
  { id: "FRAGILIDAD", nombre: "Escala clínica de fragilidad", grupo: "Funcional", maxTotal: null, campos: [{ id: "nivel", etiqueta: "Nivel", min: 1, max: 9 }] },
  { id: "BARTHEL", nombre: "Índice de Barthel", grupo: "Funcional", maxTotal: null, campos: [{ id: "puntaje", etiqueta: "Puntaje", min: 0, max: 100 }] }
];

export const escalaDe = (id: IdEscala): DefEscala => ESCALAS.find((e) => e.id === id)!;
export const nombreEscala = (id: IdEscala): string => ESCALAS.find((e) => e.id === id)?.nombre ?? id;

export interface ResultadoEscala {
  /** Total, o `null` si la escala no se suma o faltan datos. */
  readonly total: number | null;
  readonly completa: boolean;
  readonly lineas: readonly string[];
  readonly interpretacion: string | null;
  /** Campos fuera de rango. */
  readonly errores: readonly string[];
}

export function calcularEscala(id: IdEscala, valores: Readonly<Record<string, number | null | undefined>>): ResultadoEscala {
  const def = escalaDe(id);
  const errores = def.campos
    .filter((c) => {
      const v = valores[c.id];
      return v !== null && v !== undefined && (v < c.min || (c.max !== null && v > c.max) || !Number.isFinite(v));
    })
    .map((c) => `${c.etiqueta}: fuera de rango`);
  const dados = def.campos.filter((c) => valores[c.id] !== null && valores[c.id] !== undefined);
  const completa = dados.length === def.campos.length;
  const suma = (ids: readonly string[]): number => ids.reduce((s, k) => s + (valores[k] ?? 0), 0);

  if (id === "MRC_SS") {
    const d = def.campos.filter((c) => c.id.endsWith("d")).map((c) => c.id);
    const i = def.campos.filter((c) => c.id.endsWith("i")).map((c) => c.id);
    const total = completa ? suma([...d, ...i]) : null;
    return {
      total,
      completa,
      lineas: [`Subtotal derecho ${suma(d)}/30`, `Subtotal izquierdo ${suma(i)}/30`, `MRC sum score ${total ?? "—"}/60`],
      interpretacion: total === null ? null : total <= 48 ? "Debilidad adquirida en UCI (puntaje ≤ 48)" : "Sin debilidad adquirida en UCI",
      errores
    };
  }
  if (id === "FSS_ICU") {
    const total = completa ? suma(def.campos.map((c) => c.id)) : null;
    return { total, completa, lineas: [`Total ${total ?? "—"}/35`], interpretacion: null, errores };
  }
  const unico = def.campos.length === 1 ? (valores[def.campos[0]!.id] ?? null) : null;
  if (id === "VISAGE") {
    return { total: unico, completa, lineas: [], interpretacion: unico === null ? null : unico >= 3 ? "Alcanza el corte (≥ 3 puntos)" : "Bajo el corte (≥ 3 puntos)", errores };
  }
  if (id === "VIA_AEREA") {
    return { total: unico, completa, lineas: [], interpretacion: unico === null ? null : unico < 6 ? "Bajo el corte (< 6 puntos)" : "Sobre el corte (< 6 puntos)", errores };
  }
  if (id === "DEGLUCION") {
    const etiqueta = OPCIONES_DEGLUCION_EVAL.find((o) => o.val === unico)?.label ?? null;
    // Una categoria no es un puntaje: no tiene total.
    return { total: null, completa, lineas: etiqueta ? [etiqueta] : [], interpretacion: null, errores };
  }
  if (id === "FLUJO_PICO_TOS") {
    return { total: unico, completa, lineas: unico === null ? [] : [`${unico} L/min`], interpretacion: null, errores };
  }
  return { total: unico, completa, lineas: def.campos.length > 1 ? def.campos.filter((c) => valores[c.id] != null).map((c) => `${c.etiqueta}: ${valores[c.id]}${c.unidad ? " " + c.unidad : ""}`) : [], interpretacion: null, errores };
}

/** Hallazgos frecuentes para escribir la ecografia (el campo es texto libre). Provisorios. */
export const SUGERENCIAS_ECOGRAFIA: readonly string[] = [
  "Patrón A bilateral",
  "Patrón B bilateral",
  "Patrón B focal",
  "Consolidación",
  "Derrame pleural",
  "Deslizamiento pleural ausente",
  "Disfunción diafragmática"
];

export const LARGO_MAX_NOTA_EVALUACION = 300;

/**
 * "Deglución: esporádica", "Flujo pico de tos: 60 L/min", "Ecografía: patrón B bilateral",
 * "VISAGE (…): 3". Con nota clinica, va al final: "… · nota".
 */
export function resumenEvaluacion(id: IdEscala, valores: Readonly<Record<string, number | null | undefined>>, total: number | null, nota = ""): string {
  const n = nota.trim();
  if (escalaDe(id).exigeNota) return `${nombreEscala(id)}: ${n || "sin hallazgo"}`;
  return `${resumenSinNota(id, valores, total)}${n ? ` · ${n}` : ""}`;
}

function resumenSinNota(id: IdEscala, valores: Readonly<Record<string, number | null | undefined>>, total: number | null): string {
  const r = calcularEscala(id, valores);
  if (id === "DEGLUCION") return `${nombreEscala(id)}: ${r.lineas[0]?.toLowerCase() ?? "sin dato"}`;
  if (id === "FLUJO_PICO_TOS") return `${nombreEscala(id)}: ${r.lineas[0] ?? "sin dato"}`;
  return `${nombreEscala(id)}${total !== null ? `: ${total}` : ""}`;
}

/**
 * La hora REAL de una evaluacion, escrita como "HH:MM", llevada a un momento completo.
 * Una hora posterior a la actual es del dia anterior (una evaluacion de las 23:50 anotada
 * a las 00:10). No se acepta mas de `maxHorasAtras` hacia atras: eso ya no es "minutos antes".
 */
export function momentoDeEvaluacion(hora: string, ahora: Date, maxHorasAtras = 12): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  let t = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, min);
  if (t.getTime() > ahora.getTime() + 60_000) t = new Date(t.getTime() - 24 * 3600_000);
  if (ahora.getTime() - t.getTime() > maxHorasAtras * 3600_000) return null;
  return t;
}
