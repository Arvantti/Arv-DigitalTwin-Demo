# Plan de desarrollo

La demo de las plantas de referencia (inyección, salsas y, desde el 2026-10-17, un acueducto a escala) se construye al mismo tiempo que la plataforma que construye gemelos digitales. Cada fase deja algo reutilizable.

| Fase | Contenido | Estado |
|---|---|---|
| 1. Layouts | `plant.yaml` de la planta de inyección y de la planta de salsas, validador y plano 2D | Hecho (PR #1) |
| 2. Librería de equipos | Contrato, runtime, 3 tipos de referencia, geometría paramétrica, galería, API de simulación, guía y skill de autoría | Hecho (PR #2) |
| 3. Equipos de las plantas | Resto de tipos con la guía de autoría: llenadoras, bandas, pasteurizador, emulsificador, molino coloidal, secadores, chillers, caldera, robots, etc. | En curso: línea de sachets hecha (PR #4); faltan emulsificador, molino coloidal, secadores, chillers, robots y otros |
| 4. Motor de planta | Instanciar `plant.yaml` con la librería; conectar equipos por puertos (material, piezas, servicios); recetas y líneas; KPIs de planta | En curso: motor, enlaces por puerto y línea caliente de 1.000 ml (ver `docs/plant-engine.md`) |
| 5. Escena de planta | Planta completa en 3D: celdas, pasillos, pasarelas, puente grúa, HUD de planta, selección de activos, cámaras | En curso: escena con zonas, equipos simulados, puente grúa, pasarelas, tuberías animadas, selección, cámaras con recorrido y HUD (ver `docs/plant-scene.md`); las tuberías se animan con el caudal de cada enlace del motor, incluido el desvío del pasteurizador hacia la marmita; la planta de inyección se ve con sus 29 inyectoras y la banda principal simuladas; faltan los equipos que aún no están en la librería |
| Acueducto a escala | Tercera planta: bombeo a 80 mca, estación reguladora automática y manual, rejilla de 4 niveles con consumos y fugas, recirculación; solucionador hidráulico en el motor; Navier-Stokes después | En curso: diseño (PR #13) y solucionador hidráulico (PR #14) hechos; faltan tipos de equipo, planta y escena (`docs/water-network-plant.md`) |
| 6. Persistencia y datos | PostgreSQL (activos, configuración, eventos, históricos), MQTT opcional, calidad y frescura de datos | |
| 7. Conector MCP | La herramienta como servidor MCP: el usuario crea equipos y plantas conversando con Claude (ver abajo) | |
| 8. Instalación en ARVANTTI Harness | Manifiesto de capacidad, permisos, Podman, actualización | |
| 9. Conectividad industrial | OPC UA y PLC en solo lectura, mapeo de variables reales a los contratos | |

---

## Fase 7: conector MCP para crear equipos y plantas

El usuario final no edita el repositorio. Le habla a Claude, le entrega fotos, catálogos o placas de datos, responde una entrevista corta y confirma una ficha del equipo. Con esa ficha, Claude usa las herramientas del servidor MCP de la plataforma para crear el equipo, validarlo, mostrarle una vista previa y publicarlo. El procedimiento es el mismo de `docs/equipment-authoring.md`; el MCP solo cambia el canal.

### Herramientas previstas

| Herramienta | Qué hace | Ya existe como |
|---|---|---|
| `list_equipment_types` | Tipos y presets disponibles | `twin-lib list`, `GET /api/equipment` |
| `get_equipment_type` | Contrato, presets y escenarios de un tipo | `GET /api/equipment/{type}` |
| `get_authoring_guide` | Guía, esquema y plantilla | `docs/`, `_schema/`, `_template/` |
| `get_interview_guide` | Bloques de preguntas y formato de la ficha para entrevistar al usuario | sección 1 de `docs/equipment-authoring.md` |
| `create_equipment_draft` | Crea o actualiza un borrador de tipo o de preset a partir de la ficha confirmada | — |
| `validate_equipment` | Contrato, comportamiento, escenarios y geometría | `twin-lib validate`, pruebas de geometría |
| `run_scenario` | Simula y devuelve KPIs, eventos y series | `twin-lib run`, WebSocket |
| `render_preview` | Devuelve la imagen del modelo para compararla con las fotos | `tools/preview/shot.sh` |
| `publish_equipment` | Pasa el borrador a la librería, con aprobación humana | — |
| `add_equipment_to_plant` / `edit_plant` | Ubica equipos en un `plant.yaml` y lo valida | `render_layout.py` |
| `get_asset_state` / `query_telemetry` / `run_simulation` | Consulta del gemelo en operación (sección 13.2 de la arquitectura) | API de simulación |

### Decisiones que se toman desde ahora para que el MCP sea una capa delgada

1. **Toda operación es una función de librería**, no solo un comando de terminal. El CLI, la API y el futuro MCP llaman a las mismas funciones de `twin_runtime`.
2. **Borradores separados de la librería publicada.** Lo que crea un usuario va a un espacio de borradores; solo pasa a la librería si valida y alguien lo aprueba.
3. **Seguridad del código generado.** `behavior.py` y `geometry.ts` son código. Para los usuarios finales:
   - **Preferido:** comportamientos declarativos, es decir, componer primitivas del runtime (secuenciador, retardos, PID, balances, fallas) desde YAML, sin código arbitrario. La mayoría de los equipos se puede expresar así.
   - **Cuando haga falta código:** ejecutarlo en un entorno aislado (contenedor sin red, con límites de CPU, memoria y tiempo) y exigir revisión humana antes de publicarlo.
   - Las geometrías de usuario se limitan a componer piezas de `@twin/3d`.
4. **Trazabilidad:** cada tipo guarda quién lo pidió, qué referencias se usaron (`provenance`, `sources`), la versión y las validaciones que pasó.
5. **El MCP no controla equipos físicos.** Solo crea modelos, simula y consulta, según la separación entre recomendación y ejecución de la arquitectura.
