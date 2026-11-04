/**
 * Estado de la interfaz: sesion, cama seleccionada, borradores y avisos.
 * Los datos clinicos NO viven aqui: estan en IndexedDB y se leen con useConsulta.
 */

import { create } from "zustand";
import type { BorradorControl } from "@core/index";

export type TabCelular = "monitoreo" | "ventilacion" | "kine" | "pve" | "eventos";
/** "camas": tarjetas de las camas. "cama": el control de una cama. "evaluacion": evaluaciones puntuales. */
export type VistaCelular = "camas" | "cama" | "evaluacion";

export interface Sesion {
  readonly rut: string;
  readonly nombre: string;
  readonly rol: "KINE_CLINICO" | "COORDINACION";
}

export interface Aviso {
  readonly id: number;
  readonly texto: string;
  readonly deshacer?: () => void;
}

interface EstadoApp {
  sesion: Sesion | null;
  setSesion: (s: Sesion | null) => void;

  camaId: string | null;
  setCama: (id: string) => void;
  tab: TabCelular;
  setTab: (t: TabCelular) => void;
  vista: VistaCelular;
  /** Abre una cama en la vista indicada (o vuelve a las tarjetas). */
  irA: (vista: VistaCelular, camaId?: string) => void;

  /** Un borrador por cama: se conserva al cambiar de cama y de pestana. */
  borradores: Record<string, BorradorControl>;
  editar: (episodioId: string, base: BorradorControl, fn: (b: BorradorControl) => BorradorControl) => void;
  descartar: (episodioId: string) => void;

  aviso: Aviso | null;
  avisar: (texto: string, deshacer?: () => void) => void;
  cerrarAviso: () => void;
}

let contadorAvisos = 0;

export const useApp = create<EstadoApp>((set) => ({
  sesion: null,
  setSesion: (sesion) => set({ sesion, vista: "camas" }),

  camaId: null,
  setCama: (camaId) => set({ camaId, tab: "monitoreo" }),
  tab: "monitoreo",
  setTab: (tab) => set({ tab }),
  vista: "camas",
  irA: (vista, camaId) => set((s) => (camaId ? { vista, camaId, tab: "monitoreo" } : { vista, camaId: s.camaId })),

  borradores: {},
  editar: (episodioId, base, fn) =>
    set((s) => ({ borradores: { ...s.borradores, [episodioId]: fn(s.borradores[episodioId] ?? base) } })),
  descartar: (episodioId) =>
    set((s) => {
      const { [episodioId]: _quitado, ...resto } = s.borradores;
      void _quitado;
      return { borradores: resto };
    }),

  aviso: null,
  avisar: (texto, deshacer) => set({ aviso: { id: ++contadorAvisos, texto, ...(deshacer ? { deshacer } : {}) } }),
  cerrarAviso: () => set({ aviso: null })
}));
