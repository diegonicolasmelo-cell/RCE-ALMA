/**
 * Copia local de las hojas APK en una carpeta del disco de ESTE PC (File System
 * Access API: Chrome y Edge). Va en paralelo a Drive, nunca en su lugar.
 *
 * El navegador no deja escribir en una carpeta sin que alguien la elija una vez;
 * la carpeta elegida se recuerda (IndexedDB). Tras reiniciar el navegador puede
 * pedir confirmar el permiso con un clic. Solo escribe mientras la estacion esta abierta.
 */

import type { BaseLocal } from "../datos/db";
import { guardarMeta, leerMeta } from "../datos/db";

interface ArchivoEscribible { write(d: string): Promise<void>; close(): Promise<void> }
interface ArchivoHandle { createWritable(): Promise<ArchivoEscribible> }
interface EntradaCarpeta {
  readonly kind: "file" | "directory";
  readonly name: string;
  getFile?(): Promise<File>;
}
export interface CarpetaHandle {
  readonly name: string;
  values(): AsyncIterable<EntradaCarpeta>;
  removeEntry(nombre: string): Promise<void>;
  getFileHandle(nombre: string, op: { create: boolean }): Promise<ArchivoHandle>;
  queryPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
}

export const CLAVE_CARPETA_APK = "carpetaApk";

export const archivoLocalSoportado = (): boolean => typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function elegirCarpeta(db: BaseLocal): Promise<CarpetaHandle | null> {
  try {
    const w = window as unknown as { showDirectoryPicker(o: { mode: "readwrite" }): Promise<CarpetaHandle> };
    const h = await w.showDirectoryPicker({ mode: "readwrite" });
    await guardarMeta(db, CLAVE_CARPETA_APK, h);
    return h;
  } catch {
    return null; // el usuario cancelo
  }
}

export const leerCarpeta = (db: BaseLocal): Promise<CarpetaHandle | undefined> => leerMeta<CarpetaHandle>(db, CLAVE_CARPETA_APK);

export async function permisoConcedido(h: CarpetaHandle): Promise<boolean> {
  try {
    return (await h.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Requiere un gesto del usuario (un clic). */
export async function pedirPermiso(h: CarpetaHandle): Promise<boolean> {
  try {
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

const nombreSeguro = (n: string): string => n.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);

export async function escribirHtml(h: CarpetaHandle, nombre: string, html: string): Promise<void> {
  const f = await h.getFileHandle(`${nombreSeguro(nombre)}.html`, { create: true });
  const w = await f.createWritable();
  await w.write(html);
  await w.close();
}

/** Las hojas APK (.html) que hay en la carpeta, para armar el respaldo. */
export async function leerHojasHtml(h: CarpetaHandle): Promise<{ nombre: string; html: string }[]> {
  const out: { nombre: string; html: string }[] = [];
  for await (const e of h.values()) {
    if (e.kind === "file" && e.name.toLowerCase().endsWith(".html") && e.getFile) out.push({ nombre: e.name, html: await (await e.getFile()).text() });
  }
  return out;
}

/** Borra de la carpeta solo los archivos indicados. */
export async function borrarArchivos(h: CarpetaHandle, nombres: readonly string[]): Promise<void> {
  for (const n of nombres) await h.removeEntry(n);
}
