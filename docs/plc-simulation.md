# PLC Simulation — Acueducto (fase inicial)

## Propósito

Construir una interfaz HMI/PLC **simulada** para los gemelos industriales. El primer piloto es `water-network-scale-v1`. No se conecta ni controla infraestructura física.

Confecciones y ciudad quedan fuera de este alcance: usarán, respectivamente, un tablero de operación manual/producción y un centro de control de tráfico.

## Límites y capas

La solución separa explícitamente tres responsabilidades.

```text
Calculadora hidráulica A (emulador de realidad ficticia)
                    │ señales simuladas
                    ▼
              PLC virtualizado ──► Gemelo / HMI / alarmas / histórico
                    │ lecturas PLC
                    ▼
           Fractal de Ingeniería ──► Calculadora hidráulica B (independiente)
                    │ recomendación, nunca escritura directa
                    ▼
                  Operador
                    │ acepta o rechaza
                    ▼
              PLC virtualizado
```

### A. Emulador hidráulico

Es el origen ficticio de las señales que un PLC real recibiría. Resuelve la red en estado estacionario para la demanda, las aperturas, los niveles, las bombas, la reguladora y las fugas vigentes. No optimiza.

El runtime actual (`twin_runtime.plant_hydraulics` y `water-network-scale-v1/network.py`) es el candidato a sustentar este emulador. Sus datos se etiquetan con `source: simulated-hydraulics-emulator`.

### B. PLC virtualizado y gemelo

Recibe y publica mediciones, estados, alarmas e histórico. La HMI solo escribe mandos explícitamente permitidos y validados. La fuente de verdad de la simulación continúa siendo el runtime, no el navegador.

### C. Fractal de Ingeniería

Recibe lecturas del PLC virtual, ejecuta una **calculadora hidráulica propia e independiente** y evalúa alternativas. No llama ni altera la calculadora A. Devuelve sugerencias de perfil para la estación reguladora y, solo si hace falta, una combinación con bombeo. El operador acepta o rechaza la propuesta.

## Restricción de servicio

- La vivienda con menor presión de toda la red no puede bajar de **15 mca**.
- Objetivo inicial de control automático: **15,45 mca** (margen de 3 %).
- La HMI debe distinguir objetivo, advertencia, alarma y violación de restricción.

## Demanda y escenarios

La referencia de laboratorio a demanda residencial plena es aproximadamente:

```text
Q_total al 100 % ≈ 6,8 m³/h = 1,89 L/s = 113 L/min
```

Cada escenario diario contiene 24 puntos horarios. El emulador interpola gradual y continuamente entre puntos: no aplica escalones instantáneos.

Modos de edición de demanda:

1. Global: misma apertura para todas las viviendas.
2. Por nivel: una apertura por cada nivel.
3. Por vivienda: apertura individual para cada consumo.

El escenario progresivo inicial sube desde un mínimo configurable (por defecto 30 %) hasta un máximo (por defecto 100 %) a una hora pico configurable (por defecto 12:00), y luego baja gradualmente al mínimo.

## Pantallas del piloto

### 1. PLC Master

- Árbol de activos: retorno, recirculación, tanque de bombeo, bombas principales, estación reguladora y cuatro niveles.
- Estado de simulación, reloj virtual, velocidad y comunicación.
- Alarmas y eventos priorizados.
- Navegación a las pantallas operativas.

### 2. Bombeo, tanques y regulación

- Niveles, volumen/masa, entradas y salidas de los tres tanques.
- Alertas de nivel alto, bajo y crítico.
- Grupos de bombeo principal y recirculación: start/stop, bombas en marcha/disponibles, velocidad, caudal, presión, potencia, energía y volumen.
- Selector AUTO/MANUAL de la estación reguladora.
- En AUTO: presión crítica, consigna crítica y salida automática calculada.
- En MANUAL: presión de salida configurada y aviso visible de modo manual.

### 3. Rejilla y consumo

- Cuatro niveles con 16 viviendas por nivel (64 consumos en total).
- Por vivienda: apertura, presión y caudal.
- Resaltado del punto crítico calculado en vivo.
- Válvulas entre niveles 1–2, 2–3 y 3–4: apertura, caudal y caída de presión.
- Fugas separadas de consumos.
- Control global, por nivel e individual.
- Modo de demanda aleatoria reproducible por semilla, con registro de los cambios; nunca modifica fugas.

### Tendencias

Series de 24 h: caudal principal, recirculación, consumo residencial, fugas, niveles, presión crítica/consigna, velocidad de bombas y apertura agregada.

## Orden de implementación

1. Contrato PLC declarativo para el acueducto: activos, tags, permisos, alarmas y pantallas.
2. API para exponer el contrato y sesiones de simulación PLC.
3. Historiador de sesión y perfiles horarios interpolados.
4. HMI del acueducto: Master, bombeo/tanques/regulación y rejilla.
5. Emulador hidráulico separado formalmente del runtime del PLC.
6. Contrato de integración con Fractal y calculadora hidráulica B.

## Seguridad y alcance

- Todo dato y control se marca como `SIMULADO`.
- No habrá conectividad ni escritura hacia PLC físico.
- `set_param` no se expondrá de forma genérica a la interfaz; cada tag editable se asociará a un comando permitido, rango y validación explícitos.
