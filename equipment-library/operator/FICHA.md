# Ficha: operario (operator)

- Tipo: nuevo
- Función y lugar en el proceso: representa roles de planta (operario, técnico de mantenimiento, inspector de calidad, montacarguista, supervisor) en ambas plantas. En el motor de planta, el técnico camina hasta el equipo en falla y la reparación empieza al llegar.
- Referencias recibidas: ficha 24 de `docs/fichas/fase-3.md`
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3, opción A)

| Dato | Valor | Origen |
|---|---|---|
| Escala | 1,70 m; cabeza, torso, brazos y piernas distinguibles (con rodillas y codos) | assumed |
| Roles | Operario, técnico de mantenimiento, inspector de calidad, montacarguista, supervisor | assumed |
| EPP | Inyección: casco (color por rol), gafas, overol azul con franjas reflectivas. Salsas: cofia, tapabocas, bata y botas blancas | assumed |
| Poses | De pie, caminando, trabajando (brazos al frente; el técnico con su caja de herramientas) | assumed |
| Velocidad | 1,0 m/s con herramientas (técnico), 1,2 m/s (otros) | assumed |
| Ruta | Por pasillos: primero en x y luego en y | assumed |

- Fallas: no aplica.
- Qué es un rechazo y qué lo causa: no aplica.
- Variables, alarmas y KPIs: posición, rumbo, tarea, ocupado, distancia, tareas terminadas, tiempo caminando y trabajando; utilización, distancia y fracción del tiempo ocupado que se va en caminar.
- Qué se anima: zancada (piernas y brazos), pose y rumbo. La escena de planta mueve la figura con `x_m` y `y_m`.
- **Ajuste respecto de la ficha aprobada:** la pose "reparar (agachado)" quedó como "trabajando" con los brazos al frente; agacharse requiere esqueleto completo y se deja para la escena de planta.
- Pendiente o desconocido: turnos y cantidad de técnicos por turno de cada planta.
