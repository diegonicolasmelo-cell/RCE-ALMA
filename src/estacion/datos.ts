import { normalizarControl } from "@core/index";
import type { Control, Episodio, EventoClinico, IdentidadPaciente, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";

export interface DatosUnidad {
  readonly episodios: readonly Episodio[];
  readonly controles: ReadonlyMap<string, readonly Control[]>;
  readonly eventos: ReadonlyMap<string, readonly EventoClinico[]>;
  readonly apks: ReadonlyMap<string, readonly ValidacionApk[]>;
  readonly identidades: ReadonlyMap<string, IdentidadPaciente>;
}

const VACIO: DatosUnidad = { episodios: [], controles: new Map(), eventos: new Map(), apks: new Map(), identidades: new Map() };

function agrupar<T extends { episodioId: string; registradoEn?: string }>(filas: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const l = m.get(f.episodioId);
    if (l) l.push(f);
    else m.set(f.episodioId, [f]);
  }
  for (const l of m.values()) l.sort((a, b) => (a.registradoEn ?? "").localeCompare(b.registradoEn ?? ""));
  return m;
}

/** Toda la unidad, en vivo desde IndexedDB: se actualiza sola cuando llega algo nuevo. */
export function useDatosUnidad(): DatosUnidad {
  const { db, repo } = useServicios();
  return useConsulta(
    async () => {
      const [episodios, controles, eventos, apks, ids] = await Promise.all([
        repo.episodiosActivos(),
        db.controles.toArray(),
        db.eventos.toArray(),
        db.apk.toArray(),
        db.identidades.toArray()
      ]);
      return {
        episodios,
        controles: agrupar(controles.map(normalizarControl)),
        eventos: agrupar(eventos),
        apks: agrupar(apks),
        identidades: new Map(ids.map((i) => [i.episodioId, i] as const))
      };
    },
    [db, repo],
    VACIO
  );
}
