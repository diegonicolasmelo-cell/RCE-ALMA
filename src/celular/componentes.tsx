import type { ReactNode } from "react";
import { cx } from "../app/util";
import { useFranja } from "./franja";
import type { DescriptorFranja } from "./franja";

export function Seg<T extends string | boolean | number>(props: {
  valor: T | null;
  opciones: readonly { valor: T; texto: string; deshabilitada?: boolean }[];
  onCambio: (v: T) => void;
  etiqueta: string;
  ancho?: boolean;
}) {
  return (
    <div className={cx("seg", props.ancho && "wide")} role="group" aria-label={props.etiqueta}>
      {props.opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          aria-pressed={props.valor === o.valor}
          disabled={o.deshabilitada}
          onClick={() => props.onCambio(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Fichas<T extends string | number>(props: {
  valor: T | null;
  opciones: readonly { valor: T; texto: string }[];
  onCambio: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="row" style={{ gap: 6 }} role="group" aria-label={props.etiqueta}>
      {props.opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          className="chip"
          style={{ fontFamily: "var(--font-ui)" }}
          aria-pressed={props.valor === o.valor}
          onClick={() => props.onCambio(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Aviso(props: { tipo: "acc" | "crit" | "good" | "warn" | "new"; children: ReactNode; pequeno?: boolean }) {
  return <div className={cx("notice", props.tipo, props.pequeno && "small")}>{props.children}</div>;
}

export function Pildora(props: { tipo?: "" | "acc" | "good" | "warn" | "crit" | "new"; children: ReactNode; id?: string }) {
  return (
    <span className={cx("pill", props.tipo)} id={props.id}>
      {props.children}
    </span>
  );
}

/** Casillero numerico: teclado numerico del sistema + franja de opciones encima. */
export function CampoNum(props: {
  clave: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  franja: () => DescriptorFranja;
  placeholder?: string;
  deshabilitado?: boolean;
  unidad?: string;
  ariaLabel?: string;
  /** Valor del control anterior: columna aparte, solo en pantallas anchas (como la hoja). */
  previo?: number | string | null;
  /** Solo la casilla, sin su etiqueta: para filas compuestas (PA, Glasgow). */
  soloCasilla?: boolean;
}) {
  const f = useFranja();
  f.registrar(props.clave, props.franja);
  const id = `in-${props.clave.replace(/[^a-z0-9]+/gi, "-")}`;
  if (props.soloCasilla) {
    return (
      <input
        id={id}
        className="casilla"
        data-stop={props.clave}
        inputMode="decimal"
        autoComplete="off"
        value={props.valor}
        placeholder={props.placeholder ?? ""}
        disabled={props.deshabilitado}
        aria-label={props.ariaLabel ?? props.etiqueta}
        enterKeyHint="next"
        onFocus={() => f.abrir(props.clave)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            f.siguiente(props.clave);
          }
        }}
        onChange={(e) => props.onCambio(e.target.value)}
      />
    );
  }
  return (
    <div className="f">
      <label htmlFor={id}>
        {props.etiqueta}
        {props.unidad && <span className="muted"> {props.unidad}</span>}
      </label>
      <input
        id={id}
        data-stop={props.clave}
        inputMode="decimal"
        autoComplete="off"
        value={props.valor}
        placeholder={props.placeholder ?? ""}
        disabled={props.deshabilitado}
        aria-label={props.ariaLabel ?? props.etiqueta}
        enterKeyHint="next"
        onFocus={() => f.abrir(props.clave)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            f.siguiente(props.clave);
          }
        }}
        onChange={(e) => props.onCambio(e.target.value)}
      />
      <span className="previo" aria-hidden="true">{props.previo === null || props.previo === undefined ? "" : String(props.previo)}</span>
    </div>
  );
}
