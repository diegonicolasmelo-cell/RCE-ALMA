import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ESCALAS, calcularEscala, calcularPbw, describirEvento } from "@core/index";
import type { Control, Episodio, EventoClinico } from "@core/index";
import { columnasSabana, evaluacionesDe, filasSabana, otrosEventos } from "./sabana";
import type { RangoSabana } from "./sabana";
import { nombreProfesional } from "./util";

const p2 = (n: number): string => String(n).padStart(2, "0");
const fechaHora = (iso: string): string => {
  const d = new Date(iso);
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/**
 * La sabana de la estacion: plana, en el orden de la hoja de registro kinesico. Una columna
 * por control (24 h, o toda la estadia), una linea gruesa entre dia y dia, y sobre la columna
 * los hitos de via aerea que generaron ese control. Los demas eventos van en una lista aparte
 * y las evaluaciones en su propia pestana.
 */
export function SabanaVista({ ep, controles, eventos, ahora, resaltar }: { ep: Episodio; controles: readonly Control[]; eventos: readonly EventoClinico[]; ahora: Date; /** Control a destacar y mostrar (p. ej. el que se toco en el celular). */ resaltar?: string }) {
  const [pestana, setPestana] = useState<"sabana" | "evaluaciones">("sabana");
  const [rango, setRango] = useState<RangoSabana>("24H");
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const filas = useMemo(() => filasSabana(pbw, ep.monitoreo), [pbw, ep.monitoreo]);
  const columnas = columnasSabana(controles, eventos, rango, ahora);
  const otros = otrosEventos(eventos, rango, ahora, controles);
  const evaluaciones = evaluacionesDe(eventos);
  // Los dias del rango, con cuantas columnas ocupa cada uno (encabezado agrupado).
  const dias = columnas.reduce<{ dia: string; n: number }[]>((acc, c) => {
    const ult = acc[acc.length - 1];
    if (ult && ult.dia === c.dia) ult.n += 1;
    else acc.push({ dia: c.dia, n: 1 });
    return acc;
  }, []);
  const borde = (nuevoDia: boolean): string => (nuevoDia ? "dia" : "");
  // La columna de un control que monitoriza un evento lleva una linea roja a la izquierda.
  const clase = (c: { nuevoDia: boolean; hitos: readonly string[]; control: Control }): string => `${borde(c.nuevoDia)}${c.hitos.length ? " con-evento" : ""}${c.control.id === resaltar ? " sel" : ""}`;
  // El control destacado queda a la vista (en el celular la tabla se desplaza de lado).
  const tabla = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const th = tabla.current?.querySelector<HTMLElement>("thead th.sel");
    const caja = tabla.current;
    if (th && caja) caja.scrollLeft = Math.max(0, th.offsetLeft - caja.clientWidth / 2 + th.offsetWidth / 2);
  }, [resaltar, rango, pestana, columnas.length]);

  return (
    <section className="sabana-vista" aria-label="Sábana">
      <div className="sv-barra">
        <div className="sv-pestanas" role="tablist" aria-label="Sábana o evaluaciones">
          <button type="button" role="tab" aria-selected={pestana === "sabana"} onClick={() => setPestana("sabana")}>Sábana</button>
          <button type="button" role="tab" aria-selected={pestana === "evaluaciones"} onClick={() => setPestana("evaluaciones")}>Evaluaciones ({evaluaciones.length})</button>
        </div>
        {pestana === "sabana" && (
          <div className="sv-rango" role="group" aria-label="Rango">
            <button type="button" aria-pressed={rango === "24H"} onClick={() => setRango("24H")}>Últimas 24 h</button>
            <button type="button" aria-pressed={rango === "ESTADIA"} onClick={() => setRango("ESTADIA")}>Toda la estadía</button>
          </div>
        )}
      </div>

      {pestana === "sabana" ? (
        <>
          {columnas.length === 0 ? (
            <p className="muted" style={{ padding: "10px 14px", margin: 0 }}>{rango === "24H" ? "Sin controles en las últimas 24 h." : "Todavía no hay controles de esta cama."}</p>
          ) : (
            <div className="scroll-x" ref={tabla}>
              <table className="sab sab-plana">
                <thead>
                  <tr>
                    <th rowSpan={2}>Parámetro</th>
                    {dias.map((d, i) => <th key={d.dia} colSpan={d.n} className={`sv-dia ${i > 0 ? "dia" : ""}`}>{d.dia}</th>)}
                  </tr>
                  <tr>
                    {columnas.map((c) => (
                      <th key={c.control.id} className={clase(c)}>
                        {c.hitos.length > 0 && <div className="sv-evento" title={c.hitos.join(" · ")}>{c.hitos.join(" · ")}</div>}
                        {c.control.hora}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <Fragment key={f.etiqueta}>
                      {f.grupo !== filas[i - 1]?.grupo && f.grupo !== "Firma" && (
                        <tr className="sv-grupo"><td colSpan={columnas.length + 1}><span>{f.grupo}</span></td></tr>
                      )}
                      <tr className={f.grupo === "Firma" ? "sv-firma" : undefined}>
                        <td>{f.etiqueta}</td>
                        {columnas.map((c) => {
                          const x = f.celda(c.control);
                          return (
                            <td key={c.control.id} className={`v ${clase(c)}`}>
                              {x.bloqueado ? <span className="lockc" title="Invalidado: asincronía en modalidad controlada">bloq.</span> : x.texto}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ margin: 0, padding: "6px 14px" }}>«--» sin dato · «bloq.» mecánica invalidada por asincronía en modo controlado · * Glasgow bajo sedación · La línea gruesa separa los días.</p>

          <div className="sv-otros" aria-label="Otros eventos">
            <h3>Otros eventos {rango === "24H" ? "· últimas 24 h" : "· toda la estadía"}</h3>
            {otros.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>Sin otros eventos.</p>
            ) : (
              <ul>
                {otros.map((e) => (
                  <li key={e.id}><span className="mono">{fechaHora(e.registradoEn)}</span> {describirEvento(e, eventos)}{e.comentario ? `. ${e.comentario}` : ""} <span className="muted">· {nombreProfesional(e.rutAutor)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="sv-evaluaciones">
          {evaluaciones.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Sin evaluaciones registradas en este episodio.</p>
          ) : (
            <div className="scroll-x">
              <table className="sab sab-plana">
                <thead>
                  <tr><th>Fecha</th><th>Escala</th><th>Resultado</th><th>Firma</th></tr>
                </thead>
                <tbody>
                  {evaluaciones.map((e) => {
                    if (e.tipo !== "EVALUACION_PUNTUAL") return null;
                    const def = ESCALAS.find((d) => d.id === e.escala);
                    const r = def ? calcularEscala(def.id, e.valores) : null;
                    const resultado = r ? [r.lineas.join(" · "), r.interpretacion].filter(Boolean).join(" · ") : describirEvento(e);
                    return (
                      <tr key={e.id}>
                        <td className="mono">{fechaHora(e.registradoEn)}</td>
                        <td>{def?.nombre ?? e.escala}</td>
                        <td style={{ textAlign: "left", whiteSpace: "normal" }}>{resultado || "registrada"}{e.comentario ? ` · ${e.comentario}` : ""}</td>
                        <td>{nombreProfesional(e.rutAutor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
