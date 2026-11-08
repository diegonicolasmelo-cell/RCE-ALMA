import { useState } from "react";
import {
  MODELOS_VENTILADOR,
  camaDeEpisodio,
  enCama,
  enZona,
  etiquetaUbicacion,
  ventiladorEnCama
} from "@core/index";
import type { ModeloVentilador, ResultadoMovimiento } from "@core/index";
import { useServicios } from "../app/contexto";
import { useApp } from "../app/store";
import { nuevoId } from "../app/util";
import { useInventario } from "./inventario";
import { SpriteVentilador } from "./Sprite";

/**
 * El ventilador que hay en la cama que se esta atendiendo. Cada colega registra el de su
 * sala: elige uno del inventario (si estaba en otra parte, se mueve), o da de alta uno nuevo.
 * El que estaba en la cama se intercambia o se deja en el pasillo o la bodega.
 */
export function VentiladorDeCama({ cama: camaEpisodio, rutAutor }: { readonly cama: string; readonly rutAutor: string }) {
  const { repo } = useServicios();
  const avisar = useApp((s) => s.avisar);
  const inv = useInventario();
  const cama = camaDeEpisodio(camaEpisodio);
  const actual = ventiladorEnCama(inv, cama);
  const [abierto, setAbierto] = useState(false);
  const [modelo, setModelo] = useState<ModeloVentilador>(MODELOS_VENTILADOR[0]?.clave ?? "PB840");
  const [numero, setNumero] = useState("");
  const n = Number(numero);

  const resultado = (r: ResultadoMovimiento): void => {
    avisar(r.ok ? r.resumen : r.mensaje);
    if (r.ok) setAbierto(false);
  };
  const otros = inv.filter((v) => v.id !== actual?.id);

  return (
    <div className="mt">
      <button type="button" className="todo-row small vt-fila" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {actual ? <SpriteVentilador modelo={actual.modelo} /> : null}
        <span>
          <b>Ventilador de esta cama:</b> {actual ? actual.etiqueta : "sin registrar"} <span className="muted">· {abierto ? "cerrar" : "cambiar"}</span>
        </span>
      </button>
      {abierto && (
        <div className="card stack" style={{ padding: 10, gap: 8, marginTop: 6 }}>
          {otros.length === 0 && <div className="small muted">No hay otros ventiladores en el inventario.</div>}
          {otros.map((v) => (
            <div key={v.id} className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span className="vt-fila">
                <SpriteVentilador modelo={v.modelo} />
                <span><b>{v.etiqueta}</b> <span className="small muted">· {etiquetaUbicacion(v.ubicacion)}</span></span>
              </span>
              <button type="button" className="btn sm" onClick={() => void repo.moverVentilador(v.id, enCama(cama), {}, rutAutor, nuevoId).then(resultado)}>
                Poner aquí
              </button>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <select value={modelo} onChange={(e) => setModelo(e.target.value as ModeloVentilador)} aria-label="Modelo del ventilador nuevo">
              {MODELOS_VENTILADOR.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}</option>)}
            </select>
            <input inputMode="numeric" value={numero} placeholder="n.º" aria-label="Número del ventilador nuevo" style={{ width: 70 }} onChange={(e) => setNumero(e.target.value)} />
            <button
              type="button"
              className="btn sm"
              disabled={!Number.isInteger(n) || n < 1}
              onClick={() => void repo.altaVentilador(modelo, n, enCama(cama), rutAutor, nuevoId).then((r) => { resultado(r); if (r.ok) setNumero(""); })}
            >
              Agregar nuevo
            </button>
          </div>
          {actual && (
            <div className="row" style={{ gap: 8 }}>
              <span className="small muted">Sacar {actual.etiqueta} de la cama:</span>
              <button type="button" className="btn sm" onClick={() => void repo.moverVentilador(actual.id, enZona("PASILLO"), {}, rutAutor, nuevoId).then(resultado)}>Al pasillo</button>
              <button type="button" className="btn sm" onClick={() => void repo.moverVentilador(actual.id, enZona("BODEGA"), {}, rutAutor, nuevoId).then(resultado)}>A la bodega</button>
            </div>
          )}
          <div className="small muted">Para mantención o préstamo, usa el tablero de Ventiladores.</div>
        </div>
      )}
    </div>
  );
}
