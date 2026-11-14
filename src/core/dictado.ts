/**
 * Dictado por voz del control: interpreta el texto que entrega el reconocedor del telefono y lo
 * convierte en datos para las casillas. Es determinista. Reglas de la unidad (Diego, 14-nov-2026):
 *  - «PIP» es PEEP (el reconocedor oye «pip» cuando se dice «peep»).
 *  - «Frecuencia» a secas es la FR total (la del paciente).
 *  - Los valores imposibles o fuera de rango no se aplican: quedan en «No se aplican».
 *  - Infusiones, SAS (solo con sedacion en curso) y Glasgow tambien se dictan.
 *  - «igual», «sin cambios», «se mantiene» repiten el valor del control anterior.
 * Lo unico que se pregunta es un mismo dato dicho con valores distintos. Nunca guarda nada.
 */

import { CAMPOS_POR_MODALIDAD, ETIQUETA_MODALIDAD, INFUSIONES, MODALIDADES_POR_VIA } from "./catalogos";
import { cambiarModalidad, iniciarInfusion, sedoanalgesiaActivaEnBorrador, suspenderInfusion } from "./borrador";
import type { BorradorControl } from "./borrador";
import { dosisDeEscalon } from "./infusiones";
import type { CampoVent, Control, IdInfusion, Modalidad, ViaAerea } from "./tipos";

export type CampoDictado = "fc" | "pas" | "pad" | "spo2" | "modalidad" | "sas" | "gcsO" | "gcsV" | "gcsM" | CampoVent | `inf:${IdInfusion}`;

export interface DatoDictado {
  readonly campo: CampoDictado;
  /** Como lo escribe el teclado: decimales con coma. Modo: la clave. Infusion: dosis o «suspender». */
  readonly valor: string;
  /** Cuantas veces se dijo el mismo valor. */
  readonly veces: number;
  /** Se dijo «igual» o «sin cambios»: es el valor del control anterior. */
  readonly igual?: boolean;
}

export interface OpcionDuda {
  readonly etiqueta: string;
  /** null = descartar. */
  readonly campo: CampoDictado | null;
  readonly valor: string;
}

export interface DudaDictado {
  readonly id: string;
  readonly tipo: "CONFLICTO";
  readonly texto: string;
  readonly opciones: readonly OpcionDuda[];
}

export interface ResultadoDictado {
  /** Modalidad con que se juzga que casillas existen: la dictada o la actual. */
  readonly modalidad: Modalidad;
  readonly datos: readonly DatoDictado[];
  readonly dudas: readonly DudaDictado[];
  /** Lo oido que no se aplica, con el motivo. */
  readonly noAplica: readonly string[];
}

export interface ContextoDictado {
  /** El control en curso: para saber que infusiones hay y si hay sedacion (SAS). */
  readonly b?: BorradorControl;
  /** El control anterior: para «igual» o «sin cambios». */
  readonly anterior?: Control | null;
}

const esInfusion = (c: CampoDictado): c is `inf:${IdInfusion}` => c.startsWith("inf:");
const idInfusion = (c: `inf:${IdInfusion}`): IdInfusion => c.slice(4) as IdInfusion;
const esVent = (c: CampoDictado): c is CampoVent => !["fc", "pas", "pad", "spo2", "modalidad", "sas", "gcsO", "gcsV", "gcsM"].includes(c) && !esInfusion(c);

// ---------------------------------------------------------------------------
// Texto -> palabras
// ---------------------------------------------------------------------------

const sinTildes = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function palabras(texto: string): string[] {
  let t = sinTildes(texto.toLowerCase());
  t = t.replace(/(\d)\s*,\s*(\d)/g, "$1.$2"); // 0,01 -> 0.01
  t = t.replace(/(\d)\s*\/\s*(\d)/g, "$1 / $2"); // 94/53 -> 94 / 53
  t = t.replace(/(\d)\s*%/g, "$1");
  t = t.replace(/\b(fio|spo|sat o|s p o|f i o)\s*(2|dos)\b/g, (_m, a: string) => (a.startsWith("f") ? "fio2" : "spo2"));
  t = t.replace(/\b(fio2|spo2|etco2)\b/g, " $1 ");
  t = t.replace(/(\d)\s*t\s*(\d)/g, "$1 t $2"); // «4t6» -> 4 t 6 (Glasgow con tubo)
  t = t.replace(/[^a-z0-9./ ]+/g, " ");
  t = t.replace(/\.(?!\d)/g, " ").replace(/(?<!\d)\./g, " ");
  return t.split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Numeros en palabras
// ---------------------------------------------------------------------------

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
  setecientos: 700, ochocientos: 800, novecientos: 900
};
const DIGITOS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];

