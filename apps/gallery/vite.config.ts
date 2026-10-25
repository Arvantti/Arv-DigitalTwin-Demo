import { defineConfig } from "vite";

export default defineConfig({
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
    rollupOptions: { input: { index: "index.html", equipos: "equipos.html", plant: "plant.html", plc: "plc.html", ciudad: "ciudad.html" } },
  },
});
