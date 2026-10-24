---
tipo: historico-ia
fuente: sesión de código con asistente IA (pi)
desde: 2026-10-24 20:08 UTC
hasta: 2026-10-24 20:08 UTC
tags: [registro, historico-ia, acueducto, recirculacion]
---
# Balance de inventario y control de recirculación

## Autor — 2026-10-24 UTC

> Esto es un circuito cerrado. Entonces los dos tanques deben tener la capacidad de recibir el agua del tanque de alimentación, más el agua que hay en las tuberías.
>
> Cuando el sistema inicia, ¿hay un instante de tiempo en el que las tuberías están vacías o no? ¿O estamos asumiendo que las tuberías siempre tienen agua? Yo pienso que el estado es que las tuberías siempre tienen agua. ¿Por qué? Porque cuando se termina la simulación o la emulación, lo que se hace es que se cierran las válvulas de todo el sistema, sí, después de haber apagado las bombas.
>
> Entonces me parece que hay que hacer un tema de balance de lo que reciben los tanques de retorno, versus la capacidad que tiene de enviar el tanque de alimentación. Finalmente la velocidad de m³/h debe ser estable con el buffer de acumulación que tienen los tanques.
>
> Para eso son los sensores que dicen: cuando los tanques de abajo de los retornos lleguen a un 40%, encienda la bomba porque se va a quedar sin agua arriba. No, pero creo que eso no debe ser una condición. La condición que debe mandar es el tanque de alimentación. Si ese tanque de alimentación está por debajo del 30% de 3,888 m³, el sistema de recirculación tiene que activarse y llenar ese tanque para que no quede vacío.
>
> Hay que hacer un balance ahí porque mientras ese tanque se está vaciando, los de retorno se van llenando y el otro se va vaciando hasta que llega a su 30%. En ese momento los tanques de retorno activan las bombas y tiene que haber un punto de no saturación, ¿cierto?, de que los tanques de retorno, habiendo estado el de alimentación en su 30%, no se vayan a rebozar.
>
> Sí entonces hay que mirar qué condición pasa: si el 30% del tanque de alimentación se cumple primero o el tope del nivel superior de los tanques de retorno se dispara primero. Porque si se llenan y la bomba todavía está trabajando, la del circuito de alimentación, entonces las bombas de retorno tienen que obligatoriamente enviarle, y a una velocidad mucho mayor que la del sistema, para poder ganar ventaja.

## Asistente — 2026-10-24 UTC

> Sí. **Tu razonamiento de balance es el correcto**, y revela algo que no habíamos separado bien: *capacidad de los tanques*, *agua almacenada* y *agua que permanece dentro de las tuberías*.
>
> **Sobre las tuberías:** el modelo actual resuelve la red como si las tuberías ya estuvieran llenas. No simula un arranque con tubos vacíos ni el proceso de cebado o vaciado. Mantenerlas llenas después de apagar bombas y cerrar válvulas es una condición inicial razonable, pero **el volumen de agua dentro de ellas todavía no se contabiliza explícitamente como inventario**. Tampoco debo afirmar que el apagado y cierre en ese orden ya esté implementado: habría que verificar esa secuencia por separado.
>
> Con el inventario **que sí contabiliza hoy el modelo**, ocurre esto:
>
> ```text
> Al inicio:
>   Suministro: 70 % de 3,888 = 2,722 m³
>   Retornos:   40 % de 4,512 = 1,805 m³
>   Total en tanques:              4,526 m³
> ```
>
> Si, hipotéticamente, el suministro bajara al **30 %** y toda esa agua llegara a los retornos:
>
> ```text
>   Suministro: 1,166 m³
>   Retornos:   3,360 m³ → 74,5 % de su capacidad conjunta
> ```
>
> **En ese caso, el 30 % del suministro se alcanza antes de llenar los retornos.** Hay espacio para encender la recirculación. Pero no basta mirar el porcentaje *conjunto*: uno de los retornos podría llenarse antes que el otro.
>
> Por eso estoy de acuerdo con tu propuesta de control, con una protección adicional:
>
> 1. **Demanda principal:** arrancar recirculación cuando el suministro baje al **30 %**.
> 2. **Protección independiente:** arrancar antes si **cualquiera** de los retornos se aproxima a su nivel alto, para evitar rebose.
> 3. **Protección de las bombas de retorno:** no bombear desde un tanque vacío.
> 4. **Parada con histéresis:** detener el llenado al alcanzar un nivel superior definido del suministro, no justo al volver a superar 30 %, para evitar arranques y paradas continuos.
> 5. Comprobar que el **caudal real de retorno supere al caudal de salida** mientras se intenta recuperar el nivel; la capacidad nominal de la bomba por sí sola no lo garantiza.
>
> Hay un detalle importante respecto a tu idea anterior de **arrancar con el suministro al 100 %**: si los retornos siguieran al 40 %, habría **5,693 m³** almacenados en tanques. Cuando el suministro bajase al 30 %, los retornos necesitarían contener **4,526 m³**, pero solo admiten **4,512 m³**. Es decir, **se llenarían antes de llegar al 30 %**, incluso sin contar el volumen de las tuberías. En ese estado inicial, la protección por nivel alto de retorno sería imprescindible.
>
> Yo establecería este **balance de inventario y eventos de control** como requisito común del emulador y Fractal, y después mediría en cuál instante se activa primero cada condición. La lógica actual, centrada en que los retornos alcancen un umbral de arranque, **no corresponde a la prioridad operativa que acabas de definir**.

