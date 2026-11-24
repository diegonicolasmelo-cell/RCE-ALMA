/**
 * Filtros y sonda de aspiracion de circuito cerrado ("FECHAS FILTROS Y SONDA DE
 * ASPIRACION CIRCUITO CERRADO" de la hoja diaria).
 *
 * Se anota la fecha del cambio SOLO cuando se hace; el resto del tiempo el
 * sistema calcula cuanto le queda. No va atado a un control: es un evento.
 *   TrachCare 3 dias, filtro HEPA 3 dias, HME 2 dias.
 */

import type { Control, Episodio, EventoClinico, Modalidad } from "./tipos";

export type ElementoCircuito = "TRACHCARE" | "HEPA" | "HME";

export const VIDA_UTIL_DIAS: Readonly<Record<ElementoCircuito, number>> = { TRACHCARE: 3, HEPA: 3, HME: 2 };
export const ETIQUETA_ELEMENTO: Readonly<Record<ElementoCircuito, string>> = { TRACHCARE: "TrachCare", HEPA: "Filtro HEPA", HME: "Filtro HME" };

/**
 * POR_ESTADIA: HEPA de PB 840, PB 980 y AVEA (más grande, se pone al ingreso y dura toda la estadía:
 * uno por paciente). NO_APLICA: ese elemento no corresponde hoy (sin ventilador, humidificación activa…).
 */
export type EstadoFiltro = "SIN_REGISTRO" | "VIGENTE" | "VENCE_HOY" | "VENCIDO" | "POR_ESTADIA" | "NO_APLICA";

export interface VigenciaFiltro {
  readonly elemento: ElementoCircuito;
  readonly cambiadoEn: string | null;
  readonly venceFecha: string | null;
  /** Dias de calendario que quedan; 0 = vence hoy; negativo = vencido. */
  readonly diasRestantes: number | null;
  readonly estado: EstadoFiltro;
  /** La fecha viene del día 0 (ingreso o vía aérea nueva), no de un cambio registrado. */
  readonly desdeIngreso?: boolean;
}

/**
 * Lo que hace falta para decidir qué elemento corresponde (Diego, 24-nov-2026):
 *  · HEPA es del VENTILADOR (rama espiratoria): solo con un ventilador conectado. Desvinculado
 *    (tubo T, CTAF, válvula, O2) o sin ventilador ⇒ no hay HEPA. PB 840, PB 980 y AVEA usan uno
 *    por estadía; el resto (Servo U, Savina, Vela, Meckis…) 72 h.
 *  · HME = humidificación pasiva, 48 h, con TOT o TQT, ventilado o no. Con humidificación activa
 *    (MR850 con el ventilador, o CTAF = Airvo 2 por TQT) no hay HME.
 *  · TrachCare 72 h siempre con TOT o TQT.
 *  · Día 0: al ingresar o al instalar la vía aérea, todo parte nuevo ese día.
 */
export interface ContextoFiltros {
  readonly ep: Pick<Episodio, "viaAereaActual" | "equipos" | "ingresadoEn">;
  readonly ultimo?: Pick<Control, "ventilacion"> | null;
}

/** El contexto con el control más reciente (las listas vienen en distinto orden según la pantalla). */
export function contextoFiltros(ep: ContextoFiltros["ep"], controles: readonly Pick<Control, "ventilacion" | "registradoEn">[]): ContextoFiltros {
  const ultimo = controles.reduce<Pick<Control, "ventilacion" | "registradoEn"> | null>((m, c) => (!m || c.registradoEn > m.registradoEn ? c : m), null);
  return { ep, ultimo };
}

/** Modelos con HEPA de toda la estadía (por prefijo, como `HEPA_FIJO_EQUIPOS` del RCE). */
export const HEPA_POR_ESTADIA: readonly string[] = ["PB", "AVEA"];
const VENTILADAS: readonly Modalidad[] = ["ACVC", "PCV", "CPAP_PS", "VNI_CPAP", "VNI_ST", "AVAPS"];

/** Hora del corte de la etiqueta: desde las 20:00 se escribe la fecha del día siguiente. */
export const ETIQUETA_CORTE_HORA = 20;

/** La fecha que se escribe en la etiqueta a esta hora (de 20:00 a 19:59 va la del día siguiente). */
export function fechaEtiquetaAhora(ahora: Date): string {
  const d = new Date(ahora);
  if (d.getHours() >= ETIQUETA_CORTE_HORA) d.setDate(d.getDate() + 1);
  return ymd(d);
}

function ventiladorEnUso(ctx: ContextoFiltros) {
  return ctx.ep.equipos.find((e) => e.enUso && e.tipo === "VENTILADOR") ?? null;
}

