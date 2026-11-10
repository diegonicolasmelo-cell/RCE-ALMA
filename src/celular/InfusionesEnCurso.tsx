/**
 * Infusiones en curso, como en el registro simple: una fila compacta por droga (nombre,
 * unidad, lo de antes, ▼ dosis ▲ y × para suspender) y un solo «+ Agregar droga o infusión».
 * Se guarda la dosis; en los sedantes, las flechas titulan por la escalera de escalones.
 */

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { INFUSIONES, escalonesDe, iniciarInfusion, medicionDe, semaforoCatecolamina, suspenderInfusion, textoEscalon, titularDosis, titularPorEscalon } from "@core/index";
import type { DefinicionInfusion, GrupoInfusion, IdInfusion } from "@core/index";
import { useApp } from "../app/store";
import { Pildora } from "./componentes";
import type { ContextoCama } from "./contextoCama";
import { opcionesNumericas, useFranja } from "./franja";

const GRUPOS: readonly (readonly [GrupoInfusion, string])[] = [
  ["SEDANTE", "Sedoanalgesia y agitación"],
  ["DVA", "Drogas vasoactivas"],
  ["INOTROPO", "Inotrópicos"],
  ["ANTIARRITMICO", "Antiarrítmicos"],
  ["BNM", "Bloqueo neuromuscular"]
];

function Fila({ ctx, def }: { ctx: ContextoCama; def: DefinicionInfusion }) {
  const { b, ultimo, editar } = ctx;
  const f = useFranja();
  const avisar = useApp((s) => s.avisar);
  const x = b.infusiones[def.id];
  const clave = `inf:${def.id}:dosis`;
  const id = `in-${clave.replace(/[^a-z0-9]+/gi, "-")}`;
  const previa = ultimo?.infusiones[def.id];
  const conEscalera = def.escalones !== null;
  const setDosis = (dosis: string): void => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [def.id]: { ...y.infusiones[def.id], dosis } } }));
  const titular = (sentido: 1 | -1): string => (conEscalera ? titularPorEscalon(def.id, x.dosis, sentido) : titularDosis(x.dosis, def.paso ?? 0.01, sentido));

  f.registrar(clave, () => ({
    etiqueta: `${def.nombre} · ${def.unidad}`,
    opciones: conEscalera
      ? [
          ...(previa ? [{ valor: String(previa.dosis), texto: `ant. ${previa.dosis}`, previa: true }] : []),
          ...escalonesDe(def.id).map((e) => ({ valor: String(e.dosis), texto: String(e.dosis), sub: `esc. ${e.escalon}`, activa: x.dosis === String(e.dosis) }))
        ]
      : opcionesNumericas(def.rapidos, x.dosis, previa ? previa.dosis : null),
    onElegir: setDosis
  }));

  const suspender = (): void => {
    const antes = b.infusiones[def.id];
    editar((y) => suspenderInfusion(y, def.id));
    avisar(`${def.nombre} suspendida.`, () => editar((y) => ({ ...y, infusiones: { ...y.infusiones, [def.id]: antes } })));
  };

  const d = medicionDe(x.dosis);
  const esc = conEscalera ? textoEscalon(def.id, d) : "";
  const semaforo = def.semaforo && d !== null ? semaforoCatecolamina(d) : "SIN_DVA";

  return (
    <div className="inf-fila" aria-label={def.nombre}>
      <div className="inf-et">
        <b>{def.nombre}</b> <span className="muted">{def.unidad}</span>
        <button type="button" className="inf-x" aria-label={`Suspender ${def.nombre}`} title="Suspender" onClick={suspender}><X size={14} aria-hidden /></button>
        <span className="inf-ayuda">
          {previa ? `antes ${previa.dosis}` : "nueva"}
          {esc ? ` · ${esc}` : ""}
          {semaforo !== "SIN_DVA" && <> · <Pildora tipo={semaforo === "BAJA" ? "good" : semaforo === "MEDIA" ? "warn" : "crit"}>DVA {semaforo.toLowerCase()}</Pildora></>}
        </span>
      </div>
      <div className="inf-dosis">
        <button type="button" className="inf-flecha" aria-label={`Bajar ${def.nombre}`} onClick={() => setDosis(titular(-1))}><ChevronDown size={18} aria-hidden /></button>
        <input
          id={id}
          data-stop={clave}
          inputMode="decimal"
          autoComplete="off"
          value={x.dosis}
          placeholder="dosis"
          aria-label={`${def.nombre} dosis`}
          enterKeyHint="next"
          onFocus={() => f.abrir(clave)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              f.siguiente(clave);
            }
          }}
          onChange={(e) => setDosis(e.target.value)}
        />
        <button type="button" className="inf-flecha" aria-label={`Subir ${def.nombre}`} onClick={() => setDosis(titular(1))}><ChevronUp size={18} aria-hidden /></button>
      </div>
    </div>
  );
}

export function InfusionesEnCurso({ ctx }: { ctx: ContextoCama }) {
  const { b, editar } = ctx;
  const activas = INFUSIONES.filter((d) => b.infusiones[d.id].activa);
  const agregar = (id: IdInfusion): void => {
    editar((y) => iniciarInfusion(y, id));
    // El foco pasa a la dosis para titular de inmediato.
    setTimeout(() => document.getElementById(`in-inf-${id}-dosis`)?.focus(), 60);
  };
  return (
    <section aria-label="Infusiones en curso">
      <div className="subg-hoja">Infusiones en curso</div>
      {activas.length === 0 && <div className="small muted" style={{ padding: "6px 0" }}>Sin infusiones.</div>}
      {activas.map((d) => <Fila key={d.id} ctx={ctx} def={d} />)}
      <select
        className="inf-agregar"
        aria-label="Agregar droga o infusión"
        value=""
        onChange={(e) => { if (e.target.value) agregar(e.target.value as IdInfusion); }}
      >
        <option value="">+ Agregar droga o infusión</option>
        {GRUPOS.map(([g, t]) => {
          const libres = INFUSIONES.filter((d) => d.grupo === g && !b.infusiones[d.id].activa);
          return libres.length ? (
            <optgroup key={g} label={t}>
              {libres.map((d) => <option key={d.id} value={d.id}>{d.nombre} · {d.unidad}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
    </section>
  );
}