const esNumeroEscrito = (w: string): boolean => /^\d+(\.\d+)?$/.test(w);
const esPalabraNumero = (w: string | undefined): boolean => w !== undefined && (w in UNIDADES || w in DECENAS || w in CENTENAS || w === "mil");

/** Entero en palabras desde `i`: «trescientos sesenta» -> 360. */
function enteroEnPalabras(ws: readonly string[], i: number): { n: number; fin: number } | null {
  let j = i;
  let total = 0;
  let algo = false;
  if (ws[j] === "mil") { total = 1000; j++; algo = true; }
  else if (ws[j + 1] === "mil" && ws[j]! in UNIDADES) { total = UNIDADES[ws[j]!]! * 1000; j += 2; algo = true; }
  if (ws[j]! in CENTENAS) {
    total += CENTENAS[ws[j]!]!;
    j++;
    algo = true;
  }
  if (ws[j]! in DECENAS) {
    total += DECENAS[ws[j]!]!;
    j++;
    algo = true;
    if (ws[j] === "y" && ws[j + 1] !== undefined && ws[j + 1]! in UNIDADES && UNIDADES[ws[j + 1]!]! < 10) {
      total += UNIDADES[ws[j + 1]!]!;
      j += 2;
    }
  } else if (ws[j]! in UNIDADES) {
    total += UNIDADES[ws[j]!]!;
    j++;
    algo = true;
  }
  return algo ? { n: total, fin: j } : null;
}

/** Numero desde `i` (escrito o en palabras, con «coma» o «punto» decimal). Devuelve texto con punto. */
function leerNumero(ws: readonly string[], i: number): { valor: string; fin: number } | null {
  const w = ws[i];
  if (w === undefined) return null;
  let entero: string;
  let j: number;
  if (esNumeroEscrito(w)) {
    if (w.includes(".")) return { valor: w, fin: i + 1 };
    entero = w;
    j = i + 1;
  } else {
    const e = enteroEnPalabras(ws, i);
    if (!e) return null;
    entero = String(e.n);
    j = e.fin;
  }
  if ((ws[j] === "coma" || ws[j] === "punto") && ws[j + 1] !== undefined) {
    let dec = "";
    let k = j + 1;
    if (esNumeroEscrito(ws[k]!)) {
      dec = ws[k]!.replace(".", "");
      k++;
    } else if (DIGITOS.includes(ws[k]!)) {
      // «cero coma cero uno»: cada palabra es un digito.
      while (ws[k] !== undefined && DIGITOS.includes(ws[k]!)) {
        dec += String(DIGITOS.indexOf(ws[k]!));
        k++;
      }
    } else {
      const e = enteroEnPalabras(ws, k);
      if (e) {
        dec = String(e.n);
        k = e.fin;
      }
    }
    if (dec) return { valor: `${entero}.${dec}`, fin: k };
  }
  return { valor: entero, fin: j };
}

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

type Clave = Exclude<CampoDictado, `inf:${IdInfusion}`> | "pa" | "gcs" | "presionControl" | "volumenControl";

const porLargo = <T,>(l: readonly (readonly [string, T])[]): (readonly [string, T])[] =>
  [...l].sort((x, y) => y[0].split(" ").length - x[0].split(" ").length);

