/**
 * Entidades del dominio clinico UPC-Pulse.
 *
 * Separacion deliberada en cuatro entidades (ver docs/PLAN-MAESTRO.md cap. 4):
 *   Episodio       estado que persiste entre controles (incluida la via aerea)
 *   Control        observacion inmutable en un instante
 *   EventoClinico  lo que rompe la rutina y es lo unico que muta la via aerea
 *   ValidacionApk  pauta de seguridad firmada
 *
 * El prototipo original mezclaba las cuatro dentro de "atencion", y por eso no
 * podia expresar ni "via aerea fija por episodio" ni "horas acumuladas de prono".
 */

/** Valor fisiologico medido. `null` = no medido / no registrado (nunca 0 por defecto). */
export type Medicion = number | null;

/** Identificador opaco generado en el cliente (UUID v4). Permite sincronia idempotente. */
export type Uuid = string;

/** Hora local del turno en formato HH:mm. */
export type HoraHHMM = string;

// ---------------------------------------------------------------------------
// Via aerea y soporte ventilatorio
// ---------------------------------------------------------------------------

export type ViaAerea = "TET" | "TQT" | "NATURAL";

export type TipoVentilacion =
  | "VMI"
  | "VMNI"
  | "CNAF"
  | "O2_CONVENCIONAL"
  | "AIRE_AMBIENTAL";

export type ModoVMI = "VCV" | "PCV" | "PSV" | "SIMV" | "APRV";

/** Modos controlados: en ellos un plateau con esfuerzo activo es un dato falso. */
export const MODOS_CONTROLADOS: readonly ModoVMI[] = ["VCV", "PCV"];

export type Sexo = "M" | "F";

// ---------------------------------------------------------------------------
// Conciencia y sedacion
// ---------------------------------------------------------------------------

/** Escala SAS (Riker), 1 a 7. Exigida solo cuando hay sedoanalgesia activa. */
export type ValorSas = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Estado de vigilia: alternativa al SAS cuando el paciente NO esta sedado. */
export type EstadoVigilia =
  | "VIGIL_ALERTA"
  | "SOMNOLIENTO"
  | "ESTUPOROSO"
  | "COMA";

export type IdSedante = "fentanilo" | "propofol" | "midazolam" | "precedex" | "lorazepam";

/** Infusion de sedante: por escalon (1-6) o dosis libre. */
export interface InfusionSedante {
  readonly escalon: number | null;
  /** Dosis efectiva en la unidad del farmaco. Fuente de verdad del registro. */
  readonly dosis: Medicion;
}

export type Sedacion = Partial<Record<IdSedante, InfusionSedante>>;

export interface Glasgow {
  readonly ocular: 1 | 2 | 3 | 4;
  readonly verbal: 1 | 2 | 3 | 4 | 5;
  readonly motora: 1 | 2 | 3 | 4 | 5 | 6;
}

// ---------------------------------------------------------------------------
// Drogas vasoactivas
// ---------------------------------------------------------------------------

export interface Dva {
  readonly noradrenalina: Medicion;
  readonly adrenalina: Medicion;
  /** UI/min (no se pondera por peso). */
  readonly vasopresina: Medicion;
}

export type NivelRiesgoDva = "SIN_DVA" | "BAJA" | "MEDIA" | "ALTA";

// ---------------------------------------------------------------------------
// Episodio
// ---------------------------------------------------------------------------

/**
 * Datos del paciente que SI pueden salir a la nube (des-identificados).
 * La identidad (nombre, RUT, ficha) vive aparte, solo en el PC de la estacion.
 * Ver docs/PLAN-MAESTRO.md cap. 3 y src/core/sanitizar.ts.
 */
export interface Episodio {
  readonly id: Uuid;
  readonly cama: string;
  readonly edad: number;
  readonly sexo: Sexo;
  readonly tallaCm: number;
  readonly diagnostico: string;
  /** Via aerea vigente. Solo un EventoClinico la muta; un Control la observa. */
  readonly viaAereaActual: ViaAerea;
  readonly calibreVia: string | null;
  readonly fijacionCm: string | null;
  readonly diasVM: number;
  readonly rutTitular: string;
  readonly transcritoAlma: boolean;
  readonly horaTranscripcion: HoraHHMM | null;
  readonly pendienteEntrega: string;
  readonly activo: boolean;
}

