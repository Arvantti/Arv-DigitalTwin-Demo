# Edición de programación en Operación en vivo

La gráfica del perfil activo se comparte con el editor, sin duplicar IDs ni sliders en vivo. En Operación se carga el perfil de la sesión, no otro borrador seleccionado. El pasado se sombrea y bloquea; hora actual y futuras son editables con selector de curva, arrastre y cuadro numérico. AUTO/MANUAL y la presión MANUAL están junto al gráfico.

Los gestos solo cambian el borrador. **Guardar y aplicar cambios** usa `POST /api/plants/{plant_id}/sessions/{session_id}/edit-active-profile`: valida identidad/propiedad, perfil privado activo, sesión dentro de 24 h, ausencia de programación pendiente, hora esperada y contenido original del perfil. Rechaza cambios a franjas pasadas y ediciones concurrentes/obsoletas.

Los mandos actuales se preparan sobre una copia del estado del modelo, emitiendo solo los valores modificados, sin restablecer overrides ajenos. Después se actualiza el mismo perfil guardado y el estado operativo desde el tiempo real de aplicación. No se vuelve al inicio de la hora. Las horas futuras quedan en el perfil activo y se ejecutan por el mecanismo horario existente. Las plantillas requieren copia previa; no se sobrescriben.

El endpoint corre sin await en el tramo de validación/aplicación del event loop de sesión. Esto evita que avance la franja durante ese tramo dentro del mismo proceso; no es una transacción distribuida entre bases ni un mecanismo multiworker de consenso. Errores de disco/auditoría requieren tratamiento operativo habitual.

La comparación de resultados mantiene sus manifiestos/frames originales. La lista de comparaciones indica `profile_outdated` al no coincidir el hash del perfil actual; no se recalcula ni se relabela historia pasada.

Verificado con 27 pruebas de perfiles/historia/edición en vivo, typecheck/build y prueba Playwright con transporte/perfiles/guardado interceptados. Se comprueba pasado bloqueado, edición actual/futura, confirmación explícita, ausencia de mandos no tocados, eliminación de sliders visibles duplicados y preservación de otros valores.
