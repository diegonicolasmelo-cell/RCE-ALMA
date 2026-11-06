/** Catalogos clinicos y protocolos UPC. Datos, sin logica. */

import type {
  CampoVent,
  EstadoVigilia,
  IdInfusion,
  Modalidad,
  TipoEquipo,
  ValorSas
} from "./tipos";

export interface OpcionEscala<T> {
  readonly val: T;
  readonly label: string;
  readonly desc?: string;
}

export const ESCALA_SAS: readonly OpcionEscala<ValorSas>[] = [
  { val: 1, label: "No despertable", desc: "Sin respuesta a estímulos" },
  { val: 2, label: "Muy sedado", desc: "Despierta al estímulo físico, no sigue órdenes" },
  { val: 3, label: "Sedado", desc: "Despierta al llamado suave, obedece órdenes" },
  { val: 4, label: "Calmado y cooperador", desc: "Despierto, tranquilo y coopera (meta)" },
  { val: 5, label: "Agitado", desc: "Inquieto, se calma con la voz" },
  { val: 6, label: "Muy agitado", desc: "Muerde TET, requiere contención" },
  { val: 7, label: "Agitación peligrosa", desc: "Tracciona TET o catéteres" }
];

export const ESTADOS_VIGILIA: readonly OpcionEscala<EstadoVigilia>[] = [
  { val: "VIGIL_ALERTA", label: "Vigil / Alerta" },
  { val: "SOMNOLIENTO", label: "Somnoliento / Sopor superficial" },
  { val: "ESTUPOROSO", label: "Estuporoso / Sopor profundo" },
  { val: "COMA", label: "Coma" }
];

/** ICU Mobility Scale (0-10). */
export const ESCALA_IMS: readonly OpcionEscala<number>[] = [
  { val: 0, label: "Pasivo en cama" },
  { val: 1, label: "Giros / activo en cama" },
  { val: 2, label: "Transferencia pasiva a sillón" },
  { val: 3, label: "Sedestación borde de cama (SBC)" },
  { val: 4, label: "Bipedestación con asistencia" },
  { val: 5, label: "Transferencia cama-silla dando pasos" },
  { val: 6, label: "Marcha en el lugar" },
  { val: 7, label: "Marcha ≥ 5 m con 2+ personas" },
  { val: 8, label: "Marcha ≥ 5 m con 1 persona" },
  { val: 9, label: "Marcha independiente con ayuda técnica" },
  { val: 10, label: "Marcha independiente" }
];

// ---------------------------------------------------------------------------
// Modalidades ventilatorias: que se registra en cada una
// ---------------------------------------------------------------------------

export const ETIQUETA_MODALIDAD: Readonly<Record<Modalidad, string>> = {
  ACVC: "ACVC",
  PCV: "PCV",
  CPAP_PS: "CPAP+PS",
  CNAF: "CNAF"
};

export interface CampoVentDef {
  readonly campo: CampoVent;
  readonly etiqueta: string;
  readonly unidad: string;
  /** PROGRAMADO: ajuste del ventilador. OBSERVADO: lo que hace el paciente. */
  readonly grupo: "PROGRAMADO" | "OBSERVADO";
}

const p = (campo: CampoVent, etiqueta: string, unidad: string): CampoVentDef => ({
  campo,
  etiqueta,
  unidad,
  grupo: "PROGRAMADO"
});
const o = (campo: CampoVent, etiqueta: string, unidad: string): CampoVentDef => ({
  campo,
  etiqueta,
  unidad,
  grupo: "OBSERVADO"
});

/**
 * Una cosa es lo programado y otra lo que el paciente realmente hace.
 * El orden es el del formulario (y el de "Sig." en el celular).
 *
 * POR CONFIRMAR con la lectura clinica: TI y flujo en ACVC; TI en PCV.
 */
