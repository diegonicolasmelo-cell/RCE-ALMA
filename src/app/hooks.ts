import { liveQuery } from "dexie";
import { useCallback, useEffect, useState } from "react";

/**
 * Suscribe un componente a una consulta de IndexedDB: se vuelve a ejecutar cada
 * vez que cambian las tablas que lee, sin pedirle nada al servidor.
 */
export function useConsulta<T>(consulta: () => Promise<T> | T, deps: readonly unknown[], inicial: T): T {
  // El valor queda asociado a las dependencias con que se consulto: si cambian (otra cama), no
  // se devuelve el resultado anterior mientras llega el nuevo. Asi una cama nunca se muestra
  // un instante con los eventos o controles de otra.
  const clave = JSON.stringify(deps.map((d) => (typeof d === "object" && d !== null ? "obj" : d)));
  const [estado, setEstado] = useState<{ clave: string; valor: T }>({ clave, valor: inicial });
  useEffect(() => {
    const sub = liveQuery(consulta).subscribe({
      next: (valor) => setEstado({ clave, valor }),
      error: (e: unknown) => console.error("Error en consulta local", e)
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado.clave === clave ? estado.valor : inicial;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Fecha actual que se refresca cada `ms` (cronometros, "hace X min", turno vigente). */
export function useAhora(ms = 1000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}

/**
 * Cuanto sube el teclado del sistema desde el borde inferior de la pantalla.
 * Permite anclar la franja de opciones justo encima del teclado (no se puede
 * poner dentro de la barra de sugerencias del propio teclado).
 */
export function useAlturaTeclado(): number {
  const [alto, setAlto] = useState(0);
  const medir = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return setAlto(0);
    setAlto(Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))));
  }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
    };
  }, [medir]);
  return alto;
}
