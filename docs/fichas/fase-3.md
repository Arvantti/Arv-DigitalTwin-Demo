# Fichas de la fase 3: equipos de las dos plantas

> **Estado: borrador para revisión.** Armadas con valores típicos de la industria (opción A). Nada de esto se programa hasta que se confirme.
> Origen de los datos: **layout** = viene del `plant.yaml` ya aprobado · **assumed** = valor típico propuesto · **derived** = calculado de otros datos.
> Al confirmarlas, cada ficha se copia como `FICHA.md` en la carpeta de su tipo.

## Resumen

| # | Tipo | Familia | Planta | Fidelidad | Protagonista 3D |
|---|---|---|---|---|---|
| 1 | `rotary-filler` | Envasado | Salsas | V2 / B3 | Sí |
| 2 | `capper` | Envasado | Salsas | V2 / B2 | |
| 3 | `cooling-tunnel` | Envasado | Salsas | V2 / B3 | |
| 4 | `labeler` | Envasado | Salsas | V2 / B2 | |
| 5 | `pouch-filler` | Envasado | Salsas | V2 / B3 | Sí |
| 6 | `checkweigher` | Envasado | Salsas | V2 / B2 | |
| 7 | `case-packer` | Envasado | Salsas | V2 / B2 | |
| 8 | `belt-conveyor` | Transporte | Ambas | V2 / B2 | |
| 9 | `forklift` | Transporte | Ambas | V2 / B2 | |
| 10 | `stretch-wrapper` | Transporte | Ambas | V2 / B2 | |
| 11 | `static-asset` | Transporte e infraestructura | Ambas | V2 / B1 | |
| 12 | `tubular-pasteurizer` | Térmico | Salsas | V2 / B3 | Sí |
| 13 | `vacuum-emulsifier` | Mezcla | Salsas | V2 / B3 | Sí |
| 14 | `inline-mill` | Mezcla | Salsas | V2 / B3 | |
| 15 | `desiccant-dryer` | Materiales plásticos | Inyección | V2 / B3 | |
| 16 | `gravimetric-blender` | Materiales plásticos | Inyección | V2 / B2 | |
| 17 | `vacuum-conveying-station` | Materiales plásticos | Inyección | V2 / B2 | |
| 18 | `granulator` | Materiales plásticos | Inyección | V2 / B2 | |
| 19 | `pelletizing-line` | Materiales plásticos | Inyección | V2 / B3 | |
| 20 | `steam-boiler` | Servicios | Salsas | V2 / B3 | |
| 21 | `chiller` | Servicios | Ambas | V2 / B3 | |
| 22 | `air-compressor` | Servicios | Ambas | V2 / B2 | |
| 23 | `cooling-tower` | Servicios | Inyección | V2 / B3 | |
| 24 | `cip-skid` | Servicios | Salsas | V2 / B3 | |
| 25 | `overhead-crane` | Inyección: moldes | Inyección | V2 / B2 | |
| 26 | `workstation` | Inyección: secundarias | Inyección | V2 / B2 | |
| 27 | `operator` | Personas | Ambas | V2 / B2 | Sí |

Además se agregan **presets** a tipos existentes: `vessel` (tanque de fase acuosa 800 L, tanque de mostaza 1.200 L, tanque de vinagre 10 m³, tanque de agua tratada 10 m³ y silos de reciclado de 30 t).

### Decisiones de diseño a confirmar
1. **Tipos combinados para no multiplicar la librería:**
   - `pouch-filler` cubre sachet (VFFS) y doypack.
   - `inline-mill` cubre el molino coloidal y el de piedra.
   - `static-asset` cubre lo que no se simula: racks, bancos, muelles, transformador, mesas de laboratorio, CNC, EDM y PTAR.
   - `workstation` cubre las estaciones manuales y semiautomáticas: ensamble, tampografía, espumado y empaque.
