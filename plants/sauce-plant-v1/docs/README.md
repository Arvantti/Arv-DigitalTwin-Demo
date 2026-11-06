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
cosim/          @plants/sauce-plant-v1-cosim: modelo, cartera, plan manual, despacho y programa lineal (HiGHS)
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

El mismo granel en el lote siguiente no limpia, aunque cambie la presentación (solo cambia el formato). Además, CIP de
rutina de 75 min dentro del turno al acumular 20 h de producción sin limpiar.

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

## Cosimulador

El cuello de botella es el proceso, no el llenado: cada granel sale de su línea en tandas enteras al ritmo de la
capacidad aprobada (22 t/día: tomate 550 kg/h, mayonesa 618,75 kg/h, mostaza 206,25 kg/h; `aps/aps.yaml`, `lines`).
Una tanda ocupa la línea 213,8 / 143,3 / 286,5 min y no pasa de un día a otro. Las llenadoras van a su ritmo del plano
(30 a 100 sachets/min) y toman el granel cuando la tanda está lista y antes de que se venza.

- `plan.ts`: el despacho. Avanza siempre por la línea que puede arrancar antes; toma el granel del pulmón o hace una
  tanda nueva; llena en la llenadora del tramo o en la que pueda empezar antes (la habitual primero); suma el CIP por
  alérgeno, el cambio de formato y el CIP de rutina; cuenta como merma lo que se vence o sobra. Lo que quedó en el
  pulmón se aprovecha antes de que se venza (si el tramo siguiente no alcanza, pasa adelante uno de los 8 siguientes
  que sí) y no se cocina una tanda que ninguna llenadora alcanza a tomar a tiempo: se corre. Replanea desde AHORA
  con lo anterior congelado, con fallas del emulador: una falla de la caldera, el pasteurizador o un equipo de la
  línea para la línea; una falla de una llenadora, solo esa llenadora.
- `solve.ts`: programa lineal por turnos (HiGHS): kilos de cada pedido por línea y turno, con la capacidad en tandas
  enteras por día, minimizando el atraso ponderado por importancia. Después, el mismo despacho.
- `manual.ts`: el plan del planificador (APS-MAN-01) en el tiempo, por orden de llegada.

Con la cartera de la demo, el plan manual deja 13 pedidos tarde (382 h de atraso), 56 cambios, 37 h de CIP y
1.763 kg de merma; el del solver, ninguno tarde, 18 cambios, 12 h de CIP y 3.723 kg de merma (una tanda de tomate
más: reparte los pedidos por turnos y el tomate solo aguanta 4 h en el pulmón). Replaneando el manual en AHORA
(día 9, miércoles 4 de noviembre a las 10:00), el solver baja a 9 pedidos tarde, 221 h de atraso, 34 cambios y 24 h
de CIP (`pnpm --filter @plants/sauce-plant-v1-cosim test`).

## Pantalla del APS

`app/` es la pantalla del APS de salsas; la galería la publica en `aps-salsas.html` y el portal la enlaza
(`APS · PEDIDOS Y GANTT`). Arranca con el plan manual (APS-MAN-01) vigente y AHORA en el día 9 (miércoles 4 de
noviembre, 10:00; `?now=` lo cambia).

- PEDIDOS: los 104 pedidos con cliente, producto, entrega, cuándo termina, atraso y si están hechos, en curso o por
  hacer en AHORA; arriba, los indicadores del plan. Clic en un pedido lo sigue en el Gantt.
- PROGRAMACIÓN · GANTT: una fila por equipo de proceso (tandas T/MY/MS con su número) y una por llenadora (llenados
  con el cambio rayado al comienzo: rojo el CIP por alérgeno, celeste el CIP, blanco el cambio de formato), paradas,
  fuera de turno y la línea de AHORA; ventana de 3 días, 7 días o todo el horizonte.
- CALCULAR CON EL COSIMULADOR: HiGHS en el navegador desde AHORA con lo anterior congelado. La propuesta muestra
  pedidos tarde, atraso, cambios, CIP y merma contra el plan vigente, y el puntaje de abajo; se aprueba o se descarta.
  PLAN MANUAL vuelve a APS-MAN-01.

`view.ts` arma lo que se pinta (sin DOM) y lo cubren las pruebas (`pnpm --filter @plants/sauce-plant-v1-app test`).

## Puntaje de Fractal

Menor es mejor: horas de atraso + 20 × pedidos tarde + 2 × horas de CIP + 1 × horas de cambio de formato + 0,05 × kg
de merma (`aps/aps.yaml`, `score`).
