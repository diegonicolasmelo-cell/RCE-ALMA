/**
 * El marco del inicio del celular: saludo con la campana y la cuenta, barra inferior con el «+»,
 * la hoja «¿Qué quieres registrar?», el panel lateral de la cuenta, los avisos, «Controles»
 * (lo que uno registró) y la ayuda.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  BedDouble,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Flag,
  History,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  SunMoon,
  Timer,
  UserPlus,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { CAMAS_UNIDAD, ETIQUETA_MODALIDAD, describirEvento, esViaAereaArtificial, etiquetaTurno, eventosSinMonitorizar, nombreCama } from "@core/index";
import type { Control, Episodio, EventoClinico, TurnoGuardia } from "@core/index";
import { useApp } from "../app/store";
import type { Tema, VistaCelular } from "../app/store";

export interface ResumenCama {
  readonly ep: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
}

export interface EstadoSync {
  readonly online: boolean;
  readonly pendientes: number;
  readonly noSube: boolean;
  readonly sincronizar: () => void;
}

/** «Klgo. Diego Melo» -> «Diego Melo». */
export const nombreSinTitulo = (nombre: string): string => nombre.replace(/^Klg[oa]\.?\s+/i, "");
const inicial = (nombre: string): string => (nombreSinTitulo(nombre)[0] ?? "?").toUpperCase();

export interface Aviso {
  readonly id: string;
  readonly tipo: "crit" | "warn";
  readonly titulo: string;
  readonly detalle: string;
  readonly episodioId?: string;
}

/** Lo pendiente: eventos sin su control de monitorización y lo que no sube. Nada que decida el clínico. */
export function avisosDe(resumen: readonly ResumenCama[], sync: EstadoSync): Aviso[] {
  const lista: Aviso[] = [];
  for (const r of resumen) {
    const ultimo = r.controles.at(-1);
    for (const e of eventosSinMonitorizar(r.eventos, ultimo ? [ultimo] : [])) {
      lista.push({ id: e.id, tipo: "crit", titulo: `${nombreCama(r.ep.cama)} · Evento sin monitorización`, detalle: `${describirEvento(e, r.eventos)} · ${e.hora}`, episodioId: r.ep.id });
    }
  }
  if (sync.noSube) lista.push({ id: "sync", tipo: "crit", titulo: "Lo registrado no está subiendo", detalle: `${sync.pendientes} por subir. Sigue guardado en este celular.` });
  else if (!sync.online && sync.pendientes > 0) lista.push({ id: "sync", tipo: "warn", titulo: "Sin señal", detalle: `${sync.pendientes} por subir: se envían solos cuando vuelva la conexión.` });
  return lista;
}

/** Franja de arriba: «Hola, Diego Melo», el estado de la conexión, la campana y la cuenta. */
export function CabeceraInicio({ nombre, sync, nAvisos, onAvisos, onCuenta }: { nombre: string; sync: EstadoSync; nAvisos: number; onAvisos: () => void; onCuenta: () => void }) {
  const textoSync = `${sync.online ? "" : "Sin señal"}${sync.pendientes > 0 ? `${sync.online ? "" : " · "}${sync.pendientes} por subir` : ""}${sync.noSube ? " · no sube" : ""}`;
  return (
    <div className="cel-top inicio-top">
      <span className="hola">Hola, <b>{nombreSinTitulo(nombre)}</b></span>
      <button type="button" className={`chip-sync${sync.noSube ? " mal" : ""}`} onClick={sync.sincronizar} aria-label="Sincronizar ahora">
        {sync.online ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}
        {textoSync && <span>{textoSync}</span>}
      </button>
      <button type="button" className="bt-cab" aria-label={nAvisos > 0 ? `Avisos (${nAvisos})` : "Avisos"} onClick={onAvisos}>
        <Bell size={21} aria-hidden />
        {nAvisos > 0 && <span className="punto" aria-hidden />}
      </button>
      <button type="button" className="avatar" aria-label="Mi cuenta" onClick={onCuenta}>{inicial(nombre)}</button>
    </div>
  );
}

/** Cabecera de una vista del inicio que no es la lista de pacientes (Controles, Ayuda). */
export function TituloVista({ children }: { children: ReactNode }) {
  return <div className="ctl-cabeza"><h1>{children}</h1></div>;
}

/**
 * La barra se esconde al deslizar hacia abajo y vuelve al subir, al tocar la pantalla o al
 * llegar arriba: deja toda la pantalla para leer.
 */
