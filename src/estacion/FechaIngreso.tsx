import { useState } from "react";
import type { Episodio, EventoClinico } from "@core/index";
import { horasDeVm, textoVm } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";

/** "2026-11-10T05:30:00.000Z" -> "2026-11-10T02:30" en la hora local (para <input type="datetime-local">). */
export function aLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MAX_DIAS_ATRAS = 120;

/** Valida una hora de ingreso corregida: no en el futuro ni de hace mas de 120 dias. */
export function validarIngreso(local: string, ahora: Date): { iso: string } | { error: string } {
  const d = new Date(local);
  if (!local || Number.isNaN(d.getTime())) return { error: "Escribe la fecha y la hora." };
  if (d.getTime() > ahora.getTime() + 5 * 60_000) return { error: "El ingreso no puede quedar en el futuro." };
  if (ahora.getTime() - d.getTime() > MAX_DIAS_ATRAS * 86_400_000) return { error: `No puede ser de hace más de ${MAX_DIAS_ATRAS} días.` };
  return { iso: d.toISOString() };
}

const corta = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Ingreso a la UCI: se grabo solo al registrar al paciente (captura en tiempo real) y aqui se
 * corrige si hace falta. Si llego ventilado, corregirlo corrige tambien la hora cero de la VM.
 */
export function FechaIngreso({ ep, eventos, ahora }: { ep: Episodio; eventos: readonly EventoClinico[]; ahora: Date }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(ep.ingresadoEn ? aLocal(ep.ingresadoEn) : "");
  const [error, setError] = useState<string | null>(null);
  const vm = textoVm(horasDeVm(ep, eventos, null, ahora));

  const guardar = async (): Promise<void> => {
    const r = validarIngreso(valor, new Date());
    if ("error" in r) return setError(r.error);
    await repo.guardarEpisodio({ ...ep, ingresadoEn: r.iso });
    setEditando(false);
    setError(null);
    avisar("Hora de ingreso corregida.");
  };

  if (!editando) {
    return (
      <div className="small ink2 row" style={{ gap: 6 }}>
        <span>Ingreso a la UCI: {ep.ingresadoEn ? <b>{corta(ep.ingresadoEn)}</b> : "sin registrar"}{vm ? ` · ${vm}` : ""}</span>
        <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => { setValor(ep.ingresadoEn ? aLocal(ep.ingresadoEn) : aLocal(new Date().toISOString())); setEditando(true); }}>
          Corregir
        </button>
      </div>
    );
  }
  return (
    <form className="row" aria-label="Corregir ingreso" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <div className="f">
        <label htmlFor="fi-ingreso">Ingreso a la UCI</label>
        <input id="fi-ingreso" type="datetime-local" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <button type="submit" className="btn sm primary">Guardar</button>
      <button type="button" className="btn sm" onClick={() => { setEditando(false); setError(null); }}>Cancelar</button>
      {ep.viaAereaActual !== "NATURAL" && !eventos.some((x) => x.tipo === "REINTUBACION") && <span className="small muted">Llegó ventilado: los días de VM se cuentan desde aquí.</span>}
      {error && <span className="small" role="alert" style={{ color: "var(--crit-ink)" }}>{error}</span>}
    </form>
  );
}
