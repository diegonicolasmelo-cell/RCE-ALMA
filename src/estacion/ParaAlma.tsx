import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { calcularPbw, camposAlma, componerNotaAlma } from "@core/index";
import type { ModoNota } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { horaDe } from "../app/util";
import { Pildora, Seg } from "../celular/componentes";
import type { DatosUnidad } from "./datos";
import { copiarTexto } from "./util";

/**
 * Dos formas de pasar la informacion a ALMA: paso a paso (un panel angosto al
 * lado de ALMA, un registro por control, en el orden de su formulario) o copiando
 * la evolucion completa. Copiarla deja la cama "Transcrita": dice que se copio,
 * no que ALMA la recibio.
 */
export function ParaAlma({ datos, ahora, seleccionada, onSeleccionar }: { datos: DatosUnidad; ahora: Date; seleccionada: string | null; onSeleccionar: (id: string) => void }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const ep = datos.episodios.find((e) => e.id === seleccionada) ?? datos.episodios[0] ?? null;
  const controles = ep ? (datos.controles.get(ep.id) ?? []) : [];
  const eventos = ep ? (datos.eventos.get(ep.id) ?? []) : [];
  const apks = ep ? (datos.apks.get(ep.id) ?? []) : [];

  const [controlId, setControlId] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  const [modo, setModo] = useState<ModoNota>("TURNO_COMPLETO");

  const control = controles.find((c) => c.id === controlId) ?? controles.at(-1) ?? null;
  useEffect(() => setPaso(0), [ep?.id, control?.id]);

  if (!ep) return <div className="card"><p className="muted">No hay pacientes activos.</p></div>;

  const pbw = calcularPbw(ep.tallaCm, ep.sexo);
  const campos = control ? camposAlma(control, pbw, ep.equipos) : [];
  const fin = control !== null && paso >= campos.length;
  const actual = campos[paso];
  const nota = componerNotaAlma({ episodio: ep, controles, eventos, apk: apks, modo, ahora });

  const copiar = async (): Promise<void> => {
    const ok = await copiarTexto(nota);
    if (ok) await repo.marcarTranscrito(ep.id, horaDe(new Date()));
    avisar(ok ? "Evolución copiada. Pégala en ALMA." : "El navegador bloqueó el portapapeles: selecciona el texto y copia con Ctrl+C.");
  };

  return (
    <>
      <p className="intro">Dos formas de pasar la información a ALMA: <b>paso a paso</b> (un panel angosto al lado de ALMA, un registro por control) o <b>copiar la evolución</b> completa.</p>
      <div className="pc-bar">
        <div className="row">
          {datos.episodios.map((e) => (
            <button key={e.id} type="button" className="chip" aria-pressed={e.id === ep.id} onClick={() => onSeleccionar(e.id)}>{e.cama}</button>
          ))}
        </div>
      </div>

      <div className="alma">
        <div className="card stack">
          <h2>Para ALMA · {ep.cama}</h2>
          {controles.length === 0 ? (
            <p className="muted">Esta cama no tiene controles.</p>
          ) : (
            <>
              <div className="row">
                {controles.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={c.id === control?.id} onClick={() => setControlId(c.id)}>{c.hora}</button>
                ))}
              </div>
              {fin ? (
                <>
                  <div className="notice good"><b>Control de las {control?.hora} revisado.</b><br />Falta firmar en ALMA con tu usuario.</div>
                  <button type="button" className="btn" onClick={() => setPaso(0)}>Empezar de nuevo</button>
                </>
              ) : (
                actual && (
                  <>
                    <div>
                      <div className="small muted">{paso + 1} de {campos.length}</div>
                      <div className="bar"><i style={{ width: `${(paso / campos.length) * 100}%` }} /></div>
                      <div className="small ink2 mt">Campo de ALMA</div>
                      <div style={{ fontWeight: 700 }}>{actual.etiqueta}</div>
                      <div className={actual.valor === null ? "step-val muted" : "step-val"}>{actual.valor ?? "en blanco"}</div>
                    </div>
                    <div className="row">
                      <button type="button" className="btn" disabled={paso === 0} onClick={() => setPaso((p) => Math.max(0, p - 1))}>Atrás</button>
                      <button type="button" className="btn primary" onClick={() => setPaso((p) => p + 1)}>Listo, siguiente</button>
                    </div>
                  </>
                )
              )}
              <ul className="flist">
                {campos.map((c, i) => (
                  <li key={c.etiqueta} className={i === paso && !fin ? "on" : i < paso ? "done" : ""}>
                    <span>{i < paso && <Check size={12} aria-hidden />} {c.etiqueta}</span>
                    <span className="mono">{c.valor ?? "en blanco"}</span>
                  </li>
                ))}
              </ul>
              <p className="small muted">Orden de campos y regla por modalidad (ACVC, PCV, CPAP+PS). Es un esquema, no la pantalla real de ALMA.</p>
            </>
          )}
        </div>

        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Evolución para copiar</h2>
            <Seg etiqueta="Alcance de la nota" valor={modo} opciones={[{ valor: "TURNO_COMPLETO", texto: "Turno completo" }, { valor: "ULTIMA_ATENCION", texto: "Última atención" }]} onCambio={setModo} />
          </div>
          <pre className="nota" id="nota-alma">{nota}</pre>
          <div className="row">
            <button type="button" className="btn primary" disabled={controles.length === 0} onClick={() => void copiar()}>
              <Copy size={14} aria-hidden /> Copiar evolución para ALMA
            </button>
            <Pildora tipo={ep.transcritoAlma ? "good" : ""}>{ep.transcritoAlma ? `Transcrito ${ep.horaTranscripcion}` : "Pendiente"}</Pildora>
            {ep.transcritoAlma && (
              <button type="button" className="btn sm" onClick={() => void repo.marcarTranscrito(ep.id, "", false)}>Volver a pendiente</button>
            )}
          </div>
          <p className="small muted">Copiarla deja la cama en “Transcrito” con la hora. Dice que se copió, no que ALMA la recibió.</p>
        </div>
      </div>
    </>
  );
}