/** Frases de cada dato. La mas larga gana: «frecuencia cardiaca» antes que «frecuencia». */
const FRASES = porLargo<Clave>([
  ["frecuencia cardiaca", "fc"], ["frec cardiaca", "fc"], ["pulso", "fc"], ["fc", "fc"],
  ["presion arterial", "pa"], ["presion sistolica", "pas"], ["presion diastolica", "pad"], ["sistolica", "pas"], ["diastolica", "pad"], ["pa", "pa"], ["presion", "pa"],
  ["saturacion de oxigeno", "spo2"], ["saturacion", "spo2"], ["spo2", "spo2"], ["sat", "spo2"],
  ["frecuencia respiratoria programada", "frProgramada"], ["frecuencia programada", "frProgramada"], ["fr programada", "frProgramada"],
  ["frecuencia seteada", "frProgramada"], ["fr seteada", "frProgramada"], ["frecuencia de respaldo", "frProgramada"],
  // «Frecuencia» a secas es la del paciente.
  ["frecuencia respiratoria del paciente", "frTotal"], ["frecuencia respiratoria total", "frTotal"], ["frecuencia del paciente", "frTotal"],
  ["fr del paciente", "frTotal"], ["frecuencia total", "frTotal"], ["fr total", "frTotal"],
  ["frecuencia respiratoria", "frTotal"], ["frecuencia", "frTotal"], ["fr", "frTotal"],
  ["volumen corriente espirado", "vtEspirado"], ["volumen espirado", "vtEspirado"], ["vt espirado", "vtEspirado"],
  ["volumen corriente programado", "vtProgramado"], ["volumen corriente", "vtProgramado"], ["volumen tidal", "vtProgramado"],
  ["volumen programado", "vtProgramado"], ["vt programado", "vtProgramado"], ["vt", "vtProgramado"],
  ["volumen minuto", "volMinuto"],
  // «PIP» es PEEP: el reconocedor oye «pip» cuando se dice «peep».
  ["auto peep", "autoPeep"], ["autopeep", "autoPeep"], ["peep intrinseca", "autoPeep"], ["peep", "peep"], ["pip", "peep"], ["pep", "peep"], ["epap", "peep"],
  ["presion pico", "pPico"], ["presion peak", "pPico"], ["presion maxima", "pPico"], ["ppeak", "pPico"], ["peak", "pPico"],
  ["presion plateau", "pPlateau"], ["presion meseta", "pPlateau"], ["plateau", "pPlateau"], ["meseta", "pPlateau"],
  ["presion media", "pMedia"],
  ["presion de soporte", "presion"], ["presion soporte", "presion"], ["soporte", "presion"], ["ipap", "presion"],
  ["tiempo inspiratorio", "ti"], ["ti", "ti"],
  ["fraccion inspirada de oxigeno", "fio2"], ["fraccion inspirada", "fio2"], ["fio2", "fio2"], ["fio", "fio2"],
  ["temperatura", "temperatura"], ["fuga", "fuga"], ["flujo", "flujo"],
  ["presion control", "presionControl"], ["volumen control", "volumenControl"],
  ["escala sas", "sas"], ["s a s", "sas"], ["sas", "sas"], ["riker", "sas"],
  ["escala de glasgow", "gcs"], ["glasgow", "gcs"], ["gcs", "gcs"],
  ["apertura ocular", "gcsO"], ["ocular", "gcsO"], ["respuesta verbal", "gcsV"], ["verbal", "gcsV"],
  ["respuesta motora", "gcsM"], ["motora", "gcsM"], ["motor", "gcsM"]
]);

/** Frases de modo (sin numero detras). «presion control 18» ademas es la P. control. */
const MODOS = porLargo<Modalidad>([
  ["cpap con presion de soporte", "CPAP_PS"], ["cpap mas presion de soporte", "CPAP_PS"], ["cpap mas soporte", "CPAP_PS"], ["cpap ps", "CPAP_PS"],
  ["cpap con soporte", "CPAP_PS"], ["modo cpap", "CPAP_PS"],
  ["canula nasal de alto flujo", "CNAF"], ["alto flujo", "CNAF"], ["cnaf", "CNAF"],
  ["tubo t", "TUBO_T"], ["tubo en t", "TUBO_T"], ["naricera", "O2_NARICERA"], ["venturi", "O2_VENTURI"],
  ["mascarilla con reservorio", "O2_RESERVORIO"], ["mascarilla de reservorio", "O2_RESERVORIO"], ["mascarilla simple", "O2_MASCARILLA"],
  ["bipap", "VNI_ST"], ["avaps", "AVAPS"]
]);

