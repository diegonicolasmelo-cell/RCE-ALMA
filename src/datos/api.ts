/**
 * Cliente de la API (Google Apps Script sobre Sheets).
 *
 * Dos canales con dos llaves: el clinico (APP_TOKEN, celulares y PC) y el de
 * identidad (STATION_TOKEN, solo PC). Ver backend/apps-script y docs/PLAN-MAESTRO.md.
 *
 * Apps Script no responde al preflight CORS (OPTIONS). Por eso los POST van con
 * `Content-Type: text/plain`, que el navegador trata como "solicitud simple".
 */

import { DOTACION_DEMO, buscarProfesional } from "@core/index";
import type { ReferenciaNube } from "@core/index";

export interface LoteSync {
  episodios: Record<string, unknown>[];
  controles: Record<string, unknown>[];
  eventos: Record<string, unknown>[];
  apk: Record<string, unknown>[];
}

export type RespuestaSync =
  | { readonly ok: true; readonly servidorEn: string }
  | { readonly ok: false; readonly error: string; readonly llaves?: readonly string[] };

export interface DatosNube {
  readonly episodios: readonly unknown[];
  readonly controles: readonly unknown[];
  readonly eventos: readonly unknown[];
  readonly apk: readonly unknown[];
  readonly servidorEn: string;
}

export type ResultadoLogin =
  | { readonly ok: true; readonly correo: string }
  | { readonly ok: false; readonly error: string };

export type Resultado<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };

export interface ClienteApi {
  /** Si no hay servidor (modo demostracion), los datos viven solo en el dispositivo. */
  readonly local: boolean;
  /** El profesional se identifica por su correo; la contrasena se compara en el servidor. */
  login(correo: string, pin: string): Promise<ResultadoLogin>;
  definirPin(correo: string, pinActual: string, pinNuevo: string): Promise<{ ok: boolean; error?: string }>;
  /** La dotacion de la hoja «usuarios» (correo, nombre, turno, rol), sin claves. */
  leerDotacion(): Promise<Resultado<{ dotacion: readonly unknown[] }>>;
  sincronizar(lote: LoteSync): Promise<RespuestaSync>;
  leer(desde: string | null): Promise<Resultado<{ datos: DatosNube }>>;
  /**
   * Referencias de episodio (identidad CIFRADA): solo con token de estacion. La nube
   * guarda un bloque ilegible por episodio; el descifrado ocurre en el navegador.
   */
  leerReferencias(): Promise<Resultado<{ referencias: readonly ReferenciaNube[] }>>;
  guardarReferencias(referencias: readonly ReferenciaNube[]): Promise<{ ok: boolean; error?: string }>;
  purgarReferencias(episodioIds: readonly string[]): Promise<{ ok: boolean; error?: string }>;
  /** Registra las huellas de las llaves que creo este PC (con el registro abierto en el editor). */
  registrarLlaves(huellas: HuellasLlaves): Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export interface ConfigHttp {
  readonly url: string;
  readonly appToken: string;
  readonly stationToken: string | null;
  readonly timeoutMs?: number;
}

type Obj = Record<string, unknown>;

/**
 * Como llegan las peticiones al servidor. Por HTTP (la app servida desde otro sitio) o por
 * `google.script.run` (la app servida por el mismo Apps Script). Las reglas son las mismas.
 */
export interface Transporte {
  post(cuerpo: Obj): Promise<Obj>;
  get(params: Record<string, string>): Promise<Obj>;
}

export function crearApiHttp(cfg: ConfigHttp, fetchImpl: typeof fetch = fetch): ClienteApi {
  const timeoutMs = cfg.timeoutMs ?? 20_000;

  async function pedir(init: () => Promise<Response>): Promise<Obj> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await init();
      return (await res.json()) as Obj;
    } catch {
      return { ok: false, error: "SIN_CONEXION" };
    } finally {
      clearTimeout(t);
    }
  }

  const post = (cuerpo: Obj): Promise<Obj> =>
    pedir(() =>
      fetchImpl(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(cuerpo),
        redirect: "follow"
      })
    );

  const get = (params: Record<string, string>): Promise<Obj> =>
    pedir(() => fetchImpl(`${cfg.url}?${new URLSearchParams(params).toString()}`, { redirect: "follow" }));

  return crearApiRemota({ post, get }, cfg);
}

export interface HuellasLlaves {
  readonly huellaApp?: string;
  readonly huellaEstacion?: string;
}

/**
 * Registro de llaves: no lleva token, porque el primer PC aun no tiene ninguna. El servidor lo
 * acepta solo mientras el registro esta abierto desde el editor (15 minutos).
 */
