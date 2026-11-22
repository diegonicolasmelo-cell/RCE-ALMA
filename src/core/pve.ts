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

import { HORA_INICIO_DIA, HORA_INICIO_NOCHE, turnoDe } from "./turnos";
import type { Episodio, EventoClinico, LecturasPve, Modalidad, MomentoPostExtub, TurnoClave, ViaAerea } from "./tipos";
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

/**
 * Controles post extubacion y su plazo para anotarlos (Diego, 22-nov-2026): cada uno se anota desde
 * su hora (con 5 min de anticipacion) hasta la hora del siguiente; el de 120 min, hasta las 6 h. Pasado
 * el plazo queda DESIERTO: deja de pedirse y no se puede anotar despues (nada retroactivo). El control
 * de 48 h se elimino: el fracaso a 24 h (oficial) y a 48 h (interno) se cuenta solo, con la reintubacion.
 */
export const MOMENTOS_POST_EXTUB: readonly { readonly id: MomentoPostExtub; readonly etiqueta: string; readonly minutos: number; readonly hastaMin: number }[] = [
  { id: "EXTUB", etiqueta: "Extubación", minutos: 0, hastaMin: 30 },
  { id: "30MIN", etiqueta: "30 min", minutos: 30, hastaMin: 60 },
  { id: "60MIN", etiqueta: "60 min", minutos: 60, hastaMin: 120 },
  { id: "120MIN", etiqueta: "120 min", minutos: 120, hastaMin: 6 * 60 }
];

/** Minutos antes de su hora en que un control post extubacion ya se puede anotar. */
export const ANTICIPO_POST_EXTUB_MIN = 5;

/** Horas tras la extubacion que se vigila la falla; el bloque se cierra al terminar ese turno. */
export const HORAS_VIGILANCIA_POST_EXTUB = 48;

/** Fin del turno que contiene un instante (turnos de 8 y 20). */
function finDeTurno(t: Date): Date {
  const tr = turnoDe(t);
  const [y, m, d] = tr.fecha.split("-").map(Number) as [number, number, number];
  return tr.tipo === "DIA" ? new Date(y, m - 1, d, HORA_INICIO_NOCHE, 0) : new Date(y, m - 1, d + 1, HORA_INICIO_DIA, 0);
}

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
  PVE_SIN_EXTUBAR: 4,
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
  /** La PVE de este turno ya se cerro: no tolerada, o tolerada sin extubar. */
  | "CERRADA"
  | "POST_EXTUBACION";

/** HECHO · TOCA (se puede anotar ahora) · PROXIMO (aun no) · DESIERTO (paso el plazo sin anotarse). */
export type EstadoMomento = "HECHO" | "TOCA" | "PROXIMO" | "DESIERTO";

export interface MomentoPendiente {
  readonly id: MomentoPostExtub;
  readonly etiqueta: string;
  /** Hora ISO en que corresponde. */
  readonly venceEn: string;
  /** Hora ISO hasta la que se puede anotar. */
  readonly hastaEn: string;
  readonly registrado: boolean;
  /** Minutos que faltan (<0 si ya paso la hora). */
  readonly minutosFaltantes: number;
  readonly estado: EstadoMomento;
}

