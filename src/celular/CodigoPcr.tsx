/**
 * El codigo PCR a pantalla completa: parte con un toque (sin elegir cama), metronomo con sonido,
 * ciclos de 2 minutos que piden el ritmo, choques, drogas, notas y bitacora. Cada toque se guarda
 * al instante en el celular; si la app se cierra, al abrirla vuelve aqui. Al terminar se elige la
 * cama y queda el evento PCR del paciente (con su alerta al PC y su control pendiente).
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";
import {
  CAMAS_UNIDAD,
  CICLO_SEG,
  ENERGIAS_J,
  EPI_SEG,
  ETIQUETA_RITMO,
  cambiarBpm,
  choque,
  cuantasDrogas,
  dosisAmiodarona,
  droga,
  elegirJoules,
  elegirRitmo,
  eventoDeCodigo,
  finDeCiclo,
  iniciarCodigo,
  nombreCama,
  nota,
  reloj,
  ritmoVerificado,
  segundosDesde,
  terminar,
  volverAlCodigo
} from "@core/index";
import type { CodigoPcr, Episodio, RitmoPcr } from "@core/index";
import { useServicios } from "../app/contexto";
import { useAhora, useConsulta } from "../app/hooks";
import { useApp } from "../app/store";
import { nuevoId } from "../app/util";
import { guardarMeta, leerMeta } from "../datos/db";
import type { BaseLocal } from "../datos/db";
import { baseEvento } from "./eventos-ui";

/** El codigo en curso vive en la base local del celular, no en la memoria de la pantalla. */
export const CLAVE_CODIGO_PCR = "codigoPcr";

/** Parte el codigo y lleva a su pantalla. Desde una cama, el paciente ya queda elegido. */
export async function iniciarCodigoPcr(db: BaseLocal, episodioId: string | null): Promise<void> {
  const vigente = await leerMeta<CodigoPcr>(db, CLAVE_CODIGO_PCR);
  if (!vigente) await guardarMeta(db, CLAVE_CODIGO_PCR, iniciarCodigo(nuevoId(), new Date(), episodioId));
  useApp.getState().irA("pcr");
}

const RITMOS: readonly RitmoPcr[] = ["FV", "TVSP", "ASISTOLIA", "AESP"];
const OTRAS_DROGAS: readonly (readonly [string, string])[] = [
  ["Lidocaína", "1-1,5 mg/kg"],
  ["Bicarbonato", "1 mEq/kg"],
  ["Cloruro de calcio", "1 g"],
  ["Sulfato de magnesio", "1-2 g"]
];

/** Metronomo con WebAudio: un clic corto en cada compresion. Necesita un toque para sonar. */
function useMetronomo(bpm: number, sonando: boolean): void {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!sonando) return;
    try {
      ctx.current ??= new AudioContext();
      void ctx.current.resume();
    } catch {
      return;
    }
    const tic = (): void => {
      const a = ctx.current;
      if (!a) return;
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = 1000;
      g.gain.setValueAtTime(0.5, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.05);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.06);
    };
    tic();
    const t = setInterval(tic, 60000 / bpm);
    return () => clearInterval(t);
  }, [bpm, sonando]);
}

