import { useEffect, useState } from "react";
import { useFavicon } from "./Logo";
import { buscarProfesional } from "@core/index";
import { Login, CLAVE_SESION, sesionVigente } from "../celular/Login";
import type { SesionGuardada } from "../celular/Login";
import { Celular } from "../celular/Celular";
import { ProveedorFranja } from "../celular/franja";
import { leerMeta } from "../datos/db";
import { parsearHash } from "../datos/config";
import { iniciarServicios } from "../datos/servicios";
import { MENSAJE_SIN_CONFIGURAR, MENSAJE_SIN_CONFIGURAR_PWA, esAppsScript } from "../datos/gas";
import { SinConfigurar } from "../estacion/PrimerPc";
import type { Servicios } from "../datos/servicios";
import { Estacion } from "../estacion/Estacion";
import { ServiciosContext } from "./contexto";
import { CLAVE_BORRADORES, persistirBorradores, restaurarBorradores } from "./persistencia";
import { Resguardo } from "./Resguardo";
import { useApp } from "./store";
import { Toast } from "./Toast";
import { ConectarCelular } from "./ConectarCelular";

type Ruta = "celular" | "estacion";

function rutaActual(): Ruta {
  return parsearHash(window.location.hash).ruta === "estacion" ? "estacion" : "celular";
}

function useRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(rutaActual);
  useEffect(() => {
    const f = (): void => setRuta(rutaActual());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
}

/** Sube lo pendiente y baja lo de los demas cada 30 s y al recuperar la conexion. */
function useCicloDeSincronia(s: Servicios | null): void {
  useEffect(() => {
    if (!s) return;
    const ciclo = (): void => {
      if (navigator.onLine) void s.sync.ciclo();
    };
    ciclo();
    const t = setInterval(ciclo, 30_000);
    window.addEventListener("online", ciclo);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", ciclo);
    };
  }, [s]);
}

export function App() {
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const sesion = useApp((s) => s.sesion);
  const setSesion = useApp((s) => s.setSesion);
  const ruta = useRuta();
  useFavicon(ruta === "estacion" ? "estacion" : "csv");
  // El celular es una app de pantalla fija (igual en iPhone y Android); la estacion es una pagina normal.
  useEffect(() => {
    document.documentElement.classList.toggle("celular", ruta === "celular");
  }, [ruta]);

  useEffect(() => {
    iniciarServicios().then(setServicios).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!servicios) return;
    void (async () => {
      const guardada = sesionVigente(await leerMeta<SesionGuardada>(servicios.db, CLAVE_SESION));
      const prof = guardada ? buscarProfesional(guardada.rut) : undefined;
      if (prof) setSesion({ rut: prof.correo, nombre: `Klgo. ${prof.nombre}`, rol: prof.rol });
      await restaurarBorradores(servicios.db);
      setLista(true);
    })();
    return persistirBorradores(servicios.db);
  }, [servicios, setSesion]);

  useCicloDeSincronia(servicios);

  if (error === MENSAJE_SIN_CONFIGURAR && esAppsScript()) return <SinConfigurar mensaje={error} />;
  if (error === MENSAJE_SIN_CONFIGURAR_PWA) return <ConectarCelular mensaje={error} />;
  if (error) return <div className="login"><div className="notice crit">No se pudo iniciar la aplicación: {error}</div></div>;
  if (!servicios || !lista) return <div className="login"><p className="muted">Cargando…</p></div>;

  return (
    <ServiciosContext.Provider value={servicios}>
      {ruta === "estacion" ? (
        <Estacion />
      ) : sesion ? (
        <ProveedorFranja>
          <Resguardo
            onDescartar={async () => {
              useApp.setState({ borradores: {}, vista: "camas" });
              if (servicios) await servicios.db.meta.delete(CLAVE_BORRADORES);
            }}
          >
            <Celular />
          </Resguardo>
        </ProveedorFranja>
      ) : (
        <Login />
      )}
      <Toast />
    </ServiciosContext.Provider>
  );
}
