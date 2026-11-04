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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /** `cruzar`: si no quedan casilleros en el bloque, pasar al bloque siguiente (solo con el boton "Sig."). */
  siguiente(clave: string, cruzar?: boolean): void;
}

const Ctx = createContext<CtxFranja | null>(null);

export function useFranja(): CtxFranja {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFranja fuera de ProveedorFranja");
  return c;
}

/** Se emite cuando "Sig." no encuentra mas casilleros. `preventDefault()` = "ya me encargo yo". */
export const EVENTO_FIN_PESTANA = "franja-fin-pestana";

/** Se emite cuando "Sig." termina las casillas de un cuadro; `detail` = id del cuadro. */
export const EVENTO_FIN_SEGMENTO = "franja-fin-segmento";

/**
 * Deja el casillero a la vista por ENCIMA del teclado y de la franja: el visualViewport
 * mide lo que queda libre cuando el teclado del sistema esta abierto.
 */
export function asegurarVisible(el: HTMLElement): void {
  const cuerpo = document.getElementById("cuerpo");
  if (!cuerpo) return;
  const vv = window.visualViewport;
  const limite = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 72;
  const r = el.getBoundingClientRect();
  const arriba = cuerpo.getBoundingClientRect().top;
  if (r.bottom > limite) cuerpo.scrollBy({ top: r.bottom - limite + 8, behavior: "smooth" });
  else if (r.top < arriba) cuerpo.scrollBy({ top: r.top - arriba - 8, behavior: "smooth" });
}

/** Enfoca el primer casillero de un cuadro (o de la pantalla), sin mover el scroll. */
export function enfocarPrimeroEn(cont: ParentNode | null): boolean {
  const primero = paradas().find((el) => !cont || cont.contains(el));
  primero?.focus({ preventScroll: true });
  return primero !== undefined;
}

/** Enfoca el primer casillero de la pantalla actual (tras cambiar de pestana). */
export function enfocarPrimero(): boolean {
  const primero = paradas()[0];
  primero?.focus();
  return primero !== undefined;
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
    (clave: string, cruzar = true) => {
      const lista = paradas();
      const i = lista.findIndex((el) => el.dataset["stop"] === clave);
      const sig = lista[i + 1];
      const actual = lista[i];
      const segActual = actual?.closest<HTMLElement>("[data-seg]") ?? null;
      // Dentro del cuadro se va de casilla en casilla; la ultima casilla lleva al cuadro siguiente.
      if (sig && segActual && sig.closest("[data-seg]") !== segActual) {
        if (!cruzar) return cerrar();
        const manejado = !window.dispatchEvent(new CustomEvent(EVENTO_FIN_SEGMENTO, { cancelable: true, detail: segActual.dataset["seg"] }));
        if (manejado) return;
      }
      if (!sig) {
        if (!cruzar) return cerrar();
        // Fin de la pestana: quien la muestra puede pasar a la siguiente (Monitoreo -> Ventilacion).
        const manejado = !window.dispatchEvent(new CustomEvent(EVENTO_FIN_PESTANA, { cancelable: true }));
        if (!manejado) cerrar();
        return;
      }
      sig.focus({ preventScroll: true });
      asegurarVisible(sig);
    },
    [cerrar]
  );

  // Si el foco sale de los casilleros (se toco fuera o se cerro el teclado), la franja se va.
  useEffect(() => {
    if (activa === null) return;
    const alSalir = (): void => {
      setTimeout(() => {
        const el = document.activeElement;
        const enCasillero = el instanceof HTMLElement && el.closest("[data-stop]") !== null;
        const enFranja = el instanceof HTMLElement && el.closest(".franja") !== null;
        if (!enCasillero && !enFranja) setActiva(null);
      }, 120);
    };
    document.addEventListener("focusout", alSalir);
    return () => document.removeEventListener("focusout", alSalir);
  }, [activa]);

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
    // Elegir una opcion no salta de cuadro, salvo el Modo: de ahi se sigue a los ajustes.
    setTimeout(() => siguiente(activa, activa === "modo"), 40);
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
