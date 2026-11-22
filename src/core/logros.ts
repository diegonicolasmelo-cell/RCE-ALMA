/**
 * Logros secretos del paisaje Kaptus (docs/PLAN-MAESTRO.md, seccion 19; programado el 22-nov-2026).
 *
 * Cada personaje de la Region de Coquimbo se gana con un secreto que solo conoce quien lo descubre.
 * Se calcula con lo que esa persona registro en Kaptus (sus controles, eventos y APK): nada de
 * pacientes, solo cuantas veces y cuando. Personal y sin ranking.
 *
 * Reglas de diseno: nunca premiar registrar de mas ni registrar tarde. El noctambulo cuenta la HORA
 * EN QUE SE REGISTRO el control (en vivo), no la hora que se le escribio.
 *
 * Los dos primeros los propuso Diego (22-nov-2026): el chuncho por 50 controles entre las 4 y las 5
 * de la madrugada, y el guanaco («10.000 pasos») por 3 traslados. El resto es una propuesta para que
 * los ajuste.
 */

import type { Control, EventoClinico, ValidacionApk } from "./tipos";
import { turnoDe } from "./turnos";

export type IdPersonaje =
  | "chuncho" | "guanaco" | "degu" | "cururo" | "pelicano" | "chungungo" | "delfin" | "pinguino"
  | "copiapoa" | "ananuca" | "quisco" | "papayo" | "zorro" | "chinchilla" | "olivillo";

export interface DefinicionLogro {
  readonly id: IdPersonaje;
  /** Nombre del personaje. */
  readonly personaje: string;
  /** Nombre del secreto (se ve solo cuando se gana). */
  readonly titulo: string;
  /** Como se gana (se ve solo cuando se gana). */
  readonly secreto: string;
  /** Cuantas veces hay que hacerlo. */
  readonly meta: number;
}

export const LOGROS: readonly DefinicionLogro[] = [
  { id: "chuncho", personaje: "Chuncho", titulo: "El noctámbulo", secreto: "50 controles registrados en vivo entre las 4 y las 5 de la madrugada.", meta: 50 },
  { id: "guanaco", personaje: "Guanaco", titulo: "10.000 pasos", secreto: "3 traslados registrados (a imagen o de cama).", meta: 3 },
  { id: "degu", personaje: "Degú", titulo: "Primeros pasos", secreto: "Tu primer control en Kaptus.", meta: 1 },
  { id: "cururo", personaje: "Cururo", titulo: "Mano firme", secreto: "La APK firmada en 7 turnos distintos.", meta: 7 },
  { id: "pelicano", personaje: "Pelícano", titulo: "Buena pesca", secreto: "5 tomas de cultivo registradas.", meta: 5 },
  { id: "chungungo", personaje: "Chungungo", titulo: "Ojo de nutria", secreto: "3 PVE iniciadas.", meta: 3 },
  { id: "delfin", personaje: "Delfín nariz de botella", titulo: "Escuela de delfines", secreto: "5 sesiones de IMT.", meta: 5 },
  { id: "pinguino", personaje: "Pingüino de Humboldt", titulo: "La colonia", secreto: "Controles en 5 camas distintas en un mismo turno.", meta: 5 },
  { id: "copiapoa", personaje: "Copiapoa", titulo: "De pie", secreto: "Una terapia física de nivel 4 o 5 (bipedestación o marcha).", meta: 1 },
  { id: "ananuca", personaje: "Añañuca", titulo: "Palabra que florece", secreto: "Tu primera educación a la familia.", meta: 1 },
  { id: "quisco", personaje: "Quisco", titulo: "Raíz profunda", secreto: "10 terapias físicas con su nivel.", meta: 10 },
  { id: "papayo", personaje: "Papayo de La Serena", titulo: "Dulce despedida", secreto: "Tu primera desvinculación del ventilador.", meta: 1 },
  { id: "zorro", personaje: "Zorro culpeo", titulo: "El que no falla", secreto: "100 controles registrados.", meta: 100 },
  { id: "chinchilla", personaje: "Chinchilla", titulo: "Mano de seda", secreto: "10 evaluaciones registradas.", meta: 10 },
  { id: "olivillo", personaje: "Olivillo de Fray Jorge", titulo: "Bosque de niebla", secreto: "Una decanulación registrada.", meta: 1 }
];

