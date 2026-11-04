import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Ruta base para GitHub Pages. Ver docs/PLAN-MAESTRO.md cap. 1.
  base: process.env.VITE_BASE ?? "/",
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url))
    }
  }
});
