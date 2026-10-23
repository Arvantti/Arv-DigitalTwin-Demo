# Fractal hidráulico · water-network-scale-v1

Este directorio será el modelo de proyección y optimización hidráulica independiente para el acueducto a escala.

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
