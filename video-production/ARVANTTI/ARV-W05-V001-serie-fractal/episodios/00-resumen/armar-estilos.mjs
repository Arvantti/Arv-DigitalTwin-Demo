#!/usr/bin/env node
// Arma estilos.css y vertical.css del resumen: toma los estilos de cada episodio y los acota a la escena del resumen
// que los usa (#s01…#s15), para que clases con el mismo nombre en episodios distintos no se pisen.
// Después agrega propios.css y propios-vertical.css (ajustes del resumen).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EPS = path.join(HERE, "..");
// escena del resumen -> [episodio fuente, id de la escena en ese episodio]
const MAPA = {
  s01: ["ep01", "e-pedido"], s02: ["ep01", "e-areas"], s03: ["ep01", "e-fractal"], s10: ["ep01", "e-producto"],
  s04: ["ep02", "e-reglas"], s05: ["ep02", "e-iaopt"], s06: ["ep02", "e-evol"], s09: ["ep02", "e-obj"],
  s07: ["ep03", "e-dados"], s08: ["ep03", "e-rango"],
  s13: ["ep04", "e-alt"], s12: ["ep05", "e-reg"], s11: ["ep06", "e-mez"],
  s14: ["ep07", "e-exp"], s15: ["ep07", "e-dec"],
};

function acotar(css, sid, orig) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(",").map((s) => s.trim()).filter(Boolean).flatMap((s) => {
      if (s.startsWith("#e-")) return s.startsWith(`${orig} `) || s === orig ? [s.replace(orig, `#${sid}`)] : [];
      return [`#${sid} ${s}`];
    });
    if (sels.length) out.push(`${sels.join(",")}{${m[2].trim()}}`);
  }
  return out.join("\n");
}

for (const [archivo, propio] of [["estilos.css", "propios.css"], ["vertical.css", "propios-vertical.css"]]) {
  const partes = [`/* Generado por armar-estilos.mjs: no editar a mano (cambios en ${propio}). */`];
  for (const [sid, [ep, orig]] of Object.entries(MAPA)) {
    const f = path.join(EPS, ep, archivo);
    // En vertical, la base vertical de la serie va antes que la del episodio, con la misma precisión que los estilos acotados.
    if (archivo === "vertical.css") partes.push(`/* ${sid} ← base vertical */\n${acotar(fs.readFileSync(path.join(EPS, "..", "vertical.css"), "utf8"), sid, orig)}`);
    if (fs.existsSync(f)) partes.push(`/* ${sid} ← ${ep} */\n${acotar(fs.readFileSync(f, "utf8"), sid, orig)}`);
  }
  const p = path.join(HERE, propio);
  if (fs.existsSync(p)) partes.push(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(path.join(HERE, archivo), `${partes.join("\n")}\n`);
  console.log(`${archivo}: ${partes.length - 1} bloques`);
}
