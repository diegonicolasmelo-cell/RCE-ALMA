import { useEffect } from "react";
import { purgaDeIdentidadLista } from "@core/index";
import type { Episodio, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useIdentidadesEnMemoria } from "./identidades";
import type { BaseLocal } from "../datos/db";
import type { ClienteApi } from "../datos/api";

/**
 * Borra la identidad de un episodio: primero en la nube y solo si salio bien, en este PC.
 * Asi, si la nube falla, la fila local queda como recordatorio y el barrido reintenta.
 */
export async function borrarIdentidad(api: ClienteApi, db: BaseLocal, episodioId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await api.purgarReferencias([episodioId]);
  if (!r.ok) return r;
  await db.identidades.delete(episodioId);
  useIdentidadesEnMemoria.getState().quitar(episodioId);
  return { ok: true };
}

/**
 * Barrido en cualquier PC de la estacion: cuando la hoja APK final ya fue guardada por el
 * PC de respaldo, se borra la identidad de los episodios dados de alta.
 */
export function usePurgasPendientes(pendientes: readonly Episodio[], apks: ReadonlyMap<string, readonly ValidacionApk[]>): void {
  const { api, db, local, tokenEstacion } = useServicios();
  useEffect(() => {
    if (local || !tokenEstacion) return;
    void (async () => {
      for (const ep of pendientes) {
        if (purgaDeIdentidadLista(ep, apks.get(ep.id) ?? [])) await borrarIdentidad(api, db, ep.id);
      }
    })();
  }, [api, db, local, tokenEstacion, pendientes, apks]);
}
