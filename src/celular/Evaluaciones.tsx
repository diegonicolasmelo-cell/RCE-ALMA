import { Timer } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import {
  ECF_NIVELES,
  INTENSIDADES_PIM,
  LARGO_MAX_NOTA_EVALUACION,
  NE,
  PESTANAS_EVAL,
  accesoPve,
  calcularEscala,
  camposVisibles,
  claveChk,
  escalaDe,
  escalasDePestana,
  momentoDeEvaluacion,
  motivoSinPve,
  resumenEvaluacion
} from "@core/index";
import type { CampoEscala, DefEscala, EventoClinico, IdEscala, PestanaEval } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { horaDe } from "../app/util";
import { TECLADO_PROPIO } from "./TecladoPropio";

type EvalPuntual = Extract<EventoClinico, { tipo: "EVALUACION_PUNTUAL" }>;
type Valores = Record<string, number | null>;

/** Escalas que se llenan con su propio teclado, como en el registro simple. */
const TECLADO_ESCALA: Partial<Record<IdEscala, "mrc" | "fss" | "cpax">> = { MRC_SS: "mrc", FSS_ICU: "fss", CPAX: "cpax" };

/** "Se guarda: hoy 09:55 (10-11)": la fecha completa que se deduce de la hora escrita. */
function cuandoTexto(hora: string): string {
  const m = momentoDeEvaluacion(hora, new Date());
  if (!m) return "Esa hora queda a más de 12 h: revisa si está bien escrita.";
  const dia = m.toDateString() === new Date().toDateString() ? "hoy" : "ayer";
  return `Se guarda: ${dia} ${horaDe(m)} (${String(m.getDate()).padStart(2, "0")}-${String(m.getMonth() + 1).padStart(2, "0")})`;
}

