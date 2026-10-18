# Ficha: almacén de estibas de semielaborado (pallet-store)

- Tipo: nuevo · Función: guardar las estibas de semielaborado que traen los montacargas y entregarlas, una a la vez, a la línea de ensamble (plano: `rack-sf-01` … `rack-sf-04`).
- Confirmada por: usuario · 2026-10-18 15:06 (tarjeta «¿Confirmas la ficha del buffer y del almacén…?» → Confirmar). Ficha completa en `/mnt/project-files/inspeccion/ficha-buffer-y-almacen.md`.

| Dato | Valor | Origen |
|---|---|---|
| Posiciones de estiba | 48 por estantería | user (plano) |
| Largo y alto | 16 × 6 m | user (plano) |
| Piezas por estiba | 1.000 | user |
| Separación entre entregas | 30 s | **assumed** |
| Inventario inicial | 6 estibas por estantería en la planta | **assumed** |

- Cambio frente a la ficha: la entrega a la línea (6 u/min y el viaje de 180 s) la hace la flota de montacargas (`forklift-fleet`), no el almacén.
- Fallas: pasillo obstruido (MTBF 800 h, MTTR 15 min, supuestos).
