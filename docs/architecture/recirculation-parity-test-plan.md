# Plan de diagnóstico: paridad de recirculación PLC / Fractal

Fecha: 2026-10-26 UTC. Base: d5e3080. Responsable: diagnóstico asistido solicitado por Andy.

## Objetivo y reglas

Identificar y cuantificar las causas de divergencia de niveles, no ajustar parámetros para forzar coincidencia. PLC conserva autoridad; no aplicar mandos a una instalación ni activar optimización. Mantener independientes los solvers. Comparar el mismo perfil, estado inicial y tiempo absoluto. Cambiar una sola variable por experimento; persistir JSON resumen y CSV de muestras/eventos.

Signo de diferencias: Fractal menos emulador, salvo etiqueta explícita. Diferenciar caudal instantáneo (m³/h), volumen integrado (m³), nivel (%) y error de nivel (pp). La descarga contabilizada por una bomba no sustituye la entrada efectiva del vaso.

## Secuencia

| ID | Prueba | Evidencia y criterio | Estado |
|---|---|---|---|
| P1 | Balance por segundo de los tres vasos PLC y transferencia bomba→tanque | ΔV − (Vin−Vout), integración independiente de caudales y contadores. Tolerancia numérica propuesta 1e-8 m³/paso sin saturación; registrar saturaciones, no ocultarlas. Fractal requiere también balance individual de sus pasos. | En curso |
| P2 | Estado inicial: tags frente a niveles verdaderos | Dos proyecciones independientes, idénticos caudales y estado de bomba; solo cambian niveles iniciales. Cuantificar cuánto del desfase procede de sensores. | Primera ejecución completada |
| P3 | Primer ciclo C44 con demanda constante 30 % | t=30–1800 s, antes del cambio horario. Comparar arranque/parada, niveles, caudal, rampa y volumen de retorno. Sin ajuste de umbrales. | Primera ejecución completada; análisis de rampa pendiente |
| P4a | Sensibilidad de integración Fractal | Misma política/eventos y estado; límites de paso 60/5 s actuales frente a 5/1 s y 1/1 s. Guardar diferencias de volumen, tiempo y coste. No cambiar política al mismo tiempo. | Pendiente |
| P4b | Conmutación interpolada frente a discreta | Sobre integración de 1 s, aislar evaluación de umbrales en ticks y orden de actualización. No adoptar cambios hasta justificar semántica. | Pendiente |
| P5 | Rampa cruzando frontera horaria | Comparar intervalo continuo frente a dos segmentos, conservando velocidad/estado. Evaluar bomba apagada y en rampa; evitar atribuir el problema únicamente al reloj. | Pendiente |
| P6 | Regresión de 24 h en C44 y salida fija 40 mca | Misma instantánea inicial, primera franja 3570 s, luego 3600 s. Balances por vaso, transferencias acumuladas, eventos y niveles; presiones ≥15 mca en muestras evaluadas. | Pendiente |

## Criterio de cierre

Cada contribución debe quedar sustentada por experimento controlado, no solo por correlación. Cerrar balances y documentar error residual de ciclos y niveles. Acordar con Andy tolerancias operativas de nivel/tiempo antes de declarar paridad; igualdad exacta no es un requisito físico. No usar medias de 24 caudales instantáneos como volumen diario.

## Evidencia previa

- `validation/pdd-prs-c44-cycles-diagnosis.md`: tres ciclos en 2 h, desfases de parada −3,919/−11,465/−20,138 s; volumen contabilizado −35,736 litros.
- Gráfica horaria C44: distribución casi igual, ciclos de recirculación no alineados. No identifica por sí sola la causa raíz.

## Primera ejecución

Script: `tools/hydraulics/diagnose_c44_tank_balance.py`. Resultados guardados en `validation/pdd-prs-c44-balance-first-cycle.json` y CSV vecino. El CSV registra entradas/salidas efectivas y volumen de los vasos cada segundo, no solo lectura de bomba. P2 cambia exclusivamente niveles iniciales manteniendo la distribución Fractal fija. Esta primera ejecución no completa aún P1 para los pasos individuales Fractal ni P4–P6.

### Resultados medidos

- 1770 pasos PLC, 5310 filas de vasos. Los balances por vaso y las integrales independientes frente a contadores pasan tolerancia 1e-8 m³. Residuo máximo por paso: 4,22e-16 m³. Inventario combinado cambia −1,32e-10 m³: no hay evidencia de pérdida de masa en esta ventana.
- La bomba contabiliza 3,024855 m³ y el vaso de suministro recibe 3,024546 m³: diferencia 0,309 litros. No son lecturas intercambiables; su origen requiere revisar el orden de resolución/contabilización.
- Fractal con tags arranca a 1227,973 s y para a 1765,081 s. Con niveles iniciales verdaderos arranca a 1229,218 s y para a 1766,332 s. PLC: 1229 s / 1769 s.
- Corregir solamente la condición inicial reduce el adelanto de parada de 3,919 a 2,668 s, pero no elimina el desacuerdo. El arranque queda a +0,218 s en lugar de −1,027 s.
- Retorno Fractal con niveles verdaderos: 3,014388 m³, frente a 3,024546 m³ recibidos por el vaso PLC (−10,158 litros). Inventario total Fractal conservado al error de redondeo; aún no se instrumentaron sus flujos por vaso/paso.
- Fin t=1800: suministro PLC 89,113976 %; Fractal tags 88,861406 %, niveles verdaderos 88,901127 %. El error residual con estado inicial igual es −0,212849 pp. Distribución nominal se mantuvo fija en ambos experimentos Fractal; emulador conserva su dinámica a 1 s.

Próximo paso inmediato: P4a y traza individual de flujos Fractal para P1, antes de cambiar conmutación o parámetros. No afirmar que sensores o integración explican solos el error de 24 h.
