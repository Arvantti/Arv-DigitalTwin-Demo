# Fractal de Ingeniería

Fractal aloja modelos de proyección y optimización independientes del emulador operativo.

## Límite de integración

Un Fractal **no importa** `industrial-models/*/network.py` ni consulta objetos de sesión del emulador. Su estado operativo se recibe exclusivamente desde los tags de solo lectura publicados por el PLC virtual en el contrato OPC UA simulado:

```text
PLC virtual → OPC UA simulado (lectura) → Fractal
```

Las recomendaciones regresan a la HMI como datos de asesoría. Fractal nunca escribe sobre el PLC, el emulador ni infraestructura física.

## Organización

```text
fractal/
  core/                         contratos de trabajos, restricciones y recomendaciones
  hydraulics/
    runtime/                    utilidades propias de cálculo hidráulico
    models/
      water-network-scale-v1/   modelo independiente, mapa de tags y optimizador
  process/                      futuros modelos de proceso
  logistics/                    futuros modelos logísticos
  manufacturing/                futuros modelos de manufactura
```

El contrato de tags inicial está disponible en:

```text
GET /api/plants/water-network-scale-v1/opcua-schema
```

El servidor descrito allí es simulado y de solo lectura; no representa una conexión OPC UA física.
