# Cosimulador (`@twin/cosim`)

Calcula la programación de producción a partir de los pedidos. Tiene un adaptador por modelo industrial, y cada
adaptador lee solo los datos de su modelo en `industrial-models/<planta>/`.

```
cosim/
  core/                 contratos JSON (contracts.ts) y calendario de turnos (time.ts), comunes a todos los modelos
  schemas/              JSON Schema de los contratos (customer-orders.v1, production-plan.v1)
  adapters/
    plastic-injection-plant-v1/   planta de plásticos: cartera inventada, plan manual y colocación lineal (HiGHS)
```

## Límites de identidad

- **Modelo industrial** (`industrial-models/<planta>/`): datos de la planta (catálogo, demanda, `aps/aps.yaml`,
  cartera de pedidos `orders/`, planes `aps/plans/`). No tiene código.
- **Cosimulador** (`cosim/adapters/<planta>/`): la colocación de la producción con las restricciones lineales y los
  moldes como están montados. No mueve moldes ni decide escenarios.
- **Fractal** (`fractal/`, aparte): optimización multivariable y escenarios ("¿qué pasaría si?"). Llama al cosimulador
  y devuelve planes con `source: "fractal"`.
- **Gemelo** (`apps/gallery`): muestra y reproduce el plan vigente. El acueducto no usa este paquete.

## Contratos

| Contrato | Quién lo escribe | Quién lo lee |
|---|---|---|
| `customer-orders.v1` | pantalla de pedidos del APS, cartera inventada | cosimulador |
| `manual-sequence.v1` | planificador (`aps/plans/APS-MAN-01.json`) | cosimulador (`manualPlan`) |
| `production-plan.v1` | cosimulador, plan manual, Fractal | APS (Gantt), gemelo 3D, centro de control |
| `plant-event.v1` | emulador (falla o paro de emergencia AHORA) | APS, gemelo 3D, cosimulador (parada) |

## Plásticos

- `solve.ts`: programa lineal por turnos (cantidad por trabajo, máquina y turno). Minimiza el atraso ponderado por
  importancia (alta 3, normal 1, baja 0,5). Restricciones: capacidad de cada turno menos paradas y una purga de color,
  la máquina donde está montado el molde, componentes antes del ensamble, y nada empieza antes de que llegue el pedido.
  Después se ordena cada máquina y se despacha minuto a minuto con los cambios de color.
- `manual.ts`: sigue la secuencia del planificador; los pedidos que no están en ella van al final.
- Ambos replanean desde AHORA: lo que ya empezó queda congelado.
- Una falla del emulador es una parada desde AHORA hasta la reparación estimada: el lote en curso se corta y lo que
  faltaba se vuelve a programar. El cosimulador lo pasa a otra máquina con el mismo molde montado; mover un molde a
  otra máquina es decisión de Fractal.
- Los lotes salen de `aps/aps.yaml` y se marcan al publicar el plan (`batch: [n, de]`).

```bash
pnpm --filter @twin/cosim test        # pruebas del adaptador
node cosim/adapters/plastic-injection-plant-v1/scripts/make-portfolio.ts   # regenera cartera y plan manual
```
