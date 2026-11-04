/**
 * Filtros y sonda de aspiracion de circuito cerrado ("FECHAS FILTROS Y SONDA DE
 * ASPIRACION CIRCUITO CERRADO" de la hoja diaria).
 *
 * Se anota la fecha del cambio SOLO cuando se hace; el resto del tiempo el
 * sistema calcula cuanto le queda. No va atado a un control: es un evento.
 *   TrachCare 3 dias, filtro HEPA 3 dias, HME 2 dias.
 */

import type { EventoClinico } from "./tipos";

export type ElementoCircuito = "TRACHCARE" | "HEPA" | "HME";

export const VIDA_UTIL_DIAS: Readonly<Record<ElementoCircuito, number>> = { TRACHCARE: 3, HEPA: 3, HME: 2 };
export const ETIQUETA_ELEMENTO: Readonly<Record<ElementoCircuito, string>> = { TRACHCARE: "TrachCare", HEPA: "Filtro HEPA", HME: "Filtro HME" };

export type EstadoFiltro = "SIN_REGISTRO" | "VIGENTE" | "VENCE_HOY" | "VENCIDO";

export interface VigenciaFiltro {
  readonly elemento: ElementoCircuito;
  readonly cambiadoEn: string | null;
  readonly venceFecha: string | null;
  /** Dias de calendario que quedan; 0 = vence hoy; negativo = vencido. */
  readonly diasRestantes: number | null;
  readonly estado: EstadoFiltro;
}

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaUtc = (s: string): number => {
  const [a = 0, m = 1, d = 1] = s.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

function elementoDe(e: EventoClinico): ElementoCircuito | null {
  if (e.tipo === "CAMBIO_HMEF") return "HME";
  if (e.tipo === "CAMBIO_FILTRO") return e.elemento;
  return null;
}

export function vigenciaFiltros(eventos: readonly EventoClinico[], ahora: Date): readonly VigenciaFiltro[] {
  const hoy = ymd(ahora);
  return (Object.keys(VIDA_UTIL_DIAS) as ElementoCircuito[]).map((elemento) => {
    const cambios = eventos
      .filter((e) => elementoDe(e) === elemento)
      .sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
    const ultimo = cambios[cambios.length - 1];
    if (!ultimo) return { elemento, cambiadoEn: null, venceFecha: null, diasRestantes: null, estado: "SIN_REGISTRO" };
    const fecha = ymd(new Date(ultimo.registradoEn));
    const vence = new Date(diaUtc(fecha) + VIDA_UTIL_DIAS[elemento] * 86_400_000);
    const venceFecha = vence.toISOString().slice(0, 10);
    const restantes = Math.round((diaUtc(venceFecha) - diaUtc(hoy)) / 86_400_000);
    return {
      elemento,
      cambiadoEn: fecha,
      venceFecha,
      diasRestantes: restantes,
      estado: restantes < 0 ? "VENCIDO" : restantes === 0 ? "VENCE_HOY" : "VIGENTE"
    };
  });
}

/** Elementos que requieren atencion hoy (vencidos o que vencen hoy). */
export function filtrosPorCambiar(eventos: readonly EventoClinico[], ahora: Date): readonly VigenciaFiltro[] {
  return vigenciaFiltros(eventos, ahora).filter((v) => v.estado === "VENCIDO" || v.estado === "VENCE_HOY");
}
