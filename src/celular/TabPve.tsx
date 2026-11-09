import { useState } from "react";
import {
  CRITERIOS_PVE,
  contrastarControlesPve,
  criteriosAptos,
  esViaAereaArtificial,
  estadoFlujoPve,
  motivoSinPve,
  etiquetaMomentoPostExtub,
  registrosPve
} from "@core/index";
import type { EventoClinico, FasePveControl, LecturasPve, MomentoPostExtub } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { Aviso, Fichas, Pildora, Seg } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";

const num = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

type Texto = Record<string, string>;
const txt = (n: number | null): string => (n === null ? "—" : String(n));

/**
 * Una fila de la hoja de PVE, vertical como el papel: dato a la izquierda, casilla a la
 * derecha. Con `referencia`, al medio va el valor del control de inicio para contrastarlo.
 */
function Fila({ id, etiqueta, unidad, v, set, referencia }: { id: string; etiqueta: string; unidad?: string; v: Texto; set: (x: Texto) => void; referencia?: string }) {
  return (
    <div className="pve-fila">
      <label htmlFor={`pve-${id}`}>
        {etiqueta}
        {unidad && <span className="muted"> {unidad}</span>}
      </label>
      {referencia !== undefined && <span className="pve-ref mono" aria-label={`${etiqueta} al inicio`}>{referencia}</span>}
      <input id={`pve-${id}`} inputMode="decimal" autoComplete="off" value={v[id] ?? ""} onChange={(e) => set({ ...v, [id]: e.target.value })} />
    </div>
  );
}

/** Cabecera de las columnas cuando se contrasta con el inicio. */
function CabeceraContraste({ horaInicio, titulo }: { horaInicio: string; titulo: string }) {
  return (
    <div className="pve-fila pve-cab" aria-hidden="true">
      <span>Parámetro</span>
      <span>Inicio {horaInicio}</span>
      <span>{titulo}</span>
    </div>
  );
}

