import { useState } from "react";
import {
  agregarEquipo,
  equiposParaVia,
  esSoporteRespiratorio,
  etiquetaEquipo,
  medicionDe,
  modelosOfrecidos,
  ponerEnUso,
  puedeEstarEnUso,
  quitarEquipo
} from "@core/index";
import type { EquipoEnSala, ViaAerea } from "@core/index";
import { casillaNumerica } from "./TecladoPropio";

/**
 * Equipos de la sala, segun la via aerea: el ventilador siempre (vive en la cama), CNAF y V60
 * con via natural o TQT, base calefactora y Aerogen con cualquiera. Se usa en el ingreso
 * (celular y PC) y en el control.
 */
export function EditorEquipos({ lista, via, onCambio, idBase = "eq" }: { lista: readonly EquipoEnSala[]; via: ViaAerea; onCambio: (l: readonly EquipoEnSala[]) => void; idBase?: string }) {
  const ofrecidos = modelosOfrecidos(via);
  const [modelo, setModelo] = useState<string>(ofrecidos[0]?.modelo ?? "");
  const [numero, setNumero] = useState("");
  const def = ofrecidos.find((d) => d.modelo === modelo) ?? ofrecidos[0];

  const agregar = (): void => {
    if (!def) return;
    onCambio(equiposParaVia(agregarEquipo(lista, def.modelo, def.numerado ? medicionDe(numero) : null), via));
    setNumero("");
  };
  const alternarUso = (e: EquipoEnSala): void =>
    onCambio(e.enUso ? lista.map((x) => (x === e ? { ...x, enUso: false } : x)) : ponerEnUso(lista, e));

  return (
    <div className="stack editor-equipos" style={{ gap: 8 }}>
      {lista.length === 0 && <div className="small muted">Sin equipos registrados.</div>}
      {lista.map((e) => (
        <div key={etiquetaEquipo(e)} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <b>{etiquetaEquipo(e)}</b>
          <span className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
            {esSoporteRespiratorio(e.tipo) && puedeEstarEnUso(e.tipo, via) && (
              <button type="button" className={e.enUso ? "btn sm primary" : "btn sm"} aria-pressed={e.enUso} onClick={() => alternarUso(e)}>
                {e.enUso ? "En uso" : "Sin uso"}
              </button>
            )}
            {esSoporteRespiratorio(e.tipo) && !puedeEstarEnUso(e.tipo, via) && <span className="small muted">en la sala, sin uso</span>}
            <button type="button" className="btn sm" aria-label={`Quitar ${etiquetaEquipo(e)}`} onClick={() => onCambio(quitarEquipo(lista, e))}>Quitar</button>
          </span>
        </div>
      ))}
      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
        <select id={`${idBase}-modelo`} value={def?.modelo ?? ""} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo de equipo" style={{ flex: 1, minWidth: 0 }}>
          {ofrecidos.map((d) => <option key={d.modelo} value={d.modelo}>{d.modelo}</option>)}
        </select>
        {def?.numerado && (
          <input id={`${idBase}-numero`} {...casillaNumerica(false)} value={numero} placeholder="n.º" aria-label="Número del equipo" style={{ width: 70 }} onChange={(e) => setNumero(e.target.value)} />
        )}
        <button type="button" className="btn sm" onClick={agregar}>Agregar</button>
      </div>
    </div>
  );
}
