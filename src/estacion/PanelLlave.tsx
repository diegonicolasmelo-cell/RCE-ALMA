import { useEffect, useState } from "react";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { guardarMeta, leerMeta } from "../datos/db";
import type { ConexionDispositivo } from "../datos/config";
import { URL_APPS_SCRIPT } from "../datos/gas";
import { crearLlave, huellaDe } from "../datos/llaves";
import { CLAVE_CONEXION, CLAVE_TOKEN_ESTACION } from "../datos/servicios";
import { Aviso } from "../celular/componentes";
import { copiarTexto } from "./util";

const ERRORES: Record<string, string> = {
  REGISTRO_CERRADO: "El registro está cerrado. En el editor de Apps Script ejecuta «abrirRegistroLlaves» y vuelve a intentarlo dentro de 15 minutos.",
  SIN_CONEXION: "Sin conexión con el servidor."
};

/** Donde vive la PWA de los celulares (GitHub Pages). Se puede cambiar aqui mismo. */
export const SITIO_PWA = "https://diegonicolasmelo-cell.github.io/RCE-ALMA/";
const CLAVE_URL_EXEC = "urlExec";
const CLAVE_URL_SITIO = "urlSitio";

/** Enlace para un celular: la PWA con la direccion del servidor y la llave de la app. */
export function enlaceCelular(sitio: string, exec: string, app: string): string {
  return `${sitio.trim().replace(/#.*$/, "")}#config?u=${encodeURIComponent(exec.trim())}&a=${encodeURIComponent(app)}`;
}

/** Enlace para otro PC de la estacion: se agrega al final de la direccion /exec. */
export const enlacePc = (app: string, estacion: string): string => `#estacion?a=${encodeURIComponent(app)}&t=${encodeURIComponent(estacion)}`;

/**
 * Llaves de la unidad. Las crea ESTE PC y a Google viajan solo sus huellas: si se pierden en
 * todos los equipos no se recuperan, se crean nuevas y se reconectan los equipos.
 */
