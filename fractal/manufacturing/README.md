# Fractal de manufactura (`@twin/fractal-manufacturing`)

Optimización multivariable y escenarios ("¿qué pasaría si?") sobre la programación de producción. No coloca la
producción: eso lo hace el cosimulador (`cosim/`). Fractal cambia la planta (prioridades, moldes) y le pide al
cosimulador que coloque cada combinación; compara y recomienda. El APS decide si adopta la recomendación.

```
fractal/manufacturing/
  contracts.ts                          fractal-study.v1 (estudio, opciones, recomendación)
  models/plastic-injection-plant-v1/
    study.ts                            escenarios adelantar, balancear y falla
    tests/                              pruebas con la cartera de la demo
```

## Palancas (plásticos)

| Palanca | Qué hace |
|---|---|
| recalcular | recolocar la secuencia con el cosimulador, sin tocar la planta |
| prioridad | subir un pedido a importancia alta |
| montar-molde | montar la copia de repuesto del almacén de moldes (`aps/aps.yaml`, `molds_in_storage`) en una inyectora libre de la lista del producto; para la máquina el tiempo de montaje (`change_min`) |
| mover-molde | desmontar el molde de una máquina parada y montarlo en otra libre del mismo tamaño (`change_min` + 30 min de traslado) |

Puntaje de cada opción (menor es mejor): horas de atraso + 20 × pedidos tarde + 2 × horas de montaje + 0,5 × cambios
de color; al balancear suma 1,5 × la carga máxima y 3 × lo que pase del objetivo de 70 %. La carga de una máquina es el
trabajo que falta de los pedidos que vencen en la semana, repartido entre las máquinas con el mismo molde, sobre las
horas de turno. Todo es supuesto de la demo.

```bash
pnpm --filter @twin/fractal-manufacturing test
```
