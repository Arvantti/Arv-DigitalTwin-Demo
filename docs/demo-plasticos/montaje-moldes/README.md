# Montaje y desmontaje de moldes en el gemelo 3D

El gemelo 3D de plásticos muestra cada cambio de molde de la programación que se ve (vigente o escenario), al ritmo de la barra del play. Código: `apps/gallery/src/mold-change.ts`.

- **De dónde salen:** filas de inyección que montan un molde distinto al anterior en la misma máquina (`changeover_min`, de corrido, sin partir) y las paradas de montaje de Fractal ("Montaje de <molde>" con la copia de repuesto del almacén y "Mudanza de <molde> desde <máquina>").
- **Desmontaje:** en la hilera mediana (bajo el puente grúa) la grúa saca el molde y lo baja al carro de moldes; en las pequeñas el molde se desliza al carro.
- **Traslado:** un operario empuja el carro al almacén de moldes (deja el que sale y toma el que entra) o, en una mudanza, a la otra máquina.
- **Montaje:** la grúa (o el operario en las pequeñas) sube el molde a la máquina. Un letrero morado dice qué molde sale, cuál entra y en qué fase va.
- Un cambio solo de color o de resina no mueve el molde: el letrero muestra la purga.
- `?molds=0` apaga la animación.

Capturas (escenario de falla de IMM-21, día 9 desde las 10:00, opción B "Mudar el molde a IMM-20" y opción C "Montar el molde de repuesto en IMM-20"):

1. `1-grua-desmonta-molde.jpg`: la grúa baja el molde de balde de IMM-21 al carro.
2. `2-carro-lleva-molde.jpg`: el operario lleva el carro por el pasillo central.
3. `3-repuesto-en-almacen.jpg`: con el repuesto, el carro va al almacén de moldes.
4. `4-montaje-en-imm20.jpg`: montaje en IMM-20; el carro queda vacío.

Con la programación vigente de la demo cada inyectora conserva su molde (solo hay purgas de color); los cambios de molde aparecen al ver o adoptar una opción de Fractal que monte o mude un molde. A 15 min/s un montaje de 90 min dura unos 6 s; para mostrarlo con calma, pausar y mover la barra.
