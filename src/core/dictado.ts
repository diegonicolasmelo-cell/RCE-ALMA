/**
 * Dictado por voz del control: interpreta el texto que entrega el reconocedor del telefono y lo
 * convierte en datos candidatos para las casillas. Es determinista y no adivina: lo dudoso
 * («PIP», «frecuencia» a secas, dos valores distintos para el mismo dato, valores imposibles)
 * queda como duda que la persona resuelve antes de aplicar. Nunca guarda nada.
 *
 * Primera etapa: signos vitales y ventilacion. Las infusiones se reconocen para mostrarlas,
 * pero no se aplican (se registran a mano por escalon o dosis).
 */

import { CAMPOS_POR_MODALIDAD, ETIQUETA_MODALIDAD, INFUSIONES, MODALIDADES_POR_VIA } from "./catalogos";
import { cambiarModalidad } from "./borrador";
import type { BorradorControl } from "./borrador";
import type { CampoVent, Modalidad, ViaAerea } from "./tipos";

export type CampoDictado = "fc" | "pas" | "pad" | "spo2" | "modalidad" | CampoVent;

export interface DatoDictado {
  readonly campo: CampoDictado;
  /** Como lo escribe el teclado: decimales con coma. Para el modo, la clave de la modalidad. */
  readonly valor: string;
  /** Cuantas veces se dijo el mismo valor. */
  readonly veces: number;
}

export interface OpcionDuda {
  readonly etiqueta: string;
  /** null = descartar. */
  readonly campo: CampoDictado | null;
  readonly valor: string;
}

export interface DudaDictado {
  readonly id: string;
  readonly tipo: "PIP" | "FR" | "CONFLICTO" | "RANGO";
  readonly texto: string;
  readonly opciones: readonly OpcionDuda[];
}

export interface ResultadoDictado {
  /** Modalidad con que se juzga que casillas existen: la dictada o la actual. */
  readonly modalidad: Modalidad;
  readonly datos: readonly DatoDictado[];
  readonly dudas: readonly DudaDictado[];
  /** Infusiones oidas: se muestran, no se aplican. */
  readonly infusiones: readonly { readonly nombre: string; readonly valor: string }[];
  /** Datos oidos que no tienen casilla en este modo o via. */
  readonly noAplica: readonly string[];
}

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

type Clave = CampoDictado | "pa" | "pip" | "fr" | "presionControl" | "volumenControl";

/** Frases de cada dato, de la mas larga a la mas corta (se busca la mas larga primero). */
const FRASES: readonly (readonly [string, Clave])[] = ([
  ["frecuencia cardiaca", "fc"], ["frec cardiaca", "fc"], ["pulso", "fc"], ["fc", "fc"],
  ["presion arterial", "pa"], ["presion sistolica", "pas"], ["presion diastolica", "pad"], ["sistolica", "pas"], ["diastolica", "pad"], ["pa", "pa"],
  ["saturacion de oxigeno", "spo2"], ["saturacion", "spo2"], ["spo2", "spo2"], ["sat", "spo2"],
  ["frecuencia respiratoria del paciente", "frTotal"], ["frecuencia respiratoria total", "frTotal"], ["frecuencia del paciente", "frTotal"],
  ["fr del paciente", "frTotal"], ["frecuencia total", "frTotal"], ["fr total", "frTotal"],
  ["frecuencia respiratoria programada", "frProgramada"], ["frecuencia programada", "frProgramada"], ["fr programada", "frProgramada"],
  ["frecuencia seteada", "frProgramada"], ["fr seteada", "frProgramada"], ["frecuencia de respaldo", "frProgramada"],
  ["frecuencia respiratoria", "fr"], ["frecuencia", "fr"], ["fr", "fr"],
  ["volumen corriente espirado", "vtEspirado"], ["volumen espirado", "vtEspirado"], ["vt espirado", "vtEspirado"],
  ["volumen corriente programado", "vtProgramado"], ["volumen corriente", "vtProgramado"], ["volumen tidal", "vtProgramado"],
  ["volumen programado", "vtProgramado"], ["vt programado", "vtProgramado"], ["vt", "vtProgramado"],
  ["volumen minuto", "volMinuto"],
  ["auto peep", "autoPeep"], ["autopeep", "autoPeep"], ["peep intrinseca", "autoPeep"], ["peep", "peep"], ["epap", "peep"],
  ["presion pico", "pPico"], ["presion peak", "pPico"], ["presion maxima", "pPico"], ["ppeak", "pPico"], ["peak", "pPico"], ["pip", "pip"],
  ["presion plateau", "pPlateau"], ["presion meseta", "pPlateau"], ["plateau", "pPlateau"], ["meseta", "pPlateau"],
  ["presion media", "pMedia"],
  ["presion de soporte", "presion"], ["presion soporte", "presion"], ["soporte", "presion"], ["ipap", "presion"],
  ["tiempo inspiratorio", "ti"], ["ti", "ti"],
  ["fraccion inspirada de oxigeno", "fio2"], ["fraccion inspirada", "fio2"], ["fio2", "fio2"], ["fio", "fio2"],
  ["temperatura", "temperatura"], ["fuga", "fuga"], ["flujo", "flujo"],
  ["presion control", "presionControl"], ["volumen control", "volumenControl"], ["presion", "pa"]
] as const)
  .map(([f, c]) => [f, c] as const)
  // La frase mas larga gana: «frecuencia cardiaca» antes que «frecuencia».
  .sort((x, y) => y[0].split(" ").length - x[0].split(" ").length);

