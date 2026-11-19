# 2026-11-19 · Disponibilidad del contenedor de Acueducto

## Evidencia
El único intento corto autorizado tras desplegar #230 (PDD-RCA-01, objetivo ×60, horizonte y paso 1 h) concentró 91.709 ms en `do_ready`, 2 ms en la renovación posterior y 49 ms en TCP. Worker → Durable Object tardó 91.809 ms en total. Fractal devolvió 502 al vencer su espera y el emulador respondió 409 tardío. La sesión quedó pausada en 00:50:00; D1 tenía cero manifiestos y ejecuciones. No se enviaron mandos hidráulicos ni se archivaron estudios.

## Revisión
`starting` deduplicaba solicitudes concurrentes, pero se limpiaba después de un éxito. Por tanto, la siguiente solicitud volvía a recorrer `startAndWaitForPort` y a sondear `/api/health` incluso con el contenedor en marcha. La telemetría identifica la etapa, no el subpaso exacto ni por qué tardó el sondeo en producción.

## Cambio y verificación
Solo Acueducto reutiliza en memoria una comprobación exitosa del puerto si el contenedor sigue en ejecución. El Durable Object vuelve a comprobar después de perder la instancia, al detectar que el contenedor no funciona o tras una excepción de transporte. Se mantiene el sondeo compartido en arranque y la renovación de inactividad; no se repiten POST fallidos. Se conservaron los tiempos, timeout y permisos. Typecheck y 37 pruebas del Worker, incluyendo arranque concurrente, tráfico en caliente, reinicio y transporte fallido sin reenvío duplicado. Falta confirmar en producción con autorización independiente; no se desplegó ni se inició otra cosimulación.
