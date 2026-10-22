# Almacén de rollos de tela

Inventario FIFO simple: mantiene rollos iniciales y reposición sintética de referencia; entrega un rollo cada 60 s solo si corte lo acepta. La variable `rolls_on_hand` anima la ocupación del rack.

Todo dato de capacidad, stock y reposición es un supuesto configurable. No se modelan lote, color, composición, ancho de tela ni cuarentena por inspección.
