import { useServicios } from "../app/contexto";
import { useConsulta, useOnline } from "../app/hooks";
import { useApp } from "../app/store";
import { leerMeta } from "../datos/db";
import { Aviso, Pildora } from "../celular/componentes";
import type { DatosUnidad } from "./datos";

/** Estado de la sincronizacion y de la identidad en este equipo. */
export function Estado({ datos }: { datos: DatosUnidad }) {
  const { sync, db, config, local, tokenEstacion } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const online = useOnline();
  const pendientes = useConsulta(() => sync.pendientes(), [sync], 0);
  const bloqueadas = useConsulta(() => sync.bloqueadas(), [sync], []);
  const ultima = useConsulta(() => leerMeta<number>(db, "ultimaSubida"), [db], undefined);

  const sincronizar = async (): Promise<void> => {
    const r = await sync.ciclo();
    avisar(r.empuje.error || r.lectura.error ? `No se pudo sincronizar (${r.empuje.error ?? r.lectura.error}).` : "Sincronizado.");
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack">
        <h2>Sincronización</h2>
        <div className="row">
          <Pildora tipo={online ? "good" : "crit"}>{online ? "En línea" : "Sin conexión"}</Pildora>
          <Pildora tipo={pendientes > 0 ? "warn" : "good"}>{pendientes} por subir</Pildora>
          {bloqueadas.length > 0 && <Pildora tipo="crit">{bloqueadas.length} bloqueadas</Pildora>}
          <span className="small muted">Última subida: {ultima ? new Date(ultima).toLocaleTimeString("es-CL") : "—"}</span>
        </div>
        <div className="row"><button type="button" className="btn" onClick={() => void sincronizar()}>Sincronizar ahora</button></div>
        {bloqueadas.length > 0 && (
          <Aviso tipo="crit" pequeno>
            El servidor rechazó {bloqueadas.length} registro(s) por contener datos identificables. Es un defecto, no la red: no se reintentan. {bloqueadas[0]?.ultimoError}
          </Aviso>
        )}
        <p className="small muted">Cada cambio se guarda primero en este equipo y se sube en segundo plano. Si se corta a medias, reintentar no duplica nada.</p>
      </div>

      <div className="card stack">
        <h2>Este equipo</h2>
        <div className="row">
          <Pildora tipo={local ? "new" : "acc"}>{local ? "Modo demostración (sin servidor)" : "Conectado a Apps Script"}</Pildora>
          <Pildora tipo={tokenEstacion || local ? "good" : "warn"}>{tokenEstacion || local ? "Con llave de estación" : "Sin llave de estación"}</Pildora>
          <Pildora>{datos.identidades.size} identidades locales</Pildora>
        </div>
        {!local && !tokenEstacion && (
          <Aviso tipo="warn" pequeno>
            Este equipo no tiene la llave de estación, así que ve la unidad sin nombres. Abre el marcador de estación (<span className="mono">…/#estacion?t=&lt;llave&gt;</span>) una vez: la llave se guarda en este navegador.
          </Aviso>
        )}
        <p className="small muted">
          Riesgo aceptado por el equipo: nombre y RUT viven en Google para estar disponibles en cualquier PC y abrir Sinapse. El celular nunca los recibe (otra llave) y se borran al dar de alta.
          {config.sinapseUrl === "" && " El enlace a Sinapse está desactivado: falta configurar VITE_SINAPSE_URL."}
        </p>
      </div>
    </div>
  );
}
