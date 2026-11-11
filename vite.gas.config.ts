import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/** Compila la app en UN script y UNA hoja de estilos para servirla desde Google Apps Script. */
export default defineConfig({
  // La plantilla del REM 28 viaja dentro de la app (se importa con ?inline).
  assetsInclude: ["**/*.xlsx"],
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: { alias: { "@core": fileURLToPath(new URL("./src/core", import.meta.url)) } },
  build: {
    outDir: "dist-gas/compilado",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: "src/main.gas.tsx", formats: ["iife"], name: "UpcPulse", fileName: () => "app.js", cssFileName: "app" }
  }
});
