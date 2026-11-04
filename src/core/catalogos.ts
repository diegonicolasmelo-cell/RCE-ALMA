/** Catalogos clinicos y protocolos UPC. Datos, sin logica. */

import type {
  CantidadSecreciones,
  EstadoVigilia,
  IdSedante,
  TipoAspiracion,
  TipoSecreciones,
  ValorSas
} from "./tipos";

export interface OpcionEscala<T> {
  readonly val: T;
  readonly label: string;
  readonly desc?: string;
}

export const ESCALA_SAS: readonly OpcionEscala<ValorSas>[] = [
  { val: 1, label: "1 · No despertable", desc: "Sin respuesta a estimulos" },
  { val: 2, label: "2 · Muy sedado", desc: "Despierta al estimulo fisico, no sigue ordenes" },
  { val: 3, label: "3 · Sedado", desc: "Despierta al llamado suave, obedece ordenes" },
  { val: 4, label: "4 · Calmado y cooperador", desc: "Despierto, tranquilo y coopera (meta)" },
  { val: 5, label: "5 · Agitado", desc: "Inquieto, se calma con la voz" },
  { val: 6, label: "6 · Muy agitado", desc: "Muerde TET, requiere contencion" },
  { val: 7, label: "7 · Agitacion peligrosa", desc: "Tracciona TET o cateteres" }
];

export const ESTADOS_VIGILIA: readonly OpcionEscala<EstadoVigilia>[] = [
  { val: "VIGIL_ALERTA", label: "Vigil / Alerta" },
  { val: "SOMNOLIENTO", label: "Somnoliento / Sopor superficial" },
  { val: "ESTUPOROSO", label: "Estuporoso / Sopor profundo" },
  { val: "COMA", label: "Coma" }
];

export const GCS_OCULAR: readonly OpcionEscala<1 | 2 | 3 | 4>[] = [
  { val: 4, label: "4 · Espontanea" },
  { val: 3, label: "3 · Al llamado" },
  { val: 2, label: "2 · Al dolor" },
  { val: 1, label: "1 · Ninguna" }
];

export const GCS_VERBAL: readonly OpcionEscala<1 | 2 | 3 | 4 | 5>[] = [
  { val: 5, label: "5 · Orientado" },
  { val: 4, label: "4 · Confuso" },
  { val: 3, label: "3 · Palabras inapropiadas" },
  { val: 2, label: "2 · Sonidos incomprensibles" },
  { val: 1, label: "1 · Ninguna" }
];

export const GCS_MOTORA: readonly OpcionEscala<1 | 2 | 3 | 4 | 5 | 6>[] = [
  { val: 6, label: "6 · Obedece ordenes" },
  { val: 5, label: "5 · Localiza el dolor" },
  { val: 4, label: "4 · Retirada al dolor" },
  { val: 3, label: "3 · Flexion anormal" },
  { val: 2, label: "2 · Extension" },
  { val: 1, label: "1 · Ninguna" }
];

/** ICU Mobility Scale (0-10). */
export const ESCALA_IMS: readonly OpcionEscala<number>[] = [
  { val: 0, label: "0 · Pasivo en cama" },
  { val: 1, label: "1 · Giros / activo en cama" },
  { val: 2, label: "2 · Transferencia pasiva a sillon" },
  { val: 3, label: "3 · Sedestacion borde de cama (SBC)" },
  { val: 4, label: "4 · Bipedestacion con asistencia" },
  { val: 5, label: "5 · Transferencia cama-silla dando pasos" },
  { val: 6, label: "6 · Marcha en el lugar" },
  { val: 7, label: "7 · Marcha >= 5 m con 2+ personas" },
  { val: 8, label: "8 · Marcha >= 5 m con 1 persona" },
  { val: 9, label: "9 · Marcha independiente con ayuda tecnica" },
  { val: 10, label: "10 · Marcha independiente" }
];

export interface DefinicionSedante {
  readonly id: IdSedante;
  readonly label: string;
  readonly unidad: string;
  /** Dosis del escalon 1 y del escalon 6. Los intermedios se interpolan. */
  readonly escalon1: number;
  readonly escalon6: number;
}

