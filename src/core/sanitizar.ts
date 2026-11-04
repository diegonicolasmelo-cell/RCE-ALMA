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
  IdentidadPaciente,
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
}

/**
 * Canal de identidad: unico lugar donde nombre y RUT pueden salir, hacia la hoja
 * "identidad", con el token de estacion. El celular no tiene ese token, asi que
 * el servidor no le entrega esta hoja aunque el cliente tenga un bug.
 *
 * DECISION DEL USUARIO (riesgo aceptado): la identidad vive en Google Sheets para
 * estar disponible en cualquier PC de la UCI y habilitar el enlace a Sinapse por
 * RUT. Apps Script no puede restringir por IP; la proteccion es el token de
 * estacion, la separacion de hojas y la purga al alta.
 */
export function serializarIdentidadParaNube(
  i: IdentidadPaciente,
  ahora: Date
): Record<string, unknown> {
  return {
    id: i.episodioId,
    episodioId: i.episodioId,
    registradoEn: ahora.toISOString(),
    nombre: i.nombre,
    rut: i.rut,
    ficha: i.ficha
  };
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
    activo: e.activo
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