2. **Cascadas entre equipos** (se activan en la fase 4, cuando los equipos se conecten):
   - El secador entrega la humedad de la resina a la inyectora: si falla, aparecen rayas plateadas.
   - El chiller entrega el agua de los moldes: si falla, aumentan los rechupes y se alarga el ciclo.
   - La caldera entrega la presión de vapor a las marmitas y al pasteurizador: si cae, el batch se alarga y el pasteurizador desvía.
   - El compresor alimenta las sachetadoras: si la presión baja, se detienen.
3. **Fases de batch reutilizables.** El ejecutor de fases de la marmita pasa a ser una primitiva del runtime (`BatchPhaseRunner`), para que el emulsificador y el CIP lo reutilicen.
4. **Operarios** a escala real (1,70 m), con EPP según la planta: casco y overol en inyección; cofia, tapabocas y bata blanca en salsas. Representan turnos y tareas, no personas reales.

---

## Familia 1: Envasado (planta de salsas)

### 1. `rotary-filler`: llenadora rotativa
- **Función:** llena botellas y galones con salsa caliente (tomate, BBQ) o fría (mayonesa), y alimenta la tapadora.
- **Referencias:** `filler-bottle-01` y `filler-gallon-01` del layout.

| Dato | Valor | Origen |
|---|---|---|
| Preset `bottle-12h` | Carrusel de 12 cabezales, 60 u/min, botellas de 400 a 1.000 g, huella 3,0 × 2,0 × 2,2 m | layout |
| Preset `piston-gallon` | 2 cabezales de pistón, 8 u/min, 3 a 4 kg, huella 2,0 × 2,0 × 2,2 m | layout |
| Llenado en caliente | Producto ≥ 85 °C; por debajo, el envase se rechaza (riesgo de inocuidad) | layout |
| Exactitud de llenado | Desviación típica de 1,5 g en botella y 8 g en galón; crece con la viscosidad y si gotea una boquilla | assumed |
| Tolerancia | Peso nominal −0 / +2 %; por fuera, rechazo | assumed |

- **Estados:** idle, running, blocked (salida llena), starved (sin producto o sin envases), cleaning (CIP), fault.
- **Variables:** velocidad (u/min), unidades llenadas, rechazos, temperatura del producto, peso medio y desviación, nivel del tanque superior.
- **Fallas:**
  - Atasco de botella: MTBF 150 h, MTTR 5 min.
  - Boquilla goteando: MTBF 800 h, MTTR 20 min. Degradación: sobrellenado.
  - Sensor de nivel del tanque superior: MTBF 5.000 h, MTTR 30 min.
- **KPIs:** OEE, sobrellenado (g de producto regalado por unidad), rechazos por temperatura.
- **Animación:** giro del carrusel, botellas entrando y saliendo por las estrellas, boquillas bajando, nivel del tanque superior.
- **Visual:** carrusel inoxidable bajo guardas de policarbonato, tanque superior con mirilla, estrellas de entrada y salida, tablero con HMI.

### 2. `capper`: tapadora rotativa
| Dato | Valor | Origen |
|---|---|---|
| Velocidad | 60 u/min | layout |
| Huella | 1,5 × 1,5 × 2,0 m | layout |
| Tapas | Tolva con orientador de 2.000 tapas; alimentación de tapas como entrada | assumed |
| Torque | 2,5 N·m ± 0,2; tapa cruzada en el 0,3 % de las unidades, que se rechazan | assumed |

- **Fallas:** atasco de tapas, con MTBF 300 h y MTTR 5 min. La falta de tapas deja la máquina en starved.
- **Animación:** giro de la torreta, cabezales roscando, nivel de la tolva de tapas.

### 3. `cooling-tunnel`: túnel de enfriamiento por aspersión
| Dato | Valor | Origen |
|---|---|---|
| Huella | 6,0 × 1,5 × 2,0 m | layout |
| Temperaturas | Entrada 85 °C, salida 40 °C, permanencia 15 min | layout |
| Agua | De chiller a 4 °C, 12 m³/h | layout |
| Modelo térmico | Enfriamiento de primer orden de la botella; constante según la masa de la botella y el caudal de agua | derived |

- **Variables:** temperatura del agua, temperatura de salida del producto, velocidad de la banda, unidades dentro.
- **Fallas:** bomba de aspersión, con MTBF 4.000 h y MTTR 60 min. Sin aspersión, el producto sale caliente y la etiqueta no adhiere.
- **Animación:** banda con botellas, cortinas de aspersión y vapor a la entrada.

