/**
 * Ronda de equipos (Diego, 22/23-nov-2026): quien toma las salas de atrás recorre cama por cama y
 * revisa el ventilador y los equipos de la sala, y las fechas de etiqueta de HME, TrachCare y HEPA.
 * Lo que encuentra le aparece en la campana a quien tiene esa cama, hasta que se resuelve. La ronda
 * confirma la fecha que se VE en la etiqueta: si alguien cambió el filtro y no lo anotó, la ronda
 * corrige la fecha y deja de aparecer vencido.
 */

import { periodoDe } from "./estadistica";
import { ETIQUETA_ELEMENTO, elementoDeCambio, filtrosPorCambiar } from "./filtros";
import type { EventoClinico, HallazgoRonda } from "./tipos";

type Ronda = Extract<EventoClinico, { tipo: "RONDA_EQUIPOS" }>;

const ddmm = (ymd: string | null): string => (ymd ? `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}` : "");

/** La última ronda de esta cama en el turno de ahora, o null. */
export function rondaDelTurno(eventos: readonly EventoClinico[], ahora: Date): Ronda | null {
  const t = periodoDe("TURNO", ahora);
  const rondas = eventos.filter((e): e is Ronda => e.tipo === "RONDA_EQUIPOS" && Date.parse(e.registradoEn) >= t.desde.getTime() && Date.parse(e.registradoEn) < t.hasta.getTime());
  return rondas.sort((a, b) => a.registradoEn.localeCompare(b.registradoEn)).pop() ?? null;
}

/** Lo que la ronda debería anotar solo: filtros vencidos o que vencen hoy. */
export function hallazgosSugeridos(eventos: readonly EventoClinico[], ahora: Date): readonly HallazgoRonda[] {
  return filtrosPorCambiar(eventos, ahora).map((f) => ({
    elemento: f.elemento,
    texto: `${ETIQUETA_ELEMENTO[f.elemento]} ${f.estado === "VENCIDO" ? "vencido" : "vence hoy"}${f.cambiadoEn ? ` (etiqueta ${ddmm(f.cambiadoEn)})` : ""}`
  }));
}

/**
 * Hallazgos de la última ronda del turno que siguen abiertos: los de un filtro se cierran solos
 * cuando alguien anota ese cambio DESPUÉS de la ronda; el resto queda hasta que termina el turno.
 */
export function hallazgosPendientes(eventos: readonly EventoClinico[], ahora: Date): { readonly ronda: Ronda; readonly hallazgos: readonly HallazgoRonda[] } | null {
  const r = rondaDelTurno(eventos, ahora);
  if (!r || !r.hallazgos.length) return null;
  const abiertos = r.hallazgos.filter((h) => !h.elemento || !eventos.some((e) => elementoDeCambio(e) === h.elemento && e.registradoEn > r.registradoEn));
  return abiertos.length ? { ronda: r, hallazgos: abiertos } : null;
}
