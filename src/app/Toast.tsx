import { useEffect } from "react";
import { useApp } from "./store";

/** Aviso transitorio. Si trae "Deshacer", dura mas para dar tiempo de usarlo. */
export function Toast() {
  const aviso = useApp((s) => s.aviso);
  const cerrar = useApp((s) => s.cerrarAviso);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(cerrar, aviso.deshacer ? 6000 : 3800);
    return () => clearTimeout(t);
  }, [aviso, cerrar]);

  if (!aviso) return null;
  return (
    <div className="toast-app" role="status" aria-live="polite">
      {aviso.texto}
      {aviso.deshacer && (
        <button type="button" className="toast-btn" onClick={() => { aviso.deshacer?.(); cerrar(); }}>
          Deshacer
        </button>
      )}
    </div>
  );
}
