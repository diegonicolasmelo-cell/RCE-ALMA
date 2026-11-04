/**
 * Reductores sobre el log de eventos clinicos.
 *
 * Los estados que el informe pide (via aerea vigente, horas acumuladas de prono,
 * cronometro de PVE) NO se almacenan: se derivan del log append-only. Esa es la
 * razon de separar Evento de Control (docs/PLAN-MAESTRO.md cap. 4.3) y es lo que
 * hace imposible que el contador de prono quede desincronizado de los hechos.
 */

import type { Episodio, EventoClinico, TipoEvento, ViaAerea } from "./tipos";
import { EVENTOS_DE_RIESGO } from "./tipos";

/** Duracion de protocolo de una prueba de ventilacion espontanea. */
export const DURACION_PVE_MIN = 30;

function ordenCronologico(eventos: readonly EventoClinico[]): readonly EventoClinico[] {
  return [...eventos].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
}

/**
 * Milisegundos de una marca de tiempo, o `null` si no es interpretable.
 *
 * No es paranoia: estos registros vuelven desde una hoja de Google Sheets, que
 * es editable a mano. Una celda corrupta debe descartarse, no propagar un NaN
 * hasta las horas de prono de la nota clinica.
 */
function instante(iso: string): number | null {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// Via aerea
// ---------------------------------------------------------------------------

/**
 * Via aerea vigente tras aplicar el log de eventos sobre la via de ingreso.
 *
 * El `switch` exhaustivo es deliberado: si manana se agrega un tipo de evento
 * que afecte la via aerea, TypeScript marca error aqui en vez de fallar en silencio.
 */
export function viaAereaVigente(
  viaDeIngreso: ViaAerea,
  eventos: readonly EventoClinico[]
): ViaAerea {
  let via = viaDeIngreso;

  for (const ev of ordenCronologico(eventos)) {
    switch (ev.tipo) {
      case "EXTUBACION_PROGRAMADA":
      case "AUTOEXTUBACION":
        via = "NATURAL";
        break;
      case "REINTUBACION":
        via = ev.via;
        break;
      case "TRAQUEOSTOMIA":
        via = "TQT";
        break;
      // No alteran la via aerea:
      case "AJUSTE_TUBO":
      case "EVALUACION_PVE":
      case "CONTROL_PVE":
      case "REEVAL_POST_EXTUB":
      case "FALLA_POST_EXTUB":
      case "INICIO_PVE":
      case "FIN_PVE":
      case "INICIO_PRONO":
      case "SUPINACION":
      case "INICIO_BNM":
      case "FIN_BNM":
      case "PCR":
      case "EVENTO_CENTINELA":
      case "ASISTENCIA_FBC":
      case "CAMBIO_HMEF":
      case "CAMBIO_EQUIPOS":
      case "ASISTENCIA_PROCEDIMIENTO":
      case "TOMA_CULTIVO":
      case "TRASLADO_IMAGEN":
        break;
      default: {
        const _exhaustivo: never = ev;
        void _exhaustivo;
      }
    }
  }

  return via;
}

/**
 * Intubaciones reales del episodio.
 *
 * Regla del informe 3.B: un AJUSTE_TUBO (cambio de centimetros a la comisura por
 * desplazamiento o control radiologico) NO es una intubacion y no debe contaminar
 * la estadistica.
 */
export function contarIntubaciones(eventos: readonly EventoClinico[]): number {
  return eventos.filter((e) => e.tipo === "REINTUBACION").length;
}

// ---------------------------------------------------------------------------
// Prueba de ventilacion espontanea
// ---------------------------------------------------------------------------

export interface EstadoPve {
  readonly activa: boolean;
  readonly inicioEn: string | null;
  readonly duracionMin: number;
  readonly minutosTranscurridos: number;
  readonly minutosRestantes: number;
  /** Cumplio el tiempo de protocolo. */
  readonly completa: boolean;
}

const PVE_INACTIVA: EstadoPve = {
  activa: false,
  inicioEn: null,
  duracionMin: DURACION_PVE_MIN,
  minutosTranscurridos: 0,
  minutosRestantes: 0,
  completa: false
};

/**
 * Cronometro en vivo de la PVE. Una PVE esta activa si hay un INICIO_PVE
 * posterior al ultimo FIN_PVE.
 */
export function estadoPve(eventos: readonly EventoClinico[], ahora: Date): EstadoPve {
  const relevantes = ordenCronologico(
    eventos.filter((e) => e.tipo === "INICIO_PVE" || e.tipo === "FIN_PVE")
  );
  const ultimo = relevantes[relevantes.length - 1];

  if (!ultimo || ultimo.tipo !== "INICIO_PVE") return PVE_INACTIVA;

  const duracionMin = ultimo.duracionMin > 0 ? ultimo.duracionMin : DURACION_PVE_MIN;
  const inicio = instante(ultimo.registradoEn);
  if (inicio === null) return PVE_INACTIVA;
  const transcurridos = Math.max(0, Math.floor((ahora.getTime() - inicio) / 60_000));

  return {
    activa: true,
    inicioEn: ultimo.registradoEn,
    duracionMin,
    minutosTranscurridos: transcurridos,
    minutosRestantes: Math.max(0, duracionMin - transcurridos),
    completa: transcurridos >= duracionMin
  };
}

// ---------------------------------------------------------------------------
// Prono
// ---------------------------------------------------------------------------

export interface EstadoProno {
  readonly enProno: boolean;
  readonly inicioCicloActual: string | null;
  readonly ciclosCompletados: number;
  /** Horas acumuladas en prono, incluido el ciclo en curso. */
  readonly horasAcumuladas: number;
}

/**
 * Acumula ciclos de prono emparejando INICIO_PRONO con SUPINACION.
 * Un INICIO_PRONO sin supinacion posterior cuenta como ciclo en curso y suma
 * horas hasta `ahora`.
 */
export function estadoProno(eventos: readonly EventoClinico[], ahora: Date): EstadoProno {
  const relevantes = ordenCronologico(
    eventos.filter((e) => e.tipo === "INICIO_PRONO" || e.tipo === "SUPINACION")
  );

  let inicioAbierto: string | null = null;
  let ciclos = 0;
  let ms = 0;

  for (const ev of relevantes) {
    if (ev.tipo === "INICIO_PRONO") {
      // Un segundo INICIO_PRONO sin supinacion intermedia no reinicia el reloj.
      if (inicioAbierto === null && instante(ev.registradoEn) !== null) {
        inicioAbierto = ev.registradoEn;
      }
    } else if (inicioAbierto !== null) {
      const fin = instante(ev.registradoEn);
      const ini = instante(inicioAbierto);
      if (fin !== null && ini !== null && fin > ini) {
        ms += fin - ini;
        ciclos += 1;
      }
      inicioAbierto = null;
    }
  }

  if (inicioAbierto !== null) {
    const ini = instante(inicioAbierto);
    if (ini !== null) ms += ahora.getTime() - ini;
  }

  return {
    enProno: inicioAbierto !== null,
    inicioCicloActual: inicioAbierto,
    ciclosCompletados: ciclos,
    horasAcumuladas: Math.round((Math.max(0, ms) / 3_600_000) * 10) / 10
  };
}

// ---------------------------------------------------------------------------
// Bloqueo neuromuscular
// ---------------------------------------------------------------------------

export function bnmVigente(eventos: readonly EventoClinico[]): boolean {
  const relevantes = ordenCronologico(
    eventos.filter((e) => e.tipo === "INICIO_BNM" || e.tipo === "FIN_BNM")
  );
  const ultimo = relevantes[relevantes.length - 1];
  return ultimo?.tipo === "INICIO_BNM";
}

// ---------------------------------------------------------------------------
// Gestion de riesgo
// ---------------------------------------------------------------------------

export function esEventoDeRiesgo(tipo: TipoEvento): boolean {
  return EVENTOS_DE_RIESGO.includes(tipo);
}

/** Eventos que deben encender la alerta roja en la estacion (cap. 7 del plan). */
export function eventosDeRiesgo(
  eventos: readonly EventoClinico[]
): readonly EventoClinico[] {
  return ordenCronologico(eventos.filter((e) => esEventoDeRiesgo(e.tipo)));
}

// ---------------------------------------------------------------------------
// Efecto de un evento sobre el episodio
// ---------------------------------------------------------------------------

/**
 * Estado del episodio tras un evento. La via aerea (y su calibre y fijacion)
 * solo cambian por eventos: un control de rutina nunca la modifica.
 * Un AJUSTE_TUBO cambia los centimetros pero no es una intubacion.
 */
export function aplicarEventoAEpisodio(ep: Episodio, ev: EventoClinico): Episodio {
  switch (ev.tipo) {
    case "EXTUBACION_PROGRAMADA":
    case "AUTOEXTUBACION":
      return { ...ep, viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null };
    case "REINTUBACION":
      return { ...ep, viaAereaActual: ev.via, calibreVia: ev.calibre, fijacionCm: ev.fijacionCm };
    case "TRAQUEOSTOMIA":
      return { ...ep, viaAereaActual: "TQT", calibreVia: ev.calibre, fijacionCm: "Collarín" };
    case "AJUSTE_TUBO":
      return { ...ep, fijacionCm: ev.fijacionCm };
    case "CAMBIO_EQUIPOS":
      return { ...ep, equipos: ev.equipos };
    default:
      return ep;
  }
}
