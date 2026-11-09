/**
 * Evaluaciones puntuales: escalas funcionales, de fuerza, de destete y de imagen. No son
 * parte del control de rutina: se hacen aparte, con su hora REAL, y se registran como un
 * evento EVALUACION_PUNTUAL con sus valores y su total.
 *
 * Las escalas y sus pesos son los del RCE de la unidad (MRC-ss, FSS-ICU, CPAx, IMS,
 * prension, Pimax, fragilidad, Barthel, Charlson, tos y deglucion, ecografia). VISAGE y el
 * score de cuidados de via aerea no estan en el RCE: se arman de la literatura (Asehnoune
 * 2017; Coplin 2000). Nada se sugiere desde una evolucion anterior: el evaluador anota lo
 * que mide en el momento.
 *
 * Fragilidad, Barthel y Charlson son el estado PREVIO a la UCI: un dato unico del episodio.
 * Registrar otra vez es corregir (la ultima manda).
 */

import type { IdEscala, Sexo, ViaAerea } from "./tipos";

/** Las cuatro pestanas de Evaluaciones: cada bloque cabe en la pantalla, sin scroll. */
export type PestanaEval = "PREVIA" | "FUERZA" | "PVE" | "IMAGEN";
export const PESTANAS_EVAL: readonly { readonly id: PestanaEval; readonly nombre: string }[] = [
  { id: "PREVIA", nombre: "Previa a la UCI" },
  { id: "FUERZA", nombre: "Fuerza y función" },
  { id: "PVE", nombre: "PVE y extubación" },
  { id: "IMAGEN", nombre: "Imagen" }
];

export interface OpcionCampo {
  /** Lo que se guarda. En `chk`, el peso de la opcion (Charlson) o 1. */
  readonly val: number;
  readonly label: string;
  readonly desc?: string;
}

/**
 * num: un numero escrito. ops: una opcion por fila (botones). lista: una opcion de una lista
 * vertical (fragilidad, IMS). chk: varias opciones marcables (Charlson, hallazgos).
 */
export type TipoCampo = "num" | "ops" | "lista" | "chk";

export interface CampoEscala {
  readonly id: string;
  readonly etiqueta: string;
  readonly tipo: TipoCampo;
  readonly min?: number;
  readonly max?: number;
  readonly unidad?: string;
  readonly opciones?: readonly OpcionCampo[];
  /** Solo se pide con esta via aerea (p. ej. el azul de metileno con TQT). */
  readonly soloVia?: ViaAerea;
}

export interface DefEscala {
  readonly id: IdEscala;
  readonly nombre: string;
  readonly corto: string;
  readonly pestana: PestanaEval;
  readonly campos: readonly CampoEscala[];
  /** Dato unico del episodio (estado previo a la UCI): registrar otra vez lo corrige. */
  readonly unico?: boolean;
  /** Escala de una version anterior: se sigue leyendo, pero ya no se ofrece. */
  readonly oculta?: boolean;
}

/** "No evaluable" en las escalas que lo admiten (MRC-ss, FSS-ICU). */
export const NE = -1;

const rango = (desde: number, hasta: number): OpcionCampo[] => Array.from({ length: hasta - desde + 1 }, (_, i) => ({ val: desde + i, label: String(desde + i) }));
const SINO: readonly OpcionCampo[] = [{ val: 1, label: "Sí" }, { val: 0, label: "No" }];

// --- Escala clinica de fragilidad (lamina de la unidad, como en el RCE) ---
export const ECF_NIVELES: readonly { readonly nivel: number; readonly fondo: string; readonly tinta: string; readonly nombre: string; readonly desc: string }[] = [
  { nivel: 1, fondo: "#15803d", tinta: "#fff", nombre: "Muy en forma", desc: "Robustas, activas, enérgicas y motivadas. Ejercicio regular; entre las más en forma para su edad." },
  { nivel: 2, fondo: "#22c55e", tinta: "#fff", nombre: "En forma", desc: "Sin síntomas de enfermedad activa, menos en forma que 1. Ejercicio ocasional (p. ej. estacional)." },
  { nivel: 3, fondo: "#84cc16", tinta: "#1a2e05", nombre: "Se las arregla bien", desc: "Problemas médicos bien controlados; no activas más allá de la rutina de caminar." },
  { nivel: 4, fondo: "#eab308", tinta: "#422006", nombre: "Vive con fragilidad muy leve", desc: "Antes «vulnerable»: no depende de otros, pero los síntomas limitan actividades. Queja común: estar lento o cansado." },
  { nivel: 5, fondo: "#f59e0b", tinta: "#422006", nombre: "Vive con fragilidad leve", desc: "Enlentecimiento evidente; ayuda en AIVD (finanzas, transporte, tareas domésticas pesadas, medicamentos)." },
  { nivel: 6, fondo: "#f97316", tinta: "#fff", nombre: "Vive con fragilidad moderada", desc: "Ayuda en todas las actividades del exterior y mantención de la casa; problemas con escaleras, ayuda para bañarse." },
  { nivel: 7, fondo: "#ef4444", tinta: "#fff", nombre: "Vive con fragilidad severa", desc: "Totalmente dependiente para el cuidado personal (causa física o cognitiva); estable, sin alto riesgo de morir (~6 meses)." },
  { nivel: 8, fondo: "#b91c1c", tinta: "#fff", nombre: "Vive con fragilidad muy severa", desc: "Totalmente dependiente y próximo al final de la vida; no suele recuperarse ni de una enfermedad menor." },
  { nivel: 9, fondo: "#7f1d1d", tinta: "#fff", nombre: "Enfermedad terminal", desc: "Esperanza de vida menor a 6 meses sin fragilidad severa evidente." }
];

