import { buscarProfesional } from "@core/index";

export function nombreProfesional(rut: string): string {
  const p = buscarProfesional(rut);
  return p ? p.nombre : rut;
}

/** "Diego Melo" -> "DM". */
export function iniciales(rut: string): string {
  const p = buscarProfesional(rut);
  if (!p) return "--";
  return p.nombre
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

export function haceTexto(minutos: number): string {
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  return `hace ${h} h ${minutos % 60} min`;
}

/** Copia al portapapeles. El navegador puede negarlo: devuelve false para avisar al usuario. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Las alertas de riesgo se muestran 24 h. */
export const VENTANA_ALERTA_MS = 24 * 3600 * 1000;
