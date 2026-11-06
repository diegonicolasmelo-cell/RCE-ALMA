import { useEffect } from "react";
import { columnasApk, documentoApkHtml, firmaApk, formatearRut } from "@core/index";
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

const claveLocal = (episodioId: string): string => `apkLocal:${episodioId}`;

/**
 * Copia de las hojas APK en la carpeta de ESTE PC (el PC de respaldo). Es el unico
 * archivo: ya no hay copia en la nube. Escribe cuando cambian las firmas y, al terminar,
 * deja constancia en el episodio (`apkArchivada`) para que otros PC sepan que ya puede
 * borrarse la identidad. Si el PC estuvo cerrado, se pone al dia al abrir.
 */
export function useArchivoApkLocal(
  episodios: readonly Episodio[],
  pendientes: readonly Episodio[],
  apks: ReadonlyMap<string, readonly ValidacionApk[]>,
  identidades: ReadonlyMap<string, IdentidadPaciente>
): void {
  const { db, repo } = useServicios();
  const carpeta = useConsulta(() => leerMeta<CarpetaHandle>(db, CLAVE_CARPETA_APK), [db], undefined);
  useEffect(() => {
    if (!carpeta) return;
    let cancelado = false;
    void (async () => {
      if (!(await permisoConcedido(carpeta))) return;
      for (const ep of [...episodios, ...pendientes]) {
        const lista = apks.get(ep.id) ?? [];
        const identidad = identidades.get(ep.id) ?? null;
        if (lista.length === 0 || !identidad) continue;
        const firma = firmaApk(lista, ep.id);
        if ((await leerMeta<string>(db, claveLocal(ep.id))) !== firma) {
          try {
            await escribirHtml(carpeta, nombreArchivoApk(ep, identidad), htmlApk(ep, identidad, lista));
          } catch {
            return; // carpeta movida o sin permiso: se reintenta en el proximo cambio
          }
          if (cancelado) return;
          await guardarMeta(db, claveLocal(ep.id), firma);
        }
        // Constancia para los demas PC: la hoja con estas firmas ya esta guardada.
        if (ep.apkArchivada !== firma) await repo.guardarEpisodio({ ...ep, apkArchivada: firma });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [db, repo, carpeta, episodios, pendientes, apks, identidades]);
}
