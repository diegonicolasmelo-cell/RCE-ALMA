/**
 * Tarjeta de infusion plegable, igual para sedantes y farmacos cardiovasculares.
 *
 * Apagada: una linea con nombre, unidad y el boton verde Iniciar. En curso: dosis
 * (o escalon) y Suspender, mas la visual de los 6 escalones en los sedantes.
 * Iniciar -> titular -> suspender.
 */

import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { dosisDeEscalon, escalonesDe, medicionDe, semaforoCatecolamina, titularDosis } from "@core/index";
import type { BorradorInfusion, Control, DefinicionInfusion } from "@core/index";
import { cx } from "../app/util";
import { Pildora } from "./componentes";
import { opcionesNumericas, useFranja } from "./franja";

interface Props {
  def: DefinicionInfusion;
  x: BorradorInfusion;
  ultimo: Control | null;
  onCambio: (parcial: Partial<BorradorInfusion>) => void;
  onIniciar: () => void;
  onSuspender: () => void;
  onAlternarLibre: () => void;
}

function textoDosis(def: DefinicionInfusion, x: BorradorInfusion): string {
  if (!x.activa) return "Sin infusión";
  if (x.libre) {
    const d = medicionDe(x.dosis);
    return d === null ? "Falta la dosis" : `${d} ${def.unidad} · dosis libre`;
  }
  const e = medicionDe(x.escalon);
  const d = e === null ? null : dosisDeEscalon(def.id, e);
  return d === null ? "Falta el escalón (1 a 6)" : `${d} ${def.unidad} · escalón ${e}`;
}

export function TarjetaInfusion({ def, x, ultimo, onCambio, onIniciar, onSuspender, onAlternarLibre }: Props) {
  const f = useFranja();
  const usaEscalon = def.escalones !== null && !x.libre;
  const clave = `inf:${def.id}:${usaEscalon ? "esc" : "dosis"}`;
  const previa = ultimo?.infusiones[def.id];

  f.registrar(clave, () => ({
    etiqueta: `${def.nombre} · ${usaEscalon ? "escalón" : def.unidad}`,
    opciones: usaEscalon
      ? [
          ...(previa?.escalon != null ? [{ valor: String(previa.escalon), texto: `ant. ${previa.escalon}`, previa: true }] : []),
          ...escalonesDe(def.id).map((e) => ({
            valor: String(e.escalon),
            texto: String(e.escalon),
            sub: String(e.dosis),
            activa: x.escalon === String(e.escalon)
          }))
        ]
      : opcionesNumericas(def.rapidos, x.dosis, previa && previa.escalon === null ? previa.dosis : null),
    onElegir: (v) => onCambio(usaEscalon ? { escalon: v } : { dosis: v })
  }));

  const dosisNum = Number(x.dosis.replace(",", "."));
  const semaforo = def.semaforo && x.activa && x.dosis !== "" ? semaforoCatecolamina(dosisNum) : "SIN_DVA";
  const estado =
    semaforo === "BAJA" ? { tipo: "good" as const, t: "DVA baja" }
    : semaforo === "MEDIA" ? { tipo: "warn" as const, t: "DVA media" }
    : semaforo === "ALTA" ? { tipo: "crit" as const, t: "DVA alta" }
    : { tipo: "acc" as const, t: "En curso" };

  const escalonActual = usaEscalon && x.activa ? Number(x.escalon) : null;
  const id = `in-${clave.replace(/[^a-z0-9]+/gi, "-")}`;
  /** Al iniciar, el foco pasa a la dosis para titular de inmediato (no al abrir la pantalla). */
  const iniciar = (): void => {
    onIniciar();
    setTimeout(() => document.getElementById(id)?.focus(), 40);
  };

  return (
    <div className={cx("infu", x.activa ? "on" : "off")}>
      <div className="infu-top">
        <div className="infu-name">
          <b>{def.nombre}</b>
          <span className="unit">{def.unidad}</span>
          {!def.unidadConfirmada && <Pildora tipo="warn">unidad por confirmar</Pildora>}
        </div>
        {x.activa ? (
          <Pildora tipo={estado.tipo}>{estado.t}</Pildora>
        ) : (
          <button type="button" className="btn sm play" onClick={iniciar}>
            <Play size={12} aria-hidden /> Iniciar
          </button>
        )}
      </div>

      {x.activa && (
        <>
          <div className="infu-row">
            <div className="f inl" style={{ marginLeft: 0 }}>
              <input
                id={id}
                data-stop={clave}
                inputMode="decimal"
                autoComplete="off"
                value={usaEscalon ? x.escalon : x.dosis}
                placeholder={usaEscalon ? "" : "dosis"}
                aria-label={`${def.nombre} ${usaEscalon ? "escalón" : "dosis"}`}
                onFocus={() => f.abrir(clave)}
                onChange={(e) => onCambio(usaEscalon ? { escalon: e.target.value } : { dosis: e.target.value })}
              />
              {!usaEscalon && (
                <>
                  <button type="button" className="btn sm" aria-label={`Bajar ${def.nombre}`} onClick={() => onCambio({ dosis: titularDosis(x.dosis, def.paso ?? 0.01, -1) })}><ChevronDown size={16} aria-hidden /></button>
                  <button type="button" className="btn sm" aria-label={`Subir ${def.nombre}`} onClick={() => onCambio({ dosis: titularDosis(x.dosis, def.paso ?? 0.01, 1) })}><ChevronUp size={16} aria-hidden /></button>
                  <span className="small muted">{def.unidad}</span>
                </>
              )}
            </div>
            <button type="button" className="btn sm stop" onClick={onSuspender}>
              <Pause size={12} aria-hidden /> Suspender
            </button>
          </div>

          {def.escalones !== null && (
            <>
              {usaEscalon && (
                <div className="steps" aria-label="Escalón de titulación">
                  {escalonesDe(def.id).map((e) => (
                    <i key={e.escalon} className={cx("st", escalonActual !== null && escalonActual >= e.escalon && "f", escalonActual === e.escalon && "cur")}>
                      <b>{e.escalon}</b>
                      <small>{e.dosis}</small>
                    </i>
                  ))}
                </div>
              )}
              <div className="small ink2 mt">{textoDosis(def, x)}</div>
              <button type="button" className="linkbtn" onClick={onAlternarLibre}>
                {x.libre ? "Usar escalones" : "Dosis libre"}
              </button>
            </>
          )}
          {def.escalones === null && def.grupo === "SEDANTE" && (
            <div className="small muted mt">Sin escalones definidos: solo dosis libre.</div>
          )}
        </>
      )}
    </div>
  );
}
