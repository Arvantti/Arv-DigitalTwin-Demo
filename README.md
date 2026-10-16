# Gemelo digital industrial (demo)

Gemelos digitales de referencia para dos tipos de manufactura:

| Planta | Tipo | Modelo |
|---|---|---|
| Inyección de artículos plásticos | Discreta | `industrial-models/plastic-injection-plant-v1/` |
| Salsas y aderezos | Por procesos (batch + continuo) | `industrial-models/sauce-plant-v1/` |

Las plantas son ficticias: los datos son estimaciones plausibles, no de una instalación real.

## Layouts

Cada planta se describe en `plant.yaml` (zonas, equipos, flujos, líneas y recetas).
Para validar el layout y regenerar el plano 2D (`layout.svg`):

```bash
pip install pyyaml
python tools/layout/render_layout.py industrial-models/<planta>/plant.yaml
```
