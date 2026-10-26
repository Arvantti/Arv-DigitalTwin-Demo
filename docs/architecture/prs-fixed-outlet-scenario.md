# Escenario PRS: entrada objetivo 70 mca y salida fija AUTO 40 mca

## Configuración

Plantilla `pdd-prs-fijo-01` conserva la demanda diurna PDD-RCA-01 y, en cada hora, selecciona la rama automática A, modo `fixed_outlet`, entrada objetivo 70 mca y salida AUTO fija 40 mca. La rama manual B se conserva cerrada. El operador puede seleccionar la plantilla y crear una copia editable para cambiar por hora ambos valores.

La simulación operativa no fija directamente la presión de un nodo en la entrada de la PRS: el emulador resuelve una red conectada donde esa presión depende de bombas, elevación, tuberías y caudal. Por ello, `inlet_pressure_mca` se interpreta como **objetivo de entrada** y se traduce a una consigna de descarga de la bomba usando el diferencial descarga→entrada medido al programar cada hora. El valor que decide seguridad es la presión real medida/calculada a la entrada; puede apartarse de 70 mca si cambia el caudal, la bomba no tiene margen o hay transitorios. No es identificación ni reconstrucción de la lógica del controlador Grundfos.

La nueva opción `set_auto_control` actúa únicamente sobre la PRV de la rama A: en modo `fixed_outlet` mantiene su ajuste, limitado por el máximo declarado de 40 mca; si la entrada no ofrece presión suficiente, la salida real queda por debajo del ajuste. El lazo PID de presión crítica queda para el modo `critical_pressure`. No se abre la rama manual.

## Banco estacionario de referencia

Tras D76–D78, el benchmark independiente `industrial-models/water-network-scale-v1/network.py` incluye las mismas pérdidas directas de los antirretornos declarados en el modelo conectado: salida del tanque de suministro, salida común de la PRS y salida de cada válvula entre pisos. Así, la prueba del motor compara topologías equivalentes y no marca como deriva de control la caída de presión omitida por el banco anterior.

## Proyección Fractal

`project_24h` lee el mismo perfil guardado y los tags actuales de la sesión PLC. Cuando el snapshot cae dentro de una hora, el primer intervalo parcial hereda el setpoint de bomba vigente en PLC (la consigna de esa hora ya fue aplicada); en los límites horarios siguientes, recalcula el setpoint de descarga con el diferencial bomba→PRS calculado al cierre de la franja previa. La salida regulada se evalúa a 40 mca con las pérdidas de estación y antirretornos de D76–D78. El estado incluye las 64 presiones de vivienda. La interfaz presenta entrada y salida PRS reales del modelo, mínima de las 64 viviendas y estado respecto a 15 mca; la proyección no manda comandos ni modifica el perfil PLC.

## Resultado reproducible y límites

`tools/hydraulics/validate_prs_fixed_outlet.py` aplica el perfil al PLC virtual desde t=0, revisa las 64 viviendas en cada paso de 1 s simulado desde t=30 hasta t=86400 (86.371 muestras, 86.370 s integrados), y coteja PLC/Fractal en las mismas 24 fronteras horarias. El informe completo está en [`validation/pdd-prs-fijo-01-24h.json`](validation/pdd-prs-fijo-01-24h.json) y la tabla en [`validation/pdd-prs-fijo-01-24h-hourly.csv`](validation/pdd-prs-fijo-01-24h-hourly.csv).

- Emulador: mínima observada **30,40013 mca** en `L4.C44` a t=41 555 s (11 h 32 min 35 s de tiempo simulado), cero muestras de 1 s bajo 15 mca; entrada medida entre **68,99574–70,90799 mca**, salida entre **39,88074–39,98105 mca**, flujo manual máximo 0 m³/h.
- Fractal: mínima nominal **30,38644 mca** en `L4.C44`, hora de perfil 11. En sus escenarios de demanda ×0,9/×1,0/×1,1, la mínima global es **29,33345 mca** en `L4.C44`, hora 11, factor ×1,1; todas las 24 franjas permanecen sobre 15 mca y la rama manual sigue cerrada.
- El objetivo de entrada 70 mca es aproximado; los resultados informan presión de entrada medida/modelada, no una fijación exacta. La salida real también queda ligeramente por debajo del ajuste fijo de 40 mca por pérdidas.

Esto verifica el umbral dentro de estos dos modelos y del perfil/demanda evaluados; las muestras por segundo no certifican presión entre pasos ni respecto a una planta física. La discrepancia de niveles futuros de D78 sigue sin validar el horizonte de tanques. Control real de bombas Grundfos y apertura física de PRV desconocidos. Optimizador deshabilitado.
