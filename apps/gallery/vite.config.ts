import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    name: "gallery-ambient-network",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{ tag: "script", attrs: { type: "module", src: "/src/ambient-network.ts" }, injectTo: "body" }],
    },
  }],
  server: {
    port: 5173,
    host: true,
    fs: { allow: ["../.."] },
    proxy: {
      "/api": { target: "http://localhost:8000", ws: true },
      "/fractal-api": { target: "http://127.0.0.1:8100", changeOrigin: true, rewrite: (path) => path.replace(/^\/fractal-api/, "") },
    },
  },
  preview: { port: 4173, proxy: {
    "/api": { target: "http://localhost:8000", ws: true },
    "/fractal-api": { target: "http://127.0.0.1:8100", changeOrigin: true, rewrite: (path) => path.replace(/^\/fractal-api/, "") },
  } },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { index: "index.html", accessAdmin: "access-admin.html", equipos: "equipos.html", plant: "plant.html", plc: "plc.html", plcMockup: "plc-mockup.html", ciudad: "ciudad.html", aps: "aps.html", emulador: "emulador.html", control: "control.html", arquitectura: "arquitectura.html", resumenPlasticos: "resumen-plasticos.html", apsSalsas: "aps-salsas.html", emuladorSalsas: "emulador-salsas.html", controlSalsas: "control-salsas.html" } },
  },
});
