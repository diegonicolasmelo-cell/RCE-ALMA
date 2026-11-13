/**
 * El codigo PCR en vivo: metronomo, ciclos de 2 minutos, choques, drogas y bitacora.
 * Funciones puras sobre un estado que el celular guarda en cada toque, para que nada se pierda si
 * se bloquea o se cierra la app. Al terminar se convierte en un evento PCR del paciente.
 */

import type { EntradaBitacoraPcr, EventoBase, EventoClinico } from "./tipos";

export type RitmoPcr = "FV" | "TVSP" | "ASISTOLIA" | "AESP";
export const ETIQUETA_RITMO: Record<RitmoPcr, string> = { FV: "FV", TVSP: "TV sin pulso", ASISTOLIA: "Asistolia", AESP: "AESP" };
export const ENERGIAS_J: readonly number[] = [120, 150, 200, 360];
export const CICLO_SEG = 120;
export const BPM_MIN = 100;
export const BPM_MAX = 120;
/** La epinefrina se repite cada 3 a 5 minutos: la cuenta regresiva llega a cero a los 3. */
export const EPI_SEG = 180;

export interface CodigoPcr {
  readonly id: string;
  readonly inicio: string;
  /** Paciente, si se partio desde su cama; si no, se elige al terminar. */
  readonly episodioId: string | null;
  readonly bpm: number;
  readonly ritmo: RitmoPcr;
  readonly joules: number;
  readonly ciclo: number;
  readonly cicloInicio: string;
  /** Fin de ciclo: el metronomo se detiene hasta verificar el ritmo. */
  readonly enPausa: boolean;
  readonly choques: number;
  readonly ultimaEpi: string | null;
  readonly amiodaronas: number;
  readonly bitacora: readonly EntradaBitacoraPcr[];
  readonly termino: { readonly en: string; readonly rosc: boolean } | null;
}

const p2 = (n: number): string => String(n).padStart(2, "0");
const horaSeg = (d: Date): string => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
/** «06:18» desde el inicio (o «1:02:05» pasada la hora). */
export function reloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}
export const segundosDesde = (iso: string, ahora: Date): number => (ahora.getTime() - Date.parse(iso)) / 1000;

function anotar(c: CodigoPcr, ahora: Date, texto: string): CodigoPcr {
  return { ...c, bitacora: [...c.bitacora, { hora: horaSeg(ahora), transcurrido: reloj(segundosDesde(c.inicio, ahora)), texto }] };
}

export function iniciarCodigo(id: string, ahora: Date, episodioId: string | null): CodigoPcr {
  const c: CodigoPcr = {
    id, inicio: ahora.toISOString(), episodioId, bpm: 110, ritmo: "FV", joules: 200, ciclo: 1, cicloInicio: ahora.toISOString(),
    enPausa: false, choques: 0, ultimaEpi: null, amiodaronas: 0, bitacora: [], termino: null
  };
  return anotar(c, ahora, "Inicio del código · RCP ciclo 1");
}

export const cambiarBpm = (c: CodigoPcr, delta: number): CodigoPcr => ({ ...c, bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, c.bpm + delta)) });
export const elegirRitmo = (c: CodigoPcr, ahora: Date, ritmo: RitmoPcr): CodigoPcr => (c.ritmo === ritmo ? c : anotar({ ...c, ritmo }, ahora, `Ritmo: ${ETIQUETA_RITMO[ritmo]}`));
export const elegirJoules = (c: CodigoPcr, joules: number): CodigoPcr => ({ ...c, joules });

/** El choque toma el ritmo actual y la energia elegida. */
export function choque(c: CodigoPcr, ahora: Date): CodigoPcr {
  const n = c.choques + 1;
  return anotar({ ...c, choques: n }, ahora, `Choque #${n} · ${c.joules} J · ${ETIQUETA_RITMO[c.ritmo]}`);
}

export function droga(c: CodigoPcr, ahora: Date, nombre: string, dosis: string): CodigoPcr {
  const base = anotar(c, ahora, `${nombre} ${dosis}`);
  if (nombre === "Epinefrina") return { ...base, ultimaEpi: ahora.toISOString() };
  if (nombre === "Amiodarona") return { ...base, amiodaronas: c.amiodaronas + 1 };
  return base;
}
/** Amiodarona: 300 mg la primera, 150 mg la segunda. */
export const dosisAmiodarona = (c: CodigoPcr): string => (c.amiodaronas === 0 ? "300 mg" : "150 mg");

export const nota = (c: CodigoPcr, ahora: Date, texto: string): CodigoPcr => (texto.trim() ? anotar(c, ahora, texto.trim()) : c);

export function finDeCiclo(c: CodigoPcr, ahora: Date): CodigoPcr {
  if (c.enPausa) return c;
  return anotar({ ...c, enPausa: true }, ahora, `Fin del ciclo ${c.ciclo} · verificar pulso y ritmo`);
}

/** Tras verificar el ritmo, parte el ciclo siguiente. */
export function ritmoVerificado(c: CodigoPcr, ahora: Date, ritmo: RitmoPcr): CodigoPcr {
  const sig = c.ciclo + 1;
  return anotar({ ...c, ritmo, enPausa: false, ciclo: sig, cicloInicio: ahora.toISOString() }, ahora, `Ritmo: ${ETIQUETA_RITMO[ritmo]} · RCP ciclo ${sig}`);
}

export function terminar(c: CodigoPcr, ahora: Date, rosc: boolean): CodigoPcr {
  return anotar({ ...c, enPausa: true, termino: { en: ahora.toISOString(), rosc } }, ahora, rosc ? "ROSC" : "Término sin ROSC");
}

/** Desde el cierre se puede volver al codigo (p. ej. un ROSC tocado sin querer). */
export function volverAlCodigo(c: CodigoPcr, ahora: Date): CodigoPcr {
  const sinCierre = { ...c, termino: null, bitacora: c.bitacora.slice(0, -1) };
  return anotar({ ...sinCierre, enPausa: false, cicloInicio: ahora.toISOString() }, ahora, "Se retoma el código");
}

export const duracionMin = (c: CodigoPcr): number =>
  Math.max(1, Math.round(segundosDesde(c.inicio, new Date(c.termino?.en ?? c.inicio)) / 60));

/** El evento PCR que queda en el paciente. */
export function eventoDeCodigo(c: CodigoPcr, base: EventoBase): EventoClinico {
  const inicio = new Date(c.inicio);
  return {
    ...base,
    hora: `${p2(inicio.getHours())}:${p2(inicio.getMinutes())}`,
    tipo: "PCR",
    duracionReanimacionMin: duracionMin(c),
    realizadaEn: c.inicio,
    rosc: c.termino?.rosc ?? false,
    choques: c.choques,
    bitacora: c.bitacora
  };
}

export const cuantasDrogas = (c: CodigoPcr): number => c.bitacora.filter((e) => /^(Epinefrina|Amiodarona|Lidocaína|Bicarbonato|Cloruro de calcio|Sulfato de magnesio) /.test(e.texto)).length;
