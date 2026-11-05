# QA · ARV-W01-V001-demo-plasticos

## v001 · preview con TEMP_AUDIO (2026-11-04)

- Formato: 1920×1080, 25 fps, unos 16,3 min (978 s), 8 capítulos y 61 segmentos.
- `hyperframes lint`: 0 errores. Quedan avisos de estructura (cada escena podría ir en una subcomposición) y de
  tamaño del archivo; no afectan el render.
- Revisión de cuadros (`hyperframes snapshot`): intro con logo, tarjeta de capítulo, tramo del recorrido del
  cosimulador calculando, captura con zoom, captura de página completa recorrida de arriba abajo y tabla de ahorro.
- Render: `out/demo-plasticos-v001.mp4`, 978,3 s, H.264 1920×1080 a 25 fps con AAC; unos 37 min de render en 4 CPU.
  Voz con media de −23,6 dB y pico de −3 dB (tramo de 60 a 180 s).
- Audio: voz local de prueba (Kokoro `em_alex`), marcada `TEMP_AUDIO` en pantalla. **No es entrega final.**
- Pendiente: voz de ElevenLabs por capítulo, `alinear`, `componer` y render v002; revisar cortes por segmento.
- Tipografía: Inter instalada en el sistema; Orbit e IBM Plex Mono no están en el kit local, caen a la genérica.

## v003 · voz de ElevenLabs, música, cursor y focos (2026-11-04/05)

Correcciones pedidas por Andy sobre la v002:

- Flasheos de otras pantallas (OEE, pedidos, blanco): los clips arrancaban mientras cargaba la página. Ahora empiezan con
  la página cargada y se cortan antes del primer cuadro en blanco; revisión automática cuadro a cuadro sin cuadros
  blancos ni saltos que vuelvan a la misma pantalla.
- Apertura: nombra los cinco escenarios (tarjeta) y presenta los módulos de Arvantti Digital Twin con el gemelo al
  centro, en el orden oficial, antes de mencionar Fractal.
- Escenario 1: programación manual con las herramientas de Arvantti, importación desde Excel o integración ERP/API con
  el asistente de IA (tarjeta); animación del cosimulador (4.877 variables, 0,8 s); A y B señalados; antes y después
  al adoptar en la etiqueta VIGENTE; 61,3 % del centro de control señalado.
- Regla general: ninguna pantalla quieta. Cursor visible y zoom en cada clic; cada dato que dice la voz tiene zoom,
  recuadro y rótulo en el segundo en que se dice (alineación por carácter de ElevenLabs).
- Cifras del guion igualadas a lo que muestra la demo hoy (insumos del escenario 1, ocupación del escenario 4).
- Pestaña Fractal del APS rediseñada (más legible) y regrabada.
- Música: dos pistas épicas de ElevenLabs Music, encadenadas y con sidechain bajo la voz (unos 16 dB por debajo).
- Duración: 1170 s (19,5 min).

## Aprobación humana

```text
[ ] El claim es correcto.
[ ] La explicación se entiende sin contexto adicional.
[ ] La locución y el montaje están sincronizados.
[ ] La marca se usa correctamente.
[ ] El audio es aceptable.
[ ] La versión está lista para el canal indicado.
```
