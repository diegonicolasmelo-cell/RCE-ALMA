import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // La plantilla del REM 28 viaja dentro de la app (se importa con ?inline).
  assetsInclude: ["**/*.xlsx"],
  plugins: [
    react(),
    VitePWA({
      // La app se actualiza sola; los borradores sobreviven a la recarga (ver src/app/persistencia.ts).
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png", "pwa-maskable-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "Kapta CSV · Control de signos vitales",
        short_name: "Kapta CSV",
        description: "Monitorización kinésica a pie de cama · UCI Adulto",
        lang: "es",
        theme_color: "#0b2c5a",
        background_color: "#0b2c5a",
        display: "standalone",
        orientation: "portrait",
        // Relativos: funciona igual en la raiz de un dominio o en un subdirectorio (GitHub Pages).
        // Sin start_url: al instalar, el telefono usa la direccion de la pagina. En iPhone esa
        // direccion trae el enlace de configuracion y la app instalada nace conectada.
        start_url: undefined as unknown as string,
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        navigateFallback: "index.html",
        // Solo se precargan los archivos de la app. Las llamadas a Apps Script (otro dominio)
        // NO pasan por la cache: los datos clinicos viven en IndexedDB, no en la cache del navegador.
        runtimeCaching: []
      }
    })
  ],
  // Ruta base para GitHub Pages (p. ej. "/RCE-ALMA/"). Ver .github/workflows/desplegar.yml.
  base: process.env.VITE_BASE ?? "/",
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url))
    }
  }
});
