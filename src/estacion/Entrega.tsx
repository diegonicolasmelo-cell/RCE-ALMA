import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ETIQUETA_ELEMENTO,
  ETIQUETA_MODALIDAD,
  calcularGlasgow,
  describirEvento,
  estadoFlujoPve,
  filtrosPorCambiar,
  contextoFiltros,
  horasDeVm,
  nombreCama,
  periodoDe,
  sedoanalgesiaActiva,
  textoCategoriaRem,
  textoVm,
  turnoDe
} from "@core/index";
import type { Control, Episodio, EventoClinico, IdentidadPaciente } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { guardarMeta, leerMeta } from "../datos/db";
import type { DatosUnidad } from "./datos";
import { evaluacionesDe } from "./sabana";
import { iniciales } from "./util";

const p2 = (n: number): string => String(n).padStart(2, "0");
const ddmm = (iso: string): string => { const d = new Date(iso); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}`; };

/** Pasos internos de un flujo que no se listan como eventos del turno. */
const INTERNOS = new Set<EventoClinico["tipo"]>(["CONTROL_PVE", "INICIO_PVE", "EVALUACION_PVE", "REEVAL_POST_EXTUB", "EVALUACION_PUNTUAL", "NOTA_ENTREGA"]);

export interface FichaEntrega {
  readonly ep: Episodio;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly resumen: string;
  readonly comoQueda: readonly string[];
  readonly eventos: readonly string[];
  readonly atencion: readonly string[];
}

/** La ficha de una cama, armada solo con lo registrado. */
export function fichaDe(ep: Episodio, controles: readonly Control[], eventos: readonly EventoClinico[], identidad: IdentidadPaciente | undefined, ahora: Date): FichaEntrega {
  const ultimo = controles[controles.length - 1];
  const turno = periodoDe("TURNO", ahora);
  const comoQueda: string[] = [];
  if (ultimo) {
    const v = ultimo.ventilacion;
    const params = [
      v.fio2 !== null ? `FiO₂ ${v.fio2} %` : "",
      v.peep !== null ? `PEEP ${v.peep}` : "",
      v.presion !== null ? `P ${v.presion}` : "",
      v.flujo !== null ? `${v.flujo} L/min` : ""
    ].filter(Boolean).join(" · ");
    comoQueda.push(`${ETIQUETA_MODALIDAD[v.modalidad] ?? ""}${params ? ` · ${params}` : ""}`);
    comoQueda.push([ultimo.fc !== null ? `FC ${ultimo.fc}` : "", ultimo.pas !== null && ultimo.pad !== null ? `PA ${ultimo.pas}/${ultimo.pad}` : "", ultimo.spo2 !== null ? `SpO₂ ${ultimo.spo2} %` : ""].filter(Boolean).join(" · "));
    const gcs = ultimo.glasgow ? `Glasgow ${calcularGlasgow(ultimo.glasgow, ultimo.viaAerea).display}` : "";
    const sed = sedoanalgesiaActiva(ultimo.infusiones) ? `SAS ${ultimo.sas ?? "—"} · con sedación` : "sin sedación";
    comoQueda.push([gcs, sed].filter(Boolean).join(" · "));
    comoQueda.push(`Último control ${ultimo.hora} · ${iniciales(ultimo.rutAutor)}`);
  } else comoQueda.push("Sin controles registrados");

  const delTurno = eventos.filter((e) => Date.parse(e.registradoEn) >= turno.desde.getTime() && Date.parse(e.registradoEn) < turno.hasta.getTime());
  const evs: string[] = delTurno.filter((e) => !INTERNOS.has(e.tipo)).map((e) => `${e.hora} ${e.tipo === "FIN_PVE" ? (e.exitosa ? "PVE tolerada" : "PVE no tolerada") : describirEvento(e, eventos)}`);
  const flujo = estadoFlujoPve(eventos, ahora);
  if (flujo.bloque) {
    const hechos = flujo.bloque.momentos.filter((m) => m.registrado).map((m) => (m.id === "EXTUB" ? "inmediato" : m.etiqueta));
    evs.push(`Post extubación: ${hechos.length ? hechos.join(" · ") + " ✓" : "sin controles aún"}`);
  }
  if (evs.length === 0) evs.push("Sin eventos en el turno");

  const atencion: string[] = [];
  if (flujo.bloque) {
    for (const m of flujo.bloque.momentos.filter((x) => x.estado === "TOCA" || x.estado === "PROXIMO")) {
      const t = new Date(m.venceEn);
      atencion.push(`Control post extub. ${m.id === "EXTUB" ? "inmediato" : m.etiqueta}: ${m.minutosFaltantes <= 0 ? "pendiente" : `${ddmm(m.venceEn)} ${p2(t.getHours())}:${p2(t.getMinutes())}`}`);
    }
  }
  if (flujo.fase === "EN_CURSO") atencion.push(`PVE en curso desde las ${flujo.pve.inicioEn ? new Date(flujo.pve.inicioEn).toTimeString().slice(0, 5) : "—"}`);
  for (const f of filtrosPorCambiar(eventos, ahora, contextoFiltros(ep, controles))) atencion.push(`${ETIQUETA_ELEMENTO[f.elemento]} ${f.estado === "VENCIDO" ? "vencido" : "vence hoy"}${f.cambiadoEn ? ` (etiqueta ${ddmm(f.cambiadoEn)})` : ""}`);
  for (const e of evaluacionesDe(eventos).slice(0, 2)) atencion.push(`${describirEvento(e, eventos)} · ${ddmm(e.registradoEn)} · ${iniciales(e.rutAutor)}`);
  if (atencion.length === 0) atencion.push("Nada pendiente registrado");

  const dias = ep.ingresadoEn ? Math.max(0, Math.floor((ahora.getTime() - Date.parse(ep.ingresadoEn)) / 86_400_000)) : null;
  const vm = textoVm(horasDeVm(ep, eventos, controles[0]?.registradoEn ?? null, ahora));
  return {
    ep,
    titulo: nombreCama(ep.cama).toUpperCase(),
    subtitulo: [identidad?.nombre, ep.rangoEdad ? `${ep.rangoEdad} años` : "", ep.sexo, textoCategoriaRem(ep.categoriaRem)].filter(Boolean).join(" · "),
    resumen: [dias !== null ? `Estadía ${dias} d` : "", vm ?? ""].filter(Boolean).join(" · "),
    comoQueda: comoQueda.filter(Boolean),
    eventos: evs,
    atencion
  };
}

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** La hoja de entrega para imprimir en blanco y negro. */
function htmlEntrega(fichas: readonly FichaEntrega[], etiqueta: string): string {
  const lista = (xs: readonly string[]): string => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Entrega de turno</title><style>
body{font:12px/1.4 Arial,sans-serif;color:#000;margin:14mm}
h1{font-size:15px;margin:0 0 10px}
.f{border:1px solid #000;border-radius:4px;padding:8px 10px;margin-bottom:10px;break-inside:avoid}
.c{display:flex;gap:10px;align-items:baseline;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:6px}
.c b{background:#000;color:#fff;padding:2px 8px;border-radius:3px;font-size:14px}
.c .r{margin-left:auto}
.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.t{font-size:10px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase}
ul{margin:2px 0 0;padding-left:15px}
.p{border:1.5px solid #000;border-radius:4px;padding:5px 8px;margin-top:6px;min-height:30px}
</style></head><body><h1>Entrega de turno · ${esc(etiqueta)}</h1>${fichas
    .map(
      (f) => `<div class="f"><div class="c"><b>${esc(f.titulo)}</b><span>${esc(f.subtitulo)}</span><span class="r">${esc(f.resumen)}</span></div>
