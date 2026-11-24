# ARV-W07-V001 · Serie Arvantti · Sistema empresarial completo (7 episodios + gran resumen)

Guiones aprobados por Andy (7 episodios: https://claude.ai/artifact/11FCfBPBdrAq8i2ahfLwJW; gran resumen:
https://claude.ai/artifact/2ikThBrAafmXtKmxXWVz4K). Hilo: la junta directiva pregunta "Si la demanda sube el próximo
trimestre, ¿nos alcanza la planta, el inventario y la caja?". Cierre: "Arvantti. Gobierna tu IA, entiende tu operación
y decide mejor." Misma estructura y herramientas que ARV-W05-V001-serie-fractal (armar.mjs, viz.mjs, comun.mjs).

```bash
EP=ep01 node armar.mjs voz --enviar
EP=ep01 node armar.mjs componer && EP=ep01 HF_ARGS="--workers 4" node armar.mjs render v001
FORMATO=vertical EP=ep01 node armar.mjs componer && FORMATO=vertical EP=ep01 HF_ARGS="--workers 4" node armar.mjs render v001
```

Finales: /mnt/coding/Arvantti_Content_Manager/Main/marketing/videos-arvantti/ecosistema/