const BARTHEL: readonly (readonly [string, readonly (readonly [number, string])[]])[] = [
  ["Comer", [[0, "Incapaz"], [5, "Necesita ayuda (cortar, untar…)"], [10, "Independiente"]]],
  ["Lavarse (baño/ducha)", [[0, "Dependiente"], [5, "Independiente"]]],
  ["Vestirse", [[0, "Dependiente"], [5, "Necesita ayuda"], [10, "Independiente"]]],
  ["Arreglarse (aseo personal)", [[0, "Dependiente"], [5, "Independiente"]]],
  ["Deposición", [[0, "Incontinente"], [5, "Accidente ocasional"], [10, "Continente"]]],
  ["Micción", [[0, "Incontinente o sonda"], [5, "Accidente ocasional"], [10, "Continente"]]],
  ["Uso del retrete", [[0, "Dependiente"], [5, "Necesita ayuda"], [10, "Independiente"]]],
  ["Traslado sillón-cama", [[0, "Incapaz"], [5, "Gran ayuda (1-2 personas)"], [10, "Mínima ayuda o supervisión"], [15, "Independiente"]]],
  ["Deambulación", [[0, "Inmóvil"], [5, "Independiente en silla de ruedas"], [10, "Camina con ayuda de 1 persona"], [15, "Independiente (puede usar bastón)"]]],
  ["Escaleras", [[0, "Incapaz"], [5, "Necesita ayuda o supervisión"], [10, "Independiente"]]]
];

export const CHARLSON: readonly OpcionCampo[] = [
  [1, "Infarto agudo al miocardio"], [1, "Insuficiencia cardíaca congestiva"], [1, "Enfermedad vascular periférica"], [1, "ACV o TIA"], [1, "Demencia"],
  [1, "EPOC / enfermedad pulmonar crónica"], [1, "Enfermedad del tejido conectivo"], [1, "Úlcera péptica"], [1, "Hepatopatía leve"], [1, "Diabetes sin daño de órgano"],
  [2, "Hemiplejía"], [2, "ERC moderada-severa"], [2, "Diabetes con daño de órgano"], [2, "Tumor sólido sin metástasis"], [2, "Leucemia"], [2, "Linfoma"],
  [3, "Hepatopatía moderada-severa"], [6, "Tumor sólido metastásico"], [6, "VIH/SIDA"]
].map(([val, label]) => ({ val: val as number, label: label as string }));

const MRC_MOV = ["Abducción de hombro", "Flexión de codo", "Extensión de muñeca", "Flexión de cadera", "Extensión de rodilla", "Dorsiflexión de tobillo"];

const FSS_COMUN = ["Incapaz de intentar o completar por debilidad", "Dependiente: se realiza, no asiste en absoluto", "Asistencia máxima: realiza ≤25%", "Asistencia moderada: realiza 26-74%", "Asistencia mínima: realiza ≥75%", "Supervisión: indicaciones, sin asistencia física"];
const FSS: readonly (readonly [string, readonly string[]])[] = [
  ["Girar en cama", [...FSS_COMUN, "Independiente modificado: usa baranda o dispositivo", "Independiente: sin asistencia ni dispositivos"]],
  ["Supino → sedente", [...FSS_COMUN, "Independiente modificado: usa baranda o dispositivo", "Independiente: sin asistencia ni dispositivos"]],
  ["Sedente borde cama", [...FSS_COMUN, "Independiente modificado: usa manos o baranda", "Independiente: manos libres, sin apoyarse"]],
  ["Sedente → bípedo", [...FSS_COMUN, "Independiente modificado: usa apoyabrazos o baranda", "Independiente: sin empujarse de nada"]],
  ["Marcha", ["Incapaz de intentar o completar por debilidad", "Menos de 15 m con 1 persona, o cualquier distancia con 2", "≥15 m con asistencia de 1 persona", "≥45 m, realiza 50-74%", "≥45 m, realiza ≥75% (asistencia mínima o contacto manual)", "≥45 m con supervisión, sin asistencia física", "≥45 m con bastón, andador, órtesis o prótesis", "≥45 m sin asistencia ni dispositivos"]]
];

