import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import {
  ETIQUETA_ELEMENTO,
  esViaAereaArtificial,
  etiquetaEquipo,
  hallazgosSugeridos,
  contextoFiltros,
  filtrosPorCambiar,
  buscarProfesional,
  nombreCama,
  rondaDelTurno,
  vigenciaFiltros
} from "@core/index";
import type { ElementoCircuito, EventoClinico, HallazgoRonda } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { baseEvento } from "./eventos-ui";
import type { ContextoCama } from "./contextoCama";
import type { ResumenCama } from "./Inicio";
import { PanelEquipos } from "./TabControl";
import { useAtras } from "./Inicio";
import { SalaOchoBits } from "./SalaOchoBits";

const ddmm = (ymd: string | null): string => (ymd ? `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}` : "—");
const hhmm = (iso: string): string => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const iniciales = (correo: string): string => correo.split("@")[0]!.split(/[._-]/).map((p) => p.charAt(0).toUpperCase()).join("").slice(0, 3);
const ELEMENTOS: readonly ElementoCircuito[] = ["HME", "TRACHCARE", "HEPA"];
/** Quién tiene la cama (el titular del episodio), para preguntarle si ya lo cambió. */
const titularDe = (correo: string): string => buscarProfesional(correo)?.nombre ?? "";

/**
 * Ronda de equipos en el celular (Diego, 22/23-nov-2026). Quien toma las salas de atrás recorre
 * cama por cama: confirma los equipos de la sala (el ventilador viaja solo al RCE) y la FECHA QUE SE
 * VE en la etiqueta de cada filtro. Si algo está vencido, le aparece en la campana al colega que
 * tiene la cama. La ronda queda como evento de la cama: se ve en el RCE como «revisada».
 */
