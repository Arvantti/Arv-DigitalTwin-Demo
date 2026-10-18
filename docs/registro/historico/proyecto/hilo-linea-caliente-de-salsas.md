---
tipo: historico-ia
fuente: hilo «Línea caliente de salsas» (Claude Projects)
desde: 2026-10-18 17:10
hasta: 2026-10-18 17:40
tags: [registro, historico-ia, salsas, capacidad]
---
# Hilo: línea caliente completa de la planta de salsas

Parte de [[historico-proyecto]] · Índice: [[00-indice]] · Bitácora: [[bitacora]] · Decisión: [[decisiones]] D49. Autor humano: Carlos Andrés Quiceño. Hora en UTC. Credenciales: ninguna.

---

### 👤 Carlos Andrés Quiceño · 17:10:14 UTC (hilo de tuberías)

si

*(respuesta a la propuesta de la IA: conectar la línea caliente completa y ajustar capacidad para 22 t/día con una tercera marmita, un segundo túnel de enfriamiento, revisión del pasteurizador de 3.000 L/h y una segunda mesa de 250 ml)*

### 👤 Carlos Andrés Quiceño · 17:11:04 UTC (hilo de tuberías)

si, aunque antes de me gustaria me definas cuales son los diferentes productos de la planta, solo pasta de tomate? o hay otros?

### 🤖 Claude (otro hilo) · 17:11 UTC

Tres familias de producto: salsas en caliente (tomate y BBQ), emulsiones en frío (mayonesa natural, chipotle y jalapeño, rosada, mayonesa-mostaza) y mostaza (línea propia, alérgeno). Propuso repartir 22 t/día en 40 % caliente, 45 % frío y 15 % mostaza.

### 👤 Carlos Andrés Quiceño · 17:11:46 UTC (hilo de tuberías)

si, me gusta esa propuesta

### 🤖 Claude · 17:11 UTC (este hilo)

Dimensiono la línea caliente al ritmo nominal de las llenadoras, no al promedio diario; el reparto solo cambia las pruebas de producción diaria.

### 🤖 Claude · 17:12–17:40 UTC

(Resumen) Leyó `AGENTS.md`, `plant-engine.md`, `plant.yaml` y `simulation.yaml`. Comprobó que el motor no reparte una salida entre dos destinos, así que la segunda línea caliente lleva su propia marmita, pasteurizador y pulmón. Añadió los equipos y enlaces, ajustó el escenario `nominal` (marmita 3, 3 batches de 1.995 kg, ≈ 1.290 cajas de 16 sachets) y creó `tunnel-250-stop` (el bloqueo del túnel 2 no cruza a la línea de 1.000 ml). Pruebas de planta en verde y capturas de la galería.
