/**
 * Flujo de la prueba de ventilacion espontanea (PVE), segun el protocolo de
 * weaning y la hoja "Registro PVE" del hospital.
 *
 *   1. Checklist: los 8 criterios del protocolo ("INICIO PVE cumple con 8
 *      criterios"). Si no cumple, la PVE no se inicia.
 *   2. Control inicial: ahi parte el cronometro (INICIO_PVE).
 *   3. Control a los 30 min, y fin: tolerada / no tolerada.
 *   4. Si se extuba: reevaluaciones a 0 (extubacion), 30, 60, 120 min y 48 h,
 *      y al final "falla post extubacion" SI/NO con hipotesis y observaciones.
 *
 * Todo se deriva del log de eventos (append-only): la fase nunca se guarda.
 */

import { turnoDe } from "./turnos";
import type { EventoClinico, LecturasPve, Modalidad, MomentoPostExtub, TurnoClave, ViaAerea } from "./tipos";
import { esViaAereaArtificial } from "./fisiologia";
import { estadoPve } from "./eventos";
import type { EstadoPve } from "./eventos";

/** Los 8 criterios, tal cual la hoja "Evaluacion prueba de ventilacion espontanea". */
export const CRITERIOS_PVE: readonly string[] = [
  "Resolución del cuadro",
  "Signos de infección",
  "DVA",
  "PaFi",
  "Volumen minuto",
  "GCS / SAS",
  "Estab. metab. o vías de corrección",
  "Hb ≥ 7"
];

export const MOMENTOS_POST_EXTUB: readonly { readonly id: MomentoPostExtub; readonly etiqueta: string; readonly minutos: number }[] = [
  { id: "EXTUB", etiqueta: "Extubación", minutos: 0 },
  { id: "30MIN", etiqueta: "30 min", minutos: 30 },
  { id: "60MIN", etiqueta: "60 min", minutos: 60 },
  { id: "120MIN", etiqueta: "120 min", minutos: 120 },
  { id: "48H", etiqueta: "48 h", minutos: 48 * 60 }
];

export const etiquetaMomentoPostExtub = (m: MomentoPostExtub): string =>
  MOMENTOS_POST_EXTUB.find((x) => x.id === m)?.etiqueta ?? m;

type Evento<T extends EventoClinico["tipo"]> = Extract<EventoClinico, { tipo: T }>;

/**
 * Orden de un mismo instante: el inicio de la PVE y su control inicial se guardan en el
 * mismo milisegundo, y el empate no puede quedar al azar (el control quedaria "antes" del
 * inicio y se perderia).
 */
const ORDEN_MISMO_INSTANTE: Partial<Record<EventoClinico["tipo"], number>> = {
  EVALUACION_PVE: 0,
  INICIO_PVE: 1,
  CONTROL_PVE: 2,
  FIN_PVE: 3,
  EXTUBACION_PROGRAMADA: 4,
  REEVAL_POST_EXTUB: 5,
  FALLA_POST_EXTUB: 6,
  REINTUBACION: 7
};
const rango = (e: EventoClinico): number => ORDEN_MISMO_INSTANTE[e.tipo] ?? 9;

const ordenados = (eventos: readonly EventoClinico[]): EventoClinico[] =>
  [...eventos].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn) || rango(a) - rango(b));

/** `true` si los 8 criterios cumplen. Con menos de 8 respuestas no hay aptitud. */
export function criteriosAptos(criterios: readonly boolean[]): boolean {
  return criterios.length === CRITERIOS_PVE.length && criterios.every(Boolean);
}

export type FasePve =
  | "SIN_CHECKLIST"
  | "NO_APTO"
  | "APTO"
  | "EN_CURSO"
  | "TERMINADA"
  | "POST_EXTUBACION";

export interface MomentoPendiente {
  readonly id: MomentoPostExtub;
  readonly etiqueta: string;
  /** Hora ISO en que corresponde. */
  readonly venceEn: string;
  readonly registrado: boolean;
  /** Minutos que faltan (<0 si ya paso la hora). */
  readonly minutosFaltantes: number;
}

export interface BloquePostExtub {
  readonly extubadoEn: string;
  readonly horaExtubacion: string;
  readonly momentos: readonly MomentoPendiente[];
  readonly falla: Evento<"FALLA_POST_EXTUB"> | null;
  /** Hubo reintubacion despues: el bloque queda cerrado. */
  readonly reintubado: boolean;
}

export interface EstadoFlujoPve {
  readonly fase: FasePve;
  /** Ultimo checklist registrado en el turno en curso. */
  readonly checklist: Evento<"EVALUACION_PVE"> | null;
  readonly pve: EstadoPve;
  readonly controlInicial: boolean;
  readonly control30: boolean;
  readonly bloque: BloquePostExtub | null;
}

/** Checklist del turno en curso (el mas reciente). Cada turno evalua de nuevo. */
export function checklistDelTurno(
  eventos: readonly EventoClinico[],
  turno: TurnoClave
): Evento<"EVALUACION_PVE"> | null {
  const lista = ordenados(eventos).filter(
    (e): e is Evento<"EVALUACION_PVE"> => e.tipo === "EVALUACION_PVE" && turnoDe(new Date(e.registradoEn)).clave === turno
  );
  return lista[lista.length - 1] ?? null;
}

