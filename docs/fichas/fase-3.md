# Fichas de la fase 3: equipos de las dos plantas

> **Estado: borrador para revisión.** Armadas con valores típicos de la industria (opción A). Nada de esto se programa hasta que se confirme.
> Origen de los datos: **layout** = viene del `plant.yaml` ya aprobado · **assumed** = valor típico propuesto · **derived** = calculado de otros datos.
> Al confirmarlas, cada ficha se copia como `FICHA.md` en la carpeta de su tipo.

## Resumen

| # | Tipo | Familia | Planta | Fidelidad | Protagonista 3D |
|---|---|---|---|---|---|
| 1 | `vffs-sachet-filler` | Envasado | Salsas | V2 / B3 | Sí |
| 2 | `cooling-tunnel` | Envasado | Salsas | V2 / B3 | |
| 3 | `checkweigher` | Envasado | Salsas | V2 / B2 | |
| 4 | `case-packer` | Envasado | Salsas | V2 / B2 | |
| 5 | `belt-conveyor` | Transporte | Ambas | V2 / B2 | |
| 6 | `forklift` | Transporte | Ambas | V2 / B2 | |
| 7 | `stretch-wrapper` | Transporte | Ambas | V2 / B2 | |
| 8 | `static-asset` | Transporte e infraestructura | Ambas | V2 / B1 | |
| 9 | `tubular-pasteurizer` | Térmico | Salsas | V2 / B3 | Sí |
| 10 | `vacuum-emulsifier` | Mezcla | Salsas | V2 / B3 | Sí |
| 11 | `inline-mill` | Mezcla | Salsas | V2 / B3 | |
| 12 | `desiccant-dryer` | Materiales plásticos | Inyección | V2 / B3 | |
| 13 | `gravimetric-blender` | Materiales plásticos | Inyección | V2 / B2 | |
| 14 | `vacuum-conveying-station` | Materiales plásticos | Inyección | V2 / B2 | |
| 15 | `granulator` | Materiales plásticos | Inyección | V2 / B2 | |
| 16 | `pelletizing-line` | Materiales plásticos | Inyección | V2 / B3 | |
| 17 | `steam-boiler` | Servicios | Salsas | V2 / B3 | |
| 18 | `chiller` | Servicios | Ambas | V2 / B3 | |
| 19 | `air-compressor` | Servicios | Ambas | V2 / B2 | |
| 20 | `cooling-tower` | Servicios | Inyección | V2 / B3 | |
| 21 | `cip-skid` | Servicios | Salsas | V2 / B3 | |
| 22 | `overhead-crane` | Inyección: moldes | Inyección | V2 / B2 | |
| 23 | `workstation` | Inyección: secundarias | Inyección | V2 / B2 | |
| 24 | `operator` | Personas | Ambas | V2 / B2 | Sí |

Además se agregan **presets** a tipos existentes: `vessel` (tanque de fase acuosa 800 L, tanque de mostaza 1.200 L, tanque de vinagre 10 m³, tanque de agua tratada 10 m³ y silos de reciclado de 30 t).

### Decisiones de diseño a confirmar
1. **Tipos combinados para no multiplicar la librería:**
   - `vffs-sachet-filler` cubre los dos tamaños de sachet (250 ml y 1.000 ml) con presets.
   - `inline-mill` cubre el molino coloidal y el de piedra.
   - `static-asset` cubre lo que no se simula: racks, bancos, muelles, transformador, mesas de laboratorio, CNC, EDM y PTAR.
   - `workstation` cubre las estaciones manuales y semiautomáticas: ensamble, tampografía, espumado y empaque.
