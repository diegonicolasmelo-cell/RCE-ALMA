import { normalizarControl } from "@core/index";
import type { Control, Episodio, EventoClinico, IdentidadPaciente, ValidacionApk } from "@core/index";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";
import { useIdentidadesEnMemoria } from "./identidades";

export interface DatosUnidad {
  readonly episodios: readonly Episodio[];
  /** Todos los episodios, activos y egresados (ultima version de cada uno): para el REM. */
  readonly todosEpisodios: readonly Episodio[];
  readonly controles: ReadonlyMap<string, readonly Control[]>;
  readonly eventos: ReadonlyMap<string, readonly EventoClinico[]>;
  readonly apks: ReadonlyMap<string, readonly ValidacionApk[]>;
  readonly identidades: ReadonlyMap<string, IdentidadPaciente>;
  /** Episodios ya dados de alta cuya identidad sigue guardada (esperan la hoja APK final). */
  readonly pendientesPurga: readonly Episodio[];
}

const VACIO: DatosUnidad = { episodios: [], todosEpisodios: [], controles: new Map(), eventos: new Map(), apks: new Map(), identidades: new Map(), pendientesPurga: [] };

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

/** Cada episodio puede tener varias versiones guardadas: vale la ultima. */
function ultimaVersion(eps: readonly Episodio[]): Episodio[] {
  const m = new Map<string, Episodio>();
  for (const e of eps) m.set(e.id, e);
  return [...m.values()];
}

/** Toda la unidad, en vivo desde IndexedDB: se actualiza sola cuando llega algo nuevo. */
export function useDatosUnidad(): DatosUnidad {
  const { db, repo, local } = useServicios();
  // En produccion los nombres viven solo en memoria; en demostracion, en la base local.
  const enMemoria = useIdentidadesEnMemoria((s) => s.mapa);
  return useConsulta(
    async () => {
      const [episodios, todos, controles, eventos, apks, ids] = await Promise.all([
        repo.episodiosActivos(),
        db.episodios.toArray(),
        db.controles.toArray(),
        db.eventos.toArray(),
        db.apk.toArray(),
        local ? db.identidades.toArray() : Promise.resolve([...enMemoria.values()])
      ]);
      return {
        episodios,
        todosEpisodios: ultimaVersion(todos),
        controles: agrupar(controles.map(normalizarControl)),
        eventos: agrupar(eventos),
        apks: agrupar(apks),
        identidades: new Map(ids.map((i) => [i.episodioId, i] as const)),
        pendientesPurga: ultimaVersion(todos).filter((e) => !e.activo && ids.some((i) => i.episodioId === e.id))
      };
    },
    [db, repo, local, enMemoria],
    VACIO
  );
}