export function puedeIniciarPve(eventos: readonly EventoClinico[], ahora: Date): boolean {
  const c = checklistDelTurno(eventos, turnoDe(ahora).clave);
  return c !== null && c.apto && !estadoPve(eventos, ahora).activa;
}

/** Bloques post extubacion (hasta 2 por hoja), del mas antiguo al mas nuevo. */
export function bloquesPostExtub(eventos: readonly EventoClinico[], ahora: Date): BloquePostExtub[] {
  const lista = ordenados(eventos);
  const bloques: BloquePostExtub[] = [];
  lista.forEach((ev, i) => {
    if (ev.tipo !== "EXTUBACION_PROGRAMADA") return;
    const base = new Date(ev.registradoEn).getTime();
    if (!Number.isFinite(base)) return;
    const siguiente = lista.slice(i + 1).find((x) => x.tipo === "EXTUBACION_PROGRAMADA" || x.tipo === "REINTUBACION");
    const fin = siguiente ? siguiente.registradoEn : "9999";
    const propios = lista.slice(i + 1).filter((x) => x.registradoEn < fin);
    const reevals = propios.filter((x): x is Evento<"REEVAL_POST_EXTUB"> => x.tipo === "REEVAL_POST_EXTUB");
    const fallas = propios.filter((x): x is Evento<"FALLA_POST_EXTUB"> => x.tipo === "FALLA_POST_EXTUB");
    bloques.push({
      extubadoEn: ev.registradoEn,
      horaExtubacion: ev.hora,
      momentos: MOMENTOS_POST_EXTUB.map((m) => {
        const vence = base + m.minutos * 60_000;
        return {
          id: m.id,
          etiqueta: m.etiqueta,
          venceEn: new Date(vence).toISOString(),
          registrado: reevals.some((r) => r.momento === m.id),
          minutosFaltantes: Math.ceil((vence - ahora.getTime()) / 60_000)
        };
      }),
      falla: fallas[fallas.length - 1] ?? null,
      reintubado: siguiente?.tipo === "REINTUBACION"
    });
  });
  return bloques;
}

/** Fase actual del flujo, derivada del log. */
export function estadoFlujoPve(eventos: readonly EventoClinico[], ahora: Date): EstadoFlujoPve {
  const lista = ordenados(eventos);
  const pve = estadoPve(lista, ahora);
  const checklist = checklistDelTurno(lista, turnoDe(ahora).clave);
  const bloques = bloquesPostExtub(lista, ahora);
  const ultimoBloque = bloques[bloques.length - 1] ?? null;
  const bloqueVigente = ultimoBloque && !ultimoBloque.reintubado ? ultimoBloque : null;

  // Controles de la PVE en curso o la ultima: los posteriores al ultimo INICIO_PVE.
  const idxInicio = lista.map((e) => e.tipo).lastIndexOf("INICIO_PVE");
  const desde = idxInicio >= 0 ? lista.slice(idxInicio) : [];
  const controles = desde.filter((e): e is Evento<"CONTROL_PVE"> => e.tipo === "CONTROL_PVE");
  const controlInicial = controles.some((c) => c.fase === "INICIAL");
  const control30 = controles.some((c) => c.fase === "30MIN");

  let fase: FasePve;
  if (pve.activa) fase = "EN_CURSO";
  else if (bloqueVigente) fase = "POST_EXTUBACION";
  else if (idxInicio >= 0 && desde.some((e) => e.tipo === "FIN_PVE") && (!checklist || checklist.registradoEn < (desde[0]?.registradoEn ?? ""))) fase = "TERMINADA";
  else if (!checklist) fase = "SIN_CHECKLIST";
  else fase = checklist.apto ? "APTO" : "NO_APTO";

  return { fase, checklist, pve, controlInicial, control30, bloque: bloqueVigente };
}

// ---------------------------------------------------------------------------
// Hoja de registro de PVE (para el PC): PVE 1..3 y bloques post extubacion
// ---------------------------------------------------------------------------

export interface RegistroPve {
  readonly numero: number;
  readonly fecha: string;
  readonly inicio: Evento<"CONTROL_PVE"> | null;
  readonly treintaMin: Evento<"CONTROL_PVE"> | null;
  readonly fin: Evento<"FIN_PVE"> | null;
  readonly checklist: Evento<"EVALUACION_PVE"> | null;
}

