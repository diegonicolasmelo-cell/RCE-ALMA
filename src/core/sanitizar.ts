/**
 * Frontera de minimizacion de datos.
 *
 * Google Apps Script y Sheets corren FUERA de la red del hospital y Apps Script no
 * puede leer la IP del cliente. Por eso el canal CLINICO (el que usa el celular)
 * nunca lleva identidad: esta guarda la rechaza. La identidad tiene su propio
 * canal, serializarIdentidadParaNube(), con token distinto. Ver cap. 3 del plan.
 *
 * ESTRATEGIA: allowlist, no blocklist.
 * Se construye un objeto nuevo campo por campo. No se hace `delete obj.nombre`
 * sobre el objeto completo, porque eso se rompe en silencio el dia que alguien
 * agrega un campo identificable al modelo. Aqui, un campo nuevo simplemente no
 * sale hasta que alguien lo agregue a proposito.
 *
 * DEFENSA EN PROFUNDIDAD: `contieneDatoIdentificable()` revisa el payload ya
 * serializado buscando llaves prohibidas. Lo usan los tests y el repositorio
 * justo antes de hacer POST.
 */

import type {
  Control,
  Episodio,
  EventoClinico,
  ValidacionApk
} from "./tipos";

/**
 * Llaves que jamas deben aparecer en un payload hacia la nube.
 * En minusculas: la comparacion es insensible a mayusculas.
 */
export const LLAVES_PROHIBIDAS: readonly string[] = [
  "nombre",
  "nombrepaciente",
  "apellido",
  "apellidos",
  "iniciales",
  "rut",
  "run",
  "ficha",
  "nficha",
  "numeroficha",
  "fechanacimiento",
  "fechadenacimiento",
  "direccion",
  "telefono",
  "prevision",
  "identidad"
];

/**
 * `rutAutor` y `rutTitular` identifican al PROFESIONAL, no al paciente, y son
 * necesarios para la trazabilidad y la firma APK. Se permiten explicitamente.
 */
const LLAVES_PERMITIDAS_PESE_AL_PATRON: readonly string[] = ["rutautor", "ruttitular"];

export interface EpisodioNube {
  readonly id: string;
  readonly cama: string;
  readonly edad: number;
  readonly sexo: string;
  readonly tallaCm: number;
  readonly tallaOrigen: string;
  readonly diagnostico: string;
  readonly viaAereaActual: string;
  readonly calibreVia: string | null;
  readonly fijacionCm: string | null;
  readonly diasVM: number;
  readonly equipos: readonly { tipo: string; modelo: string; numero: number | null; enUso: boolean }[];
  readonly monitoreo: { capnografia: boolean; pic: boolean; dve: boolean };
  readonly rutTitular: string;
  readonly transcritoAlma: boolean;
  readonly horaTranscripcion: string | null;
  readonly pendienteEntrega: string;
  readonly activo: boolean;
  readonly apkArchivada: string | null;
}

/**
 * Serializa un episodio para la nube. El nombre del paciente no esta en
 * `Episodio` por diseno: vive en `IdentidadPaciente`, que no tiene serializador
 * hacia la nube y por eso no puede salir ni por error.
 */
export function serializarEpisodioParaNube(e: Episodio): EpisodioNube {
  return {
    id: e.id,
    cama: e.cama,
    edad: e.edad,
    sexo: e.sexo,
    tallaCm: e.tallaCm,
    tallaOrigen: e.tallaOrigen,
    diagnostico: e.diagnostico,
    viaAereaActual: e.viaAereaActual,
    calibreVia: e.calibreVia,
    fijacionCm: e.fijacionCm,
    diasVM: e.diasVM,
    equipos: e.equipos.map((q) => ({ ...q })),
    monitoreo: { ...e.monitoreo },
    rutTitular: e.rutTitular,
    transcritoAlma: e.transcritoAlma,
    horaTranscripcion: e.horaTranscripcion,
    pendienteEntrega: e.pendienteEntrega,
    activo: e.activo,
    apkArchivada: e.apkArchivada
  };
}

/**
 * El control no contiene identidad por construccion. Se serializa completo,
 * salvo `observaciones`, que es texto libre y es el unico vector real de fuga:
 * un profesional puede escribir ahi el nombre de un familiar. Sube (la nota de
 * ALMA lo necesita) pero se marca para que la UI advierta y para que una
 * revision posterior pueda auditar ese campo.
 */
