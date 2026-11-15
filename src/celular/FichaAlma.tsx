import { Copy, Table2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ETIQUETA_MODALIDAD, calcularDerivados, calcularGlasgow, calcularPbw, camposAlma, claseModoAlma, componerNotaAlma, describirEvento, nombreCama, sedoanalgesiaActiva } from "@core/index";
import type { Control, Episodio, EventoClinico } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { horaDe } from "../app/util";
import { SabanaVista } from "../estacion/SabanaVista";
import { copiarTexto, iniciales } from "../estacion/util";

const n = (v: number | null | undefined, u = ""): string => (v === null || v === undefined ? "—" : `${v}${u}`);

/** Los seis datos de arriba, en el orden en que se copian a ALMA. */
function signosAlma(c: Control, pbw: number): readonly { etiqueta: string; valor: string; extra?: string }[] {
  const d = calcularDerivados(c, pbw);
  const gcs = c.glasgow ? calcularGlasgow(c.glasgow, c.viaAerea).display : "—";
  const sas = sedoanalgesiaActiva(c.infusiones) ? n(c.sas) : c.vigilia ? c.vigilia.toLowerCase().replace("_", " ") : "—";
  return [
    { etiqueta: "FC", valor: n(c.fc) },
    { etiqueta: "PA", valor: c.pas !== null && c.pad !== null ? `${c.pas}/${c.pad}` : "—", ...(d.pam !== null ? { extra: `PAM ${d.pam}` } : {}) },
    { etiqueta: "Glasgow", valor: gcs },
    { etiqueta: sedoanalgesiaActiva(c.infusiones) ? "SAS" : "Vigilia", valor: sas },
    { etiqueta: "SpO₂", valor: n(c.spo2, "%") },
    { etiqueta: "FiO₂", valor: n(c.ventilacion.fio2, "%") }
  ];
}

/**
 * Un control en una sola pantalla, para pasarlo a ALMA desde el celular: arriba los signos que
 * se copian (FC, PA, Glasgow, SAS, SpO2 y FiO2) y abajo los campos de ventilacion mecanica en el
 * orden del formulario de ALMA, segun el modo. Tocar un campo lo tacha (solo en esta pantalla).
 * La sabana completa queda a un toque.
 */
/** Lo que la ficha necesita de cada paciente. */
export interface PacienteFicha {
  readonly ep: Episodio;
  readonly controles: readonly Control[];
  readonly eventos: readonly EventoClinico[];
}

/**
 * El ultimo control de cada cama en grande, de a una cama: ‹ › pasan a la cama anterior o
 * siguiente. Se monta FUERA de la lista con scroll (en .app-cel): dentro de ella el iPhone
 * instalado la dejaba pegada (ver docs/PLAN-MAESTRO.md, seccion 17).
 */
