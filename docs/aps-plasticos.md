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

## Centro de control, PLC por máquina y play

- `control.html` (centro de control): recibe las señales de los PLC de todas las máquinas. OEE de la planta y de cada
  máquina en el turno (disponibilidad × rendimiento × calidad), unidades buenas, orden y lote en curso con su avance,
  alarmas del emulador y las inyectoras en reserva. No manda nada: la programación es del APS.
- PLC de cada máquina: al hacer clic en una inyectora o en la celda de ensamble del gemelo 3D, el panel muestra sus
  señales en el instante del gemelo (estado, orden, producto, color, lote, unidades, ciclo, OEE del turno).
- Play por día y hora: barra de tiempo en el gemelo 3D desde 3 días atrás (lo ejecutado) hasta una semana adelante
  (lo programado), con velocidad de 15 min/s a 12 h/s y EN VIVO. Sobre cada máquina va un letrero con su estado, la
  orden, el producto, el color y el lote, así se ve cuándo pasa de un producto a otro o hace un cambio de color.

Las señales salen del gemelo (`apps/gallery/src/plant-state.ts`): la programación vigente más los eventos del
emulador. El rendimiento y la calidad son supuestos por máquina y día (88–97 % y 97,5–99,6 %).

### Transporte de estibas por el piso

Las rutas aéreas de producto siguen igual. Además, el gemelo 3D muestra el movimiento físico de las estibas a partir de
la programación vigente (`apps/gallery/src/pallet-transport.ts`):

- la estiba en armado del buffer de cada inyectora se llena con las unidades hechas hasta el instante del play
  (piezas por estiba del buffer, `pallet-sizing.yaml`);
- cuando se llena, o se cierra la corrida de un producto, queda esperando y un montacargas de la flota `fleet-01` sale
  del estacionamiento, la recoge y la lleva por los pasillos al siguiente almacén de la ruta del producto
  (`catalog/products.yaml`): semielaborado o bodega de producto terminado. Encima va un letrero con la estiba, el producto,
  el pedido y el destino;
- la celda de ensamble pide una estiba de cada componente al arrancar y cada vez que consume la anterior, y lo armado
  sale en estibas del empaque a la bodega;
- con el gemelo EN VIVO los montacargas andan a velocidad real (≈ 2,5 m/s); en play rápido van a 9 m/s para que el
  recorrido se vea. Si hay más estibas que montacargas libres, esperan en cola (máximo 8; las demás no se animan).

El buffer del motor (`pallet-buffer`) tiene una estiba en armado y hasta 2 llenas esperando (`max_waiting_pallets`):
la máquina solo se bloquea si las dos siguen sin recoger. Con el motor de planta conectado mandan sus canales y esta
animación se apaga. `?transport=0` la desactiva.

## Fractal: escenarios

Pestaña FRACTAL · ESCENARIOS del APS (`fractal/manufacturing/`, contrato `fractal-study.v1`). Fractal prueba
combinaciones, cada una la coloca el cosimulador, y recomienda la mejor con su tabla de comparación y la ocupación de
cada máquina antes y después. ADOPTAR deja la recomendación como vigente, con sus cambios de moldes y de fechas.

1. **Adelantar un pedido**: nueva fecha de entrega; prueba recalcular, prioridad alta y montar un molde de repuesto.
2. **Balancear la ocupación**: busca las etapas más cargadas y prueba montar el molde de repuesto en una inyectora
   libre (objetivo 70 % por etapa).
3. **Falla en curso**: con una máquina detenida en el emulador, compara esperar la reparación con mudar su molde a
   otra máquina del mismo tamaño o montar el repuesto. Con IMM-21 parada 48 h, la secuencia sin cambios deja 6 pedidos
   tarde (165,8 h) y montar el molde de balde de repuesto en IMM-22 deja 3 (80,1 h, los que ya venían tarde).

Moldes de repuesto de la demo (`aps/aps.yaml`): uno de balde de 12 L y uno de cuerpo de papelera.

## Siguiente

Ensayo del guion completo en el sitio publicado antes de la reunión del 2026-11-04. Después: señales reales de los PLC
en lugar de las del gemelo y más palancas de Fractal (turno extra, segunda celda de ensamble).