export function registrosPve(eventos: readonly EventoClinico[]): RegistroPve[] {
  const lista = ordenados(eventos);
  const res: RegistroPve[] = [];
  lista.forEach((ev, i) => {
    if (ev.tipo !== "INICIO_PVE") return;
    const sig = lista.slice(i + 1).findIndex((x) => x.tipo === "INICIO_PVE");
    const tramo = sig >= 0 ? lista.slice(i, i + 1 + sig) : lista.slice(i);
    const controles = tramo.filter((x): x is Evento<"CONTROL_PVE"> => x.tipo === "CONTROL_PVE");
    const previas = lista.slice(0, i).filter((x): x is Evento<"EVALUACION_PVE"> => x.tipo === "EVALUACION_PVE");
    res.push({
      numero: res.length + 1,
      fecha: ev.registradoEn.slice(0, 10),
      inicio: controles.find((c) => c.fase === "INICIAL") ?? null,
      treintaMin: controles.find((c) => c.fase === "30MIN") ?? null,
      fin: tramo.find((x): x is Evento<"FIN_PVE"> => x.tipo === "FIN_PVE") ?? null,
      checklist: previas[previas.length - 1] ?? null
    });
  });
  return res;
}

/** Entrada directa a la PVE desde la tarjeta de la cama: que ofrecer y si destacarlo. */
export interface AccesoPve {
  readonly texto: string;
  /** Hay algo pendiente ahora (PVE en curso, control vencido): boton principal. */
  readonly destacado: boolean;
}

/**
 * Cuando la tarjeta de la cama ofrece entrar directo a la PVE, sin pasar por el control.
 * Un paciente ventilado en CPAP/PS es candidato a la evaluacion diaria; lo que ya esta en
 * marcha (PVE en curso, extubacion por registrar, controles post extubacion) se ofrece
 * siempre. La PVE vive SOLO en la tarjeta (no es una pestana del control): todo paciente
 * ventilado tiene su boton. Con la via aerea natural y nada pendiente, no se ofrece.
 */
export function accesoPve(via: ViaAerea, modalidad: Modalidad | null, eventos: readonly EventoClinico[], ahora: Date): AccesoPve | null {
  const f = estadoFlujoPve(eventos, ahora);
  // Lo mas urgente primero: un control post extubacion que ya toca.
  if (f.bloque && f.bloque.momentos.some((m) => !m.registrado && m.minutosFaltantes <= 0 && m.id !== "48H")) {
    return { texto: "Post extubación: registrar", destacado: true };
  }
  if (f.fase === "EN_CURSO") return { texto: "Continuar PVE", destacado: true };
  if (!esViaAereaArtificial(via)) return null;
  if (f.fase === "TERMINADA") return { texto: "PVE terminada: registrar extubación", destacado: true };
  if (f.fase === "APTO") return { texto: "Iniciar PVE", destacado: true };
  if (f.fase === "NO_APTO") return { texto: "PVE diaria: no apto este turno", destacado: false };
  if (modalidad === "CPAP_PS") return { texto: "Evaluar PVE diaria", destacado: false };
  // Ventilado en otra modalidad: la PVE sigue a mano en la tarjeta, sin destacarla.
  return { texto: "PVE", destacado: false };
}

/** Una fila del contraste entre el control de inicio y el de termino de la PVE. */
export interface FilaContrastePve {
  readonly etiqueta: string;
  readonly unidad: string;
  readonly inicio: string;
  readonly termino: string;
  /** "+6", "-2", "=" o null si no hay los dos valores numericos. */
  readonly diferencia: string | null;
}

/** Las filas de la hoja de PVE, en su orden: FC, FR, PA, SpO2, GCS, volumen minuto, trabajo y secreciones. */
export function contrastarControlesPve(inicio: LecturasPve, termino: LecturasPve | null): readonly FilaContrastePve[] {
  const texto = (v: number | null): string => (v === null ? "—" : String(v));
  const dif = (a: number | null, b: number | null): string | null => {
    if (a === null || b === null) return null;
    const d = Math.round((b - a) * 10) / 10;
    return d === 0 ? "=" : d > 0 ? `+${d}` : String(d);
  };
  const pa = (l: LecturasPve | null): string => (l && (l.pas !== null || l.pad !== null) ? `${texto(l.pas)}/${texto(l.pad)}` : "—");
  const num = (etiqueta: string, unidad: string, k: "fc" | "fr" | "spo2" | "gcs" | "volMinuto"): FilaContrastePve => ({
    etiqueta,
    unidad,
    inicio: texto(inicio[k]),
    termino: termino ? texto(termino[k]) : "—",
    diferencia: termino ? dif(inicio[k], termino[k]) : null
  });
  const cat = (etiqueta: string, k: "trabajoResp" | "secreciones"): FilaContrastePve => ({
    etiqueta,
    unidad: "",
    inicio: inicio[k] || "—",
    termino: termino ? termino[k] || "—" : "—",
    diferencia: null
  });
  return [
    num("Frec. cardiaca", "lpm", "fc"),
    num("Frec. respiratoria", "rpm", "fr"),
    { etiqueta: "Presión arterial", unidad: "mmHg", inicio: pa(inicio), termino: pa(termino), diferencia: termino ? dif(inicio.pas, termino.pas) : null },
    num("SpO₂", "%", "spo2"),
    num("GCS", "", "gcs"),
    num("Volumen minuto", "L/min", "volMinuto"),
    cat("Trabajo respiratorio", "trabajoResp"),
    cat("Secreciones bronquiales", "secreciones")
  ];
}