export function RondaCel({ resumen, ahora, rutAutor }: { resumen: readonly ResumenCama[]; ahora: Date; rutAutor: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  // Dos formas de ver lo mismo (25-nov-2026): la lista de camas o la sala dibujada en 8 bits.
  const [vista, setVista] = useState<"lista" | "sala">(() => { try { return localStorage.getItem("ronda-vista") === "sala" ? "sala" : "lista"; } catch { return "lista"; } });
  const verComo = (v: "lista" | "sala"): void => { setVista(v); try { localStorage.setItem("ronda-vista", v); } catch { /* sin almacenamiento */ } };
  const orden = [...resumen].sort((a, b) => a.ep.cama.localeCompare(b.ep.cama, "es", { numeric: true }));
  const actual = abierta ? orden.find((r) => r.ep.id === abierta) ?? null : null;
  const siguiente = actual ? orden[orden.indexOf(actual) + 1] ?? null : null;
  const revisadas = orden.filter((r) => rondaDelTurno(r.eventos, ahora)).length;
  // «Vence hoy en la unidad» (Diego, 24-nov-2026): lo que antes se copiaba del cuaderno sala por sala.
  // El colega de atrás solo corrobora con quien tiene la cama; no hay que dar vuelta etiquetas.
  const vencen = orden.flatMap((r) => (esViaAereaArtificial(r.ep.viaAereaActual) ? filtrosPorCambiar(r.eventos, ahora, contextoFiltros(r.ep, r.controles)) : [])
    .map((f) => ({ r, f })));

  return (
    <div className="cel-cuerpo ronda-cel" aria-label="Ronda de equipos">
      <p className="small muted" style={{ margin: 0 }}>
        {revisadas} de {orden.length} camas revisadas en este turno. Toca una cama: equipos de la sala y fecha de etiqueta de los filtros.
      </p>
      <details className="card vence-hoy" open={vencen.length > 0}>
        <summary><b>Vence hoy en la unidad</b> <span className="small muted">{vencen.length ? `${vencen.length} por cambiar` : "nada por cambiar"}</span></summary>
        {vencen.length > 0 && (
          <ul>
            {vencen.map(({ r, f }) => (
              <li key={`${r.ep.id}-${f.elemento}`}>
                <b>{nombreCama(r.ep.cama)}</b> · {ETIQUETA_ELEMENTO[f.elemento]} {f.estado === "VENCIDO" ? "vencido" : "vence hoy"}
                <span className="small muted">{f.cambiadoEn ? ` · ${f.desdeIngreso ? "desde el ingreso" : "etiqueta"} ${ddmm(f.cambiadoEn)}` : ""}{titularDe(r.ep.rutTitular) ? ` · ${titularDe(r.ep.rutTitular)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <div className="seg-ronda" role="tablist" aria-label="Ver la ronda como">
        <button type="button" role="tab" aria-selected={vista === "lista"} onClick={() => verComo("lista")}>Lista</button>
        <button type="button" role="tab" aria-selected={vista === "sala"} onClick={() => verComo("sala")}>Sala</button>
      </div>
      {vista === "sala" && <SalaOchoBits resumen={orden} ahora={ahora} rutAutor={rutAutor} onRevisar={setAbierta} />}
      {vista === "lista" && <div className="evgrid ev-lista">
        {orden.map((r) => {
          const ronda = rondaDelTurno(r.eventos, ahora);
          const vencidos = esViaAereaArtificial(r.ep.viaAereaActual) ? hallazgosSugeridos(r.eventos, ahora, contextoFiltros(r.ep, r.controles)) : [];
          const enUso = r.ep.equipos.find((e) => e.enUso);
          return (
            <button key={r.ep.id} type="button" className="ev-fila ronda-fila" onClick={() => setAbierta(r.ep.id)}>
              <b>{nombreCama(r.ep.cama)}</b>
              <span className="small muted">{enUso ? etiquetaEquipo(enUso) : r.ep.equipos.length ? `${r.ep.equipos.length} equipo(s), ninguno en uso` : "Sin equipos anotados"}</span>
              <span className={`ronda-est ${ronda ? (ronda.hallazgos.length ? "hall" : "ok") : vencidos.length ? "venc" : ""}`}>
                {ronda ? (ronda.hallazgos.length ? `⚠ ${ronda.hallazgos.length} hallazgo(s) · ${hhmm(ronda.registradoEn)}` : `✓ Revisada ${hhmm(ronda.registradoEn)} · ${iniciales(ronda.rutAutor)}`) : vencidos.length ? `Sin revisar · ${vencidos.length} por cambiar` : "Sin revisar"}
              </span>
            </button>
          );
        })}
      </div>}
      {actual && (
        <RondaCama
          key={actual.ep.id}
          r={actual}
          ahora={ahora}
          rutAutor={rutAutor}
          onCerrar={() => setAbierta(null)}
          onSiguiente={siguiente ? () => setAbierta(siguiente.ep.id) : null}
          nombreSiguiente={siguiente ? nombreCama(siguiente.ep.cama) : ""}
        />
      )}
    </div>
  );
}

function RondaCama({ r, ahora, rutAutor, onCerrar, onSiguiente, nombreSiguiente }: {
  r: ResumenCama; ahora: Date; rutAutor: string; onCerrar: () => void; onSiguiente: (() => void) | null; nombreSiguiente: string;
}) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const { ep, eventos, controles } = r;
  const conCircuito = esViaAereaArtificial(ep.viaAereaActual);
  // Solo los elementos que corresponden a esta cama (HEPA con ventilador, HME sin humidificación activa…).
  const ctxF = contextoFiltros(ep, controles);
  const vig = vigenciaFiltros(eventos, ahora, ctxF);
  const aplican = ELEMENTOS.filter((el) => vig.find((v) => v.elemento === el)?.estado !== "NO_APLICA");
  // La fecha que se VE en la etiqueta; parte con la registrada y se corrige si no coincide.
  const [fechas, setFechas] = useState<Record<string, string>>(() => Object.fromEntries(ELEMENTOS.map((el) => [el, vig.find((v) => v.elemento === el)?.cambiadoEn ?? ""])));
  const [otro, setOtro] = useState("");
  const [guardando, setGuardando] = useState(false);
  useAtras(true, onCerrar);
  // Los hallazgos se calculan con las fechas YA corregidas: si la etiqueta dice otra cosa, manda la etiqueta.
  const corregidos: EventoClinico[] = ELEMENTOS.filter((el) => fechas[el] && fechas[el] !== (vig.find((v) => v.elemento === el)?.cambiadoEn ?? "")).map((el) => {
    const b = baseEvento(ep, rutAutor, new Date(ahora.getTime() - 1000));
    return el === "HME" ? { ...b, tipo: "CAMBIO_HMEF", fechaEtiqueta: fechas[el]! } : { ...b, tipo: "CAMBIO_FILTRO", elemento: el, fechaEtiqueta: fechas[el]! };
  });
  const sugeridos = conCircuito ? hallazgosSugeridos([...eventos, ...corregidos], ahora, ctxF) : [];
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());
  const hallazgos: HallazgoRonda[] = [...sugeridos.filter((h) => !quitados.has(h.texto)), ...(otro.trim() ? [{ texto: otro.trim().slice(0, 140) }] : [])];
  const ctx = { ep, rutAutor, ahora, ultimo: controles[controles.length - 1] ?? null } as unknown as ContextoCama;

  const guardar = async (ir: "cerrar" | "siguiente"): Promise<void> => {
    if (guardando) return;
    setGuardando(true);
    try {
      for (const c of corregidos) await repo.registrarEvento(c);
      await repo.registrarEvento({ ...baseEvento(ep, rutAutor, new Date()), tipo: "RONDA_EQUIPOS", hallazgos });
      avisar(hallazgos.length ? `${nombreCama(ep.cama)}: ${hallazgos.length} hallazgo(s), le llegan al colega a cargo.` : `${nombreCama(ep.cama)} revisada: todo en orden.`);
      if (ir === "siguiente" && onSiguiente) onSiguiente(); else onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="ev-capa">
      <div className="ev-pantalla" role="dialog" aria-modal="true" aria-label={`Ronda · ${nombreCama(ep.cama)}`}>
        <header className="ev-cabeza">
          <button type="button" className="ev-volver" aria-label="Volver a la ronda" onClick={onCerrar}><ChevronLeft size={22} aria-hidden />Ronda</button>
          <b>{nombreCama(ep.cama)}</b>
        </header>
        <div className="pf-cuerpo">
          <section className="ronda-sec">
            <h3>Equipos de la sala</h3>
            <PanelEquipos ctx={ctx} />
          </section>
          {conCircuito && (
            <section className="ronda-sec">
              <h3>Fecha de la etiqueta</h3>
              <p className="small muted" style={{ margin: 0 }}>Escribe la fecha que ves en cada etiqueta. Si no coincide con la anotada, manda la de la etiqueta.</p>
              {aplican.map((el) => {
                const v = vig.find((x) => x.elemento === el);
                if (v?.estado === "POR_ESTADIA") return <p key={el} className="small muted" style={{ margin: 0 }}>{ETIQUETA_ELEMENTO[el]}: uno por estadía (PB / AVEA), no se cambia.</p>;
                return (
                  <label key={el} className="ronda-filtro">
                    <span>{ETIQUETA_ELEMENTO[el]}<small className="muted">{v?.cambiadoEn ? ` anotada ${ddmm(v.cambiadoEn)}` : " sin anotar"}</small></span>
                    <input type="date" value={fechas[el] ?? ""} max={new Date(ahora.getTime()).toISOString().slice(0, 10)} onChange={(e) => setFechas((f) => ({ ...f, [el]: e.target.value }))} aria-label={`Fecha de la etiqueta del ${ETIQUETA_ELEMENTO[el]}`} />
                  </label>
                );
              })}
            </section>
          )}
          <section className="ronda-sec">
            <h3>Para el colega a cargo</h3>
            {sugeridos.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nada vencido.</p>}
            {sugeridos.map((h) => (
              <label key={h.texto} className="ronda-hall">
                <input type="checkbox" checked={!quitados.has(h.texto)} onChange={() => setQuitados((q) => { const x = new Set(q); if (x.has(h.texto)) x.delete(h.texto); else x.add(h.texto); return x; })} />
                {h.texto}
              </label>
            ))}
            <input type="text" className="ronda-otro" placeholder="Otro hallazgo (opcional)" maxLength={140} value={otro} onChange={(e) => setOtro(e.target.value)} aria-label="Otro hallazgo" />
          </section>
        </div>
        <div className="pie-inf" style={{ flexDirection: "column" }}>
          {onSiguiente && <button type="button" className="btn primary" disabled={guardando} onClick={() => void guardar("siguiente")}>Revisada · siguiente: {nombreSiguiente} ›</button>}
          <button type="button" className={onSiguiente ? "btn" : "btn primary"} disabled={guardando} onClick={() => void guardar("cerrar")}>Revisada{onSiguiente ? " y volver" : ""}</button>
        </div>
      </div>
    </div>,
    document.querySelector(".app-cel") ?? document.body
  );
}
