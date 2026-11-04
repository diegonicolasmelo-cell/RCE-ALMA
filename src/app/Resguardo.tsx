import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Si algo de la pantalla falla (p. ej. un borrador de una version anterior), en vez de
 * quedar en blanco se ofrece descartar los borradores y volver a las camas.
 */
export class Resguardo extends Component<{ children: ReactNode; onDescartar: () => Promise<void> }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  override componentDidCatch(e: unknown, info: ErrorInfo): void {
    console.warn("Pantalla recuperada tras un error:", e, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="login" role="alert">
        <h2 style={{ margin: 0 }}>No se pudo mostrar esta pantalla</h2>
        <p className="ink2">Suele pasar con un control a medio llenar guardado por una versión anterior de la app. Los controles ya guardados no se pierden.</p>
        <button type="button" className="btn primary grande" onClick={() => void this.props.onDescartar().then(() => this.setState({ error: null }))}>
          Descartar lo que estaba a medio llenar y volver a las camas
        </button>
        <p className="small muted">Detalle: {this.state.error}</p>
      </div>
    );
  }
}