2. **Cascadas entre equipos** (se activan en la fase 4, cuando los equipos se conecten):
   - El secador entrega la humedad de la resina a la inyectora: si falla, aparecen rayas plateadas.
   - El chiller entrega el agua de los moldes: si falla, aumentan los rechupes y se alarga el ciclo.
   - La caldera entrega la presión de vapor a las marmitas y al pasteurizador: si cae, el batch se alarga y el pasteurizador desvía.
   - El compresor alimenta las sachetadoras: si la presión baja, se detienen.
   - La temperatura del tanque pulmón caliente llega a las sachetadoras de tomate: si el producto llega por debajo de 85 °C, se rechaza.
3. **Fases de batch reutilizables.** El ejecutor de fases de la marmita pasa a ser una primitiva del runtime (`BatchPhaseRunner`), para que el emulsificador y el CIP lo reutilicen.
4. **Operarios** a escala real (1,70 m), con EPP según la planta: casco y overol en inyección; cofia, tapabocas y bata blanca en salsas. Representan turnos y tareas, no personas reales.

---

## Familia 1: Envasado en sachet (planta de salsas)

> **Todo el producto se envasa en sachet.** No hay botellas, tapas ni etiquetas: el laminado viene impreso y la máquina solo codifica lote y vencimiento. El layout se actualizó en consecuencia.

### 1. `vffs-sachet-filler`: llenadora vertical de sachets (formadora, llenadora y selladora)
- **Función:** forma el sachet desde un rollo de laminado, lo llena con un dosificador de pistón, lo sella y lo corta. Cubre los dos tamaños de la planta: **250 ml y 1.000 ml**.
- **Referencias:** `filler-sachet-01..03` y `filler-pouch-01..03` del layout.

| Dato | Valor | Origen |
|---|---|---|
| Tamaños | 250 ml y 1.000 ml | user |
| Preset `250ml-2-lanes` | 2 pistas, 80 a 100 u/min, huella 1,6 × 1,6 × 3,0 m (mayonesa, rosada, tomate, BBQ) | assumed |
| Preset `250ml-1-lane` | 1 pista, 60 u/min (mostaza, máquina dedicada por alérgeno) | assumed |
| Preset `1000ml-1-lane` | 1 pista, 30 u/min, huella 1,8 × 1,6 × 3,2 m | assumed |
| Peso por sachet | Volumen × densidad: tomate 1,12 kg/L (280 g y 1.120 g), mayonesa 0,93 kg/L (233 g y 930 g), mostaza 1,05 kg/L | derived |
| Capacidad en caliente | 30 × 1.000 ml + 80 × 250 ml de tomate = 56 kg/min ≈ 3.000 L/h, igual a la capacidad del pasteurizador | derived |
| Máquinas en planta | 3 de 250 ml (mayonesa, tomate, mostaza) y 2 de 1.000 ml (tomate, mayonesa) | assumed |
| Llenado en caliente | Tomate y BBQ a ≥ 85 °C; por debajo, rechazo por riesgo de inocuidad. Mayonesa y mostaza en frío | layout |
| Laminado | PET/PE impreso apto para 85 °C; rollo de unos 6.000 sachets de 250 ml o 3.000 de 1.000 ml; cambio de 8 min | assumed |
| Sellado | Mordazas a 150 °C ± 10; fuera de ventana, sello débil y rechazo (fuga). En caliente se necesita más tiempo de mordaza | assumed |
| Exactitud de dosificación | Desviación típica del 1,5 % del peso nominal; crece con la viscosidad y con burbujas de aire en el producto | assumed |
| Codificación | Impresora térmica de lote y vencimiento; si falla, rechazo por código ilegible | assumed |
| Aire comprimido | ≥ 6 bar; por debajo, se detiene | layout, assumed |

- **Estados:** idle, running, blocked (salida llena), starved (sin producto o sin laminado), cleaning (CIP del dosificador), fault.
- **Variables:** velocidad, unidades, rechazos por causa (sello, peso, código, temperatura), temperatura de mordazas, temperatura del producto, peso medio y desviación, metros de laminado restantes.
- **Fallas:**
  - Atasco o rotura de película: MTBF 200 h, MTTR 6 min.
  - Resistencia de la mordaza: MTBF 600 h, MTTR 15 min. Degradación: sellos débiles.
  - Cinta de la codificadora agotada: MTBF 150 h, MTTR 3 min.
  - Goteo del dosificador: MTBF 900 h, MTTR 20 min. Degradación: sobrellenado y sellos contaminados.