const CPAX: readonly (readonly [string, readonly string[]])[] = [
  ["Función respiratoria", ["Ventilación mandatoria completa", "VM mandatoria con esfuerzos espontáneos ocasionales", "VM con soporte del esfuerzo espontáneo (p. ej. PSV)", "Espontánea con CPAP/VNI", "Espontánea con O₂ suplementario", "Espontánea sin O₂"]],
  ["Tos", ["Ausente", "Débil e inefectiva, solo con succión profunda", "Débil, requiere asistencia/succión oral", "Débil pero productiva, sin asistencia", "Efectiva con estímulo o enseñanza", "Efectiva e independiente"]],
  ["Movilidad en cama (girar)", ["Incapaz / dependencia total", "Asistencia de ≥3 personas", "Asistencia de 2 personas", "Asistencia de 1 persona", "Supervisión o ayudas menores", "Independiente"]],
  ["Supino → sedente", ["Incapaz / dependencia total", "Asistencia de ≥3 personas", "Asistencia de 2 personas", "Asistencia de 1 persona", "Supervisión o ayudas menores", "Independiente"]],
  ["Equilibrio sedente (dinámico)", ["Incapaz de mantener sedente", "Mantiene con asistencia máxima", "Mantiene con asistencia moderada", "Mantiene con asistencia mínima", "Sin asistencia, sin alcanzar fuera de base", "Alcanza fuera de la base de sustentación sin apoyo"]],
  ["Equilibrio bípedo", ["Incapaz de ponerse de pie", "Bípedo con grúa/bipedestador", "Con andador alto + asistencia", "Con ayuda técnica menor o 1 asistente", "Sin ayudas, con supervisión", "Independiente sin ayudas"]],
  ["Sedente → bípedo", ["Incapaz", "Asistencia máxima (≥2 personas)", "Asistencia moderada + apoyo de brazos", "Asistencia mínima, usando brazos", "Independiente con apoyo de brazos", "Independiente sin apoyo de brazos"]],
  ["Transferencia cama → sillón", ["Incapaz", "Con grúa o deslizamiento (≥2 personas)", "Asistencia de 2 personas", "Asistencia de 1 persona", "Supervisión o ayudas menores", "Independiente"]],
  ["Marcha en el lugar", ["Incapaz", "Con grúa de marcha o 2 asistentes", "Con andador + asistencia", "Con ayuda técnica o 1 asistente", "Supervisión o ayudas menores", "Independiente sin ayudas"]],
  ["Prensión (% del predicho)", ["Sin contracción visible", "<20% del predicho", "<40% del predicho", "<60% del predicho", "<80% del predicho", "≥80% del predicho (≈normal)"]]
];

const IMS: readonly string[] = [
  "Nada: acostado, movilización pasiva", "Ejercicios en cama (activos o activo-asistidos)", "Traslado pasivo a sillón (sin bipedestación)", "Sedente al borde de la cama",
  "Bipedestación (con o sin ayuda)", "Transferencia cama a sillón de pie", "Marcha en el lugar (al lado de la cama)", "Marcha con asistencia de 2 o más personas",
  "Marcha con asistencia de 1 persona", "Marcha independiente con ayuda técnica", "Marcha independiente sin ayuda técnica"
];

const ACS: readonly (readonly [string, readonly string[]])[] = [
  ["Tos espontánea", ["Vigorosa", "Moderada", "Débil", "Ausente"]],
  ["Reflejo nauseoso", ["Vigoroso", "Moderado", "Débil", "Ausente"]],
  ["Cantidad de secreciones", ["Ninguna", "1 pasada", "2 pasadas", "3 o más pasadas"]],
  ["Viscosidad", ["Acuosa", "Espumosa", "Espesa", "Muy espesa, adherente"]],
  ["Aspecto", ["Claras", "Café", "Amarillas u opacas", "Verdes"]],
  ["Frecuencia de aspiración", ["Cada más de 3 h", "Cada 3 h", "Cada 2 h", "Cada 1 h o menos"]]
];

/** Deglucion: las categorias del RCE. */
export const OPCIONES_DEGLUCION_EVAL: readonly OpcionCampo[] = [
  { val: 3, label: "Adecuada" },
  { val: 2, label: "Alterada leve" },
  { val: 1, label: "Alterada severa" },
  { val: 0, label: "No evaluable" }
];

export const HALLAZGOS_ECO: readonly string[] = ["Patrón A bilateral", "Patrón B bilateral", "Patrón B focal", "Consolidación", "Derrame pleural", "Deslizamiento pleural ausente"];
/** Se conserva por compatibilidad: hallazgos para escribir en la nota. */
export const SUGERENCIAS_ECOGRAFIA: readonly string[] = [...HALLAZGOS_ECO, "Disfunción diafragmática"];

/** Intensidades de entrenamiento de la musculatura inspiratoria, en % de la Pimax. */
export const INTENSIDADES_PIM: readonly number[] = [50, 60, 70, 80];

const num = (id: string, etiqueta: string, unidad: string, extra: Partial<CampoEscala> = {}): CampoEscala => ({ id, etiqueta, tipo: "num", unidad, min: 0, ...extra });

