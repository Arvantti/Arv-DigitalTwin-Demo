# ARV-W05-V001 · Serie Arvantti Fractal (7 episodios, 1920×1080 y 1080×1920, 60 a 90 s)

Guiones aprobados por Andy el 2026-11-23 (https://claude.ai/artifact/SqyWnKnd5x2fDvzCQn1a9c). Hilo: un pedido grande
llega un lunes y la gerente pregunta "¿Lo aceptamos?". Fractal no decide: presenta las mejores opciones y su impacto
para que una persona decida. Cierre: "Arvantti Fractal. Las mejores opciones y su impacto, para que tú decidas."

- Todo es animación propia (sin capturas). Subtítulos quemados con la palabra que suena resaltada.
- `episodios/<ep>/escenas/<NN>/script.md`: voz de cada escena. `episodios/<ep>/escenas.mjs`: escenas y composición.
- `plantilla.html` + `vertical.css` (base) + `episodios/<ep>/estilos.css` y `vertical.css` (propios del episodio).
- Una sola música para la serie (`musica-prompt.txt`, ElevenLabs Music, 100 s); cada episodio la mezcla bajo la voz.

```bash
node armar.mjs musica --enviar                  # una vez para la serie
EP=ep01 node armar.mjs voz --enviar             # solo escenas nuevas o cambiadas
EP=ep01 node armar.mjs componer && EP=ep01 node armar.mjs render v001
FORMATO=vertical EP=ep01 node armar.mjs componer && FORMATO=vertical EP=ep01 node armar.mjs render v001
```

Voz, música, mezcla y renders no van al repo (`.gitignore`).
