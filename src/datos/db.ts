/**
 * Base local (IndexedDB) de cada dispositivo.
 *
 * El celular escribe aqui PRIMERO y despues sincroniza: la app no depende del
 * WiFi de la UCI. En el PC de la estacion funciona como cache de lo que se
 * lee de la nube.
 */

import Dexie from "dexie";
import type { Table } from "dexie";
import type { Control, Episodio, EventoClinico, IdentidadPaciente, ValidacionApk } from "@core/index";

export type TipoRegistro = "episodio" | "control" | "evento" | "apk";

/** Registro pendiente de subir. El payload ya esta serializado para la nube. */
export interface EntradaCola {
  id?: number;
  tipo: TipoRegistro;
  /** Identificador del registro en la nube (idempotencia). */
  registroId: string;
  payload: Record<string, unknown>;
  intentos: number;
  creadoEn: number;
  /** Epoch ms a partir del cual se puede reintentar. */
  proximoIntento: number;
  ultimoError: string | null;
  /** `bloqueada`: el servidor la rechazo por contener identidad; no se reintenta. */
  estado: "pendiente" | "bloqueada";
}

export interface Meta {
  clave: string;
  valor: unknown;
}

export class BaseLocal extends Dexie {
  episodios!: Table<Episodio, string>;
  controles!: Table<Control, string>;
  eventos!: Table<EventoClinico, string>;
  apk!: Table<ValidacionApk, string>;
  /** Solo en PC de la estacion. Nunca existe ni se lee en el celular. */
  identidades!: Table<IdentidadPaciente, string>;
  cola!: Table<EntradaCola, number>;
  meta!: Table<Meta, string>;

  constructor(nombre = "upc-pulse") {
    super(nombre);
    this.version(1).stores({
      episodios: "id,cama,activo",
      controles: "id,episodioId,registradoEn",
      eventos: "id,episodioId,registradoEn",
      apk: "id,episodioId,turno",
      identidades: "episodioId",
      cola: "++id,tipo,proximoIntento,estado",
      meta: "clave"
    });
  }
}

export async function leerMeta<T>(db: BaseLocal, clave: string): Promise<T | undefined> {
  const m = await db.meta.get(clave);
  return m?.valor as T | undefined;
}

export async function guardarMeta(db: BaseLocal, clave: string, valor: unknown): Promise<void> {
  await db.meta.put({ clave, valor });
}