/** El orden dentro de cada pestana es el de la pantalla. */
export const ESCALAS: readonly DefEscala[] = [
  // --- Previa a la UCI: datos unicos del episodio ---
  { id: "FRAGILIDAD", nombre: "Escala clínica de fragilidad", corto: "Fragilidad", pestana: "PREVIA", unico: true,
    campos: [{ id: "nivel", etiqueta: "Nivel de fragilidad previo a la UCI", tipo: "lista", min: 1, max: 9, opciones: ECF_NIVELES.map((n) => ({ val: n.nivel, label: n.nombre, desc: n.desc })) }] },
  { id: "BARTHEL", nombre: "Barthel previo", corto: "Barthel", pestana: "PREVIA", unico: true,
    campos: BARTHEL.map(([l, ops], i) => ({ id: `b${i + 1}`, etiqueta: `${i + 1}. ${l}`, tipo: "ops" as const, opciones: ops.map(([v, t]) => ({ val: v, label: String(v), desc: t })) })) },
  { id: "CHARLSON", nombre: "Comorbilidad de Charlson", corto: "Charlson", pestana: "PREVIA", unico: true,
    campos: [{ id: "c", etiqueta: "Comorbilidades (tocar las que tiene)", tipo: "chk", opciones: CHARLSON }] },
  // --- Fuerza y funcion ---
  { id: "MRC_SS", nombre: "Fuerza muscular MRC-ss", corto: "MRC-ss", pestana: "FUERZA",
    campos: MRC_MOV.flatMap((m, i) => [
      { id: `m${i + 1}d`, etiqueta: `${i + 1}. ${m} · der.`, tipo: "ops" as const, min: 0, max: 5, opciones: [...rango(0, 5), { val: NE, label: "NE", desc: "No evaluable" }] },
      { id: `m${i + 1}i`, etiqueta: `${i + 1}. ${m} · izq.`, tipo: "ops" as const, min: 0, max: 5, opciones: [...rango(0, 5), { val: NE, label: "NE", desc: "No evaluable" }] }
    ]) },
  { id: "FSS_ICU", nombre: "Estado funcional FSS-ICU", corto: "FSS-ICU", pestana: "FUERZA",
    campos: FSS.map(([l, d], i) => ({ id: `a${i + 1}`, etiqueta: `${i + 1}. ${l}`, tipo: "ops" as const, min: 0, max: 7,
      opciones: [...d.map((t, v) => ({ val: v, label: String(v), desc: t })), { val: NE, label: "NE", desc: "No evaluable por causa distinta a debilidad" }] })) },
  { id: "CPAX", nombre: "CPAx · Chelsea Critical Care", corto: "CPAx", pestana: "FUERZA",
    campos: CPAX.map(([l, d], i) => ({ id: `c${i + 1}`, etiqueta: `${i + 1}. ${l}`, tipo: "ops" as const, min: 0, max: 5, opciones: d.map((t, v) => ({ val: v, label: String(v), desc: t })) })) },
  { id: "IMS", nombre: "Movilidad en UCI (IMS)", corto: "IMS", pestana: "FUERZA",
    campos: [{ id: "nivel", etiqueta: "Lo máximo que logró hoy", tipo: "lista", min: 0, max: 10, opciones: IMS.map((t, v) => ({ val: v, label: t })) }] },
  { id: "DINAMOMETRIA", nombre: "Prensión manual (dinamometría)", corto: "Prensión", pestana: "FUERZA",
    campos: [num("kg", "Prensión · mejor intento", "kg", { max: 100 })] },
  { id: "FUERZA_RESPIRATORIA", nombre: "Pimáx · fuerza respiratoria", corto: "Pimáx", pestana: "FUERZA",
    campos: [num("pim", "Pimáx · valor absoluto", "cmH₂O", { min: -250, max: 250 }), num("pem", "PEM · opcional", "cmH₂O", { min: -250, max: 300 })] },
  // --- PVE y extubacion ---
  { id: "TOS_DEGLUCION", nombre: "Tos y deglución", corto: "Tos y deglución", pestana: "PVE",
    campos: [
      num("pcf", "Flujo pico de tos", "L/min", { max: 900 }),
      { id: "deg", etiqueta: "Deglución", tipo: "ops", opciones: OPCIONES_DEGLUCION_EVAL },
      { id: "bdt", etiqueta: "Test de azul de metileno (BDT)", tipo: "ops", opciones: [{ val: 1, label: "Positivo" }, { val: 0, label: "Negativo" }], soloVia: "TQT" },
      num("ptt", "P. transtraqueal con válvula de fonación", "cmH₂O", { max: 60, soloVia: "TQT" })
    ] },
  { id: "VISAGE", nombre: "VISAGE (neurocríticos)", corto: "VISAGE", pestana: "PVE",
    campos: [
      { id: "v", etiqueta: "Seguimiento visual", tipo: "ops", opciones: SINO },
      { id: "i", etiqueta: "Intentos de deglución", tipo: "ops", opciones: SINO },
      { id: "a", etiqueta: "Edad menor de 40 años", tipo: "ops", opciones: SINO },
      { id: "g", etiqueta: "Glasgow mayor de 10", tipo: "ops", opciones: SINO }
    ] },
  { id: "VIA_AEREA", nombre: "Score de cuidados de vía aérea", corto: "Score vía aérea", pestana: "PVE",
    campos: ACS.map(([l, d], i) => ({ id: `s${i + 1}`, etiqueta: l, tipo: "ops" as const, min: 0, max: 3, opciones: d.map((t, v) => ({ val: v, label: `${v} · ${t}` })) })) },
  // --- Imagen ---
  { id: "ECOGRAFIA", nombre: "Ecografía muscular, diafragmática y pulmonar", corto: "Ecografía", pestana: "IMAGEN",
    campos: [
      num("cd", "Cuádriceps derecho", "mm", { max: 100 }), num("ci", "Cuádriceps izquierdo", "mm", { max: 100 }),
      { id: "hk", etiqueta: "Heckmatt", tipo: "ops", opciones: [{ val: 1, label: "I" }, { val: 2, label: "II" }, { val: 3, label: "III" }, { val: 4, label: "IV" }] },
      num("gr", "Grosor diafragmático", "mm", { max: 20 }),
      num("fd", "Fracción de engrosamiento derecha", "%", { max: 300 }), num("fi", "Fracción de engrosamiento izquierda", "%", { max: 300 }),
      num("ed", "Excursión derecha", "cm", { max: 15 }), num("ei", "Excursión izquierda", "cm", { max: 15 }),
      { id: "h", etiqueta: "Hallazgos pulmonares", tipo: "chk", opciones: HALLAZGOS_ECO.map((label) => ({ val: 1, label })) }
    ] },
  // --- Versiones anteriores: se leen, ya no se ofrecen ---
  { id: "FLUJO_PICO_TOS", nombre: "Flujo pico de tos", corto: "Flujo pico de tos", pestana: "PVE", oculta: true, campos: [num("pef", "Flujo pico de tos", "L/min")] },
  { id: "DEGLUCION", nombre: "Deglución", corto: "Deglución", pestana: "PVE", oculta: true,
    campos: [{ id: "nivel", etiqueta: "Deglución", tipo: "ops", opciones: [{ val: 2, label: "Presente" }, { val: 1, label: "Esporádica" }, { val: 0, label: "Ausente" }] }] }
];

