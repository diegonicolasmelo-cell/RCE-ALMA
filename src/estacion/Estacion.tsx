import { useEffect, useState } from "react";
import { Logo } from "../app/Logo";
import { useServicios } from "../app/contexto";
import { useAhora } from "../app/hooks";
import { descifrarIdentidad, soloEpisodios } from "@core/index";
import { useArchivoApkLocal } from "./apkDocumento";
import { useClaveUnidad } from "./claveUnidad";
import { useIdentidadesEnMemoria } from "./identidades";
import { usePurgasPendientes } from "./purga";
import { useDatosUnidad } from "./datos";
import { Estado } from "./Estado";
import { ParaAlma } from "./ParaAlma";
import { Rem28 } from "./Rem28";
import { Tablero } from "./Tablero";

type Vista = "tablero" | "alma" | "rem" | "estado";

/**
 * Trae las referencias cifradas, las descifra con la clave de este PC y las refresca
 * cada minuto, solo en memoria. Sin la clave, no se ve ningun nombre.
 */
function useIdentidades(): void {
  const { api, db, local, tokenEstacion } = useServicios();
  const clave = useClaveUnidad();
  useEffect(() => {
    // En modo local la tabla ya esta sembrada y la API local no guarda nada: no se pisa.
    if (local || !tokenEstacion || !clave) return;
    const traer = async (): Promise<void> => {
      const r = await api.leerReferencias();
      if (!r.ok) return;
      const leidas = await Promise.all(soloEpisodios(r.referencias).map((ref) => descifrarIdentidad(clave, ref)));
      // Solo en memoria: nada legible queda en el disco de este PC.
      useIdentidadesEnMemoria.getState().reemplazar(leidas.filter((x): x is NonNullable<typeof x> => x !== null));
    };
    void traer();
    const t = setInterval(() => void traer(), 60_000);
    return () => clearInterval(t);
  }, [api, db, local, tokenEstacion, clave]);
}

export function Estacion() {
  const { local } = useServicios();
  const datos = useDatosUnidad();
  const ahora = useAhora(30_000);
  const [vista, setVista] = useState<Vista>("tablero");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  useIdentidades();
  useArchivoApkLocal(datos.episodios, datos.pendientesPurga, datos.apks, datos.identidades);
  usePurgasPendientes(datos.pendientesPurga, datos.apks);

  return (
    <div className="estacion">
      <div className="top">
        <div className="brand">
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}><Logo tam={28} variante="estacion" />Kapta · Estación</h1>
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
        {([["tablero", "Tablero"], ["alma", "Para ALMA"], ["rem", "REM 28"], ["estado", "Estado"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={vista === k} onClick={() => setVista(k)}>{t}</button>
        ))}
      </div>

      <main>
        {vista === "tablero" && <Tablero datos={datos} ahora={ahora} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />}
        {vista === "alma" && <ParaAlma datos={datos} ahora={ahora} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />}
        {vista === "rem" && <Rem28 datos={datos} ahora={ahora} />}
        {vista === "estado" && <Estado datos={datos} />}
      </main>
    </div>
  );
}
