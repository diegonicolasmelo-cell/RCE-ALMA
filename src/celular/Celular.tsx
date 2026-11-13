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
  momentoPreciso,
  transicionSoporte,
  nombreCama,
  volumenObjetivoMl,
  turnoDe,
  validarBorrador,
  horasDeVm,
  textoVm
} from "@core/index";
import type { BorradorControl, Episodio } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta, useOnline } from "../app/hooks";
import { leerMeta } from "../datos/db";
import { CLAVE_ERROR_SYNC, textoErrorSync } from "../datos/sync";
import type { ErrorSync } from "../datos/sync";
import { ReconectarCelular } from "../app/ConectarCelular";
import { temaEfectivo, useApp } from "../app/store";
import { Ayuda, BarraInferior, CabeceraInicio, HojaMas, MisControles, PanelAvisos, PanelCuenta, TituloVista, avisosDe, useBarraOculta } from "./Inicio";
import type { AccionMas, EstadoSync, ResumenCama } from "./Inicio";
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
  // El paciente elegido se busca tambien directo en la base: recien ingresado, la lista de
  // activos todavia no lo trae y no hay que saltar a otra cama mientras tanto.
  const elegido = useConsulta<Episodio | null | "cargando">(async () => (camaId ? (await db.episodios.get(camaId)) ?? null : null), [db, camaId], "cargando");
  const buscandoElegido = camaId !== null && elegido === "cargando" && !episodios.some((e) => e.id === camaId);
  const ep = buscandoElegido
    ? null
    : episodios.find((e) => e.id === camaId) ?? (elegido !== "cargando" && elegido?.activo ? elegido : null) ?? mias[0] ?? episodios[0] ?? null;

  const controles = useConsulta(() => (ep ? repo.controlesDe(ep.id) : []), [repo, ep?.id], []);
  const eventos = useConsulta(() => (ep ? repo.eventosDe(ep.id) : []), [repo, ep?.id], []);
  const apks = useConsulta(() => (ep ? repo.apkDe(ep.id) : []), [repo, ep?.id], []);
  const pendientes = useConsulta(() => sync.pendientes(), [sync], 0);
  const errorSync = useConsulta(() => leerMeta<ErrorSync>(db, CLAVE_ERROR_SYNC), [db], undefined);
  /** «Sincronizar ahora»: no espera el reintento programado y dice que paso. */
  const sincronizarAhora = async (): Promise<void> => {
    const r = await sync.ciclo({ forzar: true });
    const error = r.empuje.error ?? r.lectura.error;
    avisar(error ? `No se pudo sincronizar. ${textoErrorSync(error)}` : r.empuje.pendientes > 0 ? `Quedan ${r.empuje.pendientes} por subir: se siguen enviando.` : "Sincronizado.");
  };
  const avisoLlave = errorSync?.error === "TOKEN_INVALIDO" ? <div style={{ padding: "8px 14px 0" }}><ReconectarCelular /></div> : null;

  // --- Inicio: resumen de las camas (avisos y «Controles»), apariencia y paneles ---
  // Solo se calcula en las vistas del inicio: dentro de un paciente no se muestra y no debe competir con su registro.
  const enInicio = vista === "camas" || vista === "controles" || vista === "ayuda";
  const resumen = useConsulta<readonly ResumenCama[]>(
    async () => (enInicio ? Promise.all((await repo.episodiosActivos()).map(async (e) => ({ ep: e, controles: await repo.controlesDe(e.id), eventos: await repo.eventosDe(e.id) }))) : []),
    [repo, enInicio],
    []
  );
  const tema = useApp((s) => s.tema);
  const estilo = useApp((s) => s.estilo);
  useEffect(() => {
    document.documentElement.dataset["estilo"] = estilo;
    return () => { delete document.documentElement.dataset["estilo"]; };
  }, [estilo]);
  const tipoTurno = turnoDe(ahora).tipo;
  useEffect(() => {
    document.documentElement.dataset["theme"] = temaEfectivo(tema, tipoTurno);
    return () => { delete document.documentElement.dataset["theme"]; };
  }, [tema, tipoTurno]);
  const [hojaMas, setHojaMas] = useState<"menu" | AccionMas | null>(null);
  const [panel, setPanel] = useState<"cuenta" | "avisos" | null>(null);
  const barraOculta = useBarraOculta();
  /** Deslizar desde el borde derecho abre el panel de la cuenta. */
  const toque = useRef<number | null>(null);

  const ultimo = controles.at(-1) ?? null;
  const base = useMemo<BorradorControl | null>(
    () => (ep ? { ...crearBorradorNuevoControl(ep, ultimo, sesion.rut, eventos), esControlApoyo: !esMia(ep) } : null),
    // La base se recalcula si cambia la cama, el ultimo control o la via aerea (un evento la cambia);
    // las ediciones viven en el store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ep?.id, ultimo?.id, ep?.viaAereaActual, eventos.at(-1)?.id, sesion.rut, misCamas]
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

  // Solo se cambia la cama elegida si ese paciente ya no esta (p. ej. se dio de alta).
  useEffect(() => {
    if (ep && camaId !== ep.id && !buscandoElegido) useApp.setState({ camaId: ep.id });
  }, [ep, camaId, buscandoElegido]);

  const turno = turnoDe(ahora);
  const estadoSync: EstadoSync = { online, pendientes, noSube: Boolean(errorSync) && pendientes > 0, sincronizar: () => void sincronizarAhora() };
  const avisos = avisosDe(resumen, estadoSync);
  /** Franja fina de las vistas de un paciente: quien registra, el turno y la conexion. */
  const cabecera = (
      <div className="cel-top">
        <span>{sesion.nombre} · {etiquetaTurno(turno)}</span>
        <button type="button" className="linkbtn" style={{ padding: 0, ...(estadoSync.noSube ? { color: "var(--crit-ink)" } : {}) }} onClick={() => void sincronizarAhora()} aria-label="Sincronizar ahora">
          {online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />} {online ? "En línea" : "Sin señal"}{pendientes > 0 ? ` · ${pendientes} por subir` : ""}{estadoSync.noSube ? " · no sube" : ""}
        </button>
      </div>
  );
  const cabeceraInicio = <CabeceraInicio nombre={sesion.nombre} sync={estadoSync} nAvisos={avisos.length} onAvisos={() => setPanel("avisos")} onCuenta={() => setPanel("cuenta")} />;
  /** Las vistas del inicio: saludo arriba, barra abajo, y encima la hoja del «+» y los paneles. */
  const marcoInicio = (contenido: JSX.Element, v: typeof vista = vista): JSX.Element => (
    <div
      className="app-cel inicio"
      onTouchStart={(e) => { const x = e.touches[0]?.clientX ?? 0; toque.current = x > window.innerWidth - 28 ? x : null; }}
      onTouchMove={(e) => { if (toque.current !== null && toque.current - (e.touches[0]?.clientX ?? 0) > 44) { toque.current = null; setPanel("cuenta"); } }}
    >
      {cabeceraInicio}
      {avisoLlave}
      {contenido}
      <BarraInferior vista={v} oculta={barraOculta} onIr={(x) => irA(x)} onMas={() => setHojaMas("menu")} onEvaluar={() => setHojaMas("evaluacion")} />
      {hojaMas && <HojaMas key={hojaMas} accionInicial={hojaMas === "menu" ? null : hojaMas} episodios={episodios} esMia={esMia} onCerrar={() => setHojaMas(null)} />}
      {panel === "cuenta" && <PanelCuenta nombre={sesion.nombre} rol={sesion.rol} turno={turno} nMias={mias.length} sync={estadoSync} onCerrar={() => setPanel(null)} onSalir={() => setSesion(null)} />}
      {panel === "avisos" && <PanelAvisos avisos={avisos} onCerrar={() => setPanel(null)} />}
      <TecladoPropio />
    </div>
  );
  const vistaInicio = vista === "controles"
    ? <><TituloVista>Controles</TituloVista><MisControles resumen={resumen} rut={sesion.rut} ahora={ahora} /></>
    : vista === "ayuda"
      ? <><TituloVista>Ayuda</TituloVista><Ayuda sync={estadoSync} /></>
      : null;

  // Sin pacientes (o con la cama elegida ya dada de alta): las camas de la unidad, con las
  // libres listas para ingresar a pie de cama. Nunca una pantalla sin salida.
  if (buscandoElegido && vista === "cama") return <div className="app-cel">{cabecera}<p className="muted" style={{ padding: 16 }}>Cargando…</p></div>;
  if (vista === "elegir") return <div className="app-cel inicio">{cabeceraInicio}<ElegirCamas />{panel === "cuenta" && <PanelCuenta nombre={sesion.nombre} rol={sesion.rol} turno={turno} nMias={mias.length} sync={estadoSync} onCerrar={() => setPanel(null)} onSalir={() => setSesion(null)} />}</div>;
  if (vistaInicio) return marcoInicio(vistaInicio);
  if (!ep || !base || vista === "camas") return marcoInicio(<ListaCamas />, "camas");

  // Un borrador de una version anterior de la app se completa con los campos nuevos.
  const b = completarBorrador(borradores[ep.id], base);
  const editar = (fn: (x: BorradorControl) => BorradorControl): void => useApp.getState().editar(ep.id, base, (x) => fn(completarBorrador(x, base)));
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const ctx: ContextoCama = { ep, ultimo, controles, eventos, apks, b, editar, pbw, ahora, rutAutor: sesion.rut };

  const prono = estadoProno(eventos, ahora);

  const guardar = async (ir: "camas" | "siguiente" | "anterior" = "camas"): Promise<void> => {
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
    const horaReal = momentoDeEvaluacion(b.horaControl || horaDe(t), t);
    const realControl = horaReal ? momentoPreciso(horaReal, t) : t;
    // Si se llego aqui desde un evento, este control lo monitoriza y queda ligado a el.
    const pendiente = useApp.getState().eventoMonitorizar;
    const ligado = pendiente?.episodioId === ep.id ? pendiente : null;
    const control = { ...materializarControl(b, { id: nuevoId(), numero: controles.length + 1, ahora: realControl, viaAerea: ep.viaAereaActual, monitoreo: ep.monitoreo }), ...(ligado ? { eventoId: ligado.eventoId } : {}) };
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
    if (ligado) useApp.getState().monitorizarEvento(null);
    // Guardado el control: a las tarjetas de las camas, o directo al control del paciente siguiente o anterior.
    const destino = ir === "siguiente" ? siguientePaciente : ir === "anterior" ? anteriorPaciente : null;
    if (destino) irA("cama", destino.id);
    else irA("camas");
    const conEvento = tr ? ` ${tr.texto} registrada.` : ligado ? ` Ligado a: ${ligado.texto}.` : "";
    const sigue = destino ? ` Sigue ${nombreCama(destino.cama)}.` : "";
    avisar(online ? `Guardado ${ep.cama} ${control.hora}.${conEvento}${sigue}` : `Guardado ${ep.cama} ${control.hora}.${conEvento}${sigue} Sin señal: se sube cuando vuelva la conexión.`);
    void sync.ciclo();
  };

  const enTabControl = ORDEN_TABS.includes(tab as TabDeControl);
  // El paciente siguiente: primero mis camas y despues las demas, en orden de cama.
  const ordenCamas = [...episodios.filter(esMia), ...episodios.filter((e) => !esMia(e))];
  const iCama = ordenCamas.findIndex((e) => e.id === ep.id);
  const siguientePaciente = ordenCamas[iCama + 1] ?? null;
  const anteriorPaciente = iCama > 0 ? ordenCamas[iCama - 1] ?? null : null;
  const botonesGuardar = (
    <>
      {anteriorPaciente && (
        <button type="button" id="btn-guardar-anterior" className="btn guardar-lado" onClick={() => void guardar("anterior")}>
          ‹ Guardar y anterior · {anteriorPaciente.cama.slice(-2)}
        </button>
      )}
      <button type="button" id="btn-guardar-control" data-guardar className="btn guardar-principal" onClick={() => void guardar()}>Guardar</button>
      {siguientePaciente && (
        <button type="button" id="btn-guardar-siguiente" className="btn primary guardar-lado" onClick={() => void guardar("siguiente")}>
          Guardar y siguiente · {siguientePaciente.cama.slice(-2)} ›
        </button>
      )}
    </>
  );
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
  const cuerpo = tab === "control" ? <ControlSimple ctx={ctx} /> : enTabControl ? cuerpoSegmentos : tab === "motora" ? <TabKine ctx={ctx} paso="tf" /> : <TabEventos ctx={ctx} onCambioVia={(t, cambiaVia) => { franja.cerrar(); if (cambiaVia) useApp.getState().descartar(ep.id); setTab("control"); avisar(t); }} />;


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
            ? <><b>{ep.viaAereaActual} {ep.calibreVia}</b>{ep.viaAereaActual === "TET" && ep.fijacionCm ? <> · {ep.fijacionCm}{/\d/.test(ep.fijacionCm) ? " cm" : ""}</> : null}{textoVm(horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora)) ? <> · {textoVm(horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora))}</> : null}</>
            : <b>Vía aérea natural</b>}
        </span>
        {prono.enProno && <Pildora tipo="warn">Prono {prono.horasAcumuladas} h</Pildora>}
        {(bnmVigente(eventos) || bnmEnCurso(ultimo?.infusiones)) && <Pildora tipo="crit">BNM</Pildora>}
      </div>
      <div className="l2">PI {String(pbw).replace(".", ",")} kg · Vt 6-8 ml/kg: {volumenObjetivoMl(pbw, 6)}-{volumenObjetivoMl(pbw, 8)} ml · talla {ep.tallaCm} cm</div>
    </div>
  );

  /** Tras un evento que cambia la via aerea: directo al control post evento. */
  const alCambiarVia = (texto: string, cambiaVia = true): void => {
    franja.cerrar();
    // Si cambio la via, lo anotado antes era con la via anterior: el control parte de cero.
    if (cambiaVia) useApp.getState().descartar(ep.id);
    irA("cama", ep.id);
    avisar(texto);
  };

  if (vista === "eventos") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("Eventos")}
        <div className="cel-cuerpo" style={{ display: "grid", gap: 12 }}>
          <TabEventos ctx={ctx} onCambioVia={alCambiarVia} />
        </div>
        <TecladoPropio />
      </div>
    );
  }

  if (vista === "pve") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("PVE")}
        {banda}
        <div className="cel-cuerpo" id="cuerpo" style={{ alignContent: "start" }}>
          <TabPve ctx={ctx} />
        </div>
        <TecladoPropio />
      </div>
    );
  }

  if (vista === "evaluacion") {
    return (
      <div className="app-cel">
        {cabecera}
        {titulo("Evaluaciones")}
        <Evaluaciones ctx={ctx} />
        <TecladoPropio />
      </div>
    );
  }

  return (
    <div className={`app-cel${franja.activa ? " teclado" : ""}`}>
      {cabecera}

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
                botonesGuardar
              ) : (
                <>
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={siguiente}>Siguiente ›</button>
                  <button type="button" id="btn-guardar-control" data-guardar className="btn" onClick={() => void guardar()}>Guardar</button>
                </>
              )}
            </>
          ) : (
            botonesGuardar
          )}
        </div>
      </div>
      <TecladoPropio />
    </div>
  );
}