const numero = (t: string): number | null => {
  const n = Number(t.replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** "hoy 08:10", "ayer 23:50" o "07-11 14:00": cada registro se lee con su fecha. */
function fechaHora(iso: string, ahora: Date): string {
  const d = new Date(iso);
  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
  const mismo = (x: Date, y: Date): boolean => x.toDateString() === y.toDateString();
  const dia = mismo(d, ahora) ? "hoy" : mismo(d, ayer) ? "ayer" : `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dia} ${horaDe(d)}`;
}

/**
 * Cada respuesta de una escala de tocar sube la pantalla hasta el item siguiente, para no
 * tener que hacer scroll: una respuesta por fila avanza a la fila siguiente; en una lista
 * de marcar (Charlson) avanza un renglon. Al desmarcar no se mueve.
 */
function avanzar(e: MouseEvent<HTMLElement>, unidadSelector: string): void {
  const unidad = e.currentTarget.closest<HTMLElement>(unidadSelector);
  const sig = unidad?.nextElementSibling as HTMLElement | null;
  const caja = e.currentTarget.closest<HTMLElement>(".cel-cuerpo");
  if (!unidad || !sig || !caja) return;
  const paso = sig.getBoundingClientRect().top - unidad.getBoundingClientRect().top;
  const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (paso > 0) caja.scrollBy({ top: paso, behavior: suave ? "smooth" : "auto" });
}

/** Evaluaciones puntuales de una cama, en cuatro pestanas. Todo nace en blanco. */
export function Evaluaciones({ ctx }: { ctx: ContextoCama }) {
  const { ep, eventos, rutAutor, ultimo, ahora } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const irA = useApp((s) => s.irA);
  const [pestana, setPestana] = useState<PestanaEval>("PREVIA");
  const [id, setId] = useState<IdEscala | null>(null);
  const [v, setV] = useState<Valores>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [hora, setHora] = useState("");
  const [nota, setNota] = useState("");
  const [corrige, setCorrige] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hechas = eventos.filter((e): e is EvalPuntual => e.tipo === "EVALUACION_PUNTUAL");
  const ultimaDe = (x: IdEscala): EvalPuntual | undefined => hechas.filter((e) => e.escala === x).at(-1);
  const ctxEscala = { sexo: ep.sexo, via: ep.viaAereaActual };

  /** Abre una escala: en blanco; una del estado previo a la UCI, con lo ya registrado para corregirlo. */
  const abrir = (x: IdEscala): void => {
    const def = escalaDe(x);
    const previa = def.unico ? ultimaDe(x) : undefined;
    const valores: Valores = previa ? { ...previa.valores } as Valores : {};
    setId(x);
    setV(valores);
    const conTeclado = TECLADO_ESCALA[x];
    setTextos(Object.fromEntries(def.campos.filter((c) => c.tipo === "num" || (conTeclado && c.tipo === "ops")).map((c) => [c.id, valores[c.id] == null ? "" : valores[c.id] === NE ? "NE" : String(valores[c.id])])));
    setNota(previa?.comentario ?? "");
    setCorrige(previa !== undefined);
    setHora(horaDe(new Date()));
    setMsg(null);
    setTimeout(() => document.querySelector(".cel-cuerpo")?.scrollTo({ top: 0 }), 0);
  };
  /** Lo escrito en una casilla: numero, o NE en las escalas que lo admiten; lo demas no vale. */
  const escribirCasilla = (c: CampoEscala, t: string): void => {
    setTextos((x) => ({ ...x, [c.id]: t }));
    const tt = t.trim().toUpperCase();
    let val: number | null;
    if (tt === "") val = null;
    else if (c.tipo === "num") val = numero(t);
    else if (tt === "NE" && c.opciones?.some((o) => o.val === NE)) val = NE;
    else {
      const n = Number(tt);
      val = Number.isInteger(n) && c.opciones?.some((o) => o.val === n) ? n : Number.NaN;
    }
    setV((x) => ({ ...x, [c.id]: val }));
  };
  const cerrar = (): void => {
    setId(null);
    document.querySelector(".cel-cuerpo")?.scrollTo({ top: 0 });
  };

  const def = id ? escalaDe(id) : null;
  const campos = def ? camposVisibles(def, ep.viaAereaActual) : [];
  const r = id ? calcularEscala(id, v, ctxEscala) : null;

  const registrar = async (): Promise<void> => {
    if (!id || !r || !def) return;
    if (r.errores.length > 0) return setMsg(`Revisa: ${r.errores[0]}.`);
    if (campos.some((c) => Number.isNaN(v[c.id] as number))) return setMsg(`Cada casilla va de ${TECLADO_ESCALA[id] === "fss" ? "0 a 7, o NE" : TECLADO_ESCALA[id] === "mrc" ? "0 a 5, o NE" : "0 a 5"}.`);
    const textoNota = nota.trim();
    if (!r.completa && !(id === "ECOGRAFIA" && textoNota !== "")) return setMsg(`Falta: ${r.falta}.`);
    if (textoNota.length > LARGO_MAX_NOTA_EVALUACION) return setMsg(`La nota admite hasta ${LARGO_MAX_NOTA_EVALUACION} caracteres.`);
    const t = new Date();
    const real = momentoDeEvaluacion(hora, t);
    if (!real) return setMsg("Revisa la hora: la real, de las últimas 12 horas.");
    // Solo lo que corresponde a esta via aerea.
    const valores = Object.fromEntries(campos.flatMap((c) => (c.tipo === "chk" ? (c.opciones ?? []).map((_, i) => [claveChk(c.id, i), v[claveChk(c.id, i)] ? 1 : null]) : [[c.id, v[c.id] ?? null]])));
    await repo.registrarEvento({
      ...baseEvento(ep, rutAutor, t, textoNota),
      // La hora que vale es la real; `registradoEn` queda con el momento en que se anoto.
      hora: horaDe(real),
      realizadaEn: real.toISOString(),
      tipo: "EVALUACION_PUNTUAL",
      escala: id,
      valores,
      total: r.total
    });
    avisar(`${corrige ? "Corregido" : "Guardado"}: ${resumenEvaluacion(id, valores, r.total, "", ctxEscala)} · ${horaDe(real)}.`);
    cerrar();
  };

  const elegir = (e: MouseEvent<HTMLElement>, c: CampoEscala, val: number): void => {
    const nuevo = v[c.id] === val ? null : val;
    setV((x) => ({ ...x, [c.id]: nuevo }));
    if (nuevo !== null && c.tipo === "ops") avanzar(e, ".fila");
  };
  const marcar = (e: MouseEvent<HTMLElement>, c: CampoEscala, i: number): void => {
    const k = claveChk(c.id, i);
    const nuevo = v[k] ? null : 1;
    setV((x) => ({ ...x, [k]: nuevo }));
    if (nuevo) avanzar(e, ".ev-chk");
  };

  // --- Lista de escalas por pestana ---
  if (!def) {
    const ultimoPve = ultimo ? { modalidad: ultimo.ventilacion.modalidad, registradoEn: ultimo.registradoEn } : null;
    const pve = accesoPve(ep.viaAereaActual, ultimoPve, eventos, ahora);
    const sinPve = pve ? null : motivoSinPve(ep.viaAereaActual, ultimoPve, eventos);
    const boton = (d: DefEscala): JSX.Element => {
      const u = ultimaDe(d.id);
      return (
        <button key={d.id} type="button" className="ev-item" data-escala={d.id} onClick={() => abrir(d.id)}>
          <b>{d.nombre}</b>
          <span>
            {u
              ? `${d.unico ? "Registrado" : "Última"}: ${resumenEvaluacion(d.id, u.valores, u.total, "", ctxEscala)} · ${fechaHora(u.realizadaEn ?? u.registradoEn, ahora)}${d.unico ? " · tocar para corregir" : ""}`
              : d.unico ? "Se registra una vez por episodio" : "Sin registros en esta cama"}
          </span>
        </button>
      );
    };
    return (
      <div className="cel-cuerpo" style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div className="pestanas-ev" role="tablist" aria-label="Bloques de evaluaciones">
          {PESTANAS_EVAL.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)}>{p.nombre}</button>
          ))}
        </div>
        <div className="ev-lista" role="tabpanel">
          {/* Con via aerea natural no hay PVE que iniciar: solo aparece si queda algo en marcha (post extubacion). */}
          {pestana === "PVE" && (pve || ep.viaAereaActual !== "NATURAL") && (
            <button type="button" className="ev-item" data-escala="PVE" disabled={!pve} onClick={() => irA("pve", ep.id)}>
              <b><Timer size={14} aria-hidden /> {pve ? pve.texto : "PVE"}</b>
              <span>{pve ? "Checklist, control de inicio y término, extubación" : sinPve ?? "La PVE de este turno ya se cerró."}</span>
            </button>
          )}
          {escalasDePestana(pestana).map(boton)}
        </div>
      </div>
    );
  }

  // --- Una escala, en el formato del registro simple ---
  const teclado = TECLADO_ESCALA[def.id];
  const rangoTeclado = teclado === "fss" ? "0 a 7, o NE" : teclado === "mrc" ? "0 a 5, o NE" : "0 a 5";
  const sasPrevio = ultimo?.sas ?? null;
  const titulo: Partial<Record<IdEscala, string>> = {
    MRC_SS: "MRC-ss · 0 a 5 por movimiento",
    FSS_ICU: "FSS-ICU · 0 a 7 por actividad",
    CPAX: "CPAx · 0 a 5 por dominio",
    BARTHEL: "Barthel · estado previo a la UCI",
    FRAGILIDAD: "Fragilidad · estado previo a la UCI",
    CHARLSON: "Charlson · comorbilidad previa",
    FUERZA_RESPIRATORIA: "Fuerza muscular respiratoria"
  };
  /** Casilla de una escala con su teclado propio (MRC, FSS-ICU, CPAx) o el numerico. */
  const casilla = (c: CampoEscala, etiqueta: string): JSX.Element => (
    <input
      id={`ev-${c.id}`}
      className="num"
      data-teclado={c.tipo === "num" ? "num" : teclado}
      inputMode={TECLADO_PROPIO ? "none" : c.tipo === "num" ? "decimal" : "text"}
      enterKeyHint="next"
      autoComplete="off"
      aria-label={etiqueta}
      value={textos[c.id] ?? ""}
      onChange={(e) => escribirCasilla(c, e.target.value)}
    />
  );
  const desc = (c: CampoEscala): string => {
    const x = v[c.id];
    const o = c.opciones?.find((op) => op.val === x);
    return o?.desc ? `${o.label} · ${o.desc}` : "";
  };
  const porId = (k: string): CampoEscala | undefined => campos.find((c) => c.id === k);
  const pim = id === "FUERZA_RESPIRATORIA" && r?.total != null ? r.total : null;

  return (
    <div className="cel-cuerpo" id="cuerpo" style={{ alignContent: "start" }}>
      <div className="hoja-simple">
        {def.id === "MRC_SS" && sasPrevio !== null && (sasPrevio < 3 || sasPrevio > 4) && (
          <div className="notice crit small">El MRC-ss requiere paciente cooperador (SAS 3-4); el último control tiene SAS {sasPrevio}.</div>
        )}
        {corrige && <div className="notice good small">Ya está registrado. Lo que guardes ahora lo reemplaza: es un dato único del episodio.</div>}
        <section aria-label={def.nombre}>
          <h2>{titulo[def.id] ?? def.nombre}</h2>
          {def.id === "MRC_SS" ? (
            <>
              <div className="lado"><span /><span><span>Der.</span><span>Izq.</span></span></div>
              {[1, 2, 3, 4, 5, 6].map((n) => {
                const der = porId(`m${n}d`)!;
                const izq = porId(`m${n}i`)!;
                const mov = der.etiqueta.replace(/ · der\.$/, "");
                return (
                  <div className="fila mrc" key={n}>
                    <span className="et">{mov}</span>
                    <div className="dos">{casilla(der, `${mov} derecho`)}{casilla(izq, `${mov} izquierdo`)}</div>
                  </div>
                );
              })}
            </>
          ) : (
            campos.map((c) => {
              if (c.tipo === "num") {
                return (
                  <div className="fila" key={c.id}>
                    <span className="et">{c.etiqueta} <span className="u">{c.unidad}</span></span>
                    {casilla(c, c.etiqueta)}
                  </div>
                );
              }
              if (c.tipo === "ops" && teclado) {
                return (
                  <div className="fila fss" key={c.id}>
                    <span className="et">{c.etiqueta}<span className="ayuda">{textos[c.id] && v[c.id] == null ? `Va de ${rangoTeclado}` : desc(c)}</span></span>
                    {casilla(c, c.etiqueta)}
                  </div>
                );
              }
              if (c.tipo === "ops") {
                const cortas = (c.opciones ?? []).every((o) => o.label.length <= 3);
                return (
                  <div className="fila bar" key={c.id}>
                    <span className="et">{c.etiqueta}<span className="ayuda">{desc(c)}</span></span>
                    <div className={`ops${cortas ? "" : " txt"}`} role="group" aria-label={c.etiqueta}>
                      {(c.opciones ?? []).map((o) => (
                        <button key={o.val} type="button" aria-pressed={v[c.id] === o.val} onClick={(e) => elegir(e, c, o.val)}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                );
              }
              if (c.tipo === "lista") {
                return (
                  <div className="ecf" role="group" aria-label={c.etiqueta} key={c.id}>
                    {(c.opciones ?? []).map((o) => {
                      const ecf = def.id === "FRAGILIDAD" ? ECF_NIVELES.find((n) => n.nivel === o.val) : undefined;
                      return (
                        <button key={o.val} type="button" aria-pressed={v[c.id] === o.val} onClick={(e) => elegir(e, c, o.val)}>
                          <span className={`n${ecf ? "" : " gris"}`} style={ecf ? { background: ecf.fondo, color: ecf.tinta } : undefined}>{o.val}</span>
                          <span><b>{o.label}</b>{o.desc && <span className="d">{o.desc}</span>}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div key={c.id}>
                  <div className="sub-grupo">{c.etiqueta}</div>
                  <div className="chks" role="group" aria-label={c.etiqueta}>
                    {(c.opciones ?? []).map((o, i) => (
                      <button key={i} type="button" className="ev-chk" aria-pressed={!!v[claveChk(c.id, i)]} onClick={(e) => marcar(e, c, i)}>
                        <span>{o.label}</span>{def.id === "CHARLSON" && <b>+{o.val}</b>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {r && (
            <div className="resumen ev-res" aria-live="polite">
              {r.lineas.length > 0 ? r.lineas.filter((l) => !(pim !== null && l.startsWith("Cargas"))).map((l, i) => <span key={i}>{i === 0 && r.total !== null ? <b>{l}</b> : l}</span>) : <span className="muted">Completa los datos: el resultado se calcula al tiro.</span>}
              {r.interpretacion && <span><span className={`pill ${r.nivel ?? ""}`}>{r.interpretacion}</span></span>}
            </div>
          )}
          {def.id === "CPAX" && <Radar valores={campos.map((c) => v[c.id] ?? null)} />}
          {pim !== null && (
            <>
              <div className="sub-grupo">Intensidad de entrenamiento (% de la Pimáx)</div>
              <div className="cargas">
                {INTENSIDADES_PIM.map((pc) => <div key={pc}><span>{pc} %</span><b>{Math.round((pim * pc) / 100)}</b><span>cmH₂O</span></div>)}
              </div>
            </>
          )}
        </section>
        <section aria-label="Hora y nota">
          <h2>{def.unico ? "Fecha y nota" : "Hora y nota"}</h2>
          <div className="fila">
            <span className="et">{def.unico ? "Hora del registro" : "Hora de la evaluación"}<span className="ayuda">{cuandoTexto(hora)}</span></span>
            <input id="ev-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div style={{ padding: "10px 12px" }}>
            <label className="et" htmlFor="ev-nota">{def.unico ? "Fuente y nota" : "Nota clínica"} <span className="u">opcional · sin nombres de pacientes</span></label>
            <textarea id="ev-nota" className="nota-eval" rows={2} value={nota} maxLength={LARGO_MAX_NOTA_EVALUACION} placeholder={def.unico ? "Por ejemplo, referido por la familia" : "Lo que se observó y lo que se decidió"} onChange={(e) => setNota(e.target.value)} />
          </div>
        </section>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" id="eval-guardar" data-guardar className="btn primary" style={{ flex: 1 }} onClick={() => void registrar()}>{corrige ? "Guardar corrección" : `Guardar ${def.corto}`}</button>
          <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
        </div>
        {msg && <div className="notice crit small" role="alert">{msg}</div>}
      </div>
    </div>
  );
}

/** Radar del CPAx: los 10 dominios de 0 a 5, como en el registro simple. */
const CORTO_CPAX = ["Resp.", "Tos", "Cama", "Sedente", "Eq. sed.", "Eq. bíp.", "Bípedo", "Transf.", "Marcha", "Prensión"];
function Radar({ valores }: { valores: readonly (number | null)[] }) {
  const R = 110, cx = 150, cy = 140, n = 10;
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poligono = (f: (i: number) => number): string => Array.from({ length: n }, (_, i) => pt(i, f(i)).join(",")).join(" ");
  return (
    <div className="radar">
      <svg viewBox="0 0 300 290" role="img" aria-label="Radar del CPAx">
        {[1, 2, 3, 4, 5].map((k) => <polygon key={k} points={poligono(() => (R * k) / 5)} fill="none" stroke="var(--line)" strokeWidth="1" />)}
        {CORTO_CPAX.map((t, i) => {
          const e = pt(i, R), l = pt(i, R + 18);
          return (
            <g key={t}>
              <line x1={cx} y1={cy} x2={e[0]} y2={e[1]} stroke="var(--line)" />
              <text x={l[0]} y={l[1]} fontSize="10" fill="var(--ink-2)" textAnchor="middle" dominantBaseline="middle">{t}</text>
            </g>
          );
        })}
        <polygon points={poligono((i) => (R * Math.max(0, valores[i] ?? 0)) / 5)} fill="rgba(42,120,214,.22)" stroke="var(--accent)" strokeWidth="2" />
      </svg>
    </div>
  );
}
