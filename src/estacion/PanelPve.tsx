import { CRITERIOS_PVE, bloquesPostExtub, registrosPve } from "@core/index";
import type { EventoClinico, LecturasPve, Medicion } from "@core/index";

const v = (x: Medicion | string | undefined): string => (x === null || x === undefined || x === "" ? "—" : String(x));
const pa = (l: LecturasPve | undefined): string => (l && l.pas !== null && l.pad !== null ? `${l.pas}/${l.pad}` : "—");

/** Hoja de registro de PVE, con las mismas filas y orden que el papel. */
export function PanelPve({ eventos, ahora }: { eventos: readonly EventoClinico[]; ahora: Date }) {
  const pves = registrosPve(eventos);
  const bloques = bloquesPostExtub(eventos, ahora);
  const checklists = eventos.filter((e): e is Extract<EventoClinico, { tipo: "EVALUACION_PVE" }> => e.tipo === "EVALUACION_PVE");
  if (pves.length === 0 && bloques.length === 0 && checklists.length === 0) return null;

  const filasPve: [string, (l: LecturasPve | undefined, hora: string) => string][] = [
    ["Hora", (_l, h) => h || "—"],
    ["Frecuencia Cardiaca", (l) => v(l?.fc)],
    ["Presión Arterial", (l) => pa(l)],
    ["Frecuencia Respiratoria", (l) => v(l?.fr)],
    ["SpO2", (l) => v(l?.spo2)],
    ["GCS", (l) => v(l?.gcs)],
    ["Volumen Minuto", (l) => v(l?.volMinuto)],
    ["Trabajo respiratorio", (l) => v(l?.trabajoResp)],
    ["Secreciones bronquiales", (l) => v(l?.secreciones)]
  ];

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>Registro de PVE</h3>
      {checklists.length > 0 && (
        <p className="small ink2">
          Checklist (8 criterios):{" "}
          {checklists.slice(-3).map((c) => `${c.hora} ${c.apto ? "cumple" : `no cumple (${CRITERIOS_PVE.filter((_, i) => !c.criterios[i]).join(", ")})`}`).join(" · ")}
        </p>
      )}
      {pves.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="sab">
            <thead>
              <tr>
                <th>Parámetros</th>
                {pves.slice(-3).flatMap((p) => [<th key={`a${p.numero}`}>PVE {p.numero} · inicio</th>, <th key={`b${p.numero}`}>30 min</th>])}
              </tr>
            </thead>
            <tbody>
              {filasPve.map(([nombre, f]) => (
                <tr key={nombre}>
                  <td>{nombre}</td>
                  {pves.slice(-3).flatMap((p) => [
                    <td key={`a${p.numero}`}>{f(p.inicio?.lecturas, p.inicio?.hora ?? "")}</td>,
                    <td key={`b${p.numero}`}>{f(p.treintaMin?.lecturas, p.treintaMin?.hora ?? "")}</td>
                  ])}
                </tr>
              ))}
              <tr>
                <td>Resultado</td>
                {pves.slice(-3).flatMap((p) => [<td key={`a${p.numero}`} colSpan={2}>{p.fin ? (p.fin.exitosa ? "Tolerada" : "No tolerada") : "En curso"}</td>])}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {bloques.map((b) => {
        const re = eventos.filter((e): e is Extract<EventoClinico, { tipo: "REEVAL_POST_EXTUB" }> => e.tipo === "REEVAL_POST_EXTUB" && e.registradoEn >= b.extubadoEn);
        const filas: [string, (e: (typeof re)[number] | undefined) => string][] = [
          ["Hora", (e) => v(e?.hora)], ["FC", (e) => v(e?.fc)], ["PAM", (e) => v(e?.pam)], ["GCS", (e) => v(e?.gcs)], ["FR", (e) => v(e?.fr)],
          ["FiO2", (e) => v(e?.fio2)], ["Sp02", (e) => v(e?.spo2)], ["Trabajo respiratorio", (e) => v(e?.trabajoResp)], ["Manejo de secreciones", (e) => v(e?.manejoSecreciones)]
        ];
        return (
          <div key={b.extubadoEn} style={{ marginTop: 12, overflowX: "auto" }}>
            <div className="small ink2"><b>Reevaluación post extubación</b> · extubado {b.horaExtubacion}{b.reintubado ? " · reintubado" : ""}</div>
            <table className="sab">
              <thead><tr><th>Parámetros</th>{b.momentos.map((m) => <th key={m.id}>{m.etiqueta}</th>)}</tr></thead>
              <tbody>
                {filas.map(([nombre, f]) => (
                  <tr key={nombre}><td>{nombre}</td>{b.momentos.map((m) => <td key={m.id}>{f(re.find((e) => e.momento === m.id))}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <div className="small ink2">
              Falla post extubación: {b.falla ? (b.falla.falla ? "SÍ" : "NO") : "sin registrar"}
              {b.falla?.hipotesis ? ` · Hipótesis: ${b.falla.hipotesis}` : ""}{b.falla?.observaciones ? ` · Observaciones: ${b.falla.observaciones}` : ""}
            </div>
          </div>
        );
      })}
    </section>
  );
}
