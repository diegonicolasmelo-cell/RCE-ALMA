import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Wifi, WifiOff } from "lucide-react";
import {
  apkVigente,
  completarBorrador,
  crearBorradorNuevoControl,
  calcularPbw,
  esViaAereaArtificial,
  estadoProno,
  etiquetaTurno,
  bnmEnCurso,
  bnmVigente,
  materializarControl,
  momentoDeEvaluacion,
  transicionSoporte,
  nombreCama,
  volumenObjetivoMl,
  turnoDe,
  validarBorrador
} from "@core/index";
import type { BorradorControl } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta, useOnline } from "../app/hooks";
import { leerMeta } from "../datos/db";
import { useApp } from "../app/store";
import type { TabCelular } from "../app/store";
import { horaDe, nuevoId } from "../app/util";
import { baseEvento } from "./eventos-ui";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { EVENTO_FIN_PESTANA, EVENTO_FIN_SEGMENTO, asegurarVisible, enfocarPrimero, enfocarPrimeroEn, useFranja } from "./franja";
import { ORDEN_TABS, SEGMENTOS, ubicacionDeCampo } from "./pasos";
import { InfusionesEnCurso } from "./InfusionesEnCurso";
import { ControlSimple } from "./ControlSimple";
import { TecladoPropio } from "./TecladoPropio";
import type { SegmentoId, TabControl as TabDeControl } from "./pasos";
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
  ["kine", "Kine resp. · APK"],
  ["motora", "Kine motora"],
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
  const segPedido = useApp((s) => s.segPedido);
  const pedirSegmento = useApp((s) => s.pedirSegmento);
  const [segActual, setSegActual] = useState(0);
  /** Mientras la pantalla se desplaza por un "Siguiente", el scroll no cambia el segmento marcado. */
  const navegandoHasta = useRef(0);
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

  // --- Segmentos: una pantalla larga por pestana; "Siguiente" lleva al segmento que sigue ---
  const segmentos = useCallback((): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("#cuerpo [data-seg]")], []);
  const marcar = useCallback((i: number): void => {
    segmentos().forEach((el, k) => (k === i ? el.setAttribute("data-activo", "true") : el.removeAttribute("data-activo")));
    setSegActual(i);
  }, [segmentos]);
  const irASeg = useCallback((i: number): void => {
    const el = segmentos()[i];
    if (!el) return;
    franja.cerrar();
    marcar(i);
    navegandoHasta.current = Date.now() + 700;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [segmentos, marcar, franja]);

  // Al cambiar de pestana (o de cama): arriba y primer segmento, salvo que haya uno pedido.
  useEffect(() => {
    const t = setTimeout(() => {
      if (useApp.getState().segPedido) return;
      document.getElementById("cuerpo")?.scrollTo({ top: 0 });
      marcar(0);
    }, 30);
    return () => clearTimeout(t);
  }, [tab, camaId, vista]); // eslint-disable-line react-hooks/exhaustive-deps

  // Llevar la pantalla a un segmento pedido (p. ej. el dato que falta al guardar).
  useEffect(() => {
    if (!segPedido) return;
    const t = setTimeout(() => {
      const i = segmentos().findIndex((el) => el.dataset["seg"] === segPedido);
      pedirSegmento(null);
      if (i >= 0) irASeg(i);
    }, 40);
    return () => clearTimeout(t);
  }, [segPedido]); // eslint-disable-line react-hooks/exhaustive-deps

  // El segmento activo sigue al scroll y al foco.
  useEffect(() => {
    const cuerpo = document.getElementById("cuerpo");
    if (!cuerpo) return;
    const alScroll = (): void => {
      if (Date.now() < navegandoHasta.current) return;
      const tope = cuerpo.getBoundingClientRect().top + 90;
      const lista = segmentos();
      let idx = 0;
      lista.forEach((el, k) => { if (el.getBoundingClientRect().top <= tope) idx = k; });
      if (cuerpo.scrollTop + cuerpo.clientHeight >= cuerpo.scrollHeight - 4) idx = Math.max(idx, lista.length - 1);
      marcar(idx);
    };
    const alFoco = (e: FocusEvent): void => {
      const el = e.target as HTMLElement | null;
      const seg = el?.closest<HTMLElement>("[data-seg]");
      const i = seg ? segmentos().indexOf(seg) : -1;
      if (i < 0 || !seg || !el?.matches("input")) return;
      const cambio = !seg.hasAttribute("data-activo");
      marcar(i);
      // Esperar a que el teclado termine de abrir (y se oculte la cabecera) antes de medir.
      setTimeout(() => {
        if (cambio) {
          navegandoHasta.current = Date.now() + 700;
          seg.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => asegurarVisible(el), 380);
        } else asegurarVisible(el);
      }, 260);
    };
    cuerpo.addEventListener("scroll", alScroll, { passive: true });
    cuerpo.addEventListener("focusin", alFoco);
    return () => {
      cuerpo.removeEventListener("scroll", alScroll);
      cuerpo.removeEventListener("focusin", alFoco);
    };
  }, [tab, vista, ep?.id, segmentos, marcar]);

  // "Sig." en la ultima casilla de un cuadro: muestra el cuadro siguiente completo y, si
  // tiene casillas, enfoca la primera; si no (p. ej. PIC sin monitoreo), cierra el teclado.
  useEffect(() => {
    const alFinSeg = (e: Event): void => {
      if (useApp.getState().tab === "control") return;
      const lista = segmentos();
      const i = lista.findIndex((el) => el.dataset["seg"] === (e as CustomEvent<string>).detail);
      const sig = lista[i + 1];
      if (i < 0 || !sig) return;
      e.preventDefault();
      marcar(i + 1);
      navegandoHasta.current = Date.now() + 700;
      sig.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!enfocarPrimeroEn(sig)) franja.cerrar();
    };
    window.addEventListener(EVENTO_FIN_SEGMENTO, alFinSeg);
    return () => window.removeEventListener(EVENTO_FIN_SEGMENTO, alFinSeg);
  }, [franja, segmentos, marcar]);

  // "Sig." del teclado al terminar los casilleros de Monitoreo sigue en Ventilacion.
  useEffect(() => {
    const alFin = (e: Event): void => {
      const st = useApp.getState();
      if (st.vista !== "cama" || st.tab !== "control") return;
      e.preventDefault();
      st.setTab("kine");
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

  // Un borrador de una version anterior de la app se completa con los campos nuevos.
  const b = completarBorrador(borradores[ep.id], base);
  const editar = (fn: (x: BorradorControl) => BorradorControl): void => useApp.getState().editar(ep.id, base, (x) => fn(completarBorrador(x, base)));
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const ctx: ContextoCama = { ep, ultimo, controles, eventos, apks, b, editar, pbw, ahora, rutAutor: sesion.rut };

  const prono = estadoProno(eventos, ahora);
  const turno = turnoDe(ahora);

  const guardar = async (): Promise<void> => {
    const problemas = validarBorrador(b, {
      apkVigente: apkVigente(apks, ep.id, new Date(), sesion.rut),
      viaAerea: ep.viaAereaActual,
      modalidadAnterior: ultimo?.ventilacion.modalidad ?? null,
      ahora: new Date()
    });
    if (problemas.length > 0) {
      const primero = problemas[0];
      if (primero) {
        const u = ubicacionDeCampo(primero.campo);
        setTab(u.tab);
        if (u.tab === "control") {
          // En la hoja del control, al dato que falta (el teclado propio se abre ahi).
          setTimeout(() => document.querySelector<HTMLElement>(`#cuerpo [data-campo="${primero.campo}"]`)?.focus(), 80);
        } else pedirSegmento(u.seg);
      }
      avisar(`Falta: ${problemas.map((p) => p.mensaje).join(", ")}.`);
      return;
    }
    const t = new Date();
    // La hora que vale es la REAL del control (puede ser unos minutos antes de guardarlo).
    const realControl = momentoDeEvaluacion(b.horaControl || horaDe(t), t) ?? t;
    const control = materializarControl(b, { id: nuevoId(), numero: controles.length + 1, ahora: realControl, viaAerea: ep.viaAereaActual, monitoreo: ep.monitoreo });
    await repo.guardarControl(control);
    // Cambio de soporte (p. ej. CPAP+PS a tubo T / HME): desvinculacion o reconexion, con su hora real.
    const tr = transicionSoporte(ultimo?.ventilacion.modalidad ?? null, b.modalidad, ep.viaAereaActual);
    if (tr) {
      const real = momentoDeEvaluacion(b.horaEvento || horaDe(t), t) ?? t;
      await repo.registrarEvento({ ...baseEvento(ep, sesion.rut, t), hora: horaDe(real), realizadaEn: real.toISOString(), tipo: tr.tipo, desde: tr.desde, hasta: tr.hasta });
    }
    useApp.getState().descartar(ep.id);
    franja.cerrar();
    setTab("control");
    // Guardado el control, de vuelta a las tarjetas de las camas.
    irA("camas");
    const conEvento = tr ? ` ${tr.texto} registrada.` : "";
    avisar(online ? `Guardado ${ep.cama} ${control.hora}.${conEvento}` : `Guardado ${ep.cama} ${control.hora}.${conEvento} Sin señal: se sube cuando vuelva la conexión.`);
    void sync.ciclo();
  };

  const enTabControl = ORDEN_TABS.includes(tab as TabDeControl);
  const defsSeg = enTabControl ? SEGMENTOS[tab as TabDeControl] : [];
  const iTab = ORDEN_TABS.indexOf(tab as TabDeControl);
  const ultimoSeg = enTabControl && iTab === ORDEN_TABS.length - 1 && segActual >= defsSeg.length - 1;
  const siguiente = (): void => {
    if (segActual < defsSeg.length - 1) return irASeg(segActual + 1);
    const prox = ORDEN_TABS[iTab + 1];
    if (prox) { franja.cerrar(); setTab(prox); }
  };
  const atras = (): void => {
    if (segActual > 0) return irASeg(segActual - 1);
    const prev = ORDEN_TABS[iTab - 1];
    if (prev) { franja.cerrar(); const ult = SEGMENTOS[prev].at(-1); if (ult) pedirSegmento(ult.id); setTab(prev); }
  };
  const renderSeg = (id: SegmentoId): JSX.Element =>
    id === "inf" ? <InfusionesEnCurso ctx={ctx} /> :
    ["fc", "pa", "modo", "vent"].includes(id) ? <TabControl ctx={ctx} paso={id} /> :
    ["neuro", "glasgow", "sas"].includes(id) ? <TabConciencia ctx={ctx} paso={id} /> :
    <TabKine ctx={ctx} paso={id} />;
  const cuerpoSegmentos = (
    <>
      {defsSeg.map((d) => <div key={d.id} className="segmento" data-seg={d.id}>{renderSeg(d.id)}</div>)}
      <div className="seg-relleno" aria-hidden />
    </>
  );
  const cuerpo = tab === "control" ? <ControlSimple ctx={ctx} /> : enTabControl ? cuerpoSegmentos : tab === "motora" ? <TabKine ctx={ctx} paso="tf" /> : <TabEventos ctx={ctx} onCambioVia={(t) => { franja.cerrar(); setTab("control"); avisar(t); }} />;

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
        <div style={{ padding: "8px 14px 0" }}><b>Camas</b> <span className="small muted">· Monitorización, Evaluaciones, Eventos o PVE</span></div>
        <ListaCamas />
      </div>
    );
  }

  const volver = (
    <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => { franja.cerrar(); irA("camas"); }}>‹ Camas</button>
  );
  // "lun 9 nov": la fecha va al lado del titulo, en la misma linea.
  const fecha = ahora.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }).replace(/[,.]/g, "");
  /** Titulo de cada vista de la cama: «Control · Cama 2  lun 9 nov». */
  const titulo = (que: string) => (
    <div className="ctl-cabeza">
      {volver}
      <h1>{que} · {nombreCama(ep.cama)}</h1>
      <span className="fecha">{fecha}</span>
      {!esMia(ep) && <Pildora>de apoyo</Pildora>}
    </div>
  );
  /** Banda del paciente, a lo ancho y en dos lineas: la via aerea, y el peso ideal con el Vt por kilo. */
  const banda = (
    <div className="banda" aria-label="Vía aérea y peso ideal">
      <div className="l1">
        <Lock size={13} aria-label="Vía aérea fija: solo la cambia un evento" />
        <span>
          {esViaAereaArtificial(ep.viaAereaActual)
            ? <><b>{ep.viaAereaActual} {ep.calibreVia}</b>{ep.viaAereaActual === "TET" && ep.fijacionCm ? <> · {ep.fijacionCm}{/\d/.test(ep.fijacionCm) ? " cm" : ""}</> : null} · VM día {ep.diasVM}</>
            : <b>Vía aérea natural</b>}
        </span>
        {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        {(bnmVigente(eventos) || bnmEnCurso(ultimo?.infusiones)) && <Pildora tipo="crit">BNM</Pildora>}
      </div>
      <div className="l2">PI {String(pbw).replace(".", ",")} kg · Vt 6-8 ml/kg: {volumenObjetivoMl(pbw, 6)}-{volumenObjetivoMl(pbw, 8)} ml · talla {ep.tallaCm} cm</div>
    </div>
  );

  /** Tras un evento que cambia la via aerea: directo al control post evento. */
  const alCambiarVia = (texto: string): void => {
    franja.cerrar();
    irA("cama", ep.id);
    avisar(texto);
  };

  if (vista === "eventos") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("Eventos")}
        {banda}
        <div className="cel-cuerpo" style={{ display: "grid", gap: 12 }}>
          <TabEventos ctx={ctx} onCambioVia={alCambiarVia} />
        </div>
      </div>
    );
  }

  if (vista === "pve") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("PVE")}
        {banda}
        <div className="cel-cuerpo" style={{ display: "grid", gap: 12 }}>
          <TabPve ctx={ctx} />
        </div>
      </div>
    );
  }

  if (vista === "evaluacion") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("Evaluaciones")}
        <Evaluaciones ctx={ctx} />
      </div>
    );
  }

  return (
    <div className={`app-cel${franja.activa ? " teclado" : ""}`}>
      <div className="cel-top">
        <span>{sesion.nombre} · {etiquetaTurno(turno)}</span>
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => void sync.ciclo()} aria-label="Sincronizar ahora">
            {online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />} {online ? "En línea" : "Sin señal"}{pendientes > 0 ? ` · ${pendientes} por subir` : ""}
          </button>
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setSesion(null)}>Salir</button>
        </span>
      </div>

      {titulo("Control")}
      {banda}

      <div className="ph-tabs" role="tablist">
        {TABS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { franja.cerrar(); setTab(k); }}>{t}</button>
        ))}
      </div>

      {enTabControl && (
        <div className="pasos" role="navigation" aria-label="Secciones">
          <div className="pasos-lista">
            {defsSeg.map((d, i) => (
              <button key={d.id} type="button" className="paso-chip" aria-current={i === segActual ? "step" : undefined} onClick={() => irASeg(i)}>
                {d.corto}
              </button>
            ))}
          </div>
        </div>
      )}

      <div id="cuerpo" className="cel-cuerpo" style={{ paddingBottom: franja.activa ? 120 : undefined }}>
        {cuerpo}
      </div>

      <div className="cel-pie">
        <div className="cel-guardar" style={{ display: "flex", gap: 8 }}>
          {enTabControl ? (
            <>
              <button type="button" className="btn" disabled={iTab === 0 && segActual === 0} onClick={atras}>‹ Atrás</button>
              {ultimoSeg ? (
                <button type="button" id="btn-guardar-control" className="btn primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar control</button>
              ) : (
                <>
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={siguiente}>Siguiente ›</button>
                  <button type="button" className="btn" onClick={() => void guardar()}>Guardar control</button>
                </>
              )}
            </>
          ) : (
            <button type="button" id="btn-guardar-control" className="btn primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar control</button>
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
      {tab === "control" && <TecladoPropio />}
    </div>
  );
}