export const escalaDe = (id: IdEscala): DefEscala => ESCALAS.find((e) => e.id === id)!;
export const nombreEscala = (id: IdEscala): string => ESCALAS.find((e) => e.id === id)?.nombre ?? id;
export const escalasDePestana = (p: PestanaEval): readonly DefEscala[] => ESCALAS.filter((e) => e.pestana === p && !e.oculta);

/** Los campos que se piden con esta via aerea. */
export function camposVisibles(def: DefEscala, via: ViaAerea | null): readonly CampoEscala[] {
  return def.campos.filter((c) => !c.soloVia || c.soloVia === via);
}

/** Clave guardada de una opcion marcable: "c3" es la cuarta opcion del campo "c". */
export const claveChk = (campo: string, i: number): string => `${campo}${i}`;

export type NivelInterpretacion = "good" | "warn" | "crit";

export interface ResultadoEscala {
  /** Total, o `null` si la escala no se suma o no esta completa. */
  readonly total: number | null;
  /** Se puede guardar (lo minimo esta). */
  readonly completa: boolean;
  /** Lo que falta para guardar, dicho en palabras. */
  readonly falta: string | null;
  readonly lineas: readonly string[];
  readonly interpretacion: string | null;
  readonly nivel: NivelInterpretacion | null;
  /** Campos fuera de rango. */
  readonly errores: readonly string[];
}

export interface ContextoEscala {
  /** Para la prension: los cortes dependen del sexo. */
  readonly sexo?: Sexo | null;
  readonly via?: ViaAerea | null;
}

type Valores = Readonly<Record<string, number | null | undefined>>;
const coma = (n: number): string => String(n).replace(".", ",");

