/**
 * Estado de la interfaz: sesion, cama seleccionada, borradores y avisos.
 * Los datos clinicos NO viven aqui: estan en IndexedDB y se leen con useConsulta.
 */

import { create } from "zustand";
import type { BorradorControl } from "@core/index";
import type { SegmentoId } from "../celular/pasos";

/** La PVE no es una pestana del control: se abre desde la tarjeta de la cama (vista "pve"). */
export type TabCelular = "control" | "kine" | "motora" | "eventos";
/** "camas": tarjetas de las camas. "cama": el control de una cama. "evaluacion": evaluaciones puntuales. "pve": la PVE directa, sin pasar por el control. "eventos": registrar un evento directo desde la tarjeta. */
export type VistaCelular = "elegir" | "camas" | "cama" | "evaluacion" | "pve" | "eventos";

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
  /** Segmento al que hay que llevar la pantalla cuando se muestre la pestana (p. ej. un dato que falta). */
  segPedido: SegmentoId | null;
  pedirSegmento: (s: SegmentoId | null) => void;
  vista: VistaCelular;
  /** Camas (UCI-01...) que este usuario atiende hoy. `null` = aun no lo ha dicho. */
  misCamas: readonly string[] | null;
  setMisCamas: (c: readonly string[] | null) => void;
  /** Abre una cama en la vista indicada (o vuelve a las tarjetas). */
  irA: (vista: VistaCelular, camaId?: string) => void;
  /** Evento que Eventos debe abrir al mostrarse (p. ej. la extubacion fuera de protocolo desde la tarjeta). */
  eventoPedido: string | null;
  pedirEvento: (k: string | null) => void;

  /** Un borrador por cama: se conserva al cambiar de cama y de pestana. */
  borradores: Record<string, BorradorControl>;
  /** Cuando se edito por ultima vez cada borrador (ms). */
  editados: Record<string, number>;
  editar: (episodioId: string, base: BorradorControl, fn: (b: BorradorControl) => BorradorControl) => void;
  descartar: (episodioId: string) => void;

  aviso: Aviso | null;
  avisar: (texto: string, deshacer?: () => void) => void;
  cerrarAviso: () => void;
}

/** Un control a medio llenar se retoma solo si se toco hace menos de esto (una interrupcion). */
export const RETOMAR_BORRADOR_MS = 20 * 60 * 1000;

let contadorAvisos = 0;

export const useApp = create<EstadoApp>((set) => ({
  sesion: null,
  setSesion: (sesion) => set({ sesion, vista: "camas" }),

  camaId: null,
  setCama: (camaId) => set({ camaId, tab: "control", segPedido: null }),
  tab: "control",
  setTab: (tab) => set({ tab }),
  segPedido: null,
  pedirSegmento: (segPedido) => set({ segPedido }),
  vista: "camas",
  misCamas: null,
  setMisCamas: (misCamas) => set({ misCamas }),
  eventoPedido: null,
  pedirEvento: (eventoPedido) => set({ eventoPedido }),
  irA: (vista, camaId) =>
    set((s) => {
      if (!camaId) return { vista, camaId: s.camaId };
      // Un control nuevo parte en blanco. Solo se retoma lo que se dejo a medio llenar hace poco
      // (una interrupcion), nunca lo de un control anterior.
      const reciente = (s.editados[camaId] ?? 0) > Date.now() - RETOMAR_BORRADOR_MS;
      if (reciente || vista !== "cama") return { vista, camaId, tab: "control", segPedido: null };
      const { [camaId]: _b, ...borradores } = s.borradores;
      const { [camaId]: _e, ...editados } = s.editados;
      void _b;
      void _e;
      return { vista, camaId, tab: "control", segPedido: null, borradores, editados };
    }),

  borradores: {},
  editados: {},
  editar: (episodioId, base, fn) =>
    set((s) => ({
      borradores: { ...s.borradores, [episodioId]: fn(s.borradores[episodioId] ?? base) },
      editados: { ...s.editados, [episodioId]: Date.now() }
    })),
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
