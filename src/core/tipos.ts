/**
 * Entidades del dominio clinico UPC-Pulse.
 *
 * Cuatro entidades separadas (docs/PLAN-MAESTRO.md cap. 4):
 *   Episodio       estado que persiste entre controles (incluida la via aerea)
 *   Control        observacion inmutable en un instante
 *   EventoClinico  lo que rompe la rutina; es lo unico que muta la via aerea
 *   ValidacionApk  pauta de seguridad firmada una vez por turno
 */

/** Valor fisiologico medido. `null` = no medido (nunca 0 por defecto). */
export type Medicion = number | null;
/** Identificador opaco generado en el cliente. Permite sincronia idempotente. */
export type Uuid = string;
/** Hora local en formato HH:mm. */
export type HoraHHMM = string;

// ---------------------------------------------------------------------------
// Via aerea
// ---------------------------------------------------------------------------

export type ViaAerea = "TET" | "TQT" | "NATURAL";
export type Sexo = "M" | "F";
export type OrigenTalla = "MEDIDA" | "ESTIMADA";

// ---------------------------------------------------------------------------
// Ventilacion: lo programado y lo que realmente hace el paciente
// ---------------------------------------------------------------------------

/** Nomenclatura de la unidad. Nuevas modalidades (VMNI B60, etc.) se agregan aqui. */
export const MODALIDADES = ["ACVC", "PCV", "CPAP_PS", "CNAF"] as const;
export type Modalidad = (typeof MODALIDADES)[number];

/** Modalidades controladas: en ellas la asincronia contamina el plateau. */
export const MODALIDADES_CONTROLADAS: readonly Modalidad[] = ["ACVC", "PCV"];

export type CampoVent =
  | "frProgramada"
  | "vtProgramado"
  | "flujo"
  | "ti"
  | "presion"
  | "peep"
  | "fio2"
  | "frTotal"
  | "vtEspirado"
  | "pPico"
  | "pPlateau"
  | "pMedia";

export const CAMPOS_VENT: readonly CampoVent[] = [
  "frProgramada",
  "vtProgramado",
  "flujo",
  "ti",
  "presion",
  "peep",
  "fio2",
  "frTotal",
  "vtEspirado",
  "pPico",
  "pPlateau",
  "pMedia"
];

/**
 * Parametros ventilatorios de un control. `presion` es la presion de control
 * (PCV) o de soporte (CPAP+PS). Los campos que no aplican a la modalidad quedan
 * en null (ver catalogos.CAMPOS_POR_MODALIDAD).
 */
export type Ventilacion = Readonly<Record<CampoVent, Medicion>> & {
  readonly modalidad: Modalidad;
  /** Asincronia paciente-ventilador. En modalidad controlada invalida plateau. */
  readonly asincronico: boolean;
};

/** Mecanica del esfuerzo respiratorio y destete (panel opcional). */
export interface EsfuerzoRespiratorio {
  readonly p01: Medicion;
  readonly nif: Medicion;
  readonly pOcc: Medicion;
  readonly pMus: Medicion;
  readonly pmi: Medicion;
  readonly pim: Medicion;
  /** Flujo pico de tos (L/min). Corte institucional 55-60 para extubacion. */
  readonly pcf: Medicion;
}

// ---------------------------------------------------------------------------
// Infusiones: sedoanalgesia y fármacos cardiovasculares, mismo modelo
// ---------------------------------------------------------------------------

export type IdSedante = "fentanilo" | "propofol" | "midazolam" | "dexmedetomidina" | "lorazepam";
export type IdCardiovascular =
  | "noradrenalina"
  | "adrenalina"
  | "vasopresina"
  | "dobutamina"
  | "milrinona";
export type IdInfusion = IdSedante | IdCardiovascular;

/** Una infusion en curso. Si un farmaco no esta en el mapa, esta suspendido. */
export interface InfusionEnCurso {
  readonly dosis: number;
  /** Escalon de titulacion 1-6, o null si se uso dosis libre. */
  readonly escalon: number | null;
}
export type Infusiones = Readonly<Partial<Record<IdInfusion, InfusionEnCurso>>>;