- **KPIs:** OEE, sobrellenado (g regalados por unidad), rechazos por causa, laminado desperdiciado.
- **Animación:** rollo de laminado girando (se achica con el consumo), película bajando por el tubo formador, mordazas cerrando, sachets cayendo a la banda; en 2 pistas, el par de sachets cortándose.
- **Visual:** gabinete inoxidable con puertas de policarbonato, portabobinas atrás, tolva de producto arriba, HMI, baliza.

### 2. `cooling-tunnel`: túnel de enfriamiento de sachets llenados en caliente
| Dato | Valor | Origen |
|---|---|---|
| Huella | 6,0 × 1,5 × 2,0 m | layout |
| Temperaturas | Entrada 85 °C, salida 35 °C, permanencia 12 min (la necesita el de 1.000 ml; el de 250 ml enfría en unos 6 min) | layout, derived |
| Agua | De chiller a 4 °C, 12 m³/h | layout |
| Modelo térmico | Enfriamiento de primer orden del sachet; constante según el espesor (1.000 ml más grueso, enfría más lento) y el caudal de agua | derived |

- **Por qué hace falta:** si el sachet caliente se encaja sin enfriar, el producto sigue cocinándose (pierde color y consistencia) y los sachets se deforman en la caja.
- **Variables:** temperatura del agua, temperatura de salida del producto, velocidad de la banda, unidades dentro.
- **Fallas:** bomba de aspersión, con MTBF 4.000 h y MTTR 60 min. El producto sale caliente.
- **Animación:** banda de malla con sachets, cortinas de aspersión y vapor a la entrada.

### 3. `checkweigher`: control de peso con detector de metales
- **Datos:** 1,5 × 0,8 × 1,2 m (layout) · uno por tamaño: tolerancia de ±4 g en 250 ml y ±10 g en 1.000 ml (assumed) · detector de metales en línea (layout) · rechazo por empujador.
- **Variables:** peso medido, media y desviación móviles, rechazos por peso, rechazos por metal.
- **Fallas:**
  - Deriva de la celda de carga (MTBF 3.000 h): rechaza producto bueno o deja pasar producto malo.
  - Prueba de detector de metales vencida: cada 2 h se exige una prueba con patrón; si no se hace, el lote queda retenido.

### 4. `case-packer`: encajado de sachets
- **Datos:** 5 a 6 cajas/min, huella 3,0 × 2,0 × 2,0 m (layout).
- **Formatos:** 250 ml en cajas de 24 u y 1.000 ml en cajas de 12 u (assumed).
- **Fallas:** atasco de caja, con MTBF 200 h y MTTR 5 min. La falta de cajas deja la máquina en starved.

---

## Familia 2: Transporte y logística (ambas plantas)

### 5. `belt-conveyor`: banda transportadora
| Dato | Valor | Origen |
|---|---|---|
| Parámetros | Largo, ancho, velocidad, capacidad de acumulación y tipo (banda plana, tablillas o rodillos) | assumed |
| Inyección | Banda principal de 88 m a 0,3 m/s (cruce elevado sobre el pasillo) | layout |
| Salsas | Bandas de salida de las sachetadoras hacia el túnel, el control de peso y el encajado, a 0,3 m/s | assumed |

- **Comportamiento:** acumula unidades. Si se llena, bloquea la máquina anterior; si se vacía, deja en starved a la siguiente.
- **Fallas:** motor (MTBF 8.000 h) y banda desalineada (MTBF 2.000 h).
- **Animación:** unidades (piezas o sachets) moviéndose sobre la banda.

