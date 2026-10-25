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

## Autor — 2026-10-24 UTC

> cual es la desviacion de porcentaje  de cada franja

## Asistente — 2026-10-24 UTC

Se entregó tabla de 24 horas del nivel del suministro con porcentajes relativos `(Fractal−emulador)/emulador` y diferencia en puntos porcentuales; la mayor desviación relativa fue +61,59 % en hora 14 y la máxima diferencia de nivel +19,276 pp en hora 15, usando el informe D75.

## Autor — 2026-10-24 UTC

> damelo en valor neto de volumen

## Asistente — 2026-10-24 UTC

Se convirtieron los niveles de las 24 franjas a volumen de suministro mediante 3,888 m³ de capacidad. El mayor desvío era +0,749 m³ en hora 15, redistribución de inventario, no pérdida; muestras D75 con desfase de 30 s.

## Autor — 2026-10-24 UTC

> agrega % de la diferencia de bvolumen a esa tabla

## Asistente — 2026-10-24 UTC

Se añadió la diferencia porcentual relativa al volumen emulado, junto a m³ emulador, m³ Fractal y diferencia neta, sin confundir porcentaje relativo con puntos porcentuales.

## Autor — 2026-10-24 UTC

> si emulador calculara solo sin historico con los valores de hora 9 que resultado tendria

## Asistente — 2026-10-24 UTC

Se corrió hora 9 aislada desde 70/40/40 % en el emulador: suministro 47,20 % (1,835 m³), retornos ~59,65 % (1,346 m³ cada uno); frente a día continuo hora 9 suministro 44,9 % (1,746 m³). Se aclaró que sin historia todavía se necesita un estado inicial.

## Autor — 2026-10-24 UTC

> de esta tabla dame los valores  en m3 tambien
>
> y en los escenarios del dia, como se comporta la VRP? es fija o es variable?
> puedes comparar los resultados de las bombas grundfus? caudales y presiones de salida? el efecto de tanque pulmon tendra algo de incidencia? en los dos escenarios las bombas funcionan al mismo tiempo una sola otra sola? comparas emulado con fractal?

## Asistente — 2026-10-24 UTC

Se documentaron volúmenes de tres vasos en hora aislada y continua; PRS de rama automática variable con consigna crítica fija 15,45 mca; grupo principal dos bombas simultáneas, retorno una bomba de las dos instaladas, ambos grupos pueden coincidir. En hora 9 aislada, caudal principal 10,21 vs 10,239 m³/h y descarga 72,05 vs 72,1 mca (emulador/Fractal). El pulmón modifica succión y fase del retorno, mientras el control mantiene descarga.

## Autor — 2026-10-24 UTC

> osea que el estado heredado influye muchisimo

## Asistente — 2026-10-24 UTC

Se explicó que los niveles y la fase de recirculación heredados importan mucho; reiniciar cada hora ocultaría el error acumulado.

## Autor — 2026-10-24 UTC

> fractal esta ignorando incluso su propio pasado?

## Asistente — 2026-10-24 UTC

Se aclaró que Fractal arrastra niveles y estado encendido/apagado, pero no toda la dinámica: su caudal de distribución es fijo por hora, reinicia rampa de velocidad en la frontera horaria si ya estaba encendido y omite la igualación de retornos del montaje D75; no reancla cada hora al PLC.

## Autor — 2026-10-24 UTC

> los paros y encendidos de la recirculacion en emulacion y en fractal ocurren iguales en los mismos momentos? que tan desfasados son ?

## Asistente — 2026-10-24 UTC

Se mostraron los 46 ciclos D75: primera parada ~2 s antes en Fractal, octava ~61 s antes y 46.ª ~593 s antes; CSV por ciclo.

## Autor — 2026-10-24 UTC

> desde el punto de vista de mecanica de fluidos que me recomiendas para disminuir esas diferencias

## Asistente — 2026-10-24 UTC

Se recomendó verificar primero si había antirretornos individuales en los tanques (no añadir un paso de igualación a Fractal sin verificarlo), resolver balances en eventos y medir caudal real/ciclos antes de ajustar números.

## Autor — 2026-10-24 UTC

> si tienen valvulas antiretorno

## Asistente — 2026-10-24 UTC

Se distinguieron antirretornos de descarga de bombas de los que irían en las salidas de cada tanque antes del colector; se preguntó la ubicación para decidir si corregir el emulador.

## Autor — 2026-10-24 UTC

> cada tanque tiene su valvula

## Asistente — 2026-10-24 UTC

Con esa confirmación, se modelaron antirretornos individuales en los tres tanques antes de sus respectivas succiones. El emulador ya no deja pasar agua de un retorno al otro con bomba apagada; el diagnóstico de un primer ciclo redujo el desvío de nivel por retorno de ~1,3 pp a <0,071 pp. Fractal suma la pérdida de cada válvula en su propio solver, Kv supuesto 400 m³/h. La corrida nueva de 24 h bajo D76 debe reemplazar las estadísticas anteriores de la topología D75; hasta entonces no se atribuye todo el desfase a esta sola corrección.

