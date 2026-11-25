// Une los estilos de los episodios 1 a 7 (cada uno anidado bajo .eN) con los propios del gran resumen.
// Uso: node unir-css.mjs  (escribe estilos.css y vertical.css; ejecutar antes de componer)
import fs from "node:fs";
const leer = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
for (const [salida, base, propio] of [["estilos.css", "estilos.css", "propio.css"], ["vertical.css", "vertical.css", "propio-vertical.css"]]) {
  let css = "/* Generado por unir-css.mjs: no editar a mano. */\n";
  for (let n = 1; n <= 7; n++) css += `.e${n}{\n${leer(`../ep0${n}/${base}`)}\n}\n`;
  css += leer(propio);
  fs.writeFileSync(salida, css);
}
console.log("estilos.css y vertical.css del gran resumen escritos.");
