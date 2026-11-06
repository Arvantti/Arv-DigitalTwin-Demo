# Planta de salsas (`sauce-plant-v1`)

Planta empaquetada como proyecto propio (`docs/architecture/plataforma-y-plantas.md`). Tres líneas y siete recetas:
la caliente cocina salsa de tomate, BBQ y picante; la fría emulsiona mayonesa light, mayonesa y salsa rosada; la de
mostaza hace mostaza. Diez SKU. Todos los datos de proceso son supuestos, inventados para
que la demo sea realista y coherente; no vienen de una planta real.

```
plant.yaml, simulation.yaml, manifest.yaml, layout.svg   plano, simulación por puertos y paquete portable
catalog/        materiales, productos (con grupo de alérgenos), recetas y formatos, montaje, demanda,
                tamaños de equipo y tiempos de cambio (changeovers.yaml: CIP, alérgenos, secuencia de
                recetas, lavado del pulmón y boquillas)
aps/aps.yaml    ventana de entrega, tandas, lotes, llenadoras multipropósito, tiempos de espera y puntaje de Fractal
aps/plans/      APS-MAN-01.json: secuencia del planificador de turno (manual-sequence.v1)
orders/         cartera-2026-11.json: 119 pedidos inventados (customer-orders.v1)
cosim/          @plants/sauce-plant-v1-cosim: modelo, cartera, plan manual, despacho y programa lineal (HiGHS)
docs/           esta nota
```

## Cambios de referencia, secuencia y limpiezas

CIP (limpieza en sitio) es lavar el equipo húmedo sin desarmarlo, haciendo circular agua, soda y ácido. Como en
plásticos el color o el pigmento, aquí manda el sabor, el color y el alérgeno: cada línea tiene un orden de recetas
de suave a fuerte (`changeovers.yaml`, `sequence`):

| Línea | Orden |
|---|---|
| caliente | tomate → BBQ → picante |
| fría | mayonesa light → mayonesa → salsa rosada |

- En la marmita o el emulsificador, ir hacia adelante en el orden es solo cambio de receta (45 min en caliente,
  60 en frío). Ir hacia atrás (picante → tomate, rosada → light) arrastra sabor y color: CIP completo de 90 min.
- Si el pulmón todavía tiene granel de otra receta cuando llega la tanda nueva, se bota y se lava: 35 min más
  (lavado del pulmón).
- En la llenadora, el cambio de granel es el mayor entre la tabla de alérgenos y la secuencia (adelante CIP corto
  35, atrás CIP completo 90); el cambio de formato (30 min) corre mientras tanto.

| Alérgenos, de → a | sin alérgenos (tomate, BBQ, picante) | mostaza | huevo y mostaza (mayonesas, rosada) |
|---|---|---|---|
| sin alérgenos | CIP corto 35 | CIP corto 35 | CIP corto 35 |
| mostaza | CIP completo 90 | CIP corto 35 | CIP corto 35 |
| huevo y mostaza | CIP completo 90 | CIP completo 90 | CIP corto 35 |

- Boquillas: cada 4 h de llenado, 15 min de limpieza de boquillas. Un CIP o un cambio de 15 min o más las deja
  limpias y reinicia la cuenta.
- CIP de rutina de 75 min dentro del turno al acumular 20 h de producción sin limpiar.

El mismo granel en el lote siguiente no limpia, aunque cambie la presentación (solo cambia el formato).

## Tandas, lotes y tiempo de espera

| Granel | Línea | Tanda | Sale | Espera máxima en el pulmón |
|---|---|---|---|---|
| salsa de tomate, BBQ, picante | caliente | 2.000 kg | 1.960 kg | 4 h a 85 °C o más |
| mayonesa | fría | 1.500 kg | 1.477,5 kg | 24 h a 18 °C o menos |
| mayonesa light | fría | 1.500 kg | 1.477,5 kg | 12 h a 18 °C o menos |
| salsa rosada | fría | 1.500 kg | 1.477,5 kg | 24 h a 18 °C o menos |
| mostaza | mostaza | 1.000 kg | 985 kg | 48 h a temperatura ambiente |

Varios pedidos del mismo granel comparten tanda. Si lo que falta es poco, se cocina una tanda parcial (desde 50 %,
de 10 en 10 %, mismo tiempo de línea; `aps/aps.yaml`, `partial_batch`). El lote de llenado de cada SKU es lo que sale
de una tanda, redondeado hacia abajo a cajas completas. Lo que vence en el pulmón es merma.

## Llenadoras multipropósito

Las dos llenadoras de 250 ml en frío comparten mayonesa y mostaza por un colector con válvulas de tres vías
(`plant.yaml`): la 01 (habitual mayonesa) puede llenar mostaza y la 03 (habitual mostaza) puede llenar mayonesa. Pasar
de mayonesa a mostaza exige CIP completo (huevo); al revés basta el corto. La salsa caliente no se cruza: necesita el
túnel de enfriamiento de su línea. El secuenciador de referencia (`twin-lib plan`) sigue usando la ruta habitual; la
alternativa la usa el APS.

## Cartera y plan manual de la demo