export type NivelRiesgoDva = "SIN_DVA" | "BAJA" | "MEDIA" | "ALTA";

// ---------------------------------------------------------------------------
// Conciencia
// ---------------------------------------------------------------------------

/** Escala SAS 1-7. Se pide cuando hay sedoanalgesia en curso. */
export type ValorSas = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Estado de vigilia: alternativa al SAS cuando NO hay sedoanalgesia. */
export type EstadoVigilia = "VIGIL_ALERTA" | "SOMNOLIENTO" | "ESTUPOROSO" | "COMA";

export interface Glasgow {
  readonly ocular: 1 | 2 | 3 | 4;
  readonly verbal: 1 | 2 | 3 | 4 | 5;
  readonly motora: 1 | 2 | 3 | 4 | 5 | 6;
}

// ---------------------------------------------------------------------------
// Kinesiterapia
// ---------------------------------------------------------------------------

export type Aspiracion = "NO" | "TRACHCARE" | "SET";
export type AspectoSecreciones = "MUCOSA" | "MUCOPURULENTA" | "PURULENTA" | "HEMATICA";
export type ReologiaSecreciones = "FLUIDA" | "ESPESA" | "ADHERENTE";
export type CantidadSecreciones = "ESCASA" | "MODERADA" | "ABUNDANTE";

export interface KineRespiratoria {
  readonly realizada: boolean;
  readonly aspiracion: Aspiracion;
  readonly aspecto: AspectoSecreciones | null;
  readonly reologia: ReologiaSecreciones | null;
  readonly cantidad: CantidadSecreciones | null;
}

export type EstadoTerapiaFisica = "REALIZADA" | "NO" | "CONTRAINDICADA";

/** Terapia fisica: engloba kinesiterapia motora (KTM) e IMT. */
export interface TerapiaFisica {
  readonly estado: EstadoTerapiaFisica;
  readonly actividades: readonly string[];
  /** ICU Mobility Scale 0-10. */
  readonly ims: Medicion;
  readonly motivoContraindicacion: string | null;
}

// ---------------------------------------------------------------------------
// Episodio
// ---------------------------------------------------------------------------

/**
 * Datos del paciente que viajan por el canal clinico (des-identificados).
 * La identidad vive en IdentidadPaciente, por un canal y un token distintos.
 */
export interface Episodio {
  readonly id: Uuid;
  readonly cama: string;
  readonly edad: number;
  readonly sexo: Sexo;
  /** Talla para el peso ideal. Se ingresa al ingreso del paciente. */
  readonly tallaCm: number;
  readonly tallaOrigen: OrigenTalla;
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

/** Identidad del paciente: canal propio, token de estacion, purga al alta. */
export interface IdentidadPaciente {
  readonly episodioId: Uuid;
  readonly nombre: string;
  readonly rut: string | null;
  readonly ficha: string | null;
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/**
 * Observacion inmutable en un instante. Append-only: nunca se edita ni se borra.
 * Una correccion es un control nuevo que referencia al anterior en `corrige`.
 */
export interface Control {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly numero: number;
  readonly hora: HoraHHMM;
  /** ISO 8601. Orden canonico para tendencias y sincronia. */
  readonly registradoEn: string;
  readonly rutAutor: string;
  readonly esControlApoyo: boolean;
  readonly corrige: Uuid | null;

  readonly fc: Medicion;
  readonly pas: Medicion;
  readonly pad: Medicion;
  readonly spo2: Medicion;
  /** Neuromonitoreo: por definir. */
  readonly pic: Medicion;

  /** Via aerea observada. Se copia del episodio y no es editable en rutina. */
  readonly viaAerea: ViaAerea;
  readonly ventilacion: Ventilacion;
  readonly esfuerzo: EsfuerzoRespiratorio | null;

