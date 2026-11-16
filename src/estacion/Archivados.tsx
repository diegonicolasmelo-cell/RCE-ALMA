import { useState } from "react";
import { CATEGORIAS_REM, ETIQUETA_MOTIVO_EGRESO, MOTIVOS_EGRESO, archivados, nombreCama, nombreMes, puedeDeshacerAlta, textoCategoriaRem } from "@core/index";
import type { MotivoEgreso } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import type { DatosUnidad } from "./datos";
import { SabanaVista } from "./SabanaVista";

const p2 = (n: number): string => String(n).padStart(2, "0");
const fechaHora = (iso: string): string => {
  const d = new Date(iso);
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const mesDe = (iso: string): string => iso.slice(0, 7);

/**
 * Los episodios egresados. Van sin nombre ni RUT (se borran al egreso): se buscan por mes,
 * diagnóstico REM y motivo, y se abre su sábana completa. Un alta reciente (24 h) se puede
 * deshacer si la cama sigue libre.
 */
export function Archivados({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const todos = archivados({ episodios: datos.todosEpisodios, controles: datos.controles, eventos: datos.eventos });
  const meses = [...new Set(todos.map((a) => mesDe(new Date(a.egresoEn).toISOString())))];
  const [mes, setMes] = useState<string>("");
  const [cat, setCat] = useState<string>("");
  const [motivo, setMotivo] = useState<MotivoEgreso | "">("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const lista = todos.filter((a) => (!mes || mesDe(new Date(a.egresoEn).toISOString()) === mes) && (!cat || a.episodio.categoriaRem === cat) && (!motivo || a.motivo === motivo));
  const elegido = abierto ? lista.find((a) => a.episodio.id === abierto) : undefined;

  const deshacer = async (id: string, cama: string): Promise<void> => {
    await repo.deshacerAlta(id);
    setConfirmar(null);
    avisar(`Alta deshecha: el paciente vuelve a ${nombreCama(cama)}. Si su nombre ya se había borrado, complétalo de nuevo en el Tablero.`);
  };

  return (
    <section className="stack" aria-label="Archivados" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select id="arc-mes" aria-label="Mes de egreso" value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{nombreMes(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))}</option>)}
        </select>
        <select id="arc-cat" aria-label="Diagnóstico REM" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todos los diagnósticos</option>
          {CATEGORIAS_REM.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select id="arc-mot" aria-label="Motivo de egreso" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoEgreso | "")}>
          <option value="">Todos los motivos</option>
          {MOTIVOS_EGRESO.map((m) => <option key={m} value={m}>{ETIQUETA_MOTIVO_EGRESO[m]}</option>)}
        </select>
        <span className="small muted" style={{ marginLeft: "auto" }}>{lista.length} episodio{lista.length === 1 ? "" : "s"} · sin nombre ni RUT</span>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {lista.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>No hay egresos con esos filtros.</p> : (
          <table className="est-tabla" aria-label="Episodios egresados">
            <thead><tr><th>Egreso</th><th>Cama</th><th>Edad · sexo</th><th>Diagnóstico REM</th><th className="n">Estadía</th><th className="n">Días VM</th><th>Hitos</th><th>Destino</th><th /></tr></thead>
            <tbody>
              {lista.map((a) => {
                const ep = a.episodio;
                const puede = puedeDeshacerAlta(ep, datos.episodios, ahora);
                return (
                  <tr key={ep.id} className={abierto === ep.id ? "sel" : ""}>
                    <td className="mono">{fechaHora(a.egresoEn)}</td>
                    <td>{nombreCama(ep.cama)}</td>
                    <td>{ep.rangoEdad ?? "—"} · {ep.sexo}</td>
                    <td>{textoCategoriaRem(ep.categoriaRem)}</td>
                    <td className="n">{a.diasEstadia} d</td>
                    <td className="n">{a.diasVm}</td>
                    <td className="small">{a.hitos}</td>
                    <td><span className={`pill ${a.motivo === "ALTA" ? "good" : ""}`}>{ep.egreso?.destino ?? ETIQUETA_MOTIVO_EGRESO[a.motivo].replace(/ \(.*\)$/, "")}</span>{ep.huellaPersona && datos.todosEpisodios.some((o) => o.id !== ep.id && o.huellaPersona === ep.huellaPersona) ? <span className="pill warn" title="La misma persona tiene otro episodio en la unidad">reingreso</span> : null}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="btn sm" onClick={() => setAbierto(abierto === ep.id ? null : ep.id)}>{abierto === ep.id ? "Cerrar sábana" : "Ver sábana"}</button>{" "}
                      {puede && (confirmar === ep.id ? (
                        <><button type="button" className="btn sm danger" onClick={() => void deshacer(ep.id, ep.cama)}>Sí, deshacer</button> <button type="button" className="btn sm" onClick={() => setConfirmar(null)}>No</button></>
                      ) : (
                        <button type="button" className="btn sm" onClick={() => setConfirmar(ep.id)}>Deshacer alta</button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>«Deshacer alta» aparece solo en las primeras 24 horas después del egreso y si la cama sigue libre.</p>

      {elegido && (
        <div className="card" aria-label="Sábana del episodio">
          <h3 style={{ marginTop: 0 }}>Sábana · {nombreCama(elegido.episodio.cama)} · egreso {fechaHora(elegido.egresoEn)}</h3>
          <SabanaVista ep={elegido.episodio} controles={datos.controles.get(elegido.episodio.id) ?? []} eventos={datos.eventos.get(elegido.episodio.id) ?? []} ahora={ahora} />
        </div>
      )}
    </section>
  );
}
