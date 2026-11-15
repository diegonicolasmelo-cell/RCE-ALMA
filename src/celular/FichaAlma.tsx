import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ETIQUETA_MODALIDAD, calcularDerivados, calcularGlasgow, calcularPbw, claseModoAlma, describirEvento, nombreCama, sedoanalgesiaActiva } from "@core/index";
import type { Control, Episodio, EventoClinico } from "@core/index";
import { SabanaVista } from "../estacion/SabanaVista";
import { ventilacionDeLaHoja } from "../estacion/sabana";
import { iniciales } from "../estacion/util";

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
 * se copian (FC, PA, Glasgow, SAS, SpO2 y FiO2) y abajo la ventilacion en el orden de la hoja,
 * solo con lo anotado, para mirarlo y tipearlo a mano en ALMA. Tocar un campo lo tacha (solo en
 * esta pantalla).
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
  // La ventilacion en el orden de la hoja (las mismas filas de la sabana), solo lo que tiene dato.
  const campos = ventilacionDeLaHoja(c, pbw, ep.monitoreo);
  const evento = c.eventoId ? eventos.find((e) => e.id === c.eventoId) : undefined;
  const ir = (d: number): void => {
    setIdx((i) => Math.min(camas.length - 1, Math.max(0, i + d)));
    setHechos(new Set());
  };
  const tachar = (i: number): void => setHechos((h) => { const x = new Set(h); if (x.has(i)) x.delete(i); else x.add(i); return x; });
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
        <div className="fa-tit">
          <b>{nombreCama(ep.cama)} · {c.hora}</b>
          <span>{ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? ""} · {iniciales(c.rutAutor)} · cama {idx + 1} de {camas.length}</span>
        </div>
        <span className="fa-flecha fa-hueco" aria-hidden />
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
      <div className="fa-t">{clase ? "Ventilación mecánica · orden de la hoja" : `${ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? "Soporte"} · orden de la hoja`}</div>
      <ul className="fa-campos" aria-label="Ventilación">
        {campos.map((f, i) => (
          <li key={f.etiqueta} className={hechos.has(i) ? "hecho" : ""}>
            <button type="button" aria-pressed={hechos.has(i)} onClick={() => tachar(i)}>
              <span>{f.etiqueta}</span>
              <b>{f.valor}</b>
            </button>
          </li>
        ))}
      </ul>
      <div className="fa-pie">
        {/* Un solo lugar para moverse entre camas (abajo, a la mano); la sabana esta en las pestañas. */}
        <button type="button" className="btn sm" aria-label={anterior ? `Cama anterior · ${nombreCama(anterior.ep.cama)}` : "Cama anterior"} disabled={!anterior} onClick={() => ir(-1)}>{anterior ? `‹ ${nombreCama(anterior.ep.cama)}` : "Primera cama"}</button>
        <button type="button" className="btn sm primary" aria-label={siguiente ? `Cama siguiente · ${nombreCama(siguiente.ep.cama)}` : "Cama siguiente"} disabled={!siguiente} onClick={() => ir(1)}>{siguiente ? `Siguiente: ${nombreCama(siguiente.ep.cama)} ›` : "Última cama"}</button>
      </div>
    </div>
  );
}
