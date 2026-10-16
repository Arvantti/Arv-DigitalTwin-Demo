---
name: new-equipment
description: Crea o ajusta un tipo de equipo de la librería del gemelo digital (equipment-library/) a partir de fotos, catálogos, placas de datos o una descripción en lenguaje natural. Úsala cuando pidan agregar una máquina, tanque, transportador u otro equipo al gemelo, crear una variante o un preset, o representar "esta máquina" que el usuario describe o muestra.
---

# Crear un tipo de equipo

Siga el procedimiento completo de `docs/equipment-authoring.md`. Resumen operativo:

1. **¿Tipo nuevo o preset?** Ejecute `uv run twin-lib list`. Si es otro tamaño o configuración de un tipo existente, basta un preset: haga solo el bloque A de la entrevista y salte al paso 6.
2. **Entrevista (sección 1 de la guía). No escriba código todavía.**
   - Lea primero lo entregado (fotos, catálogo, placa) y no pregunte lo que ya está ahí.
   - Pregunte como máximo 5 cosas por mensaje, en lenguaje cotidiano, por bloques: A identidad, B operación, C fallas y calidad, D medición, E apariencia. Adapte cada bloque a lo respondido.
   - Acepte "no sé": proponga un valor típico marcado como `assumed`. Nunca presente un supuesto como dato del usuario.
   - Presente la **ficha** (dato | valor | origen) y pida confirmarla una sola vez. Al confirmarla, pásela al `FICHA.md` de la carpeta del equipo (paso 3).
3. **Copie la plantilla:** `cp -r equipment-library/_template equipment-library/<tipo>` y reemplace `template-machine` por `<tipo>`. La plantilla trae `FICHA.md` para llenar con la ficha confirmada.
4. **Contrato** `equipment.yaml`: parámetros con unidades y rangos, estados estándar, variables medibles con ruido, 2 a 5 fallas con MTBF/MTTR, canales de animación.
5. **Comportamiento** `behavior.py` con las primitivas de `twin_runtime.primitives`. Conserve masa y energía, respete los límites físicos y haga que la calidad dependa de las condiciones.
6. **Presets y escenarios.** Calcule a mano los valores esperados antes de correr la simulación.
7. **Geometría** `geometry.ts` con `parts` y `materials` de `@twin/3d`: proporciones de catálogo, biseles, materiales correctos, seguridad e instrumentación, movimiento ligado a los canales.
8. **Verifique:**
   - `uv run twin-lib validate <tipo>`
   - `uv run pytest equipment-library/<tipo>`
   - `pnpm -r typecheck`
   - Captura con `tools/preview/shot.sh <tipo> <preset> /tmp/<tipo>.png` (después de `pnpm gallery:build` y `pnpm --filter @twin/gallery preview`). Lea la imagen, compárela con las referencias del usuario e itere.
9. **Reporte al usuario:** qué se creó, qué datos son supuestos, la captura, cómo verlo en la galería y cualquier diferencia con la ficha.
