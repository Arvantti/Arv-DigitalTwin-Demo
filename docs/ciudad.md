# Gemelo de ciudad: centro de Medellín (zona B reducida)

Estado: **fase 1 hecha** (red vial y demanda hipotética, validadas y con plano). Sin motor de tráfico ni escena 3D todavía.
Pedido: Andy, 2026-10-19 (hilo «Gemelo digital de ciudad», ver `docs/registro/historico/proyecto/hilo-gemelo-de-ciudad.md`).
El plan completo para debatir está en el documento «Plan: gemelo digital de ciudad (centro de Medellín)» del proyecto; aquí va el resumen técnico.

## 1. Qué representa

Un pedazo del centro de Medellín, **aproximado e inventado**, para simular un día completo de tráfico con vehículos autónomos
(cada vehículo es un agente con origen, destino y prisa) y luego probar escenarios con Fractal: calles nuevas, glorietas,
otros tiempos de semáforo. Los datos son supuestos (`assumed: true`) hasta tener datos reales del SIMM.

Decisiones del autor (D65):
- Zona B del plan (centro entre la avenida del Ferrocarril, la Oriental, San Juan y Juan del Corral) **con la mitad de intersecciones**: 35 en vez de 60 a 80.
- Sin imágenes satelitales: esa línea se descartó (16:54 UTC).
- Escenario hipotético verosímil, no datos reales todavía.
- El enjambre de agentes va separado del gemelo (el gemelo aplica la física y los semáforos; cada agente decide).

## 2. Archivos

| Archivo | Qué tiene |
|---|---|
| `city-models/centro-medellin-v1/network.yaml` | 7 carreras x 5 calles con sentido, carriles, límite y separador; 20 cruces con semáforo y sus planes de tiempos por franja; tramos adicionales para escenarios |
| `city-models/centro-medellin-v1/demand.yaml` | 60.000 entradas al día, perfil de 24 h, 7 franjas con velocidad esperada y % de agentes con afán, mezcla de 7 tipos de vehículo, pico y placa, atractores |
| `city-models/centro-medellin-v1/layout.svg` | Plano generado (no se edita a mano) |
| `tools/city/network.py` | Valida la red y la demanda y dibuja el plano |
| `tools/city/tests/test_network.py` | Pruebas (tamaño, horas sobre capacidad, sentidos, ciclos, conectividad, calle nueva) |

```bash
uv run python tools/city/network.py city-models/centro-medellin-v1   # valida, resume y escribe layout.svg
uv run pytest -q tools/city/tests
```

## 3. La red

- Cuadrícula de 900 x 720 m: carreras cada 150 m (Ferrocarril, 55, 53, Bolívar, 50, 48, Oriental) y calles cada 180 m (San Juan, 46, Pichincha, Colombia, Juan del Corral).
- Avenidas de doble sentido con 3 carriles por sentido y separador (Ferrocarril, Oriental, San Juan); Bolívar, Colombia y Juan del Corral con 2 por sentido; el resto de sentido único alterno con 2 carriles.
- Cada calle sigue 100 m fuera de la zona hasta una **puerta**: 18 de entrada y 18 de salida. Las entradas se reparten por carriles.
- **20 semáforos**: todos los cruces de las tres avenidas y de Colombia. Los otros 15 cruces van con pare o prioridad.
- Planes de dos fases (carreras / calles) por franja: 60 s de madrugada, 120 s en los picos y 90 s el resto, con 3 s de amarillo y 2 s de todo rojo por fase. El validador exige que verdes + 10 s cierren el ciclo.
- Una calle nueva de un escenario se agrega en `extra_links` (desde, hasta, carriles, velocidad); el largo se calcula.

![Plano de la red](../city-models/centro-medellin-v1/layout.svg)

## 4. Demanda hipotética

Escalada a la mitad del escenario del plan porque la zona tiene la mitad de cruces: **60.000 entradas al día** y capacidad supuesta
de **4.250 por hora**. El pico es de 5.100 veh/h a las 7:00, y la zona queda sobre la capacidad a las 7, 17 y 18 h.

Mezcla: motos 30 %, carros 28 %, taxis 12 %, motos de domicilio 10 %, carga liviana 10 %, buses 6 %, carga pesada 4 %
(prohibida en los picos). Pico y placa saca el 20 % de los carros de 6 a 20 h. El 30 % de los viajes termina dentro de la zona,
en cuatro atractores (comercio, oficinas, parqueadero, hospital).

## 5. Lo que sigue (fases del plan)

1. ~~Red y datos~~ (esta entrega, con red aproximada a mano porque OpenStreetMap no es accesible desde el entorno de trabajo).
2. Gemelo base: motor de tráfico con semáforos por franja y agentes simples, 24 h en el servidor. Pendiente de decidir: SUMO o motor propio.
3. Vista 3D de la ciudad en el visor actual, reproduciendo la corrida, con el panel de curvas de 24 h.
4. Enjambre: los agentes en un proceso aparte con la interfaz estado → acción y los perfiles de prisa por hora.
5. Escenarios con Fractal y panel de monitoreo con los 15 indicadores y el criterio de éxito del plan.

Preguntas abiertas para el autor: qué es el motor «JEV» de cada agente, SUMO o motor propio, y si habrá presupuesto para tráfico en vivo.
