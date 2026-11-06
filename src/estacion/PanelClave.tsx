import { useState } from "react";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { Aviso, Pildora } from "../celular/componentes";
import type { DatosUnidad } from "./datos";
import { instalarContrasena, olvidarClave, useClaveUnidad } from "./claveUnidad";
import { borrarIdentidad } from "./purga";

/** Contrasena de la unidad en este PC, y las identidades que esperan la hoja APK final. */
export function PanelClave({ datos }: { datos: DatosUnidad }) {
  const { api, db, local, tokenEstacion } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const clave = useClaveUnidad();
  const [texto, setTexto] = useState("");
  const [primera, setPrimera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  if (local) {
    return (
      <div className="card stack">
        <h2>Contraseña de la unidad</h2>
        <p className="small muted">En modo demostración no se cifra nada: no hay nube. En el despliegue real, cada PC pide aquí la contraseña de la unidad.</p>
      </div>
    );
  }

  const instalar = async (): Promise<void> => {
    setError(null);
    setTrabajando(true);
    const r = await instalarContrasena(texto, api, db, primera);
    setTrabajando(false);
    if (!r.ok) return setError(r.error);
    setTexto("");
    setPrimera(false);
    avisar(r.primera ? "Contraseña creada e instalada en este equipo." : "Contraseña instalada en este equipo.");
  };

  return (
    <div className="card stack">
      <h2>Contraseña de la unidad</h2>
      <div className="row">
        <Pildora tipo={clave ? "good" : "warn"}>{clave ? "Instalada en este equipo" : "No instalada: no se ven nombres"}</Pildora>
        {!tokenEstacion && <Pildora tipo="warn">Sin llave de estación</Pildora>}
      </div>
      {!clave ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void instalar(); }}>
          <div className="f">
            <label htmlFor="in-contrasena">Contraseña</label>
            <input id="in-contrasena" type="password" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} />
          </div>
          <label className="chk"><input type="checkbox" checked={primera} onChange={(e) => setPrimera(e.target.checked)} /> Es el primer PC (crea la contraseña de la unidad)</label>
          {error && <Aviso tipo="crit" pequeno>{error}</Aviso>}
          <div className="row"><button type="submit" className="btn primary" disabled={trabajando || texto === ""}>{trabajando ? "Comprobando…" : "Instalar en este equipo"}</button></div>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="btn sm" onClick={() => void olvidarClave(db).then(() => avisar("Contraseña y nombres quitados de este equipo."))}>Quitar la contraseña y los nombres de este equipo</button>
        </div>
      )}
      <p className="small muted">
        El nombre y el RUT se cifran en este equipo antes de subirse, y al leerlos se descifran solo en la memoria de la página: no quedan en el disco. La contraseña no se guarda en el Sheet, en Drive ni en el código: solo la derivación queda en este navegador. La misma contraseña va en los 12 PC; la guarda una sola persona, en papel.
      </p>

      {datos.pendientesPurga.length > 0 && (
        <>
          <h3>Altas esperando la hoja APK final</h3>
          <p className="small ink2">Su identidad sigue guardada (cifrada) hasta que el PC de respaldo guarde la hoja final. Si ese PC no va a estar disponible, se pueden borrar igual.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            {datos.pendientesPurga.map((e) => (
              <li key={e.id}>
                {e.cama}{" "}
                {confirmar === e.id ? (
                  <>
                    <b>¿Borrar sin hoja final?</b>{" "}
                    <button type="button" className="btn sm danger" onClick={() => void borrarIdentidad(api, db, e.id).then((r) => { setConfirmar(null); avisar(r.ok ? "Identidad borrada." : `No se pudo borrar (${r.error}).`); })}>Sí, borrar</button>{" "}
                    <button type="button" className="btn sm" onClick={() => setConfirmar(null)}>No</button>
                  </>
                ) : (
                  <button type="button" className="btn sm" onClick={() => setConfirmar(e.id)}>Borrar de todas formas</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
