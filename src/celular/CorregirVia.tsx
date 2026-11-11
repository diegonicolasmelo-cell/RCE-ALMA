import { useState } from "react";
import type { CorreccionVia, Episodio } from "@core/index";
import { buscarProfesional } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { casillaNumerica } from "./TecladoPropio";

const fecha = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Aplica la correccion al episodio y deja la constancia (quien, cuando, valor previo). */
export function corregirVia(ep: Episodio, calibre: string, cm: string, rutAutor: string, ahora: Date): Episodio {
  const nuevas: CorreccionVia[] = [];
  const en = ahora.toISOString();
  const cal = calibre.trim();
  const fij = cm.trim();
  if (cal !== "" && cal !== (ep.calibreVia ?? "")) nuevas.push({ campo: "calibre", antes: ep.calibreVia, despues: cal, rutAutor, registradoEn: en });
  if (ep.viaAereaActual === "TET" && fij !== "" && fij !== (ep.fijacionCm ?? "")) nuevas.push({ campo: "fijacion", antes: ep.fijacionCm, despues: fij, rutAutor, registradoEn: en });
  if (nuevas.length === 0) return ep;
  return {
    ...ep,
    calibreVia: cal || ep.calibreVia,
    fijacionCm: ep.viaAereaActual === "TET" ? fij || ep.fijacionCm : ep.fijacionCm,
    correcciones: [...(ep.correcciones ?? []), ...nuevas]
  };
}

/** «Corregido por Diego Melo el 11-11 09:40 (calibre antes 7,5)»: la ultima correccion. */
export function textoUltimaCorreccion(ep: Episodio): string | null {
  const c = ep.correcciones?.at(-1);
  if (!c) return null;
  const quien = buscarProfesional(c.rutAutor)?.nombre ?? c.rutAutor;
  return `Corregido por ${quien} el ${fecha(c.registradoEn)} (${c.campo === "calibre" ? "calibre" : "cm"} antes ${c.antes ?? "sin dato"})`;
}

/**
 * Corregir un dato mal anotado de la via aerea (calibre o cm). NO es un evento: no cuenta en
 * la estadistica ni cambia los dias de VM. Lo que se hizo de verdad (cambiar el tubo, moverlo)
 * va como evento.
 */
export function CorregirVia({ ep, rutAutor }: { ep: Episodio; rutAutor: string }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState(false);
  const [calibre, setCalibre] = useState(ep.calibreVia ?? "");
  const [cm, setCm] = useState(ep.fijacionCm ?? "");
  const [error, setError] = useState<string | null>(null);
  if (ep.viaAereaActual === "NATURAL") return null;
  const tet = ep.viaAereaActual === "TET";
  const nota = textoUltimaCorreccion(ep);

  const guardar = async (): Promise<void> => {
    const n = Number(calibre.replace(",", "."));
    if (!Number.isFinite(n) || n < 2 || n > 12) return setError("Revisa el calibre (entre 2 y 12).");
    if (tet) {
      const c = Number(cm.replace(",", "."));
      if (!Number.isFinite(c) || c < 10 || c > 35) return setError("Revisa los cm en la arcada (entre 10 y 35).");
    }
    const nuevo = corregirVia(ep, calibre, cm, rutAutor, new Date());
    if (nuevo === ep) {
      setAbierto(false);
      return;
    }
    await repo.guardarEpisodio(nuevo);
    setAbierto(false);
    setError(null);
    avisar("Dato corregido. No se registró ningún evento.");
  };

  return (
    <div className="card stack corregir-via" style={{ padding: 12, gap: 8 }} aria-label="Vía aérea actual">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          <b>{ep.viaAereaActual} {ep.calibreVia ?? ""}</b>
          {tet && ep.fijacionCm ? ` · ${ep.fijacionCm} cm` : ""}
        </span>
        {!abierto && (
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => { setCalibre(ep.calibreVia ?? ""); setCm(ep.fijacionCm ?? ""); setAbierto(true); }}>
            Corregir dato
          </button>
        )}
      </div>
      {nota && !abierto && <span className="small muted">{nota}</span>}
      {abierto && (
        <form className="stack" style={{ gap: 8 }} aria-label="Corregir vía aérea" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
          <p className="small muted" style={{ margin: 0 }}>Solo para un dato mal anotado. Si se cambió o se movió el tubo de verdad, registra el evento.</p>
          <div className="fgrid2">
            <div className="f"><label htmlFor="cv-calibre">Calibre</label><input id="cv-calibre" {...casillaNumerica()} enterKeyHint="next" autoComplete="off" value={calibre} onChange={(e) => setCalibre(e.target.value)} /></div>
            {tet && <div className="f"><label htmlFor="cv-cm">cm en la arcada</label><input id="cv-cm" {...casillaNumerica()} enterKeyHint="next" autoComplete="off" value={cm} onChange={(e) => setCm(e.target.value)} /></div>}
          </div>
          {error && <div className="notice crit small" role="alert">{error}</div>}
          <div className="row">
            <button type="submit" className="btn primary">Guardar corrección</button>
            <button type="button" className="btn" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
