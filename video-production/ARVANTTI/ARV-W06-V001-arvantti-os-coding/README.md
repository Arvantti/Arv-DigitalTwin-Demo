# ARV-W06-V001 · Serie Arvantti OS Coding (9 videos, horizontal 1920×1080 y vertical 1080×1920)

Serie para programadores y líderes técnicos sobre Arvantti OS Coding, la edición de Arvantti OS para equipos de software.
Guiones aprobados por Andy el 2026-11-22 en el documento «Serie Arvantti OS Coding · Guiones»
(https://claude.ai/artifact/D5oKeBB8zw8cqoGoNNQ2v5).

Episodios: 1 Arvantti OS Coding, 2 Organiza · Tasks, 3 Terminales, worktrees y multi arnés, 4 Recuerda · Brain,
5 Controla · Policy y Grants, 6 Protege · Guardianes, 7 Room de concilio, 8 Flujos agénticos y QA, 9 Rinde cuentas · Receipts.

Reglas de la serie:

- Trato de «tú». Hilo común: el martes del proyecto P-07 (software que integra producción, control de piso y finanzas).
- En la voz el nombre se dice «Arvantti Operating System for AI» la primera vez y en la firma. Cada voz se revisa con
  Scribe (`revisar`) antes de renderizar. Siglas escritas como se dicen en `PRONUNCIA` (`armar.mjs`).
- Sello visual: la figura de tres capas con la caja Coding en lavanda (`comun.mjs`). Firma «La IA bajo tu gobierno.»
- Todo se dice personalizable por empresa. Los agentes programan software (APIs), no operan sistemas del negocio.
- Solo marca Arvantti. Sin precios ni licencias, sin LangGraph, nunca «denegar por defecto», cada sigla explicada.
- Solo gráficos animados. Música original sintetizada (`tools/musica.py`), sin servicios externos.

## Estructura

- `armar.mjs`: voz, revisión, composición y render (común a todos los episodios).
- `comun.mjs`: figura, motor de escenas por paneles (cada elemento entra cuando la voz lo nombra), componentes
  (terminal, tarjeta, flujo, escalera, árbol de agentes, rótulos de glosario), sello y firma. `comun.css`: estilos.
- `episodios/<ep>/escenas/<nn-escena>/script.md`: texto de la voz (lo crea `tools/escenas.py` desde el guion exportado).
- `episodios/<ep>/episodio.mjs`: paneles de cada escena; `estilos.css` opcional por episodio.
- `tools/revisar-cuadros.sh <ep> <carpeta>`: hojas de contacto para revisar sin renderizar. `tools/render-todo.sh`: render de todo.

## Producir

```bash
python3 -I tools/musica.py /tmp/m.wav && ffmpeg -i /tmp/m.wav -af loudnorm=I=-18:TP=-1.5 -q:a 0 assets/clips/musica-serie.mp3
node armar.mjs preparar                       # marca recortada (EP= cualquiera)
EP=01-coding node armar.mjs voz --enviar
EP=01-coding node armar.mjs revisar
EP=01-coding node armar.mjs componer && FORMATO=vertical EP=01-coding node armar.mjs componer
V=v001 tools/render-todo.sh 01-coding         # out/01-coding-{horizontal,vertical}-v001.mp4
```

Voz, música, mezclas y renders no van al repo (`.gitignore`). Finales: arvantti-os-coding-epNN-{vertical,horizontal}-vNNN.mp4
en /mnt/coding/Arvantti_Content_Manager/Main/marketing/videos-arvantti/arvantti-os-coding/.
