import { Printer, X } from "lucide-react";
import { useRef } from "react";

/**
 * Hoja para mirar e imprimir dentro de la app (28-nov-2026): la pauta APK de un paciente o la lista de
 * pacientes del día del médico. El HTML va en un iframe aislado (srcdoc); «Imprimir» imprime solo la hoja.
 */
export function VisorHoja({ titulo, html, onCerrar }: { titulo: string; html: string; onCerrar: () => void }) {
  const marco = useRef<HTMLIFrameElement>(null);
  return (
    <div className="visor-hoja" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="visor-hoja-cab">
        <b>{titulo}</b>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="btn" onClick={() => marco.current?.contentWindow?.print()}>
            <Printer size={15} aria-hidden /> Imprimir
          </button>
          <button type="button" className="btn" aria-label="Cerrar" onClick={onCerrar}><X size={16} aria-hidden /></button>
        </span>
      </header>
      <iframe ref={marco} className="visor-hoja-marco" title={titulo} srcDoc={html} />
    </div>
  );
}