/** Nombres de las infusiones como se dicen. */
const NOMBRES_INFUSION = porLargo<IdInfusion>([
  ...INFUSIONES.map((d) => [sinTildes(d.nombre.toLowerCase()), d.id] as const),
  ...INFUSIONES.map((d) => [sinTildes(d.id.toLowerCase()), d.id] as const),
  ["dexmedetomidina", "dexmedetomidina"], ["dexmede", "dexmedetomidina"], ["fentanil", "fentanilo"], ["nora", "noradrenalina"],
  ["vaso", "vasopresina"], ["dobuta", "dobutamina"], ["mida", "midazolam"]
]);

const SEPARADORES_PA = new Set(["sobre", "con", "/", "partido", "slash"]);
/** Palabras de relleno entre el nombre del dato y su valor. */
const RELLENO = new Set(["de", "en", "es", "a", "el", "la", "del", "con", "esta", "estan", "queda", "quedo", "por", "ciento", "porciento", "x", "y", "son", "un", "una", "dosis", "a la", "se"]);
const SUSPENDER = new Set(["suspendida", "suspendido", "suspender", "suspende", "suspendo", "apagada", "apagado", "off", "retirada", "retirado"]);

const ETIQUETA: Record<Exclude<CampoDictado, `inf:${IdInfusion}`>, string> = {
  fc: "Frec. cardiaca", pas: "P. sistólica", pad: "P. diastólica", spo2: "SpO₂", modalidad: "Modo", sas: "SAS",
  gcsO: "Glasgow ocular", gcsV: "Glasgow verbal", gcsM: "Glasgow motor",
  frProgramada: "FR programada", vtProgramado: "Vt programado", flujo: "Flujo", ti: "TI", presion: "P. soporte / control", peep: "PEEP",
  fio2: "FiO₂", frTotal: "FR total", vtEspirado: "Vt espirado", pPico: "P. pico", pPlateau: "P. plateau", pMedia: "P. media",
  autoPeep: "Auto PEEP", volMinuto: "Vol. minuto", temperatura: "Temperatura", fuga: "Fuga", presionMax: "IPAP máx."
};

/** Nombre del dato como se ve en el control de ese modo («EPAP» en BiPAP, «P. soporte» en CPAP+PS). */
export function etiquetaDictado(campo: CampoDictado, modalidad: Modalidad): string {
  if (esInfusion(campo)) return INFUSIONES.find((d) => d.id === idInfusion(campo))?.nombre ?? campo;
  if (esVent(campo)) return CAMPOS_POR_MODALIDAD[modalidad].find((d) => d.campo === campo)?.etiqueta.replace(/ \(.*\)$/, "") ?? ETIQUETA[campo];
  return ETIQUETA[campo];
}

/** Limites: fuera de ellos el dato no se aplica. */
const RANGO: Partial<Record<CampoDictado, readonly [number, number]>> = {
  fc: [20, 250], pas: [40, 300], pad: [15, 200], spo2: [50, 100], fio2: [21, 100], peep: [0, 30], presion: [0, 60], presionMax: [0, 60],
  pPico: [0, 80], pPlateau: [0, 60], pMedia: [0, 50], autoPeep: [0, 30], frProgramada: [0, 60], frTotal: [0, 80],
  vtProgramado: [50, 1500], vtEspirado: [20, 2000], ti: [0.2, 5], flujo: [0, 80], volMinuto: [0, 40], temperatura: [30, 40], fuga: [0, 150],
  sas: [1, 7], gcsO: [1, 4], gcsV: [1, 5], gcsM: [1, 6]
};

const comoTeclado = (v: string): string => v.replace(".", ",");
const numero = (v: string): number => Number(v.replace(",", "."));
const IGUAL = "=";

// ---------------------------------------------------------------------------
// Valores del control anterior («igual», «sin cambios»)
// ---------------------------------------------------------------------------

const txt = (n: number | null | undefined): string | null => (n === null || n === undefined ? null : comoTeclado(String(n)));

function valorAnterior(campo: CampoDictado, a: Control | null | undefined): string | null {
  if (!a) return null;
  if (esInfusion(campo)) return txt(a.infusiones[idInfusion(campo)]?.dosis);
  switch (campo) {
    case "fc": case "pas": case "pad": case "spo2":
      return txt(a[campo]);
    case "modalidad":
      return a.ventilacion.modalidad;
    case "sas":
      return txt(a.sas);
    case "gcsO":
      return txt(a.glasgow?.ocular);
    case "gcsV":
      return txt(a.glasgow?.verbal);
    case "gcsM":
      return txt(a.glasgow?.motora);
    default:
      return txt(a.ventilacion[campo]);
  }
}

