/**
 * Reductores sobre el log de eventos clinicos.
 *
 * Los estados que el informe pide (via aerea vigente, horas acumuladas de prono,
 * cronometro de PVE) NO se almacenan: se derivan del log append-only. Esa es la
 * razon de separar Evento de Control (docs/PLAN-MAESTRO.md cap. 4.3) y es lo que
 * hace imposible que el contador de prono quede desincronizado de los hechos.
 */

import type { Control, Episodio, EventoClinico, TipoEvento, ViaAerea } from "./tipos";
import { EVENTOS_DE_RIESGO } from "./tipos";
import { equiposParaVia, equiposSegunModalidad, ponerEnUso } from "./equipos";

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
      case "DECANULACION":
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
      case "CAMBIO_TUBO":
      case "CAMBIO_CANULA":
      case "EVALUACION_PVE":
      case "CONTROL_PVE":
      case "REEVAL_POST_EXTUB":
      case "FALLA_POST_EXTUB":
      case "INICIO_PVE":
      case "FIN_PVE":
      case "PVE_SIN_EXTUBAR":
      case "INICIO_PRONO":
      case "SUPINACION":
      case "INICIO_BNM":
      case "FIN_BNM":
      case "SUSPENSION_SEDACION":
      case "SUSPENSION_DVA":
      case "PCR":
      case "EVENTO_CENTINELA":
      case "EVENTO_LIBRE":
      case "ASISTENCIA_FBC":
      case "CAMBIO_HMEF":
      case "CAMBIO_FILTRO":
      case "EVALUACION_PUNTUAL":
      case "TRASLADO_CAMA":
      case "CAMBIO_EQUIPOS":
      case "RONDA_EQUIPOS":
      case "DESVINCULACION":
      case "RECONEXION":
      case "ASISTENCIA_PROCEDIMIENTO":
      case "TOMA_CULTIVO":
      case "TRASLADO_IMAGEN":
      case "PVE_NO_REALIZADA":
      case "TERAPIA_FISICA":
      case "IMT":
      case "EDUCACION":
      case "ANULACION_EVENTO":
      case "CORRECCION_EVENTO":
      case "NOTA_ENTREGA":
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

/**
 * Una intubacion es REintubacion si antes, en el mismo episodio, se retiro la via aerea
 * (extubacion programada, autoextubacion o decanulacion). El paciente que llega con via
 * natural y se intuba por primera vez tiene una intubacion, no una reintubacion.
 * Un recambio de tubo o de canula nunca es reintubacion: el paciente no dejo la VM.
 */
export function esReintubacion(ev: EventoClinico, eventos: readonly EventoClinico[]): boolean {
  if (ev.tipo !== "REINTUBACION") return false;
  return eventos.some(
    (x) => (x.tipo === "EXTUBACION_PROGRAMADA" || x.tipo === "AUTOEXTUBACION" || x.tipo === "DECANULACION") && x.registradoEn <= ev.registradoEn && x.id !== ev.id
  );
}

/** Solo las reintubaciones (para la estadistica): las primeras intubaciones no cuentan. */
export function contarReintubaciones(eventos: readonly EventoClinico[]): number {
  return eventos.filter((e) => esReintubacion(e, eventos)).length;
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
  const r = aplicarEventoBase(ep, ev);
  // Si el evento cambió la vía aérea, queda sellado cuándo (ver Episodio.viaDesde).
  if (r !== ep && (r.viaAereaActual !== ep.viaAereaActual || r.calibreVia !== ep.calibreVia || r.fijacionCm !== ep.fijacionCm)) {
    return { ...r, viaDesde: ev.registradoEn };
  }
  return r;
}

/** Los eventos que cuentan: sin los anulados por coordinación ni las marcas de anulación. */
export function sinAnulados(eventos: readonly EventoClinico[]): readonly EventoClinico[] {
  const anulados = new Set(eventos.filter((e) => e.tipo === "ANULACION_EVENTO").map((e) => (e as Extract<EventoClinico, { tipo: "ANULACION_EVENTO" }>).anulaId));
  const vivos = anulados.size ? eventos.filter((e) => e.tipo !== "ANULACION_EVENTO" && !anulados.has(e.id)) : eventos;
  return conCorrecciones(vivos);
}

/**
 * Aplica las correcciones de hora de coordinación (26-nov-2026). Vale la ÚLTIMA corrección de cada evento;
 * el evento queda con esa hora en `registradoEn`, `hora` y, si la tiene, `realizadaEn` (todo cálculo de
 * horas —prono, VM, filtros— lee de ahí). Las marcas de corrección no se muestran.
 */
export function conCorrecciones(eventos: readonly EventoClinico[]): readonly EventoClinico[] {
  type Corr = Extract<EventoClinico, { tipo: "CORRECCION_EVENTO" }>;
  const marcas = eventos.filter((e): e is Corr => e.tipo === "CORRECCION_EVENTO");
  if (!marcas.length) return eventos;
  const ultima = new Map<string, Corr>();
  for (const m of [...marcas].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn))) {
    if (instante(m.en) !== null) ultima.set(m.corrigeId, m);
  }
  return eventos.filter((e) => e.tipo !== "CORRECCION_EVENTO").map((e) => {
    const c = ultima.get(e.id);
    if (!c) return e;
    const d = new Date(c.en);
    const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const nuevo = { ...e, registradoEn: d.toISOString(), hora } as EventoClinico & { realizadaEn?: string };
    return ("realizadaEn" in e ? { ...nuevo, realizadaEn: d.toISOString() } : nuevo) as EventoClinico;
  });
}