export const CAMPOS_POR_MODALIDAD: Readonly<Record<Modalidad, readonly CampoVentDef[]>> = {
  ACVC: [
    p("frProgramada", "FR programada", "rpm"),
    p("vtProgramado", "Vt programado", "ml"),
    p("flujo", "Flujo", "L/min"),
    p("ti", "TI", "s"),
    p("peep", "PEEP", "cmH₂O"),
    p("fio2", "FiO₂", "%"),
    o("frTotal", "FR total", "rpm"),
    o("vtEspirado", "Vt espirado", "ml"),
    o("volMinuto", "Vol. minuto espirado", "L/min"),
    o("pPico", "P. pico", "cmH₂O"),
    o("pPlateau", "P. plateau (meseta)", "cmH₂O"),
    o("pMedia", "P. media", "cmH₂O"),
    o("autoPeep", "Auto PEEP", "cmH₂O")
  ],
  PCV: [
    p("frProgramada", "FR programada", "rpm"),
    p("presion", "P. control", "cmH₂O"),
    p("ti", "TI", "s"),
    p("peep", "PEEP", "cmH₂O"),
    p("fio2", "FiO₂", "%"),
    o("frTotal", "FR total", "rpm"),
    o("vtEspirado", "Vt espirado", "ml"),
    o("volMinuto", "Vol. minuto espirado", "L/min"),
    o("pPico", "P. pico", "cmH₂O"),
    o("pPlateau", "P. plateau (meseta)", "cmH₂O"),
    o("pMedia", "P. media", "cmH₂O"),
    o("autoPeep", "Auto PEEP", "cmH₂O")
  ],
  // En espontaneas importa la presion pico, no la media.
  CPAP_PS: [
    p("presion", "P. soporte", "cmH₂O"),
    p("peep", "PEEP", "cmH₂O"),
    p("fio2", "FiO₂", "%"),
    o("frTotal", "FR total", "rpm"),
    o("vtEspirado", "Vt espirado", "ml"),
    o("volMinuto", "Vol. minuto espirado", "L/min"),
    o("pPico", "P. pico", "cmH₂O")
  ],
  CNAF: [p("flujo", "Flujo", "L/min"), p("temperatura", "Temperatura", "°C"), p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm")]
};

/** Valores rapidos para la franja del teclado. Por confirmar con la unidad. */
export const VALORES_RAPIDOS: Readonly<Partial<Record<CampoVent, readonly number[]>>> = {
  peep: [5, 6, 8, 10, 12, 14],
  fio2: [30, 35, 40, 50, 60, 100],
  presion: [5, 6, 7, 8, 10, 12],
  flujo: [20, 30, 40, 50, 60]
};

// ---------------------------------------------------------------------------
// Proteccion pulmonar
// ---------------------------------------------------------------------------

/** Objetivos de volumen corriente en ml/kg de peso ideal que ofrece la franja. */
export const OBJETIVOS_VT_ML_KG: readonly number[] = [6, 7, 8];
/** Menor a 6: ultraprotector. De 6 a 8: protector. Mayor a 8: sobre la meta. */
export const CORTE_ULTRAPROTECTOR = 6;
export const CORTE_PROTECTOR_MAX = 8;
/** Diferencia programado/espirado sobre la cual se sospecha fuga en el circuito. */
export const CORTE_FUGA = 0.1;

// ---------------------------------------------------------------------------
// Infusiones: sedoanalgesia y cardiovasculares
// ---------------------------------------------------------------------------

export type GrupoInfusion = "SEDANTE" | "DVA" | "INOTROPO" | "ANTIARRITMICO" | "BNM";

export interface DefinicionInfusion {
  readonly id: IdInfusion;
  readonly nombre: string;
  readonly unidad: string;
  readonly grupo: GrupoInfusion;
  /**
   * Extremos del protocolo por escalones (1 y 6). `null` = sin escalones
   * definidos: solo dosis libre.
   */
  readonly escalones: { readonly primero: number; readonly sexto: number; readonly decimales: number } | null;
  /** Semaforo de riesgo hemodinamico (noradrenalina y adrenalina). */
  readonly semaforo: boolean;
  /** false = la unidad aun no esta confirmada por la unidad clinica. */
  readonly unidadConfirmada: boolean;
  readonly rapidos: readonly number[];
  /** Cuanto sube o baja cada toque de ▲ / ▼ en la dosis libre. */
  readonly paso?: number;
}

/**
 * Los escalones 2 a 5 se INTERPOLAN linealmente entre los extremos 1 y 6, que
 * son los unicos que da el protocolo. Falta la tabla real; hasta entonces las
 * dosis intermedias son aproximadas. Lorazepam no tiene escalones definidos.
 */
export const TABLA_ESCALONES_CONFIRMADA = false;

export const INFUSIONES: readonly DefinicionInfusion[] = [
  { id: "fentanilo", nombre: "Fentanilo", unidad: "mcg/kg/h", grupo: "SEDANTE", escalones: { primero: 0.6, sexto: 3.6, decimales: 2 }, semaforo: false, unidadConfirmada: true, rapidos: [] },
  { id: "propofol", nombre: "Propofol", unidad: "mg/kg/h", grupo: "SEDANTE", escalones: { primero: 0.5, sexto: 3.0, decimales: 2 }, semaforo: false, unidadConfirmada: true, rapidos: [] },
  { id: "midazolam", nombre: "Midazolam", unidad: "mg/kg/h", grupo: "SEDANTE", escalones: { primero: 0.01, sexto: 0.06, decimales: 3 }, semaforo: false, unidadConfirmada: true, rapidos: [] },
  { id: "dexmedetomidina", nombre: "Precedex", unidad: "mcg/kg/h", grupo: "SEDANTE", escalones: { primero: 0.2, sexto: 1.5, decimales: 2 }, semaforo: false, unidadConfirmada: true, rapidos: [] },
  { id: "lorazepam", nombre: "Lorazepam", unidad: "mg/h", grupo: "SEDANTE", escalones: null, semaforo: false, unidadConfirmada: true, rapidos: [], paso: 0.5 },
  { id: "noradrenalina", nombre: "Noradrenalina", unidad: "mcg/kg/min", grupo: "DVA", escalones: null, semaforo: true, unidadConfirmada: true, rapidos: [0.05, 0.1, 0.2, 0.3], paso: 0.01 },
  { id: "adrenalina", nombre: "Adrenalina", unidad: "mcg/kg/min", grupo: "DVA", escalones: null, semaforo: true, unidadConfirmada: true, rapidos: [0.05, 0.1, 0.2, 0.3], paso: 0.01 },
  /** Unidad segun el informe de la unidad: UI/min. */
  { id: "vasopresina", nombre: "Vasopresina", unidad: "UI/min", grupo: "DVA", escalones: null, semaforo: false, unidadConfirmada: true, rapidos: [0.01, 0.02, 0.03], paso: 0.01 },
  { id: "dobutamina", nombre: "Dobutamina", unidad: "mcg/kg/min", grupo: "INOTROPO", escalones: null, semaforo: false, unidadConfirmada: true, rapidos: [], paso: 0.5 },
  { id: "milrinona", nombre: "Milrinona", unidad: "mcg/kg/min", grupo: "INOTROPO", escalones: null, semaforo: false, unidadConfirmada: true, rapidos: [], paso: 0.125 },
  /** La unidad (mg/h) es una suposicion: la unidad clinica aun no la confirma. */
  { id: "amiodarona", nombre: "Amiodarona", unidad: "mg/h", grupo: "ANTIARRITMICO", escalones: null, semaforo: false, unidadConfirmada: false, rapidos: [], paso: 5 },
  /** Bloqueo neuromuscular en infusion. Unidades habituales, POR CONFIRMAR con la unidad. */
  { id: "rocuronio", nombre: "Rocuronio", unidad: "mg/kg/h", grupo: "BNM", escalones: null, semaforo: false, unidadConfirmada: false, rapidos: [], paso: 0.1 },
  { id: "vecuronio", nombre: "Vecuronio", unidad: "mcg/kg/min", grupo: "BNM", escalones: null, semaforo: false, unidadConfirmada: false, rapidos: [], paso: 0.1 },
  { id: "atracurio", nombre: "Atracurio", unidad: "mg/kg/h", grupo: "BNM", escalones: null, semaforo: false, unidadConfirmada: false, rapidos: [], paso: 0.1 }
];

// ---------------------------------------------------------------------------
// Equipos de la sala
// ---------------------------------------------------------------------------

export interface DefinicionEquipo {
  readonly modelo: string;
  readonly tipo: TipoEquipo;
  /** false = hay una sola unidad (Servo U): no lleva numero. */
  readonly numerado: boolean;
}

/** Equipos de la unidad. "Savina 1", "Vela 8", "Meckis 3": nombre asociado a un numero de serie. */
export const CATALOGO_EQUIPOS: readonly DefinicionEquipo[] = [
  { modelo: "Servo U", tipo: "VENTILADOR", numerado: false },
  { modelo: "Savina", tipo: "VENTILADOR", numerado: true },
  { modelo: "Vela", tipo: "VENTILADOR", numerado: true },
  { modelo: "Avea", tipo: "VENTILADOR", numerado: true },
  { modelo: "Meckis", tipo: "VENTILADOR", numerado: true },
  { modelo: "PB 840", tipo: "VENTILADOR", numerado: true },
  { modelo: "PB 980", tipo: "VENTILADOR", numerado: true },
  { modelo: "B60", tipo: "VMNI", numerado: true },
  { modelo: "Humidificador MR850", tipo: "HUMIDIFICADOR", numerado: true },
  { modelo: "NBZ Aerogen", tipo: "NEBULIZADOR", numerado: true }
];

export const ETIQUETA_TIPO_EQUIPO: Readonly<Record<TipoEquipo, string>> = {
  VENTILADOR: "Ventilador",
  VMNI: "VMNI",
  ALTO_FLUJO: "Alto flujo",
  HUMIDIFICADOR: "Humidificador",
  NEBULIZADOR: "Nebulizador"
};

/** Aspecto de las secreciones. "Sin secreciones" deshabilita reologia y cantidad. */
export const ASPECTOS_SECRECIONES: readonly { readonly val: import("./tipos").AspectoSecreciones; readonly label: string }[] = [
  { val: "NINGUNA", label: "Sin secreciones" },
  { val: "MUCOSA", label: "Mucosas" },
  { val: "MUCOSA_ROSADA", label: "Mucosas rosadas" },
  { val: "MUCOPURULENTA", label: "Mucopurulentas" },
  { val: "PURULENTA", label: "Purulentas" },
  { val: "HEMATICA", label: "Hemáticas" },
  { val: "MUCOHEMATICA", label: "Mucohemáticas" },
  { val: "MUCOPURULENTA_TINTE_HEMATICO", label: "Mucopurulentas con tinte hemático" },
  { val: "HEMOPURULENTA", label: "Hemopurulentas" },
  { val: "HERRUMBROSA", label: "Herrumbrosas" },
  { val: "CARBONIZADA", label: "Carbonizadas" },
  { val: "BILIOSA", label: "Biliosas" },
  { val: "CONTENIDO_ALIMENTICIO", label: "Contenido alimenticio" }
];
export const etiquetaAspecto = (v: import("./tipos").AspectoSecreciones): string => ASPECTOS_SECRECIONES.find((a) => a.val === v)?.label ?? v;

/** Hay secreciones que describir (reologia y cantidad solo se habilitan en ese caso). */
export const hayAspectoDeSecreciones = (v: import("./tipos").AspectoSecreciones | null): boolean => v !== null && v !== "NINGUNA";

/** Deglucion: clasificacion sencilla. Provisoria, a confirmar con la unidad. */
export const OPCIONES_DEGLUCION: readonly { readonly val: import("./tipos").Deglucion; readonly label: string }[] = [
  { val: "PRESENTE", label: "Presente" },
  { val: "ESPORADICA", label: "Esporádica" },
  { val: "AUSENTE", label: "Ausente" }
];

/** Sugerencias para escribir la auscultacion (el campo es texto libre). Provisorias. */
export const SUGERENCIAS_AUSCULTACION: readonly string[] = [
  "MP conservado",
  "MP disminuido",
  "Crépitos",
  "Sibilancias",
  "Roncus",
  "Abolido"
];

/** Corte del S5Q (0 a 5) para la lectura en el PC. POR CONFIRMAR con la unidad. */
export const CORTE_S5Q = 3;

export const FARMACOS_BNM: readonly string[] = ["Atracurio", "Rocuronio", "Vecuronio"];

// ---------------------------------------------------------------------------
// Kinesiterapia
// ---------------------------------------------------------------------------

export const MOTIVOS_CONTRAINDICACION_MOTORA: readonly string[] = [
  "Inestabilidad hemodinámica / DVA en ascenso",
  "PIC fuera de meta",
  "Inestabilidad quirúrgica u ortopédica",
  "Sangrado activo o procedimiento invasivo en curso",
  "Reposo absoluto / sedación profunda"
];

export interface NivelMotor {
  readonly nivel: 1 | 2 | 3 | 4;
  readonly titulo: string;
  readonly items: readonly string[];
}

/** Niveles de movilizacion 1-4 (base del conteo REM 28). */
export const NIVELES_TERAPIA_FISICA: readonly NivelMotor[] = [
  {
    nivel: 1,
    titulo: "Nivel 1 · En cama",
    items: [
      "Giros en cama / posicionamiento",
      "Movilización pasiva / activo-asistida",
      "IMT (entrenamiento muscular inspiratorio)",
      "EMS (electroestimulación neuromuscular)"
    ]
  },
  {
    nivel: 2,
    titulo: "Nivel 2 · Analítico y sedestación",
    items: ["Entrenamiento muscular analítico", "Sedestación al borde de cama"]
  },
  {
    nivel: 3,
    titulo: "Nivel 3 · Verticalización",
    items: ["Bipedestación asistida", "Transferencia activa cama a sillón"]
  },
  { nivel: 4, titulo: "Nivel 4 · Marcha", items: ["Marcha asistida en el box"] }
];

export const NIVEL_POR_ACTIVIDAD: ReadonlyMap<string, 1 | 2 | 3 | 4> = new Map(
  NIVELES_TERAPIA_FISICA.flatMap((n) => n.items.map((i) => [i, n.nivel] as const))
);

export const PROCEDIMIENTOS_MEDICOS: readonly string[] = [
  "Punción lumbar",
  "Traqueostomía percutánea en box",
  "Instalación CVC / línea arterial",
  "IOT de urgencia"
];

export const MUESTRAS_CULTIVO: readonly string[] = [
  "Aspirado traqueal",
  "Hemocultivos",
  "Urocultivo",
  "Otro"
];

export const DESTINOS_IMAGEN: readonly string[] = ["Scanner", "Resonancia", "Otro"];

/** Corte institucional de flujo pico de tos para exito de extubacion (L/min). */
export const PCF_CORTE_EXITO = 55;
export const PCF_CORTE_OPTIMO = 60;