### 6. `forklift`: montacargas
- **Datos:** eléctrico, 2,5 t, 2,4 × 1,2 × 2,2 m, 8 km/h cargado (assumed).
- **Comportamiento:** recibe órdenes de transporte (de una estación a otra), se mueve por los pasillos y lleva una estiba. Tiene batería con nivel de carga.
- **Animación:** desplazamiento, horquillas subiendo y bajando, baliza azul.

### 7. `stretch-wrapper`: envolvedora de estibas
- **Datos:** 20 a 30 estibas/h (layout), ciclo de 100 s, 3 × 3 × 2,5 m.
- **Fallas:** rotura de film, con MTBF 100 h y MTTR 3 min.

### 8. `static-asset`: infraestructura sin simulación
- **Variantes:** rack de estibas, estantería, banco de trabajo, mesa de laboratorio, muelle, transformador, rack de moldes, CNC, EDM, rectificadora, PTAR, ablandador y ósmosis.
- **Comportamiento (B1):** solo estado y, en racks, ocupación (estibas usadas / capacidad).
- **Visual:** detallado porque llena la escena: estibas con cajas en los racks, moldes en sus racks, máquinas CNC con cerramiento.

---

## Familia 3: Térmico (planta de salsas)

### 9. `tubular-pasteurizer`: pasteurizador tubular con tubo de retención
| Dato | Valor | Origen |
|---|---|---|
| Caudal | 3.000 L/h | layout |
| Temperaturas | Entrada de 85 a 88 °C (desde la marmita), salida 95 °C | layout |
| Retención | 30 s a ≥ 92 °C; si baja, la válvula de desvío devuelve el producto a la marmita | layout |
| Medio de calentamiento | Vapor desde la caldera, 300 kg/h | layout |
| Ensuciamiento | El coeficiente de transferencia cae un 15 % en 8 h; exige CIP | assumed |
| Letalidad | Se acumula el valor de pasteurización (P, referencia 93,3 °C, z = 8,3 °C) y se reporta por lote | assumed |

- **Variables:** temperaturas de entrada, salida y retención; caudal; vapor; posición de la válvula de desvío; P acumulado; ensuciamiento.
- **Fallas:**
  - Válvula de desvío pegada: MTBF 20.000 h, MTTR 60 min. **Crítica**: el lote queda retenido.
  - Deriva de la sonda de retención: manual.
  - Bomba de producto: MTBF 6.000 h, MTTR 45 min.
- **KPIs:** tiempo en desvío, lotes retenidos, vapor por tonelada.
- **Animación:** flujo por los tubos (color por temperatura), válvula de desvío y vapor.

---

## Familia 4: Mezcla y molienda (planta de salsas)

### 10. `vacuum-emulsifier`: emulsificador al vacío
| Dato | Valor | Origen |
|---|---|---|
| Volumen y batch | 2.000 L; batch de 1.500 kg | layout |
| Vacío | −0,8 bar | layout |
| Rotor | Hasta 3.000 rpm | layout |
| Chaqueta | Agua helada del banco de hielo; producto ≤ 18 °C | layout |
| Fases | Receta de mayonesa del `plant.yaml`: cargar fase acuosa, vacío, dosificar aceite, vinagre, homogeneizar, transferir | layout |
| Calidad | La viscosidad sube con la fracción de aceite. La emulsión se rompe si el aceite entra demasiado rápido (> 6.000 kg/h), si el producto supera 22 °C o si se pierde el vacío | assumed |

- **Fallas:** sello mecánico del rotor (MTBF 3.000 h, MTTR 90 min) y fuga de vacío (MTBF 1.500 h, MTTR 20 min).
- **Animación:** nivel, giro del rotor, vacuómetro, aceite entrando por la tubería.