// ---------------------------------------------------------------------------
// Interpretacion
// ---------------------------------------------------------------------------

interface Oido { campo: CampoDictado; valor: string }

/** Lee el dictado completo y separa lo que se aplica de lo que no. */
export function interpretarDictado(texto: string, modalidadActual: Modalidad, via: ViaAerea, ctx: ContextoDictado = {}): ResultadoDictado {
  const ws = palabras(texto);
  const oidos: Oido[] = [];
  const noAplica: string[] = [];
  let modoDictado: Modalidad | null = null;
  const artificial = via !== "NATURAL";

  const coincide = (k: number, frase: string): boolean => frase.split(" ").every((p, n) => ws[k + n] === p);
  const saltarRelleno = (k: number): number => {
    let j = k;
    for (let s = 0; s < 3 && ws[j] !== undefined && RELLENO.has(ws[j]!) && !esPalabraNumero(ws[j]); s++) j++;
    return j;
  };
  /** «igual», «sin cambios», «se mantiene», «mismo»: devuelve donde termina. */
  const igualDesde = (k: number): number | null => {
    const j = saltarRelleno(k);
    const w = ws[j];
    if (w === "igual" || w === "mismo" || w === "misma" || w === "mantiene" || w === "mantenida" || w === "mantenido") return j + 1;
    if (w === "sin" && (ws[j + 1] === "cambios" || ws[j + 1] === "cambio")) return j + 2;
    return null;
  };
  /** El valor que sigue al nombre del dato. */
  const valorDespues = (k: number): { valor: string; fin: number } | null => {
    const ig = igualDesde(k);
    if (ig !== null) return { valor: IGUAL, fin: ig };
    return leerNumero(ws, saltarRelleno(k));
  };

  let i = 0;
  while (i < ws.length) {
    const modo = MODOS.find(([f]) => coincide(i, f));
    if (modo) {
      modoDictado = modo[1];
      i += modo[0].split(" ").length;
      continue;
    }
    // Infusiones: dosis, escalon, «igual» o «suspendida».
    const inf = NOMBRES_INFUSION.find(([f]) => coincide(i, f));
    if (inf) {
      const campo: CampoDictado = `inf:${inf[1]}`;
      let k = saltarRelleno(i + inf[0].split(" ").length);
      if (SUSPENDER.has(ws[k] ?? "") || (ws[k] === "se" && SUSPENDER.has(ws[k + 1] ?? ""))) {
        oidos.push({ campo, valor: "suspender" });
        i = k + (ws[k] === "se" ? 2 : 1);
        continue;
      }
      if (ws[k] === "escalon" || ws[k] === "nivel" || ws[k] === "paso") {
        const n = leerNumero(ws, k + 1);
        const dosis = n ? dosisDeEscalon(inf[1], Number(n.valor)) : null;
        if (n && dosis !== null) oidos.push({ campo, valor: String(dosis) });
        else noAplica.push(`${etiquetaDictado(campo, modalidadActual)}: escalón sin valor`);
        i = n ? n.fin : k + 1;
        continue;
      }
      const v = valorDespues(i + inf[0].split(" ").length);
      if (v) {
        oidos.push({ campo, valor: v.valor });
        i = v.fin;
      } else {
        noAplica.push(`${etiquetaDictado(campo, modalidadActual)} sin dosis`);
        i = k;
      }
      continue;
    }
    const frase = FRASES.find(([f]) => coincide(i, f));
    if (!frase) {
      i++;
      continue;
    }
    const [f, clave] = frase;
    const k = i + f.split(" ").length;
    if (clave === "volumenControl" || clave === "presionControl") {
      modoDictado = clave === "volumenControl" ? "ACVC" : "PCV";
      const v = clave === "presionControl" ? leerNumero(ws, saltarRelleno(k)) : null;
      if (v) oidos.push({ campo: "presion", valor: v.valor });
      i = v ? v.fin : k;
      continue;
    }
    if (clave === "gcs") {
      const ig = igualDesde(k);
      if (ig !== null) {
        oidos.push({ campo: "gcsO", valor: IGUAL }, { campo: "gcsM", valor: IGUAL });
        if (!artificial) oidos.push({ campo: "gcsV", valor: IGUAL });
        i = ig;
        continue;
      }
      // «glasgow 4 5 6», «4 T 6», «456»: ocular, verbal y motor.
      const partes: string[] = [];
      let j = saltarRelleno(k);
      while (partes.length < 3 && ws[j] !== undefined) {
        if (ws[j] === "t" || ws[j] === "te") { partes.push("T"); j++; continue; }
        if (/^[1-6]{3}$/.test(ws[j]!)) { partes.push(...ws[j]!.split("")); j++; continue; }
        const n = leerNumero(ws, j);
        if (!n) break;
        partes.push(n.valor);
        j = n.fin;
      }
      const [o, v2, m] = partes.length === 2 ? [partes[0], "T", partes[1]] : partes;
      if (partes.length === 1) noAplica.push(`Glasgow ${partes[0]}: dicta ocular, verbal y motor`);
      else if (partes.length >= 2) {
        if (o) oidos.push({ campo: "gcsO", valor: o });
        if (v2 && v2 !== "T" && !artificial) oidos.push({ campo: "gcsV", valor: v2 });
        if (m) oidos.push({ campo: "gcsM", valor: m });
      }
      i = j;
      continue;
    }
    const v = valorDespues(k);
    if (!v) {
      i = k;
      continue;
    }
    if (clave === "pa") {
      if (v.valor === IGUAL) {
        oidos.push({ campo: "pas", valor: IGUAL }, { campo: "pad", valor: IGUAL });
        i = v.fin;
        continue;
      }
      // «94 sobre 53», «94 con 53», «94/53»
      if (ws[v.fin] !== undefined && SEPARADORES_PA.has(ws[v.fin]!)) {
        const d = leerNumero(ws, v.fin + 1);
        if (d) {
          oidos.push({ campo: "pas", valor: v.valor }, { campo: "pad", valor: d.valor });
          i = d.fin;
          continue;
        }
      }
      i = v.fin;
      continue;
    }
    if (clave === "gcsV" && artificial) {
      i = v.fin;
      continue;
    }
    oidos.push({ campo: clave, valor: v.valor });
    i = v.fin;
  }

  // El modo dictado manda si corresponde a la via; si no, no se aplica.
  let modalidad = modalidadActual;
  if (modoDictado) {
    if (MODALIDADES_POR_VIA[via].includes(modoDictado)) modalidad = modoDictado;
    else if (modoDictado === "CNAF" && MODALIDADES_POR_VIA[via].includes("CNAF_TQT")) modalidad = "CNAF_TQT";
    else noAplica.push(`Modo ${ETIQUETA_MODALIDAD[modoDictado]}: no corresponde a la vía aérea`);
  }
  const aplicaVent = new Set<CampoDictado>(CAMPOS_POR_MODALIDAD[modalidad].map((d) => d.campo));
  const existe = (c: CampoDictado): boolean => !esVent(c) || aplicaVent.has(c);

  // «igual» toma el valor del control anterior; agrupar por dato.
  const porCampo = new Map<CampoDictado, { valores: string[]; igual: boolean }>();
  for (const o of oidos) {
    let campo = o.campo;
    // En los modos sin volumen programado, «volumen corriente» es lo que hace el paciente.
    if (campo === "vtProgramado" && !aplicaVent.has("vtProgramado") && aplicaVent.has("vtEspirado")) campo = "vtEspirado";
    const et = etiquetaDictado(campo, modalidad);
    if (!existe(campo)) {
      noAplica.push(`${et} ${o.valor === IGUAL ? "igual" : comoTeclado(o.valor)}: no existe en ${ETIQUETA_MODALIDAD[modalidad]}`);
      continue;
    }
    let valor = o.valor;
    const igual = valor === IGUAL;
    if (igual) {
      const ant = valorAnterior(campo, ctx.anterior);
      if (ant === null) {
        noAplica.push(`${et} igual: no hay valor anterior`);
        continue;
      }
      valor = ant;
    }
    const x = porCampo.get(campo) ?? { valores: [], igual: false };
    porCampo.set(campo, { valores: [...x.valores, valor], igual: x.igual || igual });
  }

  const datos: DatoDictado[] = [];
  const dudas: DudaDictado[] = [];
  if (modoDictado && modalidad !== modalidadActual) datos.push({ campo: "modalidad", valor: modalidad, veces: 1 });
  for (const [campo, { valores, igual }] of porCampo) {
    const et = etiquetaDictado(campo, modalidad);
    const distintos = [...new Set(valores.map((x) => (x === "suspender" ? x : String(numero(x)))))];
    if (distintos.length > 1) {
      dudas.push({
        id: `conflicto-${campo}`,
        tipo: "CONFLICTO",
        texto: `Dijiste ${et} con valores distintos: ${distintos.map(comoTeclado).join(" y ")}. ¿Cuál vale?`,
        opciones: [...distintos.map((x) => ({ etiqueta: comoTeclado(x), campo, valor: comoTeclado(x) })), { etiqueta: "Descartar", campo: null, valor: "" }]
      });
      continue;
    }
    const valor = distintos[0]!;
    if (valor !== "suspender") {
      const n = numero(valor);
      const rango = RANGO[campo];
      if (!Number.isFinite(n) || (rango && (n < rango[0] || n > rango[1])) || (esInfusion(campo) && n <= 0)) {
        noAplica.push(`${et} ${comoTeclado(valor)}: fuera de rango`);
        continue;
      }
    }
    datos.push({ campo, valor: comoTeclado(valor), veces: valores.length, ...(igual ? { igual: true } : {}) });
  }

  // La sistolica tiene que ser mayor que la diastolica: si no, ninguna se aplica.
  const pas = datos.find((d) => d.campo === "pas");
  const pad = datos.find((d) => d.campo === "pad");
  if (pas && pad && numero(pas.valor) <= numero(pad.valor)) {
    datos.splice(datos.indexOf(pas), 1);
    datos.splice(datos.indexOf(pad), 1);
    noAplica.push(`Presión ${pas.valor}/${pad.valor}: la sistólica no es mayor que la diastólica`);
  }

  // SAS solo con sedoanalgesia en curso (la del control, con lo dictado de las infusiones).
  const sas = datos.find((d) => d.campo === "sas");
  if (sas && ctx.b && !sedoanalgesiaActivaEnBorrador(aplicarDictado(ctx.b, datos.filter((d) => d !== sas)))) {
    datos.splice(datos.indexOf(sas), 1);
    noAplica.push(`SAS ${sas.valor}: sin sedación en curso (se registra la vigilia)`);
  }

  return { modalidad, datos: ordenar(datos, modalidad), dudas, noAplica };
}

