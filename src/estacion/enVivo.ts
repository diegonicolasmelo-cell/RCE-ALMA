/**
 * «Kaptus en vivo»: los controles de la unidad para dejar en media pantalla al lado de ALMA.
 * Funcion pura sobre los datos que la estacion ya tiene cargados (sin red, sin clave).
 * Solo lee: no marca nada en ALMA; eso sigue en «Para ALMA».
 *
 * Privacidad: la ficha dice sexo y rango de edad, nunca nombre ni RUT.
 */

import {
  CAMAS_UNIDAD,
  ETIQUETA_MODALIDAD,
  HORA_INICIO_DIA,
  calcularDerivados,
  calcularGlasgow,
  calcularPbw,
  contarReintubaciones,
  horasDeVm,
  infusionesActivas,
  mecanicaBloqueadaPorAsincronia,
  textoVm,
  turnoDe
} from "@core/index";
import type { Control, Episodio, EventoClinico, IdInfusion, Medicion, Modalidad, ViaAerea } from "@core/index";
import { iniciales } from "./util";

export type Soporte = "VMI" | "VNI" | "O2";

/** Un control, ya en texto, con los rotulos de la hoja de kinesiologia. "" = sin dato. */
export interface FilaControl {
  readonly id: string;
  readonly hora: string;
  readonly registradoEn: string;
  /** Pasado a ALMA segun la transcripcion del episodio (ALMA es por episodio, no por control). */
  readonly enAlma: boolean;
  readonly soporte: Soporte;
  readonly modo: string;
  readonly fc: string;
  readonly pa: string;
  readonly pam: string;
  readonly pic: string;
  readonly gcs: string;
  readonly s5q: string;
  /** «3/2»: SAS y el escalon mas alto de sedacion. */
  readonly sasE: string;
  /** Una droga por renglon: «NA 0,12». */
  readonly dva: readonly string[];
  readonly vt: string;
  readonly fmx: string;
  readonly fr: string;
  readonly peep: string;
  readonly psop: string;
  readonly ppk: string;
  readonly pme: string;
  readonly pp: string;
  readonly dp: string;
  readonly comp: string;
  readonly apeep: string;
  readonly ie: string;
  readonly tobin: string;
  readonly vmin: string;
  readonly fio2: string;
  readonly sat: string;
  /** SpO2 bajo 90 %: la ficha se marca en rojo. */
  readonly satBaja: boolean;
  readonly firma: string;
}

export interface FichaEnVivo {
  readonly episodioId: string;
  /** "UCI-05" */
  readonly cama: string;
  readonly numero: number;
  /** «M · 60–64»: sexo y rango de edad, nunca el nombre. */
  readonly paciente: string;
  readonly edad: string;
  /** «TET Nº 7,5 · 22 cm», «TQT Nº 8» o «Vía natural». */
  readonly viaAerea: string;
  readonly via: ViaAerea;
  readonly calibre: string;
  readonly fijacion: string;
  /** «8 h» el primer dia, despues «3 d» (regla de src/core/pve.ts). "" sin VM. */
  readonly vm: string;
  readonly reintubaciones: number;
  readonly ingreso: string;
  readonly diasUci: number | null;
  readonly fase: string;
  readonly tallaCm: number;
  readonly pesoIdeal: number;
  /** Controles de la hoja actual (desde las 08:00); sin ninguno, el ultimo que haya. */
  readonly controles: readonly FilaControl[];
  /** Hay controles en la hoja actual (si no, `controles` trae solo el ultimo anterior). */
  readonly deEstaHoja: boolean;
  readonly pendientesAlma: number;
  /** El ultimo control tiene mas de 4 horas. */
  readonly ultimoViejo: boolean;
}

/** Abreviaturas de DVA e inotropicos para que quepan en la ficha. */
const ABREV: Partial<Record<IdInfusion, string>> = {
  noradrenalina: "NA",
  adrenalina: "ADR",
  vasopresina: "VP",
  dobutamina: "DBT",
  milrinona: "MIL"
};

const VIEJO_MS = 4 * 3600 * 1000;

/** Decimales con coma, como se escriben en la unidad. */
export function num(x: Medicion | undefined, decimales = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "";
  const f = 10 ** decimales;
  return String(Math.round(x * f) / f).replace(".", ",");
}

export function soporteDe(via: ViaAerea, m: Modalidad): Soporte {
  if (via !== "NATURAL" && (m === "ACVC" || m === "PCV" || m === "CPAP_PS")) return "VMI";
  if (m === "VNI_CPAP" || m === "VNI_ST" || m === "AVAPS") return "VNI";
  return "O2";
}

export function textoViaAerea(ep: Pick<Episodio, "viaAereaActual" | "calibreVia" | "fijacionCm">): string {
  const cal = ep.calibreVia ? ep.calibreVia.replace(".", ",") : "—";
  if (ep.viaAereaActual === "TET") return `TET Nº ${cal} · ${ep.fijacionCm ? `${ep.fijacionCm} cm` : "—"}`;
  if (ep.viaAereaActual === "TQT") return `TQT Nº ${cal}`;
  return "Vía natural";
}