export async function registrarLlavesPor(t: Transporte, huellas: HuellasLlaves): Promise<{ ok: boolean; error?: string }> {
  const r = await t.post({ accion: "registrarLlaves", ...huellas });
  return r["ok"] === true ? { ok: true } : { ok: false, error: typeof r["error"] === "string" ? (r["error"] as string) : "ERROR_DESCONOCIDO" };
}

/** El cliente de la API sobre cualquier transporte. Los tokens viajan en cada peticion. */
export function crearApiRemota(t: Transporte, cfg: { readonly appToken: string; readonly stationToken: string | null }): ClienteApi {
  const { post, get } = t;
  const errorDe = (r: Obj): string => (typeof r["error"] === "string" ? (r["error"] as string) : "ERROR_DESCONOCIDO");

  return {
    local: false,

    async login(correo, pin) {
      const r = await post({ token: cfg.appToken, accion: "login", correo, pin });
      return r["ok"] === true ? { ok: true, correo: String(r["correo"] ?? correo) } : { ok: false, error: errorDe(r) };
    },

    async definirPin(correo, pinActual, pinNuevo) {
      const r = await post({ token: cfg.appToken, accion: "definirPin", correo, pinActual, pinNuevo });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async leerDotacion() {
      const r = await get({ token: cfg.appToken, recurso: "dotacion" });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      // Un Codigo.gs anterior no conoce este recurso y responde otra cosa: no es una lista vacia.
      if (!Array.isArray(r["dotacion"])) return { ok: false, error: "SERVIDOR_SIN_DOTACION" };
      return { ok: true, dotacion: r["dotacion"] as unknown[] };
    },

    async registrarLlaves(huellas) {
      return registrarLlavesPor(t, huellas);
    },

    async sincronizar(lote) {
      const r = await post({ token: cfg.appToken, accion: "sincronizar", ...lote });
      if (r["ok"] === true) return { ok: true, servidorEn: String(r["servidorEn"] ?? "") };
      const llaves = Array.isArray(r["llaves"]) ? (r["llaves"] as string[]) : undefined;
      return llaves ? { ok: false, error: errorDe(r), llaves } : { ok: false, error: errorDe(r) };
    },

    async leer(desde) {
      const r = await get({ token: cfg.appToken, ...(desde ? { desde } : {}) });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const arr = (k: string): readonly unknown[] => (Array.isArray(r[k]) ? (r[k] as unknown[]) : []);
      return {
        ok: true,
        datos: {
          episodios: arr("episodios"),
          controles: arr("controles"),
          eventos: arr("eventos"),
          apk: arr("apk"),
          servidorEn: String(r["servidorEn"] ?? "")
        }
      };
    },

    async leerReferencias() {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await get({ recurso: "referencia", token: cfg.stationToken });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const filas = Array.isArray(r["referencias"]) ? (r["referencias"] as Obj[]) : [];
      const referencias = filas
        .filter((f) => typeof f["episodioId"] === "string" && typeof f["dato"] === "string")
        .map((f): ReferenciaNube => ({
          episodioId: String(f["episodioId"]),
          registradoEn: typeof f["registradoEn"] === "string" ? f["registradoEn"] : "",
          dato: String(f["dato"])
        }));
      return { ok: true, referencias };
    },

    async guardarReferencias(referencias) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "guardarReferencia", referencias });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async purgarReferencias(episodioIds) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "purgarReferencia", episodioIds });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    }
  };
}

// ---------------------------------------------------------------------------
// Local (modo demostracion): sin servidor, todo queda en el dispositivo
// ---------------------------------------------------------------------------

/** PIN de la demostracion. En produccion cada profesional define el suyo. */
export const PIN_DEMO = "Kine";

export function crearApiLocal(): ClienteApi {
  const referencias = new Map<string, ReferenciaNube>();
  return {
    local: true,
    async login(correo, pin) {
      if (!buscarProfesional(correo)) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };
      return pin.trim().toLowerCase() === PIN_DEMO.toLowerCase() ? { ok: true, correo } : { ok: false, error: "PIN_INCORRECTO" };
    },
    async definirPin() {
      return { ok: true };
    },
    async leerDotacion() {
      return { ok: true, dotacion: DOTACION_DEMO };
    },
    async sincronizar() {
      // Sin servidor: dar por subido. Los datos ya estan en IndexedDB.
      return { ok: true, servidorEn: new Date().toISOString() };
    },
    async leer() {
      return { ok: true, datos: { episodios: [], controles: [], eventos: [], apk: [], servidorEn: new Date().toISOString() } };
    },
    async leerReferencias() {
      return { ok: true, referencias: [...referencias.values()] };
    },
    async guardarReferencias(lista) {
      for (const r of lista) referencias.set(r.episodioId, r);
      return { ok: true };
    },
    async purgarReferencias(ids) {
      for (const id of ids) referencias.delete(id);
      return { ok: true };
    },
    async registrarLlaves() {
      return { ok: true };
    }
  };
}