  readonly infusiones: Infusiones;
  readonly sas: ValorSas | null;
  readonly vigilia: EstadoVigilia | null;
  /** Glasgow: ubicacion en el formulario por definir. */
  readonly glasgow: Glasgow | null;

  readonly kineResp: KineRespiratoria;
  readonly terapiaFisica: TerapiaFisica;
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

export type DispositivoPosterior = "CNAF" | "VMNI" | "O2_CONVENCIONAL" | "AIRE_AMBIENTE";
export type MotivoAjusteTubo = "DESPLAZAMIENTO_SUPERFICIAL" | "CONTROL_RADIOLOGICO";

export type EventoClinico =
  | (EventoBase & { readonly tipo: "INICIO_PVE"; readonly duracionMin: number })
  | (EventoBase & { readonly tipo: "FIN_PVE"; readonly exitosa: boolean })
  | (EventoBase & { readonly tipo: "EXTUBACION_PROGRAMADA"; readonly dispositivo: DispositivoPosterior })
  | (EventoBase & { readonly tipo: "AUTOEXTUBACION"; readonly dispositivo: DispositivoPosterior })
  | (EventoBase & { readonly tipo: "REINTUBACION"; readonly via: "TET" | "TQT"; readonly calibre: string; readonly fijacionCm: string })
  | (EventoBase & { readonly tipo: "TRAQUEOSTOMIA"; readonly calibre: string })
  /** Cambio de centimetros a la comisura. NO cuenta como intubacion. */
  | (EventoBase & { readonly tipo: "AJUSTE_TUBO"; readonly fijacionCm: string; readonly motivo: MotivoAjusteTubo })
  | (EventoBase & { readonly tipo: "INICIO_PRONO" })
  | (EventoBase & { readonly tipo: "SUPINACION" })
  | (EventoBase & { readonly tipo: "INICIO_BNM"; readonly farmaco: string })
  | (EventoBase & { readonly tipo: "FIN_BNM" })
  | (EventoBase & { readonly tipo: "PCR"; readonly duracionReanimacionMin: number })
  | (EventoBase & { readonly tipo: "EVENTO_CENTINELA"; readonly descripcion: string })
  | (EventoBase & { readonly tipo: "ASISTENCIA_FBC" })
  | (EventoBase & { readonly tipo: "ASISTENCIA_PROCEDIMIENTO"; readonly procedimiento: string })
  | (EventoBase & { readonly tipo: "TOMA_CULTIVO"; readonly muestra: string })
  | (EventoBase & { readonly tipo: "TRASLADO_IMAGEN"; readonly destino: string })
  | (EventoBase & { readonly tipo: "CAMBIO_HMEF" });

export type TipoEvento = EventoClinico["tipo"];

/** Eventos que disparan la gestion de riesgo (cap. 7 del plan). */
export const EVENTOS_DE_RIESGO: readonly TipoEvento[] = ["AUTOEXTUBACION", "EVENTO_CENTINELA", "PCR"];

// ---------------------------------------------------------------------------
// APK — Autorizacion de Procedimiento Kinesico
// ---------------------------------------------------------------------------

/** Clave de turno, p. ej. "2026-11-04:DIA". Ver turnos.ts. */
export type TurnoClave = string;

/**
 * Validacion de la pauta APK: una por turno (dos al dia, por profesionales
 * distintos). Lo firmado vale para los controles siguientes del mismo turno.
 *
 * El toque unico registra UNA asercion global atestiguada, no N criterios
 * marcados (docs/PLAN-MAESTRO.md cap. 6). Si un criterio falla, se nombra.
 */
export interface ValidacionApk {
  readonly id: Uuid;
  readonly episodioId: Uuid;
  readonly turno: TurnoClave;
  readonly hora: HoraHHMM;
  readonly registradoEn: string;
  readonly rutAutor: string;
  readonly versionPauta: string;
  readonly perfil: "VIA_AEREA_ARTIFICIAL" | "VIA_AEREA_NATURAL";
  readonly resultado: "CUMPLE" | "NO_CUMPLE";
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
