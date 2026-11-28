import { useEffect } from "react";
import { create } from "zustand";
import { CAMAS_UNIDAD, camaRce } from "@core/index";
import type { EnlacesRce, PacienteRce } from "@core/index";
import { useServicios } from "../app/contexto";

/**
 * Nombre y edad del paciente de cada cama (Diego, 24-nov-2026: «dejemos que todos vean el nombre
 * por mientras… luego lo adaptamos a privacidad»). Llegan del RCE por el mismo enlace de la
 * historia y viven SOLO en la memoria de la app: nunca se escriben en el disco del teléfono ni en
 * el servidor de Kaptus. Se apaga desde el RCE (CONFIG.KAPTUS_NOMBRES_CELULAR = FALSE).
 */
interface EstadoPacientesRce {
  porCama: ReadonlyMap<number, PacienteRce>;
  /** Synapse y cobas (28-nov-2026): las direcciones de la CONFIG del RCE; null = sin botones. */
  enlaces: EnlacesRce | null;
  poner: (lista: readonly PacienteRce[], enlaces?: EnlacesRce | null) => void;
}

// El RUT y el nombre viven SOLO aquí, en memoria (zustand sin persistencia): al cerrar la app se borran.
export const usePacientesRce = create<EstadoPacientesRce>((set) => ({
  porCama: new Map(),
  enlaces: null,
  poner: (lista, enlaces = null) => set({ porCama: new Map(lista.map((p) => [p.cama, p] as const)), enlaces })
}));

const CADA_MS = 3 * 60_000;

/** Pide nombre y edad al abrir y cada 3 minutos mientras la app está abierta y con señal. */
export function useCargarPacientesRce(): void {
  const { api } = useServicios();
  useEffect(() => {
    if (api.local) return;
    let vivo = true;
    const camas = CAMAS_UNIDAD.map((c) => camaRce(c)).filter((n): n is number => n !== null);
    const cargar = (): void => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void api.leerHistorias(camas).then((r) => { if (vivo && r.ok) usePacientesRce.getState().poner(r.pacientes ?? [], r.enlaces ?? null); }).catch(() => {});
    };
    cargar();
    const t = setInterval(cargar, CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [api]);
}
