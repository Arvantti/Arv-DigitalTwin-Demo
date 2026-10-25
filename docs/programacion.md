# Programación de producción a 30 días

Fase E de [la hoja de ruta de datos reales](datos-reales.md), decisión D75. Pedido de Andy (2026-10-20): una tabla
de programación detallada en las plantas de salsas y de plásticos, que en la demo funcione siempre de hoy a 30 días,
con pedidos inventados que usen la capacidad, y una barra de tiempo para ver el gemelo en una fecha.

## Arquitectura acordada

Un solo gemelo y una sola línea de tiempo con tres zonas:

| Zona | Qué es | De dónde sale |
|---|---|---|
| Pasado | Lo ejecutado, congelado | El plan desde el origen de la demo (2026-01-05); nunca cambia al mover la ventana |
| Ahora | El gemelo en tiempo real que ya existe | Motor de planta y emulador |
| Futuro | Proyección determinística | El mismo plan, con semilla; un pedido urgente es un escenario aparte que replanea desde ahora |

Respuestas del autor (2026-10-20): el rango hacia atrás lo escoge el cliente (por defecto el mes en curso); plásticos
trabaja 2 turnos de lunes a sábado; la tabla va en el panel lateral de la escena 3D; carga al 85 % con algunos
pedidos atrasados al azar; el pedido urgente se pide desde la tabla del panel lateral.

## Paso E1 (este PR): pedidos, secuenciador y tabla

- **Demanda** en `industrial-models/<planta>/catalog/demand.yaml` (esquema común, sección `demand`): carga objetivo,
  turnos y días laborables, capacidad diaria por producto, tamaños de pedido, plazos, pedidos urgentes, pedidos con
  insumo tarde, paradas aleatorias y clientes ficticios.
- **Generador** (`twin_runtime.planning.generate_orders`): la semilla es (planta, fecha de entrega), así que los
  pedidos de una fecha no cambian aunque cambie el rango. En promedio piden `load_pct` de la capacidad diaria.
- **Secuenciador de referencia** (`build_plan`): despacho por lista, etapa por etapa de la ruta del catálogo. Se
  programan las etapas con herramental (receta, formato, molde) o con ciclo propio (ensamble). Cada equipo libre toma
  la orden lista con mayor prioridad y entrega más próxima, y prefiere la que no exige cambio de herramental o color.
  Respeta turnos, domingos, paradas aleatorias y el herramental montado (`setup.yaml`). Los lotes de receta se
  comparten entre pedidos del mismo granel (el sobrante queda en el pulmón). Produce apenas llega el pedido; es la
  línea base que Fractal deberá mejorar (fase F).
- **Pedido urgente** (`urgent=…, now=…`): lo que empezó antes de ahora queda igual; el resto se replanea con el
  urgente primero. `impact()` dice qué pedidos se mueven, cuáles pasan a tarde y cómo sale el urgente.
- **API del emulador**: `GET /api/schedules/{planta}?from&to&back=month|Nd` y `POST /api/schedules/{planta}/urgent`.
  Sin estado: aceptar un urgente lo guarda el navegador hasta la fase F.
- **Sitio publicado**: el despliegue guarda el plan de 35 días atrás a 45 adelante en
  `public/api/schedules/{planta}.json` y corre cada lunes; la escena recorta el rango. El pedido urgente necesita la API.
- **Escena** (`apps/gallery/src/schedule.ts`): sección PROGRAMACIÓN del panel lateral con el rango hacia atrás,
  indicadores (pedidos, % a tiempo, órdenes en curso, equipo más ocupado), ▦ TABLA (el panel se ensancha con la
  tabla de órdenes, filtros y la línea AHORA; clic en una orden selecciona su equipo y resalta la ruta del producto)
  y ＋ URGENTE (formulario, escenario, aceptar o descartar).
- CLI: `uv run twin-lib plan sauce-plant-v1` (resumen) o `--json`.

### Cifras de la demo (rango 1-oct a 19-nov de 2026)

| Planta | Pedidos | Tarde | Equipo más ocupado |
|---|---|---|---|
| Salsas | ≈ 270 con entrega en el rango | ≈ 8 % | tanque de mostaza y emulsor ≈ 45 % |
| Plásticos | ≈ 180 | ≈ 5 % | imm-21 (balde) ≈ 93 %, ensamble ≈ 85 % |

En salsas el 85 % es de las 22 t/día del plano (reparto 40/45/15); con las tasas de llenado y las recetas del plano
los equipos tienen holgura, por eso la ocupación es menor. En plásticos la capacidad es la del molde montado (un
molde por inyectora en `setup.yaml`) en 2 turnos; las inyectoras con productos fuera del catálogo no se programan.

## Siguientes pasos

- **E2**: barra de tiempo a nivel plan en la escena (estado de cada equipo, producto y pedido en la fecha elegida).
- **E3**: fotos de estado por turno y animación del motor al soltar la barra.
- **F**: Fractal reemplaza al secuenciador con el mismo contrato; pedidos y urgentes guardados en el servidor.