export function calcularEscala(id: IdEscala, valores: Valores, ctx: ContextoEscala = {}): ResultadoEscala {
  const def = escalaDe(id);
  const v = (k: string): number | null => {
    const x = valores[k];
    return x === null || x === undefined || !Number.isFinite(x) ? null : x;
  };
  const errores = def.campos
    .filter((c) => c.tipo === "num" || (c.min !== undefined && c.tipo === "ops"))
    .filter((c) => {
      const x = v(c.id);
      if (x === null || (c.tipo === "ops" && x === NE)) return false;
      return (c.min !== undefined && x < c.min) || (c.max !== undefined && x > c.max);
    })
    .map((c) => `${c.etiqueta}: fuera de rango`);
  const r = (p: Partial<ResultadoEscala>): ResultadoEscala => ({ total: null, completa: true, falta: null, lineas: [], interpretacion: null, nivel: null, errores, ...p });
  const incompleto = (falta: string, extra: Partial<ResultadoEscala> = {}): ResultadoEscala => r({ completa: false, falta, ...extra });
  const ids = (pref: RegExp): string[] => def.campos.map((c) => c.id).filter((k) => pref.test(k));

  switch (id) {
    case "FRAGILIDAD": {
      const n = v("nivel");
      if (n === null) return incompleto("el nivel de fragilidad (1 a 9)");
      const e = ECF_NIVELES.find((x) => x.nivel === n);
      return r({ total: n, lineas: [`ECF ${n}${e ? ` · ${e.nombre}` : ""}`], interpretacion: e?.nombre ?? null, nivel: n <= 3 ? "good" : n <= 6 ? "warn" : "crit" });
    }
    case "BARTHEL": {
      const dados = def.campos.filter((c) => v(c.id) !== null);
      const tot = dados.reduce((s, c) => s + (v(c.id) ?? 0), 0);
      if (dados.length < def.campos.length) return incompleto(`las 10 actividades (van ${dados.length})`, { lineas: [`Parcial ${tot}`] });
      const ip: [string, NivelInterpretacion] = tot <= 20 ? ["Dependencia total", "crit"] : tot <= 60 ? ["Dependencia severa", "crit"] : tot <= 90 ? ["Dependencia moderada", "warn"] : tot <= 99 ? ["Dependencia leve", "warn"] : ["Independiente", "good"];
      return r({ total: tot, lineas: [`Barthel previo ${tot}/100`], interpretacion: ip[0], nivel: ip[1] });
    }
    case "CHARLSON": {
      const sel = CHARLSON.map((o, i) => (v(claveChk("c", i)) ? o.val : 0));
      const tot = sel.reduce((s, x) => s + x, 0);
      const n = sel.filter((x) => x > 0).length;
      const ip: [string, NivelInterpretacion] = tot <= 1 ? ["Sin comorbilidad relevante", "good"] : tot === 2 ? ["Comorbilidad baja", "warn"] : ["Comorbilidad alta", "crit"];
      return r({ total: tot, lineas: [`Charlson ${tot} ${tot === 1 ? "pt" : "pts"} sin edad`, `${n} ${n === 1 ? "comorbilidad" : "comorbilidades"}; la edad suma +1 por década desde los 50 y se agrega en el PC`], interpretacion: ip[0], nivel: ip[1] });
    }
    case "MRC_SS": {
      const d = ids(/d$/), i = ids(/i$/);
      const vals = [...d, ...i].map(v);
      const declarados = vals.filter((x) => x !== null).length;
      const ne = vals.filter((x) => x === NE).length;
      const sum = (ks: string[]): number => ks.reduce((s, k) => s + Math.max(0, v(k) ?? 0), 0);
      if (declarados < 12) return incompleto(`los 12 movimientos (van ${declarados})`, { lineas: [`Parcial der. ${sum(d)} · izq. ${sum(i)}`] });
      if (ne > 0) return r({ lineas: [`Subtotal der. ${sum(d)}/30 · izq. ${sum(i)}/30`, `${ne} NE: sin total`] });
      const tot = sum(d) + sum(i);
      const ip: [string, NivelInterpretacion] = tot < 36 ? ["DAUCI severa (< 36)", "crit"] : tot < 48 ? ["DAUCI (< 48)", "warn"] : ["Sin DAUCI", "good"];
      const asim = Math.abs(sum(d) - sum(i));
      return r({ total: tot, lineas: [`Subtotal der. ${sum(d)}/30 · izq. ${sum(i)}/30`, `MRC-ss ${tot}/60`, ...(asim >= 6 ? [`Asimetría de ${asim} puntos entre lados`] : [])], interpretacion: ip[0], nivel: ip[1] });
    }
    case "FSS_ICU": {
      const vals = def.campos.map((c) => v(c.id));
      const declarados = vals.filter((x) => x !== null).length;
      const con = vals.filter((x): x is number => x !== null && x !== NE);
      const ne = vals.filter((x) => x === NE).length;
      const suma = con.reduce((s, x) => s + x, 0);
      if (declarados < 5) return incompleto(`las 5 actividades (van ${declarados})`, { lineas: [`Parcial ${suma}`] });
      // Manual: hasta 2 NE se imputan con el promedio de las puntuadas; con mas de 2 no hay total.
      if (ne > 2 || con.length === 0) return r({ lineas: [`${ne} NE: el manual permite promediar hasta 2, no hay total`] });
      const tot = ne === 0 ? suma : Math.round(suma + ne * (suma / con.length));
      const ip: [string, NivelInterpretacion] = tot <= 10 ? ["Dependencia severa", "crit"] : tot <= 20 ? ["Dependencia moderada", "warn"] : tot < 27 ? ["Asistencia mínima", "warn"] : ["Independencia funcional", "good"];
      return r({ total: tot, lineas: [`FSS-ICU ${tot}/35`, ...(ne > 0 ? [`${ne} NE imputado${ne > 1 ? "s" : ""} con el promedio ${coma(Math.round((suma / con.length) * 10) / 10)}`] : [])], interpretacion: ip[0], nivel: ip[1] });
    }
    case "CPAX": {
      const vals = def.campos.map((c) => v(c.id));
      const n = vals.filter((x) => x !== null).length;
      const suma = vals.reduce<number>((s, x) => s + (x ?? 0), 0);
      if (n < 10) return incompleto(`los 10 dominios (van ${n})`, { lineas: [`Parcial ${suma}`] });
      return r({ total: suma, lineas: [`CPAx ${suma}/50`] });
    }
    case "IMS": {
      const n = v("nivel");
      if (n === null) return incompleto("el nivel de movilidad (0 a 10)");
      const ip: [string, NivelInterpretacion] = n <= 2 ? ["En cama", "warn"] : n <= 5 ? ["Fuera de la cama, sin marcha", "warn"] : ["Marcha", "good"];
      return r({ total: n, lineas: [`IMS ${n} · ${IMS[n] ?? ""}`], interpretacion: ip[0], nivel: ip[1] });
    }
    case "DINAMOMETRIA": {
      const x = v("kg");
      if (x === null) return incompleto("la prensión en kg");
      if (!ctx.sexo) return r({ total: x, lineas: [`Prensión ${coma(x)} kg`, "Sin sexo en el episodio no se interpreta (corte 11 kg hombre, 7 kg mujer)"] });
      const cut = ctx.sexo === "M" ? 11 : 7;
      const ip: [string, NivelInterpretacion] = x < cut * 0.5 ? [`DAUCI severa (corte ${cut} kg)`, "crit"] : x < cut ? [`DAUCI (corte ${cut} kg)`, "warn"] : [`Normal (≥ ${cut} kg)`, "good"];
      return r({ total: x, lineas: [`Prensión ${coma(x)} kg`], interpretacion: ip[0], nivel: ip[1] });
    }
    case "FUERZA_RESPIRATORIA": {
      const p = v("pim");
      const pem = v("pem");
      // Registros de una version anterior traian PEF, engrosamiento y excursion.
      const viejos = (["pef", "fed", "exc"] as const).filter((k) => v(k) !== null).map((k) => `${k.toUpperCase()} ${coma(v(k)!)}`);
      if (p === null) return viejos.length ? r({ lineas: viejos }) : incompleto("la Pimáx");
      const pim = Math.abs(p);
      const ip: [string, NivelInterpretacion] = pim < 30 ? ["Debilidad muscular respiratoria", "crit"] : pim < 80 ? ["Disminuida respecto de lo normal", "warn"] : ["Normal", "good"];
      const cargas = INTENSIDADES_PIM.map((pc) => `${pc}% ${Math.round((pim * pc) / 100)}`).join(" · ");
      return r({ total: pim, lineas: [`Pimáx ${pim} cmH₂O${pem !== null ? ` · PEM ${Math.abs(pem)}` : ""}`, `Cargas (cmH₂O): ${cargas}`, ...viejos], interpretacion: ip[0], nivel: ip[1] });
    }
    case "TOS_DEGLUCION": {
      const p: string[] = [];
      let ip: [string, NivelInterpretacion] | null = null;
      const pcf = v("pcf");
      if (pcf !== null) {
        p.push(`PCF ${coma(pcf)} L/min`);
        ip = pcf < 60 ? ["Tos ineficaz (< 60 L/min)", "crit"] : pcf < 160 ? ["Tos débil (60 a 159 L/min)", "warn"] : ["Tos eficaz (≥ 160 L/min)", "good"];
      }
      const deg = v("deg");
      if (deg !== null) p.push(`deglución ${(OPCIONES_DEGLUCION_EVAL.find((o) => o.val === deg)?.label ?? "").toLowerCase()}`);
      const bdt = v("bdt");
      if (bdt !== null) p.push(`BDT ${bdt ? "+" : "-"}`);
      const ptt = v("ptt");
      if (ptt !== null) p.push(`PTT ${coma(ptt)} cmH₂O (${ptt <= 10 ? "permeable" : ptt <= 12 ? "límite" : "sugiere obstrucción o cánula grande"})`);
      if (p.length === 0) return incompleto("al menos un dato");
      return r({ total: pcf, lineas: [p.join(" · ")], interpretacion: ip?.[0] ?? null, nivel: ip?.[1] ?? null });
    }
    case "VISAGE": {
      const vals = ["v", "i", "a", "g"].map(v);
      const n = vals.filter((x) => x !== null).length;
      const tot = vals.reduce<number>((s, x) => s + (x ?? 0), 0);
      if (n < 4) return incompleto(`los 4 ítems (van ${n})`, { lineas: [`Parcial ${tot}`] });
      return r({ total: tot, lineas: [`VISAGE ${tot}/4`], interpretacion: tot >= 3 ? "≥ 3: alta probabilidad de extubación exitosa" : "< 3: menor probabilidad de éxito", nivel: tot >= 3 ? "good" : "warn" });
    }
    case "VIA_AEREA": {
      // Version anterior: un puntaje suelto.
      const viejo = v("puntaje");
      if (viejo !== null && def.campos.every((c) => v(c.id) === null)) return r({ total: viejo, lineas: [`Score vía aérea ${viejo}`] });
      const vals = def.campos.map((c) => v(c.id));
      const n = vals.filter((x) => x !== null).length;
      const tot = vals.reduce<number>((s, x) => s + (x ?? 0), 0);
      if (n < 6) return incompleto(`los 6 ítems (van ${n})`, { lineas: [`Parcial ${tot}`] });
      return r({ total: tot, lineas: [`Score vía aérea ${tot}/18`, "Más puntos, más carga de secreciones y peor protección de la vía aérea"] });
    }
    case "ECOGRAFIA": {
      const p: string[] = [];
      const alerta: string[] = [];
      const nombre: Record<string, string> = { cd: "Cuádriceps D", ci: "Cuádriceps I", gr: "Grosor diafr.", fd: "FED D", fi: "FED I", ed: "Excursión D", ei: "Excursión I" };
      const unidad: Record<string, string> = { cd: " mm", ci: " mm", gr: " mm", fd: " %", fi: " %", ed: " cm", ei: " cm" };
      for (const k of ["cd", "ci"]) if (v(k) !== null) p.push(`${nombre[k]} ${coma(v(k)!)}${unidad[k]}`);
      const hk = v("hk");
      if (hk !== null) p.push(`Heckmatt ${["", "I", "II", "III", "IV"][hk] ?? hk}`);
      for (const k of ["gr", "fd", "fi", "ed", "ei"]) if (v(k) !== null) p.push(`${nombre[k]} ${coma(v(k)!)}${unidad[k]}`);
      for (const k of ["fd", "fi"]) if (v(k) !== null && v(k)! < 20) alerta.push(`FED ${k === "fd" ? "D" : "I"} < 20 %`);
      for (const k of ["ed", "ei"]) if (v(k) !== null && v(k)! < 1) alerta.push(`excursión ${k === "ed" ? "D" : "I"} < 1 cm`);
      HALLAZGOS_ECO.forEach((h, i) => { if (v(claveChk("h", i))) p.push(h); });
      if (p.length === 0) return incompleto("al menos un dato o un hallazgo (o escríbelo en la nota)");
      return r({ lineas: [p.join(" · ")], ...(alerta.length ? { interpretacion: `Sugiere disfunción diafragmática: ${alerta.join(", ")}`, nivel: "crit" as const } : {}) });
    }
    case "FLUJO_PICO_TOS": {
      const x = v("pef");
      return x === null ? incompleto("el flujo pico") : r({ total: x, lineas: [`${x} L/min`] });
    }
    case "DEGLUCION": {
      const x = v("nivel");
      const l = def.campos[0]?.opciones?.find((o) => o.val === x)?.label;
      return x === null ? incompleto("la deglución") : r({ lineas: l ? [l] : [] });
    }
  }
}

