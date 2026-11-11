/** Catalogos clinicos y protocolos UPC. Datos, sin logica. */

import type {
  CampoVent,
  DispositivoPosterior,
  MotivoCambioVia,
  MotivoExtubacionSinPve,
  EstadoVigilia,
  IdInfusion,
  Modalidad,
  TipoEquipo,
  ValorSas,
  ViaAerea
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
  PCV: "ACPC",
  CPAP_PS: "CPAP+PS",
  TUBO_T: "Tubo T / HME",
  CNAF_TQT: "Alto flujo por TQT",
  O2_NARICERA: "Naricera",
  O2_MASCARILLA: "Mascarilla simple",
  O2_VENTURI: "Venturi",
  O2_RESERVORIO: "Mascarilla con reservorio",
  CNAF: "CNAF",
  VNI_CPAP: "VNI · CPAP",
  VNI_ST: "BiPAP S/T",
  AVAPS: "AVAPS"
};

export type GrupoModalidad = "VENTILACION_MECANICA" | "DESCONEXION" | "OXIGENOTERAPIA" | "VNI";
export const ETIQUETA_GRUPO_MODALIDAD: Readonly<Record<GrupoModalidad, string>> = {
  VENTILACION_MECANICA: "Ventilación mecánica",
  DESCONEXION: "Desconexión",
  OXIGENOTERAPIA: "Oxigenoterapia",
  VNI: "Ventilación no invasiva"
};
export const GRUPO_MODALIDAD: Readonly<Record<Modalidad, GrupoModalidad>> = {
  ACVC: "VENTILACION_MECANICA",
  PCV: "VENTILACION_MECANICA",
  CPAP_PS: "VENTILACION_MECANICA",
  TUBO_T: "DESCONEXION",
  CNAF_TQT: "DESCONEXION",
  O2_NARICERA: "OXIGENOTERAPIA",
  O2_MASCARILLA: "OXIGENOTERAPIA",
  O2_VENTURI: "OXIGENOTERAPIA",
  O2_RESERVORIO: "OXIGENOTERAPIA",
  CNAF: "OXIGENOTERAPIA",
  VNI_CPAP: "VNI",
  VNI_ST: "VNI",
  AVAPS: "VNI"
};

/**
 * Que modos se ofrecen segun la via aerea. Con via natural, solo oxigenoterapia y VNI.
 * Con TET, los modos ventilatorios y el tubo T / HME. Con TQT, lo mismo mas alto flujo
 * por TQT, S/T y AVAPS (conectados a la TQT).
 */
export const MODALIDADES_POR_VIA: Readonly<Record<ViaAerea, readonly Modalidad[]>> = {
  NATURAL: ["O2_NARICERA", "O2_MASCARILLA", "O2_VENTURI", "O2_RESERVORIO", "CNAF", "VNI_CPAP", "VNI_ST"],
  TET: ["ACVC", "PCV", "CPAP_PS", "TUBO_T"],
  TQT: ["ACVC", "PCV", "CPAP_PS", "TUBO_T", "CNAF_TQT", "VNI_ST", "AVAPS"]
};

export function modalidadPermitida(m: Modalidad, via: ViaAerea): boolean {
  return MODALIDADES_POR_VIA[via].includes(m);
}

/** Modos con presion positiva: el ventilador (o la VNI) da soporte. El resto es desconexion u oxigenoterapia. */
export const MODALIDADES_CON_SOPORTE: readonly Modalidad[] = ["ACVC", "PCV", "CPAP_PS", "VNI_ST", "AVAPS", "VNI_CPAP"];
export const conSoporte = (m: Modalidad): boolean => MODALIDADES_CON_SOPORTE.includes(m);

/** Modos que se ventilan con presion positiva y Vt medible (para la guia de proteccion pulmonar). */
export const MODALIDADES_CON_VT: readonly Modalidad[] = ["ACVC", "PCV", "CPAP_PS", "VNI_CPAP", "VNI_ST", "AVAPS"];

export interface TransicionSoporte {
  readonly tipo: "DESVINCULACION" | "RECONEXION";
  readonly texto: string;
  readonly desde: Modalidad;
  readonly hasta: Modalidad;
}

/**
 * Desvinculacion o reconexion, deducida del modo anterior y el nuevo. Pasar de un modo con
 * soporte (CPAP+PS, ACVC...) a uno sin soporte (tubo T / HME, alto flujo, oxigenoterapia) es
 * desvincular; al reves, reconectar. Con via natural, el soporte es la VNI. `null` si no cambia.
 * La desvinculacion no es una PVE: la PVE es un protocolo aparte, solo con TET.
 */