/** En el orden del formulario: signos vitales, Glasgow, infusiones, SAS, modo y los datos del modo. */
function ordenar(datos: readonly DatoDictado[], modalidad: Modalidad): DatoDictado[] {
  const orden: string[] = ["fc", "pas", "pad", "spo2", "gcsO", "gcsV", "gcsM", ...INFUSIONES.map((d) => `inf:${d.id}`), "sas", "modalidad", ...CAMPOS_POR_MODALIDAD[modalidad].map((d) => d.campo)];
  return [...datos].sort((a, b) => orden.indexOf(a.campo) - orden.indexOf(b.campo));
}

/** Las dudas resueltas se suman a los datos (una opcion con campo null descarta). */
export function resolverDudas(r: ResultadoDictado, elecciones: Readonly<Record<string, OpcionDuda>>): DatoDictado[] {
  const datos = [...r.datos];
  for (const d of r.dudas) {
    const e = elecciones[d.id];
    if (!e || e.campo === null) continue;
    const i = datos.findIndex((x) => x.campo === e.campo);
    if (i >= 0) datos.splice(i, 1);
    datos.push({ campo: e.campo, valor: e.valor, veces: 1 });
  }
  return ordenar(datos, r.modalidad);
}

/** Valor que hoy tiene el borrador en ese dato (para mostrar lo que se reemplaza). */
export function valorActual(b: BorradorControl, campo: CampoDictado): string {
  if (esInfusion(campo)) {
    const x = b.infusiones[idInfusion(campo)];
    return x.activa ? x.dosis : "";
  }
  switch (campo) {
    case "fc": case "pas": case "pad": case "spo2":
      return b[campo];
    case "modalidad":
      return b.modalidad;
    case "sas":
      return b.sas === null ? "" : String(b.sas);
    case "gcsO":
      return b.glasgow.ocular === null ? "" : String(b.glasgow.ocular);
    case "gcsV":
      return b.glasgow.verbal === null ? "" : String(b.glasgow.verbal);
    case "gcsM":
      return b.glasgow.motora === null ? "" : String(b.glasgow.motora);
    default:
      return b.vent[campo];
  }
}

