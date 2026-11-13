/**
 * Tarjeta de infusion plegable, igual para sedantes y farmacos cardiovasculares.
 *
 * Apagada: una linea con nombre, unidad y el boton verde Iniciar. En curso: dosis
 * (o escalon) y Suspender, mas la visual de los 6 escalones en los sedantes.
 * Iniciar -> titular -> suspender.
 */

import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { escalonesDe, medicionDe, semaforoCatecolamina, textoEscalon, titularDosis, titularPorEscalon } from "@core/index";
import type { BorradorInfusion, Control, DefinicionInfusion } from "@core/index";
import { cx } from "../app/util";
import { Pildora } from "./componentes";
import { opcionesNumericas, useFranja } from "./franja";
import { casillaNumerica } from "./TecladoPropio";

interface Props {
  def: DefinicionInfusion;
  x: BorradorInfusion;
  ultimo: Control | null;
  onCambio: (parcial: Partial<BorradorInfusion>) => void;
  onIniciar: () => void;
  onSuspender: () => void;
  onAlternarLibre: () => void;
}

/** La dosis y, en los sedantes, donde cae en la escalera (solo para leer: se guarda la dosis). */
function textoDosis(def: DefinicionInfusion, x: BorradorInfusion): string {
  if (!x.activa) return "Sin infusión";
  const d = medicionDe(x.dosis);
  if (d === null) return "Falta la dosis";
  const esc = textoEscalon(def.id, d);
  return `${d} ${def.unidad}${esc ? ` · ${esc}` : ""}`;
}

export function TarjetaInfusion({ def, x, ultimo, onCambio, onIniciar, onSuspender }: Props) {
  const f = useFranja();
  // Siempre por dosis: el escalon no se guarda. Los sedantes titulan por su escalera.
  const conEscalera = def.escalones !== null;
  const clave = `inf:${def.id}:dosis`;
  const previa = ultimo?.infusiones[def.id];

  f.registrar(clave, () => ({
    etiqueta: `${def.nombre} · ${def.unidad}`,
    opciones: conEscalera
      ? [
          ...(previa ? [{ valor: String(previa.dosis), texto: `ant. ${previa.dosis}`, previa: true }] : []),
          ...escalonesDe(def.id).map((e) => ({
            valor: String(e.dosis),
            texto: String(e.dosis),
            sub: `esc. ${e.escalon}`,
            activa: x.dosis === String(e.dosis)
          }))
        ]
      : opcionesNumericas(def.rapidos, x.dosis, previa ? previa.dosis : null),
    onElegir: (v) => onCambio({ dosis: v })
  }));

  const dosisNum = Number(x.dosis.replace(",", "."));
  const semaforo = def.semaforo && x.activa && x.dosis !== "" ? semaforoCatecolamina(dosisNum) : "SIN_DVA";
  const estado =
    semaforo === "BAJA" ? { tipo: "good" as const, t: "DVA baja" }
    : semaforo === "MEDIA" ? { tipo: "warn" as const, t: "DVA media" }
    : semaforo === "ALTA" ? { tipo: "crit" as const, t: "DVA alta" }
    : { tipo: "acc" as const, t: "En curso" };

  const dosisActual = x.activa ? medicionDe(x.dosis) : null;
  const titular = (sentido: 1 | -1): string => (conEscalera ? titularPorEscalon(def.id, x.dosis, sentido) : titularDosis(x.dosis, def.paso ?? 0.01, sentido));
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
                {...casillaNumerica()}
                autoComplete="off"
                value={x.dosis}
                placeholder="dosis"
                aria-label={`${def.nombre} dosis`}
                onFocus={() => f.abrir(clave)}
                onChange={(e) => onCambio({ dosis: e.target.value })}
              />
              {(
                <>
                  <button type="button" className="btn sm" aria-label={`Bajar ${def.nombre}`} onClick={() => onCambio({ dosis: titular(-1) })}><ChevronDown size={16} aria-hidden /></button>
                  <button type="button" className="btn sm" aria-label={`Subir ${def.nombre}`} onClick={() => onCambio({ dosis: titular(1) })}><ChevronUp size={16} aria-hidden /></button>
                  <span className="small muted">{def.unidad}</span>
                </>
              )}
            </div>
            <button type="button" className="btn sm stop" onClick={onSuspender}>
              <Pause size={12} aria-hidden /> Suspender
            </button>
          </div>

          {conEscalera && (
            <>
              <div className="steps" aria-label="Escalones de titulación">
                {escalonesDe(def.id).map((e) => (
                  <i key={e.escalon} className={cx("st", dosisActual !== null && dosisActual >= e.dosis - 1e-9 && "f", dosisActual !== null && Math.abs(dosisActual - e.dosis) < 1e-9 && "cur")}>
                    <b>{e.escalon}</b>
                    <small>{e.dosis}</small>
                  </i>
                ))}
              </div>
              <div className="small ink2 mt" aria-live="polite">{textoDosis(def, x)}</div>
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
