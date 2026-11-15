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

## v006 (2026-11-05)

Correcciones pedidas por Andy sobre v005:
- 1:29: "Integrator" se envía a la voz como "Íntegreitor" (`PRONUNCIA`); los subtítulos siguen diciendo Integrator.
- 3:11 y 4:40: el recuadro ámbar se movía separado de la captura (la captura tenía un leve zoom y el recuadro no).
  Ahora ambos van en la misma capa. Se revisaron a mano los 105 recuadros del video: ninguno tacha texto.
- 6:34: la escena ya no habla de 1.240 h (ese dato no estaba en pantalla); dice que con la inyectora veinte la
  ocupación baja al 60,7 % y señala IMM-20 montando el molde de balde.
- 3D: las tomas del gemelo son recorridos de cámara que acercan y rotan (vista de planta al inicio, IMM-01 en el
  escenario 2, IMM-21, IMM-20 y el cambio de molde completo en el escenario 3, con grúa, carro y operario).
- 12:51–13:17: las franjas de colores venían de una captura JPG leída como PNG; corregido.
- Sin cuadros blancos ni destellos (revisión de brillo a 2 cuadros por segundo). Duración: 1184 s.

## v007 (2026-11-06)

Capítulo nuevo "Cargar los datos a mano", pedido por Andy: segmentos 1-S03b a 1-S03f del escenario 1, entre el plan
manual en el centro de control y el cálculo con el cosimulador (3:27 a 5:20). Muestra la pestaña ⚙ CONFIGURACIÓN
del APS: agregar un pedido, montar el molde de balde en la inyectora 20 (y el rechazo en la 8, de 80 t), mover y
reordenar tarjetas en la secuencia, guardar la versión y usarla en la planta.
- Solo esos cinco segmentos fueron a ElevenLabs (1.781 caracteres); el resto de la voz salió del caché sin cambios.
- Material: `grabar.cjs 7 --video --hd` (assets/grabacion/configuracion/).
- Cifras como salen en pantalla: 10 pedidos tarde al agregar el pedido, 9 al montar el molde en la inyectora 20.
- Sin cuadros blancos en el tramo nuevo (brillo máximo 44,7 de 255 a 2 cuadros por segundo). Duración: 1302 s.

## Aprobación humana

```text
[ ] El claim es correcto.
[ ] La explicación se entiende sin contexto adicional.
[ ] La locución y el montaje están sincronizados.
[ ] La marca se usa correctamente.
[ ] El audio es aceptable.
[ ] La versión está lista para el canal indicado.
```