export const LARGO_MAX_NOTA_EVALUACION = 300;

/**
 * Una linea para la nota y las listas: "MRC-ss 52/60 · Sin DAUCI", "Fragilidad: ECF 5 ·
 * Vive con fragilidad leve". Con nota clinica, va al final: "… · nota".
 */
export function resumenEvaluacion(id: IdEscala, valores: Valores, total: number | null, nota = "", ctx: ContextoEscala = {}): string {
  const n = nota.trim();
  const def = ESCALAS.find((e) => e.id === id);
  if (!def) return `${id}${total !== null ? `: ${total}` : ""}${n ? ` · ${n}` : ""}`;
  const r = calcularEscala(id, valores, ctx);
  // La linea con el total ("MRC-ss 52/60") si la hay; si no, la primera.
  const cuerpo = r.lineas.find((l) => l.startsWith(def.corto)) ?? r.lineas[0] ?? (total !== null ? String(total) : "registrada");
  const conNombre = cuerpo.startsWith(def.corto) ? cuerpo : `${def.corto}: ${cuerpo}`;
  const interp = r.interpretacion && !conNombre.includes(r.interpretacion) ? ` · ${r.interpretacion}` : "";
  return `${conNombre}${interp}${n ? ` · ${n}` : ""}`;
}

/**
 * La hora REAL de una evaluacion, escrita como "HH:MM", llevada a un momento completo.
 * Una hora posterior a la actual es del dia anterior (una evaluacion de las 23:50 anotada
 * a las 00:10). No se acepta mas de `maxHorasAtras` hacia atras: eso ya no es "minutos antes".
 */
export function momentoDeEvaluacion(hora: string, ahora: Date, maxHorasAtras = 12): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  let t = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, min);
  if (t.getTime() > ahora.getTime() + 60_000) t = new Date(t.getTime() - 24 * 3600_000);
  if (ahora.getTime() - t.getTime() > maxHorasAtras * 3600_000) return null;
  return t;
}