/** Mantiene la pantalla encendida mientras dura el codigo (si el telefono lo permite). */
function usePantallaEncendida(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = async (): Promise<void> => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void pedir();
    const alVolver = (): void => { if (document.visibilityState === "visible") void pedir(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

type Hoja = null | "ritmo" | "otra" | "via" | "nota" | "terminar";

export function CodigoPcr() {
  const { db, repo, sync } = useServicios();
  const sesion = useApp((s) => s.sesion)!;
  const irA = useApp((s) => s.irA);
  const avisar = useApp((s) => s.avisar);
  const ahora = useAhora(250);
  const [c, setC] = useState<CodigoPcr | null | undefined>(undefined);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [texto, setTexto] = useState("");
  const [silencio, setSilencio] = useState(false);
  /** Tras recargar la app el sonido necesita un toque para volver (el navegador lo exige). */
  const [sonidoListo, setSonidoListo] = useState(false);
  const [cama, setCama] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const episodios = useConsulta<readonly Episodio[]>(() => repo.episodiosActivos(), [repo], []);

  useEffect(() => {
    void leerMeta<CodigoPcr>(db, CLAVE_CODIGO_PCR).then((g) => {
      setC(g ?? null);
      // Recien partido con un toque: el sonido ya puede partir.
      if (g && Date.now() - Date.parse(g.inicio) < 5000) setSonidoListo(true);
      if (g?.episodioId) setCama(g.episodioId);
    });
  }, [db]);

  /** Cada cambio queda guardado al instante. */
  // El ultimo estado vive tambien en una referencia: cada toque parte de el y se escribe en la
  // base en el mismo momento (no dentro del ciclo de React), en orden.
  const actual = useRef<CodigoPcr | null>(null);
  actual.current = c ?? null;
  const cola = useRef<Promise<void>>(Promise.resolve());
  const cambiar = (fn: (x: CodigoPcr) => CodigoPcr): void => {
    const x = actual.current;
    if (!x) return;
    const n = fn(x);
    actual.current = n;
    setC(n);
    cola.current = cola.current.then(() => guardarMeta(db, CLAVE_CODIGO_PCR, n)).catch(() => undefined);
  };

  usePantallaEncendida();
  const enCurso = Boolean(c && !c.termino);
  useMetronomo(c?.bpm ?? 110, enCurso && !c?.enPausa && !silencio && sonidoListo);

  // Al cumplirse los 2 minutos: pausa y se pide el ritmo.
  const restante = c ? CICLO_SEG - segundosDesde(c.cicloInicio, ahora) : CICLO_SEG;
  useEffect(() => {
    if (c && !c.termino && !c.enPausa && restante <= 0) {
      cambiar((x) => finDeCiclo(x, new Date()));
      setHoja("ritmo");
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibracion */ }
    }
  }, [restante <= 0, c?.enPausa, c?.termino]); // eslint-disable-line react-hooks/exhaustive-deps

  if (c === undefined) return <div className="codigo-pcr"><p className="muted" style={{ padding: 16 }}>Cargando…</p></div>;
  if (c === null) {
    return (
      <div className="codigo-pcr">
        <p className="muted" style={{ padding: 16 }}>No hay un código en curso.</p>
        <button type="button" className="btn" style={{ margin: 16 }} onClick={() => irA("camas")}>‹ Pacientes</button>
      </div>
    );
  }

  const total = segundosDesde(c.inicio, c.termino ? new Date(c.termino.en) : ahora);
  const epiSeg = c.ultimaEpi ? EPI_SEG - segundosDesde(c.ultimaEpi, ahora) : null;
  const tocar = (fn: (x: CodigoPcr, t: Date) => CodigoPcr): void => { setSonidoListo(true); cambiar((x) => fn(x, new Date())); };

  // ---------------- Cierre: elegir la cama y guardar ----------------
  if (c.termino) {
    const ocupadas = new Map(episodios.map((e) => [e.cama, e] as const));
    const elegido = episodios.find((e) => e.id === cama) ?? null;
    const guardar = async (): Promise<void> => {
      if (!elegido) return avisar("Elige la cama del paciente.");
      const t = new Date();
      await repo.registrarEvento(eventoDeCodigo(c, baseEvento(elegido, sesion.rut, t, comentario.trim())));
      await db.meta.delete(CLAVE_CODIGO_PCR);
      irA("camas");
      avisar(`Código PCR guardado en ${nombreCama(elegido.cama)}. Queda pendiente su control de monitorización.`);
      void sync.ciclo();
    };
    const descartar = async (): Promise<void> => {
      await db.meta.delete(CLAVE_CODIGO_PCR);
      irA("camas");
      avisar("Código descartado: no se guardó nada.");
    };
    return (
      <div className="codigo-pcr">
        <header className={`cod-cab${c.termino.rosc ? " ok" : ""}`}>
          <div className="t"><b>{c.termino.rosc ? "ROSC" : "Término sin ROSC"} · {c.bitacora.at(-1)?.hora.slice(0, 5)}</b><small>Duración {reloj(total)}</small></div>
        </header>
        <div className="cod-cuerpo">
          <button type="button" className="linkbtn" style={{ alignSelf: "flex-start", padding: 0, fontSize: 14 }} onClick={() => cambiar((x) => volverAlCodigo(x, new Date()))}>
            <ChevronLeft size={16} aria-hidden style={{ verticalAlign: "-3px" }} /> Volver al código
          </button>
          <div className="cod-res">
            <div><b>{c.ciclo}</b><small>{c.ciclo === 1 ? "ciclo" : "ciclos"}</small></div>
            <div><b>{c.choques}</b><small>{c.choques === 1 ? "choque" : "choques"}</small></div>
            <div><b>{cuantasDrogas(c)}</b><small>{cuantasDrogas(c) === 1 ? "droga" : "drogas"}</small></div>
          </div>
          <section className="card cod-card" aria-label="Cama del paciente">
            <span className="cod-lbl">¿En qué cama fue?</span>
            <div className="cod-camas">
              {CAMAS_UNIDAD.map((cm) => {
                const ep = ocupadas.get(cm);
                return (
                  <button key={cm} type="button" disabled={!ep} aria-pressed={!!ep && ep.id === cama} onClick={() => ep && setCama(ep.id)}>
                    {cm.slice(-2)}
                  </button>
                );
              })}
            </div>
            {elegido && <p className="small muted" style={{ margin: 0 }}>{nombreCama(elegido.cama)} · {elegido.viaAereaActual === "NATURAL" ? "Vía aérea natural" : `${elegido.viaAereaActual} ${elegido.calibreVia ?? ""}`}</p>}
          </section>
          <section className="card cod-card">
            <label className="cod-lbl" htmlFor="pcr-comentario">Qué pasó (breve, opcional)</label>
            <textarea id="pcr-comentario" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </section>
          <button type="button" id="btn-guardar-pcr" className="btn grande cod-guardar" onClick={() => void guardar()}>Guardar código PCR</button>
          <p className="small muted" style={{ margin: 0 }}>El PC recibe la alerta con el informe pre-llenado y la bitácora. En la cama queda «Evento sin monitorización» hasta que alguien registre su control.</p>
          <button type="button" className="linkbtn" style={{ color: "var(--crit-ink)", alignSelf: "center" }} onClick={() => void descartar()}>Descartar (se inició por error)</button>
          <Bitacora c={c} />
        </div>
      </div>
    );
  }

  // ---------------- Durante el codigo ----------------
  const prog = Math.min(1, Math.max(0, 1 - restante / CICLO_SEG));
  const r = 48;
  const largo = 2 * Math.PI * r;
  const latido = Math.floor((ahora.getTime() / (60000 / c.bpm))) % 4;
  return (
    <div className="codigo-pcr">
      <header className="cod-cab">
        <div className="t">
          <b>CÓDIGO PCR EN CURSO</b>
          <small>Inició {c.bitacora[0]?.hora.slice(0, 5)} · Ciclo {c.ciclo} · {c.episodioId ? nombreCama(episodios.find((e) => e.id === c.episodioId)?.cama ?? "") : "cama al final"}</small>
        </div>
        <span className="total" aria-label="Tiempo total">{reloj(total)}</span>
      </header>
      <div className="cod-cuerpo">
        {!sonidoListo && !silencio && (
          <button type="button" className="btn primary" onClick={() => setSonidoListo(true)}><Volume2 size={16} aria-hidden /> Tocar para que suene el metrónomo</button>
        )}
        <section className="card cod-ciclo" aria-label="Ciclo y metrónomo">
          <div className="anillo">
            <svg viewBox="0 0 112 112" aria-hidden>
              <circle cx="56" cy="56" r={r} className="pista" />
              <circle cx="56" cy="56" r={r} className="avance" strokeDasharray={largo} strokeDashoffset={largo * (1 - prog)} />
            </svg>
            <div className="num"><div><b>{c.enPausa ? "--:--" : reloj(restante)}</b><small>{c.enPausa ? "verificar ritmo" : "quedan del ciclo"}</small></div></div>
          </div>
          <div className="metro">
            <span className="cod-lbl">Metrónomo</span>
            <div className="bpm"><b>{c.bpm}</b><span>compresiones / min</span></div>
            <div className="pulsos" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={!c.enPausa && i === latido ? "on" : ""} />)}</div>
            <div className="ajuste">
              <button type="button" aria-label="Más lento" onClick={() => cambiar((x) => cambiarBpm(x, -5))}>−5</button>
              <button type="button" aria-label={silencio ? "Activar sonido" : "Silenciar"} onClick={() => { setSilencio((s) => !s); setSonidoListo(true); }}>{silencio ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}</button>
              <button type="button" aria-label="Más rápido" onClick={() => cambiar((x) => cambiarBpm(x, 5))}>+5</button>
            </div>
          </div>
        </section>
        <div className="cod-grid">
          <button type="button" className="cod-bt choque" onClick={() => tocar(choque)}>Choque<small>{c.joules} J · {ETIQUETA_RITMO[c.ritmo]} · llevas {c.choques}</small></button>
          <button type="button" className={`cod-bt epi${epiSeg !== null && epiSeg <= 0 ? " toca" : ""}`} onClick={() => tocar((x, t) => droga(x, t, "Epinefrina", "1 mg"))}>
            Epinefrina 1 mg<small>{epiSeg === null ? "aún no se da" : epiSeg > 0 ? <>próxima en <span className="mono">{reloj(epiSeg)}</span></> : <>toca ahora · hace <span className="mono">{reloj(EPI_SEG - epiSeg)}</span></>}</small>
          </button>
          <button type="button" className="cod-bt" onClick={() => tocar((x, t) => droga(x, t, "Amiodarona", dosisAmiodarona(x)))}>Amiodarona<small>{dosisAmiodarona(c)} · {c.amiodaronas === 0 ? "1ª dosis" : "2ª dosis"}</small></button>
          <button type="button" className="cod-bt" onClick={() => setHoja("otra")}>Otra droga<small>lidocaína, bicarbonato…</small></button>
          <button type="button" className="cod-bt" onClick={() => setHoja("via")}>Vía aérea avanzada<small>TET o supraglótico</small></button>
          <button type="button" className="cod-bt" onClick={() => { setTexto(""); setHoja("nota"); }}>Nota<small>texto breve</small></button>
        </div>
        <section className="card cod-card cod-sel" aria-label="Ritmo y energía">
          <span className="cod-lbl">Ritmo actual</span>
          <div className="cod-ops" role="group" aria-label="Ritmo actual">
            {RITMOS.map((x) => <button key={x} type="button" aria-pressed={c.ritmo === x} onClick={() => tocar((y, t) => elegirRitmo(y, t, x))}>{x === "ASISTOLIA" ? "Asist." : x}</button>)}
          </div>
          <span className="cod-lbl">Energía del choque</span>
          <div className="cod-ops" role="group" aria-label="Energía del choque">
            {ENERGIAS_J.map((j) => <button key={j} type="button" aria-pressed={c.joules === j} onClick={() => cambiar((y) => elegirJoules(y, j))}>{j}</button>)}
          </div>
        </section>
        <Bitacora c={c} max={6} />
      </div>
      <div className="cod-pie">
        <button type="button" className="rosc" onClick={() => tocar((x, t) => terminar(x, t, true))}>ROSC</button>
        <button type="button" className="fin" onClick={() => setHoja("terminar")}>Terminar sin ROSC</button>
      </div>

      {hoja && (
        <div className="velo-inicio" onClick={() => hoja !== "ritmo" && setHoja(null)}>
          <section className="hoja-mas" role="dialog" aria-label={hoja === "ritmo" ? "Verificar pulso y ritmo" : hoja === "terminar" ? "Terminar sin ROSC" : hoja === "otra" ? "Otra droga" : hoja === "via" ? "Vía aérea avanzada" : "Nota"} onClick={(e) => e.stopPropagation()}>
            <div className="asa" aria-hidden />
            {hoja === "ritmo" && (
              <>
                <h2>Verificar pulso y ritmo</h2>
                <p className="small muted" style={{ textAlign: "center", margin: 0 }}>Pausa menor a 10 segundos · cambiar al reanimador</p>
                <div className="cod-ritmos">
                  {RITMOS.map((x) => (
                    <button key={x} type="button" className={x === "FV" || x === "TVSP" ? "ch" : ""} onClick={() => { tocar((y, t) => ritmoVerificado(y, t, x)); setHoja(null); }}>{ETIQUETA_RITMO[x]}</button>
                  ))}
                  <button type="button" className="ok" onClick={() => { tocar((y, t) => terminar(y, t, true)); setHoja(null); }}>Pulso presente · ROSC</button>
                </div>
              </>
            )}
            {hoja === "terminar" && (
              <>
                <h2>¿Terminar la reanimación sin ROSC?</h2>
                <p className="small muted" style={{ textAlign: "center", margin: 0 }}>Se registra el término ahora · {reloj(total)}</p>
                <button type="button" className="btn grande" style={{ background: "var(--crit)", borderColor: "var(--crit)", color: "#fff" }} onClick={() => { tocar((x, t) => terminar(x, t, false)); setHoja(null); }}>Sí, terminar</button>
                <button type="button" className="btn grande" onClick={() => setHoja(null)}>Seguir con el código</button>
              </>
            )}
            {hoja === "otra" && (
              <>
                <h2>Otra droga</h2>
                <div className="elige-cama">
                  {OTRAS_DROGAS.map(([d, dosis]) => (
                    <button key={d} type="button" className="fila-cama" onClick={() => { tocar((x, t) => droga(x, t, d, dosis)); setHoja(null); avisar(`${d} ${dosis} registrada.`); }}>
                      <b style={{ minWidth: 0, flex: 1 }}>{d}</b><span className="muted" style={{ flex: "none" }}>{dosis}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {hoja === "via" && (
              <>
                <h2>Vía aérea avanzada</h2>
                <div className="elige-cama">
                  {["Intubación orotraqueal", "Dispositivo supraglótico"].map((v) => (
                    <button key={v} type="button" className="fila-cama" onClick={() => { tocar((x, t) => nota(x, t, `Vía aérea avanzada: ${v.toLowerCase()}`)); setHoja(null); }}><b style={{ minWidth: 0, flex: 1 }}>{v}</b></button>
                  ))}
                </div>
                <p className="small muted" style={{ margin: 0 }}>La intubación queda en la bitácora. Si el paciente queda intubado, regístrala también en Eventos de su cama.</p>
              </>
            )}
            {hoja === "nota" && (
              <>
                <h2>Nota</h2>
                <textarea id="pcr-nota" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
                <button type="button" className="btn primary grande" onClick={() => { tocar((x, t) => nota(x, t, texto)); setHoja(null); }}>Anotar</button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Bitacora({ c, max }: { c: CodigoPcr; max?: number }) {
  const lineas = [...c.bitacora].reverse().slice(0, max ?? c.bitacora.length);
  return (
    <section className="card cod-card" aria-label="Bitácora">
      <span className="cod-lbl">Bitácora{max && c.bitacora.length > max ? ` · últimas ${max} de ${c.bitacora.length}` : ""}</span>
      <ol className="cod-bit">
        {lineas.map((e, i) => <li key={`${e.hora}-${i}`}><span className="mono h">{e.hora.slice(0, 5)}</span><span className="mono e">+{e.transcurrido}</span><span>{e.texto}</span></li>)}
      </ol>
    </section>
  );
}
