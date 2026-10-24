# Escritorio único 3D · PLC · escenarios · historial (desktop)

El acueducto se abre en `plant.html?plant=water-network-scale-v1&workspace=plc`. La barra superior ofrece **3D**, **PLC Y ESCENARIOS** e **HISTÓRICO** sin abrir otra ventana. La escena permanece montada; la HMI preexistente se incorpora como panel en un iframe del **mismo origen** (`plc.html?embedded=1`) mientras se migra su interfaz al módulo del escritorio. Esto mantiene el contrato y el estado del PLC: dos clientes WebSocket comparten `session_id`, no dos simuladores. El panel notifica creación de sesión y estudio al padre mediante `postMessage`, que verifica origen, ventana e ID de planta. El enlace histórico `plc.html` se conserva para compatibilidad, no es el acceso principal.

## Tres tipos de escenario

1. **PDD-RCA-01**: curva diaria 30→100→30 % (24 consignas).
2. **PFL-BASE-01**: 100 % fijo (24 consignas).
3. **Personalizado**: plantilla editable que inicia con viviendas 100 %, ocho fugas cerradas y PRS auto. Se pueden crear **múltiples instancias guardadas con nombre** desde la pantalla Administración de escenarios, cambiar nombre/descripción y editar aperturas globales, por nivel, 64 viviendas y ocho fugas **por hora antes de iniciar el PLC**; también se pueden borrar individualmente. Las plantillas versionadas no se borran ni se sobrescriben. Los antiguos presets nocturno/manual/restricción fueron retirados del catálogo operativo, incluidos los registros sembrados previamente en SQLite (no se tocan perfiles creados por el operador).

Guardar/editar/borrar no envía mandos al PLC. Un perfil activo en una sesión en play no se edita ni borra: se crea otro, y el operador lo **programa** para la siguiente hora. Hasta ese límite, el ID activo publicado por PLC sigue siendo el anterior, y el perfil pendiente se distingue en `/sessions/{id}`; la activación no ocurre por Fractal.

## Gráfica común

En Administración de escenarios se dibuja la evolución de **apertura media de las 64 viviendas** y de las **ocho fugas**, en % con eje izquierdo autoescalado. Las horas vacías conservan los últimos mandos; global→nivel→vivienda sobrescribe de acuerdo con el PLC. La **presión de salida de la PRS**, mca, usa un segundo eje derecho autoescalado. Esta última es un cálculo Fractal independiente bajo demanda desde el perfil **persistido** y los tags **leídos directamente** de una sesión PLC en play y presurizada (`POST /studies/profile-preview/from-plc`). La vista previa no publica estudios ni comandos ni arranca Fractal automáticamente al iniciarse el emulador: solo solicita el cálculo al abrir/elegir un perfil guardado durante play. Puede tardar más de 15 segundos; si no hay PLC en play o el servicio Fractal no está disponible, el eje de presión queda **pendiente y explícito**, nunca sustituido por la consigna crítica. Un borrador editado invalida la curva de presión anterior hasta que se guarde y recalcule. La presión proyectada no certifica la dinámica de niveles/tanques (validación pendiente).

## Pasado independiente del presente

El historian guarda un fotograma 3D operativo cada ≥60 segundos simulados en SQLite, separado de los tags. `GET /sessions/{id}/historian/frame?at_t=...` devuelve el fotograma más cercano **solo dentro del tiempo registrado**. El control HISTÓRICO deja de pintar mensajes vivos, **pero no pausa, reprograma ni rebobina la sesión PLC**: los nuevos mensajes se reciben y se conservan en memoria, y VOLVER AL PRESENTE pinta el último. El 3D de futuro Fractal sigue separado y rotulado «FUTURO SIMULADO · NO APLICADO». La historia no recrea fotogramas anteriores a esta migración de schema; autorización y política de retención/volumen son pendientes de producción.

## Relojes y límites

Una corrida continua poscorrección de 24 h tardó **2596,71 s reales** de cómputo offline a paso físico de 1 s. Se reprodujo después a razón de **15 s reales por hora** (24 muestras en 360,004 s, desvío máximo de marca <0,01 s); esto **no** acredita el rendimiento de la sesión PLC en vivo a ×240. Informe: `validation/pdd-rca-01-continuous-post-cache.json`; marcas: `validation/pdd-rca-01-replay-240x.json`. La diferencia máxima de suministro siguió siendo **34,268 puntos porcentuales** en la hora 18, sin desacuerdos con la presión crítica mínima de 15 mca. El horizonte de niveles sigue **no validado dinámicamente**, optimización apagada. Antes del despliegue público deben existir un proxy HTTPS/WSS para ambas APIs, autorización por sesión, retención de frames y pruebas de rendimiento; Gallery estática sola no los proporciona.
