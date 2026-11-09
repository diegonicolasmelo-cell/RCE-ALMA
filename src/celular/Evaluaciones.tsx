import { Timer } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import {
  ECF_NIVELES,
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

type EvalPuntual = Extract<EventoClinico, { tipo: "EVALUACION_PUNTUAL" }>;
type Valores = Record<string, number | null>;

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
    setTextos(Object.fromEntries(def.campos.filter((c) => c.tipo === "num").map((c) => [c.id, valores[c.id] == null ? "" : String(valores[c.id])])));
    setNota(previa?.comentario ?? "");
    setCorrige(previa !== undefined);
    setHora(horaDe(new Date()));
    setMsg(null);
    document.querySelector(".cel-cuerpo")?.scrollTo({ top: 0 });
  };
  const cerrar = (): void => {
    setId(null);
    document.querySelector(".cel-cuerpo")?.scrollTo({ top: 0 });
  };

  const def = id ? escalaDe(id) : null;
  const campos = def ? camposVisibles(def, ep.viaAereaActual) : [];
  const r = id ? calcularEscala(id, v, ctxEscala) : null;
  const realizada = momentoDeEvaluacion(hora, new Date());

  const registrar = async (): Promise<void> => {
    if (!id || !r || !def) return;
    if (r.errores.length > 0) return setMsg(`Revisa: ${r.errores[0]}.`);
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
    if (nuevo !== null && c.tipo === "ops") avanzar(e, ".ev-fila");
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

  // --- Una escala ---
  const opcionElegida = (c: CampoEscala): string => {
    const x = v[c.id];
    const o = c.opciones?.find((op) => op.val === x);
    return o ? (o.desc ? `${o.label === "NE" ? "NE" : o.label} · ${o.desc}` : "") : "";
  };
  return (
    <div className="cel-cuerpo" style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <section className="stack" style={{ gap: 0 }} aria-label={def.nombre}>
        <h3>{def.nombre}</h3>
        {corrige && <div className="notice good small" style={{ marginBottom: 8 }}>Ya está registrado. Lo que guardes ahora lo reemplaza: es un dato único del episodio.</div>}
        {campos.map((c) => {
          if (c.tipo === "num") {
            return (
              <div className="ev-fila num" key={c.id}>
                <label htmlFor={`ev-${c.id}`}>{c.etiqueta} <span className="muted">{c.unidad}</span></label>
                <input id={`ev-${c.id}`} inputMode="decimal" autoComplete="off" value={textos[c.id] ?? ""}
                  onChange={(e) => { const t = e.target.value; setTextos((x) => ({ ...x, [c.id]: t })); setV((x) => ({ ...x, [c.id]: numero(t) })); }} />
              </div>
            );
          }
          if (c.tipo === "ops") {
            const cortas = (c.opciones ?? []).every((o) => o.label.length <= 3);
            return (
              <div className="ev-fila" key={c.id}>
                <div className="ev-et">{c.etiqueta}{opcionElegida(c) && <span className="ev-ayuda">{opcionElegida(c)}</span>}</div>
                <div className={`ev-ops${cortas ? "" : " txt"}`} role="group" aria-label={c.etiqueta}>
                  {(c.opciones ?? []).map((o) => (
                    <button key={o.val} type="button" aria-pressed={v[c.id] === o.val} className={o.val === NE ? "ne" : undefined} onClick={(e) => elegir(e, c, o.val)}>{o.label}</button>
                  ))}
                </div>
              </div>
            );
          }
          if (c.tipo === "lista") {
            const esEcf = def.id === "FRAGILIDAD";
            return (
              <div key={c.id}>
                <div className="subg">{c.etiqueta}</div>
                <div className="ev-listaop" role="group" aria-label={c.etiqueta}>
                  {(c.opciones ?? []).map((o) => {
                    const ecf = esEcf ? ECF_NIVELES.find((n) => n.nivel === o.val) : undefined;
                    return (
                      <button key={o.val} type="button" aria-pressed={v[c.id] === o.val} onClick={(e) => elegir(e, c, o.val)}>
                        <span className="n" style={ecf ? { background: ecf.fondo, color: ecf.tinta } : undefined}>{o.val}</span>
                        <span><b>{o.label}</b>{o.desc && <span className="d">{o.desc}</span>}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div key={c.id}>
              <div className="subg">{c.etiqueta}</div>
              <div className="ev-chks" role="group" aria-label={c.etiqueta}>
                {(c.opciones ?? []).map((o, i) => (
                  <button key={i} type="button" className="ev-chk" aria-pressed={!!v[claveChk(c.id, i)]} onClick={(e) => marcar(e, c, i)}>
                    <span>{o.label}</span>{def.id === "CHARLSON" && <b>+{o.val}</b>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {r && (
          <div className="ev-res" aria-live="polite">
            {r.lineas.length > 0 && <div className="mono">{r.lineas.join(" · ")}</div>}
            {r.interpretacion && <span className={`pill ${r.nivel ?? ""}`}>{r.interpretacion}</span>}
            {!r.completa && r.lineas.length === 0 && <span className="small muted">Completa los datos: el resultado se calcula al tiro.</span>}
          </div>
        )}
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <h3>{def.unico ? "Fecha y nota" : "Hora y nota"}</h3>
        <div className="ev-fila num">
          <label htmlFor="ev-hora">{def.unico ? "Hora del registro" : "Hora de la evaluación"} <span className="muted">{realizada ? `se guarda ${fechaHora(realizada.toISOString(), new Date())}` : "revisa: de las últimas 12 h"}</span></label>
          <input id="ev-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="ev-nota">{def.unico ? "Fuente y nota" : "Nota clínica"} <span className="muted">opcional · sin nombres de pacientes</span></label>
          <textarea id="ev-nota" rows={2} value={nota} maxLength={LARGO_MAX_NOTA_EVALUACION} placeholder={def.unico ? "Por ejemplo, referido por la familia" : "Lo que se observó y lo que se decidió"} style={{ textAlign: "left", fontFamily: "var(--font-ui)", width: "100%" }} onChange={(e) => setNota(e.target.value)} />
        </div>
        {msg && <div className="notice crit small" role="alert">{msg}</div>}
        <div className="row">
          <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => void registrar()}>{corrige ? "Guardar corrección" : `Guardar ${def.corto}`}</button>
          <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