Mismas fechas que plásticos: día 0 = lunes 2026-10-26, entregas del día 1 al 19, AHORA = día 9. 119 pedidos de los
diez SKU, con carga cercana al 65 % de la capacidad diaria de cada SKU (`catalog/demand.yaml`, `load_pct`; con siete
recetas, los cambios se comen buena parte del turno).
El plan manual APS-MAN-01 sigue el orden de llegada y alterna las llenadoras de 1.000 ml y las multipropósito, sin
agrupar recetas, mirar la secuencia ni los alérgenos: hace CIP de más, que es lo que el cosimulador y Fractal van a mejorar.

```bash
pnpm --filter @plants/sauce-plant-v1-cosim make-portfolio   # regenera cartera y plan manual (Node 26)
pnpm --filter @plants/sauce-plant-v1-cosim test
uv run twin-lib catalog validate sauce-plant-v1
```

## Cosimulador

El cuello de botella es el proceso, no el llenado: cada línea saca sus recetas en tandas al ritmo de la capacidad
aprobada (22 t/día: caliente 550 kg/h, fría 618,75 kg/h, mostaza 206,25 kg/h; `aps/aps.yaml`, `lines`).
Una tanda ocupa la línea 213,8 / 143,3 / 286,5 min y no pasa de un día a otro. Las llenadoras van a su ritmo del plano
(30 a 100 sachets/min) y toman el granel cuando la tanda está lista y antes de que se venza.

- `plan.ts`: el despacho. Avanza siempre por la línea que puede arrancar antes; toma el granel del pulmón o hace una
  tanda nueva (entera o parcial, con su cambio de receta, CIP por secuencia o lavado del pulmón); llena en la
  llenadora del tramo o en la que pueda empezar antes (la habitual primero); suma el CIP por alérgeno o secuencia,
  el cambio de formato, las boquillas y el CIP de rutina; cuenta como merma lo que se vence o sobra. Lo que quedó en el
  pulmón se aprovecha antes de que se venza (si el tramo siguiente no alcanza, pasa adelante uno de los 8 siguientes
  de la misma línea que sí) y no se cocina una tanda que ninguna llenadora alcanza a tomar a tiempo: se corre. Replanea desde AHORA
  con lo anterior congelado, con fallas del emulador: una falla de la caldera, el pasteurizador o un equipo de la
  línea para la línea; una falla de una llenadora, solo esa llenadora.
- `solve.ts`: programa lineal por turnos (HiGHS): kilos de cada pedido por línea y turno, con la capacidad en tandas
  enteras por día (90 % en las líneas de varias recetas, para dejar lugar a los cambios), minimizando el atraso
  ponderado por importancia. Dentro de cada turno ordena por la secuencia de recetas empezando por la que tiene la
  línea. Después, el mismo despacho.
- `manual.ts`: el plan del planificador (APS-MAN-01) en el tiempo, por orden de llegada.

Con la cartera de la demo, el plan manual deja 11 pedidos tarde (568 h de atraso), 52 h de CIP (10 cambios por
alérgeno) y 8.645 kg de merma. Replaneando en AHORA (día 9, miércoles 4 de noviembre a las 10:00), el solver baja a
10 tarde, 498 h, 51 h de CIP (7 por alérgeno) y 3.936 kg (`pnpm --filter @plants/sauce-plant-v1-cosim test`). La
mejora es moderada, y desde el día 0 el solver no siempre le gana al manual: reparte kilos por turno pero no arma
campañas de recetas; eso lo hace Fractal (fase 5).

## Pantalla del APS

`app/` es la pantalla del APS de salsas; la galería la publica en `aps-salsas.html` y el portal la enlaza
(`APS · PEDIDOS Y GANTT`). Arranca con el plan manual (APS-MAN-01) vigente y AHORA en el día 9 (miércoles 4 de
noviembre, 10:00; `?now=` lo cambia).

- PEDIDOS: los 119 pedidos con cliente, producto, entrega, cuándo termina, atraso y si están hechos, en curso o por
  hacer en AHORA; arriba, los indicadores del plan. Clic en un pedido lo sigue en el Gantt.
- PROGRAMACIÓN · GANTT: una fila por equipo de proceso (tandas T/BBQ/PI, LI/MY/RO y MS con su número; las
  parciales lo dicen al pasar el mouse) y una por llenadora; el cambio va rayado al comienzo de cada barra: rojo el
  CIP por alérgeno, celeste el CIP, violeta el cambio de receta, ámbar el lavado del pulmón, verde las boquillas,
  blanco el cambio de formato, paradas,
  fuera de turno y la línea de AHORA; ventana de 3 días, 7 días o todo el horizonte.
- CALCULAR CON EL COSIMULADOR: HiGHS en el navegador desde AHORA con lo anterior congelado. La propuesta muestra
  pedidos tarde, atraso, cambios, CIP y merma contra el plan vigente, y el puntaje de abajo; se aprueba o se descarta.
  PLAN MANUAL vuelve a APS-MAN-01.

`view.ts` arma lo que se pinta (sin DOM) y lo cubren las pruebas (`pnpm --filter @plants/sauce-plant-v1-app test`).

## Puntaje de Fractal

Menor es mejor: horas de atraso + 20 × pedidos tarde + 2 × horas de CIP + 1 × horas de cambio de formato + 0,05 × kg
de merma (`aps/aps.yaml`, `score`).
