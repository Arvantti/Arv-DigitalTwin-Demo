# C44: comparación de los primeros tres ciclos

2026-10-26 UTC. Código base d5e3080; sin cambiar física, controles ni paso PLC. Perfil `pdd-prs-punto-critico-18-01`, baseline nominal. Comparación t=30–7200 s. Evidencia: `pdd-prs-c44-cycles-2h.json`, CSV de eventos y CSV horario vecinos.

## Resultados (Fractal menos emulador)

| Ciclo | Arranque Fractal / PLC (s) | Parada Fractal / PLC (s) | Desfase de parada (s) |
|---|---|---|---|
| 1 | 1227,973 / 1229 | 1765,081 / 1769 | −3,919 |
| 2 | 3603,326 / 3612 | 4145,535 / 4157 | −11,465 |
| 3 | 5924,642 / 5941 | 6466,862 / 6487 | −20,138 |

Todos arrancan por suministro bajo y paran por suministro lleno. Tres arranques y tres paradas en cada modelo: aquí el emparejamiento ordinal resulta consistente. No se detecta bypass entre retornos en el diagnóstico (el detector cubre flujo de retorno 1 a retorno 2 con bomba previamente apagada).

En la primera parada, suministro Fractal 90,00112 %, PLC 90,12580 %. El exceso PLC de 0,12468 pp equivale a 4,848 litros; a 4,56834 m³/h tarda aproximadamente 3,82 s adicionales en consumirse. Esto ilustra un mecanismo acumulativo, no una atribución exacta de todo el desfase. En la tercera parada PLC alcanza 90,20852 % y Fractal 90,00111 %.

Volumen acumulado contabilizado por la bomba hasta acabar el tercer ciclo: PLC 9,137727 m³ y Fractal 9,101991 m³; diferencia −0,035736 m³ (−0,391 %). En hora 2 el suministro difiere −0,8861 pp, unos −34,45 litros. La diferencia de transferencia es de magnitud compatible, pero aún falta cerrar el balance con los contadores efectivos de entrada/salida de los vasos: el volumen contabilizado por la bomba no se debe equiparar automáticamente al recibido por el tanque.

## Mecanismo identificado y límites

- Fractal interpola el cruce de umbrales dentro de un paso; el emulador intercambia entradas, resuelve hidráulica y luego avanza equipos a 1 s. Los umbrales no producen exactamente el mismo instante de conmutación ni el mismo sobrepaso de nivel.
- Fractal integra con pasos de hasta 60 s (5 s durante rampa), frente al paso PLC de 1 s. Conserva distribución fija por franja; el PLC contiene transitorios.
- `advance_hour` conserva el estado encendido pero reinicializa la velocidad al comenzar la franja (1 si encendido). Es una posible fuente adicional si una rampa cruza la frontera horaria; no demostrada como causa en esta ejecución.
- Ya existe desfase en el primer ciclo, antes del primer cambio horario de demanda: no puede explicarse exclusivamente por los cambios horarios.
- Un desfase creciente permite que una muestra horaria vea ~21 m³/h en un modelo y 0 en otro sin que sus caudales de régimen encendido difieran en 21 m³/h.

No se ha aislado cuantitativamente cada contribución con experimentos controlados. El diagnóstico de 2 h no sustituye el cierre de balances ni la traza de 24 h. Próximos controles: entradas/salidas efectivas de los tres vasos, misma condición inicial verdadera frente a tags, integración Fractal a 1 s, conservación de velocidad entre franjas. Optimización permanece deshabilitada.

## Reproducción

Desde la raíz, sin editar modelos:

```python
from pathlib import Path
import tools.hydraulics.trace_recirculation_cycles as trace
trace.PROFILE = Path('industrial-models/water-network-scale-v1/operation-profiles/pdd-prs-punto-critico-18-01.json')
trace.diagnose(Path('/tmp/c44-cycles-2h.json'), hours=2)
```

Ejecutar con `uv run python`. El script reutilizado contabiliza caudal de bomba para transferencia; las lecturas de niveles PLC son verdaderas, mientras el estado inicial de Fractal proviene de tags PLC. No elimina de partida la incertidumbre de sensores.
