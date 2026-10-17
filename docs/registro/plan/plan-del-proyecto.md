---
tipo: plan
tags: [registro, plan]
actualizado: 2026-10-17
---
# Plan del proyecto

Índice: [[00-indice]] · Avances: [[bitacora]] · Decisiones: [[decisiones]]. Versión técnica viva en `docs/roadmap.md`.

## 1. Objetivo
Construir una **plataforma de gemelos digitales industriales** y demostrarla con dos plantas de referencia que cubren los dos tipos de manufactura:
- **Manufactura discreta:** planta de inyección de plástico.
- **Manufactura de procesos:** planta de procesamiento de salsas (tomate, mayonesa) con envasado en sachet.
- **Servicios públicos (agregada el 2026-10-17):** acueducto a escala de una ciudad: bombeo, estación reguladora de presión, red de cuatro niveles con consumos y fugas, y recirculación. Diseño en `docs/water-network-plant.md`; Navier-Stokes en una fase posterior.

Las plantas son inspiradas en empresas de Medellín, pero **sin usar nombres ni marcas reales** (decisión del autor, ver [[decisiones]]). Cada equipo es una pieza estandarizada y reutilizable de una **librería de equipos** (contrato, comportamiento simulado, geometría 3D, presets, escenarios y pruebas). Las plantas se arman instanciando esa librería. La herramienta se instalará en ARVANTTI Harness.

## 2. Alcance técnico
- `equipment-library/`: un tipo de equipo por carpeta (`equipment.yaml`, `behavior.py`, `geometry.ts`, presets, escenarios, pruebas).
- `packages/twin-runtime/` (Python): clase base, primitivas (PID, retardos, sensores, fallas, OEE, vapor), simulador y CLI `twin-lib`.
- `packages/twin-3d/` (three.js): piezas 3D, materiales PBR y escenario de render.
- `apps/api/` (FastAPI): simulación en vivo por WebSocket. `apps/gallery/`: galería web.
- `industrial-models/<planta>/plant.yaml` (layouts) y `simulation.yaml` (conexión por puertos).

## 3. Fases y estado
| Fase | Contenido | Estado a 2026-10-16 | Evidencia |
|---|---|---|---|
| 1. Layouts | `plant.yaml` de ambas plantas, validador y plano 2D | **Hecha** | [[bitacora]] PR #1 |
| 2. Librería de equipos | Contrato, runtime, 3 tipos de referencia, geometría paramétrica, galería, API de simulación, guía y skill de autoría | **Hecha** | PR #2 |
| 3. Equipos de las plantas | Resto de tipos con la guía de autoría | **En curso**: línea de sachets hecha (sachetadora, banda, túnel, control de peso, encajonadora, pasteurizador, caldera). Faltan emulsificador, molino coloidal, robots y otros. Planta de inyección: empaque, secadores, chillers y molino de reciclaje hechos | PR #3, #4, #14 |
| 4. Motor de planta | Instanciar `plant.yaml`, conectar equipos por puertos, recetas, líneas y KPIs | **En curso**: motor, enlaces por puerto y línea caliente de 1.000 ml | PR #5, #6 |
| 5. Escena de planta | Planta completa en 3D, HUD, selección de activos, cámaras | **En curso**: escena de la planta de salsas con equipos simulados en vivo, selección, cámaras con recorrido, HUD, pasarelas y tuberías animadas. Las tuberías se animan con el caudal real de cada enlace del motor, incluido el desvío del pasteurizador a la marmita; la planta de inyección se simula y se ve con sus 29 inyectoras y la banda principal. Faltan equipos de la librería | PR #8, PR #9, PR #10, PR #11, PR #12, `docs/plant-scene.md` |
| 6. Persistencia y datos | PostgreSQL, MQTT opcional, calidad y frescura de datos | Pendiente | — |
| 7. Conector MCP | El usuario crea equipos y plantas conversando con Claude (entrevista, ficha confirmada, borradores, validación, publicación con aprobación humana) | Pendiente; diseñada desde ahora | `docs/roadmap.md` |
| 8. Instalación en ARVANTTI Harness | Manifiesto, permisos, Podman, actualización | Pendiente | — |
| 9. Conectividad industrial | OPC UA y PLC en solo lectura | Pendiente | — |

| Acueducto a escala | Tercera planta: diseño, solucionador hidráulico, 4 tipos de equipo, planta y motor, escena 3D | **En curso**: diseño para revisión del autor | PR #13, `docs/water-network-plant.md` |

## 4. Reglas de calidad (no negociables)
- El modelo 3D nunca es fuente de verdad: solo refleja los canales que publica el comportamiento.
- Cada escenario con `expect` es una prueba con valores calculados a mano.
- Datos inciertos marcados como `assumed`.
- Tolerancias de peso en **porcentaje del nominal** de cada presentación ([[decisiones]]).
- Cada cambio visual se verifica con captura de la galería y la API de simulación antes del PR; ramas y PRs pequeños; CI en verde (pruebas Python, pruebas de geometría, lint).

## 5. Próximos pasos propuestos (pendientes de decisión del autor)
1. **Fase 5:** quedan los equipos de la librería que aún son volúmenes en las dos plantas. Hecho: escena base (PR #8), pasarelas, tuberías y recorrido (PR #9), caudal real por enlace (PR #10), desvío del pasteurizador (PR #11), inyectoras y banda de la nave de inyección (PR #12), empaque, secadores, chillers y molino de reciclaje con geometría propia (PR #14).
2. Resto de la planta de salsas en el motor: líneas de 250 ml y 500 ml, línea fría de mayonesa (requiere emulsificador, molino coloidal, chiller).
3. Planta de inyección: central de materiales y la cascada hacia las inyectoras (humedad de la resina, agua de enfriamiento de moldes, scrap hacia el molino). Empaque, secadores, chillers y molino ya tienen tipo y se simulan (PR #14).
4. Mejoras del motor: recetas leídas del `plant.yaml`. (El retorno del producto desviado a la marmita ya está: PR #11.)
5. Acueducto a escala: revisar el diseño y los supuestos S1–S7; después, solucionador hidráulico (PR siguiente).
6. Dato pendiente del autor: precisión real del dosificador de 1.000 ml y tolerancias reales por formato.

## 6. Metodología de trabajo con IA
El autor define objetivos y decisiones; la IA (Claude) propone, implementa, prueba y abre PRs; el autor revisa y aprueba cada PR antes del merge. Todo queda en [[historico-sesion-codigo]] y [[historico-proyecto]].
