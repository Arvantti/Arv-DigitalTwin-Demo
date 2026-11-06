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
orders/         cartera-2026-11.json: 128 pedidos inventados (customer-orders.v1)
cosim/          @plants/sauce-plant-v1-cosim: modelo, cartera, plan manual, despacho y programa lineal (HiGHS)
fractal/        @plants/sauce-plant-v1-fractal: escenarios y palancas de Fractal sobre el cosimulador
app/            @plants/sauce-plant-v1-app: APS (pedidos, Gantt, Fractal), emulador y centro de control
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

Mismas fechas que plásticos: día 0 = lunes 2026-10-26, entregas del día 1 al 19, AHORA = día 9. 128 pedidos de los
diez SKU, con carga del 70 % de la capacidad diaria de cada SKU (`catalog/demand.yaml`, `load_pct`). Los pedidos se
sortean día por día y al final las cantidades de cada SKU se escalan para que el total sea exactamente esa carga (con
pocos pedidos al día, el azar dejaba la línea fría al 85 %). Con los cambios de receta y las limpiezas, las líneas de
proceso quedan ocupadas entre 72 y 86 %.
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
  de la misma línea que sí, siempre que no entregue más de un día después del que espera: si no, la receta que corre
  se come la línea y las recetas pequeñas no entran nunca) y no se cocina una tanda que ninguna llenadora alcanza a tomar a tiempo: se corre. Replanea desde AHORA
  con lo anterior congelado, con fallas del emulador: una falla de la caldera, el pasteurizador o un equipo de la
  línea para la línea; una falla de una llenadora, solo esa llenadora.
- `solve.ts`: programa lineal por turnos (HiGHS): kilos de cada pedido por línea y turno, con la capacidad en tandas
  enteras por día (90 % en las líneas de varias recetas, para dejar lugar a los cambios), minimizando el atraso
  ponderado por importancia, con un empujoncito hacia el último turno que llega a tiempo (deja los primeros turnos
  para los urgentes y no cocina antes de tiempo). Dentro de cada turno ordena por la secuencia de recetas empezando por la que tiene la
  línea. Después, el mismo despacho.
- `manual.ts`: el plan del planificador (APS-MAN-01) en el tiempo, por orden de llegada.

Con la cartera de la demo, el plan manual deja 9 pedidos tarde (244 h de atraso), 87 h de CIP (10 cambios por
alérgeno) y 8.874 kg de merma. Replaneando en AHORA (día 9, miércoles 4 de noviembre a las 10:00), el solver baja a
3 tarde (los que ya habían salido tarde antes de AHORA), 84 h de atraso, 84 h de CIP (6 por alérgeno) y 5.722 kg.
Con la caldera parada de 10:00 a 16:00, seguir la secuencia del planificador deja 5 tarde y 130 h; el solver, 3 y 84 h.
Con la llenadora de mostaza caída hasta el día 11, 14 tarde y 498 h contra 3 y 84 h
(`pnpm --filter @plants/sauce-plant-v1-cosim test`). Las llenadoras quedan ocupadas 11 a 23 %: van 2 a 4 veces más
rápido que el proceso y esperan la tanda.

## Pantalla del APS

`app/` es la pantalla del APS de salsas; la galería la publica en `aps-salsas.html` y el portal la enlaza
(`APS · PEDIDOS Y GANTT`). Arranca con el plan manual (APS-MAN-01) vigente y AHORA en el día 9 (miércoles 4 de
noviembre, 10:00; `?now=` lo cambia).

- PEDIDOS: los 128 pedidos con cliente, producto, entrega, cuándo termina, atraso y si están hechos, en curso o por
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

## Fractal

`fractal/study.ts` arma estudios de escenario con el bucle de `platform/fractal-core`: cada combinación de palancas la
coloca el cosimulador desde AHORA y Fractal recomienda la de menor puntaje. La pestaña FRACTAL · ESCENARIOS del APS los
corre en el navegador (menos de un segundo) y deja ver o adoptar cualquier opción.

Palancas (opciones de `solve.ts` o del modelo):

- campañas por día (`campaign: "dia"`): cada línea recorre su orden de recetas una vez al día, no una vez por turno;
- recetas pequeñas cada 2 o 3 días (`minorEvery`): BBQ, picante, light y rosada solo uno de cada N días, todas juntas
  (la receta principal de cada línea, la de más kilos en la demanda, va todos los días);
