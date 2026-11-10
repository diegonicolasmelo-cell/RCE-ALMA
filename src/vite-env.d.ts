/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** URL del web app de Apps Script (/exec). Sin ella la app funciona en modo local. */
  readonly VITE_API_URL?: string;
  /** Token de aplicacion (celulares y PC). NO es el token de estacion. */
  readonly VITE_APP_TOKEN?: string;
  /** Plantilla del enlace a Sinapse, con {rut}, {rutPuntos}, {cuerpo} y {dv}. */
  readonly VITE_SINAPSE_URL?: string;
  /** "1" en la PWA publicada: sin enlace de configuracion no abre la demostracion (salvo ?demo=1). */
  readonly VITE_EXIGIR_CONFIG?: string;
}