/** ¿Corresponde este elemento ahora? Y si es HEPA, ¿es de toda la estadía? */
export function reglaFiltro(elemento: ElementoCircuito, ctx: ContextoFiltros): "APLICA" | "NO_APLICA" | "POR_ESTADIA" {
  const via = ctx.ep.viaAereaActual;
  if (via !== "TET" && via !== "TQT") return "NO_APLICA";
  const modalidad = ctx.ultimo?.ventilacion.modalidad ?? null;
  if (elemento === "TRACHCARE") return "APLICA";
  if (elemento === "HME") {
    const activa = modalidad === "CNAF_TQT" || ctx.ep.equipos.some((e) => e.enUso && (e.tipo === "HUMIDIFICADOR" || e.tipo === "ALTO_FLUJO"));
    return activa ? "NO_APLICA" : "APLICA";
  }
  const vent = ventiladorEnUso(ctx);
  if (!vent || (modalidad !== null && !VENTILADAS.includes(modalidad))) return "NO_APLICA";
  const modelo = vent.modelo.toUpperCase();
  return HEPA_POR_ESTADIA.some((p) => modelo.startsWith(p)) ? "POR_ESTADIA" : "APLICA";
}

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaUtc = (s: string): number => {
  const [a = 0, m = 1, d = 1] = s.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/** La fecha de la etiqueta: la que se anotó en la ronda o, si no, el día en que se registró el cambio. */
function fechaEtiquetaDe(e: EventoClinico): string {
  if ((e.tipo === "CAMBIO_HMEF" || e.tipo === "CAMBIO_FILTRO") && e.fechaEtiqueta && /^\d{4}-\d{2}-\d{2}$/.test(e.fechaEtiqueta)) return e.fechaEtiqueta;
  return fechaEtiquetaAhora(new Date(e.registradoEn));
}

/** Día 0: el momento del ingreso o de la última vía aérea nueva (intubación, reintubación, TQT, recambio). */
function momentoDiaCero(eventos: readonly EventoClinico[], ctx: ContextoFiltros): string | null {
  const vias = eventos.filter((e) => e.tipo === "REINTUBACION" || e.tipo === "TRAQUEOSTOMIA" || e.tipo === "CAMBIO_TUBO" || e.tipo === "CAMBIO_CANULA")
    .map((e) => e.registradoEn).sort();
  return vias[vias.length - 1] ?? ctx.ep.ingresadoEn ?? null;
}

function elementoDe(e: EventoClinico): ElementoCircuito | null {
  if (e.tipo === "CAMBIO_HMEF") return "HME";
  if (e.tipo === "CAMBIO_FILTRO") return e.elemento;
  return null;
}

/**
 * Vigencia de cada elemento. Con `ctx` (el episodio y su último control) se aplican las reglas por
 * equipo y el día 0; sin él, se calcula como antes (solo desde los cambios registrados).
 * «Hoy» también es la fecha de etiqueta (corte 20:00): una etiqueta del 25 se pone desde el 24 a las 20:00.
 */
export function vigenciaFiltros(eventos: readonly EventoClinico[], ahora: Date, ctx?: ContextoFiltros): readonly VigenciaFiltro[] {
  const hoy = fechaEtiquetaAhora(ahora);
  return (Object.keys(VIDA_UTIL_DIAS) as ElementoCircuito[]).map((elemento) => {
    const regla = ctx ? reglaFiltro(elemento, ctx) : "APLICA";
    const cambios = eventos
      .filter((e) => elementoDe(e) === elemento)
      .sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
    const ultimo = cambios[cambios.length - 1];
    const momentoCero = ctx ? momentoDiaCero(eventos, ctx) : null;
    // Manda la ÚLTIMA anotación (como en el RCE), aunque diga una fecha antigua: lo que cuenta es CUÁNDO se
    // anotó. Solo un ingreso o una vía aérea nueva DESPUÉS de ese registro vuelve a día 0.
    const fechaCambio = ultimo ? fechaEtiquetaDe(ultimo) : null;
    const ceroDespues = momentoCero !== null && (!ultimo || momentoCero > ultimo.registradoEn);
    const fecha = ceroDespues ? fechaEtiquetaAhora(new Date(momentoCero)) : fechaCambio;
    if (regla === "NO_APLICA") return { elemento, cambiadoEn: fecha, venceFecha: null, diasRestantes: null, estado: "NO_APLICA" };
    if (regla === "POR_ESTADIA") return { elemento, cambiadoEn: fecha, venceFecha: null, diasRestantes: null, estado: "POR_ESTADIA" };
    if (!fecha) return { elemento, cambiadoEn: null, venceFecha: null, diasRestantes: null, estado: "SIN_REGISTRO" };
    const desdeIngreso = fecha !== fechaCambio;
    const vence = new Date(diaUtc(fecha) + VIDA_UTIL_DIAS[elemento] * 86_400_000);
    const venceFecha = vence.toISOString().slice(0, 10);
    const restantes = Math.round((diaUtc(venceFecha) - diaUtc(hoy)) / 86_400_000);
    return {
      elemento,
      cambiadoEn: fecha,
      venceFecha,
      diasRestantes: restantes,
      estado: restantes < 0 ? "VENCIDO" : restantes === 0 ? "VENCE_HOY" : "VIGENTE",
      ...(desdeIngreso ? { desdeIngreso: true } : {})
    };
  });
}

/** Elementos que requieren atencion hoy (vencidos o que vencen hoy). */
export function filtrosPorCambiar(eventos: readonly EventoClinico[], ahora: Date, ctx?: ContextoFiltros): readonly VigenciaFiltro[] {
  return vigenciaFiltros(eventos, ahora, ctx).filter((v) => v.estado === "VENCIDO" || v.estado === "VENCE_HOY");
}

/** Elemento de circuito de un evento de cambio (para la ronda y el RCE). */
export function elementoDeCambio(e: EventoClinico): ElementoCircuito | null {
  return elementoDe(e);
}
