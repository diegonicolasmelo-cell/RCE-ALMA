/**
 * Llave de estacion creada en el PC: 32 bytes al azar del navegador. A Google solo viaja su
 * huella (SHA-256 en hexadecimal); la llave queda en los PC de la estacion.
 */

const base64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function crearLlave(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return base64url(b);
}

export async function huellaDe(llave: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(llave));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
