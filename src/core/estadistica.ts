/**
 * Estadistica de la unidad (Estacion): un solo motor para el resumen por cama, los
 * indicadores y el archivo de egresados. Lee solo lo que ya se registra (controles y
 * eventos): el registro no cambia.
 *
 * Indicadores con las definiciones del tablero del RCE (svc_indicadores, alineadas con el
 * analisis de M. Fuentes):
 *  - Fracaso de extubacion OFICIAL = reintubacion <= 24 h tras una extubacion programada (con o
 *    sin PVE): es el plazo con que la unidad considera egresar (Diego, 22-nov-2026). A 48 h se
 *    cuenta aparte, de forma interna. La autoextubacion va aparte.
 *  - Autoextubaciones por 100 dias-VM (meta 1-2).
 *  - Fuera de protocolo = extubaciones programadas sin PVE (meta < 25 %).
 *  - PVE por 100 dias-paciente.
 *  - VM prolongada = mas de 7 dias-VM en el episodio.
 *  - Mortalidad sin ajuste por gravedad.
 */

import { ETIQUETA_MODALIDAD, ETIQUETA_MOTIVO_SIN_PVE, GRUPO_MODALIDAD, NIVEL_BIPEDESTACION } from "./catalogos";
import { esReintubacion } from "./eventos";
import { CRITERIOS_PVE } from "./pve";
import { HORA_INICIO_DIA, HORA_INICIO_NOCHE, turnoDe } from "./turnos";
import type { MotivoEgreso } from "./catalogos";
import type { Control, Episodio, EventoClinico, ValidacionApk } from "./tipos";

// ---------------------------------------------------------------------------
// Fechas y periodos
// ---------------------------------------------------------------------------

/** Fecha local AAAA-MM-DD de un instante. */
export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const enLocal = (dia: string, hora = 0): Date => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a!, m! - 1, d!, hora, 0, 0, 0);
};

/** Un periodo: [desde, hasta) en instantes. */
export interface Periodo {
  readonly desde: Date;
  readonly hasta: Date;
  readonly etiqueta: string;
}

export type TipoPeriodo = "TURNO" | "TURNO_ANTERIOR" | "DIA" | "SEMANA" | "MES" | "MES_ANTERIOR";

