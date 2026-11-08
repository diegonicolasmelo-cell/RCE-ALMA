/**
 * Contenedor de servicios: base local, API, sincronizador y repositorio.
 * Se crea una sola vez al arrancar la app.
 */

import { BaseLocal, guardarMeta, leerMeta } from "./db";
import { crearApiHttp, crearApiLocal, crearApiRemota } from "./api";
import type { ClienteApi } from "./api";
import { combinarConfig, leerConfigEntorno, modoLocal, parsearHash } from "./config";
import type { ConexionDispositivo, ConfigApp } from "./config";
import { MENSAJE_SIN_CONFIGURAR, URL_APPS_SCRIPT, contextoAppsScript, googleScript, reemplazarHashExterno, transporteAppsScript } from "./gas";
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
  const db = gas?.demo ? new BaseLocal("upc-pulse-demo") : new BaseLocal();

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

  if (local) await sembrarSiVacia(db, repo);
  // En produccion ningun nombre se guarda en el disco: se borran restos de versiones anteriores.
  else await db.identidades.clear();
  return { db, api, sync, repo, config, local, tokenEstacion };
}
