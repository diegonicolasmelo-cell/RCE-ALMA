import { useState } from "react";
import { META_AUTOEXT_POR_100_VM, META_FRACASO_PCT, META_FUERA_PROTOCOLO_PCT, calcularIndicadores, nombreMes, tendenciaMensual } from "@core/index";
import type { Periodo } from "@core/index";
import type { DatosUnidad } from "./datos";

type Rango = "MES" | "MES_ANTERIOR" | "TRES" | "ANIO";
const RANGOS: readonly [Rango, string][] = [["MES", "Este mes"], ["MES_ANTERIOR", "Mes anterior"], ["TRES", "Últimos 3 meses"], ["ANIO", "Este año"]];

function periodo(r: Rango, ahora: Date): Periodo {
  const a = ahora.getFullYear();
  const m = ahora.getMonth();
  switch (r) {
    case "MES":
      return { desde: new Date(a, m, 1), hasta: new Date(a, m + 1, 1), etiqueta: nombreMes(new Date(a, m, 1)) };
    case "MES_ANTERIOR":
      return { desde: new Date(a, m - 1, 1), hasta: new Date(a, m, 1), etiqueta: nombreMes(new Date(a, m - 1, 1)) };
    case "TRES":
      return { desde: new Date(a, m - 2, 1), hasta: new Date(a, m + 1, 1), etiqueta: `${nombreMes(new Date(a, m - 2, 1))} a ${nombreMes(new Date(a, m, 1))}` };
    case "ANIO":
      return { desde: new Date(a, 0, 1), hasta: new Date(a + 1, 0, 1), etiqueta: `Año ${a}` };
  }
}

/** Minutos a «12 h 30 min». */
const horas = (min: number): string => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const num = (v: number | null, d = 1): string => (v === null ? "—" : v.toLocaleString("es-CL", { maximumFractionDigits: d }));

/** Semaforo de la meta: verde cumple, rojo no cumple, gris sin dato. */
type Estado = "ok" | "mal" | "neu";

/**
 * Indicadores de la unidad, con las mismas definiciones del tablero del RCE, calculados con el
 * registro de Kaptus. Cada cifra muestra su numerador y su denominador.
 */
