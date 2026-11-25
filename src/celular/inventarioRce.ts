import { useEffect } from "react";
import { create } from "zustand";
import type { EquipoRce } from "@core/index";
import { useServicios } from "../app/contexto";

/**
 * Inventario de equipos del RCE para la sala en 8 bits (25-nov-2026). Vive en memoria; se pide al
 * abrir la ronda y cada 2 minutos. Los cambios hechos en el teléfono se reflejan al tiro (antes de
 * que el RCE los reciba): así se pueden hacer varios movimientos seguidos, que quedan en la cola.
 */
interface EstadoInventario {
  equipos: readonly EquipoRce[];
  cargado: boolean;
  poner: (lista: readonly EquipoRce[]) => void;
  ubicar: (nombre: string, cama: number | null, enUso: boolean) => void;
}

export const useInventarioRce = create<EstadoInventario>((set) => ({
  equipos: [],
  cargado: false,
  poner: (lista) => set({ equipos: lista, cargado: true }),
  ubicar: (nombre, cama, enUso) => set((s) => ({
    equipos: s.equipos.map((e) => (e.nombre.toLowerCase() === nombre.toLowerCase() ? { ...e, ubicacion: cama === null ? "PASILLO" : "CAMA", cama, enUso } : e))
  }))
}));

export function useCargarInventarioRce(): void {
  const { api } = useServicios();
  useEffect(() => {
    let vivo = true;
    const cargar = (): void => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void api.leerInventario().then((r) => { if (vivo && r.ok) useInventarioRce.getState().poner(r.equipos); }).catch(() => {});
    };
    cargar();
    const t = setInterval(cargar, 2 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [api]);
}
