import { useState } from "react";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { guardarMeta } from "../datos/db";
import { CLAVE_TOKEN_ESTACION } from "../datos/servicios";
import { Aviso } from "../celular/componentes";
import { copiarTexto } from "./util";
import { crearLlave, huellaDe } from "./llaveEstacion";

const ERRORES: Record<string, string> = {
  REGISTRO_CERRADO: "El registro está cerrado. En el editor de Apps Script ejecuta «abrirRegistroEstacion» y vuelve a intentarlo dentro de 15 minutos.",
  TOKEN_INVALIDO: "Este PC no está conectado a la unidad: abre primero su enlace de configuración (#config?a=…).",
  SIN_CONEXION: "Sin conexión con el servidor."
};

/**
 * Llave de estacion: la crea ESTE PC y a Google solo viaja su huella. Desde aqui tambien se
 * obtiene el enlace para conectar los demas PC de la estacion.
 */
export function PanelLlave() {
  const { api, db, local, tokenEstacion } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [nueva, setNueva] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (local) return null;
  const llave = nueva ?? tokenEstacion;

  const crear = async (): Promise<void> => {
    setOcupado(true);
    setError(null);
    const l = crearLlave();
    const r = await api.registrarEstacion(await huellaDe(l));
    setOcupado(false);
    if (!r.ok) return setError(ERRORES[r.error ?? ""] ?? `No se pudo registrar la llave (${r.error ?? "error"}).`);
    await guardarMeta(db, CLAVE_TOKEN_ESTACION, l);
    setNueva(l);
  };
  const enlace = llave ? `#estacion?t=${llave}` : "";

  return (
    <div className="card stack" aria-label="Llave de estación">
      <h2>Llave de estación</h2>
      <p className="small muted" style={{ margin: 0 }}>
        La llave la crea este PC y queda solo en los PC de la estación: a Google viaja su huella, que no sirve para entrar. Si se pierde en todos los PC, no se puede recuperar: se crea una nueva y se reconectan los PC.
      </p>
      {!llave && (
        <>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>En el editor de Apps Script, ejecuta <b>abrirRegistroEstacion</b> (queda abierto 15 minutos).</li>
            <li>Aquí, pulsa «Crear llave de estación».</li>
          </ol>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void crear()}>{ocupado ? "Creando…" : "Crear llave de estación"}</button>
        </>
      )}
      {error && <Aviso tipo="crit" pequeno>{error}</Aviso>}
      {nueva && <Aviso tipo="good" pequeno>Llave creada y guardada en este PC. Google guardó solo su huella. Recarga la página para usarla.</Aviso>}
      {llave && (
        <>
          <div className="small">
            Para conectar otro PC de la estación, abre en él la dirección de la app agregando al final:
            <div className="mono" style={{ wordBreak: "break-all", marginTop: 4 }}>{enlace}</div>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => void copiarTexto(enlace).then((ok) => avisar(ok ? "Enlace copiado. Ábrelo solo en los PC de la estación, nunca en un celular." : "No se pudo copiar."))}>Copiar enlace para otro PC</button>
            {nueva && <button type="button" className="btn sm" onClick={() => window.location.reload()}>Recargar</button>}
          </div>
        </>
      )}
    </div>
  );
}