<div class="g"><div><div class="t">Cómo queda</div>${lista(f.comoQueda)}</div><div><div class="t">Eventos del turno</div>${lista(f.eventos)}</div><div><div class="t">Atención</div>${lista(f.atencion)}</div></div>
<div class="p"><div class="t">Pendiente para el turno que recibe</div>${esc(f.ep.pendienteEntrega || "")}</div></div>`
    )
    .join("")}</body></html>`;
}

/**
 * Entrega de turno: la ficha de cada cama se arma sola con lo registrado. Se eligen las camas,
 * se escribe el pendiente y se imprime en blanco y negro.
 */
export function Entrega({ datos, ahora }: { datos: DatosUnidad; ahora: Date }) {
  const { repo, db } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const camas = [...datos.episodios].sort((a, b) => a.cama.localeCompare(b.cama, "es", { numeric: true }));
  const [quitadas, setQuitadas] = useState<ReadonlySet<string>>(new Set());
  const [pendientes, setPendientes] = useState<Record<string, string>>({});
  const turno = turnoDe(ahora);
  const etiqueta = periodoDe("TURNO", ahora).etiqueta;
  const claveEntrega = `entrega:${turno.clave}`;
  const [entregada, setEntregada] = useState<string | null>(null);
  useEffect(() => {
    void leerMeta<string>(db, claveEntrega).then((h) => setEntregada(h ?? null));
  }, [db, claveEntrega]);

  const elegidas = camas.filter((e) => !quitadas.has(e.id));
  const fichas = elegidas.map((ep) => {
    const f = fichaDe(ep, datos.controles.get(ep.id) ?? [], datos.eventos.get(ep.id) ?? [], datos.identidades.get(ep.id), ahora);
    return pendientes[ep.id] !== undefined ? { ...f, ep: { ...f.ep, pendienteEntrega: pendientes[ep.id]! } } : f;
  });

  const guardarPendiente = async (ep: Episodio): Promise<void> => {
    const texto = pendientes[ep.id];
    if (texto === undefined || texto === ep.pendienteEntrega) return;
    await repo.guardarEpisodio({ ...ep, pendienteEntrega: texto });
  };
  const imprimir = (): void => {
    const url = URL.createObjectURL(new Blob([htmlEntrega(fichas, etiqueta)], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => w.print());
    else avisar("El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir.");
  };
  const marcarEntregada = async (): Promise<void> => {
    await Promise.all(elegidas.map((ep) => guardarPendiente(ep)));
    const h = new Date().toTimeString().slice(0, 5);
    await guardarMeta(db, claveEntrega, h);
    setEntregada(h);
    avisar(`Entrega del ${etiqueta.toLowerCase()} guardada a las ${h}.`);
  };

  return (
    <section className="stack" aria-label="Entrega de turno" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b>{etiqueta}</b>
        {entregada ? <span className="pill good">Entregada a las {entregada}</span> : <span className="pill">Sin entregar</span>}
        <span style={{ marginLeft: "auto" }} />
        <button type="button" className="btn" onClick={() => void marcarEntregada()}>Guardar como entregada</button>
        <button type="button" className="btn primary" disabled={fichas.length === 0} onClick={imprimir}><Printer size={15} aria-hidden /> Imprimir</button>
      </div>
      <div className="ent-cuerpo">
        <div className="ent-camas" role="group" aria-label="Camas a entregar">
          <span className="small muted">Camas a entregar</span>
          {camas.map((ep) => (
            <label key={ep.id} className="ent-cama">
              <input type="checkbox" checked={!quitadas.has(ep.id)} onChange={() => setQuitadas((q) => { const x = new Set(q); if (x.has(ep.id)) x.delete(ep.id); else x.add(ep.id); return x; })} />
              {nombreCama(ep.cama)}
              <small>{ep.viaAereaActual === "NATURAL" ? "natural" : ep.viaAereaActual}</small>
            </label>
          ))}
          {camas.length === 0 && <p className="small muted">No hay pacientes.</p>}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {fichas.map((f) => (
            <article key={f.ep.id} className="ent-ficha" aria-label={`Entrega ${f.titulo}`}>
              <div className="ent-cab"><b>{f.titulo}</b><span>{f.subtitulo}</span><span className="ent-res">{f.resumen}</span></div>
              <div className="ent-cols">
                <div><span className="ent-t">Cómo queda</span><ul>{f.comoQueda.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><span className="ent-t">Eventos del turno</span><ul>{f.eventos.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><span className="ent-t">Atención</span><ul>{f.atencion.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              </div>
              <label className="ent-pend">
                <span className="ent-t">Pendiente para el turno que recibe</span>
                <textarea
                  id={`ent-pend-${f.ep.id}`}
                  maxLength={400}
                  value={pendientes[f.ep.id] ?? f.ep.pendienteEntrega}
                  onChange={(e) => setPendientes((p) => ({ ...p, [f.ep.id]: e.target.value }))}
                  onBlur={() => void guardarPendiente(camas.find((c) => c.id === f.ep.id)!)}
                />
              </label>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
