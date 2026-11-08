import { useState } from "react";
import { ESCALAS, calcularEscala, escalaDe, nombreEscala, resumenEvaluacion } from "@core/index";
import type { EventoClinico, IdEscala } from "@core/index";
import { useApp } from "../app/store";
import { useServicios } from "../app/contexto";
import { Aviso } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { baseEvento } from "./eventos-ui";

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

  const def = id ? escalaDe(id) : null;
  const valores = def ? Object.fromEntries(def.campos.map((c) => [c.id, num(v[c.id])])) : {};
  const r = id ? calcularEscala(id, valores) : null;
  const hechas = eventos.filter((e): e is Extract<EventoClinico, { tipo: "EVALUACION_PUNTUAL" }> => e.tipo === "EVALUACION_PUNTUAL").slice(-5).reverse();
  const grupos = [...new Set(ESCALAS.map((e) => e.grupo))];

  const registrar = async (): Promise<void> => {
    if (!id || !r) return;
    if (r.errores.length > 0) return avisar(`Revisa: ${r.errores[0]}.`);
    if (Object.values(valores).every((x) => x === null)) return avisar("Escribe al menos un valor.");
    await repo.registrarEvento({ ...baseEvento(ep, rutAutor, new Date()), tipo: "EVALUACION_PUNTUAL", escala: id, valores, total: r.total });
    avisar(`${nombreEscala(id)} registrada.`);
    setId(null);
    setV({});
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
                  <button key={e.id} type="button" className="btn" style={{ textAlign: "left" }} onClick={() => { setId(e.id); setV({}); }}>{e.nombre}</button>
                ))}
              </div>
            </section>
          ))}
          {hechas.length > 0 && (
            <section>
              <h3>Registradas en esta cama</h3>
              <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
                {hechas.map((e) => <li key={e.id}><span className="mono">{e.hora}</span> {resumenEvaluacion(e.escala, e.valores, e.total)}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {def && r && (
        <section className="stack" style={{ gap: 10 }}>
          <h3>{def.nombre}</h3>
          <div className="fgrid2">
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
