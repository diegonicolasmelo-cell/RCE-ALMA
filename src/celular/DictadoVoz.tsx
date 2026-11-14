/**
 * Dictado por voz en el control. Tres momentos:
 *  1. Micrófono: un botón redondo abajo a la derecha.
 *  2. Escuchando: una franja baja (no una ventana) con el texto y la guía de datos; el formulario
 *     sigue a la vista y se recorre con el dedo. Cada dato oído aparece en gris junto a su casilla
 *     y la pantalla baja sola hasta él, salvo que la persona esté moviendo el formulario.
 *  3. Revisión: se resuelve lo dudoso y se eligen los datos; «Aplicar» los escribe en el control.
 *     Nunca guarda: se guarda con el botón de siempre.
 * La sesión queda atada al paciente: si cambia la cama, el componente se desmonta y se cancela.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, Mic, MicOff } from "lucide-react";
import {
  ETIQUETA_MODALIDAD,
  aplicarDictado,
  casillaDe,
  etiquetaDictado,
  guiaDictado,
  interpretarDictado,
  nombreCama,
  resolverDudas,
  textoDato,
  valorActual
} from "@core/index";
import type { BorradorControl, CampoDictado, OpcionDuda, ResultadoDictado } from "@core/index";
import type { ContextoCama } from "./contextoCama";
import { escuchar, mensajeErrorVoz } from "./voz";
import type { ErrorVoz, SesionVoz } from "./voz";

type Fase = "inactivo" | "escuchando" | "revision" | "error";

/** Lo oído, por casilla del formulario («pa» junta sistólica y diastólica; «gcs» el Glasgow). */
export function oidosPorCasilla(r: ResultadoDictado | null, artificial: boolean): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  if (!r) return m;
  const v = (c: string): string | undefined => r.datos.find((d) => d.campo === c)?.valor;
  if (v("pas") || v("pad")) m.set("pa", `${v("pas") ?? "?"}/${v("pad") ?? "?"}`);
  if (v("gcsO") || v("gcsV") || v("gcsM")) m.set("gcs", `${v("gcsO") ?? "·"}-${artificial ? "T" : v("gcsV") ?? "·"}-${v("gcsM") ?? "·"}`);
  for (const d of r.datos) if (casillaDe(d.campo) === d.campo) m.set(d.campo, textoDato(d));
  for (const d of r.dudas) for (const o of d.opciones) if (o.campo && !m.has(casillaDe(o.campo))) m.set(casillaDe(o.campo), "¿?");
  return m;
}

