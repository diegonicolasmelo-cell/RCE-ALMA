import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/** Compila la app en UN solo script y UNA hoja de estilos, para incrustarlos en una pagina publicada. */
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: { alias: { "@core": fileURLToPath(new URL("./src/core", import.meta.url)) } },
  build: {
    outDir: "dist-artefacto",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: "src/main.artefacto.tsx", formats: ["iife"], name: "UpcPulse", fileName: () => "app.js", cssFileName: "app" }
  }
});
