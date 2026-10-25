# Optimización hidráulica Fractal · water-network-scale-v1

## Método aprobado

| Estudio | Método |
|---|---|
| Instantáneo | Differential Evolution con refinamiento SLSQP |
| Horizonte 24 h | Optimización DE→SLSQP independiente por hora; el control nominal se comprueba en −10 %, base y +10 % |
| Escala futura | IPOPT si crecen variables, horizonte o escenarios |

## Variables continuas iniciales

```text
PRS-01 · consigna manual de salida
Válvula N1→N2 · apertura
Válvula N2→N3 · apertura
Válvula N3→N4 · apertura
```

La selección AUTO/MANUAL de PRS se evalúa como alternativas discretas, no como variable continua.

## Restricciones duras

```text
Presión crítica ≥ 15 mca
Presión de descarga de bomba ≥ 70 mca
20 % ≤ nivel de tanque de bombeo ≤ 95 %
0 % ≤ apertura de válvula ≤ 100 %
Límites de bomba y PRS
```

Una solución inviable nunca se publica como recomendación.

## Objetivos

```text
J = w_fuga·fuga + w_energía·energía + w_movimiento·cambio_de_mando
```

Las restricciones no se reemplazan por una recomendación con penalización: se verifican antes de publicar.

## Robustez

Cada propuesta se evalúa con demanda prevista, +10 % y −10 %. Solo se recomienda si el caso +10 % mantiene la presión mínima.

## Implementación actual y límites

El solver Fractal carga parámetros de presets, topología de `simulation.yaml` y rutas/diámetros/K de `plant.yaml`. Construye por separado una red nodal desde la salida PRS, con los tramos y cruces internos de cuatro rejillas (64 emisores domésticos y ocho fugas). Resuelve continuidad y presión simultáneamente usando Darcy-Weisbach/Swamee-Jain (laminar: Hagen-Poiseuille), Kv y emisores dependientes de presión. Los casos nominal, nocturno, válvula N2→N3 al 50 % y fuga L1 ×5 se comparan con cifras del banco operativo, con tolerancia absoluta de 0,04 mca y 0,04 m³/h; el modelo Fractal no importa el solver operativo. El circuito principal acopla la curva H=s²H0−rQ² (bombas paralelas), antirretorno, succión según el nivel del tanque, pérdidas del tubo de llegada a PRS, Kv de las válvulas de aislamiento y salida efectiva de la PRS. La rama AUTO busca la consigna que sostiene el punto crítico; en optimización se fija explícitamente la rama manual para que el mando propuesto sea ejecutable. Las restricciones comprueban velocidad necesaria ≤100 %, descarga y disponibilidad PRS. El contraste nominal da 11,53693 m³/h, 20,93152 mca de salida PRS y ≈71,09 mca a la entrada. El control PID, la rampa y las fallas transitorias aún no se resuelven segundo a segundo.

El horizonte recorre horas relativas al reloj PLC, representa aperturas globales/por nivel/vivienda y fugas individuales y propaga tres tanques. En estudios optimizados se busca un mando por hora con DE→SLSQP para el caso nominal (se reutiliza si el patrón horario se repite); el mismo mando se comprueba contra −10 %, base y +10 %, no se reoptimiza por escenario. En cada hora, la recirculación calcula dos succiones, curva de bomba a velocidad nominal, cota del tanque receptor y pérdidas de tubos/antirretorno; integra el nivel con eventos de histéresis de 60/20/90 % y límites de volumen. Se contrasta la curva en 70/70/70 % con el punto del emulador (≈21,30 m³/h). El caudal residencial se considera estacionario dentro de cada hora, no se simulan PID/rampas transitorias; cada frame es un resultado futuro simulado, no una observación del emulador.

Un perfil `PFL-FRA-*` se crea solo con aprobación. PLC programa su entrada en vigor para la hora simulada siguiente; aceptar o programar nunca escribe mandos inmediatamente. La validación final contra el solver operativo y la prueba de largo plazo de balance siguen pendientes.