/** Escribe en el borrador SOLO los datos confirmados. No toca nada mas ni guarda. */
export function aplicarDictado(b: BorradorControl, datos: readonly DatoDictado[]): BorradorControl {
  let x = b;
  const modo = datos.find((d) => d.campo === "modalidad");
  if (modo) x = cambiarModalidad(x, modo.valor as Modalidad);
  for (const d of datos) {
    const c = d.campo;
    if (c === "modalidad") continue;
    if (esInfusion(c)) {
      const id = idInfusion(c);
      if (d.valor === "suspender") x = suspenderInfusion(x, id);
      else {
        if (!x.infusiones[id].activa) x = iniciarInfusion(x, id);
        x = { ...x, infusiones: { ...x.infusiones, [id]: { ...x.infusiones[id], activa: true, libre: true, escalon: "", dosis: d.valor } } };
      }
      continue;
    }
    switch (c) {
      case "fc": case "pas": case "pad": case "spo2":
        x = { ...x, [c]: d.valor };
        break;
      case "sas":
        x = { ...x, sas: Number(d.valor) as BorradorControl["sas"] };
        break;
      case "gcsO":
        x = { ...x, glasgow: { ...x.glasgow, ocular: Number(d.valor) as 1 | 2 | 3 | 4 } };
        break;
      case "gcsV":
        x = { ...x, glasgow: { ...x.glasgow, verbal: Number(d.valor) as 1 | 2 | 3 | 4 | 5 } };
        break;
      case "gcsM":
        x = { ...x, glasgow: { ...x.glasgow, motora: Number(d.valor) as 1 | 2 | 3 | 4 | 5 | 6 } };
        break;
      default:
        x = { ...x, vent: { ...x.vent, [c]: d.valor } };
    }
  }
  return x;
}