export function FichaAlma({ pacientes, inicial, ahora, onCerrar }: { pacientes: readonly PacienteFicha[]; inicial: { readonly episodioId: string; readonly controlId: string }; ahora: Date; onCerrar: () => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  // Solo las camas con algun control, en el orden de las camas.
  const camas = pacientes.filter((p) => p.controles.length > 0);
  const [idx, setIdx] = useState(() => Math.max(0, camas.findIndex((p) => p.ep.id === inicial.episodioId)));
  const [hechos, setHechos] = useState<ReadonlySet<number>>(new Set());
  const [vista, setVista] = useState<"control" | "sabana" | "evaluaciones">("control");
  const pac = camas[idx];
  if (!pac) return null;
  const { ep, controles, eventos } = pac;
  const ordenados = [...controles].sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  // En la cama que se toco, el control tocado; en las demas, el ultimo.
  const c = (ep.id === inicial.episodioId ? ordenados.find((x) => x.id === inicial.controlId) : undefined) ?? ordenados[ordenados.length - 1]!;
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const clase = claseModoAlma(c.ventilacion.modalidad);
  // Fuera de VM (CNAF, VNI, O2) el formulario de ALMA no aplica: se muestra solo lo anotado.
  const campos = camposAlma(c, pbw, ep.equipos).filter((f) => clase !== null || (f.valor !== null && f.valor !== "—"));
  const evento = c.eventoId ? eventos.find((e) => e.id === c.eventoId) : undefined;
  const ir = (d: number): void => {
    setIdx((i) => Math.min(camas.length - 1, Math.max(0, i + d)));
    setHechos(new Set());
  };
  const tachar = (i: number): void => setHechos((h) => { const x = new Set(h); if (x.has(i)) x.delete(i); else x.add(i); return x; });
  const copiar = async (): Promise<void> => {
    // La "ultima atencion" es la de este control: lo posterior no entra.
    const hasta = ordenados.filter((x) => x.registradoEn <= c.registradoEn);
    const nota = componerNotaAlma({ episodio: ep, controles: hasta, eventos, apk: [], modo: "ULTIMA_ATENCION", ahora, diagnostico: null });
    const ok = await copiarTexto(nota);
    if (ok) await repo.marcarTranscrito(ep.id, horaDe(new Date()));
    avisar(ok ? "Evolución copiada. Pégala en ALMA." : "El teléfono no dejó copiar. Inténtalo de nuevo.");
  };
  const anterior = camas[idx - 1];
  const siguiente = camas[idx + 1];
  const capa = (nodo: JSX.Element): JSX.Element => createPortal(nodo, document.querySelector(".app-cel") ?? document.body);

  const pestanas = (
    <div className="fa-pestanas" role="tablist" aria-label="Qué ver">
      <button type="button" role="tab" aria-selected={vista === "control"} onClick={() => setVista("control")}>Último control</button>
      <button type="button" role="tab" aria-selected={vista === "sabana"} onClick={() => setVista("sabana")}>Sábana</button>
      <button type="button" role="tab" aria-selected={vista === "evaluaciones"} onClick={() => setVista("evaluaciones")}>Evaluaciones</button>
    </div>
  );

  if (vista !== "control") {
    const titulo = vista === "sabana" ? "Sábana" : "Evaluaciones";
    return capa(
      <div className="sabana-cel fa-capa" role="dialog" aria-label={`${titulo} · ${nombreCama(ep.cama)}`}>
        <div className="sabana-cel-cab">
          <button type="button" className="fa-flecha fa-cerrar" aria-label="Volver" onClick={onCerrar}><X size={18} aria-hidden /></button>
          <h2>{titulo} · {nombreCama(ep.cama)}</h2>
        </div>
        {pestanas}
        <div className="sabana-cel-cuerpo">
          <SabanaVista ep={ep} controles={controles} eventos={eventos} ahora={ahora} resaltar={c.id} fija={vista} />
        </div>
      </div>
    );
  }

  const densidad = campos.length > 15 ? "compacta" : campos.length > 10 ? "media" : "grande";
  return capa(
    <div className={`sabana-cel fa-capa ficha-alma ${densidad}`} role="dialog" aria-label={`Control · ${nombreCama(ep.cama)} · ${c.hora}`}>
      <div className="fa-cab">
        <button type="button" className="fa-flecha fa-cerrar" aria-label="Volver" onClick={onCerrar}><X size={18} aria-hidden /></button>
        <button type="button" className="fa-flecha" aria-label={anterior ? `Cama anterior · ${nombreCama(anterior.ep.cama)}` : "Cama anterior"} disabled={!anterior} onClick={() => ir(-1)}>‹</button>
        <div className="fa-tit">
          <b>{nombreCama(ep.cama)} · {c.hora}</b>
          <span>{ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? ""} · {iniciales(c.rutAutor)} · cama {idx + 1} de {camas.length}</span>
        </div>
        <button type="button" className="fa-flecha" aria-label={siguiente ? `Cama siguiente · ${nombreCama(siguiente.ep.cama)}` : "Cama siguiente"} disabled={!siguiente} onClick={() => ir(1)}>›</button>
      </div>
      {pestanas}
      {evento && <div className="fa-evento">⚑ {describirEvento(evento, eventos)} · {evento.hora}</div>}
      <div className="fa-signos" aria-label="Signos vitales">
        {signosAlma(c, pbw).map((s) => (
          <div key={s.etiqueta} className="fa-dato">
            <b>{s.valor}</b>
            <span>{s.etiqueta}{s.extra ? ` · ${s.extra}` : ""}</span>
          </div>
        ))}
      </div>
      <div className="fa-t">{clase ? `Ventilación mecánica · formulario de ALMA` : `${ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? "Soporte"} · no va al formulario de VM`}</div>
      <ul className="fa-campos" aria-label="Campos para ALMA">
        {campos.map((f, i) => (
          <li key={f.etiqueta} className={`${hechos.has(i) ? "hecho" : ""}${f.valor === null ? " blanco" : ""}${f.etiqueta === "Comentarios" ? " com" : ""}`}>
            <button type="button" aria-pressed={hechos.has(i)} onClick={() => tachar(i)}>
              <span>{f.etiqueta}</span>
              <b>{f.valor ?? "en blanco"}</b>
            </button>
          </li>
        ))}
      </ul>
      <div className="fa-pie">
        <button type="button" className="btn sm" onClick={() => setVista("sabana")}><Table2 size={14} aria-hidden /> Ver sábana</button>
        <button type="button" className="btn sm primary" disabled={!siguiente} onClick={() => ir(1)}>{siguiente ? `Siguiente: ${nombreCama(siguiente.ep.cama)} ›` : "Última cama"}</button>
      </div>
      <button type="button" className="linkbtn fa-copiar" onClick={() => void copiar()}><Copy size={13} aria-hidden /> Copiar evolución para ALMA</button>
    </div>
  );
}
