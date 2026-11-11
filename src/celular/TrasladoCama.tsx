import { useState } from "react";
import { X } from "lucide-react";
import { CAMAS_UNIDAD, nombreCama } from "@core/index";
import type { Episodio, EventoClinico } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { horaDe, nuevoId } from "../app/util";

/**
 * Cambiar al paciente de cama, desde la tarjeta: se eligen entre las camas LIBRES (la que deja
 * necesita aseo terminal) y se confirma. Todo lo del episodio va con el paciente.
 */
export function TrasladoCama({ ep, ocupadas, onCerrar }: { ep: Episodio; ocupadas: ReadonlySet<string>; onCerrar: () => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const [destino, setDestino] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const libres = CAMAS_UNIDAD.filter((c) => !ocupadas.has(c));

  const confirmar = async (): Promise<void> => {
    if (!destino || guardando) return;
    setGuardando(true);
    const ahora = new Date();
    const ev: EventoClinico = {
      id: nuevoId(),
      episodioId: ep.id,
      hora: horaDe(ahora),
      registradoEn: ahora.toISOString(),
      rutAutor: useApp.getState().sesion?.rut ?? "",
      comentario: "",
      tipo: "TRASLADO_CAMA",
      desde: ep.cama,
      hasta: destino
    };
    await repo.registrarEvento(ev);
    // La cama nueva pasa a ser mía si la anterior lo era: el paciente sigue en mi lista.
    const mias = useApp.getState().misCamas;
    if (mias?.includes(ep.cama)) useApp.getState().setMisCamas([...mias.filter((c) => c !== ep.cama), destino].sort());
    onCerrar();
    avisar(`${nombreCama(ep.cama)} → ${nombreCama(destino)}. ${nombreCama(ep.cama)} queda libre: recuerda el aseo terminal antes de ocuparla.`);
  };

  return (
    <div className="fondo-flotante" onClick={onCerrar}>
      <div className="panel-flotante" role="dialog" aria-modal="true" aria-label={`Cambiar de cama · ${nombreCama(ep.cama)}`} onClick={(e) => e.stopPropagation()}>
        <header className="pf-cabeza">
          <b>Cambiar de cama · {nombreCama(ep.cama)}</b>
          <button type="button" className="pf-cerrar" aria-label="Cerrar sin cambiar" onClick={onCerrar}><X size={20} aria-hidden /></button>
        </header>
        <div className="pf-cuerpo">
          {libres.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No hay camas libres. La cama que se desocupa necesita aseo terminal antes de recibir a otro paciente.</p>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}>¿A qué cama? Solo se muestran las libres.</p>
              <div className="camas-destino" role="group" aria-label="Camas libres">
                {libres.map((c) => (
                  <button key={c} type="button" data-cama={c} aria-pressed={destino === c} onClick={() => setDestino(c)}>
                    {c.slice(-2)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="pie-inf">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn primary" disabled={!destino || guardando} onClick={() => void confirmar()}>
            {destino ? `Confirmar: ${nombreCama(ep.cama)} → ${nombreCama(destino)}` : "Elige la cama"}
          </button>
        </div>
      </div>
    </div>
  );
}
