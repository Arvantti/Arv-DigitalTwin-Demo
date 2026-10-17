# Ficha: celda de ensamble manual con operario (assembly-cell)

- Tipo: nuevo · Función: armar a mano un producto con dos componentes que entregan dos inyectoras (plano: `assembly-01`, `assembly-02`, zona de operaciones secundarias de la nave de inyección). No es una celda robotizada.
- Confirmada por: usuario · 2026-10-17 03:54 («Si con el operario», a la propuesta de celdas manuales con operario). Los datos que el plano y la ficha 23 no dan son supuestos; se revisan con el usuario en el PR.

| Dato | Valor | Origen |
|---|---|---|
| Operación `assembly-01` | ensamble de pedal/palanca en papelera (pedal y palanca de la imm-06, cuerpo de la imm-19) | user (plant.yaml) |
| Operación `assembly-02` | ensamble de bisagras y tapas | user (plant.yaml) |
| Ciclo por unidad | 35 s (pedal/palanca), 20 s (bisagras y tapas), un operario | user (ficha 23) |
| Huella | 6 × 3 × 1,5 m (el modelo ocupa ≈ 3,5 × 1,9 m con un operario) | user (plant.yaml) |
| Componentes por unidad | 1 + 1 (pedal/palanca) y 2 bisagras + 1 tapa | **assumed** |
| Cubeta de componentes | 60 u (pedal/palanca) y 120 u (bisagras y tapas) | **assumed** |
| Operarios y ritmo | n operarios arman n veces más rápido | **assumed** |
| Flujos de `assembly-02` (imm-08 → bisagras, imm-14 → tapas) | 360 y 180 u/h | **assumed** |

- Fallas: atasco del dispositivo de sujeción (MTBF 250 h, MTTR 5 min); se acaba la tornillería (MTBF 120 h, MTTR 10 min); ambas paran la celda.
- Qué se anima: llenado de las cubetas, la unidad en curso (el componente A baja sobre el B), la bandeja de salida, los operarios inclinados y con los brazos en movimiento, la baliza y la pantalla.
- Pendiente: calidad del ensamble (rechazos y retrabajo), cambio de turno y descansos del operario, y el movimiento del operario hacia las cubetas (rutas de operarios, PR aparte).
