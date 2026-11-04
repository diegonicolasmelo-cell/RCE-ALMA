import { useEffect, useMemo } from "react";
import { Lock, Wifi, WifiOff } from "lucide-react";
import {
  apkVigente,
  crearBorradorNuevoControl,
  calcularPbw,
  esViaAereaArtificial,
  estadoProno,
  etiquetaTurno,
  bnmVigente,
  materializarControl,
  turnoDe,
  validarBorrador
} from "@core/index";
import type { BorradorControl } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta, useOnline } from "../app/hooks";
import { leerMeta } from "../datos/db";
import { useApp } from "../app/store";
import type { TabCelular } from "../app/store";
import { nuevoId } from "../app/util";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { EVENTO_FIN_PESTANA, enfocarPrimero, useFranja } from "./franja";
import { PASOS, pasoDeCampo } from "./pasos";
import { TabConciencia } from "./TabConciencia";
import { TabControl } from "./TabControl";
import { TabEventos } from "./TabEventos";
import { ElegirCamas, claveMisCamas } from "./ElegirCamas";
import { Evaluaciones } from "./Evaluaciones";
import { ListaCamas } from "./ListaCamas";
import { TabKine } from "./TabKine";
import { TabPve } from "./TabPve";

const TABS: readonly (readonly [TabCelular, string])[] = [
  ["control", "Control"],
  ["pve", "PVE"],
  ["eventos", "Eventos"]
];