export interface EstadoLogro extends DefinicionLogro {
  readonly ganado: boolean;
  /** Cuando se cumplio la meta (ISO), si se gano. */
  readonly ganadoEn: string | null;
  /** Cuanto lleva (solo para quien ya lo gano: el avance de un secreto no ganado no se muestra). */
  readonly cuenta: number;
}

/** Hora local del registro (0-23): el momento en que se anoto, no la hora escrita. */
const horaDe = (iso: string): number => new Date(iso).getHours();

/** Fecha (ISO) en que una lista ordenada alcanza la meta, o null. */
function alcanza(fechas: readonly string[], meta: number): string | null {
  const ord = [...fechas].sort();
  return ord.length >= meta ? ord[meta - 1]! : null;
}

/**
 * El estado de cada logro de una persona, con sus propios registros.
 * `controles`, `eventos` y `apks` pueden traer los de todos: aqui se filtran por autor.
 */
export function logrosDe(
  autor: string,
  controles: readonly Control[],
  eventos: readonly EventoClinico[],
  apks: readonly ValidacionApk[]
): readonly EstadoLogro[] {
  const misC = controles.filter((c) => c.rutAutor === autor);
  const misE = eventos.filter((e) => e.rutAutor === autor);
  const misA = apks.filter((a) => a.rutAutor === autor);
  const deTipo = (...tipos: string[]): string[] => misE.filter((e) => tipos.includes(e.tipo)).map((e) => e.registradoEn);

  // La colonia: el primer turno con controles en 5 camas distintas.
  const porTurno = new Map<string, Map<string, string>>();
  for (const c of [...misC].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn))) {
    const t = turnoDe(new Date(c.registradoEn)).clave;
    const m = porTurno.get(t) ?? new Map<string, string>();
    if (!m.has(c.episodioId)) m.set(c.episodioId, c.registradoEn);
    porTurno.set(t, m);
  }
  const colonias = [...porTurno.values()].filter((m) => m.size >= 5).map((m) => [...m.values()].sort()[4]!).sort();
  const maxCamas = Math.max(0, ...[...porTurno.values()].map((m) => m.size));

  // APK: un turno cuenta una vez.
  const turnosApk = new Map<string, string>();
  for (const a of [...misA].sort((x, y) => x.registradoEn.localeCompare(y.registradoEn))) if (!turnosApk.has(a.turno)) turnosApk.set(a.turno, a.registradoEn);

  const tf = misE.filter((e) => e.tipo === "TERAPIA_FISICA" && "nivel" in e && e.nivel !== null);
  const tfAlta = tf.filter((e) => "nivel" in e && Number(e.nivel) >= 4);

  const fuentes: Record<IdPersonaje, readonly string[] | { fechas: readonly string[]; cuenta: number }> = {
    chuncho: misC.filter((c) => horaDe(c.registradoEn) === 4).map((c) => c.registradoEn),
    guanaco: deTipo("TRASLADO_IMAGEN", "TRASLADO_CAMA"),
    degu: misC.map((c) => c.registradoEn),
    cururo: [...turnosApk.values()],
    pelicano: deTipo("TOMA_CULTIVO"),
    chungungo: deTipo("INICIO_PVE"),
    delfin: deTipo("IMT"),
    pinguino: { fechas: colonias.length ? Array(5).fill(colonias[0]!) : [], cuenta: maxCamas },
    copiapoa: tfAlta.map((e) => e.registradoEn),
    ananuca: deTipo("EDUCACION"),
    quisco: tf.map((e) => e.registradoEn),
    papayo: deTipo("DESVINCULACION"),
    zorro: misC.map((c) => c.registradoEn),
    chinchilla: deTipo("EVALUACION_PUNTUAL"),
    olivillo: deTipo("DECANULACION")
  };

  return LOGROS.map((d) => {
    const f = fuentes[d.id];
    const fechas = Array.isArray(f) ? f : (f as { fechas: readonly string[] }).fechas;
    const cuenta = Array.isArray(f) ? f.length : (f as { cuenta: number }).cuenta;
    const ganadoEn = alcanza(fechas, d.meta);
    return { ...d, ganado: ganadoEn !== null, ganadoEn, cuenta };
  });
}

/** El desierto florido: aparece cuando se descubren todos los personajes. */
export const florecioElDesierto = (estados: readonly EstadoLogro[]): boolean => estados.length > 0 && estados.every((e) => e.ganado);
