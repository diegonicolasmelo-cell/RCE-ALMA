import { useState } from "react";
import { useServicios } from "../app/contexto";
import { useConsulta, useOnline } from "../app/hooks";
import { useApp } from "../app/store";
import { leerMeta } from "../datos/db";
import { CLAVE_CONEXION, CLAVE_TOKEN_ESTACION } from "../datos/servicios";
import { Aviso, Pildora } from "../celular/componentes";
import type { DatosUnidad } from "./datos";
import { archivoLocalSoportado, elegirCarpeta, leerCarpeta, pedirPermiso, permisoConcedido } from "./archivoLocal";

/** Estado de la sincronizacion y de la identidad en este equipo. */
export function Estado({ datos }: { datos: DatosUnidad }) {
  const { sync, db, config, local, tokenEstacion } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const online = useOnline();
  const pendientes = useConsulta(() => sync.pendientes(), [sync], 0);
  const bloqueadas = useConsulta(() => sync.bloqueadas(), [sync], []);
  const ultima = useConsulta(() => leerMeta<number>(db, "ultimaSubida"), [db], undefined);

  const carpeta = useConsulta(() => leerCarpeta(db), [db], undefined);
  const [permiso, setPermiso] = useState<boolean | null>(null);
  const comprobar = async (): Promise<void> => setPermiso(carpeta ? await permisoConcedido(carpeta) : null);
  const elegir = async (): Promise<void> => {
    const h = await elegirCarpeta(db);
    if (h) {
      setPermiso(true);
      avisar(`Las hojas APK se copiarán en la carpeta «${h.name}» de este equipo.`);
    }
  };
  const reautorizar = async (): Promise<void> => {
    if (carpeta) setPermiso(await pedirPermiso(carpeta));
  };

  const sincronizar = async (): Promise<void> => {
    const r = await sync.ciclo();
    avisar(r.empuje.error || r.lectura.error ? `No se pudo sincronizar (${r.empuje.error ?? r.lectura.error}).` : "Sincronizado.");
  };

  const olvidar = async (): Promise<void> => {
    await db.meta.bulkDelete([CLAVE_CONEXION, CLAVE_TOKEN_ESTACION, "sesion"]);
    window.location.reload();
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
        <h2>Copia local de las hojas APK</h2>
        {!archivoLocalSoportado() ? (
          <Aviso tipo="warn" pequeno>Este navegador no permite guardar en una carpeta. Usa Chrome o Edge en el PC que hará de respaldo.</Aviso>
        ) : (
          <>
            <div className="row">
              <Pildora tipo={carpeta ? "good" : ""}>{carpeta ? `Carpeta: ${carpeta.name}` : "Sin carpeta elegida"}</Pildora>
              {carpeta && permiso === false && <Pildora tipo="warn">Falta confirmar el permiso</Pildora>}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => void elegir()}>{carpeta ? "Cambiar carpeta" : "Elegir carpeta"}</button>
              {carpeta && <button type="button" className="btn" onClick={() => void reautorizar()}>Confirmar permiso</button>}
              {carpeta && <button type="button" className="btn sm" onClick={() => void comprobar()}>Comprobar</button>}
            </div>
          </>
        )}
        <p className="small muted">
          Se elige en el PC que queda siempre encendido. Mientras la estación esté abierta ahí, cada firma de APK actualiza el archivo del paciente en esa carpeta, además de Drive. Si el navegador se reinicia, puede pedir confirmar el permiso con un clic. La carpeta contiene RUN: debe estar en un disco protegido y con respaldo.
        </p>
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
        {!local && (
          <div className="row">
            <button type="button" className="btn sm" onClick={() => void olvidar()}>Borrar la configuración y las llaves de este equipo</button>
            <span className="small muted">Úsalo si el equipo cambia de lugar o de responsable.</span>
          </div>
        )}
        <p className="small muted">
          Riesgo aceptado por el equipo: nombre y RUT viven en Google para estar disponibles en cualquier PC y abrir Sinapse. El celular nunca los recibe (otra llave) y se borran al dar de alta.
          {config.sinapseUrl === "" && " El enlace a Sinapse está desactivado: falta configurar VITE_SINAPSE_URL."}
        </p>
      </div>
    </div>
  );
}
