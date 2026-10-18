# Ficha: buffer de máquina con estiba (pallet-buffer)

- Tipo: nuevo · Función: junto a cada inyectora, junta sus piezas en una estiba de X piezas y la deja lista para recogida.
- Confirmada por: usuario · 2026-10-18 15:06 (tarjeta «¿Confirmas la ficha del buffer y del almacén…?» → Confirmar). Ficha completa en `/mnt/project-files/inspeccion/ficha-buffer-y-almacen.md`.

| Dato | Valor | Origen |
|---|---|---|
| Piezas por estiba (X) | 1.000 | user (tarjeta 2026-10-18) |
| Estibas llenas que pueden esperar | 2 | **assumed** |
| Espera de cierre hasta quedar lista | 120 s | **assumed** |
| Huella | 3,4 × 1,0 × 1,4 m (estiba de armado más 2 de espera) | assumed |

- Cambio frente a la ficha: el viaje al almacén ya no es una constante del buffer; lo da la flota de montacargas (`forklift-fleet`).
- Fallas: estiba mal armada (MTBF 400 h, MTTR 5 min, supuestos).
