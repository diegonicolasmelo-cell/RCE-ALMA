/**
 * Franja de opciones sobre el teclado.
 *
 * En el telefono queda el teclado del sistema y esta franja se ancla justo
 * encima usando visualViewport. No puede ir DENTRO de la barra de sugerencias
 * del teclado: ni iOS ni Android lo permiten a una web.
 *
 * "Sig. ›" pasa al siguiente casillero en el orden de la pantalla y SE DETIENE
 * en el Modo ventilatorio, ofreciendo "Igual que el anterior" u otra modalidad
 * (un select nativo se saltaba ese paso).
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAlturaTeclado } from "../app/hooks";
import { cx } from "../app/util";

export interface OpcionFranja {
  readonly valor: string;
  readonly texto: string;
  /** Segunda linea pequena (p. ej. los ml/kg de una opcion de volumen). */
  readonly sub?: string;
  readonly activa?: boolean;
  /** Valor del control anterior ("ant. 35"): borde punteado. */
  readonly previa?: boolean;
}

export interface DescriptorFranja {
  readonly etiqueta: string;
  readonly opciones: readonly OpcionFranja[];
  readonly onElegir: (valor: string) => void;
}

interface CtxFranja {
  readonly activa: string | null;
  abrir(clave: string): void;
  cerrar(): void;
  /** Cada casillero registra como construir su franja con el estado ACTUAL (no uno viejo). */
  registrar(clave: string, f: () => DescriptorFranja): void;
  siguiente(clave: string): void;
}

const Ctx = createContext<CtxFranja | null>(null);

export function useFranja(): CtxFranja {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFranja fuera de ProveedorFranja");
  return c;
}

/** Casilleros navegables, en el orden de la pantalla. */
function paradas(): HTMLElement[] {
  const cuerpo = document.getElementById("cuerpo");
  if (!cuerpo) return [];
  return [...cuerpo.querySelectorAll<HTMLElement>("[data-stop]")].filter(
    (el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null
  );
}

export function ProveedorFranja({ children }: { children: ReactNode }) {
  const [activa, setActiva] = useState<string | null>(null);
  const registro = useRef(new Map<string, () => DescriptorFranja>());

  const abrir = useCallback((clave: string) => setActiva(clave), []);
  const cerrar = useCallback(() => {
    setActiva(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);
  const registrar = useCallback((clave: string, f: () => DescriptorFranja) => {
    registro.current.set(clave, f);
  }, []);
  const siguiente = useCallback(
    (clave: string) => {
      const lista = paradas();
      const i = lista.findIndex((el) => el.dataset["stop"] === clave);
      const sig = lista[i + 1];
      if (!sig) return cerrar();
      sig.focus();
      sig.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [cerrar]
  );

  const valor = useMemo<CtxFranja>(
    () => ({ activa, abrir, cerrar, registrar, siguiente }),
    [activa, abrir, cerrar, registrar, siguiente]
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
      <BarraFranja registro={registro.current} />
    </Ctx.Provider>
  );
}

function BarraFranja({ registro }: { registro: Map<string, () => DescriptorFranja> }) {
  const { activa, cerrar, siguiente } = useFranja();
  const alto = useAlturaTeclado();
  const desc = activa ? registro.get(activa)?.() : undefined;
  if (!activa || !desc) return null;

  const elegir = (valor: string): void => {
    desc.onElegir(valor);
    // Si el cambio redibuja la pantalla (p. ej. nueva modalidad), esperar antes de avanzar.
    setTimeout(() => siguiente(activa), 40);
  };

  return (
    <div
      className="franja"
      style={{ bottom: alto }}
      role="toolbar"
      aria-label={`Opciones para ${desc.etiqueta}`}
      // Evita que tocar la franja le quite el foco al casillero.
      onPointerDown={(e) => e.preventDefault()}
    >
      <span className="franja-etiqueta">{desc.etiqueta}</span>
      <div className="franja-opciones">
        {desc.opciones.map((o) => (
          <button
            key={`${o.valor}-${o.texto}`}
            type="button"
            className={cx("qchip", o.previa && "prev", o.activa && "on")}
            onClick={() => elegir(o.valor)}
          >
            {o.texto}
            {o.sub && <small>{o.sub}</small>}
          </button>
        ))}
        <button type="button" className="qchip nxt" onClick={() => siguiente(activa)}>
          Sig. ›
        </button>
        <button type="button" className="qchip nxt" onClick={cerrar} aria-label="Cerrar">
          Listo
        </button>
      </div>
    </div>
  );
}

/** Opciones a partir de valores numericos, marcando la actual y ofreciendo la previa. */
export function opcionesNumericas(
  valores: readonly number[],
  actual: string,
  previa?: string | number | null
): readonly OpcionFranja[] {
  const out: OpcionFranja[] = [];
  if (previa !== undefined && previa !== null && previa !== "") {
    out.push({ valor: String(previa), texto: `ant. ${previa}`, previa: true });
  }
  for (const v of valores) out.push({ valor: String(v), texto: String(v), activa: String(v) === actual });
  return out;
}
