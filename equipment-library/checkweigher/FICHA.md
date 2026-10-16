# Ficha: control de peso con detector de metales (checkweigher)

- Tipo: nuevo · Función: pesar cada sachet, rechazar los que quedan fuera de tolerancia o con metal.
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3), con un ajuste de tolerancias (ver abajo)

| Dato | Valor | Origen |
|---|---|---|
| Huella | 1,5 × 0,8 × 1,2 m | layout |
| Detector de metales | En línea, prueba con patrón cada 2 h | layout, assumed |
| Límite inferior | Error negativo tolerable: 9 g (250 ml), 15 g (500 y 1.000 ml) | assumed |
| Límite superior | +5 % del nominal | assumed |

- **Ajuste respecto de la ficha aprobada:** la ficha decía ±4 g en 250 ml. Con la sachetadora sobrellenando 1 % y con desviación de 1,5 %, ±4 g rechazaría cerca del 40 % de la producción. Se usan los límites de metrología legal (error negativo tolerable) y +5 % arriba, con lo que el rechazo esperado es de 0,5 a 1 %.
- Fallas: deriva de la celda de carga (MTBF 3.000 h: rechazos falsos y aceptaciones falsas); empujador de rechazo (5.000 h, 20 min).
