# Escena de planta (fase 5)

La escena de planta dibuja un `plant.yaml` completo en 3D y, cuando la planta tiene `simulation.yaml`, la anima con la simulación del motor de planta (`docs/plant-engine.md`). Vive en la galería: `plant.html`.

```bash
uv run uvicorn twin_api.main:app --port 8000   # API (planos y simulación)
pnpm gallery                                    # http://localhost:5173/plant.html
```

Parámetros de URL, pensados para capturas automáticas:

| Parámetro | Efecto |
|---|---|
| `plant=<id>` | Planta (por defecto `sauce-plant-v1`; también `plastic-injection-plant-v1`, solo plano) |
| `camera=general` o `camera=<id de zona>` | Cámara inicial |
| `select=<id de equipo>` | Equipo seleccionado |
| `autosim=1&scenario=boiler-trip&speed=900` | Conecta la simulación al cargar |
| `lighting=day\|night\|golden`, `quality=high` | Iluminación y calidad |
| `shot=1` (`ui=1` conserva la interfaz) | Modo captura: `window.__ready` se marca al terminar; con `autosim`, tras recibir datos (`messages=N`) |

## Qué muestra

- **Zonas** como pisos de color por clase higiénica (sucia, limpia, alto cuidado, servicios, administrativa, exterior), con su volumen en líneas y su nombre.
- **Equipos simulados** con la geometría de su tipo de librería y los parámetros ya resueltos por la API (`sim.type`, `sim.params`). Se animan con los canales que publica el comportamiento; el modelo no calcula nada.
- **Equipos sin tipo en la librería** como volúmenes de su huella (`footprint`). Los marcados `overhead: true` (puente grúa de la planta de inyección) se dibujan como vías y viga puente a su altura.
- **Selección de activos:** clic en un equipo para ver su estado, fase, fallas, variables y los comandos y fallas que se pueden inyectar. Un clic en el piso deselecciona.
- **Cámaras:** vista general y una por zona de producción o servicios grande.
- **HUD de planta:** reloj de simulación, selector de escenario, velocidad, pausa, KPIs de cada línea y eventos de toda la planta.

## API

| Endpoint | Qué entrega |
|---|---|
| `GET /api/plants` | Plantas con plano y si tienen simulación conectada |
| `GET /api/plants/{id}` | Zonas, equipos (con `sim` si el motor los simula), líneas y escenarios |
| `WS /api/plants/{id}/simulate?scenario=&speed=` | Cada 100 ms: `{t, speed, paused, snapshot: {equipment, lines}, events}`. Cliente → servidor: `{equipment, command, args}`, `{speed}`, `{pause}` |

## Pendiente de la fase 5

- Pasarelas, escaleras y muros con aberturas: el `plant.yaml` aún no los describe (`aisles: []`).
- Tuberías y flujos animados sobre los `flows` del plano.
- Los equipos que faltan en la librería siguen siendo volúmenes (fase 3).
- Cámara de recorrido y selección desde la lista de activos.
