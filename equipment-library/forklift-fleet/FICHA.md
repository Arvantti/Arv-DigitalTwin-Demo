# Ficha: flota de montacargas por área (forklift-fleet)

- Tipo: nuevo · Función: llevar las estibas entre buffers, estanterías de semielaborado y líneas de ensamble con una flota finita, sin choques ni traspasos.
- Pedida por el usuario: 2026-10-18 15:06 («los montacargas no deben ser infinitos, crea una flota según lo que necesitemos para cada área, haz la propuesta y evita choques y traspasos entre montacargas») y confirmada: «de resto está ok el plan». Propuesta en `/mnt/project-files/inspeccion/ficha-buffer-y-almacen.md`.

| Dato | Valor | Origen |
|---|---|---|
| Flota de la planta de plásticos | 6 montacargas en un solo corredor (4 de recolección y 2 de abastecimiento de las celdas, compartidos) | **assumed** (≈ 22 estibas/h de las inyectoras y 4 de las celdas al inicio: uso ≈ 20 %) |
| Producto terminado (celdas → bodega) | 2 montacargas solo en escena (ceden el paso a los de la flota) | **assumed** |
| Largo de rutas | 87, 94, 102 y 95 m | measured (rutas de `plant.yaml`) |
| Velocidad | 2 m/s | **assumed** |
| Carga y descarga | 45 s cada una | **assumed** |
| Separación entre salidas | 30 s | **assumed** |

- Cambio frente a la propuesta: una sola flota de 6 montacargas atiende las 9 rutas (5 de recolección y 4 de abastecimiento), sin dedicar vehículos por área: así el corredor x = 79 m y los pasillos compartidos tienen una sola reserva (separación de 30 s) y es imposible que dos flotas independientes se crucen. Atiende primero la estiba que lleva más tiempo esperando.
- Fallas: un montacargas fuera de servicio (MTBF 300 h, MTTR 30 min, supuestos).
- Pendiente: baterías y turnos; producto terminado fuera del motor.