/** El periodo pedido, contado desde `ahora`. Los turnos son los de Kaptus (dia 8-20, noche 20-8). */
export function periodoDe(tipo: TipoPeriodo, ahora: Date): Periodo {
  const t = turnoDe(ahora);
  const inicioTurno = enLocal(t.fecha, t.tipo === "DIA" ? HORA_INICIO_DIA : HORA_INICIO_NOCHE);
  const durTurno = 12 * 3600_000;
  const nombre = (tipo: "DIA" | "NOCHE", fecha: string): string => `Turno ${tipo === "DIA" ? "día" : "noche"} · ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;
  switch (tipo) {
    case "TURNO":
      return { desde: inicioTurno, hasta: new Date(inicioTurno.getTime() + durTurno), etiqueta: nombre(t.tipo, t.fecha) };
    case "TURNO_ANTERIOR": {
      const desde = new Date(inicioTurno.getTime() - durTurno);
      const ta = turnoDe(desde);
      return { desde, hasta: inicioTurno, etiqueta: nombre(ta.tipo, ta.fecha) };
    }
    case "DIA": {
      const desde = enLocal(diaLocal(ahora));
      return { desde, hasta: new Date(desde.getTime() + 24 * 3600_000), etiqueta: `Día ${diaLocal(ahora)}` };
    }
    case "SEMANA": {
      const hasta = enLocal(diaLocal(new Date(ahora.getTime() + 24 * 3600_000)));
      return { desde: new Date(hasta.getTime() - 7 * 24 * 3600_000), hasta, etiqueta: "Últimos 7 días" };
    }
    case "MES": {
      const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde, hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1), etiqueta: nombreMes(desde) };
    }
    case "MES_ANTERIOR": {
      const desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      return { desde, hasta: new Date(ahora.getFullYear(), ahora.getMonth(), 1), etiqueta: nombreMes(desde) };
    }
  }
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (d: Date): string => `${MESES[d.getMonth()]![0]!.toUpperCase()}${MESES[d.getMonth()]!.slice(1)} ${d.getFullYear()}`;

const dentro = (iso: string, p: Periodo): boolean => {
  const t = Date.parse(iso);
  return t >= p.desde.getTime() && t < p.hasta.getTime();
};

/** Los dias (AAAA-MM-DD) del periodo, para los denominadores. */
function diasDel(p: Periodo): string[] {
  const out: string[] = [];
  for (let d = enLocal(diaLocal(p.desde)); d < p.hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(diaLocal(d));
  return out;
}

// ---------------------------------------------------------------------------
// Lo que se registra, por episodio
// ---------------------------------------------------------------------------

export interface DatosEstadistica {
  readonly episodios: readonly Episodio[];
  readonly controles: ReadonlyMap<string, readonly Control[]>;
  readonly eventos: ReadonlyMap<string, readonly EventoClinico[]>;
  readonly apks?: ReadonlyMap<string, readonly ValidacionApk[]>;
}

/** Ventilacion mecanica invasiva: los modos del ventilador con TET o TQT (la VNI no cuenta). */
export const esControlVmi = (c: Control): boolean => GRUPO_MODALIDAD[c.ventilacion.modalidad] === "VENTILACION_MECANICA" && (c.viaAerea === "TET" || c.viaAerea === "TQT");

/** Dias (AAAA-MM-DD) en que el paciente estuvo en VM invasiva en algun momento: segun sus controles. */
export function diasVmDelEpisodio(controles: readonly Control[]): ReadonlySet<string> {
  return new Set(controles.filter(esControlVmi).map((c) => diaLocal(new Date(c.registradoEn))));
}

/** Dias (AAAA-MM-DD) con el episodio abierto: del ingreso (o el primer registro) al egreso (o ahora). */
function diasDelEpisodio(ep: Episodio, controles: readonly Control[], ahora: Date): ReadonlySet<string> {
  const inicioIso = ep.ingresadoEn ?? controles[0]?.registradoEn;
  if (!inicioIso) return new Set();
  const fin = ep.egreso ? new Date(ep.egreso.en) : ahora;
  const out = new Set<string>();
  for (let d = enLocal(diaLocal(new Date(inicioIso))); d <= fin; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.add(diaLocal(d));
  return out;
}

/** Actividades del control antiguo (antes de que la KTM fuera evento) que son bipedestacion. */
const BIPEDESTACION_ANTIGUA = new Set(["Bipedestación asistida", "Marcha asistida en el box"]);

/**
 * La primera bipedestacion del episodio (PTO del REM 28, codigo 1010922): la primera KTM de nivel
 * 4 o 5, o en registros antiguos, el primer control con bipedestacion o marcha. ISO o null.
 */
export function primeraBipedestacion(controles: readonly Control[], eventos: readonly EventoClinico[]): string | null {
  const enEventos = eventos.filter((e) => e.tipo === "TERAPIA_FISICA" && e.realizada && (e.nivel ?? 0) >= NIVEL_BIPEDESTACION).map((e) => e.registradoEn);
  const enControles = controles.filter((c) => c.terapiaFisica.estado === "REALIZADA" && c.terapiaFisica.actividades.some((a) => BIPEDESTACION_ANTIGUA.has(a))).map((c) => c.registradoEn);
  const todas = [...enEventos, ...enControles].sort();
  return todas[0] ?? null;
}

/**
 * Minutos con valvula de fonacion dentro del periodo: desde el control que la inicia hasta el
 * primer control en otro modo (o el egreso, o ahora si sigue con ella).
 */
export function minutosValvula(ep: Episodio, controles: readonly Control[], p: Periodo, ahora: Date): number {
  const cs = [...controles].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const fin = ep.egreso ? Date.parse(ep.egreso.en) : ahora.getTime();
  let total = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    if (c.ventilacion.modalidad !== "VALVULA_FONACION") continue;
    if (i > 0 && cs[i - 1]!.ventilacion.modalidad === "VALVULA_FONACION") continue;
    const sig = cs.slice(i + 1).find((x) => x.ventilacion.modalidad !== "VALVULA_FONACION");
    const desde = Math.max(Date.parse(c.registradoEn), p.desde.getTime());
    const hasta = Math.min(sig ? Date.parse(sig.registradoEn) : fin, p.hasta.getTime(), ahora.getTime());
    if (hasta > desde) total += (hasta - desde) / 60_000;
  }
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Estadistica: resumen por cama del periodo
// ---------------------------------------------------------------------------

export interface FilaCama {
  readonly episodioId: string;
  readonly cama: string;
  /** Modo del ultimo control del periodo (o vacio si no hubo controles). */
  readonly modo: string;
  /** Controles registrados = sesiones de kinesiterapia respiratoria (KTR). */
  readonly ktr: number;
  /** Terapia fisica (KTM) realizada: eventos KTM (y controles antiguos con terapia fisica). */
  readonly ktm: number;
  /** Sesiones de IMT (eventos IMT y controles antiguos con IMT). */
  readonly imt: number;
  /** Nivel mas alto de la KTM del periodo (1 a 5). */
  readonly nivel: number | null;
  /** En el periodo fue la primera bipedestacion del episodio (PTO). */
  readonly pto: boolean;
  /** IMS mas alto del periodo. */
  readonly ims: number | null;
  /** Si no hubo KTM: por que (contraindicacion registrada o «no realizada»). */
  readonly ktmMotivo: string | null;
  /** APK firmada que cumple, en el periodo. */
  readonly apk: "CUMPLE" | "NO_CUMPLE" | null;
  /** Eventos del periodo (PVE incluida), con su hora. */
  readonly eventos: readonly { readonly hora: string; readonly texto: string }[];
  /** Quienes registraron (sus identificadores). */
  readonly autores: readonly string[];
}

export interface ResumenEstadistica {
  readonly filas: readonly FilaCama[];
  readonly totales: {
    readonly pacientes: number;
    readonly ktr: number;
    readonly ktm: number;
    readonly imt: number;
    readonly pve: number;
    readonly eventos: number;
    readonly apkCumple: number;
    readonly pto: number;
    readonly educacion: number;
  };
  /** Por que no se hizo terapia fisica: motivo → veces. */
  readonly motivosSinKtm: readonly { readonly motivo: string; readonly n: number }[];
  /** Por que no se hizo la PVE: la razon registrada (o el criterio del checklist que fallo) → veces. */
  readonly motivosSinPve: readonly { readonly motivo: string; readonly n: number }[];
}

/** Eventos que no se listan como «hechos»: son pasos internos de un flujo. */
const SIN_LISTAR = new Set<EventoClinico["tipo"]>(["CONTROL_PVE", "INICIO_PVE", "EVALUACION_PVE", "REEVAL_POST_EXTUB", "TERAPIA_FISICA", "IMT"]);

/** El texto corto de un evento para la tabla. La PVE se cuenta por su termino o, si sigue, por su inicio. */
function textoEvento(e: EventoClinico, describir: (e: EventoClinico) => string): string | null {
  if (e.tipo === "FIN_PVE") return e.exitosa ? "PVE tolerada" : "PVE no tolerada";
  if (SIN_LISTAR.has(e.tipo)) return null;
  return describir(e);
}

export function resumenPorCama(
  d: DatosEstadistica,
  p: Periodo,
  describir: (e: EventoClinico) => string,
  autor: string | null = null
): ResumenEstadistica {
  const filas: FilaCama[] = [];
  const sinKtm = new Map<string, number>();
  const sinPve = new Map<string, number>();
  let pve = 0;
  let educacion = 0;
  const camas = [...d.episodios].sort((a, b) => a.cama.localeCompare(b.cama, "es", { numeric: true }));
  for (const ep of camas) {
    const deAutor = <T extends { rutAutor: string }>(x: T): boolean => autor === null || x.rutAutor === autor;
    const cs = (d.controles.get(ep.id) ?? []).filter((c) => dentro(c.registradoEn, p) && deAutor(c));
    const evs = (d.eventos.get(ep.id) ?? []).filter((e) => dentro(e.registradoEn, p) && deAutor(e));
    const aps = (d.apks?.get(ep.id) ?? []).filter((a) => dentro(a.registradoEn, p) && deAutor(a));
    if (cs.length === 0 && evs.length === 0) continue;
    const ktmAntigua = cs.filter((c) => c.terapiaFisica.estado === "REALIZADA");
    const ktmEv = evs.filter((e): e is Extract<EventoClinico, { tipo: "TERAPIA_FISICA" }> => e.tipo === "TERAPIA_FISICA");
    const hechas = ktmEv.filter((e) => e.realizada);
    const imtN = ktmAntigua.filter((c) => c.terapiaFisica.actividades.some((a) => a.startsWith("IMT"))).length + evs.filter((e) => e.tipo === "IMT").length;
    const ktmN = ktmAntigua.length + hechas.length;
    let ktmMotivo: string | null = null;
    if (ktmN === 0) {
      const no = ktmEv.filter((e) => !e.realizada).at(-1);
      const contra = cs.filter((c) => c.terapiaFisica.estado === "CONTRAINDICADA").at(-1);
      ktmMotivo = no ? (no.motivo || "Sin motivo") : contra ? (contra.terapiaFisica.motivoContraindicacion ?? "Contraindicada") : cs.length > 0 ? "Sin registro de KTM" : null;
      if (ktmMotivo) sinKtm.set(ktmMotivo, (sinKtm.get(ktmMotivo) ?? 0) + 1);
    }
    for (const e of evs) {
      if (e.tipo === "INICIO_PVE") pve += 1;
      if (e.tipo === "EDUCACION") educacion += 1;
      if (e.tipo === "PVE_NO_REALIZADA") sinPve.set(e.razon || "Sin razón", (sinPve.get(e.razon || "Sin razón") ?? 0) + 1);
      if (e.tipo === "EVALUACION_PVE" && !e.apto) {
        const falla = `Checklist: ${CRITERIOS_PVE.find((_, i) => !e.criterios[i]) ?? "no cumple"}`;
        sinPve.set(falla, (sinPve.get(falla) ?? 0) + 1);
      }
    }
    const imsTodos = [...ktmAntigua.map((c) => c.terapiaFisica.ims), ...hechas.map((e) => e.ims)].filter((x): x is number => x !== null);
    const ims = imsTodos.length ? Math.max(...imsTodos) : null;
    const niveles = hechas.map((e) => e.nivel ?? 0).filter((n) => n > 0);
    const bip = primeraBipedestacion(d.controles.get(ep.id) ?? [], d.eventos.get(ep.id) ?? []);
    const ultimo = cs[cs.length - 1];
    filas.push({
      episodioId: ep.id,
      cama: ep.cama,
      modo: ultimo ? ETIQUETA_MODALIDAD[ultimo.ventilacion.modalidad] ?? "" : "",
      ktr: cs.length,
      ktm: ktmN,
      imt: imtN,
      nivel: niveles.length ? Math.max(...niveles) : null,
      pto: bip !== null && dentro(bip, p),
      ims,
      ktmMotivo,
      apk: aps.some((a) => a.resultado === "CUMPLE") ? "CUMPLE" : aps.length > 0 ? "NO_CUMPLE" : null,
      eventos: evs.flatMap((e) => {
        const t = textoEvento(e, describir);
        return t ? [{ hora: e.hora, texto: t }] : [];
      }),
      autores: [...new Set([...cs, ...evs].map((x) => x.rutAutor))]
    });
  }
  const ordenar = (m: Map<string, number>) => [...m].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo));
  return {
    filas,
    totales: {
      pacientes: filas.length,
      ktr: filas.reduce((s, f) => s + f.ktr, 0),
      ktm: filas.reduce((s, f) => s + f.ktm, 0),
      imt: filas.reduce((s, f) => s + f.imt, 0),
      pve,
      eventos: filas.reduce((s, f) => s + f.eventos.length, 0),
      apkCumple: filas.filter((f) => f.apk === "CUMPLE").length,
      pto: filas.filter((f) => f.pto).length,
      educacion
    },
    motivosSinKtm: ordenar(sinKtm),
    motivosSinPve: ordenar(sinPve)
  };
}

// ---------------------------------------------------------------------------
// Indicadores (definiciones del RCE)
// ---------------------------------------------------------------------------

export const VENTANA_FRACASO_H = 48;
export const META_FRACASO_PCT = 15;
export const META_AUTOEXT_POR_100_VM: readonly [number, number] = [1, 2];
export const META_FUERA_PROTOCOLO_PCT = 25;

export interface Indicadores {
  readonly diasRango: number;
  readonly diasPaciente: number;
  readonly diasVm: number;
  readonly extubaciones: number;
  /** Fracaso oficial: reintubacion dentro de 24 h. */
  readonly fracaso: number;
  /** Reintubacion antes de 24 h (= fracaso oficial). */
  readonly fracasoPrecoz: number;
  /** Reintubacion entre 24 y 48 h (solo cuenta en el indicador interno a 48 h). */
  readonly fracasoTardio: number;
  readonly fracasoPct: number | null;
  /** Indicador interno: reintubacion dentro de 48 h. */
  readonly fracaso48: number;
  readonly fracaso48Pct: number | null;
  readonly autoextubaciones: number;
  /** De ellas, accidentales (las extubo el equipo). */
  readonly accidentales: number;
  readonly autoextPor100Vm: number | null;
  readonly fueraProtocolo: number;
  readonly fueraPct: number | null;
  readonly motivosFuera: readonly { readonly motivo: string; readonly total: number; readonly noche: number }[];
  readonly pve: number;
  readonly pvePor100PacDia: number | null;
  readonly ventilados: number;
  readonly vmProlongada: number;
  readonly vmProlongadaPct: number | null;
  readonly tqt: number;
  readonly medianaVmPreTqt: number | null;
  readonly reintubaciones: number;
  readonly desvinculaciones: number;
  readonly desvincPacientes: number;
  readonly desvincReconexiones: number;
  readonly desvincHoras: number;
  readonly desvincMedianaHoras: number | null;
  readonly turnosValvula: number;
  /** Minutos con valvula de fonacion: del control que la inicia al que cambia de modo. */
  readonly minutosValvula: number;
  readonly decanulaciones: number;
  readonly ktm: number;
  readonly imt: number;
  readonly educacion: number;
  /** Primeras bipedestaciones del episodio en el periodo (REM 28, PTO 1010922). */
  readonly pto: number;
  /** Ingresos del periodo de una persona que ya habia estado en la unidad (por la huella del RUT). */
  readonly reingresos: number;
  /** Ingresos del periodo con huella (con RUT): el denominador de los reingresos. */
  readonly ingresosConHuella: number;
  readonly destinos: readonly { readonly destino: string; readonly n: number }[];
  readonly atenciones: number;
  readonly atencionesPorPacDia: number | null;
  readonly ocupacionProm: number | null;
  readonly egresos: number;
  readonly fallecidos: number;
  readonly mortalidadPct: number | null;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (n: number, d: number): number | null => (d > 0 ? r1((100 * n) / d) : null);
function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : r1((s[m - 1]! + s[m]!) / 2);
}

export function calcularIndicadores(d: DatosEstadistica, p: Periodo, ahora: Date): Indicadores {
  const dias = new Set(diasDel(p));
  let diasPaciente = 0;
  let diasVm = 0;
  let extubaciones = 0;
  let precoz = 0;
  let tardio = 0;
  let autoext = 0;
  let accidentales = 0;
  let fuera = 0;
  const fueraPorMotivo = new Map<string, { total: number; noche: number }>();
  let pve = 0;
  let ventilados = 0;
  let prolongada = 0;
  let reintubaciones = 0;
  const preTqt: number[] = [];
  let desvinc = 0;
  let reconex = 0;
  const desvincPacs = new Set<string>();
  const durDesvinc: number[] = [];
  let decan = 0;
  const turnosValvula = new Set<string>();
  let minValvula = 0;
  let ktm = 0;
  let imt = 0;
  let educacion = 0;
  let pto = 0;
  let reingresos = 0;
  let conHuella = 0;
  const destinos = new Map<string, number>();
  let atenciones = 0;
  let egresos = 0;
  let fallecidos = 0;

  for (const ep of d.episodios) {
    const cs = d.controles.get(ep.id) ?? [];
    const evs = [...(d.eventos.get(ep.id) ?? [])].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
    const diasEp = diasDelEpisodio(ep, cs, ahora);
    const vmEp = diasVmDelEpisodio(cs);
    for (const dia of diasEp) if (dias.has(dia)) diasPaciente += 1;
    let vmEnRango = false;
    for (const dia of vmEp) if (dias.has(dia)) { diasVm += 1; vmEnRango = true; }
    if (vmEnRango) {
      ventilados += 1;
      if (vmEp.size > 7) prolongada += 1;
    }
    minValvula += minutosValvula(ep, cs, p, ahora);
    const bip = primeraBipedestacion(cs, evs);
    if (bip && dentro(bip, p)) pto += 1;
    const ingreso = ep.ingresadoEn ?? cs[0]?.registradoEn;
    if (ep.huellaPersona && ingreso && dentro(ingreso, p)) {
      conHuella += 1;
      const antes = d.episodios.some((o) => o.id !== ep.id && o.huellaPersona === ep.huellaPersona && (o.ingresadoEn ?? "") < ingreso);
      if (antes) reingresos += 1;
    }
    for (const c of cs) {
      if (!dentro(c.registradoEn, p)) continue;
      const tf = c.terapiaFisica.estado === "REALIZADA";
      atenciones += 1 + (tf ? 1 : 0);
      if (tf) ktm += 1;
      if (tf && c.terapiaFisica.actividades.some((a) => a.startsWith("IMT"))) imt += 1;
      if (c.ventilacion.modalidad === "VALVULA_FONACION") turnosValvula.add(`${ep.id}|${turnoDe(new Date(c.registradoEn)).clave}`);
    }
    evs.forEach((e, i) => {
      if (!dentro(e.registradoEn, p)) return;
      switch (e.tipo) {
        case "EXTUBACION_PROGRAMADA": {
          extubaciones += 1;
          if (e.sinPve !== undefined) {
            fuera += 1;
            const m = ETIQUETA_MOTIVO_SIN_PVE[e.sinPve] ?? "Sin motivo registrado";
            const motivo = m.charAt(0).toUpperCase() + m.slice(1);
            const x = fueraPorMotivo.get(motivo) ?? { total: 0, noche: 0 };
            x.total += 1;
            if (turnoDe(new Date(e.registradoEn)).tipo === "NOCHE") x.noche += 1;
            fueraPorMotivo.set(motivo, x);
          }
          // Fracaso: la primera reintubacion dentro de las 48 h siguientes.
          const t0 = Date.parse(e.registradoEn);
          const reint = evs.slice(i + 1).find((x) => x.tipo === "REINTUBACION");
          if (reint) {
            const h = (Date.parse(reint.registradoEn) - t0) / 3600_000;
            if (h >= 0 && h <= VENTANA_FRACASO_H) {
              if (h < 24) precoz += 1;
              else tardio += 1;
            }
          }
          break;
        }
        case "AUTOEXTUBACION":
          autoext += 1;
          if (e.accidental) accidentales += 1;
          break;
        case "TERAPIA_FISICA":
          if (e.realizada) { ktm += 1; atenciones += 1; }
          break;
        case "IMT":
          imt += 1;
          break;
        case "EDUCACION":
          educacion += 1;
          break;
        case "INICIO_PVE":
          pve += 1;
          break;
        case "REINTUBACION":
          if (esReintubacion(e, evs)) reintubaciones += 1;
          break;
        case "TRAQUEOSTOMIA": {
          const dia = diaLocal(new Date(e.registradoEn));
          preTqt.push([...vmEp].filter((x) => x <= dia).length);
          break;
        }
        case "DESVINCULACION": {
          desvinc += 1;
          desvincPacs.add(ep.id);
          const vuelta = evs.slice(i + 1).find((x) => x.tipo === "RECONEXION" || x.tipo === "DESVINCULACION");
          if (vuelta?.tipo === "RECONEXION") {
            reconex += 1;
            durDesvinc.push(r1((Date.parse(vuelta.registradoEn) - Date.parse(e.registradoEn)) / 3600_000));
          }
          break;
        }
        case "DECANULACION":
          decan += 1;
          break;
        default:
          break;
      }
    });
    if (ep.egreso && dentro(ep.egreso.en, p)) {
      egresos += 1;
      if (ep.egreso.motivo === "FALLECIMIENTO") fallecidos += 1;
      const dst = ep.egreso.destino ?? "Sin destino registrado";
      destinos.set(dst, (destinos.get(dst) ?? 0) + 1);
    }
  }
  const fracaso = precoz;
  const fracaso48 = precoz + tardio;
  return {
    diasRango: dias.size,
    diasPaciente,
    diasVm,
    extubaciones,
    fracaso,
    fracasoPrecoz: precoz,
    fracasoTardio: tardio,
    fracasoPct: pct(fracaso, extubaciones),
    fracaso48,
    fracaso48Pct: pct(fracaso48, extubaciones),
    autoextubaciones: autoext,
    accidentales,
    autoextPor100Vm: pct(autoext, diasVm),
    fueraProtocolo: fuera,
    fueraPct: pct(fuera, extubaciones),
    motivosFuera: [...fueraPorMotivo].map(([motivo, x]) => ({ motivo, ...x })).sort((a, b) => b.total - a.total),
    pve,
    pvePor100PacDia: diasPaciente > 0 ? Math.round((100 * 100 * pve) / diasPaciente) / 100 : null,
    ventilados,
    vmProlongada: prolongada,
    vmProlongadaPct: pct(prolongada, ventilados),
    tqt: preTqt.length,
    medianaVmPreTqt: mediana(preTqt),
    reintubaciones,
    desvinculaciones: desvinc,
    desvincPacientes: desvincPacs.size,
    desvincReconexiones: reconex,
    desvincHoras: r1(durDesvinc.reduce((s, x) => s + x, 0)),
    desvincMedianaHoras: mediana(durDesvinc),
    turnosValvula: turnosValvula.size,
    minutosValvula: minValvula,
    ktm,
    imt,
    educacion,
    pto,
    reingresos,
    ingresosConHuella: conHuella,
    destinos: [...destinos].map(([destino, n]) => ({ destino, n })).sort((a, b) => b.n - a.n || a.destino.localeCompare(b.destino)),
    decanulaciones: decan,
    atenciones,
    atencionesPorPacDia: diasPaciente > 0 ? Math.round((100 * atenciones) / diasPaciente) / 100 : null,
    ocupacionProm: dias.size > 0 ? r1(diasPaciente / dias.size) : null,
    egresos,
    fallecidos,
    mortalidadPct: pct(fallecidos, egresos)
  };
}

/** Un mes de la tendencia: el porcentaje de fracaso de extubacion. */
export interface MesTendencia {
  readonly mes: string;
  readonly etiqueta: string;
  readonly extubaciones: number;
  readonly fracaso: number;
  readonly fracasoPct: number | null;
}

/** Los ultimos `n` meses (incluido el de `ahora`), calculados con el registro de Kaptus. */
export function tendenciaMensual(d: DatosEstadistica, ahora: Date, n = 12): readonly MesTendencia[] {
  const out: MesTendencia[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const desde = new Date(ahora.getFullYear(), ahora.getMonth() - k, 1);
    const hasta = new Date(ahora.getFullYear(), ahora.getMonth() - k + 1, 1);
    const ind = calcularIndicadores(d, { desde, hasta, etiqueta: "" }, ahora);
    out.push({ mes: diaLocal(desde).slice(0, 7), etiqueta: MESES[desde.getMonth()]!.slice(0, 3), extubaciones: ind.extubaciones, fracaso: ind.fracaso, fracasoPct: ind.fracasoPct });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Archivados
// ---------------------------------------------------------------------------

export interface Archivado {
  readonly episodio: Episodio;
  readonly egresoEn: string;
  readonly motivo: MotivoEgreso;
  readonly diasEstadia: number;
  readonly diasVm: number;
  readonly hitos: string;
}

/** Los episodios egresados, del mas reciente al mas antiguo. */
export function archivados(d: DatosEstadistica): readonly Archivado[] {
  return d.episodios
    .filter((e): e is Episodio & { egreso: NonNullable<Episodio["egreso"]> } => !e.activo && e.egreso !== undefined)
    .map((ep) => {
      const cs = d.controles.get(ep.id) ?? [];
      const evs = d.eventos.get(ep.id) ?? [];
      const n = (t: EventoClinico["tipo"]): number => evs.filter((e) => e.tipo === t).length;
      const hitos = [
        n("INICIO_PVE") ? `PVE ×${n("INICIO_PVE")}` : "",
        n("EXTUBACION_PROGRAMADA") ? `extubación ×${n("EXTUBACION_PROGRAMADA")}` : "",
        evs.some((e) => e.tipo === "AUTOEXTUBACION" && !e.accidental) ? "autoextubación" : "",
        evs.some((e) => e.tipo === "AUTOEXTUBACION" && e.accidental) ? "extubación accidental" : "",
        primeraBipedestacion(cs, evs) ? "PTO" : "",
        n("REINTUBACION") ? `reintubación ×${n("REINTUBACION")}` : "",
        n("TRAQUEOSTOMIA") ? "TQT" : "",
        n("DESVINCULACION") ? `desvinc. ×${n("DESVINCULACION")}` : "",
        n("DECANULACION") ? "decanulación" : ""
      ].filter(Boolean).join(" · ");
      const inicio = ep.ingresadoEn ?? cs[0]?.registradoEn ?? ep.egreso.en;
      return {
        episodio: ep,
        egresoEn: ep.egreso.en,
        motivo: ep.egreso.motivo,
        diasEstadia: Math.max(0, Math.round((enLocal(diaLocal(new Date(ep.egreso.en))).getTime() - enLocal(diaLocal(new Date(inicio))).getTime()) / 86_400_000)),
        diasVm: diasVmDelEpisodio(cs).size,
        hitos: hitos || "—"
      };
    })
    .sort((a, b) => b.egresoEn.localeCompare(a.egresoEn));
}

/** Se puede deshacer un alta dentro de las 24 h siguientes y si nadie ocupa esa cama. */
export const HORAS_DESHACER_ALTA = 24;
export function puedeDeshacerAlta(ep: Episodio, activos: readonly Episodio[], ahora: Date): boolean {
  if (ep.activo || !ep.egreso) return false;
  if (ahora.getTime() - Date.parse(ep.egreso.en) > HORAS_DESHACER_ALTA * 3600_000) return false;
  return !activos.some((a) => a.activo && a.cama === ep.cama);
}
