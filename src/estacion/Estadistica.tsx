import { useState } from "react";
import { describirEvento, nombreCama, periodoDe, resumenPorCama } from "@core/index";
import type { TipoPeriodo } from "@core/index";
import type { DatosUnidad } from "./datos";
import { iniciales, nombreProfesional } from "./util";

const PERIODOS: readonly [TipoPeriodo, string][] = [
  ["TURNO", "Este turno"],
  ["TURNO_ANTERIOR", "Turno anterior"],
  ["DIA", "Hoy"],
  ["SEMANA", "7 días"],
  ["MES", "Este mes"]
];

/**
 * Estadística: el resumen de lo que se hizo, cama por cama, en el periodo. Es el feedback del
 * registro (no lo cambia): KTR = controles, KTM o IMT = terapia física realizada, y los eventos
 * (la PVE entre ellos) con su hora.
 */
export function Estadistica({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  const [tipo, setTipo] = useState<TipoPeriodo>("TURNO");
  const [autor, setAutor] = useState<string>("");
  const periodo = periodoDe(tipo, ahora);
  const base = { episodios: datos.todosEpisodios, controles: datos.controles, eventos: datos.eventos, apks: datos.apks };
  const todos = resumenPorCama(base, periodo, (e) => describirEvento(e));
  const autores = [...new Set(todos.filas.flatMap((f) => f.autores))].sort((a, b) => nombreProfesional(a).localeCompare(nombreProfesional(b)));
  const r = autor ? resumenPorCama(base, periodo, (e) => describirEvento(e), autor) : todos;
  const max = (l: readonly { n: number }[]): number => Math.max(1, ...l.map((x) => x.n));

  return (
    <section className="stack" aria-label="Estadística" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg" role="group" aria-label="Periodo">
          {PERIODOS.map(([k, t]) => <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}
        </div>
        <span className="small muted">{periodo.etiqueta}</span>
        <label className="small" style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          Kinesiólogo
          <select id="est-autor" value={autor} onChange={(e) => setAutor(e.target.value)}>
            <option value="">Todos</option>
            {autores.map((a) => <option key={a} value={a}>{nombreProfesional(a)}</option>)}
          </select>
        </label>
      </div>

      <div className="est-kpis">
        <div><b>{r.totales.pacientes}</b><span>pacientes atendidos</span></div>
        <div><b>{r.totales.ktr}</b><span>KTR (controles)</span></div>
        <div><b>{r.totales.ktm}</b><span>KTM o IMT{r.totales.imt ? ` · ${r.totales.imt} con IMT` : ""}</span></div>
        <div><b>{r.totales.pve}</b><span>PVE realizadas</span></div>
        <div><b>{r.totales.eventos}</b><span>eventos</span></div>
        <div><b>{r.totales.apkCumple}/{r.totales.pacientes}</b><span>APK que cumple</span></div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {r.filas.length === 0 ? (
          <p className="muted" style={{ padding: 16, margin: 0 }}>No hay registros en este periodo.</p>
        ) : (
          <table className="est-tabla" aria-label="Lo que se hizo por cama">
            <thead>
              <tr><th>Cama</th><th>Modo ventilatorio</th><th className="n">KTR</th><th>KTM / IMT</th><th className="n">APK</th><th>Eventos (PVE incluida)</th><th>Firmó</th></tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.episodioId}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{nombreCama(f.cama)}</b></td>
                  <td>{f.modo || "—"}</td>
                  <td className="n">{f.ktr}</td>
                  <td>
                    {f.ktm > 0 ? (
                      <><span className="marca si">✓</span> {f.ktm > 1 ? `${f.ktm} sesiones` : "Realizada"}{f.imt ? " · IMT" : ""}{f.ims !== null ? ` · IMS ${f.ims}` : ""}</>
                    ) : f.ktmMotivo ? (
                      <><span className="marca no">✕</span> <span className="small muted">{f.ktmMotivo}</span></>
                    ) : "—"}
                  </td>
                  <td className="n">{f.apk === "CUMPLE" ? <span className="marca si">✓</span> : f.apk === "NO_CUMPLE" ? <span className="marca no">✕</span> : <span className="muted">—</span>}</td>
                  <td>{f.eventos.length ? f.eventos.map((e, i) => <div key={i} className="small"><span className="mono">{e.hora}</span> {e.texto}</div>) : <span className="muted">—</span>}</td>
                  <td className="small">{f.autores.map(iniciales).filter((x) => x !== "--").join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td>{r.totales.pacientes} camas</td><td className="n">{r.totales.ktr}</td><td>{r.totales.ktm} realizadas</td><td className="n">{r.totales.apkCumple}</td><td>{r.totales.eventos} eventos</td><td /></tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="est-dos">
        <div className="card stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>KTM no realizada · por qué</h3>
          {r.motivosSinKtm.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Sin registros.</p> : r.motivosSinKtm.map((m) => (
            <div key={m.motivo} className="est-barra"><span>{m.motivo}</span><i style={{ width: `${(100 * m.n) / max(r.motivosSinKtm)}%` }} /><b>{m.n}</b></div>
          ))}
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>PVE no realizada · criterio que no se cumplió</h3>
          {r.motivosSinPve.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Sin registros.</p> : r.motivosSinPve.map((m) => (
            <div key={m.motivo} className="est-barra"><span>{m.motivo}</span><i style={{ width: `${(100 * m.n) / max(r.motivosSinPve)}%` }} /><b>{m.n}</b></div>
          ))}
        </div>
      </div>
    </section>
  );
}
