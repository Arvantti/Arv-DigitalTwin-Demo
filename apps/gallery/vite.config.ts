import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    fs: { allow: ["../.."] },
    proxy: { "/api": { target: "http://localhost:8000", ws: true } },
  },
  preview: { port: 4173, proxy: { "/api": { target: "http://localhost:8000", ws: true } } },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: "index.html", plant: "plant.html", acueducto: "acueducto.html" } },
  },
});