/** Inicio de la hoja: las 08:00 del dia del turno (un control de las 02:00 es de la hoja de ayer). */
export function inicioHoja(ahora: Date): Date {
  const [y, m, d] = turnoDe(ahora).fecha.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, HORA_INICIO_DIA, 0, 0, 0);
}

/** Minutos desde las 08:00 de la hoja: ordena bien las horas despues de medianoche. */
function minutosEnHoja(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return (((h * 60 + m - HORA_INICIO_DIA * 60) % 1440) + 1440) % 1440;
}

/** Un control de la hoja ya transcrito: su hora no pasa la hora de transcripcion del episodio. */
export function pasadoAAlma(hora: string, ep: Pick<Episodio, "transcritoAlma" | "horaTranscripcion">): boolean {
  if (!ep.transcritoAlma || !ep.horaTranscripcion) return false;
  return minutosEnHoja(hora) <= minutosEnHoja(ep.horaTranscripcion);
}

/** Los controles que otro control corrigio no se muestran: vale la correccion. */
export function vigentes(controles: readonly Control[]): Control[] {
  const corregidos = new Set(controles.map((c) => c.corrige).filter((x): x is string => !!x));
  return controles.filter((c) => !corregidos.has(c.id));
}

export function filaControl(c: Control, pbw: number, enAlma: boolean): FilaControl {
  const v = c.ventilacion;
  const d = calcularDerivados(c, pbw);
  const bloq = mecanicaBloqueadaPorAsincronia(v);
  const g = c.glasgow ? calcularGlasgow(c.glasgow, c.viaAerea).display : "";
  const esc = Math.max(0, ...infusionesActivas(c.infusiones, "SEDANTE").map((a) => a.escalon ?? 0));
  const dva = [...infusionesActivas(c.infusiones, "DVA"), ...infusionesActivas(c.infusiones, "INOTROPO")].map(
    (a) => `${ABREV[a.id] ?? a.nombre} ${num(a.dosis, 2)}`.trim()
  );
  const fmx = v.flujo ?? v.ti;
  return {
    id: c.id,
    hora: c.hora,
    registradoEn: c.registradoEn,
    enAlma,
    soporte: soporteDe(c.viaAerea, v.modalidad),
    modo: ETIQUETA_MODALIDAD[v.modalidad] ?? v.modalidad,
    fc: num(c.fc, 0),
    pa: c.pas !== null && c.pad !== null ? `${num(c.pas, 0)}/${num(c.pad, 0)}` : "",
    pam: num(d.pam, 0),
    pic: num(c.neuro?.pic ?? null),
    gcs: g,
    s5q: num(c.s5q, 0),
    sasE: c.sas ? `${c.sas}/${esc || ""}` : "",
    dva,
    vt: num(v.vtEspirado ?? v.vtProgramado, 0),
    fmx: num(fmx),
    fr: num(v.frTotal ?? v.frProgramada, 0),
    peep: num(v.peep),
    psop: num(v.presion),
    ppk: num(v.pPico),
    pme: num(v.pMedia),
    pp: bloq ? "bloq." : num(v.pPlateau),
    dp: bloq ? "bloq." : num(d.drivingPressure),
    comp: num(d.compliance),
    apeep: num(v.autoPeep),
    ie: v.ie !== null && v.ie !== undefined ? `1:${num(v.ie)}` : "",
    tobin: num(d.tobin, 0),
    vmin: num(v.volMinuto),
    fio2: num(v.fio2, 0),
    sat: num(c.spo2, 0),
    satBaja: c.spo2 !== null && c.spo2 < 90,
    firma: iniciales(c.rutAutor)
  };
}

const inicioDia = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const ddmm = (d: Date): string => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function numeroCama(cama: string): number {
  const n = /(\d+)\s*$/.exec(cama)?.[1];
  return n ? Number(n) : 0;
}

export function fichaEnVivo(ep: Episodio, controles: readonly Control[], eventos: readonly EventoClinico[], ahora: Date): FichaEnVivo {
  const todos = vigentes(controles).sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const ini = inicioHoja(ahora).getTime();
  const deHoja = todos.filter((c) => new Date(c.registradoEn).getTime() >= ini);
  const deEstaHoja = deHoja.length > 0;
  const lista = deEstaHoja ? deHoja : todos.slice(-1);
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const filas = lista.map((c) => filaControl(c, pbw, deEstaHoja && pasadoAAlma(c.hora, ep)));
  const ultimo = filas.at(-1);
  const vm = textoVm(horasDeVm(ep, eventos, todos[0]?.registradoEn ?? null, ahora));
  const ing = ep.ingresadoEn ? new Date(ep.ingresadoEn) : null;
  return {
    episodioId: ep.id,
    cama: ep.cama,
    numero: numeroCama(ep.cama),
    paciente: [ep.sexo, ep.rangoEdad].filter(Boolean).join(" · ") || "—",
    edad: ep.rangoEdad ?? "—",
    viaAerea: textoViaAerea(ep),
    via: ep.viaAereaActual,
    calibre: ep.calibreVia ?? "",
    fijacion: ep.fijacionCm ?? "",
    // Con via natural no hay VM que contar, aunque quede registrada la ultima intubacion.
    vm: vm && ep.viaAereaActual !== "NATURAL" ? vm.replace(/^VM\s+/, "") : "",
    reintubaciones: contarReintubaciones(eventos),
    ingreso: ing ? ddmm(ing) : "—",
    diasUci: ing ? Math.max(0, Math.round((inicioDia(ahora.getTime()) - inicioDia(ing.getTime())) / 86_400_000)) : null,
    fase: ep.faseClinica || "Fase clínica sin anotar",
    tallaCm: ep.tallaCm,
    pesoIdeal: pbw,
    controles: filas,
    deEstaHoja,
    pendientesAlma: deEstaHoja ? filas.filter((f) => !f.enAlma).length : 0,
    ultimoViejo: !ultimo || ahora.getTime() - new Date(ultimo.registradoEn).getTime() > VIEJO_MS
  };
}

