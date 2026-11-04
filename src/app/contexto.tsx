import { createContext, useContext } from "react";
import type { Servicios } from "../datos/servicios";

export const ServiciosContext = createContext<Servicios | null>(null);

export function useServicios(): Servicios {
  const s = useContext(ServiciosContext);
  if (!s) throw new Error("useServicios fuera del proveedor");
  return s;
}
