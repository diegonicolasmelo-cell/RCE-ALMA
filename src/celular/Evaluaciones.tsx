import { useState } from "react";
import {
  ESCALAS,
  LARGO_MAX_NOTA_EVALUACION,
  SUGERENCIAS_ECOGRAFIA,
  calcularEscala,
  escalaDe,
  momentoDeEvaluacion,
  nombreEscala,
  resumenEvaluacion
} from "@core/index";
import type { EventoClinico, IdEscala } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { Aviso } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";
import { horaDe } from "../app/util";

const num = (v: string | undefined): number | null => {
  const n = Number((v ?? "").replace(",", "."));
  return (v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Evaluaciones puntuales de una cama: aparte del control de rutina. Todo nace en blanco. */
export function Evaluaciones({ ctx }: { ctx: ContextoCama }) {
  const { ep, eventos, rutAutor } = ctx;
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [id, setId] = useState<IdEscala | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [hora, setHora] = useState("");
  const [nota, setNota] = useState("");
  /** Abre una evaluacion: la hora sugerida es la de ahora, y se corrige si se hizo antes. */
  const abrir = (e: IdEscala | null): void => {
    setId(e);
    setV({});
    setNota("");
    setHora(horaDe(new Date()));
  };

  const def = id ? escalaDe(id) : null;
  const valores = def ? Object.fromEntries(def.campos.map((c) => [c.id, num(v[c.id])])) : {};
  const r = id ? calcularEscala(id, valores) : null;
  const hechas = eventos.filter((e): e is Extract<EventoClinico, { tipo: "EVALUACION_PUNTUAL" }> => e.tipo === "EVALUACION_PUNTUAL").slice(-5).reverse();
  const grupos = [...new Set(ESCALAS.map((e) => e.grupo))];

  const registrar = async (): Promise<void> => {
    if (!id || !r || !def) return;
    if (r.errores.length > 0) return avisar(`Revisa: ${r.errores[0]}.`);
    const textoNota = nota.trim();
    if (def.exigeNota && textoNota === "") return avisar("Escribe el hallazgo.");
    if (!def.exigeNota && Object.values(valores).every((x) => x === null)) return avisar("Escribe al menos un valor.");
    if (textoNota.length > LARGO_MAX_NOTA_EVALUACION) return avisar(`La nota admite hasta ${LARGO_MAX_NOTA_EVALUACION} caracteres.`);
    const ahora = new Date();
    const realizada = momentoDeEvaluacion(hora, ahora);
    if (!realizada) return avisar("Revisa la hora: debe ser la hora real de la evaluación, de las últimas 12 horas.");
    await repo.registrarEvento({
      ...baseEvento(ep, rutAutor, ahora, textoNota),
      // La hora que vale es la real; `registradoEn` queda con el momento en que se anoto.
      hora: horaDe(realizada),
      realizadaEn: realizada.toISOString(),
      tipo: "EVALUACION_PUNTUAL",
      escala: id,
      valores,
      total: r.total
    });
    avisar(`${nombreEscala(id)} registrada a las ${horaDe(realizada)}.`);
    abrir(null);
  };

  return (
    <div className="cel-cuerpo" style={{ display: "grid", gap: 12 }}>
      {!def && (
        <>
          {grupos.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <div className="stack" style={{ gap: 6 }}>
                {ESCALAS.filter((e) => e.grupo === g).map((e) => (
                  <button key={e.id} type="button" className="btn" style={{ textAlign: "left" }} onClick={() => abrir(e.id)}>{e.nombre}</button>
                ))}
              </div>
            </section>
          ))}
          {hechas.length > 0 && (
            <section>
              <h3>Registradas en esta cama</h3>
              <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
                {hechas.map((e) => <li key={e.id}><span className="mono">{e.hora}</span> {resumenEvaluacion(e.escala, e.valores, e.total, e.comentario)}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {def && r && (
        <section className="stack" style={{ gap: 10 }}>
          <h3>{def.nombre}</h3>
          {def.campos.length > 0 && <div className="fgrid2">
            {def.campos.map((c) => (
              <div className="f" key={c.id}>
                <label htmlFor={`ev-${c.id}`}>
                  {c.etiqueta}
                  {!c.opciones && <span className="muted"> {c.unidad ?? (c.max !== null ? `${c.min} a ${c.max}` : "")}</span>}
                </label>
                {c.opciones ? (
                  <select id={`ev-${c.id}`} value={v[c.id] ?? ""} style={{ textAlign: "left", fontFamily: "var(--font-ui)" }} onChange={(e) => setV({ ...v, [c.id]: e.target.value })}>
                    <option value="">—</option>
                    {c.opciones.map((o) => <option key={o.val} value={String(o.val)}>{o.label}</option>)}
                  </select>
                ) : (
                  <input id={`ev-${c.id}`} inputMode="decimal" autoComplete="off" value={v[c.id] ?? ""} onChange={(e) => setV({ ...v, [c.id]: e.target.value })} />
                )}
              </div>
            ))}
          </div>}
          <div className="fgrid2">
            <div className="f">
              <label htmlFor="ev-hora">Hora de la evaluación <span className="muted">la real</span></label>
              <input id="ev-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="f">
            <label htmlFor="ev-nota">{def.exigeNota ? "Hallazgo" : "Nota clínica"} <span className="muted">{def.exigeNota ? "" : "opcional · "}sin nombres de pacientes</span></label>
            <textarea id="ev-nota" rows={def.exigeNota ? 3 : 2} value={nota} maxLength={LARGO_MAX_NOTA_EVALUACION} placeholder={def.exigeNota ? "Por ejemplo, patrón B bilateral" : "Lo que se observó y lo que se decidió"} style={{ textAlign: "left", fontFamily: "var(--font-ui)", width: "100%" }} onChange={(e) => setNota(e.target.value)} />
            {def.exigeNota && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {SUGERENCIAS_ECOGRAFIA.map((s) => (
                  <button key={s} type="button" className="chip" style={{ fontFamily: "var(--font-ui)" }} onClick={() => setNota((n) => (n.trim() ? `${n.trim()}, ${s.toLowerCase()}` : s))}>{s}</button>
                ))}
              </div>
            )}
          </div>
          {r.lineas.length > 0 && <div className="small ink2 mono">{r.lineas.join(" · ")}</div>}
          {r.interpretacion && <Aviso tipo={/debilidad adquirida|bajo el corte/i.test(r.interpretacion) ? "warn" : "good"} pequeno>{r.interpretacion}</Aviso>}
          {r.errores.length > 0 && <Aviso tipo="crit" pequeno>{r.errores.join(". ")}</Aviso>}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void registrar()}>Registrar evaluación</button>
            <button type="button" className="btn" onClick={() => setId(null)}>Cancelar</button>
          </div>
        </section>
      )}
    </div>
  );
}