/** El control de inicio y el de termino lado a lado, con la diferencia. */
function ContrastePve({ inicio, termino, horaInicio, horaTermino }: { inicio: LecturasPve; termino: LecturasPve | null; horaInicio: string; horaTermino: string | null }) {
  const filas = contrastarControlesPve(inicio, termino);
  return (
    <div className="pve-contraste" aria-label="Contraste inicio y término de la PVE">
      <table>
        <thead>
          <tr><th>Parámetro</th><th className="ini">Inicio<br /><span className="mono">{horaInicio}</span></th><th className="ter">Término<br /><span className="mono">{horaTermino ?? "pendiente"}</span></th><th>Dif.</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta}>
              <th scope="row">{f.etiqueta}{f.unidad && <span className="muted"> {f.unidad}</span>}</th>
              <td className="ini mono">{f.inicio}</td>
              <td className="ter mono">{f.termino}</td>
              <td className="mono">{f.diferencia ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TRABAJO = [{ valor: "Sin aumento", texto: "Sin aumento" }, { valor: "Aumentado", texto: "Aumentado" }];
const SECRECIONES = [{ valor: "Escasas", texto: "Escasas" }, { valor: "Moderadas", texto: "Moderadas" }, { valor: "Abundantes", texto: "Abundantes" }];
const MANEJO = [{ valor: "Maneja", texto: "Maneja" }, { valor: "No maneja", texto: "No maneja" }];

/** Hoja de registro de PVE: Hora, FC, PA, FR, SpO2, GCS, Volumen minuto, Trabajo respiratorio, Secreciones. */
function FormControlPve({
  titulo,
  boton,
  onGuardar,
  onCancelar,
  inicio
}: {
  titulo: string;
  boton: string;
  onGuardar: (l: LecturasPve) => void;
  onCancelar?: () => void;
  /** El control de inicio, para tenerlo al lado al anotar el de termino. */
  inicio?: { readonly lecturas: LecturasPve; readonly hora: string };
}) {
  const avisar = useApp((s) => s.avisar);
  const [v, setV] = useState<Texto>({});
  const guardar = (): void => {
    const l: LecturasPve = {
      fc: num(v["fc"] ?? ""), pas: num(v["pas"] ?? ""), pad: num(v["pad"] ?? ""), fr: num(v["fr"] ?? ""),
      spo2: num(v["spo2"] ?? ""), gcs: num(v["gcs"] ?? ""), volMinuto: num(v["vm"] ?? ""),
      trabajoResp: v["trab"] ?? "", secreciones: v["sec"] ?? ""
    };
    const falta = (["fc", "pas", "pad", "fr", "spo2"] as const).filter((k) => l[k] === null);
    if (falta.length > 0) return avisar("Falta: frecuencia cardíaca, presión arterial, FR y SpO₂.");
    onGuardar(l);
  };
  return (
    <div className="card stack" style={{ padding: 12, gap: 10 }}>
      <b>{titulo}</b>
      <div className={`pve-hoja${inicio ? " con-ref" : ""}`}>
        {inicio && <CabeceraContraste horaInicio={inicio.hora} titulo="Ahora" />}
        <Fila id="fc" etiqueta="Frec. cardiaca" unidad="lpm" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.fc) } : {})} />
        <Fila id="fr" etiqueta="Frec. respiratoria" unidad="rpm" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.fr) } : {})} />
        <Fila id="pas" etiqueta="P. sistólica" unidad="mmHg" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.pas) } : {})} />
        <Fila id="pad" etiqueta="P. diastólica" unidad="mmHg" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.pad) } : {})} />
        <Fila id="spo2" etiqueta="SpO₂" unidad="%" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.spo2) } : {})} />
        <Fila id="gcs" etiqueta="GCS" unidad="3-15" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.gcs) } : {})} />
        <Fila id="vm" etiqueta="Volumen minuto" unidad="L/min" v={v} set={setV} {...(inicio ? { referencia: txt(inicio.lecturas.volMinuto) } : {})} />
      </div>
      <div><div className="small ink2">Trabajo respiratorio{inicio?.lecturas.trabajoResp ? ` · al inicio: ${inicio.lecturas.trabajoResp}` : ""}</div><Fichas etiqueta="Trabajo respiratorio" valor={v["trab"] ?? null} opciones={TRABAJO} onCambio={(x) => setV({ ...v, trab: x })} /></div>
      <div><div className="small ink2">Secreciones bronquiales{inicio?.lecturas.secreciones ? ` · al inicio: ${inicio.lecturas.secreciones}` : ""}</div><Fichas etiqueta="Secreciones bronquiales" valor={v["sec"] ?? null} opciones={SECRECIONES} onCambio={(x) => setV({ ...v, sec: x })} /></div>
      <div className="row">
        <button type="button" className="btn primary" onClick={guardar}>{boton}</button>
        {onCancelar && <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>}
      </div>
    </div>
  );
}

