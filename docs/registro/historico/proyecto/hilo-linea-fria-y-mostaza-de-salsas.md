---
tipo: historico-ia
fuente: hilo «Línea fría y mostaza de salsas» (Claude Projects)
desde: 2026-10-18 23:53
hasta: 2026-10-19 00:35
tags: [registro, historico-ia, salsas, capacidad]
---
# Hilo: línea fría y mostaza de la planta de salsas

Parte de [[historico-proyecto]] · Índice: [[00-indice]] · Bitácora: [[bitacora]] · Decisión: [[decisiones]] D53. Autor humano: Andy. Hora en UTC. Credenciales: ninguna.

---

### 👤 Andy · 23:53:04 UTC (chat del proyecto)

abre los hilos necesarios par aresponderte en cada uno y lo que hablamos de plasticos dehora de ruta tambien aplica para todos los gemelos digitales (el unico que tal vez queda diferente es el de aeropuerto donde unicamente es entrada y destino  y el de acueducto que se trata de condiciones de optimizacion de caudales presiones y ahorros)

### 🤖 Claude (coordinador) · 23:53 UTC

Abrió este hilo con el encargo: conectar en el motor la línea de emulsiones en frío (mayonesa natural, chipotle/jalapeño, salsa rosada, mayonesa-mostaza) y la de mostaza (báscula propia por alérgeno), como la línea caliente (PR #52). Reparto aprobado de 22 t/día: 40 % caliente, 45 % frío, 15 % mostaza; supuestos 16 h/día y 85 % de disponibilidad; tolerancias de peso en % por presentación.

### 🤖 Claude · 23:53 – 00:35 UTC

(Resumen, sin reproducir salidas de herramientas.) Leyó `AGENTS.md`, `flujo-planta-salsas.md`, `plant.yaml` y `simulation.yaml`. Comprobó tres límites del motor: no existe un tipo de librería para el emulsificador al vacío, una salida con caudal va a un solo destino, y el enlace pulmón → llenadora solo transmite demanda y disponibilidad. Decidió modelar el emulsificador y el tanque de mostaza con la marmita sin vapor, un solo pulmón frío para las tres llenadoras, y una pesadora por formato (la de mostaza dedicada por alérgeno). Descubrió que la receta de mostaza del plano (30 min de molienda) no cuadra con el molino de 1.000 kg/h. Escribió los presets, los enlaces, las líneas y dos escenarios con expectativas calculadas a mano, validó con `twin-lib plant validate`, `pytest` y `ruff`, comprobó la API en vivo y capturó la escena. Registró D53.
