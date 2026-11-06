import { create } from "zustand";
import type { IdentidadPaciente } from "@core/index";

/**
 * Nombres descifrados de los pacientes, SOLO en la memoria de la pagina.
 *
 * En produccion nunca se escriben en el disco del navegador: al cerrar la pestana o
 * recargar, desaparecen, y al abrir la estacion se descargan los bloques cifrados y se
 * vuelven a descifrar con la contrasena de la unidad. (En modo demostracion, sin nube,
 * los datos inventados siguen en la base local.)
 */
interface EstadoIdentidades {
  mapa: ReadonlyMap<string, IdentidadPaciente>;
  reemplazar: (lista: readonly IdentidadPaciente[]) => void;
  poner: (i: IdentidadPaciente) => void;
  quitar: (episodioId: string) => void;
  vaciar: () => void;
}

export const useIdentidadesEnMemoria = create<EstadoIdentidades>((set) => ({
  mapa: new Map(),
  reemplazar: (lista) => set({ mapa: new Map(lista.map((i) => [i.episodioId, i] as const)) }),
  poner: (i) => set((s) => ({ mapa: new Map(s.mapa).set(i.episodioId, i) })),
  quitar: (id) =>
    set((s) => {
      const m = new Map(s.mapa);
      m.delete(id);
      return { mapa: m };
    }),
  vaciar: () => set({ mapa: new Map() })
}));
