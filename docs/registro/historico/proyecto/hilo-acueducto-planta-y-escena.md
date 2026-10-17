---
tipo: historico-ia
fuente: hilo «Acueducto: planta en el motor y escena 3D»
desde: 2026-10-17 18:03
hasta: 2026-10-17 18:45
tags: [registro, historico-ia, acueducto]
---
# Hilo: acueducto, planta en el motor y escena 3D (entregas 4 y 5)

Parte de [[historico-proyecto]] · Índice: [[00-indice]] · Hilo anterior: [[hilo-acueducto-a-escala]] · Diseño: `docs/water-network-plant.md` · Decisión: [[decisiones]] D31. Autor humano: Carlos Andrés Quiceño. Hora en UTC. Credenciales: ninguna.

---

### 👤 Carlos Andrés Quiceño · 18:03:19 UTC (en el hilo «Acueducto a escala»)

Sí, para eso tenemos que abrir otro hilo entonces.

### 🤖 Claude (coordinador) · 18:03:23 UTC

Como pediste en Acueducto a escala, abro un hilo nuevo para lo que sigue del acueducto: la planta en el motor y la escena 3D del edificio.

Instrucciones al hilo (resumen): continuar desde el PR #27; entrega 4 (plant.yaml y simulation.yaml con bombas, estación reguladora, las cuatro rejillas, tanques y recirculación) y entrega 5 (escena 3D del edificio). Datos decididos: consigna de la estación 18,09 mca (casa crítica 15,45), bombas con mínimo 70 mca en su sensor de descarga (65 mca hasta 5 s; PLC cerrado, supuestos marcados), pisos 0 y 1 con sus tanques, niveles cada 1,20 m. Los escenarios de operación los crea el usuario conversando con Claude. PRs pequeños, en español, con galería, API y registro.

### 🤖 Claude (hilo) · 18:03:33 UTC

Empiezo leyendo el diseño y el banco del acueducto para armar la planta en el motor.

### 🤖 Claude (hilo) · 18:03–18:39 UTC

Trabajo del hilo, resumido (las actualizaciones de estado no se reproducen):
- Leyó `AGENTS.md`, `docs/water-network-plant.md`, `docs/plant-engine.md`, el banco `network.py`, el motor de planta y los comportamientos de los 4 tipos del acueducto y de `vessel`.
- Agregó al motor un dominio hidráulico: puertos `hydraulic` en los contratos, `hydraulic_build` en los comportamientos y una sola red con los tubos del plano.
- Armó el edificio en `plant.yaml` (pisos cada 2,5 m) y `simulation.yaml` con los 13 equipos, y extendió el validador del plano para zonas con cota.
- Encontró una fuga en el balance de agua (dos tanques unidos por la succión) y la corrigió.
- Reescribió `network.py` para que lea los mismos tubos del plano y siga la columna en serie; con eso la estación necesita 20,94 mca, no 18,09.
- Encontró que el lazo de presión de las bombas oscilaba de 60 a 81 mca al dispararse una bomba; la red ahora responde dentro del paso, las dos bombas trabajan siempre y la que queda salta a la velocidad necesaria (68,9 mca un segundo, dentro de D29).

### 🤖 Claude (hilo) · 18:39:33 UTC · tarjeta de decisión

¿Qué salida fija dejo en la rama manual de la estación reguladora?

En la planta la columna de la rejilla va en serie, como la describiste: nivel 1, válvula entre niveles, nivel 2, y así hasta el 4. El banco anterior tenía una columna directa a cada nivel, y de ahí salió la consigna de 18,09 mca. Con la serie, la estación necesita 20,94 mca para dejar la casa crítica (c44 del nivel 4) en 15,45 mca. Con 18,09, la casa crítica queda en 13,0 mca, en rojo. La rama automática no cambia: busca sola los 15,45 mca. Sigo con 20,94 mientras respondes.

- **20,94 mca** (recomendada): la rama manual deja la casa crítica en 15,45 mca de día, igual que la automática.
- **18,09 mca**: se respeta el número confirmado, pero con la manual la casa crítica cae a 13,0 mca (rojo).