- llenadoras dedicadas (`dedicated`): cada producto solo en su llenadora habitual; las multipropósito no se cruzan;
- prioridad alta para el pedido que se adelanta.

Escenarios y resultados con la cartera de la demo, desde el plan manual en AHORA (`pnpm --filter
@plants/sauce-plant-v1-fractal test`):

| Escenario | Opciones | Recomienda |
|---|---|---|
| Adelantar un pedido | nueva fecha; + prioridad alta; + campañas por día | prioridad + campañas por día |
| Menos CIP y merma | recolocar; campañas por día; + pequeñas cada 2 días; + cada 3 días; + llenadoras dedicadas | campañas por día: CIP 83,8 → 78,2 h, merma 5.722 → 4.395 kg, mismos 3 tarde |
| Falla de un equipo | esperar y repartir; campañas por día; + llenadoras dedicadas (si es una llenadora) o + pequeñas cada 3 días | campañas por día |

Las recetas pequeñas cada 3 días dan el menor CIP (68,6 h) y la menor merma (3.861 kg), pero 2 pedidos tarde más:
el puntaje prefiere no atrasar. Con la llenadora de mostaza caída, no cruzar llenadoras deja 11 pedidos tarde.

La falla llega del emulador (abajo) o se simula en la tarjeta del escenario (equipo y horas hasta la reparación).
Cualquiera de las dos queda en el estado compartido: la ven el centro de control y CALCULAR.

## Emulador y centro de control

El emulador (`emulador-salsas.html`) hace de planta real y el centro de control (`control-salsas.html`) recibe sus
señales; el portal los enlaza. Las dos pantallas viven en `app/` y muestran la programación vigente del APS en el
instante mostrado: AHORA (día 9, 10:00) o, desde la fase 7, el del play del gemelo 3D.

- Equipos con PLC (`plant-state.ts`, `plcEquipment`): cada línea con sus equipos de proceso (marmitas,
  emulsificador, tanque de mostaza) y los que la detienen si fallan (`aps.yaml`, `down_with`: caldera,
  pasteurizadores, tanque de fase acuosa, molino coloidal, molino de mostaza), y las seis llenadoras.
- Estado: produciendo, cambio o limpieza (CIP, CIP por alérgeno, receta, formato, boquillas, lavado del pulmón, con
  su hora de fin), sin orden, parada programada, fuera de servicio, detenido (por la falla de otro equipo de su
  línea: la caldera caída detiene marmitas y pasteurizadores) y fuera de turno.
- Emulador: plano de la caldera, proceso, CIP, pulmones, llenado y encajado; clic en un equipo muestra su tanda o su
  llenado con el avance y sus valores de proceso (temperatura de cocción, vacío y rotor del emulsificador, presión
  de vapor, velocidad y mordaza de la llenadora). Ahí se declara una falla o un paro de emergencia en el instante
  mostrado con su reparación estimada (`plant-event.v1`), y se restablece.
- Centro de control: OEE de la planta y de cada equipo en el turno (disponibilidad × rendimiento × calidad; calidad
  supuesta de 99 %), kilos cocinados y sachets buenos del turno, equipos en limpieza CIP, tanda o llenado en curso,
  ocupación de la semana contra la disponibilidad y por día, y las alarmas con el enlace para replanear en el APS.
- Estado compartido (`store.ts`): la programación adoptada en el APS, los eventos del emulador y el reloj del gemelo
  se guardan en el navegador (localStorage) y se avisan por BroadcastChannel, así las pantallas abiertas se enteran al
  instante. El APS muestra la alarma de la falla, la usa en Fractal y en CALCULAR; `?reset=1` en el APS vuelve al
  plan manual sin fallas.

Los valores de proceso, el rendimiento del OEE y las causas de falla son supuestos coherentes con `plant.yaml`; no
hay señales reales. Las pruebas de `tests/plant-state.test.ts` cubren el estado, la caldera que detiene la línea
caliente, el CIP por alérgeno en curso, el OEE y la ocupación.

## Puntaje de Fractal

Menor es mejor: horas de atraso + 20 × pedidos tarde + 2 × horas de CIP + 1 × horas de cambio de formato + 0,05 × kg
de merma (`aps/aps.yaml`, `score`).