export function serializarControlParaNube(c: Control): Record<string, unknown> {
  return {
    id: c.id,
    episodioId: c.episodioId,
    numero: c.numero,
    hora: c.hora,
    registradoEn: c.registradoEn,
    rutAutor: c.rutAutor,
    esControlApoyo: c.esControlApoyo,
    corrige: c.corrige,
    fc: c.fc,
    pas: c.pas,
    pad: c.pad,
    spo2: c.spo2,
    viaAerea: c.viaAerea,
    ventilacion: { ...c.ventilacion },
    esfuerzo: c.esfuerzo === null ? null : { ...c.esfuerzo },
    neuro: c.neuro === null ? null : { ...c.neuro },
    infusiones: Object.fromEntries(Object.entries(c.infusiones).map(([k, v]) => [k, { ...v }])),
    sas: c.sas,
    vigilia: c.vigilia,
    glasgow: c.glasgow === null ? null : { ...c.glasgow },
    s5q: c.s5q,
    kineResp: { ...c.kineResp },
    terapiaFisica: { ...c.terapiaFisica, actividades: [...c.terapiaFisica.actividades] },
    observaciones: c.observaciones,
    textoLibreRevisado: false
  };
}

export function serializarEventoParaNube(e: EventoClinico): Record<string, unknown> {
  return { ...e };
}

export function serializarApkParaNube(v: ValidacionApk): Record<string, unknown> {
  return { ...v, marcas: [...v.marcas] };
}

/**
 * Revisa recursivamente un payload serializado buscando llaves identificables.
 * Devuelve la ruta de las llaves infractoras (vacio si esta limpio).
 */
export function contieneDatoIdentificable(payload: unknown, ruta = ""): readonly string[] {
  const hallazgos: string[] = [];

  if (payload === null || typeof payload !== "object") return hallazgos;

  if (Array.isArray(payload)) {
    payload.forEach((item, i) => {
      hallazgos.push(...contieneDatoIdentificable(item, `${ruta}[${i}]`));
    });
    return hallazgos;
  }

  for (const [llave, valor] of Object.entries(payload)) {
    const normalizada = llave.toLowerCase();
    const rutaActual = ruta === "" ? llave : `${ruta}.${llave}`;

    if (
      LLAVES_PROHIBIDAS.includes(normalizada) &&
      !LLAVES_PERMITIDAS_PESE_AL_PATRON.includes(normalizada)
    ) {
      hallazgos.push(rutaActual);
    }

    hallazgos.push(...contieneDatoIdentificable(valor, rutaActual));
  }

  return hallazgos;
}

/**
 * Guarda de ultimo momento antes de un POST. Lanza en vez de enviar: es
 * preferible perder una sincronia que filtrar un dato de paciente.
 */
export function asegurarPayloadSinIdentidad<T>(payload: T): T {
  const hallazgos = contieneDatoIdentificable(payload);
  if (hallazgos.length > 0) {
    throw new Error(
      `Sincronia abortada: el payload contiene datos identificables (${hallazgos.join(", ")}). ` +
        `Ver src/core/sanitizar.ts`
    );
  }
  return payload;
}

/**
 * Un control guardado por una version anterior (o leido de una fila vieja de la hoja)
 * puede no traer los campos que se agregaron despues. Se completan como "no medido".
 */
export function normalizarControl(c: Control): Control {
  const v = c.ventilacion as Partial<Control["ventilacion"]> & Control["ventilacion"];
  const k = (c.kineResp ?? {}) as Partial<Control["kineResp"]>;
  return {
    ...c,
    s5q: c.s5q ?? null,
    ventilacion: {
      ...v,
      autoPeep: v.autoPeep ?? null,
      volMinuto: v.volMinuto ?? null,
      temperatura: v.temperatura ?? null,
      musculaturaAccesoria: v.musculaturaAccesoria ?? null
    },
    kineResp: {
      // Antes era una lista de opciones; ahora es texto libre.
      auscultacion: typeof k.auscultacion === "string" ? k.auscultacion : Array.isArray(k.auscultacion) ? (k.auscultacion as string[]).join(", ") : "",
      aspecto: k.aspecto ?? null,
      reologia: k.reologia ?? null,
      cantidad: k.cantidad ?? null,
      tos: k.tos ?? null,
      flujoPicoTos: k.flujoPicoTos ?? null,
      deglucion: k.deglucion ?? null
    },
    infusiones: c.infusiones ?? {}
  };
}