/** De dos copias de un mismo episodio, la vía aérea que vale: la del cambio más reciente. */
export function viaMasReciente(a: Episodio, b: Episodio): Episodio {
  return (b.viaDesde ?? "") > (a.viaDesde ?? "") ? b : a;
}

/** `base` con la vía aérea de `fuente` (vía, calibre, fijación y su sello). */
export function conViaDe(base: Episodio, fuente: Episodio): Episodio {
  if (base === fuente || (base.viaDesde ?? "") === (fuente.viaDesde ?? "")) return base;
  return { ...base, viaAereaActual: fuente.viaAereaActual, calibreVia: fuente.calibreVia, fijacionCm: fuente.fijacionCm, ...(fuente.viaDesde ? { viaDesde: fuente.viaDesde } : {}) };
}

function aplicarEventoBase(ep: Episodio, ev: EventoClinico): Episodio {
  switch (ev.tipo) {
    case "EXTUBACION_PROGRAMADA":
    case "AUTOEXTUBACION":
    case "DECANULACION": {
      // El ventilador se queda en la sala sin uso; si la cama ya tiene la CNAF o el V60 con que
      // quedo, ese pasa a estar en uso.
      const sinVm = equiposParaVia(ep.equipos, "NATURAL");
      const tipo = ev.dispositivo === "CNAF" ? "ALTO_FLUJO" : ev.dispositivo === "VMNI" ? "VMNI" : null;
      const nuevo = tipo ? sinVm.find((e) => e.tipo === tipo) : undefined;
      return { ...ep, viaAereaActual: "NATURAL", calibreVia: null, fijacionCm: null, equipos: nuevo ? ponerEnUso(sinVm, nuevo) : sinVm };
    }
    case "CAMBIO_TUBO":
      return { ...ep, calibreVia: ev.calibre, fijacionCm: ev.fijacionCm };
    case "CAMBIO_CANULA":
      return { ...ep, calibreVia: ev.calibre };
    case "REINTUBACION": {
      // Se vuelve a conectar al ventilador de la sala.
      const equipos = equiposParaVia(ep.equipos, ev.via);
      const vent = equipos.find((e) => e.tipo === "VENTILADOR");
      return { ...ep, viaAereaActual: ev.via, calibreVia: ev.calibre, fijacionCm: ev.fijacionCm, equipos: vent ? ponerEnUso(equipos, vent) : equipos };
    }
    case "TRAQUEOSTOMIA":
      return { ...ep, viaAereaActual: "TQT", calibreVia: ev.calibre, fijacionCm: "Collarín" };
    case "AJUSTE_TUBO":
      return { ...ep, fijacionCm: ev.fijacionCm };
    case "CAMBIO_EQUIPOS":
      return { ...ep, equipos: ev.equipos };
    case "TRASLADO_CAMA":
      return { ...ep, cama: ev.hasta, ...(ev.equiposNuevos ? { equipos: ev.equiposNuevos } : {}) };
    case "DESVINCULACION":
    case "RECONEXION":
      return { ...ep, equipos: equiposSegunModalidad(ep.equipos, ev.hasta) };
    default:
      return ep;
  }
}

// ---------------------------------------------------------------------------
// Eventos que se monitorizan con un control
// ---------------------------------------------------------------------------

/**
 * Casi todo evento se acompana de un control (p. ej. en una puncion lumbar se titula el VM; la
 * aspiracion de un cultivo puede descompensar). Quedan fuera los cambios de filtro y TrachCare,
 * el cambio de cama, la correccion de la via sin evento, las evaluaciones y lo propio de la PVE.
 * Tampoco el ajuste de la posicion del tubo (Diego, 26-nov-2026: no da origen a una monitorizacion).
 */
export const TIPOS_CON_CONTROL: ReadonlySet<TipoEvento> = new Set<TipoEvento>([
  "REINTUBACION", "EXTUBACION_PROGRAMADA", "AUTOEXTUBACION", "DECANULACION", "TRAQUEOSTOMIA",
  "CAMBIO_TUBO", "CAMBIO_CANULA", "INICIO_PRONO", "SUPINACION", "ASISTENCIA_FBC",
  "ASISTENCIA_PROCEDIMIENTO", "TOMA_CULTIVO", "TRASLADO_IMAGEN", "PCR", "EVENTO_CENTINELA", "EVENTO_LIBRE"
]);

export const pideControl = (ev: EventoClinico): boolean =>
  TIPOS_CON_CONTROL.has(ev.tipo) &&
  // Toda extubacion (por PVE o fuera de protocolo) se sigue con sus controles post extubacion
  // (inmediato, 30, 60 y 120 min y 48 h), no con un control general.
  ev.tipo !== "EXTUBACION_PROGRAMADA" &&
  // Quien registra decide si el evento lleva control; si dijo que no, no queda pendiente.
  ev.sinControl !== true;

/** Eventos que piden control y aun no tienen ninguno despues (ni uno ligado a ellos). */
export function eventosSinMonitorizar(eventos: readonly EventoClinico[], controles: readonly Control[]): readonly EventoClinico[] {
  const ligados = new Set(controles.map((c) => c.eventoId).filter(Boolean));
  const ultimo = controles.reduce((m, c) => (c.registradoEn > m ? c.registradoEn : m), "");
  return eventos.filter((e) => pideControl(e) && !ligados.has(e.id) && e.registradoEn > ultimo);
}