/** Texto corto de un dato para la guia y la revision («94/53», «ACVC», «8», «suspender»). */
export function textoDato(d: DatoDictado): string {
  return d.campo === "modalidad" ? ETIQUETA_MODALIDAD[d.valor as Modalidad] : d.valor;
}

/** Clave de la casilla del formulario donde cae un dato («pa» junta PAS y PAD, «gcs» el Glasgow). */
export function casillaDe(campo: CampoDictado): string {
  if (campo === "pas" || campo === "pad") return "pa";
  if (campo === "gcsO" || campo === "gcsV" || campo === "gcsM") return "gcs";
  return campo;
}

/** Los datos que se pueden dictar, en el orden del formulario (para la guia). */
export function guiaDictado(modalidad: Modalidad, b?: BorradorControl): readonly { readonly campo: string; readonly etiqueta: string }[] {
  const infusiones = b ? INFUSIONES.filter((d) => b.infusiones[d.id].activa).map((d) => ({ campo: `inf:${d.id}`, etiqueta: d.nombre })) : [];
  const sedada = b ? sedoanalgesiaActivaEnBorrador(b) : false;
  return [
    { campo: "fc", etiqueta: "FC" },
    { campo: "pa", etiqueta: "PA" },
    { campo: "spo2", etiqueta: "SpO₂" },
    { campo: "gcs", etiqueta: "Glasgow" },
    ...infusiones,
    ...(sedada ? [{ campo: "sas", etiqueta: "SAS" }] : []),
    { campo: "modalidad", etiqueta: "Modo" },
    ...CAMPOS_POR_MODALIDAD[modalidad].map((d) => ({ campo: d.campo, etiqueta: d.etiqueta.replace(/ \(.*\)$/, "") }))
  ];
}
