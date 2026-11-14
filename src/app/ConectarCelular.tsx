import { useState } from "react";
import { parsearHash } from "../datos/config";

/**
 * El fragmento de configuracion (#config?u=..&a=..) de un texto pegado, o null si no trae la
 * direccion del servidor y la llave de la app.
 */
export function fragmentoDeConfig(texto: string): string | null {
  // WhatsApp y otras apps a veces codifican el «#» (%23) o agregan un punto o paréntesis al final.
  const t = texto.replace(/%23config/gi, "#config").replace(/%3F/gi, "?").replace(/&amp;/g, "&");
  const i = t.indexOf("#config");
  if (i < 0) return null;
  const fragmento = (t.slice(i).trim().split(/\s/)[0] ?? "").replace(/[.,;:)\]>»"'”]+$/, "");
  const h = parsearHash(fragmento);
  return h.apiUrl && h.appToken ? fragmento : null;
}

/** Por qué un texto pegado no sirve, en palabras de la persona. */
export function problemaDelEnlace(texto: string): string {
  const t = texto.replace(/%23/gi, "#");
  if (!t.trim()) return "Pega el enlace para celulares que te enviaron.";
  if (t.includes("#estacion") && !t.includes("#config")) return "Ese es el enlace del PC (estación). Para el celular se usa el «enlace para celulares».";
  if (!t.includes("#config")) return "Ese texto no trae el enlace de configuración. Copia el mensaje completo con el «enlace para celulares».";
  return "El enlace está incompleto: se cortó al copiarlo. Copia de nuevo el mensaje completo (en WhatsApp: mantén presionado y «Copiar»).";
}

/** Cuadro para pegar el enlace de configuracion y conectar este equipo con el. */
export function CuadroEnlace() {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  const conectar = (t: string): void => {
    const fragmento = fragmentoDeConfig(t);
    if (!fragmento) return setError(problemaDelEnlace(t));
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
    <>
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
    </>
  );
}

/**
 * Celular sin conectar. En iPhone la app instalada en la pantalla de inicio no ve lo que se
 * guardo en Safari ni abre enlaces: por eso aqui mismo se puede pegar el enlace de configuracion.
 */
export function ConectarCelular({ mensaje }: { mensaje: string }) {
  return (
    <div className="login">
      <div className="stack" style={{ gap: 12 }}>
        <div className="notice warn">{mensaje}</div>
        <div className="card stack" style={{ gap: 10 }}>
          <b>¿Instalaste la app en la pantalla de inicio?</b>
          <p className="small muted" style={{ margin: 0 }}>Copia el enlace de configuración (en WhatsApp: mantén presionado el mensaje y elige «Copiar») y pégalo aquí.</p>
          <CuadroEnlace />
        </div>
      </div>
    </div>
  );
}

/** La llave de este celular ya no vale (se crearon llaves nuevas): se reconecta pegando el enlace nuevo. */
export function ReconectarCelular() {
  return (
    <div className="card stack" role="alert" aria-label="Llave vencida" style={{ gap: 10, borderColor: "var(--crit, #c0392b)" }}>
      <b>La llave de este celular ya no vale</b>
      <p className="small muted" style={{ margin: 0 }}>El servidor no reconoce la llave de este enlace: se crearon llaves nuevas en el PC (por ejemplo, al «configurar este PC como el primero»), y los enlaces copiados antes dejan de servir. Lo registrado aquí sigue guardado en este celular, no se pierde. Pide el enlace nuevo para celulares (en el PC: Estado), cópialo y pégalo aquí: al conectar, lo pendiente se sube solo.</p>
      <CuadroEnlace />
    </div>
  );
}
