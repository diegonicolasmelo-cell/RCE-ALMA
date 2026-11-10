/**
 * Contenedor de servicios: base local, API, sincronizador y repositorio.
 * Se crea una sola vez al arrancar la app.
 */

import { DOTACION_DEMO, fijarDotacion } from "@core/index";
import { BaseLocal, guardarMeta, leerMeta } from "./db";
import { crearApiHttp, crearApiLocal, crearApiRemota, registrarLlavesPor } from "./api";
import type { ClienteApi } from "./api";
import { combinarConfig, leerConfigEntorno, modoLocal, parsearHash } from "./config";
import type { ConexionDispositivo, ConfigApp } from "./config";
import { crearLlave, huellaDe } from "./llaves";
import { MENSAJE_SIN_CONFIGURAR, MENSAJE_SIN_CONFIGURAR_PWA, URL_APPS_SCRIPT, contextoAppsScript, googleScript, reemplazarHashExterno, transporteAppsScript } from "./gas";
import { Repositorio } from "./repositorio";
import { sembrarSiVacia } from "./semilla";
import { Sincronizador } from "./sync";

export interface Servicios {
  readonly db: BaseLocal;
  readonly api: ClienteApi;
  readonly sync: Sincronizador;
  readonly repo: Repositorio;
  readonly config: ConfigApp;
  readonly local: boolean;
  /** Presente solo en los PC que entraron con el marcador de estacion. */
  readonly tokenEstacion: string | null;
}

export const CLAVE_TOKEN_ESTACION = "tokenEstacion";
export const CLAVE_CONEXION = "conexion";
export const CLAVE_DOTACION = "dotacion";
let instancia: Promise<Servicios> | null = null;

export function iniciarServicios(): Promise<Servicios> {
  instancia ??= crear();
  return instancia;
}

async function crear(): Promise<Servicios> {
  // Servida por Apps Script: el servidor es el mismo proyecto y se le habla por google.script.run.
  const gas = contextoAppsScript();
  const gs = gas ? googleScript() : null;
  // La demostracion usa otra base local: sus pacientes inventados nunca se mezclan con los reales.
  const db = gas?.demo || (!gas && import.meta.env.VITE_EXIGIR_CONFIG === "1" && demoPedida()) ? new BaseLocal("upc-pulse-demo") : new BaseLocal();

  // Llaves y conexion llegan en un enlace (#config?u=..&a=.. / #estacion?t=..), se guardan en
  // este navegador y se borran de la barra. No van en el codigo publicado.
  const h = parsearHash(window.location.hash);
  if (h.token) await guardarMeta(db, CLAVE_TOKEN_ESTACION, h.token);
  const apiUrlEnlace = gs ? URL_APPS_SCRIPT : h.apiUrl;
  if (apiUrlEnlace && h.appToken) {
    const conexion: ConexionDispositivo = { apiUrl: apiUrlEnlace, appToken: h.appToken, ...(h.sinapseUrl ? { sinapseUrl: h.sinapseUrl } : {}) };
    await guardarMeta(db, CLAVE_CONEXION, conexion);
  }
  if (h.token || h.apiUrl || h.appToken || h.sinapseUrl) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${h.limpio}`);
    // Tambien en la barra de afuera del iframe, que es la que ve la persona.
    if (gs && gas) reemplazarHashExterno(h.limpio, gas.parametros, gs);
  }

  const guardada = await leerMeta<ConexionDispositivo>(db, CLAVE_CONEXION);
  const config = gs
    ? { apiUrl: URL_APPS_SCRIPT, appToken: guardada?.appToken ?? null, sinapseUrl: guardada?.sinapseUrl ?? leerConfigEntorno().sinapseUrl }
    : combinarConfig(leerConfigEntorno(), guardada);
  const local = gas ? gas.demo : modoLocal(config);
  if (gs && !local && !config.appToken) throw new Error(MENSAJE_SIN_CONFIGURAR);
  // La PWA publicada no cae sola en la demostracion: sin enlace de configuracion lo dice.
  if (!gs && local && import.meta.env.VITE_EXIGIR_CONFIG === "1" && !demoPedida()) throw new Error(MENSAJE_SIN_CONFIGURAR_PWA);
  const tokenEstacion = (await leerMeta<string>(db, CLAVE_TOKEN_ESTACION)) ?? null;

  const api: ClienteApi = local
    ? crearApiLocal()
    : gs && config.appToken
      ? crearApiRemota(transporteAppsScript(gs), { appToken: config.appToken, stationToken: tokenEstacion })
      : config.apiUrl && config.appToken
        ? crearApiHttp({ url: config.apiUrl, appToken: config.appToken, stationToken: tokenEstacion })
        : crearApiLocal();

  const sync = new Sincronizador(db, api);
  const repo = new Repositorio(db, sync);

  if (local) fijarDotacion(DOTACION_DEMO);
  else await cargarDotacion(db, api);

  if (local) await sembrarSiVacia(db, repo);
  // En produccion ningun nombre se guarda en el disco: se borran restos de versiones anteriores.
  else await db.identidades.clear();
  return { db, api, sync, repo, config, local, tokenEstacion };
}

const demoPedida = (): boolean => new URLSearchParams(window.location.search).get("demo") === "1";

/**
 * Primer PC de la unidad, en la app servida por Apps Script: crea aqui la llave de la app y la
 * de estacion, registra en Google solo sus huellas (con el registro abierto desde el editor) y
 * las deja guardadas en este navegador. Despues hay que recargar.
 */
export async function configurarPrimerPc(): Promise<{ ok: boolean; error?: string }> {
  const gs = googleScript();
  if (!gs) return { ok: false, error: "SOLO_APPS_SCRIPT" };
  const app = crearLlave();
  const estacion = crearLlave();
  const r = await registrarLlavesPor(transporteAppsScript(gs), { huellaApp: await huellaDe(app), huellaEstacion: await huellaDe(estacion) });
  if (!r.ok) return r;
  const db = new BaseLocal();
  await guardarMeta(db, CLAVE_CONEXION, { apiUrl: URL_APPS_SCRIPT, appToken: app } satisfies ConexionDispositivo);
  await guardarMeta(db, CLAVE_TOKEN_ESTACION, estacion);
  db.close();
  return { ok: true };
}

/**
 * La dotacion vive en la hoja «usuarios». Se usa la guardada en el equipo (sirve sin senal) y
 * se refresca desde el servidor; si el equipo aun no tiene ninguna, se espera la respuesta.
 */
async function cargarDotacion(db: BaseLocal, api: ClienteApi): Promise<void> {
  const guardada = await leerMeta<unknown[]>(db, CLAVE_DOTACION);
  fijarDotacion(guardada ?? []);
  const refrescar = refrescarDotacion(db, api);
  if (!guardada) await refrescar;
}

/** Pide la dotacion al servidor y la deja vigente y guardada. Devuelve si lo logro. */
export async function refrescarDotacion(db: BaseLocal, api: ClienteApi): Promise<boolean> {
  const r = await api.leerDotacion();
  if (!r.ok) return false;
  const lista = fijarDotacion(r.dotacion);
  await guardarMeta(db, CLAVE_DOTACION, lista);
  return true;
}
