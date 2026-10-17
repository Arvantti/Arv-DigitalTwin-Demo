# distribution-grid

Un nivel de la red del acueducto a escala (una comuna): cabezal de 2" con cuatro ramales, cada uno con su válvula de bola y cuatro válvulas de consumo (las casas), y dos válvulas de fuga (rojas) en la posición que indique el parámetro (1, 3 o 5) de los ramales 2 y 4, igual que las casas. Los extremos de los ramales y la tercera posición de los ramales 1–2 y 3–4 están unidos por caminos: es una rejilla cerrada, no un peine. Las válvulas son de bola de PVC de unión doble, con manija que gira con la apertura. Cada válvula lleva una placa con su número (C11…C44, L1, L2) y descarga a una canaleta que pasa 5 cm bajo su salida, para que no salpique; las canaletas bajan por una bajante. Visual V2 · comportamiento B2. Ver `FICHA.md` y el diseño en [docs/water-network-plant.md](../../docs/water-network-plant.md).

## Qué simula
- **Reparto:** tubos (Darcy-Weisbach) y descargas a la atmósfera resueltos con `HydraulicNetwork`; la presión de cada casa depende de lo que consumen las demás.
- **Cada válvula** (`c11`..`c44`, `l1`, `l2`) publica su caudal (`q_*`, L/min) y su presión aguas arriba (`p_*`, mca) y acepta `set_opening` por válvula o por grupo (`consumers`, `leaks`, `all`).
- **Totales del nivel:** entrada, consumo, fugas, % de fugas, presión mínima y qué válvula la tiene; agua no contabilizada como KPI.
- **Alarma** si alguna casa queda bajo `min_service_mca` durante 30 s.
- **Fugas** con exponente de presión configurable (0,5 orificio; ≈ 1,15 fisuras), para mostrar cuánto ahorra bajar la presión.

## Entradas del entorno
`inlet_pressure_mca` y `demand_factor` (curva diaria: escala la apertura de las casas). Sin entorno la entrada es `bench_inlet_mca`.

## Para el motor de planta
`add_distribution_grid(net, prefix, inlet, p)` cuelga la rejilla de un nodo de una red ya armada; la planta la usará cuatro veces, una por nivel.

## Presets
`level-1` (entra a 27,4 mca de día) y `level-4-critical` (3,6 m más arriba, entra a 20,0 mca y marca la válvula más crítica).

## Fallas
`leak_burst` (la fuga l1 se multiplica por 5) y `branch_blockage` (la válvula del ramal 4 se obstruye).
