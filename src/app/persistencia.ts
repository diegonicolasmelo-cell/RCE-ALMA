/**
 * Persistencia de borradores.
 *
 * Un control a medio llenar sobrevive a que el sistema cierre la app, a una
 * actualizacion o a un reinicio. Pasadas 12 h el borrador se descarta: arrastraria
 * ajustes e infusiones de un contexto clinico que ya cambio.
 */

import type { BorradorControl } from "@core/index";
import { guardarMeta, leerMeta } from "../datos/db";
import type { BaseLocal } from "../datos/db";
import { useApp } from "./store";

export const CLAVE_BORRADORES = "borradores";
export const VIGENCIA_BORRADOR_MS = 12 * 3600 * 1000;

export interface BorradoresGuardados {
  readonly guardadoEn: number;
  readonly borradores: Readonly<Record<string, BorradorControl>>;
}

/** Los borradores aun vigentes, o vacio si estan vencidos o no hay. */
export function borradoresVigentes(
  g: BorradoresGuardados | undefined,
  ahora: number,
  vigenciaMs = VIGENCIA_BORRADOR_MS
): Record<string, BorradorControl> {
  if (!g || ahora - g.guardadoEn > vigenciaMs) return {};
  return { ...g.borradores };
}

export async function restaurarBorradores(db: BaseLocal): Promise<void> {
  const g = await leerMeta<BorradoresGuardados>(db, CLAVE_BORRADORES);
  const vigentes = borradoresVigentes(g, Date.now());
  if (Object.keys(vigentes).length > 0) useApp.setState({ borradores: vigentes });
}

/** Guarda los borradores cada vez que cambian (con una pequena espera). Devuelve como dejar de hacerlo. */
export function persistirBorradores(db: BaseLocal): () => void {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const cancelar = useApp.subscribe((estado, previo) => {
    if (estado.borradores === previo.borradores) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      void guardarMeta(db, CLAVE_BORRADORES, { guardadoEn: Date.now(), borradores: useApp.getState().borradores } satisfies BorradoresGuardados);
    }, 400);
  });
  return () => {
    clearTimeout(temporizador);
    cancelar();
  };
}
