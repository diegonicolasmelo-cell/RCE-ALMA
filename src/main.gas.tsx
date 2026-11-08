import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { fijarContextoAppsScript, googleScript, ubicacionExterna } from "./datos/gas";
import "./estilos.css";

/**
 * Arranque cuando la pagina la sirve Google Apps Script. Sin service worker (el iframe de
 * Google no lo permite). Antes de montar la app se copia el fragmento de la barra de afuera
 * (#estacion, #config?a=...) al iframe, para que la app lo lea como siempre.
 */
async function arrancar(): Promise<void> {
  const gs = googleScript();
  const afuera = await ubicacionExterna(gs);
  fijarContextoAppsScript(gs ? { demo: afuera.parametros["demo"] === "1", parametros: afuera.parametros } : null);
  if (afuera.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${afuera.hash}`);
  const raiz = document.getElementById("raiz");
  if (raiz) createRoot(raiz).render(<StrictMode><App /></StrictMode>);
}

void arrancar();
