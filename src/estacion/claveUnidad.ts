import { crearReferenciaVerificacion, derivarClave, referenciaCorresponde, ID_VERIFICACION } from "@core/index";
import { borrarMeta, guardarMeta, leerMeta } from "../datos/db";
import type { BaseLocal } from "../datos/db";
import type { ClienteApi } from "../datos/api";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";

/** La clave derivada (no la contrasena) queda en este navegador, sin poder exportarse. */
export const META_CLAVE_UNIDAD = "claveUnidad";

export const leerClaveUnidad = (db: BaseLocal): Promise<CryptoKey | undefined> => leerMeta<CryptoKey>(db, META_CLAVE_UNIDAD);

export function useClaveUnidad(): CryptoKey | undefined {
  const { db } = useServicios();
  return useConsulta(() => leerClaveUnidad(db), [db], undefined);
}

export type ResultadoInstalacion =
  | { readonly ok: true; readonly primera: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * Instala la contrasena de la unidad en ESTE PC. Si la nube ya tiene la fila de
 * verificacion, se comprueba que la contrasena sea la correcta; si no la tiene, este es
 * el primer PC y se crea (solo con `permitirPrimera`, para no crear una por error).
 */
export async function instalarContrasena(
  contrasena: string,
  api: ClienteApi,
  db: BaseLocal,
  permitirPrimera: boolean
): Promise<ResultadoInstalacion> {
  let clave: CryptoKey;
  try {
    clave = await derivarClave(contrasena);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Contraseña inválida." };
  }
  const r = await api.leerReferencias();
  if (!r.ok) return { ok: false, error: r.error === "SIN_CONEXION" ? "Sin conexión: no se pudo comprobar la contraseña." : `No se pudo comprobar la contraseña (${r.error}).` };
  const verificacion = r.referencias.find((x) => x.episodioId === ID_VERIFICACION);
  let primera = false;
  if (verificacion) {
    if (!(await referenciaCorresponde(clave, verificacion))) return { ok: false, error: "Esa no es la contraseña de la unidad." };
  } else {
    if (!permitirPrimera) return { ok: false, error: "Todavía no hay una contraseña de la unidad. Marca «Es el primer PC» para crearla." };
    const g = await api.guardarReferencias([await crearReferenciaVerificacion(clave, new Date())]);
    if (!g.ok) return { ok: false, error: `No se pudo crear la verificación (${g.error ?? "sin conexión"}).` };
    primera = true;
  }
  await guardarMeta(db, META_CLAVE_UNIDAD, clave);
  return { ok: true, primera };
}

/** Quita la clave y las identidades descifradas de este PC. */
export async function olvidarClave(db: BaseLocal): Promise<void> {
  await borrarMeta(db, META_CLAVE_UNIDAD);
  await db.identidades.clear();
}