/** Frases de modo (sin numero detras). «presion control 18» ademas es la P. control. */
const MODOS: readonly (readonly [string, Modalidad])[] = ([
  ["cpap con presion de soporte", "CPAP_PS"], ["cpap mas presion de soporte", "CPAP_PS"], ["cpap mas soporte", "CPAP_PS"], ["cpap ps", "CPAP_PS"],
  ["cpap con soporte", "CPAP_PS"], ["modo cpap", "CPAP_PS"],
  ["canula nasal de alto flujo", "CNAF"], ["alto flujo", "CNAF"], ["cnaf", "CNAF"],
  ["tubo t", "TUBO_T"], ["tubo en t", "TUBO_T"], ["naricera", "O2_NARICERA"], ["venturi", "O2_VENTURI"],
  ["mascarilla con reservorio", "O2_RESERVORIO"], ["mascarilla de reservorio", "O2_RESERVORIO"], ["mascarilla simple", "O2_MASCARILLA"],
  ["bipap", "VNI_ST"], ["avaps", "AVAPS"]
] as (readonly [string, Modalidad])[]).sort((x, y) => y[0].split(" ").length - x[0].split(" ").length);

const SEPARADORES_PA = new Set(["sobre", "con", "/", "partido", "slash"]);
/** Palabras de relleno que pueden ir entre el nombre del dato y su valor. */
const RELLENO = new Set(["de", "en", "es", "a", "el", "la", "del", "con", "esta", "estan", "queda", "quedo", "por", "ciento", "porciento", "x", "y", "igual", "son", "un", "una"]);

const ETIQUETA: Record<CampoDictado, string> = {
  fc: "Frec. cardiaca", pas: "P. sistólica", pad: "P. diastólica", spo2: "SpO₂", modalidad: "Modo",
  frProgramada: "FR programada", vtProgramado: "Vt programado", flujo: "Flujo", ti: "TI", presion: "P. soporte / control", peep: "PEEP",
  fio2: "FiO₂", frTotal: "FR total", vtEspirado: "Vt espirado", pPico: "P. pico", pPlateau: "P. plateau", pMedia: "P. media",
  autoPeep: "Auto PEEP", volMinuto: "Vol. minuto", temperatura: "Temperatura", fuga: "Fuga", presionMax: "IPAP máx."
};

/** Nombre del dato como se ve en el control de ese modo («EPAP» en BiPAP, «P. soporte» en CPAP+PS). */
export function etiquetaDictado(campo: CampoDictado, modalidad: Modalidad): string {
  if (campo === "fc" || campo === "pas" || campo === "pad" || campo === "spo2" || campo === "modalidad") return ETIQUETA[campo];
  return CAMPOS_POR_MODALIDAD[modalidad].find((d) => d.campo === campo)?.etiqueta ?? ETIQUETA[campo];
}

/** Limites fisicos: fuera de ellos el dato no se aplica sin que alguien lo confirme. */
const RANGO: Partial<Record<CampoDictado, readonly [number, number]>> = {
  fc: [20, 250], pas: [40, 300], pad: [15, 200], spo2: [50, 100], fio2: [21, 100], peep: [0, 30], presion: [0, 60], presionMax: [0, 60],
  pPico: [0, 80], pPlateau: [0, 60], pMedia: [0, 50], autoPeep: [0, 30], frProgramada: [0, 60], frTotal: [0, 80],
  vtProgramado: [50, 1500], vtEspirado: [20, 2000], ti: [0.2, 5], flujo: [0, 80], volMinuto: [0, 40], temperatura: [30, 40], fuga: [0, 150]
};
/** Imposibles: ni siquiera se ofrece «usar igual». */
const IMPOSIBLE: Partial<Record<CampoDictado, readonly [number, number]>> = { spo2: [0, 100], fio2: [21, 100] };

