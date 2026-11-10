/**
 * Teclado numerico propio, como el del registro simple: mas bajo que el del sistema, con
 * «Sig.» bajo el borrar (como en Android), coma decimal y ⌄ para ocultarlo.
 *
 * Funciona sobre las casillas `.fila input.num` de la hoja del control. En un celular (puntero
 * grueso) esas casillas no abren el teclado del sistema (inputmode="none") y aparece este; en
 * un PC se escribe con el teclado fisico y Enter pasa a la casilla siguiente.
 *
 * La fila activa queda centrada en lo que se ve sobre el teclado, y mientras se escribe se
 * ocultan la cabecera y el boton de guardar (no tapan nada).
 */

import { useEffect, useRef, useState } from "react";

export const TECLADO_PROPIO = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const SELECTOR = "#cuerpo .fila input, #cuerpo .fila select";
const SELECTOR_SIG = "#cuerpo .fila input:not([disabled]), #cuerpo .fila select:not([disabled])";

/** Cambia el valor de una casilla de React como si se hubiera tecleado (dispara onChange). */
function escribir(el: HTMLInputElement, valor: string): void {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function enfocar(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

/** Casilla siguiente (Enter o «Sig.»). En la ultima se cierra el teclado y queda listo Guardar. */
export function siguienteCasilla(el: HTMLElement): void {
  const lista = [...document.querySelectorAll<HTMLElement>(SELECTOR_SIG)];
  const sig = lista[lista.indexOf(el) + 1];
  if (sig) enfocar(sig);
  else {
    el.blur();
    document.querySelector<HTMLElement>("[data-guardar]")?.focus();
  }
}

/** Lleva la fila al 40 % de lo que se ve sobre el teclado, no al borde. */
function centrar(activa: HTMLElement | null, kb: HTMLElement | null): void {
  const cuerpo = document.getElementById("cuerpo");
  if (!activa || !cuerpo || !document.body.contains(activa)) return;
  const fila = activa.closest<HTMLElement>(".fila") ?? activa;
  const caja = cuerpo.getBoundingClientRect();
  const vv = window.visualViewport;
  const abajo = kb && !kb.hidden ? kb.getBoundingClientRect().top : vv ? vv.offsetTop + vv.height : window.innerHeight;
  const arriba = Math.max(caja.top, 0);
  const r = fila.getBoundingClientRect();
  const delta = r.top + r.height / 2 - (arriba + (abajo - arriba) * 0.4);
  if (Math.abs(delta) > 8) cuerpo.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Teclados: el numerico general y los de las escalas, que solo traen los valores posibles
 * (MRC 0-5 y NE; CPAx 0-5; FSS-ICU 0-7 y NE). En los de escala, un toque deja el valor y
 * salta a la casilla siguiente.
 */
type TipoTeclado = "num" | "mrc" | "cpax" | "fss";

export function TecladoPropio() {
  const [visible, setVisible] = useState(false);
  const [tipo, setTipo] = useState<TipoTeclado>("num");
  const kb = useRef<HTMLDivElement>(null);
  const activa = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const alEntrar = (e: FocusEvent): void => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.(SELECTOR)) return;
      activa.current?.closest(".fila")?.classList.remove("activa");
      activa.current = el;
      el.closest(".fila")?.classList.add("activa");
      document.getElementById("cuerpo")?.classList.add("escribiendo");
      const conTeclado = TECLADO_PROPIO && el.classList.contains("num");
      if (conTeclado) setTipo((el.dataset["teclado"] as TipoTeclado | undefined) ?? "num");
      setVisible(conTeclado);
      document.body.classList.toggle("teclado-propio", conTeclado);
      // Se centra al tiro y otra vez cuando el teclado termina de aparecer.
      requestAnimationFrame(() => centrar(el, kb.current));
      setTimeout(() => centrar(el, kb.current), 320);
    };
    const alSalir = (e: FocusEvent): void => {
      if (!(e.target as HTMLElement | null)?.matches?.(SELECTOR)) return;
      setTimeout(() => {
        const foco = document.activeElement as HTMLElement | null;
        if (foco?.matches?.(SELECTOR)) return;
        activa.current?.closest(".fila")?.classList.remove("activa");
        activa.current = null;
        setVisible(false);
        document.body.classList.remove("teclado-propio");
        document.getElementById("cuerpo")?.classList.remove("escribiendo");
      }, 60);
    };
    // Enter = casilla siguiente, como en la hoja.
    const alTeclear = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "Enter" || !el?.matches?.(SELECTOR)) return;
      e.preventDefault();
      siguienteCasilla(el);
    };
    document.addEventListener("focusin", alEntrar);
    document.addEventListener("focusout", alSalir);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("focusin", alEntrar);
      document.removeEventListener("focusout", alSalir);
      document.removeEventListener("keydown", alTeclear);
      document.body.classList.remove("teclado-propio");
    };
  }, []);

  const tecla = (k: string): void => {
    const el = activa.current as HTMLInputElement | null;
    if (!el) return;
    if (k === "sig") return siguienteCasilla(el);
    if (k === "ocultar") return el.blur();
    if (el.dataset["teclado"] && el.dataset["teclado"] !== "num") {
      escribir(el, k === "borrar" ? "" : k);
      if (k !== "borrar") siguienteCasilla(el);
      return;
    }
    let v = el.value;
    if (k === "borrar") v = v.slice(0, -1);
    else if (k === ",") {
      if (!/[.,]/.test(v)) v = `${v || "0"},`;
    } else v += k;
    escribir(el, v);
  };

  const B = (k: string, txt: string, cls = "", aria?: string) => (
    <button type="button" className={cls || undefined} data-kb={k} aria-label={aria} onClick={() => tecla(k)}>{txt}</button>
  );
  const fila = (ks: readonly string[]) => ks.map((k) => <span key={k} style={{ display: "contents" }}>{B(k, k)}</span>);
  return (
    <div
      ref={kb}
      className={`kb${tipo === "num" ? "" : ` ${tipo}`}`}
      hidden={!visible}
      role="group"
      aria-label="Teclado numérico"
      // Las teclas no le quitan el foco a la casilla.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      {tipo === "num" && (
        <>
          {B("1", "1")}{B("2", "2")}{B("3", "3")}{B("borrar", "⌫", "fn", "Borrar")}
          {B("4", "4")}{B("5", "5")}{B("6", "6")}{B("sig", "Sig. ›", "sig", "Siguiente casilla")}
          {B("7", "7")}{B("8", "8")}{B("9", "9")}
          {B(",", ",", "fn", "Coma decimal")}{B("0", "0")}{B("ocultar", "⌄", "fn", "Ocultar teclado")}
        </>
      )}
      {tipo === "mrc" && (
        <>
          {fila(["0", "1", "2"])}{B("borrar", "⌫", "fn", "Borrar")}
          {fila(["3", "4", "5"])}{B("sig", "Sig. ›", "sig", "Siguiente casilla")}
          {B("NE", "NE · no evaluable", "fn ne", "No evaluable")}{B("ocultar", "⌄", "fn", "Ocultar teclado")}
        </>
      )}
      {tipo === "cpax" && (
        <>
          {fila(["0", "1", "2"])}{B("borrar", "⌫", "fn", "Borrar")}
          {fila(["3", "4", "5"])}{B("sig", "Sig. ›", "sig", "Siguiente casilla")}
          {B("ocultar", "⌄ ocultar", "fn oc", "Ocultar teclado")}
        </>
      )}
      {tipo === "fss" && (
        <>
          {fila(["0", "1", "2"])}{B("borrar", "⌫", "fn", "Borrar")}
          {fila(["3", "4", "5"])}{B("sig", "Sig. ›", "sig", "Siguiente casilla")}
          {fila(["6", "7"])}{B("ocultar", "⌄", "fn", "Ocultar teclado")}
          {B("NE", "NE · no evaluable (no por debilidad)", "fn ne", "No evaluable")}
        </>
      )}
    </div>
  );
}
