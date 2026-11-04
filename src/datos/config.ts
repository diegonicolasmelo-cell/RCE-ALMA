/**
 * Configuracion de la app.
 *
 * El token de estacion NO va en el build ni en el repositorio: llega en un
 * marcador (`#estacion?t=<TOKEN>`), se guarda en el navegador de ese PC y se
 * borra de la barra de direcciones. El fragmento (#...) nunca viaja al servidor.
 */

export interface ConfigApp {
  readonly apiUrl: string | null;
  readonly appToken: string | null;
  readonly sinapseUrl: string;
}

export function leerConfigEntorno(env: ImportMetaEnv = import.meta.env): ConfigApp {
  const limpio = (v: string | undefined): string | null => (v && v.trim() !== "" ? v.trim() : null);
  return {
    apiUrl: limpio(env.VITE_API_URL),
    appToken: limpio(env.VITE_APP_TOKEN),
    sinapseUrl: limpio(env.VITE_SINAPSE_URL) ?? ""
  };
}

export const modoLocal = (c: ConfigApp): boolean => c.apiUrl === null || c.appToken === null;

export interface HashParseado {
  /** Ruta sin parametros, p. ej. "estacion". */
  readonly ruta: string;
  /** Llave de estacion (t). */
  readonly token: string | null;
  /** URL del web app de Apps Script (u). */
  readonly apiUrl: string | null;
  /** Token de aplicacion (a). */
  readonly appToken: string | null;
  /** URL de la plantilla de Sinapse (s). */
  readonly sinapseUrl: string | null;
  /** El mismo hash sin ninguno de los parametros secretos, para dejar en la barra de direcciones. */
  readonly limpio: string;
}

const PARAMETROS_SECRETOS = ["t", "u", "a", "s"] as const;

/**
 * "#estacion?t=ABC" -> { ruta: "estacion", token: "ABC", limpio: "#estacion" }.
 * "#config?u=<url>&a=<token>" configura la conexion de un dispositivo.
 *
 * Los parametros viajan en el fragmento (#...), que el navegador nunca envia al
 * servidor, y se borran de la barra de direcciones apenas se guardan.
 */
export function parsearHash(hash: string): HashParseado {
  const sinNumeral = hash.startsWith("#") ? hash.slice(1) : hash;
  const [ruta = "", consulta = ""] = sinNumeral.split("?");
  const params = new URLSearchParams(consulta);
  const tokenDirecto = ruta.startsWith("t=") ? ruta.slice(2) : null;
  const leer = (k: string): string | null => {
    const v = params.get(k);
    return v !== null && v !== "" ? v : null;
  };
  const resultado = {
    ruta: ruta.startsWith("t=") ? "" : ruta,
    token: leer("t") ?? tokenDirecto,
    apiUrl: leer("u"),
    appToken: leer("a"),
    sinapseUrl: leer("s")
  };
  for (const k of PARAMETROS_SECRETOS) params.delete(k);
  const resto = params.toString();
  const limpio = `#${resultado.ruta}${resto ? `?${resto}` : ""}`;
  return { ...resultado, limpio: limpio === "#" || limpio === "#config" ? "" : limpio };
}

/** Conexion guardada en el dispositivo (no viaja en el codigo publicado). */
export interface ConexionDispositivo {
  readonly apiUrl: string;
  readonly appToken: string;
  readonly sinapseUrl?: string;
}

/** La conexion del dispositivo manda sobre la del build; el build sirve para despliegues privados. */
export function combinarConfig(entorno: ConfigApp, dispositivo: ConexionDispositivo | undefined): ConfigApp {
  return {
    apiUrl: dispositivo?.apiUrl ?? entorno.apiUrl,
    appToken: dispositivo?.appToken ?? entorno.appToken,
    sinapseUrl: dispositivo?.sinapseUrl ?? entorno.sinapseUrl
  };
}
