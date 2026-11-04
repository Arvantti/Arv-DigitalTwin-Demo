# Apertura fija de PRS desde el PLC virtual

## Alcance

Cada sesión creada o recuperada desde checkpoint por la API del acueducto inicia/restaura `prs-01` en modo `fixed_opening` al 38 % assumed (equivalencia aproximada del punto nominal previo). Una apertura explícita del perfil de la hora actual prevalece al recuperar sesiones antiguas. La emulación operativa manda una **apertura fija porcentual** a la PRS AUTO; el operador puede cambiarla en vivo desde la pantalla de bombeo o definirla por hora en un perfil. Las pruebas declarativas de `twin-lib plant` conservan el modo heredado de laboratorio. El PLC sigue siendo autoridad operativa; Fractal no escribe mandos.

La presión crítica queda disponible como señal de medición y para alarmas. El 38 % inicial es una equivalencia matemática aproximada del punto nominal anterior (salida ≈21,45 mca con entrada ≈71,1 mca), no un ajuste validado físicamente. `critical_setpoint_mca` y los modos PID heredados se conservan en los perfiles como metadatos de estudios Fractal/laboratorio, pero `commands_for_hour` no los envía como lazo de control al emulador. Si un perfil AUTO antiguo no trae `auto_opening_pct`, se aplica 38 % (valor inicial assumed).

## Conversión asumida

El porcentaje se convierte a una consigna de presión para el elemento PRV del solver:

- apertura 20 % → consigna de 15 mca;
- apertura 100 % → presión medida de entrada a la PRS;
- entre ambos extremos se interpola con una curva sinusoidal S, de pendiente nula en los extremos.

La consigna de salida derivada se informa en `auto_outlet_setpoint_mca`; presión de salida, caudales y presiones de viviendas los calcula la red hidráulica conectada. La señal `PLC.PRS.AutoOpeningPct` expone el mando aplicado.

## Límite de interpretación

Esto permite observar sensibilidad hidráulica a cambios de apertura bajo una **relación asumida**, pero todavía no modela una válvula de apertura fija mediante una curva Kv-apertura. El solver representa la PRV como regulador ideal con la consigna calculada. La curva apertura-presión requiere calibración/ensayo físico antes de considerarla una ley de operación real.

Fractal conserva por ahora sus modos y lógica de proyección existentes; un mismo perfil puede por ello producir un escenario Fractal distinto de la emulación PLC. No presentar esas trayectorias como cosimulación alineada ni como resultados directamente comparables. El diseño de cosimulación y presentación conjunta queda fuera de este cambio.

## Interfaz

- Pantalla de bombeo: mando en vivo `Apertura fija PRS AUTO` (20–100 %), separado de la medición de presión crítica.
- Perfil horario: `auto_opening_pct` por hora; el valor no especificado usa 38 %.
- Editor conserva parámetros de Fractal en un bloque aparte y los rotula como no aplicados al PLC.
- Al cambiar perfil activo, la aplicación horaria del PLC vuelve a mandar la apertura programada para esa hora.

## Validación

Las pruebas del emulador verifican el contrato/rango del mando, que un perfil crítico no produce un comando PID al PLC y que distintas aperturas causan distintas presiones de salida en la red simulada. Esto valida el comportamiento del software y de la hipótesis codificada, no su equivalencia con una PRS física.
