/**
 * La app servida por Google Apps Script (HtmlService).
 *
 * Ahi la pagina corre dentro de un iframe de Google: no ve la barra de direcciones, y
 * habla con el servidor por `google.script.run` en vez de por la URL /exec. Este modulo
 * es lo unico que conoce esas diferencias; el resto de la app no cambia.
 *
 * Los enlaces de configuracion siguen siendo los mismos fragmentos (#config?a=..,
 * #estacion?t=..): el fragmento nunca viaja al servidor, la app lo lee de la barra de
 * afuera con `google.script.url.getLocation` y despues lo borra de ahi.
 */

import type { Transporte } from "./api";

type Obj = Record<string, unknown>;

interface Ejecutor {
  withSuccessHandler(f: (r: unknown) => void): Ejecutor;
  withFailureHandler(f: (e: unknown) => void): Ejecutor;
  rcePost(texto: string): void;
  rceGet(params: Record<string, string>): void;
}

export interface UbicacionExterna {
  readonly hash: string;
  readonly parametros: Readonly<Record<string, string>>;
}

interface GoogleScript {
  readonly run: Ejecutor;
  readonly url: { getLocation(cb: (l: { hash?: string; parameter?: Record<string, string> }) => void): void };
  readonly history: { replace(estado: unknown, params: Record<string, string> | null, hash: string): void };
}

/** El objeto `google.script` cuando la pagina la sirve Apps Script; si no, null. */
export function googleScript(): GoogleScript | null {
  const g = (globalThis as { google?: { script?: Partial<GoogleScript> } }).google;
  const s = g?.script;
  return s && s.run && s.url && s.history ? (s as GoogleScript) : null;
}

export const esAppsScript = (): boolean => googleScript() !== null;

/** Lo que el inicio de la pagina averiguo de la barra de direcciones de afuera. */
export interface ContextoAppsScript {
  /** `?demo=1`: la demostracion con pacientes inventados, sin tocar la hoja. */
  readonly demo: boolean;
  /** Los parametros de la URL de afuera, para conservarlos al limpiar el fragmento. */
  readonly parametros: Readonly<Record<string, string>>;
}

/** Marca de la conexion guardada cuando el servidor es el mismo Apps Script que sirve la pagina. */
export const URL_APPS_SCRIPT = "apps-script";

export const MENSAJE_SIN_CONFIGURAR =
  "Este equipo aún no está conectado a la unidad. Abre una vez el enlace de configuración que entrega coordinación " +
  "(la dirección de la aplicación terminada en #config?a=…). Para ver la demostración, agrega ?demo=1 a la dirección.";

let contexto: ContextoAppsScript | null = null;
export const contextoAppsScript = (): ContextoAppsScript | null => contexto;
export function fijarContextoAppsScript(c: ContextoAppsScript | null): void {
  contexto = c;
}

/** El fragmento y los parametros de la barra de direcciones de afuera del iframe. */
export function ubicacionExterna(gs: GoogleScript | null = googleScript()): Promise<UbicacionExterna> {
  return new Promise((resolver) => {
    if (!gs) return resolver({ hash: "", parametros: {} });
    try {
      gs.url.getLocation((l) => resolver({ hash: l.hash ?? "", parametros: l.parameter ?? {} }));
    } catch {
      resolver({ hash: "", parametros: {} });
    }
  });
}

/** Deja la barra de afuera sin los parametros secretos (el hash ya limpio, sin "#"). */
export function reemplazarHashExterno(hashLimpio: string, parametros: Readonly<Record<string, string>>, gs: GoogleScript | null = googleScript()): void {
  try {
    gs?.history.replace(null, { ...parametros }, hashLimpio.replace(/^#/, ""));
  } catch {
    // Sin consecuencias: los secretos ya quedaron guardados en este navegador.
  }
}

/** Peticiones al servidor por `google.script.run`. El servidor responde texto JSON. */
export function transporteAppsScript(gs: GoogleScript, timeoutMs = 30_000): Transporte {
  const llamar = (invocar: (e: Ejecutor) => void): Promise<Obj> =>
    new Promise((resolver) => {
      let listo = false;
      const terminar = (r: Obj): void => {
        if (listo) return;
        listo = true;
        clearTimeout(t);
        resolver(r);
      };
      const t = setTimeout(() => terminar({ ok: false, error: "SIN_CONEXION" }), timeoutMs);
      const ejecutor = gs.run
        .withSuccessHandler((r) => {
          try {
            const obj = typeof r === "string" ? (JSON.parse(r) as unknown) : r;
            terminar(typeof obj === "object" && obj !== null ? (obj as Obj) : { ok: false, error: "RESPUESTA_INVALIDA" });
          } catch {
            terminar({ ok: false, error: "RESPUESTA_INVALIDA" });
          }
        })
        .withFailureHandler(() => terminar({ ok: false, error: "SIN_CONEXION" }));
      invocar(ejecutor);
    });

  return {
    post: (cuerpo) => llamar((e) => e.rcePost(JSON.stringify(cuerpo))),
    get: (params) => llamar((e) => e.rceGet(params))
  };
}