## Autor — 2026-10-24 UTC

> vale hagamos lo que propones

## Asistente — 2026-10-24 UTC

Se implementó la política en emulador y Fractal sin compartir solver: suministro ≤30 % o cualquiera de los retornos ≥90 % solicita el bombeo, con paro por suministro ≥90 % o retorno medio <20 %. Se incluyeron balance, pruebas de disparadores y documentación de los límites: las tuberías se presumen llenas pero su volumen no se integra como depósito; la parada secuencial de válvulas no está implementada. El contraste de 24 horas sigue pendiente y la optimización apagada.

Herramientas (resumen): lectura de contrato/solver/esquema, comparación de inventarios, edición de código/YAML/pruebas/registro, Ruff/pytest y contraste continuo PLC vs Fractal. No se consultaron credenciales.

## Autor — 2026-10-24 UTC

> DAME UNA GRAFICA DE LA DIFERENCIA PORCENTUAL EN CADA HORA EMULADOR VS FRACTAL HIDRAHULICO

## Asistente — 2026-10-24 UTC

Se entregó una gráfica de barras de los 24 niveles del tanque de alimentación, con la diferencia **Fractal − emulador en puntos porcentuales**, ambos valores porcentuales y procedencia `pdd-rca-01-continuous-supply-priority.json`. Máximo +19,276 pp en hora 15, sin confundir puntos porcentuales con porcentaje relativo.

## Autor — 2026-10-24 UTC

> A QUE CREES QUE SE DEBE QUE HAYA DISMINUIDO

## Asistente — 2026-10-24 UTC

> Creo que disminuyó **principalmente porque cambiamos cuándo arranca la bomba de recirculación en ambos modelos**, no porque hayamos corregido todavía la causa del desfase entre ellos.
>
> Antes, el arranque dependía de que el **nivel medio de los retornos llegara al 60 %**. Ahora lo solicita el **suministro al bajar al 30 %**, o cualquiera de los retornos al llegar al 90 %. Eso cambia la duración y el momento de cada ciclo de bombeo. Al comparar los niveles justo al cierre de cada hora, algunas fases quedan más próximas que antes.
>
> Por eso el máximo pasó de **34,268 pp** con la política anterior a **19,276 pp** con la nueva. **No son dos corridas con el mismo control**, así que no podemos atribuir esa reducción a una mejora de precisión de Fractal. La gráfica todavía muestra saltos de signo y diferencias grandes: los ciclos siguen desfasándose.
>
> Para saber *por qué* divergen, el siguiente contraste útil es marcar, en ambos motores, el **primer arranque y la primera parada**, con segundo simulado, niveles de los tres tanques y m³ efectivamente transferidos. Ahí podremos encontrar la primera diferencia causal, en vez de inferirla del resultado de la hora 15.

## Autor — 2026-10-24 UTC

> SI BUENA IDEA

## Asistente — 2026-10-24 UTC

Se trazó el primer ciclo desde t=30 s PLC en ambos motores. Arranque t=1318,277 s Fractal vs 1317 s emulador; parada 1839,952 vs 1842 s; al instante de la parada Fractal había bombeado 0,007104 m³ menos. Al arranque, Fractal ubica ~1,3 pp más en retorno 1 y menos en retorno 2, porque omite un paso hidráulico de igualación entre retornos a través de la succión común aun con bomba apagada: el emulador transfirió 0,029006 m³ antes del arranque. El primer ciclo casi coincide en el suministro: todavía no explica por sí solo los 19,276 pp máximos del día. Queda medir ciclos posteriores y modelar la igualación en Fractal de forma independiente.

Herramientas (resumen): script de trazado de eventos y caudales del enlace de succión, ejecución de una hora a paso PLC 1 s, archivo JSON de contraste, prueba de callback sin afectar física y documentación. No se consultaron credenciales.

## Autor — 2026-10-24 UTC

> SIGUE CADA CICLO Y COMPARA

## Asistente — 2026-10-24 UTC

Se instrumentó el horizonte Fractal con un callback opcional observacional por evento, y se ejecutaron 24 h del emulador desde los mismos tags de t=30 s, 86.400 pasos de un segundo. Ambos calcularon 46 arranques y 46 paradas; la parada se adelanta −2 s en el primer ciclo, −46 s en el quinto, −61 s en el octavo y −593 s en el 46. El volumen total bombeado en esos ciclos difirió −0,719 m³ (185,035 Fractal frente a 185,753 emulador). Se midieron 2,538 m³ acumulados de igualación interna de retorno 1 a retorno 2 con bomba apagada, que no son pérdida neta del circuito. El CSV contiene hora de arranque/parada, desfases y volúmenes de **cada** ciclo; el JSON contiene niveles y transferencias comparados en el mismo instante. Se documentó que el origen de toda la deriva aún no está probado y el futuro de tanques sigue sin validar.

Herramientas (resumen): edición del callback del horizonte, ejecución de 24 h offline, revisión de 92 eventos por motor, generación de JSON/CSV, lint y pruebas del flujo de proyección. No se incluyeron credenciales.
