---
tipo: historico-ia
fuente: sesión de código pi
desde: 2026-10-22
hasta: 2026-10-22
tags: [registro, historico-ia, ciudad]
---
# Cartografía del centro de Medellín desde OpenStreetMap

- **Usuario:** «adelante» (continuar la tarea pendiente de corregir el mapa del gemelo de ciudad con datos reales de OpenStreetMap, en una rama separada).
- **IA:** Creó `feat/medellin-osm-network` desde `origin/main`.
- **IA:** Intentó consultar OpenStreetMap/Overpass desde Playwright; la API no respondió en el tiempo permitido. No afirmó haber extraído datos con éxito desde el navegador.
- **Usuario:** «/home/andydev/Coding/Arvantti-Software/DigitalTwin/city-models/ ahi guarde el archivo».
- **IA:** Encontró `city-models/map.osm`, extracto XML de OSM con bounds `6.242..6.264`, `-75.582..-75.564`, y metadatos de copyright/licencia ODbL.
- **Usuario:** dijo que el plano 2D no era un gemelo y pidió una escena 3D real con tráfico animado, comparable a los gemelos de planta.
- **Qué se implementó:** `tools/city/city_scene.py` procesa vías y edificios OSM en coordenadas métricas; `apps/gallery/src/city-scene.ts` muestra la escena Three.js con calles, edificios extruidos, semáforos y vehículos. `tools/city/osm_simulation.py` genera una red SUMO separada a partir de OSM y exporta FCD para reproducirla en el navegador. Las posiciones se corrigen por el offset de SUMO; las calzadas se construyen con su geometría, se excluyen del visor edificios que cruzan trayectorias observadas y la escena inicia en el momento de mayor densidad.
- **Usuario:** reportó errores de posición y poco volumen; después pidió triplicar vehículos y pintar las calles según velocidad, como Google Maps, con escala.
- **Qué se implementó:** muestra de 3.745 viajes en 15 min (14.980/h supuesto, casi 3× el flujo base), coloreado rojo–verde por velocidad media observada en cada segmento y leyenda en km/h. La demanda sigue siendo hipotética y no representa aforos medidos; la línea base analítica de 35 cruces continúa separada.
- **Usuario:** confirmó que `docs/arvantti-industrial-digital-twin.md` lo aportó y pidió incluirlo en el mismo commit OSM.
- **IA:** conservó ese documento sin modificarlo y fuera del PR de confecciones.
- **Verificación:** se generaron SVG/JSON cartográficos y FCD desde los datos locales. La muestra tiene un máximo de 2.084 vehículos simultáneos; no se encontraron posiciones muestreadas dentro de los edificios que se muestran. `pnpm --filter @twin/gallery typecheck` y `git diff --check` pasaron. No se ejecutaron suites Python locales; sus pruebas quedan para CI.
