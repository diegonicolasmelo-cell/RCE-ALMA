/**
 * Entrar con huella en el celular (opcion A, decidida por Diego el 10-nov-2026).
 *
 * La primera vez se entra con correo y contrasena, que el servidor comprueba. Despues, si la
 * persona lo acepta, el telefono crea una «llave de acceso» (WebAuthn, autenticador del propio
 * equipo con verificacion del usuario: huella, cara o PIN de pantalla). Desde ahi, cuando la
 * sesion vence, basta la huella para abrirla en ESE celular.
 *
 * - La huella nunca sale del telefono: ni la app ni Google la ven. El telefono solo confirma
 *   que la verifico.
 * - Es un candado de este equipo, no un ingreso nuevo ante el servidor: la contrasena ya se
 *   comprobo una vez. Google no cambia.
 * - Queda amarrada a la persona: el boton dice de quien es, y solo abre la sesion de ella.
 * - Si la persona sale de la hoja «usuarios», su huella deja de abrir.
 */

import { leerMeta, guardarMeta } from "../datos/db";
import type { BaseLocal } from "../datos/db";
import { esAppsScript } from "../datos/gas";

export const CLAVE_HUELLAS = "huellas";

export interface HuellaGuardada {
  readonly correo: string;
  /** Identificador de la llave de acceso (base64url). No es la huella. */
  readonly credencial: string;
  readonly creadaEn: string;
}

const b64u = (b: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const desdeB64u = (t: string): Uint8Array => {
  const s = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const azar = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/** Si este equipo puede usar huella: navegador con WebAuthn y lector propio, fuera de Apps Script. */
export async function huellaDisponible(): Promise<boolean> {
  try {
    if (esAppsScript() || !window.isSecureContext || typeof PublicKeyCredential === "undefined") return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function leerHuellas(db: BaseLocal): Promise<readonly HuellaGuardada[]> {
  return (await leerMeta<HuellaGuardada[]>(db, CLAVE_HUELLAS)) ?? [];
}

export async function olvidarHuella(db: BaseLocal, correo: string): Promise<void> {
  const resto = (await leerHuellas(db)).filter((h) => h.correo !== correo);
  await guardarMeta(db, CLAVE_HUELLAS, resto);
}

/** Crea la llave de acceso de esta persona en este telefono. Pide la huella. */
export async function activarHuella(db: BaseLocal, correo: string, nombre: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: azar(32),
        rp: { name: "Kapta CSV" },
        // Identificador al azar: no lleva el correo ni ningun dato de la persona.
        user: { id: azar(16), name: correo, displayName: nombre },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        attestation: "none",
        timeout: 60_000
      }
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "CANCELADO" };
    const nueva: HuellaGuardada = { correo, credencial: b64u(cred.rawId), creadaEn: new Date().toISOString() };
    const resto = (await leerHuellas(db)).filter((h) => h.correo !== correo);
    await guardarMeta(db, CLAVE_HUELLAS, [...resto, nueva]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof DOMException && e.name === "NotAllowedError" ? "CANCELADO" : "NO_SE_PUDO" };
  }
}

/**
 * Pide la huella para la llave de esta persona. Solo es valida si el telefono confirma que
 * VERIFICO al usuario (bandera UV de los datos del autenticador), no basta con tocar.
 */
export async function verificarHuella(h: HuellaGuardada): Promise<{ ok: boolean; error?: string }> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: azar(32),
        allowCredentials: [{ type: "public-key", id: desdeB64u(h.credencial) }],
        userVerification: "required",
        timeout: 60_000
      }
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "CANCELADO" };
    if (b64u(cred.rawId) !== h.credencial) return { ok: false, error: "OTRA_LLAVE" };
    const datos = new Uint8Array((cred.response as AuthenticatorAssertionResponse).authenticatorData);
    const verificado = datos.length > 32 && (datos[32]! & 0x04) !== 0;
    return verificado ? { ok: true } : { ok: false, error: "SIN_VERIFICAR" };
  } catch (e) {
    return { ok: false, error: e instanceof DOMException && e.name === "NotAllowedError" ? "CANCELADO" : "NO_SE_PUDO" };
  }
}
