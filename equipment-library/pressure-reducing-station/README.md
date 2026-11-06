# pressure-reducing-station

Estación reguladora de presión con dos ramas en paralelo: rama A con PRV automática y rama B con PRV de piloto de salida fija. Cada rama tiene válvulas de aislamiento a la entrada y salida. Visual V2 · comportamiento B2. Ver `FICHA.md` y el diseño en [docs/water-network-plant.md](../../docs/water-network-plant.md).

## Qué simula
- **Hidráulica:** las PRV siguen los estados de EPANET (activa, abierta, cerrada) en `HydraulicNetwork`; el solver calcula presiones y caudales de la red.
- **Acueducto / PLC AUTO:** la API inicia y migra sesiones recuperadas a `fixed_opening`; `set_auto_opening` fija un porcentaje (20–100 %) que puede cambiarse en vivo o por hora desde un perfil PLC. El preset de laboratorio conserva su modo heredado por defecto. La hipótesis de demostración transforma ese porcentaje en una consigna hidráulica con curva S: 20 % → 15 mca y 100 % → presión de entrada. La presión crítica se mide y puede alarmar, pero no cierra un lazo de control.
- **Límite del modelo:** la curva S no es una relación física validada entre apertura del vástago, Kv y caudal. El solver sigue representando la PRV como regulador de presión ideal a esa consigna; no como una válvula de Kv variable. Interpretar los resultados como respuesta del modelo asumido, pendiente de calibrar con la PRV real.
- **Modos de laboratorio heredados:** el comportamiento del equipo conserva modos PID por presión crítica/punto fijo y salida fija para escenarios aislados. Los mandos de perfiles horarios del PLC de acueducto ya no seleccionan esos modos.
- **Rama manual:** salida fija `manual_setting_mca` (piloto de resorte).
- **Cambio de rama** (`select_branch`): abre la rama que entra en `switch_time_s` y luego cierra la que sale.
- **Alarmas** de presión crítica baja (−10 %) y alta (+15 %) respecto a la consigna de alarma, retorno a ± 5 %, potencia y energía disipadas por las PRV.

## Entradas del entorno
`inlet_pressure_mca`, `critical_pressure_mca` (medición para alarmas/lectura) y `load_factor` (escala el consumo del banco). `auto_opening_pct` inicia en 38 % **assumed** y el PLC lo puede sobrescribir en caliente. Sin entorno usa un banco de prueba con llegada a `bench_inlet_mca`, red hasta el punto crítico como Kv (`bench_network_kv_m3h`) y consumo como descarga (`bench_load_kv_m3h`).

## Para el motor de planta
`add_pressure_reducing_station(net, prefix, inlet, outlet, p)` agrega las dos ramas a una red ya armada.

## Presets
`station-4in-auto` (rama automática) y `station-4in-manual` (rama manual).

## Fallas
`telemetry_loss` congela el modo PID heredado; en modo de apertura fija no afecta el mando. `pilot_drift` sube 15 % la consigna manual. `diaphragm_failure` deja abierta la PRV automática.