export function useBarraOculta(): boolean {
  const [oculta, setOculta] = useState(false);
  const ultimo = useRef(new WeakMap<EventTarget, number>());
  useEffect(() => {
    const alScroll = (e: Event): void => {
      const el = e.target as HTMLElement | null;
      if (!el || typeof el.scrollTop !== "number" || !el.classList?.contains("cel-cuerpo")) return;
      const antes = ultimo.current.get(el) ?? 0;
      const ahora = el.scrollTop;
      ultimo.current.set(el, ahora);
      if (ahora <= 8) return setOculta(false);
      if (ahora > antes + 6) setOculta(true);
      else if (ahora < antes - 6) setOculta(false);
    };
    const alTocar = (): void => setOculta(false);
    document.addEventListener("scroll", alScroll, true);
    document.addEventListener("click", alTocar, true);
    return () => {
      document.removeEventListener("scroll", alScroll, true);
      document.removeEventListener("click", alTocar, true);
    };
  }, []);
  return oculta;
}

const PESTANAS: readonly (readonly [VistaCelular, string, typeof BedDouble])[] = [
  ["camas", "Pacientes", BedDouble],
  ["controles", "Controles", History]
];
const PESTANAS_2: readonly (readonly [VistaCelular | "evaluar", string, typeof BedDouble])[] = [
  ["evaluar", "Evaluaciones", ClipboardList],
  ["ayuda", "Ayuda", CircleHelp]
];

export function BarraInferior({ vista, oculta, onIr, onMas, onEvaluar }: { vista: VistaCelular; oculta: boolean; onIr: (v: VistaCelular) => void; onMas: () => void; onEvaluar: () => void }) {
  return (
    <nav className={`barra-inf${oculta ? " oculta" : ""}`} aria-label="Navegación">
      {PESTANAS.map(([k, t, Icono]) => (
        <button key={k} type="button" aria-current={vista === k ? "page" : undefined} onClick={() => onIr(k)}>
          <Icono size={21} aria-hidden /> {t}
        </button>
      ))}
      <button type="button" className="mas" aria-label="Registrar" onClick={onMas}><Plus size={28} aria-hidden /></button>
      {PESTANAS_2.map(([k, t, Icono]) => (
        <button key={k} type="button" aria-current={vista === k ? "page" : undefined} onClick={() => (k === "evaluar" ? onEvaluar() : onIr(k))}>
          <Icono size={21} aria-hidden /> {t}
        </button>
      ))}
    </nav>
  );
}

export type AccionMas = "ingresar" | "control" | "traslado" | "evento" | "pve" | "evaluacion";

const ACCIONES: readonly { grupo: string; items: readonly (readonly [AccionMas, string, typeof BedDouble])[] }[] = [
  { grupo: "Pacientes", items: [["ingresar", "Ingresar", UserPlus], ["control", "Control", Activity], ["traslado", "Cambio de cama", ArrowLeftRight]] },
  { grupo: "Eventos y evaluaciones", items: [["evento", "Evento", Flag], ["pve", "PVE", Timer], ["evaluacion", "Evaluación", ClipboardList]] }
];
const TITULO_ACCION: Record<AccionMas, string> = {
  ingresar: "¿En qué cama ingresa?",
  control: "¿De qué paciente es el control?",
  traslado: "¿A qué paciente le cambias la cama?",
  evento: "¿De qué paciente es el evento?",
  pve: "¿A qué paciente le haces la PVE?",
  evaluacion: "¿A qué paciente evalúas?"
};

