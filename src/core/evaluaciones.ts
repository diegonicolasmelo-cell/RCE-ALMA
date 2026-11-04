/**
 * Evaluaciones puntuales de la hoja de cuidados neuromusculares y del protocolo
 * de weaning. No son parte del control de rutina: se hacen aparte y se registran
 * como evento, con su puntaje calculado.
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
}

export interface DefEscala {
  readonly id: IdEscala;
  readonly nombre: string;
  readonly grupo: string;
  readonly campos: readonly CampoEscala[];
  /** Si se suma: maximo del total. `null` = no hay total (mediciones sueltas). */
  readonly maxTotal: number | null;
}

const MRC_MOVIMIENTOS = ["Abducción de hombro", "Flexión de codo", "Extensión de muñeca", "Flexión de cadera", "Extensión de rodilla", "Dorsiflexión tobillo"];

export const ESCALAS: readonly DefEscala[] = [
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
  { id: "VISAGE", nombre: "VISAGE (neurológicos y neuroquirúrgicos)", grupo: "Neurológico", maxTotal: null, campos: [{ id: "puntaje", etiqueta: "Puntaje", min: 0, max: 5 }] },
  { id: "VIA_AEREA", nombre: "Score de cuidados de vía aérea", grupo: "Neurológico", maxTotal: null, campos: [{ id: "puntaje", etiqueta: "Puntaje", min: 0, max: null }] },
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
  return { total: unico, completa, lineas: def.campos.length > 1 ? def.campos.filter((c) => valores[c.id] != null).map((c) => `${c.etiqueta}: ${valores[c.id]}${c.unidad ? " " + c.unidad : ""}`) : [], interpretacion: null, errores };
}