/**
 * Identidad del paciente. Viaja por un canal propio (hoja "identidad", token de
 * estacion) y NUNCA por el canal clinico que usa el celular. Se purga al alta.
 * Ver src/core/sanitizar.ts y docs/PLAN-MAESTRO.md cap. 3.
 */
export interface IdentidadPaciente {
  readonly episodioId: Uuid;
  readonly nombre: string;
  readonly rut: string | null;
  readonly ficha: string | null;
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

export type CantidadSecreciones = "AUSENTES" | "ESCASAS" | "MODERADAS" | "ABUNDANTES";
export type TipoSecreciones = "MUCOSAS" | "MUCOPURULENTAS" | "PURULENTAS" | "HEMATICAS";
export type TipoAspiracion = "CIRCUITO_CERRADO" | "SONDA_ABIERTA" | "NO_REQUIERE";

/** Mecanica y esfuerzo respiratorio. Panel condicional en PSV / destete. */
export interface EsfuerzoRespiratorio {
  readonly p01: Medicion;
  readonly nif: Medicion;
  readonly pOcc: Medicion;
  readonly pMus: Medicion;
  readonly pmi: Medicion;
  readonly pim: Medicion;
  /** Flujo pico de tos (L/min). Corte institucional 55-60 para exito de extubacion. */
  readonly pcf: Medicion;
}

export interface SoporteVentilatorio {
  readonly tipo: TipoVentilacion;
  readonly modoVMI: ModoVMI | null;
  readonly fio2: Medicion;
  readonly peep: Medicion;
  readonly vt: Medicion;
  readonly fr: Medicion;
  readonly presionSoporte: Medicion;
  readonly pPico: Medicion;
  readonly pPlateau: Medicion;
  readonly flujo: Medicion;
  readonly presionCuff: Medicion;
  /**
   * Asincronia paciente-ventilador observada.
   * En modo controlado invalida plateau, driving pressure y compliance.
   */
  readonly asincronico: boolean;
}

export interface IntervencionKinesica {
  readonly respiratoriaRealizada: boolean;
  readonly aspiracion: TipoAspiracion;
  readonly motoraContraindicada: boolean;
  readonly motivoContraindicacion: string | null;
  readonly actividadesMotoras: readonly string[];
  /** ICU Mobility Scale, 0 a 10. */
  readonly ims: number | null;
}

/**
 * Observacion inmutable en un instante. Append-only: nunca se edita ni se borra.
 * Una correccion es un control nuevo que referencia al anterior en `corrige`.
 */
export interface Control {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly numero: number;
  readonly hora: HoraHHMM;
  /** ISO 8601 con zona. Orden canonico para tendencias y sincronia. */
  readonly registradoEn: string;
  readonly rutAutor: string;
  readonly esControlApoyo: boolean;
  readonly corrige: Uuid | null;

  readonly fc: Medicion;
  readonly pas: Medicion;
  readonly pad: Medicion;
  readonly spo2: Medicion;
  readonly pic: Medicion;

  readonly dva: Dva;

  /** Via aerea observada. Se copia del episodio y no es editable en rutina. */
  readonly viaAerea: ViaAerea;
  readonly soporte: SoporteVentilatorio;
  readonly esfuerzo: EsfuerzoRespiratorio | null;

  readonly glasgow: Glasgow;
  readonly sedacionActiva: boolean;
  /** Exigido si `sedacionActiva`. */
  readonly sas: ValorSas | null;
  /** Exigido si NO `sedacionActiva`. */
  readonly vigilia: EstadoVigilia | null;
  readonly sedacion: Sedacion;
  readonly bnmActivo: boolean;

  readonly secrecionesCantidad: CantidadSecreciones | null;
  readonly secrecionesTipo: TipoSecreciones | null;