### 11. `inline-mill`: molino en línea
| Dato | Valor | Origen |
|---|---|---|
| Modo `colloid` | Molino coloidal de 4.500 kg/h, gap de 0,3 mm, 15 kW | layout |
| Modo `stone` | Molino de piedra para mostaza, 1.000 kg/h | layout |
| Proceso | Calienta el producto de 3 a 6 °C. El tamaño de gota o partícula depende del gap y del desgaste | assumed |

- **Fallas:** desgaste de rotor y estator (degradación lenta: la gota crece) y sobrecarga del motor (MTBF 2.000 h).

---

## Familia 5: Materiales plásticos (planta de inyección)

### 12. `desiccant-dryer`: secador desecante
| Dato | Valor | Origen |
|---|---|---|
| Capacidad | De 150 a 400 kg/h según el preset; 80 °C; punto de rocío −40 °C | layout |
| Modelo | La humedad de salida de la resina depende del tiempo de residencia, la temperatura y el punto de rocío. Sale como entrada `resin_moisture_pct` de la inyectora | derived |

- **Fallas:** falla de regeneración del desecante (MTBF 2.500 h, MTTR 60 min): el punto de rocío sube a −10 °C, la humedad sube y la inyectora de ABS empieza a rechazar por rayas plateadas.
- **Animación:** tolva de secado, indicador de punto de rocío.

### 13. `gravimetric-blender`: mezclador gravimétrico
- **Datos:** 4 componentes, 600 kg/h (layout); receta de virgen, reciclado y masterbatch, típicamente 40/58/2 % (assumed, coherente con el 60 % de reciclado).
- **Fallas:** deriva de la celda de carga (MTBF 3.000 h): error de dosificación de masterbatch, que produce variación de color.

### 14. `vacuum-conveying-station`: transporte neumático central
- **Datos:** 3 bombas de 7,5 kW y 29 líneas (layout); capacidad de unos 2.300 kg/h (layout).
- **Fallas:** filtro tapado (MTBF 500 h, MTTR 10 min): baja la capacidad y algunas inyectoras quedan sin material.

### 15. `granulator`: molino de plástico
- **Datos:** de 300 a 500 kg/h, criba de 10 mm (layout). Molino al pie de máquina, con preset pequeño de 40 kg/h (assumed).
- **Fallas:** cuchillas sin filo (degradación: más finos y polvo) y atasco (MTBF 300 h, MTTR 10 min).

### 16. `pelletizing-line`: lavado y peletizado de reciclado
| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 300 a 350 kg/h | layout |
| Filtro | Cambiador de malla: la presión de masa sube de 120 a 200 bar a medida que se tapa; cambio cada 2 a 4 h según contaminación | assumed |
| Calidad | Índice de fluidez (MFI) del pellet según la mezcla de entrada | assumed |

- **Fallas:** rotura del hilo de extrusión (MTBF 100 h, MTTR 5 min) y resistencias del cabezal.

---

## Familia 6: Servicios (ambas plantas)

### 17. `steam-boiler`: caldera pirotubular
- **Datos:** 60 BHP, 940 kg/h, 8 bar, gas natural (layout); quemador modulante (assumed).
- **Modelo:** la presión del vapor responde al balance entre generación y demanda (marmitas y pasteurizador). Si la demanda supera la capacidad, la presión cae y todos los consumidores lo sienten.
- **Fallas:** apagado de llama (MTBF 2.000 h, MTTR 30 min) y bajo nivel de agua (MTBF 5.000 h, MTTR 45 min).
- **KPIs:** consumo de gas (m³/h) y eficiencia.

### 18. `chiller`: enfriador de agua
- **Presets:**
  - `600kw-mold-water`: inyección, agua a 12 °C (layout).
  - `150kw-process`: salsas, agua a 4 °C (layout).
  - `ice-bank`: banco de hielo de 600 kWh (layout).
- **Modelo:** la temperatura de suministro sube si la carga supera la capacidad. Compresores por etapas, con su consumo eléctrico.
- **Fallas:** disparo por alta presión (MTBF 3.000 h, MTTR 45 min): el agua de los moldes se calienta.