/** Una ficha por cama ocupada, ordenadas por numero de cama. */
export function fichasEnVivo(
  episodios: readonly Episodio[],
  controles: ReadonlyMap<string, readonly Control[]>,
  eventos: ReadonlyMap<string, readonly EventoClinico[]>,
  ahora: Date
): FichaEnVivo[] {
  return episodios
    .filter((e) => e.activo)
    .map((e) => fichaEnVivo(e, controles.get(e.id) ?? [], eventos.get(e.id) ?? [], ahora))
    .sort((a, b) => a.numero - b.numero);
}

/** Camas de la unidad en grupos de seis (1–6, 7–12, 13–18), como la paginacion de la hoja. */
export function segmentosDeCamas(camas: readonly string[] = CAMAS_UNIDAD, porSegmento = 6): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < camas.length; i += porSegmento) out.push(camas.slice(i, i + porSegmento));
  return out;
}

/** Filas de la «Hoja por cama», con los rotulos de la carilla 1 de kinesiologia. */
export const FILAS_HOJA: readonly { readonly grupo: "MONITORIZACIÓN" | "TERAPIA VENTILATORIA"; readonly etiqueta: string; readonly valor: (f: FilaControl) => string }[] = [
  { grupo: "MONITORIZACIÓN", etiqueta: "Frec. cardiaca", valor: (f) => f.fc },
  { grupo: "MONITORIZACIÓN", etiqueta: "P. arterial", valor: (f) => f.pa },
  { grupo: "MONITORIZACIÓN", etiqueta: "P. A. media", valor: (f) => f.pam },
  { grupo: "MONITORIZACIÓN", etiqueta: "PIC", valor: (f) => f.pic },
  { grupo: "MONITORIZACIÓN", etiqueta: "Glasgow", valor: (f) => f.gcs },
  { grupo: "MONITORIZACIÓN", etiqueta: "S5Q", valor: (f) => f.s5q },
  { grupo: "MONITORIZACIÓN", etiqueta: "SAS/Escalón", valor: (f) => f.sasE },
  { grupo: "MONITORIZACIÓN", etiqueta: "DVA", valor: (f) => f.dva.join(" + ") },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Modo", valor: (f) => f.modo },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Vol. tidal", valor: (f) => f.vt },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "F máx/T ins", valor: (f) => f.fmx },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Frecuencia", valor: (f) => f.fr },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "PEEP/EPAP", valor: (f) => f.peep },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "P sop/IPAP", valor: (f) => f.psop },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "P. máxima", valor: (f) => f.ppk },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "P. media", valor: (f) => f.pme },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "P. plateau", valor: (f) => f.pp },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "P. distensión", valor: (f) => f.dp },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Compliance", valor: (f) => f.comp },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Auto PEEP", valor: (f) => f.apeep },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Relación I:E", valor: (f) => f.ie },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "I. Tobin", valor: (f) => f.tobin },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Vol. minuto", valor: (f) => f.vmin },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "FiO₂", valor: (f) => f.fio2 },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "SpO₂", valor: (f) => f.sat },
  { grupo: "TERAPIA VENTILATORIA", etiqueta: "Firma", valor: (f) => f.firma }
];

/**
 * Cuantas columnas usa el mosaico: primero que cada ficha tenga al menos 66 × 230 px (los
 * catorce renglones legibles), despues el tamano mas comodo. Igual que el panel de Manuel.
 */
export function columnasMosaico(ancho: number, alto: number, n: number, gap = 5): number {
  let mejor = { c: 1, sc: -Infinity };
  for (let c = 1; c <= Math.max(1, n); c++) {
    const f = Math.ceil(n / c);
    const w = (ancho - gap * (c - 1)) / c;
    const h = (alto - gap * (f - 1)) / f;
    const sc = (w >= 66 && h >= 230 ? 10 : 0) + Math.min(w / 90, h / 260);
    if (sc > mejor.sc) mejor = { c, sc };
  }
  return mejor.c;
}
