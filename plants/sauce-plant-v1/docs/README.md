# Planta de salsas (`sauce-plant-v1`)

Planta empaquetada como proyecto propio (`docs/architecture/plataforma-y-plantas.md`). Tres familias: salsa de tomate
(proceso en caliente), mayonesa (emulsión en frío) y mostaza. Todos los datos de proceso son supuestos, inventados para
que la demo sea realista y coherente; no vienen de una planta real.

```
plant.yaml, simulation.yaml, manifest.yaml, layout.svg   plano, simulación por puertos y paquete portable
catalog/        materiales, productos (con grupo de alérgenos), recetas y formatos, montaje, demanda,
                tamaños de equipo y tiempos de cambio (changeovers.yaml: CIP y alérgenos)
aps/aps.yaml    ventana de entrega, tandas, lotes, llenadoras multipropósito, tiempos de espera y puntaje de Fractal
aps/plans/      APS-MAN-01.json: secuencia del planificador de turno (manual-sequence.v1)
orders/         cartera-2026-11.json: 104 pedidos inventados (customer-orders.v1)
cosim/          @plants/sauce-plant-v1-cosim: modelo, cartera y plan manual; el programa lineal llega en la fase 3
docs/           esta nota
```

## Cambios de referencia y CIP

CIP (limpieza en sitio) es lavar el equipo húmedo sin desarmarlo, haciendo circular agua, soda y ácido. Un cambio en
un equipo húmedo suma el cambio de receta (45–60 min, en la marmita, el emulsificador o el tanque de mostaza) o el de
formato (30 min, en la llenadora, se hace mientras corre el CIP) y la limpieza entre productos:

| De → a | sin alérgenos (tomate) | mostaza | huevo y mostaza (mayonesa) |
|---|---|---|---|
| sin alérgenos | CIP corto 35 | CIP corto 35 | CIP corto 35 |
| mostaza | CIP completo 90 | CIP corto 35 | CIP corto 35 |
| huevo y mostaza | CIP completo 90 | CIP completo 90 | CIP corto 35 |

El mismo producto en el lote siguiente no limpia. Además, CIP de rutina de 75 min al cierre del día o tras 20 h de
producción continua.

## Tandas, lotes y tiempo de espera

| Granel | Tanda | Sale | Espera máxima en el pulmón |
|---|---|---|---|
| salsa de tomate | 2.000 kg | 1.960 kg | 4 h a 85 °C o más |
| mayonesa | 1.500 kg | 1.477,5 kg | 24 h a 18 °C o menos |
| mostaza | 1.000 kg | 985 kg | 48 h a temperatura ambiente |

Varios pedidos del mismo granel comparten tanda. El lote de llenado de cada SKU es lo que sale de una tanda,
redondeado hacia abajo a cajas completas (cuentas en `aps/aps.yaml`). Lo que vence en el pulmón es merma.

## Llenadoras multipropósito

Las dos llenadoras de 250 ml en frío comparten mayonesa y mostaza por un colector con válvulas de tres vías
(`plant.yaml`): la 01 (habitual mayonesa) puede llenar mostaza y la 03 (habitual mostaza) puede llenar mayonesa. Pasar
de mayonesa a mostaza exige CIP completo (huevo); al revés basta el corto. La salsa caliente no se cruza: necesita el
túnel de enfriamiento de su línea. El secuenciador de referencia (`twin-lib plan`) sigue usando la ruta habitual; la
alternativa la usa el APS.

## Cartera y plan manual de la demo

Mismas fechas que plásticos: día 0 = lunes 2026-10-26, entregas del día 1 al 19, AHORA = día 9. 104 pedidos de los
seis SKU (unos 17–18 de cada uno), con carga de 75–90 % de la capacidad diaria de cada SKU, 12 de importancia alta.
El plan manual APS-MAN-01 sigue el orden de llegada y alterna las llenadoras de 1.000 ml y las multipropósito, sin
agrupar recetas ni mirar alérgenos: hace CIP de más, que es lo que el cosimulador y Fractal van a mejorar.

```bash
pnpm --filter @plants/sauce-plant-v1-cosim make-portfolio   # regenera cartera y plan manual (Node 26)
pnpm --filter @plants/sauce-plant-v1-cosim test
uv run twin-lib catalog validate sauce-plant-v1
```

## Puntaje de Fractal

Menor es mejor: horas de atraso + 20 × pedidos tarde + 2 × horas de CIP + 1 × horas de cambio de formato + 0,05 × kg
de merma (`aps/aps.yaml`, `score`).