/** Titulacion por escalones 1-6 (protocolo UPC HSPC). */
export const SEDANTES: readonly DefinicionSedante[] = [
  { id: "fentanilo", label: "Fentanilo", unidad: "mcg/kg/h", escalon1: 0.6, escalon6: 3.6 },
  { id: "propofol", label: "Propofol", unidad: "mg/kg/h", escalon1: 0.5, escalon6: 3.0 },
  { id: "precedex", label: "Precedex", unidad: "mcg/kg/h", escalon1: 0.2, escalon6: 1.5 },
  { id: "midazolam", label: "Midazolam", unidad: "mg/kg/h", escalon1: 0.01, escalon6: 0.06 },
  { id: "lorazepam", label: "Lorazepam", unidad: "mg/h", escalon1: 0.5, escalon6: 4.0 }
];

export const FARMACOS_BNM: readonly string[] = ["Atracurio", "Rocuronio", "Vecuronio"];

/** Botones de seleccion rapida para vasopresina (UI/min). */
export const VASOPRESINA_RAPIDA: readonly number[] = [0.01, 0.02, 0.03];

export const MOTIVOS_CONTRAINDICACION_MOTORA: readonly string[] = [
  "Inestabilidad hemodinamica grave / DVA en ascenso",
  "Hipertension endocraneana / PIC fuera de meta (>20 mmHg)",
  "Inestabilidad quirurgica u ortopedica aguda / torax abierto",
  "Sangrado activo o procedimiento invasivo en curso",
  "Reposo medico absoluto estricto / sedacion profunda SAS 1-2"
];

export interface NivelMotor {
  readonly nivel: 1 | 2 | 3 | 4;
  readonly titulo: string;
  readonly items: readonly string[];
}

/** Niveles de movilizacion precoz 1-4 (base del conteo REM 28). */
export const NIVELES_KINE_MOTORA: readonly NivelMotor[] = [
  {
    nivel: 1,
    titulo: "Nivel 1 · En cama",
    items: [
      "Giros en cama / posicionamiento",
      "Movilizacion pasiva / activo-asistida",
      "EMS (electroestimulacion neuromuscular)",
      "IMT (entrenamiento muscular inspiratorio)"
    ]
  },
  {
    nivel: 2,
    titulo: "Nivel 2 · Analitico y sedestacion",
    items: ["Entrenamiento muscular analitico", "Sedestacion al borde de cama (SBC)"]
  },
  {
    nivel: 3,
    titulo: "Nivel 3 · Verticalizacion",
    items: ["Bipedestacion asistida", "Transferencia activa cama a sillon"]
  },
  {
    nivel: 4,
    titulo: "Nivel 4 · Marcha",
    items: ["Marcha asistida en el box / pasillo UPC"]
  }
];

/** Indice inverso actividad -> nivel, para el consolidado REM 28. */
export const NIVEL_POR_ACTIVIDAD: ReadonlyMap<string, 1 | 2 | 3 | 4> = new Map(
  NIVELES_KINE_MOTORA.flatMap((n) => n.items.map((i) => [i, n.nivel] as const))
);

export const PROCEDIMIENTOS_MEDICOS: readonly string[] = [
  "Fibrobroncoscopia (FBC) + lavado broncoalveolar",
  "Puncion lumbar (PL) / posicionamiento LCR",
  "Intubacion orotraqueal (IOT) de urgencia",
  "Traqueostomia percutanea en box",
  "Instalacion CVC / linea arterial / Swan-Ganz"
];

export const CANTIDAD_SECRECIONES: readonly OpcionEscala<CantidadSecreciones>[] = [
  { val: "AUSENTES", label: "Ausentes" },
  { val: "ESCASAS", label: "Escasas" },
  { val: "MODERADAS", label: "Moderadas" },
  { val: "ABUNDANTES", label: "Abundantes" }
];

export const TIPO_SECRECIONES: readonly OpcionEscala<TipoSecreciones>[] = [
  { val: "MUCOSAS", label: "Mucosas" },
  { val: "MUCOPURULENTAS", label: "Mucopurulentas" },
  { val: "PURULENTAS", label: "Purulentas" },
  { val: "HEMATICAS", label: "Hematicas" }
];

export const TIPOS_ASPIRACION: readonly OpcionEscala<TipoAspiracion>[] = [
  { val: "NO_REQUIERE", label: "No requiere" },
  { val: "CIRCUITO_CERRADO", label: "Circuito cerrado (TrachCare)" },
  { val: "SONDA_ABIERTA", label: "Set + sonda abierta" }
];

/** Corte institucional de flujo pico de tos para exito de extubacion (L/min). */
export const PCF_CORTE_EXITO = 55;
export const PCF_CORTE_OPTIMO = 60;
