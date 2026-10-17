# booster-pump-set

Grupo de bombeo en paralelo sobre un bastidor: 1 a 6 bombas iguales (multietapa verticales o centrífugas de succión axial), cada una con antirretorno, colectores de succión y descarga, variador común y tablero. Visual V2 · comportamiento B2. Ver `FICHA.md` y el diseño en [docs/water-network-plant.md](../../docs/water-network-plant.md).

## Qué simula
- **Hidráulica:** cada bomba es una curva H = s²·H0 − r·Q² en paralelo con su antirretorno, resuelta con `HydraulicNetwork` (gradiente global). El caudal y la presión salen de la red, no de una fórmula fija.
- **Control por presión** (`control: pressure`): un PID ajusta la velocidad común del variador para sostener `setpoint_mca` en la descarga. Entra otra bomba cuando la velocidad pasa de `stage_up_speed_pct` 15 s y la presión no alcanza; sale una cuando el caudal cabe en una bomba menos con margen (`stage_down_flow_pct`) durante 30 s. Al menos 60 s entre cambios.
- **Control por nivel** (`control: level`): arranca con el tanque de origen sobre `start_level_pct` y el destino bajo `target_full_pct`; para con el origen bajo `stop_level_pct` o el destino lleno.
- **Alternancia:** la bomba líder rota en cada arranque desde cero; si se dispara una bomba entra la de reserva en el mismo paso (cuando el preset tiene reserva).
- **Energía:** potencia hidráulica ÷ eficiencia, energía acumulada y energía específica (kWh/m³).

## Entradas del entorno
`suction_head_m`, `system_kv_m3h` (lo que pide la red), `source_level_pct`, `target_level_pct`. Sin entorno usa un banco de prueba: la red servida es un Kv que descarga a la atmósfera sobre una elevación `bench_static_head_m`.

## Para el motor de planta
`add_pump_set(net, prefix, suction, discharge, p)` agrega las bombas y antirretornos a una red ya armada; la planta del acueducto la usará en vez del banco.

## Presets
`multistage-2x13m3h-80m` (bombeo principal, 2 bombas de 13 m³/h a 80 mca, sin reserva; una sola sostiene la demanda de día), `recirculation-2x15m3h` (recirculación por nivel, 1 + 1).

## Fallas
`pump_trip` (se dispara la líder, entra la reserva), `vfd_fault` (paran todas), `worn_impeller` (la curva baja 10 %).
