# Plantas empaquetadas

Cada carpeta es una planta con su propio proyecto: modelo en la raíz (`plant.yaml`, `simulation.yaml`,
`manifest.yaml`, `catalog/`, `aps/`, `orders/`) y sus piezas de app (`cosim/`, `fractal/`, `app/`, `docs/`). Solo
importa `platform/` y el runtime; nunca otra planta. El runtime, la API y los validadores las encuentran igual que a
las de `industrial-models/`. Ver `docs/architecture/plataforma-y-plantas.md`.