function FormReeval({ momento, onGuardar, onCancelar }: { momento: MomentoPostExtub; onGuardar: (v: Texto) => void; onCancelar: () => void }) {
  const avisar = useApp((s) => s.avisar);
  const [v, setV] = useState<Texto>({});
  return (
    <div className="card stack" style={{ padding: 12, gap: 10 }}>
      <b>Reevaluación post extubación · {etiquetaMomentoPostExtub(momento)}</b>
      <div className="pve-hoja">
        <Fila id="fc" etiqueta="FC" unidad="lpm" v={v} set={setV} />
        <Fila id="pam" etiqueta="PAM" unidad="mmHg" v={v} set={setV} />
        <Fila id="gcs" etiqueta="GCS" unidad="3-15" v={v} set={setV} />
        <Fila id="fr" etiqueta="FR" unidad="rpm" v={v} set={setV} />
        <Fila id="fio2" etiqueta="FiO₂" unidad="%" v={v} set={setV} />
        <Fila id="spo2" etiqueta="SpO₂" unidad="%" v={v} set={setV} />
      </div>
      <div><div className="small ink2">Trabajo respiratorio</div><Fichas etiqueta="Trabajo respiratorio" valor={v["trab"] ?? null} opciones={TRABAJO} onCambio={(x) => setV({ ...v, trab: x })} /></div>
      <div><div className="small ink2">Manejo de secreciones</div><Fichas etiqueta="Manejo de secreciones" valor={v["man"] ?? null} opciones={MANEJO} onCambio={(x) => setV({ ...v, man: x })} /></div>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => (["fc", "fr", "spo2"] as const).some((k) => num(v[k] ?? "") === null) ? avisar("Falta: FC, FR y SpO₂.") : onGuardar(v)}>Registrar</button>
        <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

const hhmm = (iso: string): string => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });

