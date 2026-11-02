# Ficha: colector T de drenaje

- Tipo: componente pasivo de librería, integrado en `water-network-scale-v1`.
- Función: juntar los drenajes por gravedad de los cuatro pisos en un tronco común y repartirlos desde una T hacia los dos tanques de recirculación.
- Solicitud del autor: todos los pisos entran a una sola tubería antes de la bifurcación.
- Disposición del Acueducto: los tanques se enfrentan; la T queda entre sus boquillas superiores. El tronco común cae verticalmente desde la cota 2,52 m y cada extremo conecta con la entrada del tanque correspondiente. Las salidas inferiores de los tanques miran hacia afuera para llegar a las bombas.

| Dato | Valor | Origen |
|---|---:|---|
| Entradas del colector | 4 bajantes, una por piso | user |
| Salidas | 2 ramas laterales desde la T, una por tanque | disposición confirmada por el autor |
| Fracción al tanque 1 | 50 % | assumed: simetría de las ramas mientras no haya datos hidráulicos |
| Diámetros, longitudes y pendientes | no especificados | pendiente de datos |

Limitación: el split fijo conserva masa y no representa el reparto hidráulico real, remanso ni pérdidas. Recalibrar cuando se tengan las dimensiones y cotas del montaje.
