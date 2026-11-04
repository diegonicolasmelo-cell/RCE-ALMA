import { useEffect, useState } from "react";
import { useServicios } from "../app/contexto";
import { useAhora } from "../app/hooks";
import { useArchivoApk } from "./apkDocumento";
import { useDatosUnidad } from "./datos";
import { Estado } from "./Estado";
import { ParaAlma } from "./ParaAlma";
import { Tablero } from "./Tablero";

type Vista = "tablero" | "alma" | "estado";

/** Trae las identidades del canal de estacion y refresca la cache local cada minuto. */
function useIdentidades(): void {
  const { api, db, local, tokenEstacion } = useServicios();
  useEffect(() => {
    // En modo local la tabla ya esta sembrada y la API local no guarda nada: no se pisa.
    if (local || !tokenEstacion) return;
    const traer = async (): Promise<void> => {
      const r = await api.leerIdentidades();
      if (!r.ok) return;
      await db.transaction("rw", db.identidades, async () => {
        await db.identidades.clear();
        await db.identidades.bulkPut([...r.identidades]);
      });
    };
    void traer();
    const t = setInterval(() => void traer(), 60_000);
    return () => clearInterval(t);
  }, [api, db, local, tokenEstacion]);
}

export function Estacion() {
  const { local } = useServicios();
  const datos = useDatosUnidad();
  const ahora = useAhora(30_000);
  const [vista, setVista] = useState<Vista>("tablero");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  useIdentidades();
  useArchivoApk(datos.episodios, datos.apks, datos.identidades);

  return (
    <div className="estacion">
      <div className="top">
        <div className="brand">
          <h1>UPC-Pulse · Estación</h1>
          <small>Tablero, evolución para ALMA y estado de la unidad</small>
        </div>
        {local && (
          <span className="row">
            <span className="demo-tag">Demostración · datos inventados</span>
            <a className="linkbtn" href="#celular">Ver el celular</a>
          </span>
        )}
      </div>

      <div className="tabs" role="tablist">
        {([["tablero", "Tablero"], ["alma", "Para ALMA"], ["estado", "Estado"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={vista === k} onClick={() => setVista(k)}>{t}</button>
        ))}
      </div>

      <main>
        {vista === "tablero" && <Tablero datos={datos} ahora={ahora} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />}
        {vista === "alma" && <ParaAlma datos={datos} ahora={ahora} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />}
        {vista === "estado" && <Estado datos={datos} />}
      </main>
    </div>
  );
}