export function DictadoVoz({ ctx, alOir, alAplicar }: {
  ctx: ContextoCama;
  /** Lo que se va oyendo, para mostrarlo en gris junto a cada casilla. */
  alOir: (oidos: ReadonlyMap<string, string>) => void;
  /** Se aplicaron datos: casillas a marcar y el borrador anterior para deshacer. */
  alAplicar: (casillas: ReadonlySet<string>, anterior: BorradorControl) => void;
}) {
  const { ep, b, editar } = ctx;
  const [fase, setFase] = useState<Fase>("inactivo");
  const [confirmado, setConfirmado] = useState("");
  const [enCurso, setEnCurso] = useState("");
  const [error, setError] = useState<ErrorVoz | null>(null);
  const [elecciones, setElecciones] = useState<Record<string, OpcionDuda>>({});
  const [fuera, setFuera] = useState<ReadonlySet<CampoDictado>>(new Set());
  const sesion = useRef<SesionVoz | null>(null);
  /** Antes de este momento la persona estaba moviendo el formulario: no se le mueve la pantalla. */
  const tocandoHasta = useRef(0);
  const ultimoVisto = useRef<string | null>(null);

  const texto = `${confirmado} ${enCurso}`.trim();
  const artificial = ep.viaAereaActual !== "NATURAL";
  // Se interpreta contra el control tal como estaba al empezar a dictar (no contra lo ya aplicado).
  const r = useMemo(() => (texto ? interpretarDictado(texto, b.modalidad, ep.viaAereaActual, { b, anterior: ctx.ultimo }) : null), [texto, b, ep.viaAereaActual, ctx.ultimo]);

  // Al salir (otra cama, otra pestaña): se corta el micrófono y se borran las marcas grises.
  useEffect(() => () => {
    sesion.current?.cancelar();
    document.body.classList.remove("dictando");
    alOir(new Map());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras se escucha: lo oído junto a cada casilla y la pantalla sigue al último dato.
  useEffect(() => {
    if (fase !== "escuchando") return;
    const oidos = oidosPorCasilla(r, artificial);
    alOir(oidos);
    const ultimo = [...oidos.keys()].at(-1) ?? null;
    if (ultimo && ultimo !== ultimoVisto.current && Date.now() > tocandoHasta.current) {
      ultimoVisto.current = ultimo;
      document.querySelector<HTMLElement>(`#cuerpo [data-voz="${ultimo}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [r, fase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tocar o deslizar el formulario pausa el seguimiento automático por unos segundos.
  useEffect(() => {
    if (fase !== "escuchando") return;
    const cuerpo = document.getElementById("cuerpo");
    const tocar = (): void => { tocandoHasta.current = Date.now() + 3500; };
    cuerpo?.addEventListener("touchstart", tocar, { passive: true });
    cuerpo?.addEventListener("wheel", tocar, { passive: true });
    document.body.classList.add("dictando");
    return () => {
      cuerpo?.removeEventListener("touchstart", tocar);
      cuerpo?.removeEventListener("wheel", tocar);
      document.body.classList.remove("dictando");
    };
  }, [fase]);

  const empezar = (prefijo = ""): void => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setError(null);
    setConfirmado(prefijo);
    setEnCurso("");
    ultimoVisto.current = null;
    const s = escuchar({
      alTexto: (c, e) => { setConfirmado(`${prefijo} ${c}`.trim()); setEnCurso(e); },
      alError: (e) => { sesion.current = null; setError(e); setFase("error"); alOir(new Map()); },
      alTerminar: () => { sesion.current = null; }
    });
    if (!s) {
      setError("otro");
      setFase("error");
      return;
    }
    sesion.current = s;
    setFase("escuchando");
  };
  const revisar = (): void => {
    sesion.current?.detener();
    setConfirmado(texto);
    setEnCurso("");
    setElecciones({});
    setFuera(new Set());
    alOir(new Map());
    setFase("revision");
  };
  const cancelar = (): void => {
    sesion.current?.cancelar();
    sesion.current = null;
    setConfirmado("");
    setEnCurso("");
    alOir(new Map());
    setFase("inactivo");
  };

  const pendientes = r ? r.dudas.filter((d) => !elecciones[d.id]).length : 0;
  const datosFinales = r ? resolverDudas(r, elecciones).filter((d) => !fuera.has(d.campo)) : [];
  const aplicar = (): void => {
    if (!r || pendientes > 0 || datosFinales.length === 0) return;
    const anterior = b;
    editar((x) => aplicarDictado(x, datosFinales));
    const casillas = new Set(datosFinales.map((d) => casillaDe(d.campo)));
    alAplicar(casillas, anterior);
    setConfirmado("");
    setFase("inactivo");
  };

  if (fase === "inactivo") {
    return (
      <button type="button" className="mic-dictar" aria-label="Dictar por voz" onClick={() => empezar()}>
        <Mic size={26} aria-hidden />
      </button>
    );
  }

  if (fase === "error") {
    return (
      <div className="velo-inicio fijo" onClick={cancelar}>
        <div className="hoja-mas" role="dialog" aria-label="No se pudo usar el micrófono" onClick={(e) => e.stopPropagation()}>
          <div className="asa" aria-hidden />
          <h2>No se pudo usar el micrófono</h2>
          <div className="voz-error"><MicOff size={20} aria-hidden /><span>{mensajeErrorVoz(error ?? "otro")}</span></div>
          <p className="small muted" style={{ margin: 0 }}>No se perdió nada de lo que ya habías anotado.</p>
          <div className="voz-botones">
            <button type="button" className="btn" onClick={() => empezar(confirmado)}>Reintentar</button>
            <button type="button" className="btn primary" onClick={cancelar}>Seguir con el teclado</button>
          </div>
        </div>
      </div>
    );
  }

  const candado = <span className="voz-cama"><Lock size={13} aria-hidden /> {nombreCama(ep.cama)}</span>;

  if (fase === "escuchando") {
    const guia = guiaDictado(r?.modalidad ?? b.modalidad, b);
    const oidos = oidosPorCasilla(r, artificial);
    // Infusiones dictadas que aun no estan en curso: tambien se ven en la guia.
    const nuevas = (r?.datos ?? []).filter((d) => d.campo.startsWith("inf:") && !guia.some((g) => g.campo === d.campo));
    return (
      <div className="barra-dictado" aria-label="Dictado por voz" role="region">
        <div className="voz-cab">
          <span className="voz-escucha" aria-live="polite"><i /><i /><i /> Escuchando</span>
          {candado}
        </div>
        <p className="voz-linea">{texto ? <>{confirmado.split(" ").slice(-14).join(" ")} <span className="en-curso">{enCurso}</span></> : <span className="en-curso">Di los datos de corrido: «frecuencia cardíaca 93, presión 120 sobre 70, PEEP 8…»</span>}</p>
        <div className="voz-guia" aria-label="Guía de datos">
          {guia.map((g) => {
            const v = oidos.get(g.campo);
            return <span key={g.campo} className={v === "¿?" ? "duda" : v ? "ok" : ""}>{g.etiqueta}{v && v !== "¿?" ? ` ${v}` : ""}</span>;
          })}
          {nuevas.map((d) => <span key={d.campo} className="ok">{etiquetaDictado(d.campo, r?.modalidad ?? b.modalidad)} {textoDato(d)}</span>)}
        </div>
        <div className="voz-botones">
          <button type="button" className="btn" onClick={cancelar}>Cancelar</button>
          <button type="button" className="btn primary" id="btn-voz-revisar" onClick={revisar}>Revisar</button>
        </div>
      </div>
    );
  }

  // ---------------- Revisión ----------------
  return (
    <div className="velo-inicio fijo">
      <div className="hoja-mas voz-revision" role="dialog" aria-label="Revisa lo dictado">
        <div className="asa" aria-hidden />
        <div className="voz-cab"><h2>Revisa lo dictado</h2>{candado}</div>
        {!r || (r.datos.length === 0 && r.dudas.length === 0) ? (
          <p className="muted" style={{ margin: 0 }}>No entendí ningún dato. Vuelve a dictar o corrige el texto.</p>
        ) : null}
        {r && r.dudas.length > 0 && (
          <div className="voz-grupo duda">
            <div className="tit"><span>Por resolver</span><span>{pendientes}</span></div>
            {r.dudas.map((d) => (
              <div key={d.id} className="voz-duda" role="group" aria-label={d.texto}>
                <span>{d.texto}</span>
                <div className="ops">
                  {d.opciones.map((o) => (
                    <button key={o.etiqueta} type="button" aria-pressed={elecciones[d.id]?.etiqueta === o.etiqueta} onClick={() => setElecciones((e) => ({ ...e, [d.id]: o }))}>{o.etiqueta}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {r && datosFinales.length + fuera.size > 0 && (
          <div className="voz-grupo">
            <div className="tit"><span>Se aplicarán</span><span>{datosFinales.length}</span></div>
            {resolverDudas(r, elecciones).map((d) => {
              const antes = d.campo === "modalidad" ? ETIQUETA_MODALIDAD[b.modalidad] : valorActual(b, d.campo);
              const nuevo = textoDato(d);
              const activo = !fuera.has(d.campo);
              // «2.4» y «2,4» son el mismo número: no cuenta como cambio.
              const num = (t: string): number => Number(t.replace(",", "."));
              const cambia = Boolean(antes) && nuevo !== "suspender" && antes !== nuevo && !(Number.isFinite(num(antes)) && num(antes) === num(nuevo));
              return (
                <label key={d.campo} className={`voz-dato${activo ? "" : " fuera"}`}>
                  <input type="checkbox" checked={activo} onChange={() => setFuera((s) => { const n = new Set(s); if (n.has(d.campo)) n.delete(d.campo); else n.add(d.campo); return n; })} />
                  <span>{etiquetaDictado(d.campo, r.modalidad)}{d.igual && <small>igual al control anterior</small>}{d.veces > 1 && <small>dicho {d.veces} veces, coincide</small>}{cambia && <small>cambia lo que había</small>}</span>
                  <b className="mono">{cambia && <s>{antes}</s>}{nuevo === "suspender" ? "Suspender" : nuevo}{d.campo === "spo2" || d.campo === "fio2" ? " %" : ""}</b>
                </label>
              );
            })}
          </div>
        )}
        {r && r.noAplica.length > 0 && (
          <div className="voz-grupo">
            <div className="tit"><span>No se aplican</span><span>{r.noAplica.length}</span></div>
            {r.noAplica.map((t) => <p key={t} className="voz-no">{t}</p>)}
          </div>
        )}
        <details className="voz-texto">
          <summary>Texto oído (se puede corregir)</summary>
          <textarea id="voz-texto" rows={3} value={confirmado} onChange={(e) => { setConfirmado(e.target.value); setElecciones({}); setFuera(new Set()); }} />
        </details>
        <div className="voz-botones">
          <button type="button" className="btn" onClick={() => empezar(confirmado)}>Seguir dictando</button>
          <button type="button" className="btn primary" id="btn-voz-aplicar" disabled={pendientes > 0 || datosFinales.length === 0} onClick={aplicar}>
            {pendientes > 0 ? `Falta resolver ${pendientes}` : `Aplicar ${datosFinales.length} al control`}
          </button>
        </div>
        <button type="button" className="linkbtn" style={{ alignSelf: "center" }} onClick={cancelar}>Descartar el dictado</button>
      </div>
    </div>
  );
}
