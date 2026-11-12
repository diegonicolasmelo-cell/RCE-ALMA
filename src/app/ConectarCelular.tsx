import { useState } from "react";
import { parsearHash } from "../datos/config";

/**
 * El fragmento de configuracion (#config?u=..&a=..) de un texto pegado, o null si no trae la
 * direccion del servidor y la llave de la app.
 */
export function fragmentoDeConfig(texto: string): string | null {
  const i = texto.indexOf("#config");
  if (i < 0) return null;
  const fragmento = texto.slice(i).trim().split(/\s/)[0] ?? "";
  const h = parsearHash(fragmento);
  return h.apiUrl && h.appToken ? fragmento : null;
}

/**
 * Celular sin conectar. En iPhone la app instalada en la pantalla de inicio no ve lo que se
 * guardo en Safari ni abre enlaces: por eso aqui mismo se puede pegar el enlace de configuracion.
 */
export function ConectarCelular({ mensaje }: { mensaje: string }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  const conectar = (t: string): void => {
    const fragmento = fragmentoDeConfig(t);
    if (!fragmento) return setError("Ese texto no es el enlace de configuración completo: debe terminar en #config?u=…&a=…");
    // Al recargar con el fragmento, la app guarda la conexion y lo borra de la barra.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${fragmento}`);
    window.location.reload();
  };
  const pegar = async (): Promise<void> => {
    try {
      const t = await navigator.clipboard.readText();
      setTexto(t);
      conectar(t);
    } catch {
      setError("El celular no dejó leer el portapapeles: mantén presionado el cuadro y elige «Pegar».");
    }
  };

  return (
    <div className="login">
      <div className="stack" style={{ gap: 12 }}>
        <div className="notice warn">{mensaje}</div>
        <div className="card stack" style={{ gap: 10 }}>
          <b>¿Instalaste la app en la pantalla de inicio?</b>
          <p className="small muted" style={{ margin: 0 }}>Copia el enlace de configuración (en WhatsApp: mantén presionado el mensaje y elige «Copiar») y pégalo aquí.</p>
          <textarea
            id="enlace-config"
            aria-label="Enlace de configuración"
            rows={3}
            value={texto}
            placeholder="https://…#config?u=…&a=…"
            onChange={(e) => { setTexto(e.target.value); setError(null); }}
            style={{ width: "100%", font: "13px var(--font-data)", padding: 8, borderRadius: 10, border: "1px solid var(--line)" }}
          />
          {error && <div className="notice crit small" role="alert">{error}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={() => void pegar()}>Pegar</button>
            <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => conectar(texto)}>Conectar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
