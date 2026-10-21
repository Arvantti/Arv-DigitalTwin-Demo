# Máquina plana de una aguja

Puesto unitario de costura recta atendido por una operaria. La simulación recibe piezas por `garments_in`, mantiene una cola limitada, ejecuta el SAM `cycle_s` y entrega piezas por `garments_out`. Aguja/volante/persona se animan con canales del comportamiento; no se infiere producción desde puntadas/min.

- Preset `standard`: ciclo 45 s; velocidad mecánica de referencia 5.500 puntadas/min.
- Entradas: caudal de prendas, presencia de operaria y disponibilidad de salida.
- Fallas: rotura de hilo y de aguja. Valores de tasa y reparación supuestos.
- Límites: no simula calidad de puntada, tensión, materiales ni puntadas físicas; falta calibrar datos de fábrica.
- Fuente/modelo y origen de datos: `FICHA.md`; principios comunes en `docs/equipment-authoring.md`.
