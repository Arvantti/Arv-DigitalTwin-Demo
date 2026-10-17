# regulating-valve

Válvula de regulación en línea (globo o bola) con volante manual o actuador eléctrico, en un carrete con bridas, dos manómetros y soportes. Visual V2 · comportamiento B2. Ver `FICHA.md` y el diseño en [docs/water-network-plant.md](../../docs/water-network-plant.md).

## Qué simula
- **Caudal** Q = Kv · c(apertura) · √Δp, con característica lineal o de igual porcentaje (rangeabilidad 50), resuelto con `HydraulicNetwork`.
- **Apertura:** con volante cambia de inmediato; con actuador recorre 100 % en `stroke_s`.
- **Control de presión aguas abajo** (`control: downstream_pressure`, requiere `actuated: true`): PID sobre la presión de salida.
- **Fallas:** `actuator_stuck` (la apertura queda donde estaba) y `seat_leak` (cerrada deja pasar 2 % del Kv).

## Entradas del entorno
`inlet_pressure_mca` (presión aguas arriba) y `load_kv_m3h` (lo que consume aguas abajo, como un Kv a la atmósfera). Sin entorno usa `bench_inlet_mca` y `bench_load_kv_m3h`.

## Para el motor de planta
`add_regulating_valve(net, link_id, inlet, outlet, p)` agrega la válvula a una red ya armada.

## Presets
`between-levels-2in` (manual, apertura fija entre niveles de la rejilla), `actuated-2in-pressure` (con actuador regulando 21 mca).