### 19. `air-compressor`: compresor de tornillo
- **Datos:** 22 kW en salsas y 75 kW en inyección (layout); banda de carga y descarga de 6,5 a 7,5 bar (assumed).
- **Fallas:** sobretemperatura (MTBF 4.000 h) y fugas (degradación: más tiempo en carga).

### 20. `cooling-tower`: torre de enfriamiento
- **Datos:** 1.200 kW, agua a 28 °C (layout). Temperatura de bulbo húmedo en Medellín ≈ 19 °C (assumed).
- **Modelo:** aproximación al bulbo húmedo según la carga y el ventilador.
- **Fallas:** ventilador (MTBF 6.000 h): sube la temperatura del aceite de las inyectoras grandes.

### 21. `cip-skid`: limpieza en sitio
| Dato | Valor | Origen |
|---|---|---|
| Configuración | 4 circuitos; tanques de soda 1,5 %, ácido 1 %, agua recuperada y agua final; 80 °C | layout |
| Secuencia típica | Preenjuague 5 min → soda 15 min a 80 °C → enjuague 5 → ácido 10 → enjuague final 5 (≈ 40 min) | assumed |
| Verificación | Un CIP es válido solo si cumple temperatura, tiempo y conductividad en cada paso; si no, el equipo queda "no liberado" | assumed |

- **Variables:** temperatura de suministro, conductividad de retorno, caudal, circuito y paso.
- **Fallas:** baja concentración de soda (MTBF 1.000 h): el CIP sale inválido.

---

## Familia 7: Inyección, moldes y secundarias

### 22. `overhead-crane`: puente grúa
- **Datos:** 15 t, luz de 20 m, recorrido de 88 m (layout); velocidades de traslación de 0,5 m/s y de izaje de 0,1 m/s (assumed).
- **Comportamiento:** ejecuta el traslado del molde en los cambios (SMED), con trayectoria entre el rack de moldes y la inyectora.
- **Animación:** puente, carro, gancho y molde colgando.

### 23. `workstation`: estación de trabajo
- **Variantes:**
  - Ensamble de pedal y palanca de papelera: ciclo de 35 s, 1 operario.
  - Ensamble de bisagras y tapas: 20 s.
  - Tampografía de 2 colores: 6 s.
  - Etiquetado: 8 s.
  - Espumado de neveras: 4 moldes, 8 min de curado.
  - Mesa de empaque: 12 s por caja.

  Todos los ciclos son assumed.
- **Comportamiento:** como la plantilla (ciclo, calidad y fallas); requiere un operario asignado para producir.

---

## Familia 8: Personas

### 24. `operator`: operario
| Dato | Valor | Origen |
|---|---|---|
| Escala | 1,70 m; cabeza, torso, brazos y piernas distinguibles | assumed |
| Roles | Operario, técnico de mantenimiento, inspector de calidad, montacarguista, supervisor | assumed |
| EPP | Inyección: casco, gafas, overol azul. Salsas: cofia, tapabocas, bata blanca, botas blancas | assumed |
| Poses | Caminar, operar en HMI, inspeccionar, esperar, reparar (agachado) | assumed |

- **Comportamiento:** asignado a una estación o a una ruta. Durante una falla, el técnico camina hasta el equipo y el tiempo de reparación empieza al llegar.

---

## Orden de construcción propuesto
1. **Línea de sachets de salsas (250 y 1.000 ml):** `vffs-sachet-filler`, `belt-conveyor`, `cooling-tunnel`, `checkweigher` y `case-packer`. Más `tubular-pasteurizer` y `steam-boiler`, que ya existen aguas arriba con la marmita y el tanque pulmón: es la primera línea completa, de la pasta de tomate a la caja.
2. **Cascada de inyección:** `desiccant-dryer`, `chiller`, `granulator` y `operator`.
3. El resto de las familias, en el orden del resumen.
