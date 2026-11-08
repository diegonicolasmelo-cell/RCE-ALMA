import type { Ventilador } from "@core/index";
import { useServicios } from "../app/contexto";
import { useConsulta } from "../app/hooks";

const VACIO: readonly Ventilador[] = [];

/** El inventario de ventiladores en vivo desde la base local: se actualiza solo al llegar un movimiento. */
export function useInventario(): readonly Ventilador[] {
  const { repo } = useServicios();
  return useConsulta(() => repo.inventarioVentiladores(), [repo], VACIO);
}
