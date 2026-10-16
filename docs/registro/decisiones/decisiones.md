---
tipo: decisiones
tags: [registro, decision]
actualizado: 2026-10-16
---
# Decisiones y reglas del autor

Índice: [[00-indice]] · Bitácora: [[bitacora]] · Plan: [[plan-del-proyecto]]. Cada decisión cita al autor (Carlos Andrés Quiceño) y la fecha en UTC.

## D01 · Dos plantas de referencia: discreta y de procesos · 2026-10-16 01:28
Primero una planta de inyección de plástico y otra de salsas de tomate «para poder representar manufactura discreta y manufactura de procesos». Inspiradas en dos empresas de Medellín **sin decir el nombre de la empresa** (01:29); el repositorio no usa marcas ni nombres reales.

## D02 · Librería de equipos estandarizados en una carpeta del repo · 2026-10-16 04:06–04:11
Todos los equipos como piezas de código configurado y reutilizable. Va en una carpeta del repositorio (`equipment-library/`), no en una rama aparte (opción 2). Sin depender de Blender. Realismo alto con referencias visuales del autor (04:12).

## D03 · Creación de equipos por usuarios vía conector MCP, como fase tardía · 2026-10-16 05:02
La creación de equipos nuevos será con un conector MCP entre Claude y la herramienta (fase 7). Se diseña desde ahora para que sea una capa delgada (operaciones como funciones de librería, borradores separados, trazabilidad). Antes de crear un equipo se hace una entrevista y una ficha confirmada (05:07–05:08).

## D04 · Método de merge: merge commit · 2026-10-16
Los PR #1 a #6 se fusionaron con merge commit. El autor aprueba cada PR antes del merge.

## D05 · Salsas en sachet de 250, 500 y 1.000 ml · 2026-10-16 12:50–13:15
Las salsas se envasan en bolsas sachet y no en botellas; tamaños de 250 ml y 1.000 ml, luego también 500 ml. Las máquinas son sachetadoras verticales. El autor confirmó la ficha a las 13:19.

## D06 · Siguiente paso: motor de planta, no cascada de inyección · 2026-10-16 15:11
Se eligió la fase 4 (motor de planta) para que la línea corra de punta a punta con efectos en cadena, antes de completar los equipos auxiliares de la planta de inyección.

## D07 · Tolerancia de peso en porcentaje relativo a cada presentación · 2026-10-16 16:46
La tolerancia de peso/dosificación se expresa como porcentaje del nominal de cada paquete (sachet, 1.000 ml, etc.), no en gramos ni mililitros fijos. Implementado en el PR #6.

## D08 · Modelos de IA por tipo de tarea · 2026-10-16 16:47
Hilos por defecto en Haiku 5.5 (explicaciones y tareas simples); Sonnet 5.5 para programación de complejidad media; Opus 5.5 para razonamiento avanzado o diseño nuevo. El coordinador del proyecto corre en Opus 5.5.

## D09 · Registro de software en Colombia · 2026-10-16 17:15
«Muy importante» dejar en el repo el plan en Markdown, los avances de su ejecución y el histórico de conversaciones con la IA, porque la legislación colombiana lo exige para registrar el software. Todo hilo que haga cambios actualiza la bitácora y el histórico ([[como-actualizar]]). Las notas deben ser compatibles con Obsidian (17:16).

## D10 · Fase 5 en un PR pequeño: lo que ya existe en datos · 2026-10-16 18:32
Tras fusionar el motor (#5) y la tolerancia en % (#6), el autor aprobó arrancar la fase 5. La primera entrega dibuja lo que `plant.yaml` y `simulation.yaml` ya describen: zonas, equipos (simulados con su geometría, el resto como volúmenes) y el puente grúa. Pasarelas y tuberías animadas quedan para PR siguientes porque el plano aún no los describe. El PR se apila sobre #7 para actualizar la bitácora sin conflictos.

## D11 · Pasarelas como datos del plano; tuberías derivadas de los flujos · 2026-10-16 19:25
El autor aprobó completar los pendientes de la fase 5. Como el plano no describía pasarelas, se definió la sección opcional `walkways` del `plant.yaml` (eje, ancho, elevación y accesos), validada junto con el resto del layout. Las tuberías no se duplican en el plano: se derivan de los flujos `piped: true`, y su animación es un indicio por estado hasta que el motor publique el caudal de cada enlace.