### 4. `labeler`: etiquetadora autoadhesiva
| Dato | Valor | Origen |
|---|---|---|
| Velocidad | 60 u/min | layout |
| Huella | 2,0 × 1,5 × 1,8 m | layout |
| Rollo | 3.000 etiquetas; cambio planificado de 3 min | assumed |
| Calidad | Etiqueta torcida en el 0,5 %; sube si la botella llega a más de 45 °C | assumed |

- **Fallas:** atasco, con MTBF 250 h y MTTR 5 min.
- **Animación:** rollo que se desenrolla, botella girando en el aplicador.

### 5. `pouch-filler`: llenadora de sachets y doypacks
| Dato | Valor | Origen |
|---|---|---|
| Modo `vffs_sachet` | VFFS de 8 pistas × 40 ciclos/min = 320 u/min, sachets de 8 a 10 g, huella 1,6 × 1,6 × 3,0 m | layout |
| Modo `premade_pouch` | Doypack prefabricado, 40 u/min, 200 o 500 g, huella 3,0 × 3,0 × 2,5 m | layout |
| Sellado | Mordaza a 150 °C ± 10; fuera de ventana, el sello falla y la unidad se rechaza | assumed |
| Laminado | Rollo de unos 25.000 sachets; cambio de 8 min | assumed |
| Aire comprimido | 1,5 m³/min a ≥ 6 bar; por debajo, la máquina se detiene | layout, assumed |

- **Fallas:**
  - Atasco de película: MTBF 200 h, MTTR 6 min.
  - Resistencia de la mordaza: MTBF 600 h, MTTR 15 min. Degradación: sellos débiles.
- **Animación:** película bajando por el formador, mordazas cerrando, sachets cayendo; en doypack, carrusel de bolsas.

### 6. `checkweigher`: control de peso
- **Datos:** 1,5 × 0,8 × 1,2 m (layout) · tolerancia ±2 g (layout) · rechazo por soplador.
- **Variables:** peso medido, media y desviación móviles, rechazos.
- **Fallas:** deriva de la celda de carga (MTBF 3.000 h): rechaza producto bueno o deja pasar producto malo.

### 7. `case-packer`: encajadora
- **Datos:** 5 a 6 cajas/min, huella 3,0 × 2,0 × 2,0 m (layout) · 12 a 24 unidades por caja según presentación (assumed).
- **Fallas:** atasco de caja, con MTBF 200 h y MTTR 5 min. La falta de cajas deja la máquina en starved.

---

## Familia 2: Transporte y logística (ambas plantas)

### 8. `belt-conveyor`: banda transportadora
| Dato | Valor | Origen |
|---|---|---|
| Parámetros | Largo, ancho, velocidad, capacidad de acumulación y tipo (banda plana, tablillas o rodillos) | assumed |
| Inyección | Banda principal de 88 m a 0,3 m/s (cruce elevado sobre el pasillo) | layout |
| Salsas | Transportadores de tablillas entre llenadora, tapadora, túnel, etiquetadora y encajadora, a 0,2 m/s | assumed |

- **Comportamiento:** acumula unidades. Si se llena, bloquea la máquina anterior; si se vacía, deja en starved a la siguiente.
- **Fallas:** motor (MTBF 8.000 h) y banda desalineada (MTBF 2.000 h).
- **Animación:** unidades (piezas o botellas) moviéndose sobre la banda.

### 9. `forklift`: montacargas
- **Datos:** eléctrico, 2,5 t, 2,4 × 1,2 × 2,2 m, 8 km/h cargado (assumed).
- **Comportamiento:** recibe órdenes de transporte (de una estación a otra), se mueve por los pasillos y lleva una estiba. Tiene batería con nivel de carga.
- **Animación:** desplazamiento, horquillas subiendo y bajando, baliza azul.

### 10. `stretch-wrapper`: envolvedora de estibas
- **Datos:** 20 a 30 estibas/h (layout), ciclo de 100 s, 3 × 3 × 2,5 m.
- **Fallas:** rotura de film, con MTBF 100 h y MTTR 3 min.

