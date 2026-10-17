# pressure-reducing-station

Estación reguladora de presión con dos ramas en paralelo: rama A con PRV automática (su consigna de salida la ajusta un PID para sostener la presión del punto más crítico de la red) y rama B con PRV de piloto de salida fija. Cada rama tiene válvulas de corte a la entrada y a la salida. Visual V2 · comportamiento B2. Ver `FICHA.md` y el diseño en [docs/water-network-plant.md](../../docs/water-network-plant.md).

## Qué simula
- **Hidráulica:** las PRV siguen los estados de EPANET (activa, abierta, cerrada) en `HydraulicNetwork`; el caudal y las presiones salen de la red.
- **Rama automática:** PID con anti-windup sobre la presión crítica; la consigna de salida queda entre `auto_min_outlet_mca` y `auto_max_outlet_mca`. De noche baja la salida y con ella las fugas.
- **Rama manual:** salida fija `manual_setting_mca` (piloto de resorte).
- **Cambio de rama** (`select_branch`): abre la rama que entra en `switch_time_s` y luego cierra la que sale, sin cortar el suministro; al volver a la automática arranca desde la presión que hay (sin salto).
- **Alarmas** de presión crítica baja (−10 %) y alta (+15 %) tras 30 s, y regreso a ± 5 %. Potencia y energía disipadas por las PRV.

## Entradas del entorno
`inlet_pressure_mca`, `critical_pressure_mca` (telemetría del punto crítico) y `load_factor` (escala el consumo del banco). Sin entorno usa un banco de prueba: llegada a `bench_inlet_mca`, la red hasta el punto crítico como un Kv (`bench_network_kv_m3h`) y el consumo como una descarga (`bench_load_kv_m3h`), calibrados para el punto de diseño (13 m³/h, 26,66 mca de salida, 20 mca en el punto crítico).

## Para el motor de planta
`add_pressure_reducing_station(net, prefix, inlet, outlet, p)` agrega las dos ramas a una red ya armada.

## Presets
`station-4in-auto` (rama automática) y `station-4in-manual` (rama manual).

## Fallas
`telemetry_loss` (el PID se congela), `pilot_drift` (la PRV manual sube 15 %), `diaphragm_failure` (la PRV automática queda abierta).
