/**
 * Turnos de guardia.
 *
 * La APK se firma una vez por turno y vale para los controles siguientes del
 * mismo turno: dos al dia, por profesionales distintos. Para saber si un
 * control cae en el mismo turno que una APK se necesita una clave de turno.
 *
 * SUPUESTO A CONFIRMAR: turno Dia de 08:00 a 20:00 y Noche de 20:00 a 08:00.
 * Un control a las 02:00 pertenece al turno Noche que empezo el dia anterior.
 * Si los horarios reales son otros, se cambian estas dos constantes.
 */

import type { TurnoClave } from "./tipos";

export type TipoTurno = "DIA" | "NOCHE";

export const HORA_INICIO_DIA = 8;
export const HORA_INICIO_NOCHE = 20;

export interface TurnoGuardia {
  readonly clave: TurnoClave;
  readonly tipo: TipoTurno;
  /** Fecha en que empezo el turno (YYYY-MM-DD, hora local). */
  readonly fecha: string;
}

function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function turnoDe(ahora: Date): TurnoGuardia {
  const h = ahora.getHours();

  if (h >= HORA_INICIO_DIA && h < HORA_INICIO_NOCHE) {
    const fecha = ymd(ahora);
    return { clave: `${fecha}:DIA`, tipo: "DIA", fecha };
  }

  // Noche: de 20:00 a 23:59 es del mismo dia; de 00:00 a 07:59, del dia anterior.
  const base = new Date(ahora);
  if (h < HORA_INICIO_DIA) base.setDate(base.getDate() - 1);
  const fecha = ymd(base);
  return { clave: `${fecha}:NOCHE`, tipo: "NOCHE", fecha };
}

export function etiquetaTurno(t: TurnoGuardia): string {
  return t.tipo === "DIA" ? "Turno día" : "Turno noche";
}

/** El turno inmediatamente anterior (Dia <-> Noche), para mostrar la APK del colega previo. */
export function turnoAnterior(ahora: Date): TurnoGuardia {
  const t = turnoDe(ahora);
  const [y, m, d] = t.fecha.split("-").map(Number) as [number, number, number];
  if (t.tipo === "DIA") {
    const antes = new Date(y, m - 1, d - 1, HORA_INICIO_NOCHE, 0);
    return turnoDe(antes);
  }
  return turnoDe(new Date(y, m - 1, d, HORA_INICIO_DIA, 0));
}
