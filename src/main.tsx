import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import "./estilos.css";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Falta el elemento #raiz");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker: instalable y utilizable sin senal. Se actualiza solo.
registerSW({ immediate: true });
