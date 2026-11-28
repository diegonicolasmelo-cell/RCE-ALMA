import { FlaskConical, ImageIcon } from "lucide-react";
import { useState } from "react";
import type { EnlacesRce } from "@core/index";

/**
 * Synapse y cobas desde la tarjeta de la cama (28-nov-2026, Diego: «cobas y Synapse copian el RUT que
 * alimentamos al RCE»). Igual que en el RCE: copia el RUT y abre la página para pegarlo en el buscador.
 * El RUT llega del RCE y vive solo en memoria; no se muestra en la tarjeta salvo que no se pueda copiar.
 */
function copiar(texto: string): boolean {
  // 🪤 Copiar ANTES de abrir la pestaña (lección del RCE, 4-sep-2026): abrirla consume el permiso del toque.
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, 99);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function AbrirConRut({ rut, enlaces, cama }: { rut: string; enlaces: EnlacesRce | null; cama: string }) {
  const [aviso, setAviso] = useState<string | null>(null);
  if (!rut || !enlaces || (!enlaces.synapse && !enlaces.lis)) return null;
  const abrir = (url: string, donde: string): void => {
    const ok = copiar(rut);
    const w = window.open(url, "_blank", "noopener");
    setAviso(!w ? "El navegador bloqueó la pestaña: permite las ventanas emergentes." : ok ? `RUT copiado: pégalo en el buscador de ${donde}.` : `No se pudo copiar. El RUT es ${rut}.`);
    setTimeout(() => setAviso(null), 6000);
  };
  return (
    <div className="abrir-rut">
      {enlaces.synapse && (
        <button type="button" className="btn" aria-label={`Synapse · ${cama}`} title="Copia el RUT y abre Synapse" onClick={() => abrir(enlaces.synapse, "Synapse")}>
          <ImageIcon size={15} aria-hidden /> Synapse
        </button>
      )}
      {enlaces.lis && (
        <button type="button" className="btn" aria-label={`cobas · ${cama}`} title="Copia el RUT y abre el laboratorio" onClick={() => abrir(enlaces.lis, "cobas")}>
          <FlaskConical size={15} aria-hidden /> cobas
        </button>
      )}
      {aviso && <span className="small muted" role="status">{aviso}</span>}
    </div>
  );
}
