import { useEffect } from "react";
import { columnasApk, documentoApkHtml, formatearRut } from "@core/index";
import type { Episodio, IdentidadPaciente, ValidacionApk } from "@core/index";
import { guardarMeta, leerMeta } from "../datos/db";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";
import { CLAVE_CARPETA_APK, escribirHtml, permisoConcedido } from "./archivoLocal";
import type { CarpetaHandle } from "./archivoLocal";
import logoAcreditacion from "./logo-acreditacion.jpg?inline";
import logoGobierno from "./logo-gobierno.jpg?inline";

/** Valor de la casilla "Servicio" de la hoja. */
export const SERVICIO_APK = "UCI Adulto";

/** "Ficha o RUN": el RUN con formato; si solo hay ficha, la ficha. */
export function runParaApk(identidad: IdentidadPaciente | null): string {
  if (!identidad) return "";
  return identidad.rut ? formatearRut(identidad.rut) : (identidad.ficha ?? "");
}

export function htmlApk(ep: Episodio, identidad: IdentidadPaciente | null, apks: readonly ValidacionApk[]): string {
  return documentoApkHtml({
    apks: columnasApk(apks, ep.id),
    runPaciente: runParaApk(identidad),
    servicio: SERVICIO_APK,
    logoIzquierdo: logoGobierno,
    logoDerecho: logoAcreditacion
  });
}

export const nombreArchivoApk = (ep: Episodio, identidad: IdentidadPaciente | null): string =>
  `APK ${ep.cama} ${runParaApk(identidad) || ep.id.slice(0, 8)}`;

const claveArchivo = (episodioId: string): string => `apkArchivada:${episodioId}`;

/**
 * Al firmarse una APK en cualquier celular, la estacion rellena la hoja y la deja
 * en la carpeta de Drive. Solo la estacion puede: el documento lleva RUN, que
 * nunca pasa por el celular. Reintenta sola si la nube no responde.
 */
export function useArchivoApk(
  episodios: readonly Episodio[],
  apks: ReadonlyMap<string, readonly ValidacionApk[]>,
  identidades: ReadonlyMap<string, IdentidadPaciente>
): void {
  const { api, db, local, tokenEstacion } = useServicios();
  useEffect(() => {
    if (local || !tokenEstacion) return;
    let cancelado = false;
    void (async () => {
      for (const ep of episodios) {
        const lista = apks.get(ep.id) ?? [];
        const identidad = identidades.get(ep.id) ?? null;
        if (lista.length === 0 || !identidad) continue;
        const firma = lista.map((a) => a.id).sort().join(",");
        if ((await leerMeta<string>(db, claveArchivo(ep.id))) === firma) continue;
        const r = await api.guardarDocumentoApk(nombreArchivoApk(ep, identidad), htmlApk(ep, identidad, lista));
        if (cancelado) return;
        if (r.ok) await guardarMeta(db, claveArchivo(ep.id), firma);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [api, db, local, tokenEstacion, episodios, apks, identidades]);
}

const claveLocal = (episodioId: string): string => `apkLocal:${episodioId}`;

/**
 * Copia en paralelo a una carpeta de este PC (si se eligio una). Independiente de
 * Drive: si una falla, la otra sigue. Se vuelve a escribir cuando cambian las firmas.
 */
export function useArchivoApkLocal(
  episodios: readonly Episodio[],
  apks: ReadonlyMap<string, readonly ValidacionApk[]>,
  identidades: ReadonlyMap<string, IdentidadPaciente>
): void {
  const { db } = useServicios();
  const carpeta = useConsulta(() => leerMeta<CarpetaHandle>(db, CLAVE_CARPETA_APK), [db], undefined);
  useEffect(() => {
    if (!carpeta) return;
    let cancelado = false;
    void (async () => {
      if (!(await permisoConcedido(carpeta))) return;
      for (const ep of episodios) {
        const lista = apks.get(ep.id) ?? [];
        const identidad = identidades.get(ep.id) ?? null;
        if (lista.length === 0 || !identidad) continue;
        const firma = lista.map((a) => a.id).sort().join(",");
        if ((await leerMeta<string>(db, claveLocal(ep.id))) === firma) continue;
        try {
          await escribirHtml(carpeta, nombreArchivoApk(ep, identidad), htmlApk(ep, identidad, lista));
        } catch {
          return; // carpeta movida o sin permiso: se reintenta en el proximo cambio
        }
        if (cancelado) return;
        await guardarMeta(db, claveLocal(ep.id), firma);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [db, carpeta, episodios, apks, identidades]);
}
