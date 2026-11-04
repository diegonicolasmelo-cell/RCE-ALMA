/** Utilidades de la app. */

/** Identificador unico generado en el dispositivo (idempotencia de la sincronia). */
export function nuevoId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function textoNum(v: number | null | undefined, vacio = "--"): string {
  return v === null || v === undefined ? vacio : String(v);
}

/** Une clases CSS ignorando las falsas. */
export function cx(...partes: (string | false | null | undefined)[]): string {
  return partes.filter(Boolean).join(" ");
}

/** "mm:ss" para un total de segundos. */
export function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