export function Celular() {
  const { repo, sync, db } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const camaId = useApp((s) => s.camaId);
  const setCama = useApp((s) => s.setCama);
  const vista = useApp((s) => s.vista);
  const misCamas = useApp((s) => s.misCamas);
  const setMisCamas = useApp((s) => s.setMisCamas);
  const irA = useApp((s) => s.irA);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const paso = useApp((s) => s.paso);
  const setPaso = useApp((s) => s.setPaso);
  const borradores = useApp((s) => s.borradores);
  const avisar = useApp((s) => s.avisar);
  const setSesion = useApp((s) => s.setSesion);
  const franja = useFranja();
  const online = useOnline();
  const ahora = useAhora(1000);

  const episodios = useConsulta(() => repo.episodiosActivos(), [repo], []);
  const esMia = (e: { cama: string; rutTitular: string }): boolean => (misCamas ? misCamas.includes(e.cama) : e.rutTitular === sesion.rut);
  const mias = episodios.filter(esMia);

  // Sesion restaurada: recuperar las camas de hoy; si nunca las eligio, preguntarlas.
  useEffect(() => {
    if (misCamas !== null) return;
    void leerMeta<string[]>(db, claveMisCamas(sesion.rut)).then((g) => {
      if (g) setMisCamas(g);
      else useApp.setState({ vista: "elegir" });
    });
  }, [db, sesion.rut, misCamas, setMisCamas]);
  const ep = episodios.find((e) => e.id === camaId) ?? mias[0] ?? episodios[0] ?? null;

  const controles = useConsulta(() => (ep ? repo.controlesDe(ep.id) : []), [repo, ep?.id], []);
  const eventos = useConsulta(() => (ep ? repo.eventosDe(ep.id) : []), [repo, ep?.id], []);
  const apks = useConsulta(() => (ep ? repo.apkDe(ep.id) : []), [repo, ep?.id], []);
  const pendientes = useConsulta(() => sync.pendientes(), [sync], 0);

  const ultimo = controles.at(-1) ?? null;
  const base = useMemo<BorradorControl | null>(
    () => (ep ? { ...crearBorradorNuevoControl(ep, ultimo, sesion.rut), esControlApoyo: !esMia(ep) } : null),
    // La base se recalcula solo si cambia la cama o el ultimo control; las ediciones viven en el store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ep?.id, ultimo?.id, sesion.rut, misCamas]
  );

  useEffect(() => {
    document.querySelector('.paso-chip[aria-current="step"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [paso, vista]);

  // "Sig." al terminar los casilleros de un bloque pasa al bloque siguiente (no salta ninguno).
  useEffect(() => {
    const alFin = (e: Event): void => {
      const st = useApp.getState();
      if (st.vista !== "cama" || st.tab !== "control") return;
      const i = PASOS.findIndex((p) => p.id === st.paso);
      const sig = PASOS[i + 1];
      if (!sig) return;
      e.preventDefault();
      st.setPaso(sig.id);
      setTimeout(() => {
        if (!enfocarPrimero()) franja.cerrar();
      }, 80);
    };
    window.addEventListener(EVENTO_FIN_PESTANA, alFin);
    return () => window.removeEventListener(EVENTO_FIN_PESTANA, alFin);
  }, [franja]);

  useEffect(() => {
    if (ep && camaId !== ep.id) useApp.setState({ camaId: ep.id });
  }, [ep, camaId]);

  if (!ep || !base) {
    return <div className="cel-cuerpo"><p className="muted">No hay camas activas. Un PC de la estación debe ingresar a los pacientes.</p></div>;
  }

  const b = borradores[ep.id] ?? base;
  const editar = (fn: (x: BorradorControl) => BorradorControl): void => useApp.getState().editar(ep.id, base, fn);
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const ctx: ContextoCama = { ep, ultimo, controles, eventos, apks, b, editar, pbw, ahora, rutAutor: sesion.rut };

  const prono = estadoProno(eventos, ahora);
  const turno = turnoDe(ahora);

  const guardar = async (): Promise<void> => {
    const problemas = validarBorrador(b, { apkVigente: apkVigente(apks, ep.id, new Date()) });
    if (problemas.length > 0) {
      const primero = problemas[0];
      if (primero) {
        setTab("control");
        setPaso(pasoDeCampo(primero.campo));
      }
      avisar(`Falta: ${problemas.map((p) => p.mensaje).join(", ")}.`);
      return;
    }
    const t = new Date();
    const control = materializarControl(b, { id: nuevoId(), numero: controles.length + 1, ahora: t, viaAerea: ep.viaAereaActual, monitoreo: ep.monitoreo });
    await repo.guardarControl(control);
    useApp.getState().descartar(ep.id);
    franja.cerrar();
    setTab("control");
    setPaso("fc");
    avisar(online ? `Guardado ${ep.cama} ${control.hora}.` : `Guardado ${ep.cama} ${control.hora}. Sin señal: se sube cuando vuelva la conexión.`);
    void sync.ciclo();
  };

  const idxPaso = Math.max(0, PASOS.findIndex((p) => p.id === paso));
  const defPaso = PASOS[idxPaso]!;
  const ultimoPaso = idxPaso === PASOS.length - 1;
  const irAPaso = (i: number): void => {
    const p = PASOS[Math.min(PASOS.length - 1, Math.max(0, i))];
    if (!p) return;
    franja.cerrar();
    setPaso(p.id);
    document.getElementById("cuerpo")?.scrollTo({ top: 0 });
  };
  const cuerpoControl =
    ["fc", "pa", "dva", "modo", "vent", "spo2"].includes(paso) ? <TabControl ctx={ctx} paso={paso} /> :
    ["neuro", "glasgow", "sas", "sedacion"].includes(paso) ? <TabConciencia ctx={ctx} paso={paso} /> :
    <TabKine ctx={ctx} paso={paso} />;
  const cuerpo = tab === "control" ? cuerpoControl : tab === "pve" ? <TabPve ctx={ctx} /> : <TabEventos ctx={ctx} />;

  const cabecera = (
      <div className="cel-top">
        <span>{sesion.nombre} · {etiquetaTurno(turno)}</span>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => void sync.ciclo()} aria-label="Sincronizar ahora">
            {online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />} {online ? "En línea" : "Sin señal"}{pendientes > 0 ? ` · ${pendientes} por subir` : ""}
          </button>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setSesion(null)}>Salir</button>
        </span>
      </div>
  );

  if (vista === "elegir") {
    return (
      <div className="app-cel">
        {cabecera}
        <ElegirCamas />
      </div>
    );
  }

  if (vista === "camas") {
    return (
      <div className="app-cel">
        {cabecera}
        <div style={{ padding: "8px 14px 0" }}><b>Camas</b> <span className="small muted">· elige Control o Evaluación</span></div>
        <ListaCamas />
      </div>
    );
  }

  const volver = (
    <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => { franja.cerrar(); irA("camas"); }}>‹ Camas</button>
  );

  if (vista === "evaluacion") {
    return (
      <div className="app-cel">
        {cabecera}
        <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 10 }}>
          {volver}
          <b className="mono" style={{ fontSize: 20 }}>{ep.cama}</b>
          <span className="small muted">Evaluación</span>
        </div>
        <Evaluaciones ctx={ctx} />
      </div>
    );
  }

  return (
    <div className="app-cel">
      <div className="cel-top">
        <span>{sesion.nombre} · {etiquetaTurno(turno)}</span>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => void sync.ciclo()} aria-label="Sincronizar ahora">
            {online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />} {online ? "En línea" : "Sin señal"}{pendientes > 0 ? ` · ${pendientes} por subir` : ""}
          </button>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setSesion(null)}>Salir</button>
        </span>
      </div>

      <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 10 }}>
        {volver}
        <b className="mono" style={{ fontSize: 20 }}>{ep.cama}</b>
        {!esMia(ep) && <Pildora>control de apoyo</Pildora>}
      </div>
      <div className="airway">
        <Lock size={14} aria-label="Vía aérea fija: solo la cambia un evento" />
        <span>
          {esViaAereaArtificial(ep.viaAereaActual)
            ? <><b>{ep.viaAereaActual}</b> {ep.calibreVia} · {ep.fijacionCm}{/\d/.test(ep.fijacionCm ?? "") ? " cm" : ""} · VM día {ep.diasVM}</>
            : "Vía aérea natural"}
        </span>
        {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        {bnmVigente(eventos) && <Pildora tipo="crit">BNM</Pildora>}
      </div>

      <div className="ph-tabs" role="tablist">
        {TABS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { franja.cerrar(); setTab(k); }}>{t}</button>
        ))}
      </div>

      {tab === "control" && (
        <div className="pasos" role="navigation" aria-label="Bloques del control">
          <div className="pasos-lista">
            {PASOS.map((p, i) => (
              <button key={p.id} type="button" className="paso-chip" aria-current={p.id === paso ? "step" : undefined} data-hecho={i < idxPaso} onClick={() => irAPaso(i)}>
                {i + 1}·{p.corto}
              </button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", padding: "4px 14px 0" }}>
            <b>{defPaso.titulo}</b>
            <span className="small muted">Bloque {idxPaso + 1} de {PASOS.length}</span>
          </div>
        </div>
      )}

      <div id="cuerpo" className="cel-cuerpo" style={{ paddingBottom: franja.activa ? 120 : undefined }}>
        {cuerpo}
      </div>

      <div className="cel-pie">
        <div className="cel-guardar" style={{ display: "flex", gap: 8 }}>
          {tab === "control" ? (
            <>
              <button type="button" className="btn" disabled={idxPaso === 0} onClick={() => irAPaso(idxPaso - 1)}>‹ Atrás</button>
              {ultimoPaso ? (
                <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar control</button>
              ) : (
                <>
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => irAPaso(idxPaso + 1)}>Siguiente ›</button>
                  <button type="button" className="btn" onClick={() => void guardar()}>Guardar control</button>
                </>
              )}
            </>
          ) : (
            <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar control</button>
          )}
        </div>
        <nav className="cel-camas" aria-label="Camas">
          {episodios.map((e) => (
            <button key={e.id} type="button" className={`chip ${esMia(e) ? "" : "apoyo"}`} aria-pressed={e.id === ep.id} title={esMia(e) ? "Cama asignada" : "Cama de apoyo"} onClick={() => { franja.cerrar(); setCama(e.id); }}>
              {e.cama.slice(-2)}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
