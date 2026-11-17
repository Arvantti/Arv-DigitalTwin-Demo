# Gauges comparativos de tríada en el gemelo 3D

Se sustituyó la tabla fija de la tríada en la escena por seis indicadores anclados a puntos de interés del modelo: descarga de bombeo, salida de PRS, tres válvulas entre niveles y vivienda crítica C44. Cada punto compara únicamente frames guardados con los rótulos exactos `Planta Real`, `Cosimulador` y `Fractal`; los datos faltantes quedan como `—`. Los indicadores siguen la proyección 3D de sus equipos al rotar/zoom y al recorrer la reproducción sincronizada; no recalculan ni aplican resultados.

Validación local: typecheck Gallery, build de Gallery y `git diff --check` pasan; persiste el aviso de Vite sobre `node:module` externalizado desde highs. No se inició sesión PLC, no se mandaron comandos ni se desplegó. Falta revisión visual con browser E2E y validar con frames reales persistidos antes de grabar.
