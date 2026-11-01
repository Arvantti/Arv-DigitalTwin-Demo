# APS de la planta de plásticos

Pedido de Andy (2026-11-01) para la presentación con cliente del miércoles 2026-11-04. Continúa la fase E de
[datos reales](datos-reales.md) y la [programación a 30 días](programacion.md), solo para plásticos. El acueducto no
cambia.

## Cadena

```
pedidos (customer-orders.v1) ──► cosimulador (CALCULAR) ──► APS: propuesta ──► vigente (production-plan.v1)
programación manual (manual-sequence.v1) ──┘                                    │
                                                                                ▼
                                                    gemelo 3D (tabla y play) · centro de control · Fractal
```

- **Pedidos**: cartera inventada `CART-2026-11` (71 pedidos, clientes ficticios) más los que se agregan en pantalla.
  Ventana de entrega de una semana (`aps/aps.yaml`): un pedido llega entre 3 y 7 días antes de su entrega; los de
  importancia alta, entre 1 y 2.
- **Dos entradas**: la secuencia manual del planificador (`aps/plans/APS-MAN-01.json`, por orden de llegada y sin
  agrupar colores) o **CALCULAR**: el cosimulador coloca la producción con restricciones lineales (HiGHS en el
  navegador, menos de 1 s) priorizando las entregas. No es optimización multivariable: no mueve moldes; eso queda
  para Fractal.
- **Replanear desde AHORA**: lo que ya empezó queda congelado; la propuesta se compara con la vigente (a tiempo,
  pedidos tarde, atraso, cambios de color) y se adopta o se descarta.
- **Lotes**: tamaño por producto en `aps/aps.yaml`; cada fila del plan lleva `batch: [n, de]`.
- **Turnos**: dos de 8 h (06:00–14:00 y 14:00–22:00), lunes a sábado, del catálogo de demanda.

## Pantallas

- `aps.html`: PEDIDOS (indicadores, agregar pedido, tabla con estado) y PROGRAMACIÓN · GANTT (arriba una fila por
  orden con inicio, fin y entrega; abajo los recursos con los lotes de esas órdenes, cambios de color, paradas y carga).
  `?now=2026-11-04T10:00` fija la hora de la demo y `?reset=1` vuelve a la cartera inicial.
- `emulador.html`: plano 2D en tiempo real (ver abajo).
- `plant.html?plant=plastic-injection-plant-v1`: el panel lateral muestra la programación vigente y abre el APS y el
  emulador.

El sitio publicado no tiene servidor: pedidos agregados y programación vigente viven en el navegador
(`apps/gallery/src/aps-store.ts`, localStorage y BroadcastChannel), así el APS y el gemelo abiertos en dos ventanas se
enteran de los cambios. Cuando exista la API, solo cambia ese módulo.

## Emulador y falla de una máquina

`emulador.html` es el plano 2D de la planta en tiempo real: cada inyectora y celda de ensamble con su estado (produciendo,
sin orden, parada programada, fuera de servicio, fuera de turno), la orden y el lote en curso y las piezas que va
haciendo. Ahí, y solo ahí, se detiene una máquina AHORA por falla o paro de emergencia con una reparación estimada; el
emulador no programa paradas futuras (eso son escenarios del cosimulador y de Fractal).

El evento (`plant-event.v1`) llega a la vez a:

- **APS**: alerta con las órdenes de la vigente que quedan afectadas y la parada en la fila de la máquina del Gantt.
  CALCULAR replanea desde AHORA sin esa máquina: corta el lote en curso y pasa lo que faltaba a otra máquina con el
  mismo molde (por ejemplo, cubiertos de IMM-01 a IMM-02).
- **Gemelo 3D**: la máquina queda marcada en rojo y el panel lateral la lista fuera de servicio.

Con la vigente del cosimulador y una falla de IMM-01 el miércoles a las 10:00, la secuencia manual queda con 5 pedidos
tarde y el cosimulador mantiene el 100 % a tiempo (prueba en `cosim/adapters/plastic-injection-plant-v1/tests`).

## Resultado con la cartera de la demo (AHORA = 2026-11-04 10:00)

| Programación | A tiempo | Pedidos tarde | Atraso total | Cambios de color |
|---|---|---|---|---|
| Manual APS-MAN-01 | 91,5 % | 6 | 153,2 h | 11 |
| Cosimulador desde AHORA | 95,8 % | 3 | 80,1 h | 15 |

Los 3 pedidos tarde que quedan ya estaban en producción antes de AHORA (congelados). Desde el arranque de la cartera
el cosimulador llega al 100 %. Hace más cambios de color porque el programa lineal no los modela (reserva una purga por
turno); es un punto para Fractal.

## Siguiente

Play por día y hora sobre el gemelo, PLC por máquina y centro de control, y escenarios de Fractal (adelantar un pedido,
balancear la ocupación, falla con mudanza de molde a otra máquina del mismo tamaño).
