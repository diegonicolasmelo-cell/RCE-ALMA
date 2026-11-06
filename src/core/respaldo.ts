/**
 * Respaldo mensual cifrado de las hojas APK.
 *
 * Las hojas llevan el RUN en claro, asi que antes de sacarlas del PC de respaldo (por
 * correo, disco externo, etc.) se empaquetan en UN solo archivo cifrado con la contrasena
 * de la unidad. Cualquier PC de la unidad que tenga la clave puede abrirlo.
 */

import { cifrarJson, descifrarJson } from "./cifrado";

export interface DocumentoRespaldo {
  readonly nombre: string;
  readonly html: string;
}

interface Paquete {
  readonly formato: "upc-pulse-respaldo-apk";
  readonly creadoEn: string;
  readonly documentos: readonly DocumentoRespaldo[];
}

const CABECERA = "UPC-PULSE RESPALDO APK v1\n";
export const EXTENSION_RESPALDO = ".upcres";

export const nombreRespaldo = (ahora: Date): string =>
  `Respaldo APK ${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}${EXTENSION_RESPALDO}`;

export async function armarRespaldoCifrado(clave: CryptoKey, documentos: readonly DocumentoRespaldo[], ahora: Date): Promise<string> {
  const paquete: Paquete = { formato: "upc-pulse-respaldo-apk", creadoEn: ahora.toISOString(), documentos };
  return CABECERA + (await cifrarJson(clave, paquete));
}

/** Lanza si la clave no corresponde, el archivo fue alterado o no es un respaldo. */
export async function abrirRespaldoCifrado(clave: CryptoKey, contenido: string): Promise<readonly DocumentoRespaldo[]> {
  if (!contenido.startsWith(CABECERA)) throw new Error("Este archivo no es un respaldo de hojas APK.");
  const p = await descifrarJson<Paquete>(clave, contenido.slice(CABECERA.length).trim());
  if (p.formato !== "upc-pulse-respaldo-apk" || !Array.isArray(p.documentos)) throw new Error("El respaldo tiene un formato desconocido.");
  return p.documentos;
}