const comoTeclado = (v: string): string => v.replace(".", ",");

// ---------------------------------------------------------------------------
// Interpretacion
// ---------------------------------------------------------------------------

interface Oido { campo: CampoDictado; valor: string }

/** Lee el dictado completo y separa lo claro de lo dudoso. */
export function interpretarDictado(texto: string, modalidadActual: Modalidad, via: ViaAerea): ResultadoDictado {
  const ws = palabras(texto);
  const oidos: Oido[] = [];
  const dudasCrudas: { tipo: "PIP" | "FR"; valor: string }[] = [];
  const infusiones: { nombre: string; valor: string }[] = [];
  let modoDictado: Modalidad | null = null;
  const noAplica: string[] = [];

  const nombresInfusion: (readonly [string, string])[] = [
    ...INFUSIONES.map((d) => [sinTildes(d.nombre.toLowerCase()), d.nombre] as const),
    ...INFUSIONES.map((d) => [sinTildes(d.id.toLowerCase()), d.nombre] as const),
    ["dexmedetomidina", "Precedex"], ["fentanil", "Fentanilo"], ["nora", "Noradrenalina"]
  ];

  /** El valor que sigue al nombre del dato (salta palabras de relleno). */
  const valorDespues = (k: number): { valor: string; fin: number } | null => {
    let j = k;
    for (let saltos = 0; saltos < 3 && ws[j] !== undefined && RELLENO.has(ws[j]!) && !esPalabraNumero(ws[j]); saltos++) j++;
    // «un» y «una» son relleno salvo que sean el numero.
    return leerNumero(ws, j);
  };
  const coincide = (k: number, frase: string): boolean => {
    const f = frase.split(" ");
    return f.every((p, n) => ws[k + n] === p);
  };

  let i = 0;
  while (i < ws.length) {
    // Modos
    const modo = MODOS.find(([f]) => coincide(i, f));
    if (modo) {
      modoDictado = modo[1];
      i += modo[0].split(" ").length;
      continue;
    }
    // Infusiones: se consumen con su valor para que no se confundan con otro dato.
    const inf = nombresInfusion.find(([f]) => coincide(i, f));
    if (inf) {
      const v = valorDespues(i + inf[0].split(" ").length);
      infusiones.push({ nombre: inf[1], valor: v ? comoTeclado(v.valor) : "sin valor" });
      i = v ? v.fin : i + 1;
      continue;
    }
    const frase = FRASES.find(([f]) => coincide(i, f));
    if (!frase) {
      i++;
      continue;
    }
    const [f, clave] = frase;
    const k = i + f.split(" ").length;
    const v = valorDespues(k);
    if (clave === "volumenControl" || clave === "presionControl") {
      modoDictado = clave === "volumenControl" ? "ACVC" : "PCV";
      if (clave === "presionControl" && v) {
        oidos.push({ campo: "presion", valor: v.valor });
        i = v.fin;
      } else i = k;
      continue;
    }
    if (!v) {
      i = k;
      continue;
    }
    if (clave === "pa") {
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
    if (clave === "pip") dudasCrudas.push({ tipo: "PIP", valor: v.valor });
    else if (clave === "fr") dudasCrudas.push({ tipo: "FR", valor: v.valor });
    else oidos.push({ campo: clave, valor: v.valor });
    i = v.fin;
  }

  // El modo dictado manda si corresponde a la via; si no, no se aplica.
  let modalidad = modalidadActual;
  if (modoDictado) {
    if (MODALIDADES_POR_VIA[via].includes(modoDictado)) modalidad = modoDictado;
    else if (modoDictado === "CNAF" && MODALIDADES_POR_VIA[via].includes("CNAF_TQT")) modalidad = "CNAF_TQT";
    else noAplica.push(`Modo ${ETIQUETA_MODALIDAD[modoDictado]} (no corresponde a la vía aérea)`);
  }
  const aplica = new Set<CampoDictado>(["fc", "pas", "pad", "spo2", ...CAMPOS_POR_MODALIDAD[modalidad].map((d) => d.campo)]);

  // Agrupar por dato: un mismo valor repetido es uno solo; valores distintos son conflicto.
  const porCampo = new Map<CampoDictado, string[]>();
  for (const o of oidos) {
    // En los modos sin volumen programado, «volumen corriente» es lo que hace el paciente.
    if (o.campo === "vtProgramado" && !aplica.has("vtProgramado") && aplica.has("vtEspirado")) o.campo = "vtEspirado";
    if (!aplica.has(o.campo)) {
      noAplica.push(`${etiquetaDictado(o.campo, modalidad)} ${comoTeclado(o.valor)} (no existe en ${ETIQUETA_MODALIDAD[modalidad]})`);
      continue;
    }
    porCampo.set(o.campo, [...(porCampo.get(o.campo) ?? []), o.valor]);
  }

  const datos: DatoDictado[] = [];
  const dudas: DudaDictado[] = [];
  if (modoDictado && modalidad !== modalidadActual) datos.push({ campo: "modalidad", valor: modalidad, veces: 1 });
  for (const [campo, valores] of porCampo) {
    const distintos = [...new Set(valores.map((x) => Number(x)))];
    const et = etiquetaDictado(campo, modalidad);
    if (distintos.length > 1) {
      dudas.push({
        id: `conflicto-${campo}`,
        tipo: "CONFLICTO",
        texto: `Dijiste ${et} con valores distintos: ${distintos.map((x) => comoTeclado(String(x))).join(" y ")}. ¿Cuál vale?`,
        opciones: [...distintos.map((x) => ({ etiqueta: comoTeclado(String(x)), campo, valor: comoTeclado(String(x)) })), { etiqueta: "Descartar", campo: null, valor: "" }]
      });
      continue;
    }
    const n = distintos[0]!;
    const rango = RANGO[campo];
    if (rango && (n < rango[0] || n > rango[1])) {
      const imp = IMPOSIBLE[campo];
      const imposible = imp ? n < imp[0] || n > imp[1] : false;
      dudas.push({
        id: `rango-${campo}`,
        tipo: "RANGO",
        texto: `${et} ${comoTeclado(String(n))} está fuera de lo esperable${imposible ? " y no es posible" : ""}.`,
        opciones: [...(imposible ? [] : [{ etiqueta: "Usar igual", campo, valor: comoTeclado(String(n)) }]), { etiqueta: "Descartar", campo: null, valor: "" }]
      });
      continue;
    }
    datos.push({ campo, valor: comoTeclado(valores[0]!), veces: valores.length });
  }

  // La sistolica tiene que ser mayor que la diastolica.
  const pas = datos.find((d) => d.campo === "pas");
  const pad = datos.find((d) => d.campo === "pad");
  if (pas && pad && Number(pas.valor.replace(",", ".")) <= Number(pad.valor.replace(",", "."))) {
    datos.splice(datos.indexOf(pas), 1);
    datos.splice(datos.indexOf(pad), 1);
    dudas.push({
      id: "pa-invertida",
      tipo: "RANGO",
      texto: `La presión ${pas.valor}/${pad.valor} tiene la sistólica menor o igual que la diastólica.`,
      opciones: [{ etiqueta: `Invertir: ${pad.valor}/${pas.valor}`, campo: "pas", valor: `${pad.valor}/${pas.valor}` }, { etiqueta: "Descartar", campo: null, valor: "" }]
    });
  }

  // Si la opcion cae en un dato que ya se dicto con otro valor, la etiqueta lo dice: nada se
  // reemplaza sin que se vea.
  const opcion = (campo: CampoDictado, v: string): OpcionDuda => {
    const ya = datos.find((x) => x.campo === campo);
    const et = etiquetaDictado(campo, modalidad);
    return { etiqueta: ya && ya.valor !== v ? `${et} (reemplaza ${ya.valor})` : et, campo, valor: v };
  };

  // «PIP»: el motor suele transcribir PEEP como PIP. Nunca se decide solo.
  dudasCrudas.forEach((d, n) => {
    const v = comoTeclado(d.valor);
    if (d.tipo === "PIP") {
      const ops: OpcionDuda[] = [];
      if (aplica.has("peep")) ops.push(opcion("peep", v));
      if (aplica.has("pPico")) ops.push(opcion("pPico", v));
      ops.push({ etiqueta: "Descartar", campo: null, valor: "" });
      dudas.push({ id: `pip-${n}`, tipo: "PIP", texto: `Entendí «PIP ${v}». ¿Qué es?`, opciones: ops });
      return;
    }
    // «frecuencia 22» a secas: solo es clara si el modo tiene una sola frecuencia respiratoria.
    const prog = aplica.has("frProgramada");
    const total = aplica.has("frTotal");
    if (prog && total) {
      dudas.push({
        id: `fr-${n}`,
        tipo: "FR",
        texto: `Entendí «frecuencia ${v}». ¿Es la programada o la del paciente?`,
        opciones: [
          opcion("frProgramada", v),
          opcion("frTotal", v),
          { etiqueta: "Descartar", campo: null, valor: "" }
        ]
      });
    } else if (total || prog) {
      const campo: CampoDictado = total ? "frTotal" : "frProgramada";
      if (!datos.some((x) => x.campo === campo)) datos.push({ campo, valor: v, veces: 1 });
    }
  });

  return { modalidad, datos: ordenar(datos, modalidad), dudas, infusiones, noAplica };
}

/** En el orden del formulario: signos vitales, modo y los datos del modo. */
function ordenar(datos: readonly DatoDictado[], modalidad: Modalidad): DatoDictado[] {
  const orden: CampoDictado[] = ["fc", "pas", "pad", "spo2", "modalidad", ...CAMPOS_POR_MODALIDAD[modalidad].map((d) => d.campo)];
  return [...datos].sort((a, b) => orden.indexOf(a.campo) - orden.indexOf(b.campo));
}

/** Las dudas resueltas se suman a los datos (una opcion con campo null descarta). */
export function resolverDudas(r: ResultadoDictado, elecciones: Readonly<Record<string, OpcionDuda>>): DatoDictado[] {
  const datos = [...r.datos];
  for (const d of r.dudas) {
    const e = elecciones[d.id];
    if (!e || e.campo === null) continue;
    if (d.id === "pa-invertida") {
      const [s, di] = e.valor.split("/");
      datos.push({ campo: "pas", valor: s!, veces: 1 }, { campo: "pad", valor: di!, veces: 1 });
      continue;
    }
    const i = datos.findIndex((x) => x.campo === e.campo);
    if (i >= 0) datos.splice(i, 1);
    datos.push({ campo: e.campo, valor: e.valor, veces: 1 });
  }
  return ordenar(datos, r.modalidad);
}

/** Valor que hoy tiene el borrador en ese dato (para mostrar lo que se reemplaza). */
export function valorActual(b: BorradorControl, campo: CampoDictado): string {
  if (campo === "fc" || campo === "pas" || campo === "pad" || campo === "spo2") return b[campo];
  if (campo === "modalidad") return b.modalidad;
  return b.vent[campo];
}

/** Escribe en el borrador SOLO los datos confirmados. No toca nada mas ni guarda. */
export function aplicarDictado(b: BorradorControl, datos: readonly DatoDictado[]): BorradorControl {
  let x = b;
  const modo = datos.find((d) => d.campo === "modalidad");
  if (modo) x = cambiarModalidad(x, modo.valor as Modalidad);
  for (const d of datos) {
    if (d.campo === "modalidad") continue;
    if (d.campo === "fc" || d.campo === "pas" || d.campo === "pad" || d.campo === "spo2") x = { ...x, [d.campo]: d.valor };
    else x = { ...x, vent: { ...x.vent, [d.campo]: d.valor } };
  }
  return x;
}

/** Texto corto de un dato para la guia y la revision («94/53», «ACVC», «8»). */
export function textoDato(d: DatoDictado): string {
  return d.campo === "modalidad" ? ETIQUETA_MODALIDAD[d.valor as Modalidad] : d.valor;
}

/** Los datos que se pueden dictar con este modo, en el orden del formulario (para la guia). */
export function guiaDictado(modalidad: Modalidad): readonly { readonly campo: CampoDictado | "pa"; readonly etiqueta: string }[] {
  return [
    { campo: "fc", etiqueta: "FC" },
    { campo: "pa", etiqueta: "PA" },
    { campo: "spo2", etiqueta: "SpO₂" },
    { campo: "modalidad", etiqueta: "Modo" },
    ...CAMPOS_POR_MODALIDAD[modalidad].map((d) => ({ campo: d.campo, etiqueta: d.etiqueta.replace(/ \(.*\)$/, "") }))
  ];
}