Herramientas (resumen): contrato/behavior hidráulico, edición de parámetros y topología, pruebas de retroceso en vasos, primer ciclo independiente y validación de planta; corrida de 24 h en curso. Sin credenciales.

## Autor — 2026-10-24 UTC

> tambien a la salida de l tanque de alimentacion hay antiretorno antes de la bomba

## Asistente — 2026-10-24 UTC

Se confirmó que el antirretorno de alimentación ya estaba incluido entre la salida del vaso y la succión del grupo principal en D76, además de los dos de retorno. Se añadió una prueba de que permite caudal directo cuando las bombas principales están en marcha. La corrida continua de 24 h del montaje con los tres antirretornos sigue en ejecución; no se confunden sus resultados con los informes anteriores sin esas válvulas.

Herramientas (resumen): lectura de topología, prueba de antirretorno de suministro abierto con flujo directo, Ruff y validación del estado de la corrida. Sin credenciales.

## Asistente — 2026-10-24 UTC, resultado de la corrida D76

Con los tres antirretornos montados y el suministro antes del grupo principal, la corrida completa alineada de 24 h terminó: 46 ciclos por motor, paso entre retornos con retorno apagado 0 m³ (antes 2,538 m³), pero parada 46 adelantada 612 s en Fractal (antes 593 s) y −0,738 m³ de diferencia de retorno acumulada (antes −0,719 m³). El primer reparto desigual era producto de una topología incompleta; la deriva mayor no desapareció. Evidencia JSON/CSV en `docs/architecture/validation/pdd-rca-01-recirculation-cycles-checks-24h.*`. No se declaró validada la presión crítica continua ni el nivel futuro; optimización apagada.

Herramientas (resumen): ejecución de 24 h offline con 86.400 pasos PLC, CSV de 46 ciclos y JSON con eventos/niveles; comparación contra la corrida anterior en las mismas marcas, tests y Ruff. Sin credenciales.

## Autor — 2026-10-24 UTC

> como quedo los datos de los niveles? hay que volver a correr?

## Asistente — 2026-10-24 UTC

Se aclaró que la corrida D76 de ciclos ya estaba completa, pero no había conservado todos los niveles absolutos horarios. Se repitieron las 24 h guardando simultáneamente niveles/volúmenes verdaderos de los tres tanques, caudal principal y presiones; el pico del suministro fue hora 24/t=86430, Fractal 65,958 % (2,564447 m³) vs emulador 84,73776 % (3,294604 m³): −18,77976 pp o −0,730157 m³. Cero desacuerdos con presión ≥15 mca **en 24 marcas**, no entre marcas. Se identificó una desalineación de entrada: Fractal usa la consigna de hora 0 durante 3600 s desde t=30, pero el PLC cambia a la hora siguiente desde t=3600. Los 30 s finales antes de cada muestra igualada en t no tienen idéntico perfil. Esto impide tratar la tabla como certificación dinámica y deja pendiente modelar la primera franja parcial. La optimización continúa apagada.

Herramientas (resumen): instrumentación del trazador horario, corrida offline completa de 86.400 pasos PLC, JSON+CSV y cálculo de desviaciones; revisión de seguridad solo en marcas horarias. Sin credenciales.

## Autor — 2026-10-24 UTC

> a la salida de la Estacion reguladora de presion antes de entrar en el piso 1 tambien hay antirretorno, eso cambia mucho ?

## Asistente — 2026-10-24 UTC

Se modeló una válvula antirretorno común en la salida de la PRS después de la unión de ramas y antes del piso 1. Su Kv de 400 m³/h es supuesto; pérdida directa para 11,53 m³/h ~0,0085 mca. Contraste Fractal en punto estacionario: rama manual punto crítico 15,46150→15,45427 mca, AUTO asentada 15,45171→15,45064 mca. Se indicó que con un Kv menor la pérdida podría ser mayor y que las tablas D76 anteriores no validan esta nueva topología.

## Autor — 2026-10-24 UTC

> y entre pisos afectaria ?

## Asistente — 2026-10-24 UTC

El antirretorno común aguas arriba sí afecta la cabeza disponible a **todos** los pisos, pero con el Kv supuesto la caída normal calculada es pequeña; en automático la PRS tiende a compensarla mientras tenga margen, en manual se propaga. Antirretornos **adicionales** entre pisos sumarían pérdidas en serie a los pisos altos y pueden reducir la presión crítica; su existencia y Kv no fueron confirmados y no se agregaron al modelo. No se declaró validación dinámica de 24 h ni presión garantizada entre muestras.

Herramientas (resumen): lectura de estación, modelo de válvula y topología, edición de contrato/solver/escenario, comparación estacionaria manual/AUTO y pruebas de flujo directo, Ruff/validación. Sin credenciales.
