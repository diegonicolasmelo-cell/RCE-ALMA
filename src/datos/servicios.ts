/**
 * Contenedor de servicios: base local, API, sincronizador y repositorio.
 * Se crea una sola vez al arrancar la app.
 */

import { BaseLocal, guardarMeta, leerMeta } from "./db";
import { crearApiHttp, crearApiLocal } from "./api";
import type { ClienteApi } from "./api";
import { combinarConfig, leerConfigEntorno, modoLocal, parsearHash } from "./config";
import type { ConexionDispositivo, ConfigApp } from "./config";
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
  const db = new BaseLocal();

  // Llaves y conexion llegan en un enlace (#config?u=..&a=.. / #estacion?t=..), se guardan en
  // este navegador y se borran de la barra. No van en el codigo publicado.
  const h = parsearHash(window.location.hash);
  if (h.token) await guardarMeta(db, CLAVE_TOKEN_ESTACION, h.token);
  if (h.apiUrl && h.appToken) {
    const conexion: ConexionDispositivo = { apiUrl: h.apiUrl, appToken: h.appToken, ...(h.sinapseUrl ? { sinapseUrl: h.sinapseUrl } : {}) };
    await guardarMeta(db, CLAVE_CONEXION, conexion);
  }
  if (h.token || h.apiUrl || h.appToken || h.sinapseUrl) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${h.limpio}`);
  }

  const config = combinarConfig(leerConfigEntorno(), await leerMeta<ConexionDispositivo>(db, CLAVE_CONEXION));
  const local = modoLocal(config);
  const tokenEstacion = (await leerMeta<string>(db, CLAVE_TOKEN_ESTACION)) ?? null;

  const api: ClienteApi =
    !local && config.apiUrl && config.appToken
      ? crearApiHttp({ url: config.apiUrl, appToken: config.appToken, stationToken: tokenEstacion })
      : crearApiLocal();

  const sync = new Sincronizador(db, api);
  const repo = new Repositorio(db, sync);

  if (local) await sembrarSiVacia(db, repo);
  return { db, api, sync, repo, config, local, tokenEstacion };
}