export interface BloquePostExtub {
  readonly extubadoEn: string;
  readonly horaExtubacion: string;
  readonly momentos: readonly MomentoPendiente[];
  readonly falla: Evento<"FALLA_POST_EXTUB"> | null;
  /** Hubo reintubacion despues: el bloque queda cerrado. */
  readonly reintubado: boolean;
  /** Fin de la vigilancia: el termino del turno en que se cumplen las 48 h. */
  readonly cierraEn: string;
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
        const hasta = base + m.hastaMin * 60_000;
        const registrado = reevals.some((r) => r.momento === m.id);
        const t = ahora.getTime();
        const estado: EstadoMomento = registrado ? "HECHO" : t >= hasta ? "DESIERTO" : t >= vence - ANTICIPO_POST_EXTUB_MIN * 60_000 ? "TOCA" : "PROXIMO";
        return {
          id: m.id,
          etiqueta: m.etiqueta,
          venceEn: new Date(vence).toISOString(),
          hastaEn: new Date(hasta).toISOString(),
          registrado,
          minutosFaltantes: Math.ceil((vence - t) / 60_000),
          estado
        };
      }),
      falla: fallas[fallas.length - 1] ?? null,
      reintubado: siguiente?.tipo === "REINTUBACION",
      cierraEn: finDeTurno(new Date(base + HORAS_VIGILANCIA_POST_EXTUB * 3600_000)).toISOString()
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
  // La vigilancia termina con la reintubacion o al cerrar el turno de las 48 h (Diego, 22-nov-2026).
  const bloqueVigente = ultimoBloque && !ultimoBloque.reintubado && ahora.getTime() < Date.parse(ultimoBloque.cierraEn) ? ultimoBloque : null;
  const bloqueCerrado = ultimoBloque !== null && !ultimoBloque.reintubado && bloqueVigente === null;

  // Controles de la PVE en curso o la ultima: los posteriores al ultimo INICIO_PVE.
  const idxInicio = lista.map((e) => e.tipo).lastIndexOf("INICIO_PVE");
  const desde = idxInicio >= 0 ? lista.slice(idxInicio) : [];
  const controles = desde.filter((e): e is Evento<"CONTROL_PVE"> => e.tipo === "CONTROL_PVE");
  const controlInicial = controles.some((c) => c.fase === "INICIAL");
  const control30 = controles.some((c) => c.fase === "30MIN");

  let fase: FasePve;
  if (pve.activa) fase = "EN_CURSO";
  else if (bloqueVigente) fase = "POST_EXTUBACION";
  // Extubado y ya cerrada la vigilancia: no queda nada de esa PVE por hacer.
  else if (bloqueCerrado && idxInicio >= 0 && lista[idxInicio]!.registradoEn <= ultimoBloque!.extubadoEn) fase = "CERRADA";
  else if (
    idxInicio >= 0 &&
    desde.some((e) => e.tipo === "FIN_PVE") &&
    // Un checklist nuevo DESPUES del termino abre otra PVE. El inicio puede quedar con una hora
    // real anterior a la del checklist (se anoto unos minutos despues): eso no la invalida.
    (!checklist || checklist.registradoEn <= ([...desde].reverse().find((e) => e.tipo === "FIN_PVE")?.registradoEn ?? ""))
  ) {
    // Tolerada: queda por registrar la extubacion (o que se supero sin extubar). No tolerada: cerrada.
    const fin = [...desde].reverse().find((e): e is Evento<"FIN_PVE"> => e.tipo === "FIN_PVE");
    const sinExtubar = desde.some((e) => e.tipo === "PVE_SIN_EXTUBAR");
    fase = fin?.exitosa && !sinExtubar ? "TERMINADA" : "CERRADA";
  }
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

/** El ultimo control, para decidir si se puede iniciar una PVE: su modalidad y cuando se registro. */
export interface UltimoControlPve {
  readonly modalidad: Modalidad | null;
  readonly registradoEn: string;
}

/** Cuando fue la intubacion vigente (la ultima reintubacion registrada), o null si no hay. */
function inicioTuboActual(eventos: readonly EventoClinico[]): string | null {
  const r = ordenados(eventos).filter((e) => e.tipo === "REINTUBACION");
  return r.at(-1)?.registradoEn ?? null;
}

/**
 * Desde cuando corre la VM del tubo actual: la ultima intubacion registrada; si no hay, y el
 * paciente sigue con via aerea artificial, la hora de su ingreso (llego ventilado: hora cero de
 * la unidad, sin contar la urgencia).
 */
export function inicioVm(ep: Pick<Episodio, "viaAereaActual" | "ingresadoEn">, eventos: readonly EventoClinico[]): string | null {
  return inicioTuboActual(eventos) ?? (ep.viaAereaActual !== "NATURAL" ? ep.ingresadoEn ?? null : null);
}

/** Horas de ventilacion mecanica del tubo actual, o null si no se puede saber. */
export interface HorasVm {
  readonly horas: number;
  /** Desde cuando se cuenta (ISO). */
  readonly desde: string | null;
}

/**
 * Cuantas horas lleva el tubo actual. Manda la ultima intubacion registrada como evento; si no
 * hay, un episodio que ya trae dias de VM lleva al menos esos dias; si llego intubado hoy, se
 * cuenta desde el primer control del episodio. `null` si no hay de donde contar.
 */
export function horasDeVm(
  ep: Pick<Episodio, "viaAereaActual" | "ingresadoEn" | "diasVM">,
  eventos: readonly EventoClinico[],
  primerControlEn: string | null,
  ahora: Date
): HorasVm | null {
  const inicio = inicioVm(ep, eventos);
  const diasVM = ep.diasVM;
  // Registros anteriores a `ingresadoEn`: los dias con que llego, o el primer control.
  const desde = inicio ?? (ep.viaAereaActual === "NATURAL" ? null : diasVM > 0 ? null : primerControlEn);
  if (!desde) return diasVM > 0 && ep.viaAereaActual !== "NATURAL" ? { horas: diasVM * 24, desde: null } : null;
  const ms = ahora.getTime() - new Date(desde).getTime();
  return Number.isFinite(ms) ? { horas: Math.max(0, Math.floor(ms / 3_600_000)), desde } : null;
}

/**
 * Aviso suave (no bloquea): con menos de 24 h de VM, en estricto rigor no corresponde una PVE
 * (p. ej. el paciente de pabellon que despierta rapido y se extuba sin protocolo).
 */
/** «VM 8 h» el primer dia; despues «VM 3 d» (dias completos de 24 h). */
export function textoVm(h: HorasVm | null): string | null {
  if (!h) return null;
  return h.horas < 24 ? `VM ${h.horas} h` : `VM ${Math.floor(h.horas / 24)} d`;
}

