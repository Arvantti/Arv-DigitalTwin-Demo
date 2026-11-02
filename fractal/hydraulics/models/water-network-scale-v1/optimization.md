# Optimización hidráulica Fractal · water-network-scale-v1

## Escenarios y cálculo horario

Hay dos escenarios de consumo:

1. **Perfil de consumo PLC:** viviendas y fugas tienen una apertura conocida para cada hora del perfil guardado.
2. **Perfil personalizado:** el operador define por hora aperturas distintas por válvula, grupo o globalmente.

En ambos casos esas aperturas son entradas fijas. Fractal no las optimiza. Para cada hora vuelve a resolver la PRS según la demanda y aperturas de ese escenario; no impone una rampa horaria prefijada.

## Control de la PRS

La descarga de las bombas se considera casi constante para la franja. Variar la salida de la PRS equivale en el modelo a variar la presión que recibe el piso 1; la presión del punto crítico del piso 4 se obtiene resolviendo la red completa con las pérdidas de tubería, válvulas y emisores.

Para cada hora el cálculo:

1. Mantiene fijas las aperturas PLC de viviendas, fugas y válvulas entre pisos y fija el caudal de referencia de esa hora.
2. Resuelve varios valores candidatos de presión de salida de la PRS manteniendo ese caudal constante.
3. Interpola linealmente entre resultados con un margen numérico de 0,05 mca y vuelve a comprobar la solución en la red; el criterio reportado sigue siendo **≥18 mca**.
4. Si 18 mca no es alcanzable pero la apertura requerida sigue en 20–100 %, busca el mejor valor con el mismo margen sobre el límite duro de **15 mca**. Si no llega a 15 mca o la apertura queda fuera de 20–100 %, el resultado queda inviable y no se genera un perfil aceptable.
5. Informa la consigna de salida y la apertura equivalente de la VRP.

La curva sinusoidal S fija 20 % de apertura → salida de 15 mca y 100 % → salida igual a la presión de entrada. Para `t = (apertura − 20) / 80`, `s = (1 − cos(πt)) / 2` y `salida = 15 + s × (entrada − 15)`. La pendiente es cero en ambos extremos: amortigua el inicio y el cierre. La búsqueda hidráulica opera sobre presión; luego invierte la curva para calcular la apertura equivalente. Una salida que requiera una apertura fuera de 20–100 % se marca no factible y no genera perfil aceptable. El punto de 15 mca al 20 % sigue siendo un supuesto por verificar físicamente. Esta curva es una relación estática, no una rampa temporal con duración.

**Diferencia por resolver antes de validar físicamente:** el circuito Fractal conserva pérdidas de aislamiento/PRS/antirretorno. En un barrido nodal representativo con todas las válvulas abiertas, caudal de referencia 20,7629 m³/h y entrada PRS 68,9756 mca, la salida calculada con consigna 70 mca fue 67,5235 mca, no igual a la entrada. El solver usa su presión de salida hidráulica para calcular la apertura equivalente; este desfase de 1,4521 mca en el punto totalmente abierto queda como limitación pendiente.

## Variables y restricciones

- Única decisión Fractal: consigna de salida de `prs-01` (`manual_setting_mca`).
- Entradas fijas: aperturas horarias de viviendas, fugas y válvulas entre pisos procedentes del perfil/PLC.
- Objetivo operativo: alcanzar 18 mca en la presión crítica.
- Límite duro: no recomendar una salida que deje el punto crítico por debajo de 15 mca.
- Factibilidad de la apertura: la salida debe corresponder a una apertura dentro del rango extendido (20–100 %); el tramo extrapolado de 20–30 % se identifica explícitamente.
- Un resultado que no alcanza 18 pero conserva 15 se marca explícitamente como `fallback_15_used`; no se presenta como cumplimiento del objetivo de 18.
- Fractal proyecta y propone; PLC conserva la autoridad y el operador decide si acepta. No se aplican mandos automáticamente.

## Modelo hidráulico

El solver carga parámetros de presets, topología de `simulation.yaml` y rutas/diámetros/K de `plant.yaml`. Construye por separado una red nodal desde la salida PRS, con tramos y cruces internos de cuatro rejillas (64 emisores domésticos y ocho fugas). Resuelve continuidad y presión simultáneamente usando Darcy-Weisbach/Swamee-Jain (laminar: Hagen-Poiseuille), Kv y emisores dependientes de presión. Los casos de referencia estacionarios comparan el solver Fractal con el banco operativo; Fractal no importa el solver operativo.

El circuito principal acopla la curva H=s²H0−rQ² (bombas paralelas), antirretorno, succión según el nivel del tanque, pérdidas del tubo de llegada a PRS, Kv de las válvulas de aislamiento y salida efectiva de la PRS. El control se considera asentado dentro de cada franja horaria; no representa en tiempo real el PID, las rampas ni otros transitorios.

Los perfiles horarios se simulan como consumos estacionarios. Los frames son proyecciones futuras, nunca observaciones PLC ni aplicación de mandos. Las comprobaciones existentes de caudal, bomba y estado hidráulico se informan por separado del cumplimiento de 18 mca.
