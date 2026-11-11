import { Download } from "lucide-react";
import { useState } from "react";
import { CATEGORIAS_REM, ETIQUETA_MOTIVO_EGRESO, MOTIVOS_EGRESO, RANGOS_EDAD, consolidarRemMensual, mesDe, remMensualCsv } from "@core/index";
import type { FilaRango, FilaSexoRango } from "@core/index";
import type { DatosUnidad } from "./datos";

const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const textoMes = (m: string): string => `${NOMBRE_MES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Los ultimos 12 meses, del actual hacia atras. */
function mesesRecientes(ahora: Date): string[] {
  return Array.from({ length: 12 }, (_, i) => mesDe(new Date(ahora.getFullYear(), ahora.getMonth() - i, 15).toISOString()));
}

/** Solo las columnas de rango que tienen algo: la planilla tiene 17 y casi todas van en cero. */
function rangosConDatos(filas: readonly (FilaSexoRango | FilaRango)[]): typeof RANGOS_EDAD[number][] {
  return RANGOS_EDAD.filter((g) =>
    filas.some((f) => {
      const v = f.porRango[g];
      return typeof v === "number" ? v > 0 : v.hombres + v.mujeres > 0;
    })
  );
}

export function Rem28({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  const meses = mesesRecientes(ahora);
  const [mes, setMes] = useState(meses[0]!);
  const r = consolidarRemMensual(mes, datos.todosEpisodios, datos.controles, datos.eventos);

  const filasB1: [string, FilaSexoRango][] = [
    ["Total ingresos (Nº de personas)", r.ingresos],
    ...CATEGORIAS_REM.filter((c) => r.ingresosPorCategoria[c].total > 0).map((c): [string, FilaSexoRango] => [c, r.ingresosPorCategoria[c]]),
    ["EGRESOS", r.egresos],
    ...MOTIVOS_EGRESO.filter((m) => r.egresosPorMotivo[m].total > 0).map((m): [string, FilaSexoRango] => [ETIQUETA_MOTIVO_EGRESO[m], r.egresosPorMotivo[m]])
  ];
  const rangosB1 = rangosConDatos(filasB1.map(([, f]) => f));
  const filasB24: [string, FilaRango][] = [
    ["B.2 Evaluación inicial", r.evaluacionInicial],
    ["B.3 Evaluación intermedia", r.evaluacionIntermedia],
    ["B.4 Sesiones de rehabilitación (motoras)", r.sesionesMotoras]
  ];
  const rangosB24 = rangosConDatos(filasB24.map(([, f]) => f));

  const descargar = (): void => {
    // BOM: para que Excel lea bien las tildes.
    const url = URL.createObjectURL(new Blob(["﻿" + remMensualCsv(r)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `REM28_UCI_${mes}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sinRango = r.ingresos.sinRango + r.egresos.sinRango;
  return (
    <section className="card stack" aria-label="REM 28" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>REM 28 · Kinesiología UCI</h2>
        <span className="row" style={{ gap: 8 }}>
          <label htmlFor="rem-mes" className="small">Mes</label>
          <select id="rem-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => <option key={m} value={m}>{textoMes(m)}</option>)}
          </select>
          <button type="button" className="btn primary sm" onClick={descargar}><Download size={15} aria-hidden /> Descargar CSV</button>
        </span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Calculado de lo registrado en Kapta. Tipo de atención: cerrada, UPC. Solo se muestran los rangos con datos; el CSV trae los 17.</p>

      {(r.ingresosSinCategoria > 0 || sinRango > 0 || r.egresosSinMotivo > 0) && (
        <div className="notice warn small" role="status">
          {r.ingresosSinCategoria > 0 && <div>{r.ingresosSinCategoria} ingreso(s) sin categoría REM: complétala en la ficha del paciente.</div>}
          {sinRango > 0 && <div>{sinRango} persona(s) sin edad: no caen en ningún rango.</div>}
          {r.egresosSinMotivo > 0 && <div>{r.egresosSinMotivo} egreso(s) anteriores sin motivo registrado: no se cuentan en B.1.</div>}
        </div>
      )}

      <h3 style={{ margin: 0 }}>B.1 Ingresos y egresos</h3>
      <div className="scroll-x">
        <table className="sab sab-plana" aria-label="B.1 Ingresos y egresos">
          <thead>
            <tr><th rowSpan={2}></th><th rowSpan={2}>Total</th><th rowSpan={2}>H</th><th rowSpan={2}>M</th>{rangosB1.map((g) => <th key={g} colSpan={2}>{g}</th>)}</tr>
            <tr>{rangosB1.flatMap((g) => [<th key={`${g}h`}>H</th>, <th key={`${g}m`}>M</th>])}</tr>
          </thead>
          <tbody>
            {filasB1.map(([t, f]) => (
              <tr key={t}>
                <td style={{ textAlign: "left" }}>{t}</td><td className="v"><b>{f.total}</b></td><td className="v">{f.hombres}</td><td className="v">{f.mujeres}</td>
                {rangosB1.flatMap((g) => [<td key={`${g}h`} className="v">{f.porRango[g].hombres}</td>, <td key={`${g}m`} className="v">{f.porRango[g].mujeres}</td>])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: 0 }}>B.2 a B.4 · Kinesiólogo/a</h3>
      <div className="scroll-x">
        <table className="sab sab-plana" aria-label="B.2 a B.4">
          <thead><tr><th></th><th>Total</th>{rangosB24.map((g) => <th key={g}>{g}</th>)}</tr></thead>
          <tbody>
            {filasB24.map(([t, f]) => (
              <tr key={t}><td style={{ textAlign: "left" }}>{t}</td><td className="v"><b>{f.total}</b></td>{rangosB24.map((g) => <td key={g} className="v">{f.porRango[g]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: 0 }}>B.6 y REM BS</h3>
      <table className="sab sab-plana" aria-label="B.6 y BS">
        <tbody>
          <tr><td style={{ textAlign: "left" }}>B.6 Terapia respiratoria y funcional pulmonar</td><td className="v"><b>{r.terapiaRespiratoria}</b></td></tr>
          <tr><td style={{ textAlign: "left" }}>0601101 Evaluación kinesiológica integral</td><td className="v"><b>{r.bs.evaluacionIntegral}</b></td></tr>
          <tr><td style={{ textAlign: "left" }}>0601104 Atención kinesiológica integral UPC</td><td className="v"><b>{r.bs.atencionIntegralUpc}</b></td></tr>
          <tr><td style={{ textAlign: "left" }}>0601024 Reeducación motriz</td><td className="v"><b>{r.bs.reeducacionMotriz}</b></td></tr>
          <tr><td style={{ textAlign: "left" }}>0601171 Asistencia en IOT o cambio de cánula de TQT</td><td className="v"><b>{r.bs.asistenciaIotCanula}</b></td></tr>
        </tbody>
      </table>
      <p className="small muted" style={{ margin: 0 }}>Quedan a mano: ejercicios terapéuticos (B.6), permeabilización de vía aérea (0601030), reeducación de la tos (0102501), asistencia en VMNI y el desglose MAI/MLE de beneficiarios.</p>
    </section>
  );
}
