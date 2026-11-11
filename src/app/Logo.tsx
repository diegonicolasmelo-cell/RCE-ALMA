import { useEffect } from "react";
import iconoCsv from "./iconos/kapta-csv.png?inline";
import iconoEstacion from "./iconos/kapta-estacion.png?inline";

/** Verde = Kapta CSV (celular, control de signos vitales). Azul = Kapta Estación (computador). */
export type VarianteLogo = "csv" | "estacion";

const ICONO: Record<VarianteLogo, string> = { csv: iconoCsv, estacion: iconoEstacion };

export function Logo({ tam = 40, variante = "csv" }: { readonly tam?: number; readonly variante?: VarianteLogo }) {
  return <img src={ICONO[variante]} width={tam} height={tam} alt="" aria-hidden="true" style={{ flex: "none", display: "block" }} />;
}

/** La pestaña del navegador lleva el ícono de la parte que está abierta. */
export function useFavicon(variante: VarianteLogo): void {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = ICONO[variante];
  }, [variante]);
}
