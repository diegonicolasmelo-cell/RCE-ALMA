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
import type { EventoClinico, MomentoPostExtub, TurnoClave } from "./tipos";
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

const ordenados = (eventos: readonly EventoClinico[]): EventoClinico[] =>
  [...eventos].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));

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
