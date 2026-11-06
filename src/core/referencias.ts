/**
 * Referencias de episodio: donde viaja la identidad del paciente (nombre y RUT).
 *
 * En la nube solo hay UN bloque cifrado por episodio, en una hoja con nombres neutros
 * ("referencia", "dato"): ningun encabezado ni celda dice nombre ni RUT. La clave para
 * leerlo vive solo en el navegador de cada PC de la unidad (ver cifrado.ts).
 *
 * El celular no tiene el token de estacion ni la clave: no puede pedirlas ni leerlas.
 */

import { cifrarJson, claveCorresponde, crearVerificacion, descifrarJson } from "./cifrado";
import type { IdentidadPaciente } from "./tipos";

/** Fila de la hoja de referencias. `dato` es texto cifrado, nunca texto claro. */
export interface ReferenciaNube {
  readonly episodioId: string;
  readonly registradoEn: string;
  readonly dato: string;
}

/** Fila especial para comprobar que la contrasena escrita en un PC es la de la unidad. */
export const ID_VERIFICACION = "_verificacion";

interface DatosIdentidad {
  readonly nombre: string;
  readonly rut: string | null;
  readonly ficha: string | null;
}

export async function cifrarIdentidad(clave: CryptoKey, i: IdentidadPaciente, ahora: Date): Promise<ReferenciaNube> {
  const datos: DatosIdentidad = { nombre: i.nombre, rut: i.rut, ficha: i.ficha };
  return { episodioId: i.episodioId, registradoEn: ahora.toISOString(), dato: await cifrarJson(clave, datos) };
}

/** `null` si el bloque no se puede leer con esta clave (otra contrasena o dato alterado). */
export async function descifrarIdentidad(clave: CryptoKey, ref: ReferenciaNube): Promise<IdentidadPaciente | null> {
  try {
    const d = await descifrarJson<DatosIdentidad>(clave, ref.dato);
    return { episodioId: ref.episodioId, nombre: d.nombre, rut: d.rut ?? null, ficha: d.ficha ?? null };
  } catch {
    return null;
  }
}

export async function crearReferenciaVerificacion(clave: CryptoKey, ahora: Date): Promise<ReferenciaNube> {
  return { episodioId: ID_VERIFICACION, registradoEn: ahora.toISOString(), dato: await crearVerificacion(clave) };
}

export async function referenciaCorresponde(clave: CryptoKey, ref: ReferenciaNube): Promise<boolean> {
  return claveCorresponde(clave, ref.dato);
}

/** Las filas de pacientes, sin la fila de verificacion. */
export const soloEpisodios = (refs: readonly ReferenciaNube[]): ReferenciaNube[] => refs.filter((r) => r.episodioId !== ID_VERIFICACION);
