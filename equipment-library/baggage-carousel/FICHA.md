# Ficha: carrusel de equipaje (baggage-carousel)

- Tipo: nuevo · Función: acumular las maletas de un vuelo para cargarlas a los carros (armado) o para que los pasajeros las recojan (reclamo).
- Referencias recibidas: ninguna (pedido en lenguaje natural del 2026-10-18; ficha de planta en `/mnt/project-files/aeropuerto/ficha-diseno-bhs.md`).
- Confirmada por: pendiente (valores típicos propuestos) · 2026-10-18

| Dato | Valor | Origen |
|---|---|---|
| Armado | 40 m de placas, 5 m de ancho, 2 operarios a 4 maletas/min | assumed |
| Reclamo | 60 m de placas inclinadas, 7 m de ancho, recogida 25/min desde 2 min después de la primera maleta | assumed |
| Velocidad y espacio por maleta | 0,45 m/s, 1 m | assumed |
| Llenado máximo | 90 % | assumed |

- Fallas: disparo del motor (MTBF 6.000 h, 20 min), placa trabada (1.500 h, 10 min).
- Variables y KPIs: maletas, ocupación, recibidas, retiradas, cola de entrada; maletas/h, ocupación máxima, duración de la oleada.
- Qué se anima: placas, maletas, operarios o pasajeros, baliza.
