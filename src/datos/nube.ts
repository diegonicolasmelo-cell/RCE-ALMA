/**
 * Conversion entre el dominio y las filas de la nube.
 *
 * La hoja es APPEND-ONLY: una fila con un id ya presente se ignora. Un episodio
 * cambia (via aerea, transcrito a ALMA), asi que cada cambio es una VERSION
 * nueva con id `<episodio>#<version>` y al leer se toma la mas reciente.
 *
 * Todo lo que sale pasa por las funciones de serializacion de src/core, que
 * construyen por allowlist: un campo nuevo no sale hasta agregarlo a proposito.
 */

import {
  asegurarPayloadSinIdentidad,
  serializarApkParaNube,
  serializarControlParaNube,
  serializarEpisodioParaNube,
  serializarEventoParaNube
} from "@core/index";
import type { Control, Episodio, EventoClinico, ValidacionApk } from "@core/index";
import type { TipoRegistro } from "./db";

export interface FilaNube {
  readonly tipo: TipoRegistro;
  readonly registroId: string;
  readonly payload: Record<string, unknown>;
}

export function filaDeEpisodio(e: Episodio, version: number, ahora: Date): FilaNube {
  const registroId = `${e.id}#${version}`;
  const payload = {
    ...serializarEpisodioParaNube(e),
    id: registroId,
    episodioId: e.id,
    registradoEn: ahora.toISOString()
  };
  return { tipo: "episodio", registroId, payload: asegurarPayloadSinIdentidad(payload) };
}

export function filaDeControl(c: Control): FilaNube {
  return { tipo: "control", registroId: c.id, payload: asegurarPayloadSinIdentidad(serializarControlParaNube(c)) };
}

export function filaDeEvento(e: EventoClinico): FilaNube {
  return { tipo: "evento", registroId: e.id, payload: asegurarPayloadSinIdentidad(serializarEventoParaNube(e)) };
}

export function filaDeApk(a: ValidacionApk): FilaNube {
  return { tipo: "apk", registroId: a.id, payload: asegurarPayloadSinIdentidad(serializarApkParaNube(a)) };
}

// ---------------------------------------------------------------------------
// Lectura: la hoja es editable a mano, asi que se valida la forma
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const esTxt = (x: unknown): x is string => typeof x === "string" && x !== "";

/** Una fila corrupta se descarta; no debe tumbar la lectura completa. */
export function controlDeNube(x: unknown): Control | null {
  if (!esObj(x) || !esTxt(x["id"]) || !esTxt(x["episodioId"]) || !esTxt(x["registradoEn"])) return null;
  if (!esObj(x["ventilacion"]) || !esObj(x["kineResp"]) || !esObj(x["terapiaFisica"]) || !esObj(x["infusiones"])) return null;
  return x as unknown as Control;
}

export function eventoDeNube(x: unknown): EventoClinico | null {
  if (!esObj(x) || !esTxt(x["id"]) || !esTxt(x["episodioId"]) || !esTxt(x["tipo"]) || !esTxt(x["registradoEn"])) return null;
  return x as unknown as EventoClinico;
}

export function apkDeNube(x: unknown): ValidacionApk | null {
  if (!esObj(x) || !esTxt(x["id"]) || !esTxt(x["episodioId"]) || !esTxt(x["turno"]) || !esTxt(x["registradoEn"])) return null;
  return x as unknown as ValidacionApk;
}

/** Una version de episodio leida de la nube, con su marca para elegir la ultima. */
export interface VersionEpisodio {
  readonly episodio: Episodio;
  readonly registradoEn: string;
}

export function versionDeEpisodioNube(x: unknown): VersionEpisodio | null {
  if (!esObj(x) || !esTxt(x["episodioId"]) || !esTxt(x["registradoEn"]) || !esTxt(x["cama"])) return null;
  const { registradoEn, episodioId, ...resto } = x as Obj & { registradoEn: string; episodioId: string };
  const episodio = { ...resto, id: episodioId } as unknown as Episodio;
  return { episodio, registradoEn };
}

/** Para cada episodio, la version mas reciente. */
export function ultimasVersiones(versiones: readonly VersionEpisodio[]): readonly Episodio[] {
  const mejor = new Map<string, VersionEpisodio>();
  for (const v of versiones) {
    const actual = mejor.get(v.episodio.id);
    if (!actual || v.registradoEn > actual.registradoEn) mejor.set(v.episodio.id, v);
  }
  return [...mejor.values()].map((v) => v.episodio);
}
