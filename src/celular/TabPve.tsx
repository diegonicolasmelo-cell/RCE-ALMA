/**
 * PVE como el registro simple: una sola pantalla que sigue el paso en que va la prueba.
 *
 *   checklist (8 criterios) -> control de inicio (parte la PVE) -> control de termino
 *   contrastado con el inicio -> tolerada / no tolerada -> extubacion programada (queda
 *   con...) o superada sin extubar -> controles post extubacion (30, 60, 120 min, 48 h) ->
 *   cierre: falla post extubacion -> reintubacion.
 *
 * Filas con la etiqueta a la izquierda y la casilla a la derecha, el teclado numerico propio
 * y la hora REAL de cada paso (se sugiere la de ahora y se corrige). Todo queda como eventos.
 */

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  CRITERIOS_PVE,
  ETIQUETA_DISPOSITIVO,
  avisoMenos24hVm,
  contrastarControlesPve,
  criteriosAptos,
  esViaAereaArtificial,
  estadoFlujoPve,
  horasDeVm,
  momentoDeEvaluacion,
  momentoPreciso,
  motivoSinPve,
  registrosPve
} from "@core/index";
import type { DispositivoPosterior, EventoClinico, LecturasPve, MomentoPostExtub } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { horaDe } from "../app/util";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { TECLADO_PROPIO } from "./TecladoPropio";