export function transicionSoporte(previo: Modalidad | null, nuevo: Modalidad, via: ViaAerea): TransicionSoporte | null {
  if (!previo || conSoporte(previo) === conSoporte(nuevo)) return null;
  const natural = via === "NATURAL";
  const desv = conSoporte(previo) && !conSoporte(nuevo);
  return {
    tipo: desv ? "DESVINCULACION" : "RECONEXION",
    texto: desv ? (natural ? "Desvinculación de VNI" : "Desvinculación") : natural ? "Reconexión a VNI" : "Reconexión",
    desde: previo,
    hasta: nuevo
  };
}

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
  CNAF: [p("flujo", "Flujo", "L/min"), p("temperatura", "Temperatura", "°C"), p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm")],
  CNAF_TQT: [p("flujo", "Flujo", "L/min"), p("temperatura", "Temperatura", "°C"), p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm")],
  TUBO_T: [p("flujo", "Flujo O₂", "L/min"), p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm")],
  O2_NARICERA: [p("flujo", "Flujo O₂", "L/min"), o("frTotal", "FR", "rpm")],
  O2_MASCARILLA: [p("flujo", "Flujo O₂", "L/min"), o("frTotal", "FR", "rpm")],
  O2_RESERVORIO: [p("flujo", "Flujo O₂", "L/min"), o("frTotal", "FR", "rpm")],
  O2_VENTURI: [p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm")],
  // En VNI la presion de la interfaz: CPAP (o EPAP) va en `peep`; IPAP en `presion`.
  VNI_CPAP: [p("peep", "CPAP", "cmH₂O"), p("fio2", "FiO₂", "%"), o("frTotal", "FR", "rpm"), o("vtEspirado", "Vt espirado", "ml"), o("fuga", "Fuga", "L/min")],
  VNI_ST: [
    p("presion", "IPAP", "cmH₂O"),
    p("peep", "EPAP", "cmH₂O"),
    p("frProgramada", "FR de respaldo", "rpm"),
    p("fio2", "FiO₂", "%"),
    o("frTotal", "FR total", "rpm"),
    o("vtEspirado", "Vt espirado", "ml"),
    o("volMinuto", "Vol. minuto", "L/min"),
    o("fuga", "Fuga", "L/min")
  ],
  AVAPS: [
    p("vtProgramado", "Vt objetivo", "ml"),
    p("presionMax", "IPAP máx.", "cmH₂O"),
    p("presion", "IPAP mín.", "cmH₂O"),
    p("peep", "EPAP", "cmH₂O"),
    p("frProgramada", "FR de respaldo", "rpm"),
    p("fio2", "FiO₂", "%"),
    o("frTotal", "FR total", "rpm"),
    o("vtEspirado", "Vt espirado", "ml"),
    o("volMinuto", "Vol. minuto", "L/min"),
    o("fuga", "Fuga", "L/min")
  ]
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
  /**
   * Pasado el escalon 6, sigue titulando de a `paso` hasta `max` (midazolam: 0,06 y despues
   * de a 0,01 hasta 0,5). Sin esto, ▲ no pasa del escalon 6.
   */
  readonly sobreEscalones?: { readonly paso: number; readonly max: number };
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
  { id: "midazolam", nombre: "Midazolam", unidad: "mg/kg/h", grupo: "SEDANTE", escalones: { primero: 0.01, sexto: 0.06, decimales: 3 }, sobreEscalones: { paso: 0.01, max: 0.5 }, semaforo: false, unidadConfirmada: true, rapidos: [] },
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

/** Por que una extubacion fue fuera de protocolo (sin PVE). */
export const ETIQUETA_MOTIVO_SIN_PVE: Readonly<Record<MotivoExtubacionSinPve, string>> = {
  MENOS_24H_VM: "menos de 24 h de VM",
  AET: "adecuación del esfuerzo terapéutico",
  VENTILACION_DOMICILIARIA: "ventilación mecánica domiciliaria",
  AGITACION_PSICOMOTORA: "agitación psicomotora",
  OTRO: "otro motivo"
};

/** Motivos de un recambio de tubo o de canula. */
export const ETIQUETA_MOTIVO_CAMBIO: Readonly<Record<MotivoCambioVia, string>> = {
  CUFF_DANADO: "cuff dañado",
  OBSTRUCCION: "obstrucción",
  FUGA: "fuga",
  CAMBIO_CALIBRE: "cambio de calibre",
  PROGRAMADO: "recambio programado",
  OTRO: "otro motivo"
};

export const ETIQUETA_DISPOSITIVO: Readonly<Record<DispositivoPosterior, string>> = {
  CNAF: "CNAF",
  VMNI: "VMNI",
  O2_CONVENCIONAL: "O₂ convencional",
  AIRE_AMBIENTE: "aire ambiente",
  REINTUBACION_INMEDIATA: "reintubación inmediata"
};

// ---------------------------------------------------------------------------
// Camas de la unidad
// ---------------------------------------------------------------------------

/** Las 18 camas de la UCI. Una cama sin episodio activo esta libre: se puede ingresar desde el celular. */
export const CAMAS_UNIDAD: readonly string[] = Array.from({ length: 18 }, (_, i) => `UCI-${String(i + 1).padStart(2, "0")}`);

/** "UCI-02" -> "Cama 2": como se nombra la cama en voz alta. */
export function nombreCama(cama: string): string {
  const n = /(\d+)\s*$/.exec(cama)?.[1];
  return n ? `Cama ${Number(n)}` : cama;
}

/**
 * Rango etario, no la edad exacta: es lo que se guarda en la nube (minimizacion de datos).
 * Un ingreso hecho desde el celular lo deja en null hasta que la estacion lo completa.
 */
export const RANGOS_EDAD = ["18–39", "40–59", "60–69", "70–79", "80 o más"] as const;
export type RangoEdad = (typeof RANGOS_EDAD)[number];

export function rangoDeEdad(edad: number): RangoEdad {
  if (edad < 40) return "18–39";
  if (edad < 60) return "40–59";
  if (edad < 70) return "60–69";
  if (edad < 80) return "70–79";
  return "80 o más";
}

export function textoEdad(rango: RangoEdad | null): string {
  return rango ? `${rango} años` : "edad pendiente";
}
