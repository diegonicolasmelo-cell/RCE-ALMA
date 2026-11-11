import { useState } from "react";
import { CAMAS_UNIDAD, nombreCama } from "@core/index";
import type { Episodio, EventoClinico } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { useConsulta } from "../app/hooks";
import { horaDe, nuevoId } from "../app/util";

/**
 * Cambiar al paciente de cama. Solo a una cama libre: la que deja necesita aseo terminal.
 * Todo lo del episodio (dias de VM, PVE, filtros, identidad cifrada) va con el paciente.
 */
export function TrasladoCama({ ep }: { ep: Episodio }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const activas = useConsulta(() => repo.episodiosActivos(), [repo], null);
  const libres = CAMAS_UNIDAD.filter((c) => !(activas ?? []).some((e) => e.cama === c));

  const trasladar = async (): Promise<void> => {
    if (!libres.includes(destino)) return avisar("Elige una cama libre.");
    const ahora = new Date();
    const ev: EventoClinico = {
      id: nuevoId(),
      episodioId: ep.id,
      hora: horaDe(ahora),
      registradoEn: ahora.toISOString(),
      rutAutor: "",
      comentario: "",
      tipo: "TRASLADO_CAMA",
      desde: ep.cama,
      hasta: destino
    };
    await repo.registrarEvento(ev);
    setAbierto(false);
    setDestino("");
    avisar(`Paciente trasladado de ${nombreCama(ep.cama)} a ${nombreCama(destino)}. ${nombreCama(ep.cama)} queda libre: recuerda el aseo terminal antes de ocuparla.`);
  };

  return (
    <section>
      <h3>Cama</h3>
      {!abierto ? (
        <button type="button" className="btn sm" disabled={libres.length === 0} onClick={() => setAbierto(true)}>
          {libres.length === 0 ? "Cambiar de cama · no hay camas libres" : "Cambiar de cama"}
        </button>
      ) : (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="f" style={{ minWidth: 180 }}>
            <label htmlFor="tc-cama">Cama nueva · solo las libres</label>
            <select id="tc-cama" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elige…</option>
              {libres.map((c) => <option key={c} value={c}>{nombreCama(c)}</option>)}
            </select>
          </div>
          <button type="button" className="btn sm primary" onClick={() => void trasladar()}>Trasladar</button>
          <button type="button" className="btn sm" onClick={() => { setAbierto(false); setDestino(""); }}>Cancelar</button>
        </div>
      )}
      <p className="small muted mt">Va con el paciente todo lo registrado: días de VM, PVE, filtros y su identidad. La cama que deja queda libre y necesita aseo terminal antes de recibir a otro paciente.</p>
    </section>
  );
}
