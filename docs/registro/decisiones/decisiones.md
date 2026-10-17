---
tipo: decisiones
tags: [registro, decision]
actualizado: 2026-10-17
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

## D12 · Caudal por enlace en el motor; la escena solo lo dibuja · 2026-10-16 21:31
El autor aprobó que el motor publique el caudal de cada enlace y que las tuberías de la escena se animen con él. El motor deja el estado de cada enlace en `snapshot.links` (ya con `max` aplicado); el vapor, que se entrega a pedido, circula con la demanda del destino mientras haya presión. La API asocia cada tubería del plano con los enlaces que la cruzan y la escena no calcula caudales, solo los muestra. Los tramos que el motor no simula conservan el indicio por estado. Ningún valor de tolerancia interviene (regla D07).

## D13 · El desvío regresa a la marmita; una bomba compartida atiende a una marmita a la vez · 2026-10-16 22:08
El autor aprobó enlazar el desvío del pasteurizador en el motor y en la escena. Se modeló lo que ocurre en la planta: el producto que no alcanza la temperatura de retención vuelve a la marmita que está descargando (y, si descargan las dos, a cada una en proporción a su caudal), no sale del modelo. Para que eso no cree masa, las dos marmitas comparten la bomba y solo una descarga a la vez; la otra espera. Ningún valor de tolerancia interviene (regla D07). La planta de inyección se hace en un PR aparte.

## D14 · Planta de inyección: simular las 29 inyectoras y la banda; lo demás, cuando tenga tipo · 2026-10-16 22:31
Al ser la planta de inyección el segundo punto de lo aprobado a las 22:08, se eligió el alcance por defecto: simular todas las inyectoras del plano y la banda principal, que son los equipos que ya existen en la librería, y dejar el empaque, secadores, chillers y molinos como volúmenes hasta que se creen sus tipos. Las inyectoras se parametrizan desde el `plant.yaml` para que el plano siga siendo la fuente de verdad. La zona de entrada de la banda (8 piezas) es un supuesto. Ningún valor de tolerancia interviene (regla D07).

## D15 · Acueducto a escala: diseño primero y solucionador hidráulico en el motor · 2026-10-17 00:21
El autor pidió una tercera planta: un acueducto a escala. Se entrega primero el diseño para su revisión (`docs/water-network-plant.md`), con supuestos marcados (S1–S7): rejillas de 4 × 4 válvulas de consumo y 2 de fuga por nivel, 4" hasta la estación reguladora y 2" en la red, 80 mca en bombas y 20 mca en la válvula más crítica. Como el caudal de cada válvula depende de la presión de toda la red, el motor de planta gana un dominio hidráulico (método del gradiente global) en vez de pasar magnitudes enlace por enlace; se descartó modelar la red como un solo equipo porque impediría seleccionar y reutilizar cada equipo. Las bombas son genéricas (multietapa vertical) por la regla de no usar marcas reales. Tolerancias de control en % de la consigna (D07).

## D16 · Equipos de inyección: tipos propios, el empaque aparte y sin cascada todavía · 2026-10-17 00:54
El autor aceptó modelar con geometría propia el empaque, los secadores, los chillers y los molinos de la planta de inyección. Se crearon `desiccant-dryer`, `chiller`, `granulator` y `packing-station`, simulados en la planta. Decisiones de diseño: (1) el empaque es un tipo propio y no parte del tipo combinado `workstation` de la ficha 23, porque recibe de una banda y cuenta cajas y tarimas; las demás estaciones manuales siguen pendientes. (2) Secadores, chillers y molino se simulan sin enlace con las inyectoras (la humedad de la resina, el agua de moldes y el scrap hacia el molino son la cascada de una entrega posterior); el chiller usa una carga nominal y el molino una alimentación nominal. (3) El «molino» de la planta de inyección es el granulador (`granulator`); el molino coloidal de salsas sigue pendiente. (4) Los datos que el plano no da (residencia de la tolva, COP, vida de las cuchillas, ritmo del operario) se marcan `assumed` en las fichas. Las pasarelas de la nave quedan fuera de este hilo. Ningún valor de tolerancia interviene (regla D07).