export function avisoMenos24hVm(h: HorasVm | null): string | null {
  if (!h || h.horas >= 24) return null;
  const desde = h.desde ? ` (desde las ${new Date(h.desde).toTimeString().slice(0, 5)})` : "";
  return `Menos de 24 h de VM: ${h.horas} h${desde}. En estricto rigor no corresponde PVE; se puede registrar igual.`;
}

/**
 * Por que NO se puede iniciar una PVE ahora, o null si se puede. Regla de la unidad:
 * solo con TET (con TQT no hay PVE: se desvincula con los controles) y con el ultimo
 * control en CPAP+PS, posterior a la intubacion vigente (un control de antes de una
 * reintubacion no cuenta). Lo que ya esta en marcha se sigue siempre: ver accesoPve.
 */
export function motivoSinPve(via: ViaAerea, ultimo: UltimoControlPve | null, eventos: readonly EventoClinico[]): string | null {
  if (via === "TQT") return "Con TQT no hay PVE: se desvincula con los controles.";
  if (via !== "TET") return "La PVE es solo con TET.";
  if (!ultimo || ultimo.modalidad !== "CPAP_PS") return "Se inicia con el último control en CPAP+PS.";
  const tubo = inicioTuboActual(eventos);
  if (tubo && ultimo.registradoEn < tubo) return "Se inicia con un control en CPAP+PS posterior a la intubación actual.";
  return null;
}

/**
 * Cuando la tarjeta de la cama (y Evaluaciones) ofrecen entrar a la PVE. Lo que ya esta en
 * marcha (PVE en curso, extubacion por registrar, controles post extubacion) se ofrece
 * siempre; una PVE nueva, solo si `motivoSinPve` no pone reparos.
 */
export function accesoPve(via: ViaAerea, ultimo: UltimoControlPve | null, eventos: readonly EventoClinico[], ahora: Date): AccesoPve | null {
  const f = estadoFlujoPve(eventos, ahora);
  // Lo mas urgente primero: un control post extubacion que ya toca.
  if (f.bloque && f.bloque.momentos.some((m) => m.estado === "TOCA")) {
    return { texto: "Post extubación: registrar", destacado: true };
  }
  if (f.fase === "EN_CURSO") return { texto: "Continuar PVE", destacado: true };
  if (via === "TET" && f.fase === "TERMINADA") return { texto: "PVE terminada: registrar extubación", destacado: true };
  if (via === "TET" && f.fase === "APTO") return { texto: "Iniciar PVE", destacado: true };
  if (f.fase === "CERRADA") return null;
  if (motivoSinPve(via, ultimo, eventos)) return null;
  if (f.fase === "NO_APTO") return { texto: "PVE diaria: no apto este turno", destacado: false };
  return { texto: "Evaluar PVE diaria", destacado: false };
}

/**
 * El boton de extubacion de una cama con TET: uno solo, que cambia con las horas de VM.
 * - Con menos de 24 h de VM (cualquier modo): «Extubación fuera de protocolo».
 * - Desde las 24 h: la PVE (dentro de protocolo), con su regla (ultimo control en CPAP+PS).
 * Lo que ya esta en marcha (una PVE en curso o terminada, un control post extubacion que toca)
 * manda siempre.
 */
export type BotonExtubacion = { readonly tipo: "PVE"; readonly acceso: AccesoPve } | { readonly tipo: "FUERA_PROTOCOLO" };

export function botonExtubacion(
  ep: Pick<Episodio, "viaAereaActual" | "ingresadoEn" | "diasVM">,
  ultimo: UltimoControlPve | null,
  eventos: readonly EventoClinico[],
  primerControlEn: string | null,
  ahora: Date
): BotonExtubacion | null {
  const acceso = accesoPve(ep.viaAereaActual, ultimo, eventos, ahora);
  const f = estadoFlujoPve(eventos, ahora);
  const enMarcha = f.fase === "EN_CURSO" || f.fase === "TERMINADA" || (acceso?.destacado === true && acceso.texto.startsWith("Post"));
  if (acceso && enMarcha) return { tipo: "PVE", acceso };
  if (ep.viaAereaActual === "TET") {
    const h = horasDeVm(ep, eventos, primerControlEn, ahora);
    if (h !== null && h.horas < 24) return { tipo: "FUERA_PROTOCOLO" };
  }
  return acceso ? { tipo: "PVE", acceso } : null;
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
    {
      etiqueta: "Glasgow",
      unidad: "",
      inicio: inicio.glasgow ?? texto(inicio.gcs),
      termino: termino ? termino.glasgow ?? texto(termino.gcs) : "—",
      diferencia: inicio.glasgow || termino?.glasgow ? null : termino ? dif(inicio.gcs, termino.gcs) : null
    },
    num("Volumen minuto", "L/min", "volMinuto"),
    cat("Trabajo respiratorio", "trabajoResp"),
    cat("Secreciones bronquiales", "secreciones")
  ];
}
