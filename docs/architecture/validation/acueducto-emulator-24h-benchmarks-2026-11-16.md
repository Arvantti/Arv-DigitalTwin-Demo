# Benchmark local del scheduler del emulador · 24 h simuladas

Fecha: 2026-11-16. Equipo local de desarrollo; no es una medición de producción. La tabla de 24 h es la línea base anterior a la optimización posterior que cachea el orden estructural del solver; no debe atribuirse al código actual sin repetir los cuatro días.

## Método

Se ejecutó `PlantSession._run` con el modelo `water-network-scale-v1`, semilla 1, fallas aleatorias desactivadas, sin perfil seleccionado, sin suscriptores ni conexión física. Se usó un proceso aislado en memoria; checkpoint, auditoría e historian fueron no-op para evitar escribir en la base local. El objetivo fue alcanzar 86 400 s y se registró el instante de parada, el tiempo real total y el presupuesto simulado aún pendiente. Las tandas del scheduler permiten terminar unos pasos después de las 24 h exactas; el sobrepaso queda reportado, no oculto.

El script permanente de reproducción es `tools/hydraulics/benchmark_emulator_day.py`; por ejemplo:

```bash
uv run python tools/hydraulics/benchmark_emulator_day.py --speed 120
```

## Resultados observados

| Selector | Tiempo simulado al parar | Sobrepaso | Tiempo real | Velocidad media | Presupuesto pendiente al parar |
|---:|---:|---:|---:|---:|---:|
| ×60 | 86 403 s | 3 s | 1 440,09 s (24:00 min) | 60,00× | 0,16 s |
| ×120 | 86 411 s | 11 s | 1 211,42 s (20:11 min) | 71,33× | 58 945,91 s (16,37 h) |
| ×240 | 86 441 s | 41 s | 1 233,50 s (20:34 min) | 70,08× | 209 571,92 s (58,21 h) |
| ×600 | 86 431 s | 31 s | 1 132,09 s (18:52 min) | 76,35× | 592 748,51 s (164,65 h) |

El conteo de eventos al final fue 215 en las cuatro corridas. Se conservaron las señales finales del equipo en cada resultado; no se comparan como regresión exacta porque cada corrida terminó en un segundo simulado distinto.

## Optimización posterior: orden estructural cacheado

Se añadió cache del orden de mínimo grado para redes con la misma topología; los coeficientes y la eliminación numérica se recalculan en cada solve. En una comparación secuencial en el mismo proceso, 600 pasos dieron 6,782 s con el solver heap anterior y 6,293 s con el orden cacheado (1,078×); snapshots finales idénticos y 1 819 solves. Los tests hidráulicos dirigidos también pasan. Es una prueba corta, no una nueva corrida de 24 h.

Con el código actual se hicieron pruebas adicionales de 1 h simulada por selector: ×60: 59,94× media / 0,32 s pendientes; ×120: 90,36× / 1 170,86 s pendientes; ×240: 91,11× / 5 924,20 s pendientes; ×600: 91,28× / 20 065,34 s pendientes. Las pruebas tienen hasta 41 s de sobrepaso de rejilla y muestran que los selectores altos siguen acumulando retraso; falta repetir 24 h a cada selector tras esta optimización.

## Lectura y límites

- ×60 sostuvo aproximadamente el objetivo durante el día simulado.
- En ×120/×240/×600 el scheduler conservó el presupuesto de pasos, pero el motor no alcanzó la velocidad pedida: la diferencia se acumuló como retraso muy grande. Seleccionar una velocidad superior no equivale a obtenerla.
- El código no descarta intencionalmente el presupuesto por alcanzar el límite de tandas. El benchmark no demuestra paridad hidráulica A/B a un instante idéntico ni cobertura con historian/D1/WebSocket real.
- Esta medición no es de 24 horas de tiempo real, no es una prueba de producción ni una validación física. El modelo hidráulico sigue siendo cuasiestacionario.
- Para aceptar rendimiento sostenido todavía hace falta optimizar el solver, repetir el benchmark y comparar señales en un tiempo simulado idéntico; los tests hidráulicos existentes siguen siendo una regresión separada.