export function PanelLlave() {
  const { api, db, local, tokenEstacion, config } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [estacion, setEstacion] = useState<string | null>(tokenEstacion);
  const [app, setApp] = useState<string | null>(config.appToken);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [exec, setExec] = useState(config.apiUrl && config.apiUrl !== URL_APPS_SCRIPT ? config.apiUrl : "");
  const [sitio, setSitio] = useState(SITIO_PWA);

  useEffect(() => {
    void leerMeta<string>(db, CLAVE_URL_EXEC).then((v) => v && setExec(v));
    void leerMeta<string>(db, CLAVE_URL_SITIO).then((v) => v && setSitio(v));
  }, [db]);
  if (local) return null;

  const registrar = async (nuevaApp: boolean, nuevaEstacion: boolean): Promise<void> => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const a = nuevaApp ? crearLlave() : null;
    const e = nuevaEstacion ? crearLlave() : null;
    const r = await api.registrarLlaves({ ...(a ? { huellaApp: await huellaDe(a) } : {}), ...(e ? { huellaEstacion: await huellaDe(e) } : {}) });
    setOcupado(false);
    setConfirmar(false);
    if (!r.ok) return setError(ERRORES[r.error ?? ""] ?? `No se pudo registrar la llave (${r.error ?? "error"}).`);
    if (e) {
      await guardarMeta(db, CLAVE_TOKEN_ESTACION, e);
      setEstacion(e);
    }
    if (a) {
      const previa = await leerMeta<ConexionDispositivo>(db, CLAVE_CONEXION);
      await guardarMeta(db, CLAVE_CONEXION, { ...previa, apiUrl: previa?.apiUrl ?? config.apiUrl ?? URL_APPS_SCRIPT, appToken: a } satisfies ConexionDispositivo);
      setApp(a);
    }
    setAviso(
      a
        ? "Llaves nuevas guardadas en este PC; Google guardó solo sus huellas. Los celulares y los otros PC quedaron desconectados: entrégales los enlaces nuevos. Recarga la página."
        : "Llave de estación creada y guardada en este PC. Google guardó solo su huella. Recarga la página."
    );
  };

  const copiar = (texto: string, nota: string): void => void copiarTexto(texto).then((ok) => avisar(ok ? nota : "No se pudo copiar."));
  const guardarUrl = (clave: string, v: string): void => void guardarMeta(db, clave, v.trim());
  const execValida = /^https:\/\/script\.google\.com\/.+\/exec$/.test(exec.trim());

  return (
    <div className="card stack" aria-label="Llaves de la unidad">
      <h2>Llaves de la unidad</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Hay dos: la <b>de la app</b> (celulares y PC) y la <b>de estación</b> (solo los PC, para nombres y RUT). Las crea este PC y a Google viajan solo sus huellas, que no sirven para entrar. Si se pierden en todos los equipos, no se recuperan: se crean nuevas y se reconectan los equipos.
      </p>

      {!estacion && (
        <>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>En el editor de Apps Script, ejecuta <b>abrirRegistroLlaves</b> (queda abierto 15 minutos).</li>
            <li>Aquí, pulsa «Crear llave de estación».</li>
          </ol>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void registrar(false, true)}>{ocupado ? "Creando…" : "Crear llave de estación"}</button>
        </>
      )}
      {error && <Aviso tipo="crit" pequeno>{error}</Aviso>}
      {aviso && (
        <Aviso tipo="good" pequeno>
          {aviso} <button type="button" className="btn sm" onClick={() => window.location.reload()}>Recargar</button>
        </Aviso>
      )}

      {app && estacion && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Otro PC de la estación</h3>
          <div className="small">
            Abre en él la dirección de la app (la terminada en /exec) agregando al final:
            <div className="mono" style={{ wordBreak: "break-all", marginTop: 4 }}>{enlacePc(app, estacion)}</div>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => copiar(enlacePc(app, estacion), "Enlace copiado. Ábrelo solo en los PC de la estación, nunca en un celular.")}>Copiar enlace para otro PC</button>
          </div>
        </div>
      )}

      {app && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Celulares</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Los celulares usan la app instalable publicada en GitHub Pages y guardan en la misma hoja. Su enlace lleva solo la llave de la app, nunca la de estación.
          </p>
          <label className="small">
            Dirección de la app en Apps Script (la terminada en /exec)
            <input type="url" value={exec} placeholder="https://script.google.com/macros/s/…/exec" onChange={(e) => setExec(e.target.value)} onBlur={(e) => guardarUrl(CLAVE_URL_EXEC, e.target.value)} />
          </label>
          <label className="small">
            Dirección de la app instalable
            <input type="url" value={sitio} onChange={(e) => setSitio(e.target.value)} onBlur={(e) => guardarUrl(CLAVE_URL_SITIO, e.target.value)} />
          </label>
          {execValida ? (
            <>
              <div className="mono small" style={{ wordBreak: "break-all" }}>{enlaceCelular(sitio, exec, app)}</div>
              <div className="row">
                <button type="button" className="btn sm" onClick={() => copiar(enlaceCelular(sitio, exec, app), "Enlace copiado. Envíalo por un canal privado y bórralo después de abrirlo.")}>Copiar enlace para celulares</button>
              </div>
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>Pega la dirección /exec para armar el enlace.</p>
          )}
        </div>
      )}

      {app && estacion && (
        <div className="stack">
          {!confirmar ? (
            <button type="button" className="btn sm" onClick={() => setConfirmar(true)}>Crear llaves nuevas…</button>
          ) : (
            <Aviso tipo="warn" pequeno>
              Úsalo solo si una llave se filtró o se perdió. Todos los celulares y los otros PC quedarán desconectados hasta que abran los enlaces nuevos. Antes, ejecuta <b>abrirRegistroLlaves</b> en el editor.
              <div className="row" style={{ marginTop: 6 }}>
                <button type="button" className="btn sm primary" disabled={ocupado} onClick={() => void registrar(true, true)}>{ocupado ? "Creando…" : "Sí, crear llaves nuevas"}</button>
                <button type="button" className="btn sm" onClick={() => setConfirmar(false)}>Cancelar</button>
              </div>
            </Aviso>
          )}
        </div>
      )}
    </div>
  );
}
