/**
 * Cliente de la API (Google Apps Script sobre Sheets).
 *
 * Dos canales con dos llaves: el clinico (APP_TOKEN, celulares y PC) y el de
 * identidad (STATION_TOKEN, solo PC). Ver backend/apps-script y docs/PLAN-MAESTRO.md.
 *
 * Apps Script no responde al preflight CORS (OPTIONS). Por eso los POST van con
 * `Content-Type: text/plain`, que el navegador trata como "solicitud simple".
 */

import { DOTACION, buscarProfesional, serializarIdentidadParaNube } from "@core/index";
import type { IdentidadPaciente } from "@core/index";

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
  | { readonly ok: true; readonly rut: string }
  | { readonly ok: false; readonly error: string };

export type Resultado<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };

export interface ClienteApi {
  /** Si no hay servidor (modo demostracion), los datos viven solo en el dispositivo. */
  readonly local: boolean;
  login(rut: string, pin: string): Promise<ResultadoLogin>;
  definirPin(rut: string, pinActual: string, pinNuevo: string): Promise<{ ok: boolean; error?: string }>;
  sincronizar(lote: LoteSync): Promise<RespuestaSync>;
  leer(desde: string | null): Promise<Resultado<{ datos: DatosNube }>>;
  /** Canal de identidad: solo con token de estacion. */
  leerIdentidades(): Promise<Resultado<{ identidades: readonly IdentidadPaciente[] }>>;
  guardarIdentidades(identidades: readonly IdentidadPaciente[]): Promise<{ ok: boolean; error?: string }>;
  purgarIdentidades(episodioIds: readonly string[]): Promise<{ ok: boolean; error?: string }>;
  /** Canal de identidad: archiva la hoja APK digitalizada (HTML + PDF) en la carpeta de Drive. */
  guardarDocumentoApk(nombre: string, html: string): Promise<{ ok: boolean; error?: string }>;
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

  const errorDe = (r: Obj): string => (typeof r["error"] === "string" ? (r["error"] as string) : "ERROR_DESCONOCIDO");

  return {
    local: false,

    async login(rut, pin) {
      const r = await post({ token: cfg.appToken, accion: "login", rut, pin });
      return r["ok"] === true ? { ok: true, rut: String(r["rut"] ?? rut) } : { ok: false, error: errorDe(r) };
    },

    async definirPin(rut, pinActual, pinNuevo) {
      const r = await post({ token: cfg.appToken, accion: "definirPin", rut, pinActual, pinNuevo });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
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

    async leerIdentidades() {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await get({ recurso: "identidad", token: cfg.stationToken });
      if (r["ok"] !== true) return { ok: false, error: errorDe(r) };
      const filas = Array.isArray(r["identidades"]) ? (r["identidades"] as Obj[]) : [];
      const identidades = filas
        .filter((f) => typeof f["episodioId"] === "string" && typeof f["nombre"] === "string")
        .map((f): IdentidadPaciente => ({
          episodioId: String(f["episodioId"]),
          nombre: String(f["nombre"]),
          rut: typeof f["rut"] === "string" ? f["rut"] : null,
          ficha: typeof f["ficha"] === "string" ? f["ficha"] : null
        }));
      return { ok: true, identidades };
    },

    async guardarIdentidades(identidades) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const ahora = new Date();
      const r = await post({
        token: cfg.stationToken,
        accion: "guardarIdentidad",
        identidades: identidades.map((i) => serializarIdentidadParaNube(i, ahora))
      });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async purgarIdentidades(episodioIds) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "purgarIdentidad", episodioIds });
      return r["ok"] === true ? { ok: true } : { ok: false, error: errorDe(r) };
    },

    async guardarDocumentoApk(nombre, html) {
      if (!cfg.stationToken) return { ok: false, error: "SIN_TOKEN_ESTACION" };
      const r = await post({ token: cfg.stationToken, accion: "guardarDocumentoApk", nombre, html });
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
  const identidades = new Map<string, IdentidadPaciente>();
  return {
    local: true,
    async login(rut, pin) {
      if (!buscarProfesional(rut)) return { ok: false, error: "USUARIO_NO_ENCONTRADO" };
      return pin.trim().toLowerCase() === PIN_DEMO.toLowerCase() ? { ok: true, rut } : { ok: false, error: "PIN_INCORRECTO" };
    },
    async definirPin() {
      return { ok: true };
    },
    async sincronizar() {
      // Sin servidor: dar por subido. Los datos ya estan en IndexedDB.
      return { ok: true, servidorEn: new Date().toISOString() };
    },
    async leer() {
      return { ok: true, datos: { episodios: [], controles: [], eventos: [], apk: [], servidorEn: new Date().toISOString() } };
    },
    async leerIdentidades() {
      return { ok: true, identidades: [...identidades.values()] };
    },
    async guardarIdentidades(lista) {
      for (const i of lista) identidades.set(i.episodioId, i);
      return { ok: true };
    },
    async purgarIdentidades(ids) {
      for (const id of ids) identidades.delete(id);
      return { ok: true };
    },
    async guardarDocumentoApk() {
      // Sin servidor no hay carpeta: el documento se descarga desde el PC.
      return { ok: true };
    }
  };
}

/** Lista de RUT validos para el login de demostracion. */
export const RUT_DEMO: readonly string[] = DOTACION.map((p) => p.rut);
