# Progreso de motores y edición directa de escenarios

## Progreso medido

Las tarjetas PLC/Cosimulador/Fractal tienen indicadores independientes. Planta Real muestra la franja de las 24 horas y su reloj. El progreso del cálculo avanza con callbacks al completar horas del solver; no se estima a partir de segundos transcurridos. Optimización distingue búsqueda de apertura y verificación frente al perfil base, reservando 100 % para respuesta final guardada.

El ledger SQLite de progreso guarda fase, contador y tiempo calculado, no resultados hidráulicos ni credenciales, y expira en una hora. El identificador aleatorio se consulta junto con planta/sesión; el gateway mantiene validación de propiedad de sesión. La API del modelo permite al motor recuperar progreso de un trabajo. Modelos sin ese soporte conservan estado indeterminado.

Los servicios existentes deben reiniciarse para servir los nuevos endpoints; una operación que comenzó sin identificador de seguimiento no recibe progreso retroactivo. No se reinician servicios con cálculos activos solo para cambiar la UI.

## Gráfica del escenario

La quinta serie, rosa discontinua, representa apertura VRP AUTO; mantiene la última consigna definida y no supone un valor previo a la primera. Puntos seleccionables y arrastrables, edición numérica en cuadro contextual. Los cambios actualizan el borrador: Guardar en archivo conserva los datos. Plantillas y horas ya iniciadas mantienen sus restricciones. Arrastrar no envía mandos PLC.

## Gauges

Se limpia el contexto de estudio al cambiar de sesión, evitando pedir frames de un estudio ajeno. El estudio inválido se descarta al consultar los estudios de la sesión actual. Gauges presentan Emulador (Real), Cosimulado y Optimizado; fuentes ausentes quedan sin lectura. La comparación vinculada se consulta por su identificador y solo se toman instantes coincidentes. Evaluación Fractal base no se etiqueta como optimización.

## Verificación y alcance

Typecheck/build de Gallery y typecheck Worker correctos. 90 pruebas existentes de APIs/motores y pruebas adicionales de ledger, fase, ámbito y fallo. Ruff y diff-check correctos. La curva VRP se probó con datos de navegador no persistidos.

Pendiente de revisión integral de UX: el usuario solicita que el panel temporal represente Emulador, futuro cosimulado y optimizado con slider común, en lugar de presentarse como panel exclusivo de Fractal. No se afirma validación final de ese rediseño en este checkpoint.