/** Hoja del «+»: qué registrar y, después, en qué cama. Se cierra tocando fuera. */
export function HojaMas({ accionInicial, episodios, esMia, onCerrar }: { accionInicial: AccionMas | null; episodios: readonly Episodio[]; esMia: (e: Episodio) => boolean; onCerrar: () => void }) {
  const [accion, setAccion] = useState<AccionMas | null>(accionInicial);
  const irA = useApp((s) => s.irA);
  const ocupadas = new Set(episodios.map((e) => e.cama));
  const libres = CAMAS_UNIDAD.filter((c) => !ocupadas.has(c));
  const orden = [...episodios.filter(esMia), ...episodios.filter((e) => !esMia(e))];
  const candidatos = accion === "pve" ? orden.filter((e) => esViaAereaArtificial(e.viaAereaActual)) : orden;

  const elegir = (ep: Episodio): void => {
    const st = useApp.getState();
    onCerrar();
    if (accion === "control") irA("cama", ep.id);
    else if (accion === "evento") irA("eventos", ep.id);
    else if (accion === "pve") irA("pve", ep.id);
    else if (accion === "evaluacion") irA("evaluacion", ep.id);
    else if (accion === "traslado") {
      irA("camas");
      st.pedirTraslado(ep.id);
    }
  };
  const ingresar = (cama: string): void => {
    onCerrar();
    irA("camas");
    useApp.getState().pedirIngreso(cama);
  };

  return (
    <div className="velo-inicio" onClick={onCerrar}>
      <section className="hoja-mas" role="dialog" aria-label={accion ? TITULO_ACCION[accion] : "¿Qué quieres registrar?"} onClick={(e) => e.stopPropagation()}>
        <div className="asa" aria-hidden />
        {accion === null ? (
          <>
            <h2>¿Qué quieres registrar?</h2>
            {ACCIONES.map((g) => (
              <div key={g.grupo} className="grupo-tiles">
                <h3>{g.grupo}</h3>
                <div className="tiles">
                  {g.items.map(([k, t, Icono]) => (
                    <button key={k} type="button" className="tile" onClick={() => setAccion(k)}>
                      <i><Icono size={28} strokeWidth={1.6} aria-hidden /></i>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="hoja-cab">
              {accionInicial === null && <button type="button" className="bt-plano" aria-label="Volver" onClick={() => setAccion(null)}><ChevronLeft size={22} aria-hidden /></button>}
              <h2>{TITULO_ACCION[accion]}</h2>
            </div>
            <div className="elige-cama">
              {accion === "ingresar"
                ? libres.length === 0
                  ? <p className="muted">No hay camas libres.</p>
                  : libres.map((c) => <button key={c} type="button" className="fila-cama" onClick={() => ingresar(c)}><b>{nombreCama(c)}</b><span className="muted">Libre</span><ChevronRight size={18} aria-hidden /></button>)
                : candidatos.length === 0
                  ? <p className="muted">{accion === "pve" ? "No hay pacientes con tubo o traqueostomía." : "No hay pacientes ingresados."}</p>
                  : candidatos.map((e) => (
                    <button key={e.id} type="button" className="fila-cama" onClick={() => elegir(e)}>
                      <b>{nombreCama(e.cama)}</b>
                      <span className="muted">{e.viaAereaActual === "NATURAL" ? "Vía aérea natural" : `${e.viaAereaActual} ${e.calibreVia ?? ""}`}{esMia(e) ? "" : " · de otro colega"}</span>
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const TEMAS: readonly (readonly [Tema, string, typeof Sun])[] = [["auto", "Automático", SunMoon], ["dia", "Día", Sun], ["noche", "Noche", Moon]];

/** Panel lateral de la cuenta: quién soy, mis camas, la apariencia, la conexión y cerrar sesión. */
export function PanelCuenta({ nombre, rol, turno, nMias, sync, onCerrar, onSalir }: { nombre: string; rol: string; turno: TurnoGuardia; nMias: number; sync: EstadoSync; onCerrar: () => void; onSalir: () => void }) {
  const tema = useApp((s) => s.tema);
  const setTema = useApp((s) => s.setTema);
  const irA = useApp((s) => s.irA);
  return (
    <div className="velo-inicio" onClick={onCerrar}>
      <aside className="panel-cuenta" role="dialog" aria-label="Mi cuenta" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="bt-plano cerrar" aria-label="Cerrar" onClick={onCerrar}><X size={20} aria-hidden /></button>
        <div className="pc-cabeza">
          <span className="avatar grande" aria-hidden>{inicial(nombre)}</span>
          <b>{nombreSinTitulo(nombre)}</b>
          <span className="rol">{rol === "COORDINACION" ? "Kinesiólogo · Coordinación" : "Kinesiólogo clínico"}</span>
          <span className="caja">{nMias === 1 ? "1 cama a tu cargo" : `${nMias} camas a tu cargo`}</span>
        </div>
        <div className="pc-turno">{etiquetaTurno(turno)}</div>
        <div className="pc-lista">
          <button type="button" className="pc-fila" onClick={() => { onCerrar(); irA("elegir"); }}>
            <BedDouble size={22} aria-hidden /><span>Mis camas de hoy</span><ChevronRight size={18} aria-hidden />
          </button>
          <div className="pc-fila bloque">
            <SunMoon size={22} aria-hidden />
            <span>Apariencia<small>Automático: de noche en el turno noche</small></span>
          </div>
          <div className="seg-tema" role="radiogroup" aria-label="Apariencia">
            {TEMAS.map(([k, t, Icono]) => (
              <button key={k} type="button" role="radio" aria-checked={tema === k} onClick={() => setTema(k)}><Icono size={15} aria-hidden /> {t}</button>
            ))}
          </div>
          <button type="button" className="pc-fila" onClick={sync.sincronizar}>
            <RefreshCw size={22} aria-hidden />
            <span>Sincronizar ahora<small>{sync.online ? "En línea" : "Sin señal"}{sync.pendientes > 0 ? ` · ${sync.pendientes} por subir` : " · todo subido"}</small></span>
            <ChevronRight size={18} aria-hidden />
          </button>
          <button type="button" className="pc-fila" onClick={() => { onCerrar(); irA("ayuda"); }}>
            <CircleHelp size={22} aria-hidden /><span>Ayuda</span><ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <button type="button" className="pc-salir" onClick={onSalir}>Cerrar sesión</button>
      </aside>
    </div>
  );
}

/** La campana: lo pendiente, y con un toque a la cama. */
export function PanelAvisos({ avisos, onCerrar }: { avisos: readonly Aviso[]; onCerrar: () => void }) {
  const irA = useApp((s) => s.irA);
  return (
    <div className="velo-inicio" onClick={onCerrar}>
      <section className="hoja-mas" role="dialog" aria-label="Avisos" onClick={(e) => e.stopPropagation()}>
        <div className="asa" aria-hidden />
        <h2>Avisos</h2>
        {avisos.length === 0 && <p className="muted" style={{ textAlign: "center" }}>Nada pendiente.</p>}
        <div className="elige-cama">
          {avisos.map((a) => (
            <button key={a.id} type="button" className={`fila-aviso ${a.tipo}`} disabled={!a.episodioId} onClick={() => { if (a.episodioId) { onCerrar(); irA("cama", a.episodioId); } }}>
              <span className="marca" aria-hidden />
              <span><b>{a.titulo}</b><small>{a.detalle}</small></span>
              {a.episodioId && <span className="ir">Monitorizar ›</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const n = (v: number | null, unidad = ""): string => (v === null ? "--" : `${v}${unidad}`);

/** «Controles»: lo que registré en las últimas 24 horas, uno por tarjeta, del más nuevo al más antiguo. */
export function MisControles({ resumen, rut, ahora }: { resumen: readonly ResumenCama[]; rut: string; ahora: Date }) {
  const desde = ahora.getTime() - 24 * 3600_000;
  const mios = resumen
    .flatMap((r) => r.controles.filter((c) => c.rutAutor === rut && Date.parse(c.registradoEn) >= desde).map((c) => ({ c, r })))
    .sort((a, b) => (a.c.registradoEn < b.c.registradoEn ? 1 : -1));
  return (
    <div className="cel-cuerpo" aria-label="Mis controles">
      <p className="small muted" style={{ margin: 0 }}>Lo que registraste en las últimas 24 horas.</p>
      {mios.length === 0 && <p className="muted">Aún no registras controles.</p>}
      {mios.map(({ c, r }) => {
        const evento = c.eventoId ? r.eventos.find((e) => e.id === c.eventoId) : undefined;
        return (
          <article key={c.id} className="card tarjeta-control">
            <header>
              <b>{nombreCama(r.ep.cama)} · {c.hora}</b>
              <span className="small muted">{ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? ""}</span>
            </header>
            {evento && <div className="franja-evento">⚑ {describirEvento(evento, r.eventos)} · {evento.hora}</div>}
            <div className="valores">
              <span><b>{n(c.fc)}</b>FC</span>
              <span><b>{c.pas !== null && c.pad !== null ? `${c.pas}/${c.pad}` : "--"}</b>PA</span>
              <span><b>{n(c.spo2, " %")}</b>SpO₂</span>
              <span><b>{n(c.ventilacion.fio2, " %")}</b>FiO₂</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const AYUDAS: readonly (readonly [string, string])[] = [
  ["Registrar un control", "En la tarjeta del paciente toca «Monitorización», o usa el + de abajo y elige «Control». Al terminar puedes guardar y pasar al paciente siguiente o al anterior."],
  ["Registrar un evento", "Toca «Eventos» en la tarjeta, o el + y «Evento». El evento se guarda al tiro y se abre su control de monitorización, que queda unido a él."],
  ["Ingresar un paciente", "Toca «Ingresar» en una cama libre, o el + y «Ingresar». El nombre y el RUT se completan después en el PC."],
  ["Sin señal", "Puedes seguir registrando: todo queda guardado en el celular y sube solo cuando vuelve la conexión. Arriba ves cuánto falta por subir."],
  ["Día y noche", "Toca tu inicial, arriba a la derecha. En «Automático» la pantalla se oscurece sola en el turno noche."],
  ["Cambiar mis camas", "Toca tu inicial y «Mis camas de hoy», o «Cambiar mis camas» en la lista de pacientes."]
];

export function Ayuda({ sync }: { sync: EstadoSync }) {
  return (
    <div className="cel-cuerpo" aria-label="Ayuda">
      {AYUDAS.map(([t, d]) => (
        <details key={t} className="card ayuda-item">
          <summary>{t}</summary>
          <p>{d}</p>
        </details>
      ))}
      <button type="button" className="btn" onClick={sync.sincronizar}><RefreshCw size={16} aria-hidden /> Sincronizar ahora</button>
    </div>
  );
}