export function Indicadores({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  const [rango, setRango] = useState<Rango>("MES");
  const p = periodo(rango, ahora);
  const base = { episodios: datos.todosEpisodios, controles: datos.controles, eventos: datos.eventos };
  const i = calcularIndicadores(base, p, ahora);
  const tend = tendenciaMensual(base, ahora);

  const kpis: { t: string; v: string; u?: string; f: string; meta: string; estado: Estado }[] = [
    {
      t: "Fracaso de extubación (≤ 48 h)", v: num(i.fracasoPct), u: "%",
      f: `${i.fracaso} de ${i.extubaciones} extubaciones programadas · precoz ${i.fracasoPrecoz} · tardío ${i.fracasoTardio}`,
      meta: `meta < ${META_FRACASO_PCT} %`, estado: i.fracasoPct === null ? "neu" : i.fracasoPct < META_FRACASO_PCT ? "ok" : "mal"
    },
    {
      t: "Autoextubaciones y accidentales", v: num(i.autoextPor100Vm), u: "/ 100 días-VM",
      f: `${i.autoextubaciones} en ${i.diasVm} días-VM${i.accidentales ? ` · ${i.accidentales} accidental${i.accidentales === 1 ? "" : "es"}` : ""}`,
      meta: `meta ${META_AUTOEXT_POR_100_VM[0]}–${META_AUTOEXT_POR_100_VM[1]}`, estado: i.autoextPor100Vm === null ? "neu" : i.autoextPor100Vm <= META_AUTOEXT_POR_100_VM[1] ? "ok" : "mal"
    },
    {
      t: "Extubación fuera de protocolo", v: num(i.fueraPct), u: "%",
      f: `${i.fueraProtocolo} de ${i.extubaciones} programadas`,
      meta: `meta < ${META_FUERA_PROTOCOLO_PCT} %`, estado: i.fueraPct === null ? "neu" : i.fueraPct < META_FUERA_PROTOCOLO_PCT ? "ok" : "mal"
    },
    {
      t: "PVE realizadas", v: num(i.pvePor100PacDia, 2), u: "/ 100 días-pac.",
      f: `${i.pve} PVE en ${i.diasPaciente} días-paciente`, meta: "sin meta fijada", estado: "neu"
    }
  ];

  // Tendencia: el fracaso de extubacion de los ultimos 12 meses, dibujado a escala.
  const W = 560, H = 190, X0 = 40, Y0 = 160, maxPct = Math.max(30, ...tend.map((m) => m.fracasoPct ?? 0));
  const x = (k: number): number => X0 + 15 + k * ((W - X0 - 25) / Math.max(1, tend.length - 1));
  const y = (v: number): number => Y0 - (v / maxPct) * (Y0 - 10);
  const conDato = tend.map((m, k) => ({ ...m, k })).filter((m) => m.fracasoPct !== null);

  return (
    <section className="stack" aria-label="Indicadores" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg" role="group" aria-label="Periodo">
          {RANGOS.map(([k, t]) => <button key={k} type="button" aria-pressed={rango === k} onClick={() => setRango(k)}>{t}</button>)}
        </div>
        <span className="small muted">{p.etiqueta} · {i.diasPaciente} días-paciente · {i.diasVm} días-VM</span>
      </div>

      <div className="ind-kpis">
        {kpis.map((k) => (
          <div key={k.t} className={`ind-kpi ${k.estado}`}>
            <span className="t">{k.t}</span>
            <span className="v">{k.v}{k.u && <small> {k.u}</small>}</span>
            <span className="f">{k.f}</span>
            <span className={`m ${k.estado}`}>{k.meta}</span>
          </div>
        ))}
      </div>

      <div className="est-dos">
        <div className="card stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Fracaso de extubación · últimos 12 meses</h3>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tendencia mensual del fracaso de extubación">
            {[0, maxPct / 3, (2 * maxPct) / 3, maxPct].map((v) => (
              <g key={v}><line x1={X0} y1={y(v)} x2={W - 10} y2={y(v)} stroke="var(--line)" /><text x={X0 - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-2)">{Math.round(v)} %</text></g>
            ))}
            <line x1={X0} y1={y(META_FRACASO_PCT)} x2={W - 10} y2={y(META_FRACASO_PCT)} stroke="var(--crit)" strokeDasharray="4 3" />
            {conDato.length > 1 && <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={conDato.map((m) => `${x(m.k)},${y(m.fracasoPct!)}`).join(" ")} />}
            {conDato.map((m) => <circle key={m.mes} cx={x(m.k)} cy={y(m.fracasoPct!)} r={m.k === tend.length - 1 ? 5 : 3.5} fill="var(--accent)"><title>{`${m.etiqueta}: ${m.fracaso} de ${m.extubaciones}`}</title></circle>)}
            {tend.map((m, k) => <text key={m.mes} x={x(k)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-2)">{m.etiqueta}</text>)}
          </svg>
          <span className="small muted">Línea roja: meta {META_FRACASO_PCT} %. Los meses sin extubaciones no tienen punto. El histórico del RCE se sumará cuando se cargue su tabla mensual.</span>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Extubaciones fuera de protocolo · por qué</h3>
          {i.motivosFuera.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Sin extubaciones fuera de protocolo en el periodo.</p> : (
            <table className="est-tabla"><thead><tr><th>Motivo (sin PVE)</th><th className="n">Total</th><th className="n">De noche</th></tr></thead>
              <tbody>{i.motivosFuera.map((m) => <tr key={m.motivo}><td>{m.motivo}</td><td className="n">{m.total}</td><td className="n">{m.noche}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="ind-tres">
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Ventilación mecánica</h3>
          <div className="ind-fila"><span>Días-VM</span><b>{i.diasVm}</b></div>
          <div className="ind-fila"><span>Pacientes ventilados</span><b>{i.ventilados}</b></div>
          <div className="ind-fila"><span>VM prolongada (&gt; 7 días)</span><b>{i.vmProlongada} · {num(i.vmProlongadaPct)} %</b></div>
          <div className="ind-fila"><span>TQT realizadas</span><b>{i.tqt}</b></div>
          <div className="ind-fila"><span>Mediana de días de VM antes de la TQT</span><b>{num(i.medianaVmPreTqt)}</b></div>
          <div className="ind-fila"><span>Reintubaciones (todas)</span><b>{i.reintubaciones}</b></div>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Destete por TQT</h3>
          <div className="ind-fila"><span>Desvinculaciones</span><b>{i.desvinculaciones} · {i.desvincPacientes} pacientes</b></div>
          <div className="ind-fila"><span>Terminaron en reconexión</span><b>{i.desvincReconexiones}</b></div>
          <div className="ind-fila"><span>Horas fuera del ventilador</span><b>{num(i.desvincHoras)} · mediana {num(i.desvincMedianaHoras)}</b></div>
          <div className="ind-fila"><span>Válvula de fonación</span><b>{horas(i.minutosValvula)} · {i.turnosValvula} turnos</b></div>
          <div className="ind-fila"><span>Decanulaciones</span><b>{i.decanulaciones}</b></div>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Unidad</h3>
          <div className="ind-fila"><span>Atenciones kinésicas</span><b>{i.atenciones} · {num(i.atencionesPorPacDia, 2)} por día-pac.</b></div>
          <div className="ind-fila"><span>Ocupación promedio</span><b>{num(i.ocupacionProm)} camas</b></div>
          <div className="ind-fila"><span>Egresos</span><b>{i.egresos}</b></div>
          <div className="ind-fila"><span>Mortalidad (sin ajuste)</span><b>{i.fallecidos} · {num(i.mortalidadPct)} %</b></div>
          <div className="ind-fila"><span>Reingresos (misma persona, por la huella del RUT)</span><b>{i.ingresosConHuella ? `${i.reingresos} de ${i.ingresosConHuella} ingresos con RUT` : <span className="muted">sin ingresos con RUT</span>}</b></div>
        </div>
      </div>

      <div className="est-dos">
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Kinesiterapia</h3>
          <div className="ind-fila"><span>Terapia física (KTM) realizada</span><b>{i.ktm}</b></div>
          <div className="ind-fila"><span>Sesiones de IMT</span><b>{i.imt}</b></div>
          <div className="ind-fila"><span>PTO · primera bipedestación del episodio</span><b>{i.pto}</b></div>
          <div className="ind-fila"><span>Educación al paciente, familia o cuidador</span><b>{i.educacion}</b></div>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Egresos por destino</h3>
          {i.destinos.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Sin egresos en el periodo.</p> : i.destinos.map((x) => (
            <div key={x.destino} className="ind-fila"><span>{x.destino}</span><b>{x.n}</b></div>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Definiciones del tablero del RCE: fracaso = reintubación dentro de 48 h de una extubación programada (con o sin PVE); la autoextubación va aparte. Día-VM = día con al menos un control en ventilación mecánica invasiva. Mortalidad sin ajuste por gravedad.</p>
    </section>
  );
}
