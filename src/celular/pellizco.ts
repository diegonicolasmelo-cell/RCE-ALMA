import { useEffect, useRef, useState } from "react";

/**
 * Acercar y alejar con dos dedos SOLO dentro de la sábana (25-nov-2026, Diego: «en modo sábana
 * para el celular pueda rotar la pantalla y adaptar tamaño con ambos dedos»).
 *
 * El resto de la app sigue sin zoom (html.celular bloquea el pellizco del navegador para que la
 * pantalla no se mueva al tocar botones). Aquí se escala el contenido con `zoom`, que recalcula
 * el ancho: la tabla se puede seguir desplazando con un dedo a cualquier tamaño.
 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
const acotar = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function usePellizco<T extends HTMLElement>(activo: boolean): { ref: React.RefObject<T>; zoom: number; setZoom: (z: number) => void } {
  const ref = useRef<T>(null);
  const [zoom, setZoomCrudo] = useState(1);
  const zoomRef = useRef(1);
  const setZoom = (z: number): void => { zoomRef.current = acotar(z); setZoomCrudo(zoomRef.current); };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inicio: { dist: number; zoom: number } | null = null;
    const dist = (t: TouchList): number => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const empieza = (e: TouchEvent): void => { if (e.touches.length === 2) inicio = { dist: dist(e.touches), zoom: zoomRef.current }; };
    const mueve = (e: TouchEvent): void => {
      if (!inicio || e.touches.length !== 2) return;
      e.preventDefault();
      setZoom(inicio.zoom * (dist(e.touches) / Math.max(1, inicio.dist)));
    };
    const termina = (e: TouchEvent): void => { if (e.touches.length < 2) inicio = null; };
    el.addEventListener("touchstart", empieza, { passive: true });
    el.addEventListener("touchmove", mueve, { passive: false });
    el.addEventListener("touchend", termina, { passive: true });
    el.addEventListener("touchcancel", termina, { passive: true });
    return () => {
      el.removeEventListener("touchstart", empieza);
      el.removeEventListener("touchmove", mueve);
      el.removeEventListener("touchend", termina);
      el.removeEventListener("touchcancel", termina);
    };
  }, [activo]);
  return { ref, zoom, setZoom };
}
