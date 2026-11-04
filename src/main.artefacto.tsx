import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./estilos.css";

// Version para ver la app dentro de una pagina publicada: sin service worker.
const raiz = document.getElementById("raiz");
if (raiz) createRoot(raiz).render(<StrictMode><App /></StrictMode>);
