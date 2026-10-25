# Fractal hidráulico · water-network-scale-v1

Este directorio contiene el solver hidráulico Fractal independiente para el acueducto a escala. `parameters.py` lee `industrial-models/water-network-scale-v1/fractal/model.yaml` y los contratos compartidos `plant.yaml` y `simulation.yaml`; Fractal no importa el runtime ni el solver del emulador. Los tags PLC son el estado de partida. `nodal.py` arma por separado la columna desde la salida PRS y las cuatro rejillas cerradas: cabezales, válvulas de ramal, cinco tramos por ramal, cruces, 64 consumos y ocho fugas (dos por nivel). Resuelve simultáneamente continuidad y presión con Darcy-Weisbach/Swamee-Jain, Kv y emisores por raíz de presión. Las aperturas provienen de tags PLC y perfiles futuros. `model.py` traduce el resultado a frames de estudio. La física aguas abajo de la PRS se contrasta con los puntos nominal, nocturno, válvula al 50 % y fuga del banco operativo, sin importar su solver en producción. `supply.py` añade curva de bomba con variador, antirretorno, succión según nivel del tanque y PRS con pérdidas de aislamiento y condición de presión de entrada. La rama AUTO ajusta la consigna al punto crítico en régimen; `recirculation.py` resuelve las dos succiones, la bomba 1+1, los retornos por piso y la histéresis de nivel, integrando tanques en pasos con eventos. Estos cálculos se contrastan con el banco operativo en puntos estacionarios. **Límite:** el horizonte asume control de presión asentado por hora: no reproduce el PID/rampa de arranque, conmutación de ramas ni fallas transitorias segundo a segundo; los caudales de consumo se mantienen estacionarios dentro de cada hora y la recirculación se integra con aproximación temporal. Los frames siguen siendo predicciones simuladas no aplicadas, no una reproducción validada de transitorios.

## Entradas permitidas

- tags OPC UA simulados de solo lectura del PLC Master;
- perfil horario publicado por el PLC;
- objetivos y restricciones declarados por el operador.

## Entradas prohibidas

- importación de `industrial-models/water-network-scale-v1/network.py`;
- lectura de objetos o variables internas del emulador;
- escritura de comandos PLC o emulador.

## Salidas previstas

- proyección base: continuar el perfil PLC sin correcciones;
- proyección optimizada: mismo perfil con recomendaciones Fractal;
- restricciones verificadas, supuestos y condición de factibilidad;
- recomendaciones que requieren aceptación explícita del operador.

La especificación completa y el orden de implementación están en `docs/architecture/plc-fractal-cosimulation.md`.