export function TabPve({ ctx }: { ctx: ContextoCama }) {
  const { ep, eventos, ahora, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const flujo = estadoFlujoPve(eventos, ahora);
  // La PVE de hoy: su control de inicio y el de termino (30 min), para contrastarlos.
  const reg = registrosPve(eventos).at(-1) ?? null;
  const inicioPve = reg?.inicio ? { lecturas: reg.inicio.lecturas, hora: reg.inicio.hora } : null;
  const verContraste = inicioPve !== null && reg?.treintaMin != null && (flujo.fase === "EN_CURSO" || flujo.fase === "TERMINADA" || flujo.bloque !== null);
  const artificial = esViaAereaArtificial(ep.viaAereaActual);
  // Una PVE nueva: solo con TET y el ultimo control en CPAP+PS posterior al tubo actual.
  const ult = ctx.ultimo;
  const bloqueo = motivoSinPve(ep.viaAereaActual, ult ? { modalidad: ult.ventilacion.modalidad, registradoEn: ult.registradoEn } : null, eventos);
  const conTet = ep.viaAereaActual === "TET";
  const [marcas, setMarcas] = useState<(boolean | null)[]>(() => Array<boolean | null>(CRITERIOS_PVE.length).fill(null));
  const [datos, setDatos] = useState("");
  const [fuera, setFuera] = useState(false);
  const [formulario, setFormulario] = useState<"inicial" | "30" | "extub" | MomentoPostExtub | "falla" | null>(null);
  const [falla, setFalla] = useState<{ si: boolean | null; hip: string; obs: string }>({ si: null, hip: "", obs: "" });
  const [reint, setReint] = useState<{ via: "TET" | "TQT" | null; cal: string; fij: string }>({ via: "TET", cal: "", fij: "" });

  /** Falla post extubacion: se reintuba aqui mismo, con el evento de siempre (cambia la via aerea del episodio). */
  const reintubar = async (): Promise<void> => {
    if (!reint.via) return avisar("Indica la vía: TET o TQT.");
    if (reint.cal.trim() === "") return avisar("Falta el calibre.");
    await ev({ tipo: "REINTUBACION", via: reint.via, calibre: reint.cal.trim(), fijacionCm: reint.fij.trim() });
    setReint({ via: "TET", cal: "", fij: "" });
    avisar(`Reintubado: la vía aérea queda en ${reint.via} ${reint.cal.trim()}.`);
  };

  const ev = async (e: Record<string, unknown>): Promise<void> => {
    await repo.registrarEvento({ ...baseEvento(ep, rutAutor, new Date()), ...e } as EventoClinico);
  };

  const registrarChecklist = async (): Promise<void> => {
    if (marcas.some((m) => m === null)) return avisar("Marca los 8 criterios: Sí o No.");
    const criterios = marcas as boolean[];
    await ev({ tipo: "EVALUACION_PVE", criterios, apto: criteriosAptos(criterios), datos, extubacionFueraProtocolo: fuera });
    setMarcas(Array<boolean | null>(CRITERIOS_PVE.length).fill(null));
    setDatos("");
    avisar(criteriosAptos(criterios) ? "Cumple los 8 criterios: puedes iniciar la PVE." : "No cumple los criterios: la PVE no se inicia.");
  };

  const iniciar = async (l: LecturasPve): Promise<void> => {
    await ev({ tipo: "INICIO_PVE", duracionMin: 30 });
    await ev({ tipo: "CONTROL_PVE", fase: "INICIAL" as FasePveControl, lecturas: l });
    setFormulario(null);
    avisar("PVE iniciada: corre el cronómetro.");
  };

  const reeval = async (momento: MomentoPostExtub, v: Texto): Promise<void> => {
    await ev({ tipo: "REEVAL_POST_EXTUB", momento, fc: num(v["fc"] ?? ""), pam: num(v["pam"] ?? ""), gcs: num(v["gcs"] ?? ""), fr: num(v["fr"] ?? ""), fio2: num(v["fio2"] ?? ""), spo2: num(v["spo2"] ?? ""), trabajoResp: v["trab"] ?? "", manejoSecreciones: v["man"] ?? "" });
    setFormulario(null);
  };

  return (
    <>
      <section>
        <h3>Prueba de ventilación espontánea</h3>
        <div className="row">
          <Pildora tipo={flujo.fase === "APTO" ? "good" : flujo.fase === "NO_APTO" ? "crit" : flujo.fase === "EN_CURSO" ? "acc" : ""}>
            {{ SIN_CHECKLIST: "Falta el checklist", NO_APTO: "No apto para PVE", APTO: "Apto: puede iniciar", EN_CURSO: "PVE en curso", TERMINADA: "PVE terminada", POST_EXTUBACION: "Post extubación" }[flujo.fase]}
          </Pildora>
        </div>
        {bloqueo && !flujo.bloque && flujo.fase !== "EN_CURSO" && flujo.fase !== "APTO" && flujo.fase !== "TERMINADA" && <div className="mt"><Aviso tipo="warn" pequeno>{bloqueo}</Aviso></div>}
      </section>

      {conTet && !bloqueo && flujo.fase !== "EN_CURSO" && (
        <section>
          <h3>1 · Checklist previo (cumple con 8 criterios)</h3>
          {flujo.checklist && (
            <div className="mt" style={{ marginBottom: 8 }}>
              <Aviso tipo={flujo.checklist.apto ? "good" : "crit"} pequeno>
                Este turno, {flujo.checklist.hora}: {flujo.checklist.apto ? "cumple los 8 criterios." : `no cumple: ${CRITERIOS_PVE.filter((_, i) => !flujo.checklist!.criterios[i]).join(", ")}.`}
              </Aviso>
            </div>
          )}
          {!(flujo.checklist?.apto) && (
            <div className="stack" style={{ gap: 8 }}>
              {CRITERIOS_PVE.map((c, i) => (
                <div key={c}>
                  <div className="small ink2">{c}</div>
                  <Seg ancho etiqueta={c} valor={marcas[i] ?? null} opciones={[{ valor: true, texto: "Cumple" }, { valor: false, texto: "No cumple" }]} onCambio={(x) => setMarcas((m) => m.map((y, j) => (j === i ? x : y)))} />
                </div>
              ))}
              <div className="f">
                <label htmlFor="pve-datos">Datos (PaFi, Hb, etc.)</label>
                <input id="pve-datos" value={datos} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} autoComplete="off" onChange={(e) => setDatos(e.target.value)} />
              </div>
              <label className="chk"><input type="checkbox" checked={fuera} onChange={(e) => setFuera(e.target.checked)} /> Extubación fuera de protocolo por indicación médica</label>
              <button type="button" className="btn primary" onClick={() => void registrarChecklist()}>Registrar checklist</button>
            </div>
          )}
        </section>
      )}

      {conTet && flujo.fase === "APTO" && (
        <section>
          <h3>2 · Control inicial</h3>
          {formulario === "inicial" ? (
            <FormControlPve titulo="Control inicial de la PVE" boton="Registrar e iniciar cronómetro" onGuardar={(l) => void iniciar(l)} onCancelar={() => setFormulario(null)} />
          ) : (
            <button type="button" className="btn primary" onClick={() => setFormulario("inicial")}>Iniciar PVE</button>
          )}
        </section>
      )}

      {flujo.fase === "EN_CURSO" && (
        <section>
          <h3>PVE en curso</h3>
          <div className="notice acc">
            <div className="small">Cronómetro</div>
            <div className="timer mono" id="pve-timer">{flujo.pve.minutosTranscurridos} / {flujo.pve.duracionMin} min {flujo.pve.completa && "· cumplida"}</div>
            <div className="small">Control inicial {flujo.controlInicial ? "registrado" : "pendiente"} · control a los 30 min {flujo.control30 ? "registrado" : "pendiente"}</div>
          </div>
          {!flujo.control30 && (formulario === "30" ? (
            <div className="mt"><FormControlPve titulo="Control de término · 30 min" boton="Registrar control" {...(inicioPve ? { inicio: inicioPve } : {})} onGuardar={(l) => { void ev({ tipo: "CONTROL_PVE", fase: "30MIN" as FasePveControl, lecturas: l }); setFormulario(null); }} onCancelar={() => setFormulario(null)} /></div>
          ) : (
            <div className="mt"><button type="button" className="btn primary" onClick={() => setFormulario("30")}>Control a los 30 min{flujo.pve.minutosRestantes > 0 ? ` (faltan ${flujo.pve.minutosRestantes})` : ""}</button></div>
          ))}
          <div className="row mt">
            <button type="button" className="btn" onClick={() => void ev({ tipo: "FIN_PVE", exitosa: true })}>Fin · tolerada</button>
            <button type="button" className="btn" onClick={() => void ev({ tipo: "FIN_PVE", exitosa: false })}>Fin · no tolerada</button>
          </div>
        </section>
      )}

      {verContraste && inicioPve && reg && (
        <section>
          <h3>Inicio y término de la PVE</h3>
          <ContrastePve inicio={inicioPve.lecturas} termino={reg.treintaMin?.lecturas ?? null} horaInicio={inicioPve.hora} horaTermino={reg.treintaMin?.hora ?? null} />
        </section>
      )}

      {flujo.fase === "TERMINADA" && conTet && (
        <section>
          <h3>3 · Extubación</h3>
          <p className="small ink2">Si la PVE fue tolerada y se extuba, registra la extubación: parten los controles de 30, 60 y 120 min y 48 h.</p>
          {formulario === "extub" ? (
            <div className="card stack" style={{ padding: 12, gap: 8 }}>
              <b>Extubación programada · queda en</b>
              <Fichas etiqueta="Queda en" valor={null} opciones={[{ valor: "CNAF", texto: "CNAF" }, { valor: "VMNI", texto: "VMNI" }, { valor: "O2_CONVENCIONAL", texto: "O₂ convencional" }, { valor: "AIRE_AMBIENTE", texto: "Aire ambiente" }]}
                onCambio={(d) => { void ev({ tipo: "EXTUBACION_PROGRAMADA", dispositivo: d }); setFormulario(null); }} />
            </div>
          ) : (
            <button type="button" className="btn primary" onClick={() => setFormulario("extub")}>Registrar extubación</button>
          )}
        </section>
      )}

      {flujo.bloque && (
        <section>
          <h3>Post extubación · extubado a las {flujo.bloque.horaExtubacion}</h3>
          <div className="stack" style={{ gap: 8 }}>
            {flujo.bloque.momentos.map((m) => (
              <div key={m.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <b>{m.etiqueta}</b> <span className="small muted">{hhmm(m.venceEn)}</span>
                  </span>
                  {m.registrado ? <Pildora tipo="good">Registrado</Pildora> : (
                    <button type="button" className={m.minutosFaltantes <= 0 ? "btn primary sm" : "btn sm"} onClick={() => setFormulario(m.id)}>
                      {m.minutosFaltantes <= 0 ? "Registrar" : `Registrar · en ${m.minutosFaltantes >= 120 ? Math.round(m.minutosFaltantes / 60) + " h" : m.minutosFaltantes + " min"}`}
                    </button>
                  )}
                </div>
                {formulario === m.id && <div className="mt"><FormReeval momento={m.id} onGuardar={(v) => void reeval(m.id, v)} onCancelar={() => setFormulario(null)} /></div>}
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 14 }}>Falla post extubación</h3>
          {flujo.bloque.falla ? (
            <>
              <Aviso tipo={flujo.bloque.falla.falla ? "crit" : "good"} pequeno>
                {flujo.bloque.falla.falla ? "Sí" : "No"}{flujo.bloque.falla.hipotesis ? ` · ${flujo.bloque.falla.hipotesis}` : ""}{flujo.bloque.falla.observaciones ? ` · ${flujo.bloque.falla.observaciones}` : ""}
              </Aviso>
              {flujo.bloque.falla.falla && !artificial && (
                <div className="card stack mt" style={{ padding: 12, gap: 8 }} aria-label="Reintubación">
                  <b>Reintubación / IOT</b>
                  <Seg ancho etiqueta="Vía" valor={reint.via} opciones={[{ valor: "TET", texto: "TET" }, { valor: "TQT", texto: "TQT" }]} onCambio={(x) => setReint({ ...reint, via: x })} />
                  <div className="fgrid2">
                    <div className="f"><label htmlFor="pve-reint-cal">Calibre</label><input id="pve-reint-cal" inputMode="decimal" autoComplete="off" value={reint.cal} onChange={(e) => setReint({ ...reint, cal: e.target.value })} /></div>
                    <div className="f"><label htmlFor="pve-reint-fij">Fijación <span className="muted">cm en la arcada dental</span></label><input id="pve-reint-fij" inputMode="decimal" autoComplete="off" value={reint.fij} onChange={(e) => setReint({ ...reint, fij: e.target.value })} /></div>
                  </div>
                  <button type="button" className="btn danger" onClick={() => void reintubar()}>Registrar reintubación</button>
                </div>
              )}
            </>
          ) : formulario === "falla" ? (
            <div className="card stack" style={{ padding: 12, gap: 8 }}>
              <Seg ancho etiqueta="Falla post extubación" valor={falla.si} opciones={[{ valor: true, texto: "Sí" }, { valor: false, texto: "No" }]} onCambio={(x) => setFalla({ ...falla, si: x })} />
              <div className="f"><label htmlFor="pve-hip">Hipótesis</label><input id="pve-hip" value={falla.hip} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} onChange={(e) => setFalla({ ...falla, hip: e.target.value })} /></div>
              <div className="f"><label htmlFor="pve-obs">Observaciones</label><input id="pve-obs" value={falla.obs} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} onChange={(e) => setFalla({ ...falla, obs: e.target.value })} /></div>
              <div className="row">
                <button type="button" className="btn primary" onClick={() => { if (falla.si === null) return avisar("Indica si hubo falla: Sí o No."); void ev({ tipo: "FALLA_POST_EXTUB", falla: falla.si, hipotesis: falla.hip, observaciones: falla.obs }); setFormulario(null); }}>{falla.si ? "Registrar falla y pasar a reintubación" : "Registrar"}</button>
                <button type="button" className="btn" onClick={() => setFormulario(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setFormulario("falla")}>Registrar falla post extubación</button>
          )}
        </section>
      )}
    </>
  );
}