### 11. `static-asset`: infraestructura sin simulación
- **Variantes:** rack de estibas, estantería, banco de trabajo, mesa de laboratorio, muelle, transformador, rack de moldes, CNC, EDM, rectificadora, PTAR, ablandador y ósmosis.
- **Comportamiento (B1):** solo estado y, en racks, ocupación (estibas usadas / capacidad).
- **Visual:** detallado porque llena la escena: estibas con cajas en los racks, moldes en sus racks, máquinas CNC con cerramiento.

---

## Familia 3: Térmico (planta de salsas)

### 12. `tubular-pasteurizer`: pasteurizador tubular con tubo de retención
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

### 13. `vacuum-emulsifier`: emulsificador al vacío
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

### 14. `inline-mill`: molino en línea
| Dato | Valor | Origen |
|---|---|---|
| Modo `colloid` | Molino coloidal de 4.500 kg/h, gap de 0,3 mm, 15 kW | layout |
| Modo `stone` | Molino de piedra para mostaza, 1.000 kg/h | layout |
| Proceso | Calienta el producto de 3 a 6 °C. El tamaño de gota o partícula depende del gap y del desgaste | assumed |

- **Fallas:** desgaste de rotor y estator (degradación lenta: la gota crece) y sobrecarga del motor (MTBF 2.000 h).

---

## Familia 5: Materiales plásticos (planta de inyección)

### 15. `desiccant-dryer`: secador desecante
| Dato | Valor | Origen |
|---|---|---|
| Capacidad | De 150 a 400 kg/h según el preset; 80 °C; punto de rocío −40 °C | layout |
| Modelo | La humedad de salida de la resina depende del tiempo de residencia, la temperatura y el punto de rocío. Sale como entrada `resin_moisture_pct` de la inyectora | derived |

- **Fallas:** falla de regeneración del desecante (MTBF 2.500 h, MTTR 60 min): el punto de rocío sube a −10 °C, la humedad sube y la inyectora de ABS empieza a rechazar por rayas plateadas.
- **Animación:** tolva de secado, indicador de punto de rocío.

### 16. `gravimetric-blender`: mezclador gravimétrico
- **Datos:** 4 componentes, 600 kg/h (layout); receta de virgen, reciclado y masterbatch, típicamente 40/58/2 % (assumed, coherente con el 60 % de reciclado).
- **Fallas:** deriva de la celda de carga (MTBF 3.000 h): error de dosificación de masterbatch, que produce variación de color.

### 17. `vacuum-conveying-station`: transporte neumático central
- **Datos:** 3 bombas de 7,5 kW y 29 líneas (layout); capacidad de unos 2.300 kg/h (layout).
- **Fallas:** filtro tapado (MTBF 500 h, MTTR 10 min): baja la capacidad y algunas inyectoras quedan sin material.

### 18. `granulator`: molino de plástico
- **Datos:** de 300 a 500 kg/h, criba de 10 mm (layout). Molino al pie de máquina, con preset pequeño de 40 kg/h (assumed).
- **Fallas:** cuchillas sin filo (degradación: más finos y polvo) y atasco (MTBF 300 h, MTTR 10 min).

### 19. `pelletizing-line`: lavado y peletizado de reciclado
| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 300 a 350 kg/h | layout |
| Filtro | Cambiador de malla: la presión de masa sube de 120 a 200 bar a medida que se tapa; cambio cada 2 a 4 h según contaminación | assumed |
| Calidad | Índice de fluidez (MFI) del pellet según la mezcla de entrada | assumed |

- **Fallas:** rotura del hilo de extrusión (MTBF 100 h, MTTR 5 min) y resistencias del cabezal.

---

## Familia 6: Servicios (ambas plantas)

