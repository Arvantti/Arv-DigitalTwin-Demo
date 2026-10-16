# Ficha: pasteurizador tubular (tubular-pasteurizer)

- Tipo: nuevo · Función: pasteurizar en continuo la salsa caliente que sale de la marmita hacia el tanque pulmón.
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3)

| Dato | Valor | Origen |
|---|---|---|
| Caudal | 3.000 L/h | layout |
| Temperaturas | Entrada 85 °C, salida 95 °C | layout |
| Retención | 30 s a ≥ 92 °C; desvío a la marmita si baja | layout |
| Ensuciamiento | Pérdida de coeficiente del 5 %/h de operación (CIP lo elimina) | assumed |
| Letalidad | P a 93,3 °C, z = 8,3 °C; requerida ≥ 0,3 min | assumed |

- Fallas: válvula de desvío sin respuesta (MTBF 20.000 h, MTTR 60 min, crítica: lote retenido); bomba de producto (6.000 h, 45 min); deriva de la sonda de retención (+3 °C, manual).
- Nota: la ficha original estimaba 300 kg/h de vapor. Con 85 → 95 °C a 3.000 L/h hacen falta ≈ 56 kg/h; 300 kg/h correspondería a calentar desde temperatura ambiente.
