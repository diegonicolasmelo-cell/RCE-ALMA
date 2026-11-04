/**
 * Variables fisiologicas derivadas.
 *
 * Todas son funciones puras sobre el control. Ningun derivado se almacena:
 * guardarlos seria garantizar que algun dia queden desincronizados del dato que
 * los origino. Ver docs/PLAN-MAESTRO.md cap. 4.5.
 */

import {
  CORTE_FUGA,
  CORTE_PROTECTOR_MAX,
  CORTE_ULTRAPROTECTOR,
  PCF_CORTE_EXITO,
  PCF_CORTE_OPTIMO
} from "./catalogos";
import { sedoanalgesiaActiva } from "./infusiones";
import { esModalidadControlada, presionParaDriving, validezMecanicaEstatica } from "./validez";
import type { OrigenPresion } from "./validez";
import type { Control, Glasgow, Medicion, Sexo, ViaAerea } from "./tipos";

export function esViaAereaArtificial(via: ViaAerea): boolean {
  return via === "TET" || via === "TQT";
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

// ---------------------------------------------------------------------------
// Peso ideal y proteccion pulmonar
// ---------------------------------------------------------------------------

/** Peso ideal (PI, formula de Devine). Base de la ventilacion protectora. */
export function calcularPbw(tallaCm: number, sexo: Sexo): number {
  const base = sexo === "F" ? 45.5 : 50;
  // Piso de seguridad: una talla mal tipeada no debe producir un ml/kg absurdo.
  return redondear(Math.max(base + 0.91 * (tallaCm - 152.4), 30), 1);
}

/** Volumen para un objetivo de ml/kg, redondeado a multiplos de 5 ml. */
export function volumenObjetivoMl(pbw: number, mlPorKgObjetivo: number): number {
  return Math.round((pbw * mlPorKgObjetivo) / 5) * 5;
}

/** ml por kg de peso ideal. `null` si falta el volumen. */
export function mlPorKg(vt: Medicion, pbw: number): number | null {
  return vt !== null && vt > 0 && pbw > 0 ? redondear(vt / pbw, 1) : null;
}

export type BandaProteccion = "ULTRAPROTECTOR" | "PROTECTOR" | "SOBRE_META";

/**
 * Menor a 6 ml/kg: ultraprotector. De 6 a 8: protector. Mayor a 8: sobre la
 * meta. Es una guia de titulacion, no una alarma.
 */
export function bandaProteccion(mlKg: number | null): BandaProteccion | null {
  if (mlKg === null) return null;
  if (mlKg < CORTE_ULTRAPROTECTOR) return "ULTRAPROTECTOR";
  if (mlKg <= CORTE_PROTECTOR_MAX) return "PROTECTOR";
  return "SOBRE_META";
}

// ---------------------------------------------------------------------------
// Hemodinamia
// ---------------------------------------------------------------------------

export function calcularPam(pas: Medicion, pad: Medicion): number | null {
  if (pas === null || pad === null || pas <= pad) return null;
  return Math.round(pad + (pas - pad) / 3);
}

/** Presion de perfusion cerebral. Requiere neuromonitoreo (PIC). */
export function calcularPpc(pam: number | null, pic: Medicion): number | null {
  if (pam === null || pic === null) return null;
  return Math.round(pam - pic);
}

// ---------------------------------------------------------------------------
// Glasgow condicionado por via aerea
// ---------------------------------------------------------------------------

export interface GlasgowCalculado {
  readonly intubado: boolean;
  readonly ocular: number;
  readonly verbal: number | "NT";
  readonly motora: number;
  readonly total: number;
  readonly maximo: string;
  readonly display: string;
  readonly completo: string;
}

/** Con via artificial el verbal no es testeable: NT, y el total sobre 11T. */
export function calcularGlasgow(glasgow: Glasgow, via: ViaAerea): GlasgowCalculado {
  const intubado = esViaAereaArtificial(via);
  const verbal = intubado ? 1 : glasgow.verbal;
  const total = glasgow.ocular + verbal + glasgow.motora;
  const desglose = intubado
    ? `O${glasgow.ocular} V:NT M${glasgow.motora}`
    : `O${glasgow.ocular} V${glasgow.verbal} M${glasgow.motora}`;
  return {
    intubado,
    ocular: glasgow.ocular,
    verbal: intubado ? "NT" : glasgow.verbal,
    motora: glasgow.motora,
    total,
    maximo: intubado ? "11T" : "15",
    display: intubado ? `${total}T` : `${total}`,
    completo: `${intubado ? `${total}T` : total}/${intubado ? "11T" : "15"} (${desglose})`
  };
}

// ---------------------------------------------------------------------------
// Resultantes ventilatorias
// ---------------------------------------------------------------------------

/** Volumen minuto (L/min) = Vt ESPIRADO por la frecuencia TOTAL del paciente. */
export function volumenMinuto(vtEspirado: Medicion, frTotal: Medicion): number | null {
  if (vtEspirado === null || frTotal === null || vtEspirado <= 0 || frTotal <= 0) return null;
  return redondear((vtEspirado * frTotal) / 1000, 1);
}

/** Relacion I:E resultante a partir del TI y la frecuencia total, p. ej. "1:2.5". */
export function relacionIE(ti: Medicion, frTotal: Medicion): string | null {
  if (ti === null || frTotal === null || ti <= 0 || frTotal <= 0) return null;
  const espiracion = 60 / frTotal - ti;
  return espiracion > 0 ? `1:${redondear(espiracion / ti, 1)}` : null;
}

/** Indice de Tobin (RSBI) = FR / Vt en litros. SOLO modalidades espontaneas. */
export function indiceTobin(frTotal: Medicion, vtEspirado: Medicion): number | null {
  if (frTotal === null || vtEspirado === null || frTotal <= 0 || vtEspirado <= 0) return null;
  return Math.round(frTotal / (vtEspirado / 1000));
}

/** Indice ROX = (SpO2/FiO2) / FR. Soporte no invasivo (CNAF). */
export function indiceRox(spo2: Medicion, fio2: Medicion, frTotal: Medicion): number | null {
  if (spo2 === null || fio2 === null || frTotal === null || fio2 <= 0 || frTotal <= 0) return null;
  return redondear(spo2 / (fio2 / 100) / frTotal, 2);
}

export type SemaforoPcf = "SIN_DATO" | "INSUFICIENTE" | "LIMITE" | "OPTIMO";

export function semaforoPcf(pcf: Medicion): SemaforoPcf {
  if (pcf === null) return "SIN_DATO";
  if (pcf < PCF_CORTE_EXITO) return "INSUFICIENTE";
  if (pcf < PCF_CORTE_OPTIMO) return "LIMITE";
  return "OPTIMO";
}

export interface DerivadosControl {
  readonly pbw: number;
  readonly pam: number | null;
  readonly ppc: number | null;
  readonly vtProgramadoPorKg: number | null;
  readonly vtEspiradoPorKg: number | null;
  /** ml/kg que guia la titulacion: el programado en ACVC; el espirado en el resto. */
  readonly mlKgGuia: number | null;
  readonly bandaGuia: BandaProteccion | null;
  /** Programado y espirado difieren mas de 10 %: posible fuga (solo ACVC). */
  readonly posibleFuga: boolean;
  /** Calculado por defecto (Vt espirado x FR total); si se edita, vale lo leido del ventilador. */
  readonly volumenMinuto: number | null;
  readonly volumenMinutoOrigen: "CALCULADO" | "EDITADO" | null;
  readonly relacionIE: string | null;
  /** Driving pressure. `null` si el candado de mecanica la invalida. */
  readonly drivingPressure: number | null;
  /** Con que presion se calculo: plateau, o pico en PCV si no se mide plateau. */
  readonly origenDriving: OrigenPresion | null;
  /** Compliance estatica. `null` si el candado de mecanica la invalida. */
  readonly compliance: number | null;
  /** Solo CPAP+PS. */
  readonly tobin: number | null;
  /** Solo CNAF. */
  readonly rox: number | null;
  readonly glasgow: GlasgowCalculado | null;
  /** El Glasgow se registra aunque haya sedacion, pero asi no es lo correcto: se avisa. */
  readonly glasgowBajoSedacion: boolean;
  readonly semaforoPcf: SemaforoPcf;
  readonly leyendaMecanica: string | null;
}

/**
 * Calcula todos los derivados de un control, respetando el candado de mecanica
 * y la modalidad. `pbw` se pasa como argumento porque depende del episodio.
 */
export function calcularDerivados(control: Control, pbw: number): DerivadosControl {
  const v = control.ventilacion;
  const controlada = esModalidadControlada(v.modalidad);
  const esVMI = v.modalidad !== "CNAF";
  const validez = validezMecanicaEstatica(v);

  const pam = calcularPam(control.pas, control.pad);

  let drivingPressure: number | null = null;
  let compliance: number | null = null;
  let origenDriving: OrigenPresion | null = null;
  const pd = presionParaDriving(v);
  if (validez.valido && pd !== null && v.peep !== null) {
    const dp = pd.valor - v.peep;
    if (dp > 0) {
      drivingPressure = redondear(dp, 1);
      origenDriving = pd.origen;
      if (v.vtEspirado !== null && v.vtEspirado > 0) compliance = redondear(v.vtEspirado / dp, 1);
    }
  }

  const vtProgramadoPorKg = mlPorKg(v.vtProgramado, pbw);
  const vtEspiradoPorKg = mlPorKg(v.vtEspirado, pbw);
  const mlKgGuia = v.modalidad === "ACVC" ? vtProgramadoPorKg : vtEspiradoPorKg;

  const posibleFuga =
    v.modalidad === "ACVC" &&
    v.vtProgramado !== null &&
    v.vtProgramado > 0 &&
    v.vtEspirado !== null &&
    Math.abs(v.vtEspirado - v.vtProgramado) / v.vtProgramado > CORTE_FUGA;

  const vmCalculado = esVMI ? volumenMinuto(v.vtEspirado, v.frTotal) : null;
  const vmEditado = esVMI && v.volMinuto !== null ? v.volMinuto : null;

  return {
    pbw,
    pam,
    ppc: calcularPpc(pam, control.neuro?.pic ?? null),
    vtProgramadoPorKg,
    vtEspiradoPorKg,
    mlKgGuia,
    bandaGuia: esVMI ? bandaProteccion(mlKgGuia) : null,
    posibleFuga,
    volumenMinuto: vmEditado ?? vmCalculado,
    volumenMinutoOrigen: vmEditado !== null ? "EDITADO" : vmCalculado !== null ? "CALCULADO" : null,
    relacionIE: controlada ? relacionIE(v.ti, v.frTotal) : null,
    drivingPressure,
    origenDriving,
    compliance,
    tobin: v.modalidad === "CPAP_PS" ? indiceTobin(v.frTotal, v.vtEspirado) : null,
    rox: v.modalidad === "CNAF" ? indiceRox(control.spo2, v.fio2, v.frTotal) : null,
    glasgow: control.glasgow ? calcularGlasgow(control.glasgow, control.viaAerea) : null,
    glasgowBajoSedacion: control.glasgow !== null && sedoanalgesiaActiva(control.infusiones),
    semaforoPcf: semaforoPcf(control.esfuerzo?.pcf ?? null),
    leyendaMecanica: validez.motivo === "ASINCRONIA_EN_MODO_CONTROLADO" ? validez.leyenda : null
  };
}

/** Opciones que ofrece la franja del teclado para el Vt programado: 6, 7 y 8 ml/kg. */
export function opcionesVolumenObjetivo(
  pbw: number,
  objetivos: readonly number[]
): readonly { readonly mlKg: number; readonly ml: number }[] {
  return objetivos.map((mlKg) => ({ mlKg, ml: volumenObjetivoMl(pbw, mlKg) }));
}
