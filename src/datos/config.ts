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
  readonly token: string | null;
  /** El mismo hash sin el token, para dejar en la barra de direcciones. */
  readonly sinToken: string;
}

/** "#estacion?t=ABC" -> { ruta: "estacion", token: "ABC", sinToken: "#estacion" }. */
export function parsearHash(hash: string): HashParseado {
  const sinNumeral = hash.startsWith("#") ? hash.slice(1) : hash;
  const [ruta = "", consulta = ""] = sinNumeral.split("?");
  const params = new URLSearchParams(consulta);
  const token = params.get("t");
  params.delete("t");
  const resto = params.toString();
  const rutaLimpia = ruta.startsWith("t=") ? "" : ruta;
  const sinToken = `#${rutaLimpia}${resto ? `?${resto}` : ""}`;
  const tokenDirecto = ruta.startsWith("t=") ? ruta.slice(2) : null;
  return { ruta: rutaLimpia, token: token ?? tokenDirecto, sinToken: sinToken === "#" ? "" : sinToken };
}