### 20. `steam-boiler`: caldera pirotubular
- **Datos:** 60 BHP, 940 kg/h, 8 bar, gas natural (layout); quemador modulante (assumed).
- **Modelo:** la presión del vapor responde al balance entre generación y demanda (marmitas y pasteurizador). Si la demanda supera la capacidad, la presión cae y todos los consumidores lo sienten.
- **Fallas:** apagado de llama (MTBF 2.000 h, MTTR 30 min) y bajo nivel de agua (MTBF 5.000 h, MTTR 45 min).
- **KPIs:** consumo de gas (m³/h) y eficiencia.

### 21. `chiller`: enfriador de agua
- **Presets:**
  - `600kw-mold-water`: inyección, agua a 12 °C (layout).
  - `150kw-process`: salsas, agua a 4 °C (layout).
  - `ice-bank`: banco de hielo de 600 kWh (layout).
- **Modelo:** la temperatura de suministro sube si la carga supera la capacidad. Compresores por etapas, con su consumo eléctrico.
- **Fallas:** disparo por alta presión (MTBF 3.000 h, MTTR 45 min): el agua de los moldes se calienta.

### 22. `air-compressor`: compresor de tornillo
- **Datos:** 22 kW en salsas y 75 kW en inyección (layout); banda de carga y descarga de 6,5 a 7,5 bar (assumed).
- **Fallas:** sobretemperatura (MTBF 4.000 h) y fugas (degradación: más tiempo en carga).

### 23. `cooling-tower`: torre de enfriamiento
- **Datos:** 1.200 kW, agua a 28 °C (layout). Temperatura de bulbo húmedo en Medellín ≈ 19 °C (assumed).
- **Modelo:** aproximación al bulbo húmedo según la carga y el ventilador.
- **Fallas:** ventilador (MTBF 6.000 h): sube la temperatura del aceite de las inyectoras grandes.

### 24. `cip-skid`: limpieza en sitio
| Dato | Valor | Origen |
|---|---|---|
| Configuración | 4 circuitos; tanques de soda 1,5 %, ácido 1 %, agua recuperada y agua final; 80 °C | layout |
| Secuencia típica | Preenjuague 5 min → soda 15 min a 80 °C → enjuague 5 → ácido 10 → enjuague final 5 (≈ 40 min) | assumed |
| Verificación | Un CIP es válido solo si cumple temperatura, tiempo y conductividad en cada paso; si no, el equipo queda "no liberado" | assumed |

- **Variables:** temperatura de suministro, conductividad de retorno, caudal, circuito y paso.
- **Fallas:** baja concentración de soda (MTBF 1.000 h): el CIP sale inválido.

---

## Familia 7: Inyección, moldes y secundarias

### 25. `overhead-crane`: puente grúa
- **Datos:** 15 t, luz de 20 m, recorrido de 88 m (layout); velocidades de traslación de 0,5 m/s y de izaje de 0,1 m/s (assumed).
- **Comportamiento:** ejecuta el traslado del molde en los cambios (SMED), con trayectoria entre el rack de moldes y la inyectora.
- **Animación:** puente, carro, gancho y molde colgando.

### 26. `workstation`: estación de trabajo
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

### 27. `operator`: operario
| Dato | Valor | Origen |
|---|---|---|
| Escala | 1,70 m; cabeza, torso, brazos y piernas distinguibles | assumed |
| Roles | Operario, técnico de mantenimiento, inspector de calidad, montacarguista, supervisor | assumed |
| EPP | Inyección: casco, gafas, overol azul. Salsas: cofia, tapabocas, bata blanca, botas blancas | assumed |
| Poses | Caminar, operar en HMI, inspeccionar, esperar, reparar (agachado) | assumed |

- **Comportamiento:** asignado a una estación o a una ruta. Durante una falla, el técnico camina hasta el equipo y el tiempo de reparación empieza al llegar.

---

## Orden de construcción propuesto
1. **Línea de botellas de salsas:** `belt-conveyor`, `rotary-filler`, `capper`, `cooling-tunnel`, `labeler` y `case-packer`. Más `tubular-pasteurizer` y `steam-boiler`, que ya existen aguas arriba con la marmita y el tanque pulmón: es la primera línea completa.
2. **Cascada de inyección:** `desiccant-dryer`, `chiller`, `granulator` y `operator`.
3. El resto de las familias, en el orden del resumen.
