import { useState } from "react";
import { configurarPrimerPc } from "../datos/servicios";

const ERRORES: Record<string, string> = {
  REGISTRO_CERRADO: "El registro está cerrado. En el editor de Apps Script ejecuta «abrirRegistroLlaves» y vuelve a intentarlo dentro de 15 minutos.",
  SIN_CONEXION: "Sin conexión con el servidor."
};

/**
 * Pantalla de la app servida por Apps Script cuando este equipo aun no esta conectado. Ofrece
 * dos caminos: abrir el enlace de configuracion que entrega coordinacion, o, si es el primer
 * PC de la unidad, crear aqui las llaves (a Google viajan solo sus huellas).
 */
export function SinConfigurar({ mensaje }: { readonly mensaje: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configurar = async (): Promise<void> => {
    setOcupado(true);
    setError(null);
    const r = await configurarPrimerPc();
    setOcupado(false);
    if (!r.ok) return setError(ERRORES[r.error ?? ""] ?? `No se pudo configurar (${r.error ?? "error"}).`);
    window.location.reload();
  };

  return (
    <div className="login">
      <div className="card stack" style={{ maxWidth: 520 }}>
        <div className="notice warn">{mensaje}</div>
        <h2 style={{ margin: 0 }}>¿Es el primer PC de la unidad?</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Este PC crea las dos llaves (la de la app y la de estación) y las guarda en este navegador. A Google viajan solo sus huellas, que no sirven para entrar. Después, desde «Estado», se sacan los enlaces para los celulares y los demás PC.
        </p>
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>En el editor de Apps Script, ejecuta <b>abrirRegistroLlaves</b> (queda abierto 15 minutos).</li>
          <li>Aquí, pulsa el botón.</li>
        </ol>
        <button type="button" className="btn primary" disabled={ocupado} onClick={() => void configurar()}>
          {ocupado ? "Configurando…" : "Configurar este PC como el primero"}
        </button>
        {error && <div className="notice crit">{error}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          Si la unidad ya está funcionando, no uses este botón: crearía llaves nuevas y desconectaría a todos. Pide el enlace a coordinación.
        </p>
      </div>
    </div>
  );
}