  readonly intervencion: IntervencionKinesica;
  readonly observaciones: string;
}

// ---------------------------------------------------------------------------
// Eventos clinicos (union discriminada)
// ---------------------------------------------------------------------------

export interface EventoBase {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly hora: HoraHHMM;
  readonly registradoEn: string;
  readonly rutAutor: string;
  readonly comentario: string;
}

export type MotivoAjusteTubo = "DESPLAZAMIENTO_SUPERFICIAL" | "CONTROL_RADIOLOGICO";

export type EventoClinico =
  | (EventoBase & { readonly tipo: "INICIO_PVE"; readonly duracionMin: number })
  | (EventoBase & { readonly tipo: "FIN_PVE"; readonly exitosa: boolean })
  | (EventoBase & { readonly tipo: "EXTUBACION_PROGRAMADA"; readonly dispositivoSalida: TipoVentilacion })
  | (EventoBase & { readonly tipo: "AUTOEXTUBACION"; readonly dispositivoSalida: TipoVentilacion })
  | (EventoBase & { readonly tipo: "REINTUBACION"; readonly via: "TET" | "TQT"; readonly calibre: string; readonly fijacionCm: string })
  | (EventoBase & { readonly tipo: "TRAQUEOSTOMIA"; readonly calibre: string })
  /** Ajuste de centimetros a la comisura. NO cuenta como intubacion en estadistica. */
  | (EventoBase & { readonly tipo: "AJUSTE_TUBO"; readonly fijacionCm: string; readonly motivo: MotivoAjusteTubo })
  | (EventoBase & { readonly tipo: "INICIO_PRONO" })
  | (EventoBase & { readonly tipo: "SUPINACION" })
  | (EventoBase & { readonly tipo: "INICIO_BNM"; readonly farmaco: string })
  | (EventoBase & { readonly tipo: "FIN_BNM" })
  | (EventoBase & { readonly tipo: "PCR"; readonly duracionReanimacionMin: number })
  | (EventoBase & { readonly tipo: "EVENTO_CENTINELA"; readonly descripcion: string })
  | (EventoBase & { readonly tipo: "ASISTENCIA_PROCEDIMIENTO"; readonly procedimiento: string })
  | (EventoBase & { readonly tipo: "TOMA_CULTIVO"; readonly muestra: string })
  | (EventoBase & { readonly tipo: "TRASLADO_IMAGEN"; readonly destino: string });

export type TipoEvento = EventoClinico["tipo"];

/** Eventos que disparan el flujo de gestion de riesgo (cap. 7 del plan). */
export const EVENTOS_DE_RIESGO: readonly TipoEvento[] = [
  "AUTOEXTUBACION",
  "EVENTO_CENTINELA",
  "PCR"
];

// ---------------------------------------------------------------------------
// APK — Autorizacion de Procedimiento Kinesico
// ---------------------------------------------------------------------------

/**
 * Validacion de la pauta de seguridad APK.
 *
 * Decision de diseno (ver docs/PLAN-MAESTRO.md cap. 6): un toque unico NO marca
 * N criterios individuales como verificados, porque eso haria que el registro
 * afirme revisiones que quiza nadie hizo, con una firma nominal detras. Registra
 * UNA asercion atestiguada global. Si un criterio falla, se nombra ese criterio
 * y la APK queda como NO_CUMPLE.
 */
export interface ValidacionApk {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly controlId: Uuid | null;
  readonly hora: HoraHHMM;
  readonly registradoEn: string;
  readonly rutAutor: string;
  /** Version de la pauta firmada: un cambio futuro no reescribe lo ya firmado. */
  readonly versionPauta: string;
  /** Perfil aplicado segun via aerea al momento de firmar. */
  readonly perfil: "VIA_AEREA_ARTIFICIAL" | "VIA_AEREA_NATURAL";
  readonly resultado: "CUMPLE" | "NO_CUMPLE";
  /** Criterios que impidieron el cumplimiento. Vacio si CUMPLE. */
  readonly criteriosNoCumplidos: readonly string[];
  readonly observacion: string;
}

// ---------------------------------------------------------------------------
// Dotacion
// ---------------------------------------------------------------------------

export type IdTurno = "T1" | "T2" | "T3" | "T4" | "SUBROGANCIA" | "REEMPLAZO";

export interface Profesional {
  readonly rut: string;
  readonly nombre: string;
  readonly turno: IdTurno;
  readonly rol: "KINE_CLINICO" | "COORDINACION";
}
