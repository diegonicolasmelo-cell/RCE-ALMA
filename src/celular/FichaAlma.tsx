import { Copy, Table2, X } from "lucide-react";
import { useState } from "react";
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
export function FichaAlma({ ep, controles, eventos, inicial, desde, ahora, onCerrar }: { ep: Episodio; controles: readonly Control[]; /** Se recorren los controles desde este momento (ms). */ desde: number; eventos: readonly EventoClinico[]; inicial: string; ahora: Date; onCerrar: () => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const lista = controles.filter((x) => Date.parse(x.registradoEn) >= desde || x.id === inicial).sort((a, b) => a.registradoEn.localeCompare(b.registradoEn));
  const [idx, setIdx] = useState(() => Math.max(0, lista.findIndex((c) => c.id === inicial)));
  const [hechos, setHechos] = useState<ReadonlySet<number>>(new Set());
  const [vista, setVista] = useState<"control" | "sabana" | "evaluaciones">("control");
  const c = lista[idx];
  if (!c) return null;
  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const clase = claseModoAlma(c.ventilacion.modalidad);
  // Fuera de VM (CNAF, VNI, O2) el formulario de ALMA no aplica: se muestra solo lo anotado.
  const campos = camposAlma(c, pbw, ep.equipos).filter((f) => clase !== null || (f.valor !== null && f.valor !== "—"));
  const evento = c.eventoId ? eventos.find((e) => e.id === c.eventoId) : undefined;
  const ir = (d: number): void => {
    setIdx((i) => Math.min(lista.length - 1, Math.max(0, i + d)));
    setHechos(new Set());
  };
  const tachar = (i: number): void => setHechos((h) => { const x = new Set(h); if (x.has(i)) x.delete(i); else x.add(i); return x; });
  const copiar = async (): Promise<void> => {
    // La "ultima atencion" es la de este control: lo posterior no entra.
    const nota = componerNotaAlma({ episodio: ep, controles: lista.slice(0, idx + 1), eventos, apk: [], modo: "ULTIMA_ATENCION", ahora, diagnostico: null });
    const ok = await copiarTexto(nota);
    if (ok) await repo.marcarTranscrito(ep.id, horaDe(new Date()));
    avisar(ok ? "Evolución copiada. Pégala en ALMA." : "El teléfono no dejó copiar. Inténtalo de nuevo.");
  };

  const pestanas = (
    <div className="fa-pestanas" role="tablist" aria-label="Qué ver">
      <button type="button" role="tab" aria-selected={vista === "control"} onClick={() => setVista("control")}>Último control</button>
      <button type="button" role="tab" aria-selected={vista === "sabana"} onClick={() => setVista("sabana")}>Sábana</button>
      <button type="button" role="tab" aria-selected={vista === "evaluaciones"} onClick={() => setVista("evaluaciones")}>Evaluaciones</button>
    </div>
  );

  if (vista !== "control") {
    const titulo = vista === "sabana" ? "Sábana" : "Evaluaciones";
    return (
      <div className="sabana-cel" role="dialog" aria-label={`${titulo} · ${nombreCama(ep.cama)}`}>
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
  return (
    <div className={`sabana-cel ficha-alma ${densidad}`} role="dialog" aria-label={`Control · ${nombreCama(ep.cama)} · ${c.hora}`}>
      <div className="fa-cab">
        <button type="button" className="fa-flecha fa-cerrar" aria-label="Volver" onClick={onCerrar}><X size={18} aria-hidden /></button>
        <button type="button" className="fa-flecha" aria-label="Control anterior" disabled={idx === 0} onClick={() => ir(-1)}>‹</button>
        <div className="fa-tit">
          <b>{nombreCama(ep.cama)} · {c.hora}</b>
          <span>{ETIQUETA_MODALIDAD[c.ventilacion.modalidad] ?? ""} · {iniciales(c.rutAutor)} · {idx + 1} de {lista.length}</span>
        </div>
        <button type="button" className="fa-flecha" aria-label="Control siguiente" disabled={idx === lista.length - 1} onClick={() => ir(1)}>›</button>
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
      <ul className="fa-campos" aria-label="Campos para ALMA" style={{ gridTemplateRows: `repeat(${Math.max(1, campos.length)}, minmax(0, 1fr))` }}>
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
        <button type="button" className="btn sm" onClick={() => setVista("sabana")}><Table2 size={14} aria-hidden /> Sábana completa</button>
        <button type="button" className="btn sm primary" onClick={() => void copiar()}><Copy size={14} aria-hidden /> Copiar evolución</button>
      </div>
    </div>
  );
}