type Texto = Record<string, string>;
const num = (v: string | undefined): number | null => {
  const n = Number((v ?? "").replace(",", "."));
  return (v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};
const TRABAJO = ["Sin aumento", "Aumentado"];
const SECRECIONES = ["Escasas", "Moderadas", "Abundantes"];
const MANEJO = ["Maneja", "No maneja"];
const QUEDA: readonly DispositivoPosterior[] = ["CNAF", "VMNI", "O2_CONVENCIONAL", "AIRE_AMBIENTE"];

/** "Se guarda: hoy 09:55 (10-11)". */
function cuando(hora: string): string {
  const m = momentoDeEvaluacion(hora, new Date());
  if (!m) return "Esa hora queda a más de 12 h: revísala.";
  const dia = m.toDateString() === new Date().toDateString() ? "hoy" : "ayer";
  return `Se guarda: ${dia} ${horaDe(m)} (${String(m.getDate()).padStart(2, "0")}-${String(m.getMonth() + 1).padStart(2, "0")})`;
}
const dif = (a: number | null, b: number | null): string => {
  if (a === null || b === null) return "";
  const d = Math.round((b - a) * 10) / 10;
  return d === 0 ? "=" : d > 0 ? `+${String(d).replace(".", ",")}` : String(d).replace(".", ",");
};
const gcsTexto = (o?: string, v?: string, m?: string, tubo = true): string =>
  o || v || m ? `${o || "–"}-${tubo ? "T" : v || "–"}-${m || "–"}` : "";

function Fila({ etiqueta, unidad, ayuda, children, clase = "" }: { etiqueta: ReactNode; unidad?: string; ayuda?: ReactNode; children: ReactNode; clase?: string }) {
  return (
    <div className={`fila ${clase}`}>
      <span className="et">
        {etiqueta}
        {unidad && <span className="u"> {unidad}</span>}
        {ayuda && <span className="ayuda">{ayuda}</span>}
      </span>
      {children}
    </div>
  );
}

export function TabPve({ ctx }: { ctx: ContextoCama }) {
  const { ep, eventos, ahora, rutAutor, ultimo, controles } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const flujo = estadoFlujoPve(eventos, ahora);
  const conTet = ep.viaAereaActual === "TET";
  const bloqueo = motivoSinPve(ep.viaAereaActual, ultimo ? { modalidad: ultimo.ventilacion.modalidad, registradoEn: ultimo.registradoEn } : null, eventos);
  const aviso24 = conTet ? avisoMenos24hVm(horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora)) : null;

  const [f, setF] = useState<Texto>({});
  const [crit, setCrit] = useState<(boolean | null)[]>(() => CRITERIOS_PVE.map(() => null));
  const [fuera, setFuera] = useState(false);
  const [hora, setHora] = useState(horaDe(new Date()));
  const [reeval, setReeval] = useState<MomentoPostExtub | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string): void => setF((x) => ({ ...x, [k]: v }));
  const limpiar = (): void => {
    setF({});
    setHora(horaDe(new Date()));
    setMsg(null);
  };

  /** Un evento con la hora REAL del paso (puede ser unos minutos antes de anotarlo). */
  const ev = async (e: Record<string, unknown>): Promise<boolean> => {
    const t = new Date();
    const real = momentoDeEvaluacion(hora, t);
    if (!real) {
      setMsg("Revisa la hora: la real, de las últimas 12 horas.");
      return false;
    }
    await repo.registrarEvento({ ...baseEvento(ep, rutAutor, momentoPreciso(real, t)), ...e } as EventoClinico);
    return true;
  };

  const casilla = (k: string, etiqueta: string): JSX.Element => (
    <input id={`pve-${k}`} className="num" inputMode={TECLADO_PROPIO ? "none" : "decimal"} enterKeyHint="next" autoComplete="off" aria-label={etiqueta} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
  );
  const ops = (k: string, etiqueta: string, opciones: readonly string[], extra?: string): JSX.Element => (
    <div className="fila bar">
      <span className="et">{etiqueta}{extra && <span className="u"> {extra}</span>}</span>
      <div className="ops txt" role="group" aria-label={etiqueta}>
        {opciones.map((o) => <button key={o} type="button" aria-pressed={f[k] === o} onClick={() => set(k, f[k] === o ? "" : o)}>{o}</button>)}
      </div>
    </div>
  );
  const horaFila = (etiqueta: string): JSX.Element => (
    <Fila etiqueta={etiqueta} ayuda={cuando(hora)}>
      <input id="pve-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
    </Fila>
  );

  // --- Hoja de lecturas (inicio y termino): con `ref`, cada fila muestra el valor de inicio y la diferencia ---
  const LECT: readonly (readonly [keyof LecturasPve, string, string])[] = [["fc", "Frec. cardiaca", "lpm"], ["fr", "Frec. respiratoria", "rpm"], ["pas", "P. sistólica", "mmHg"], ["pad", "P. diastólica", "mmHg"], ["spo2", "SpO₂", "%"]];
  const lecturas = (ref: LecturasPve | null): JSX.Element => (
    <>
      {LECT.map(([k, l, u]) => (
        <Fila key={k} etiqueta={l} unidad={u} ayuda={ref ? <span className="esc">al inicio {String(ref[k] ?? "—")}{dif(ref[k] as number | null, num(f[k]))? ` · ${dif(ref[k] as number | null, num(f[k]))}` : ""}</span> : undefined}>
          {casilla(k, l)}
        </Fila>
      ))}
      <Fila etiqueta="Glasgow" unidad="O · T · M" clase="gcs" ayuda={ref?.glasgow ? `al inicio ${ref.glasgow}` : undefined}>
        <div className="tres">
          <label><span>O</span>{casilla("gcsO", "Glasgow ocular")}</label>
          <label><span>V</span><b className="calc t" aria-label="Verbal T">T</b></label>
          <label><span>M</span>{casilla("gcsM", "Glasgow motor")}</label>
        </div>
      </Fila>
      <Fila etiqueta="Volumen minuto" unidad="L/min" ayuda={ref ? <span className="esc">al inicio {String(ref.volMinuto ?? "—")}{dif(ref.volMinuto, num(f["vm"])) ? ` · ${dif(ref.volMinuto, num(f["vm"]))}` : ""}</span> : undefined}>
        {casilla("vm", "Volumen minuto")}
      </Fila>
      {ops("trab", "Trabajo respiratorio", TRABAJO, ref?.trabajoResp ? `al inicio: ${ref.trabajoResp}` : undefined)}
      {ops("sec", "Secreciones bronquiales", SECRECIONES, ref?.secreciones ? `al inicio: ${ref.secreciones}` : undefined)}
    </>
  );
  const leer = (): LecturasPve | null => {
    const l: LecturasPve = {
      fc: num(f["fc"]), fr: num(f["fr"]), pas: num(f["pas"]), pad: num(f["pad"]), spo2: num(f["spo2"]), gcs: null,
      glasgow: gcsTexto(f["gcsO"], undefined, f["gcsM"]) || undefined, volMinuto: num(f["vm"]), trabajoResp: f["trab"] ?? "", secreciones: f["sec"] ?? ""
    } as LecturasPve;
    if ([l.fc, l.fr, l.pas, l.pad, l.spo2].some((x) => x === null)) {
      setMsg("Falta: FC, FR, presión arterial y SpO₂.");
      return null;
    }
    return l;
  };

  // --- Acciones ---
  const registrarChecklist = async (): Promise<void> => {
    if (crit.some((c) => c === null)) return setMsg("Marca los 8 criterios: cumple o no cumple.");
    const criterios = crit as boolean[];
    if (!(await ev({ tipo: "EVALUACION_PVE", criterios, apto: criteriosAptos(criterios), datos: (f["datos"] ?? "").trim(), extubacionFueraProtocolo: fuera }))) return;
    setCrit(CRITERIOS_PVE.map(() => null));
    limpiar();
    avisar(criteriosAptos(criterios) ? "Cumple los 8 criterios: puedes iniciar la PVE." : "No cumple los criterios: la PVE no se inicia este turno.");
  };
  const iniciar = async (): Promise<void> => {
    const l = leer();
    if (!l) return;
    if (!(await ev({ tipo: "INICIO_PVE", duracionMin: 30 }))) return;
    await ev({ tipo: "CONTROL_PVE", fase: "INICIAL", lecturas: l });
    avisar(`PVE iniciada a las ${hora}: corre el tiempo.`);
    limpiar();
  };
  const terminar = async (tolerada: boolean): Promise<void> => {
    const l = leer();
    if (!l) return;
    if (!(await ev({ tipo: "CONTROL_PVE", fase: "30MIN", lecturas: l }))) return;
    await ev({ tipo: "FIN_PVE", exitosa: tolerada });
    avisar(tolerada ? "PVE tolerada: registra si se extuba." : "PVE no tolerada: vuelve al soporte. Queda en el historial.");
    limpiar();
  };
  const extubar = async (): Promise<void> => {
    if (!f["queda"]) return setMsg("Indica con qué queda: CNAF, VMNI, O₂ convencional o aire ambiente.");
    if (!(await ev({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: f["queda"] as DispositivoPosterior }))) return;
    avisar(`Extubación registrada a las ${hora}: parten los controles de 30, 60 y 120 min y 48 h.`);
    limpiar();
  };
  const sinExtubar = async (): Promise<void> => {
    if ((f["motivo"] ?? "").trim() === "") return setMsg("Escribe por qué no se extuba.");
    if (!(await ev({ tipo: "PVE_SIN_EXTUBAR", motivo: f["motivo"]!.trim() }))) return;
    avisar("Registrado: PVE superada sin extubar.");
    limpiar();
  };
  const guardarReeval = async (): Promise<void> => {
    if (!reeval) return;
    if (["fc", "fr", "spo2"].some((k) => num(f[k]) === null)) return setMsg("Falta: FC, FR y SpO₂.");
    if (!(await ev({
      tipo: "REEVAL_POST_EXTUB", momento: reeval, fc: num(f["fc"]), pam: num(f["pam"]), gcs: null, glasgow: gcsTexto(f["gcsO"], f["gcsV"], f["gcsM"], false) || undefined,
      fr: num(f["fr"]), fio2: num(f["fio2"]), spo2: num(f["spo2"]), trabajoResp: f["trab"] ?? "", manejoSecreciones: f["man"] ?? ""
    }))) return;
    setReeval(null);
    avisar("Control post extubación registrado.");
    limpiar();
  };
  const cerrar = async (): Promise<void> => {
    if (!f["falla"]) return setMsg("Indica si hubo falla post extubación: Sí o No.");
    if (f["falla"] === "No") {
      if (!(await ev({ tipo: "FALLA_POST_EXTUB", falla: false, hipotesis: "", observaciones: "" }))) return;
      avisar("PVE cerrada sin falla post extubación.");
      return limpiar();
    }
    if (!f["rvia"]) return setMsg("Indica la vía de la reintubación: TET o TQT.");
    if (num(f["rcal"]) === null) return setMsg("Falta el calibre.");
    if (f["rvia"] === "TET" && num(f["rcm"]) === null) return setMsg("Faltan los cm en la arcada.");
    if (!(await ev({ tipo: "FALLA_POST_EXTUB", falla: true, hipotesis: (f["hip"] ?? "").trim(), observaciones: (f["obs"] ?? "").trim() }))) return;
    await ev({ tipo: "REINTUBACION", via: f["rvia"], calibre: f["rcal"]!.trim(), fijacionCm: f["rvia"] === "TET" ? f["rcm"]!.trim() : "" });
    avisar(`Falla post extubación y reintubación registradas: la vía aérea vuelve a ${f["rvia"]} y los días de TOT parten de nuevo.`);
    limpiar();
  };
  const elegirCrit = (e: MouseEvent<HTMLElement>, i: number, v: boolean): void => {
    setCrit((c) => c.map((x, j) => (j === i ? v : x)));
    // Como en el registro simple: al responder, la pantalla avanza a la fila siguiente.
    const fila = e.currentTarget.closest<HTMLElement>(".fila");
    const sig = fila?.nextElementSibling as HTMLElement | null;
    const caja = document.getElementById("cuerpo");
    if (fila && sig && caja) caja.scrollBy({ top: sig.getBoundingClientRect().top - fila.getBoundingClientRect().top, behavior: "smooth" });
  };

  const reg = registrosPve(eventos).at(-1) ?? null;
  const inicioPve = reg?.inicio ?? null;
  const contraste = (r: NonNullable<typeof reg>): JSX.Element | null =>
    r.inicio ? (
      <table className="contraste" aria-label="Contraste inicio y término de la PVE">
        <thead><tr><th /><th>Inicio<br />{r.inicio.hora}</th><th>Término<br />{r.treintaMin?.hora ?? "—"}</th><th>Dif.</th></tr></thead>
        <tbody>
          {contrastarControlesPve(r.inicio.lecturas, r.treintaMin?.lecturas ?? null).map((x) => (
            <tr key={x.etiqueta}><td>{x.etiqueta}</td><td>{x.inicio}</td><td>{x.termino}</td><td>{x.diferencia ?? ""}</td></tr>
          ))}
        </tbody>
      </table>
    ) : null;
  const anteriores = registrosPve(eventos).filter((r) => r.numero !== reg?.numero || (flujo.fase !== "EN_CURSO" && flujo.fase !== "TERMINADA")).reverse();

  const botones = (children: ReactNode): JSX.Element => <div className="row" style={{ gap: 8 }}>{children}</div>;

  return (
    <div className="hoja-simple">
      {bloqueo && !flujo.bloque && !["EN_CURSO", "APTO", "TERMINADA"].includes(flujo.fase) && <div className="notice warn small">{bloqueo}</div>}

      {/* 1 · Checklist */}
      {conTet && !bloqueo && (flujo.fase === "SIN_CHECKLIST" || flujo.fase === "NO_APTO") && (
        <>
          {aviso24 && <div className="notice warn small">{aviso24}</div>}
          {flujo.checklist && !flujo.checklist.apto && (
            <div className="notice crit small">Este turno, {flujo.checklist.hora}: no cumple · {CRITERIOS_PVE.filter((_, i) => !flujo.checklist!.criterios[i]).join(", ")}.</div>
          )}
          <section aria-label="Checklist">
            <h2>Checklist: 8 criterios del protocolo</h2>
            {CRITERIOS_PVE.map((c, i) => (
              <div className="fila bar" key={c}>
                <span className="et">{i + 1}. {c}</span>
                <div className="ops txt" role="group" aria-label={c}>
                  <button type="button" aria-pressed={crit[i] === true} onClick={(e) => elegirCrit(e, i, true)}>Cumple</button>
                  <button type="button" aria-pressed={crit[i] === false} onClick={(e) => elegirCrit(e, i, false)}>No cumple</button>
                </div>
              </div>
            ))}
            <Fila etiqueta="Extubación fuera de protocolo" ayuda="por indicación médica">
              <div className="sw" role="group" aria-label="Extubación fuera de protocolo">
                <button type="button" aria-pressed={!fuera} onClick={() => setFuera(false)}>No</button>
                <button type="button" aria-pressed={fuera} onClick={() => setFuera(true)}>Sí</button>
              </div>
            </Fila>
            {horaFila("Hora de la evaluación")}
            <div style={{ padding: "10px 12px" }}>
              <label className="et" htmlFor="pve-datos">Datos <span className="u">opcional · PaFi, Hb, DVA…</span></label>
              <textarea id="pve-datos" className="nota-eval" maxLength={300} value={f["datos"] ?? ""} onChange={(e) => set("datos", e.target.value)} />
            </div>
          </section>
          {botones(<button type="button" data-guardar className="btn primary" style={{ flex: 1 }} onClick={() => void registrarChecklist()}>Registrar checklist</button>)}
        </>
      )}

      {/* 2 · Control de inicio */}
      {conTet && flujo.fase === "APTO" && (
        <>
          {aviso24 && <div className="notice warn small">{aviso24}</div>}
          <div className="notice good small">Cumple los 8 criterios ({flujo.checklist?.hora}). Al registrar el control de inicio parte la PVE.</div>
          <section aria-label="Control de inicio">
            <h2>Control de inicio</h2>
            {lecturas(null)}
            {horaFila("Hora de inicio")}
          </section>
          {botones(<button type="button" data-guardar className="btn primary" style={{ flex: 1 }} onClick={() => void iniciar()}>Iniciar PVE</button>)}
        </>
      )}

      {/* 3 · Control de termino, contrastado con el inicio */}
      {flujo.fase === "EN_CURSO" && (
        <>
          <div className="crono" id="pve-timer">PVE en curso desde las <b>{inicioPve?.hora ?? "—"}</b> · <b>{flujo.pve.minutosTranscurridos} / {flujo.pve.duracionMin} min</b>{flujo.pve.completa ? " · cumplida" : ""}</div>
          <section aria-label="Control de término">
            <h2>Control de término</h2>
            {lecturas(inicioPve?.lecturas ?? null)}
            {horaFila("Hora de término")}
          </section>
          {botones(
            <>
              <button type="button" data-guardar className="btn primary" style={{ flex: 1 }} onClick={() => void terminar(true)}>Tolerada</button>
              <button type="button" className="btn danger" style={{ flex: 1 }} onClick={() => void terminar(false)}>No tolerada</button>
            </>
          )}
        </>
      )}

      {/* 4 · Tolerada: extubacion o superada sin extubar */}
      {flujo.fase === "TERMINADA" && conTet && (
        <>
          {reg && <section aria-label="PVE tolerada"><h2>PVE tolerada · contraste</h2>{contraste(reg)}</section>}
          <section aria-label="¿Se extuba?">
            <h2>¿Se extuba?</h2>
            <div className="fila bar">
              <span className="et">Queda con</span>
              <div className="ops txt" role="group" aria-label="Queda con">
                {QUEDA.map((q) => <button key={q} type="button" aria-pressed={f["queda"] === q} onClick={() => set("queda", q)}>{ETIQUETA_DISPOSITIVO[q].replace(/^./, (c) => c.toUpperCase())}</button>)}
              </div>
            </div>
            {horaFila("Hora de la extubación")}
            <div style={{ padding: "10px 12px" }}><button type="button" data-guardar className="btn primary" style={{ width: "100%" }} onClick={() => void extubar()}>Registrar extubación programada</button></div>
            <div style={{ padding: "0 12px 12px" }}>
              <label className="et" htmlFor="pve-motivo">O, si no se extuba, por qué</label>
              <input id="pve-motivo" className="texto" maxLength={120} value={f["motivo"] ?? ""} placeholder="Por ejemplo, espera de evaluación de deglución" onChange={(e) => set("motivo", e.target.value)} />
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void sinExtubar()}>PVE superada sin extubar</button>
            </div>
          </section>
        </>
      )}

      {flujo.fase === "CERRADA" && (
        <div className="notice warn small">
          {(() => {
            const sin = [...eventos].reverse().find((e): e is Extract<EventoClinico, { tipo: "PVE_SIN_EXTUBAR" }> => e.tipo === "PVE_SIN_EXTUBAR");
            const fin = [...eventos].reverse().find((e): e is Extract<EventoClinico, { tipo: "FIN_PVE" }> => e.tipo === "FIN_PVE");
            return fin && !fin.exitosa ? `PVE no tolerada a las ${fin.hora}: vuelve al soporte. La próxima se evalúa en otro turno.` : `PVE superada sin extubar${sin ? ` a las ${sin.hora}: ${sin.motivo}` : ""}.`;
          })()}
        </div>
      )}

      {/* 5 · Post extubacion y cierre */}
      {flujo.bloque && (
        <>
          <div className="crono">Extubado a las <b>{flujo.bloque.horaExtubacion}</b></div>
          <section aria-label="Controles post extubación">
            <h2>Controles post extubación</h2>
            {flujo.bloque.momentos.filter((m) => m.id !== "EXTUB").map((m) => (
              <Fila key={m.id} etiqueta={m.etiqueta} ayuda={m.registrado ? "registrado" : `toca ${new Date(m.venceEn).toTimeString().slice(0, 5)}${m.minutosFaltantes > 0 ? ` (en ${m.minutosFaltantes >= 120 ? `${Math.round(m.minutosFaltantes / 60)} h` : `${m.minutosFaltantes} min`})` : ""}`}>
                {m.registrado ? <span className="pill good">Hecho</span> : <button type="button" className={m.minutosFaltantes <= 0 ? "btn primary sm" : "btn sm"} onClick={() => { limpiar(); setReeval(m.id); }}>Registrar</button>}
              </Fila>
            ))}
          </section>
          {reeval && (
            <section aria-label="Control post extubación">
              <h2>Control post extubación · {flujo.bloque.momentos.find((m) => m.id === reeval)?.etiqueta}</h2>
              {([["fc", "FC", "lpm"], ["pam", "PAM", "mmHg"], ["fr", "FR", "rpm"], ["fio2", "FiO₂", "%"], ["spo2", "SpO₂", "%"]] as const).map(([k, l, u]) => <Fila key={k} etiqueta={l} unidad={u}>{casilla(k, l)}</Fila>)}
              <Fila etiqueta="Glasgow" unidad="O · V · M" clase="gcs">
                <div className="tres">
                  <label><span>O</span>{casilla("gcsO", "Glasgow ocular")}</label>
                  <label><span>V</span>{casilla("gcsV", "Glasgow verbal")}</label>
                  <label><span>M</span>{casilla("gcsM", "Glasgow motor")}</label>
                </div>
              </Fila>
              {ops("trab", "Trabajo respiratorio", TRABAJO)}
              {ops("man", "Manejo de secreciones", MANEJO)}
              {horaFila("Hora del control")}
              <div className="row" style={{ gap: 8, padding: "10px 12px" }}>
                <button type="button" data-guardar className="btn primary" style={{ flex: 1 }} onClick={() => void guardarReeval()}>Registrar</button>
                <button type="button" className="btn" onClick={() => setReeval(null)}>Cancelar</button>
              </div>
            </section>
          )}
          {!flujo.bloque.falla && !reeval && (
            <section aria-label="Cierre">
              <h2>Cierre: ¿falla post extubación?</h2>
              {ops("falla", "Falla post extubación", ["No", "Sí"])}
              {f["falla"] === "Sí" && (
                <>
                  <div style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
                    <label className="et" htmlFor="pve-hip">Hipótesis</label>
                    <input id="pve-hip" className="texto" maxLength={120} value={f["hip"] ?? ""} onChange={(e) => set("hip", e.target.value)} />
                    <label className="et" htmlFor="pve-obs">Observaciones</label>
                    <input id="pve-obs" className="texto" maxLength={200} value={f["obs"] ?? ""} onChange={(e) => set("obs", e.target.value)} />
                  </div>
                  <div className="sub-grupo">Reintubación</div>
                  {ops("rvia", "Vía", ["TET", "TQT"])}
                  <Fila etiqueta="Calibre">{casilla("rcal", "Calibre")}</Fila>
                  {f["rvia"] !== "TQT" && <Fila etiqueta="Fijación" unidad="cm en la arcada">{casilla("rcm", "Fijación en cm")}</Fila>}
                </>
              )}
              {f["falla"] && horaFila(f["falla"] === "Sí" ? "Hora de la reintubación" : "Hora del cierre")}
              {f["falla"] && (
                <div style={{ padding: "10px 12px" }}>
                  <button type="button" data-guardar className={f["falla"] === "Sí" ? "btn danger" : "btn primary"} style={{ width: "100%" }} onClick={() => void cerrar()}>
                    {f["falla"] === "Sí" ? "Registrar falla y reintubación" : "Cerrar: sin falla post extubación"}
                  </button>
                </div>
              )}
            </section>
          )}
          {flujo.bloque.falla && <div className={`notice ${flujo.bloque.falla.falla ? "crit" : "good"} small`}>Falla post extubación: {flujo.bloque.falla.falla ? `Sí${flujo.bloque.falla.hipotesis ? ` · ${flujo.bloque.falla.hipotesis}` : ""}` : "No"}</div>}
        </>
      )}

      {!conTet && !flujo.bloque && flujo.fase !== "EN_CURSO" && !esViaAereaArtificial(ep.viaAereaActual) && !bloqueo && <div className="notice warn small">Sin vía aérea artificial: no hay PVE que iniciar.</div>}
      {msg && <div className="notice crit small" role="alert">{msg}</div>}

      {/* Las PVE anteriores, con su contraste */}
      {anteriores.length > 0 && (
        <section aria-label="PVE anteriores">
          <h2>PVE anteriores ({anteriores.length})</h2>
          {anteriores.map((r) => (
            <details key={r.numero} className="pve-prev">
              <summary>{r.fecha.split("-").reverse().join("-")} {r.inicio?.hora ?? ""} · {r.fin ? (r.fin.exitosa ? "tolerada" : "no tolerada") : "sin término"}</summary>
              {contraste(r)}
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
