/**
 * Cifrado de la identidad del paciente (nombre y RUT) en el navegador.
 *
 * Lo que sale hacia la nube es UN solo bloque ilegible. La clave se deriva de una
 * contrasena de la unidad que se escribe una vez en cada PC y NUNCA viaja a la hoja,
 * a Drive ni al codigo publicado. Solo los PC que la tienen pueden leer el dato.
 *
 *   - AES-GCM 256: confidencialidad y deteccion de alteraciones.
 *   - PBKDF2-SHA256 con muchas iteraciones: frena el adivinar la contrasena.
 *   - IV aleatorio por bloque: dos pacientes iguales no dan el mismo texto.
 *   - Relleno a largo fijo: el tamano no delata cuan largo es el nombre.
 *
 * Usa WebCrypto (navegador y Node). Funciones puras salvo por la aleatoriedad.
 */

const VERSION = "v1";
/** Sal publica y fija de la app; la proteccion real es la contrasena de la unidad. */
const SAL = "upc-pulse/identidad/v1";
const ITERACIONES = 600_000;
/** El texto claro se rellena hasta un multiplo de este tamano. */
const BLOQUE = 256;
export const TEXTO_VERIFICACION = "UPC-PULSE-CLAVE-OK";

const enc = new TextEncoder();
const dec = new TextDecoder();

function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function deBase64(texto: string): Uint8Array {
  const s = atob(texto);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Deriva la clave de la unidad. `extraible: false` impide sacarla del navegador. */
export async function derivarClave(contrasena: string, iteraciones = ITERACIONES): Promise<CryptoKey> {
  if (contrasena.length < 8) throw new Error("La contraseña de la unidad debe tener al menos 8 caracteres.");
  const material = await crypto.subtle.importKey("raw", enc.encode(contrasena.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(SAL), iterations: iteraciones, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Rellena el JSON con espacios hasta un multiplo de BLOQUE (el JSON ignora los espacios finales). */
function rellenar(texto: string): Uint8Array {
  const bytes = enc.encode(texto);
  const total = Math.max(BLOQUE, Math.ceil(bytes.length / BLOQUE) * BLOQUE);
  const out = new Uint8Array(total).fill(0x20);
  out.set(bytes);
  return out;
}

/** Cifra un objeto a "v1.<iv>.<datos>" en base64. */
export async function cifrarJson(clave: CryptoKey, valor: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, rellenar(JSON.stringify(valor))));
  return `${VERSION}.${aBase64(iv)}.${aBase64(datos)}`;
}

/** Descifra. Lanza si la clave es otra o el bloque fue alterado. */
export async function descifrarJson<T>(clave: CryptoKey, bloque: string): Promise<T> {
  const [v, iv, datos] = bloque.split(".");
  if (v !== VERSION || !iv || !datos) throw new Error("Bloque cifrado con formato desconocido.");
  try {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(iv) as BufferSource }, clave, deBase64(datos) as BufferSource);
    return JSON.parse(dec.decode(claro)) as T;
  } catch {
    throw new Error("No se pudo descifrar: la clave no corresponde o el dato fue alterado.");
  }
}

/** Texto cifrado conocido: sirve para comprobar que la contrasena escrita en un PC es la correcta. */
export const crearVerificacion = (clave: CryptoKey): Promise<string> => cifrarJson(clave, { v: TEXTO_VERIFICACION });

export async function claveCorresponde(clave: CryptoKey, verificacion: string): Promise<boolean> {
  try {
    const r = await descifrarJson<{ v: string }>(clave, verificacion);
    return r.v === TEXTO_VERIFICACION;
  } catch {
    return false;
  }
}
