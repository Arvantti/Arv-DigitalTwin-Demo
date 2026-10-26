---
tipo: bitacora
tags: [registro, bitacora]
actualizado: 2026-10-25
---
# Bitácora de avances

Índice: [[00-indice]] · Plan: [[plan-del-proyecto]] · Cómo actualizarla: [[como-actualizar]] · Plantilla: [[plantilla-entrada]].
Horas en UTC (Colombia = UTC−5). Más reciente arriba. PR = pull request en `Arvantti/Arv-sfot-demo-Fabtimus`.

| Fecha | PR | Resumen | Fase |
|---|---|---|---|
| 2026-10-26 | PR #83 · PLC solo integrado y comparativas | Acceso independiente PLC redirige al escritorio 3D; recurso iframe conservado. Pestaña COMPARATIVAS con evidencia C44/fija, gráficas y error relativo %, sin mandos. Typecheck/build OK; smoke en build: 16 paneles C44, 13 fijo (3 niveles pendientes); redirección verificada. Browser oculto requirió RAF por temporizador solo en harness. [[2026-10-26-plc-integrado-comparativas]] | UI PLC |
| 2026-10-26 | PR #83 · plan y pruebas P1–P3 | Plan de diagnóstico escrito; primer ciclo C44 constante con 1770 pasos/5310 filas de vasos. Balances PLC cierran a <1e-8 m³; bomba y recepción difieren 0,309 litros. Niveles iniciales verdaderos reducen adelanto de parada de 3,919 a 2,668 s, no lo eliminan. JSON/CSV y script reproducible, Ruff y diff-check. [[../../architecture/recirculation-parity-test-plan]] | PLC/Fractal |
| 2026-10-26 | PR #83 · diagnóstico C44 | Comparados tres ciclos en 2 h sin cambiar modelos: desfase de parada Fractal−PLC −3,919/−11,465/−20,138 s; volumen contabilizado de retorno −35,736 litros. Sobrepaso del nivel PLC frente al cruce interpolado Fractal identificado; falta separar contribuciones y cerrar balances de vasos. [[../../architecture/validation/pdd-prs-c44-cycles-diagnosis]] | PLC/Fractal |
| 2026-10-25 | PR #83 · PRS AUTO de punto fijo C44 a 18 mca | Segundo modo de AUTO con señal separada de L4.C44, salida variable y rama manual cerrada. Fractal revisó las 64 viviendas durante 24 franjas y demandas ×0,9/×1/×1,1: C44 empató el mínimo en 72/72 casos, con otras casas empatadas; mínima 17,99807 mca. Replay PLC virtual de 24 h (86.371 muestras a 1 s): mínima 17,51569 mca en C44, cero <15, salida PRS 21,18489–24,75767, rama manual sin caudal; gráfica comparativa por piso en HTML. Niveles futuros y presión física siguen sin validar; optimización apagada. Ver [[../../architecture/prs-critical-point-scenario]], JSON/CSV y [gráfica HTML por piso](../../architecture/validation/pdd-prs-critical-point-18-01-pressure-by-floor.html). | PLC/Fractal |
| 2026-10-25 | PR #83 · PRS AUTO de salida fija; referencia D76–D78 | Perfil PDD con objetivo de entrada 70 mca y ajuste fijo de salida 40, rama manual cerrada; se muestrearon 64 viviendas cada segundo simulado: mínimo emulador 30,40013 mca, sin muestras <15. Fractal en 24 franjas y tres multiplicadores de demanda: mínimo 29,33345 mca (×1,1). Actualizado `network.py` para incluir checks D76–D78, resolviendo la única falla del CI del PR #82. Suite Python 367 pasó, 1 omitida; Ruff y Gallery build/typecheck OK. No valida niveles futuros ni presión física continua. Evidencia JSON/CSV. [[../../architecture/prs-fixed-outlet-scenario]] | PLC/Fractal |
| 2026-10-25 | PR #82 · Alineación absoluta del horizonte D78 | Fractal acorta la primera franja hasta el siguiente límite horario PLC y compara en t=3600…86400 con perfil idéntico. Replay D78: 24 fronteras horarias (t=30…86400; 86.370 s simulados) en 2032,79 s reales; suministro al final difiere +34,02598 pp (+1,322930 m³); 46 arranques ambos, 46/45 paradas; cero desacuerdos de presión ≥15 mca en 24 marcas, no cada segundo. Niveles siguen sin validar; optimización apagada. Evidencia alineada adjunta. | PLC/Fractal |
| 2026-10-25 | PR (este) · Esquema del acueducto para los demás gemelos | Propuesta sin código: cómo el acueducto define emulador, PLC virtual, gateway OPC UA simulado, gemelo 3D y Fractal (simulador de escenarios hecho, optimizador pendiente), qué parte del código es genérica y cómo se traduce a plásticos, salsas, cajas, aeropuerto, ciudad y confecciones; piloto sugerido plásticos; decisiones abiertas para Andy. No toca el acueducto. [[../../architecture/esquema-gemelo-todos-los-modelos]] · [[hilo-arquitectura-para-todos-los-gemelos]] | arquitectura/Fractal |
| 2026-10-25 | #80 · Programación de producción a 30 días | Salsas y plásticos tienen pedidos inventados con ventana móvil (semilla por fecha de entrega, 85 % de la capacidad, algunos tarde al azar), un secuenciador de referencia con turnos, paradas y herramental montado, la sección PROGRAMACIÓN del panel lateral con tabla de órdenes, rango hacia atrás a elección (por defecto el mes en curso) y pedido urgente con escenario que se acepta o descarta. API `/api/schedules`, export estático y despliegue semanal. D75. Pedido de Andy | datos reales |
| 2026-10-24 | PR #79 · escritorio acueducto desktop | Por instrucción del autor se sustituyeron tres presets auxiliares por dos curvas de referencia y una plantilla personalizada; administración CRUD de escenarios nombrados con 64 viviendas/8 fugas por hora, protección de perfil en uso, gráfica dual apertura/PRS autoescalada con presión Fractal bajo demanda desde PLC en play. `plant.html` conserva el 3D y muestra PLC e histórico en pestañas de la misma pantalla; fotogramas SQLite de solo lectura permiten regresar al pasado sin rebobinar la operación; Fractal queda opcional y la optimización sigue apagada. Ver [[../../architecture/plc-fractal-desktop-workspace]]. Verificación: 41 pruebas API/Fractal, 149 de geometría con un worker, Ruff, typecheck/build y smoke browser de editor, presión, 3D histórico y regreso a actual. Mobile y despliegue API integrados siguen pendientes. [[2026-10-24-escenarios-integrados-3d]] | PLC/Fractal |
| 2026-10-24 | PR #79 · 46 ciclos retorno | Contraste continuo de 24 h desde t=30 s sin desfase de muestreo: 46 ciclos en ambos motores, desfase de parada −2 s primero, −46 s quinto, −61 s octavo, −593 s último. Total bombeado Fractal 185,035 m³ vs emulador 185,753 m³ (−0,719 m³); 2,538 m³ de flujo interno acumulado entre retornos con bomba apagada, no pérdida de agua. CSV de **cada** arranque/parada/volumen y JSON con niveles al mismo instante. No se declara causa raíz completa ni se valida horizonte. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · niveles horarios D76 | Se repitió el día completo con antirretornos y se persistieron niveles/volúmenes de los tres tanques y presiones verdaderas en 24 marcas; pico de suministro −18,77976 pp / −0,730157 m³ en hora 24 (emulador 3,294604 vs Fractal 2,564447 m³). Cero desacuerdos sobre presión ≥15 mca **en las marcas horarias**, pero Fractal mantiene la primera consigna 30 s más: no es comparación de comandos idénticos al final de cada franja. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · D77 antirretorno PRS | Se añadió válvula común a la salida de estación antes de nivel 1, Kv=400 m³/h supuesto; a 11,53 m³/h su pérdida calculada es ≈0,0085 mca. Fractal y emulador incluyen el sentido directo y bloqueo de retorno. Punto estacionario: presión crítica rama AUTO ~15,45171→15,45064 mca; manual ~15,46150→15,45427. Entre pisos solo se acumularían pérdidas si realmente hay otras válvulas, aún no confirmadas. D76 es informe histórico; validación dinámica D77 pendiente. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · D78 válvulas check entre pisos | Autor confirmó un check después de cada válvula entre pisos. Equipos, hidráulica independiente Fractal y geometría 3D ampliados; Kv supuesto a partir de ficha Spirax Sarco DCV6 (DN50 39, DN80 86, DN100 158 m³/h). En primer estado se calculan ~3,47 mca total aguas arriba del piso 4 y la PRS AUTO compensa hasta ~21,75 mca. La corrida inicial de 1899,6 s se retiró de comparación: t=3630…86430 emparejaba perfiles distintos por 30 s. Replay corregido, 2032,79 s: hora 24 suministro Fractal 87,963 % vs PLC 53,93702 % (+34,02598 pp/+1,322930 m³), retornos difieren −29,72591/−28,69322 pp; 46/46 arranques y 46/45 paradas. Cero desacuerdos ≥15 mca en 24 fronteras horarias solamente. No validar niveles; optimización apagada. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · D76 válvulas antirretorno | El autor confirmó válvulas individuales en cada tanque, antes de colectores de succión. Se añadió antirretorno opcional a `vessel` y se activó en los tres vasos del acueducto; Fractal incorpora pérdida directa propia (Kv=400 m³/h supuesto). Primer ciclo: trasvase cruzado apagado 0 m³ frente a 0,029006 m³ antes; diferencia individual al arranque <0,071 pp frente a ~1,3 pp. En 24 h, misma política y marcas alineadas: 46 ciclos por motor, trasvase cruzado 0 frente a 2,538 m³ antes, **pero el desfase del paro final creció de 593 a 612 s** y volumen retornado acumulado difiere −0,738 m³. No hay paridad dinámica; optimización apagada. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · primer ciclo de retorno | A pedido del autor se compararon primer arranque/parada por segundo simulado y volumen transferido desde el mismo PLC: +1,277 s al arrancar y −2,048 s al parar; 0,007104 m³ menos transferidos en Fractal al tiempo de parada. Se identificaron 0,029006 m³ de igualación entre retornos por la succión común del emulador con bomba apagada, ausentes de Fractal: explica ≈1,3 pp de reparto inicial, **no aún** el máximo diario de 19,276 pp. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · D75 recirculación | A pedido del autor, se calculó inventario cerrado (4,5264 m³ en tanques), se declaró el supuesto de tuberías cebadas sin inventario dinámico y se cambió la solicitud de retorno a suministro ≤30 % **o cualquiera** de los retornos ≥90 %, con interlocks de tanque lleno y falta de agua. PLC/Fractal comparten parámetros pero no solver. Pruebas de disparadores y conservación; corrida continua de 24 h bajo nueva política con máximo 19,276 pp en suministro (hora 15) y sin desacuerdo de presión ≥15 mca; niveles futuros siguen sin validar. [[2026-10-24-balance-recirculacion]] | PLC/Fractal |
| 2026-10-24 | PR #79 · rama `feat/fractal-240x-replay` | El autor eligió D73: reproducir 24 horas **precalculadas** a 15 s/h sin presentarlas como cálculo en vivo. Corrida continua poscorrección completa: 2596,71 s offline, sin desacuerdos sobre presión ≥15 mca; desfase máximo de suministro **34,268 pp en hora 18**, por tanto niveles aún no validados. Reproducción de 24 muestras en **360,004 s reales** (máx. ≈0,007 s de desfase de reloj); ×240 en vivo no se acredita (se midió ≈×21,4 efectivo), y dt=15 s degrada presión hasta 6,8 mca. Evidencia [[../../architecture/validation/pdd-rca-01-continuous-post-cache.json|día poscorrección]] y [[../../architecture/validation/pdd-rca-01-replay-240x.json|marcas ×240]]. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal |
| 2026-10-24 | PR #78 · causa del desfase de niveles | A petición del autor se contrastó 24 h **continuas**, no 24 puntos estabilizados: hasta 34,47 pp de diferencia en suministro a la hora 18, pero caudal/presión <0,6 % en picos y volumen combinado ≈4,53 m³ conservado. Un banco de cuatro horas **poscorrección** reanclado desde PLC reduce error de suministro en hora 4 de 13,94 a 3,17 pp (retorno 0,688→0,122 m³); curva de bomba del retorno coincide en 25 muestras dentro de 0,054 m³/h. Se halló además un defecto en el gateway: lecturas repetidas al mismo segundo producían sensores diferentes. Se estabilizó el snapshot por tick para PLC/3D; se descartó una integración de tres tanques por escenario por latencia y porque el rango de demanda no cubre la incertidumbre de fase del retorno; evidencia: [[../../architecture/validation/pdd-rca-01-continuous-pre-cache.json|24 h pre-arreglo]] y [[../../architecture/validation/pdd-rca-01-recirculation-pump.json|curva de retorno]] y [[../../architecture/validation/pdd-rca-01-recirculation-reanchored-4h.json|reanclaje poscorrección]]; los niveles se marcan **no validados dinámicamente**, sin tocar el reloj PLC ×240. Pendiente repetir prueba continua poscorrección. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal |
| 2026-10-24 | PR #78 · 24 consignas y criterio de discrepancia | Según D72, no se obliga a Fractal a reproducir exactamente el emulador ni se añade ruido artificial. Se incorporó validador reproducible `tools/hydraulics/validate_fractal_hourly.py`: perfil diurno PDD-RCA-01, 24 consignas con ventana operativa de 120 s; errores medios/picos caudal 0,20/0,65 %, presión crítica 0,15/0,44 %, descarga 0,06/0,15 %, PRS 0,16/0,42 %, sin desacuerdos de umbral ≥15 mca. Informe completo en [[../../architecture/validation/pdd-rca-01-hourly.json]]. No constituye comparación continua de tanques de 24 horas. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal |
| 2026-10-24 | PR #78 · contraste hora real | Perfil 30 % y PRS AUTO: a t=12 s se proyectó una hora y se corrió 3600 pasos del emulador. Fractal 4,259 m³/h nominal frente a promedio emulador ≈4,263 m³/h. Se añadió rampa de variador independiente en Fractal: recirculación mejoró de 4,217 a 4,260 m³ (emulador 4,295); niveles finales 69,83/40,84/39,62 % vs 70,7/39,7/39,7 %. La diferencia residual de fase de histéresis obliga a mantener el forecast **no validado dinámicamente** y la optimización apagada. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal |
| 2026-10-24 | PR #78 · continuación | E2E de API con sesión PLC estabilizada: lee perfil/tags del gateway, genera y publica 24 frames base + 24 alternativos; comprueba horas, caudales, enlaces, ocho fugas, persistencia y que no se cambien consignas ni tiempo operativo. Bloqueo explícito del arranque frío (bombas paradas) y endpoint offline incapaz de publicar tags falsificados. Smoke real entre dos procesos FastAPI: estudio de 24 h, frame 23 persistido. 39 pruebas específicas, Ruff y typecheck pasan. El contraste transitorio completo de 24 h y la prueba browser de 3D siguen pendientes; no se proclama paridad dinámica. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal/3D |
| 2026-10-24 | PR #78 · 582e7ef | Futuro simulado antes de optimización · Por pedido del autor, prioridad a estudios base/alternativos de 24 horas con estado y perfil activo leídos del gateway PLC por Fractal, nunca de la copia del navegador. La HMI muestra solo esos dos tipos y conserva los frames NO APLICADOS; las rutas de optimización quedan deshabilitadas por defecto. Se distingue despliegue estático de Gallery del despliegue pendiente de las APIs. D71. [[2026-10-24-prioridad-futuro-plc]] | PLC/Fractal/3D |
| 2026-10-24 | Paridad física Fractal: bombas, PRS y recirculación | Se examinó el montaje del emulador (curvas H=s²H0−rQ², antirretornos, PRS con PID, vasos como cabezas fijas y balance de masa). Fractal calcula por separado equilibrio de bombeo/PRS, presión efectiva condicionada a entrada disponible, rama AUTO asentada, caudales de dos tanques de retorno, bomba 1+1 e integración de nivel con histéresis; publica velocidad, potencia, descarga y tags futuros. Un estudio optimizado convierte su mando de PRS a rama manual, en lugar de dejar AUTO anulando la consigna. Pruebas del punto estacionario de bomba/PRS y recirculación y conservación de agua; 33 pruebas específicas, Ruff, typecheck/build, validador y diff-check pasan; estudio optimizado de 24 h con tags nominales terminó en ≈18 s y las 24 franjas resultaron factibles en ese caso. Se mantienen pendientes validación integral de 24 h y transitorios PID/rampa/fallas. [[2026-10-24-solver-fractal-y-estudios]] | Fractal/PLC |
| 2026-10-24 | Estudios Fractal y solver hidráulico nodal independiente | Fractal arma y resuelve continuidad/presión de columna, cabezales, ramales y cruces de cuatro niveles, 64 viviendas y ocho fugas con Darcy-Weisbach, Kv y emisores; consume aperturas del PLC y compara día, noche, válvula restringida y fuga ×5 contra el banco operativo (tolerancia 0,04 mca/m³/h). El horizonte aplica perfiles por vivienda/fuga y evalúa un mismo mando nominal con demanda −10 %, prevista y +10 %. PLC persiste frames futuros, separados de la operación, aprobación y programación. Pendientes: curva/control de bombas y PRS AUTO, tanques dinámicos validados y E2E browser integral. Ruff, 31 pruebas específicas, typecheck/build Gallery, validador y diff-check pasan; la suite general excedió el timeout durante pruebas de planta. [[../../architecture/fractal-studies-and-temporal-views]] | Fractal/PLC/3D |
| 2026-10-23 | Arquitectura temporal Fractal | Se define Fractal como motor de proyección base, escenarios alternativos y optimización; una geometría 3D con líneas temporales separadas de operación PLC y futuro no aplicado, barrera temporal, contratos de forecast publicados por PLC y velocidad por defecto ×240 configurable desde PLC. [[../../architecture/fractal-studies-and-temporal-views]] | arquitectura/Fractal |
| 2026-10-22 | Sesión PLC compartida inicial | Runtime compartido, roles WebSocket y clientes PLC/3D enlazados por `session_id`; transición conserva endpoint anterior. [[2026-10-22-perfiles-plc-fractal]] | PLC/3D |
| 2026-10-22 | Plan de sesión PLC compartida y Fractal | Plan versionado para una sesión única, 3D visor, tags por sesión, objetivos y recomendaciones Fractal instantáneas/futuras. [[2026-10-22-perfiles-plc-fractal]] | arquitectura/PLC |
| 2026-10-22 | Escena 3D contra emulador externo | `plant.html` consume API/WebSocket configurable con `?api=` y conserva el origen al enlazar al PLC. [[2026-10-22-perfiles-plc-fractal]] | acueducto/3D |
| 2026-10-22 | Contenedores Node 26 y emulador | Node 26.12.1 alineado en frontend/CI, `Containerfile` Podman para galería y FastAPI, y guía de HTTPS/WSS + CORS. [[2026-10-22-perfiles-plc-fractal]] | despliegue |
| 2026-10-22 | Perfiles PLC y acceso al emulador | Perfiles operativos explícitos para demanda/PRS/restricción; HMI con API configurable y validación JSON; FastAPI con CORS configurable por entorno. [[2026-10-22-perfiles-plc-fractal]] | acueducto/PLC |
| 2026-10-22 | Disponibilidad de emulador PLC | La HMI valida que el backend responda JSON, informa claramente la ausencia del emulador en Pages y permite indicar un host API con `?api=`. [[2026-10-22-perfiles-plc-fractal]] | acueducto/HMI |
| 2026-10-22 | Cámaras 3D y respuesta PLC | Cámaras por zona/nivel con dirección y zoom propios; botón PLC informa conexión/error, bloquea doble inicio y la HMI solo redibuja su pantalla visible. [[2026-10-22-perfiles-plc-fractal]] | acueducto/3D/HMI |
| 2026-10-22 | Escena hidráulica y tendencias por equipo | La escena sitúa suelo/cuadrícula en la cota mínima visual sin cambiar hidráulica, reduce indicadores externos, añade dirección dentro de rejillas y abre tendencias modales de cualquier equipo simulado. [[2026-10-22-perfiles-plc-fractal]] | acueducto/3D |
| 2026-10-22 | Perfiles PLC y frontera Fractal | Perfiles horarios persistentes y ejecutables para el acueducto, tags PLC de solo lectura para OPC UA simulado, documentación de co-simulación y escena con tanques transparentes/flechas de flujo. D69. [[2026-10-22-perfiles-plc-fractal]] | acueducto |
| 2026-10-22 | PLC Master y carga visual | Se integra el PLC Master simulado, se evitan destellos de HTML sin CSS al abrir la escena y se exponen mandos de casas/fugas y telemetría completa de la reguladora. [[2026-10-22-arquitectura-modelos-portables]] | acueducto |
| 2026-10-22 | Arquitectura portable de modelos | `apps/twin-emulator-api` reemplaza el nombre genérico `apps/api`; los seis modelos industriales incluyen manifiesto con dependencias explícitas de equipos, validador y guía de empaquetado futuro. D68. [[2026-10-22-arquitectura-modelos-portables]] | arquitectura |
| 2026-10-22 | Gemelo 3D de ciudad desde OSM | Escena Three.js con vías y edificios OSM, semáforos y vehículos siguiendo trayectorias FCD de SUMO; muestra x3 el volumen base con coloración vial por velocidad media y barra de km/h. Escenario y velocidades son supuestos, no aforos medidos; la red analítica previa de 35 cruces permanece separada. Se incluye `docs/arvantti-industrial-digital-twin.md` aportado por el autor. Typecheck y diff-check pasan; pruebas Python para CI. [[2026-10-22-mapa-ciudad-osm]] | ciudad |
| 2026-10-21 | Gemelo de confecciones v1 | Planta con 3 tipos nuevos de máquinas reutilizables (plana, overlock y recubridora), comportamiento discreto, geometría animada y 15 máquinas/operarias en layout; 2 productos, operaciones, SAM y tarjeta del portal. Tests específicos, suite de geometrías, layout, catálogo y build pasan. La simulación conectada de flujo completo aún queda pendiente. [[2026-10-21-gemelo-confecciones]] | gemelos |
| 2026-10-20 | Ciudad en la página principal | El gemelo de ciudad entra al portal con su tarjeta (plano de la red) y una página propia `/ciudad.html`: indicadores de la línea base, plano, índice por corredor con semáforo, tramos con más minutos de atasco y curva de 24 h. Pedido de Andy | ciudad |
| 2026-10-20 | Gemelo de ciudad, fase 2 | El día completo del centro corre en SUMO: red y semáforos por franja convertidos, 7 tipos de vehículo con variante de afán y motos entre carriles, 60.000 viajes con semilla fija, e indicadores (ruta crítica, índice por corredor, atascos, demora, bloqueos). Línea base: 60.000 viajes completados, 27,6 km/h, 63 s de demora media; no colapsa con los supuestos actuales. D66 | ciudad |
| 2026-10-19 | Personas con modelo 3D real | Las personas de todas las plantas pasan a ser modelos 3D reales (piel, ropa, esqueleto) con animaciones de reposo, caminar y trabajar: operario y operaria con casco y chaleco, y hombre y mujer de ropa común para pasajeros y agentes. Biblioteca con licencia MIT; cada modelo pesa ≈ 1,2 MB, se descarga una vez y lo comparten todas las personas de la escena; la figura orgánica queda de respaldo. D67 | 4 |
| 2026-10-19 | Gemelo de ciudad, fase 1 | Gemelo nuevo de ciudad: plan para debatir (zona, datos públicos, enjambre aparte, Fractal, monitoreo) y fase 1: red aproximada del centro de Medellín con 35 cruces y 20 semáforos con planes por franja, demanda hipotética de 60.000 entradas al día con 7 tipos de vehículo, validador, plano y pruebas (`city-models/centro-medellin-v1/`, `tools/city/`). D65 | ciudad |
| 2026-10-19 | Operarios más humanos | La figura común de las personas (operarios, pasajeros y agentes de todas las plantas) pasa de cajas y cilindros a formas orgánicas: tronco con pecho y cintura, chaleco que sigue el cuerpo, brazos y piernas que se afinan y se unen sin costura en codo y rodilla, manos con dedos y pulgar, cara con mandíbula, nariz, orejas, cejas y boca, botas con puntera. Misma interfaz, así que aplica en todas las escenas. D64 | 4 |
| 2026-10-19 | Sensores y atascos en la fábrica de cajas | Cada banda de la fábrica de cajas es una unidad independiente con fotoceldas por zona; tipo nuevo `inline-station` (cola, puesto y salida con tres fotoceldas, atasco con vigilante de tiempo y pulsador de paro) para las mesas giratorias, las amarradoras y una mesa manual por línea que parte la banda larga en dos; escenarios de atascos de la amarradora, pausa de operarios, paro manual y atascos al azar; la banda ya no pierde unidades cuando la siguiente se llena. D63 | 4 |
| 2026-10-19 | Imágenes en el portal | Cada tarjeta de la página principal lleva una captura de su escena 3D (plásticos, salsas, acueducto, aeropuerto y fábrica de cajas), recortada sin interfaz, en `apps/gallery/public/portal/`. Pedido de Andy | portal |
| 2026-10-19 | Entrada a 45° y PLC de bandas | La inducción del clasificador entra a 45° en la parte recta del lazo, con la punta cortada a inglete sobre el borde de las bandejas (sin el hueco triangular) y rodillo de nariz; las rampas empiezan 4 m después (`chute_lead_m`) y los carruseles se realinearon. Velocidades ajustadas (inducción 0,75 → línea sur 1,0 m/s para abrir hueco; regresos 0,4–0,5). Cada banda tiene señales start/stop: arranca con su fotocelda de entrada, se duerme sin maletas y el operador la habilita o la para. Tablero «⚙ PLC DE BANDAS» con luces, START/STOP y consigna de velocidad por banda. D62 | logística |
| 2026-10-19 | Editor de hojas de ruta | Panel HOJA DE RUTA con la tabla de pasos y, en el 3D, el tiempo unitario y el lote mínimo junto a cada número; editor con clic en el 3D para los equipos, validación en vivo, productos nuevos o duplicados, y descarga en YAML. D61 | datos reales |
| 2026-10-19 | Catálogos de salsas y cajas | Datos reales, fase C: el catálogo admite recetas, formatos y troqueles; salsas con 3 recetas, 3 formatos de sachet y 6 SKU (más 3 graneles); cajas con 3 referencias y su formato o troquel; el motor toma de ahí el formato de cada llenadora y las cajas por lámina, y exige que los lotes carguen lo que dice la receta; escenarios iguales. D60 | datos reales |
| 2026-10-19 | Productos y su ruta en el 3D | Datos reales, fase D: la API entrega el catálogo de cada planta; panel PRODUCTOS en la escena con la ruta resaltada y numerada, arcos con el color del producto, enlace `?product=` y carga de productos nuevos validados contra el plano; tamaño del equipo en el HUD. D59 | datos reales |
| 2026-10-19 | Aeropuerto sin traslapes y con reproducción | Traspasos entre bandas con su equipo: la línea norte gira con una curva motorizada y entra de costado a la línea sur (confluencia); una sola inducción con curva y banda a 30° que entrega a favor del flujo en el borde de las bandejas; lazo de 31,1 × 7,4 m y carruseles realineados con las rampas. Tambores en cada extremo de banda, control por zonas con fotoceldas (acumulan sin choques) y bandas de regreso de nivel 3 y de codificación (esta a una reinducción del lado de retorno). ▶ SIMULAR funciona en el sitio publicado: sin API reproduce una grabación de 15 min de la operación normal (todas las plantas simuladas). D58 (renumerada al traer main: D54 a D57 ya estaban) | logística |
| 2026-10-19 | Desagüe por gravedad del nivel 1 | Los tanques de recirculación del acueducto bajan 1 m, con su bomba (foso en el piso 0); la boquilla de entrada queda a 2,245 m, por debajo de la bajante del nivel 1 (2,5 m), y desagua por gravedad. Pedido de Andy. D55 | acueducto |
| 2026-10-19 | Molienda de mostaza | El plano anota 60 min de molienda en la receta de mostaza (antes 30), acorde con el molino de 1.000 kg/h y con datos de fabricantes. D57 | 5 |
| 2026-10-19 | #56 | Datos reales, fases A y B: esquema común del catálogo y validador (`twin-lib catalog`), catálogo de plásticos con 3 productos (cubiertos, balde 12 L, papelera 20 L con ensamble), 4 moldes, resinas y colores, 3 tamaños de inyectora y montaje actual; el motor toma el molde del catálogo y los 8 escenarios dan lo mismo. D56 | datos reales |
| 2026-10-19 | Línea fría y mostaza de salsas | Motor: emulsificador → molino coloidal → pulmón frío 1 → llenadoras de 250, 500 y 1.000 ml → pesadoras → mesas, y mostaza con llenadora y pesadora dedicadas; cuatro pesadoras y flujo nuevos en el plano; escenarios `cold-nominal` y `mustard-nominal`. D53 | 5 |
| 2026-10-18 | Plan de datos reales | Plan para alimentar los cinco gemelos con datos reales: catálogo común (productos, rutas, moldes o recetas, materia prima, tamaños de equipo), interfaz con ruta en 3D, pedidos y secuenciación en Fractal; aeropuerto con entrada y destino, acueducto con optimización (`docs/datos-reales.md`). D54 | plan |
| 2026-10-18 | Simulación de la fábrica de cajas | La fábrica de cajas simula su transporte: corrugadora, transportadores de pilas, carro de transferencia que reparte entre tres carriles, tres convertidoras, bandas de fajos y paletizador propio y compartido; escenarios nominal, rotura de papel y paro del paletizador compartido | 4 |
| 2026-10-18 | Estiba por producto | Planta de plásticos: la estiba es estándar y las piezas por estiba se calculan por producto (de 30 canecas de 121 L a 72.000 bisagras); la flota recibe las piezas por ruta y la ruta 5 usa estibas armadas. D51 | plásticos |
| 2026-10-18 | Subidas desde el cabezal | Las subidas entre niveles del acueducto salen del tubo principal de cada nivel, después del último ramal, por fuera del bastidor (pedido de Andy). D50 | acueducto |
| 2026-10-18 | Línea caliente de salsas | Motor: segunda línea caliente de 250 ml (marmita 3, pasteurizador 2, pulmón 2, sachetadora, túnel 2, control de peso y mesa de empaque) junto a la de 1.000 ml; dos mesas de 250 ml; escenario `tunnel-250-stop`; dimensionado a 22 t/día con 40 % en caliente. D49 | 5 |
| 2026-10-18 | Tuberías sin cruces | Planta de salsas: los tubos a nivel de rack buscan un nivel y un recorrido que no atraviesen equipos ni cajas de estantería ni se crucen entre sí (suben por encima, o se desplazan); documento del flujo de salsas conectado vs faltante. D41 | 5 |
| 2026-10-18 | Equipaje de aeropuerto | Gemelo nuevo `airport-baggage-v1`: check-in, colectoras, inspección CT con nivel 3, clasificador de bandejas basculantes, 4 carruseles de armado, codificación manual y 2 carruseles de reclamo, conectados en el motor con 5 escenarios; 5 tipos nuevos en la librería y escena 3D con aviones y carros. Rutas con subidas y bajadas: clasificador elevado, colectoras, bandas de alarma y de llegadas con puentes; cada maleta con fricción y choques. D47 | logística |
| 2026-10-18 | Subidas directas del acueducto | Se elimina la columna lateral con lazos: cada nivel sube recto al siguiente con su válvula vertical, en puntos distintos de la cuadrícula; reductor de 4 a 2 pulgadas antes del nivel 1; el travesaño del cabezal ya no cruza el montante de entrada. D46 | acueducto |
| 2026-10-18 | Acueducto sin pisos | Las zonas elevadas del acueducto ya no dibujan losa ni suelo de color; se ven las estructuras y los tubos de todos los pisos (pedido del autor). D45 | acueducto |
| 2026-10-18 | #46 | Cuarto gemelo: fábrica de cajas de cartón corrugado centrada en el transporte de pilas (corrugadora, rodillos, mesas giratorias, carro de transferencia, pulmón, 3 líneas de conversión con tamaños de caja distintos, un paletizador propio y uno compartido, bodega); plano validado y forma 3D propia para sus 20 tipos de equipo, sin simulación todavía. D44 | gemelos |
| 2026-10-18 | Proceso conectado de plásticos | Planta de plásticos: cada inyectora entrega a su buffer de estiba (X = 1.000), una flota de 6 montacargas lleva las estibas a las estanterías de semielaborado y de ahí a las celdas de ensamble, todo simulado en el motor y sin cruces entre montacargas | 4 |
| 2026-10-18 | Secuencia del acueducto | Acueducto: cada tubo empieza y termina en la boquilla o brida real (tanques, bombas, estación, válvulas entre niveles, rejilla, bajantes); panel LÍNEAS con dos líneas en m³; parámetro de cámara `look`. D42 | acueducto |
| 2026-10-18 | Tuberías sin cruces | Planta de salsas: los tubos a nivel de rack buscan un nivel y un recorrido que no atraviesen equipos ni cajas de estantería ni se crucen entre sí (suben por encima, o se desplazan); documento del flujo de salsas conectado vs faltante; revisión de capacidad contra 22 t/día (despacho de 35 a 90 tarimas/día). D41, D43 | 5 |
| 2026-10-18 | Flujo de montacargas y ensamble | Planta de plásticos: almacén de semielaborado separado del de terminado (al norte de la nave, cajas azules), montacargas sin cruzar la banda y con carriles de ida y regreso, línea de ensamble visible (cámara propia) y piezas nuevas en secundarias. D40 | 5 |
| 2026-10-18 | Pantalla de carga | La escena de planta (las tres plantas) muestra una barra de carga con etapas reales (conexión, plano, zonas, equipos, pasarelas, tuberías, luces, render) para que la espera inicial no parezca un error. D39 | 5 |
| 2026-10-18 | Tuberías ancladas | Las tuberías sin ruta terminaban en el aire sobre el centro de la huella del equipo; ahora se anclan a su superficie real (rayo vertical contra la geometría) y llevan brida en cada extremo. Inspección visual de las tres plantas en `/mnt/project-files/inspeccion/`. D38 | 5 |
| 2026-10-18 | Vista móvil | Orbitron solo en títulos (Inter en el resto) y en pantallas de hasta 700 px los paneles de la escena se ven de a uno desde una barra inferior (Menú, Activo, Eventos); el panel del acueducto también usa Inter en cifras y pestañas. D37 | 4 |
| 2026-10-18 | Salsas sin cubos | 29 tipos de equipo de proceso, empaque y servicios de la planta de salsas con forma propia (tanques, bombas, molinos, emulsificador al vacío, CIP, caldera, enfriador…); las llenadoras y la pesadora sin simular usan su forma de la librería | 5 |
| 2026-10-18 | Planta de plásticos | Molde que abre y cierra con ciclo ilustrativo sin API, canastilla con piezas junto a cada inyectora, carros de canastillas (ruta `cart`), montacargas con estibas de cajas y operarios más realistas; acciones de GitHub a Node 24 | 5 |
| 2026-10-18 | Portal de plantas | Al entrar se elige la planta (manufactura discreta, procesos, gemelo de operación); cada una abre solo sus equipos y su escena; acento azul provisional (sin dorado), iluminación suavizada, columna derecha sin superposición | despliegue |
| 2026-10-18 | Plantas en Cloudflare | Deploy a Pages funciona (run #2 en verde); las tres plantas se publican sin la API: el plano de cada planta se exporta a archivo estático al desplegar y la galería enlaza a las tres escenas | despliegue |
| 2026-10-18 | Corrección del despliegue | Primer despliegue falló: `wrangler-action` intentó instalar wrangler con pnpm en la raíz del workspace; se despliega con `pnpm dlx wrangler@4` (sin la acción de wrangler) | despliegue |
| 2026-10-18 | CI/CD Cloudflare | Despliegue continuo de la galería (equipos, escena de planta, panel del acueducto) en Cloudflare Pages con GitHub Actions; guía de token, secretos y subdominio `digitaltwin.arvantti.online`; la API queda fuera | despliegue |
| 2026-10-17 | #32 | Acueducto: panel de gráficos del PLC en la galería (`acueducto.html`): curva del día en 24 ciclos, bombas Grundfos, sensores en tiempo real y gemelo (−5 % de fugas con la consigna hora a hora); datos de `tools/hydraulics/dia_acueducto.py` | acueducto |
| 2026-10-17 | #33 | Acueducto: escena 3D del edificio por pisos, tubos con su trazado y diámetro del plano, caudal y velocidad reales del agua, soportes y cámaras por piso y por nivel | acueducto |
| 2026-10-17 | #31 | Acueducto: la planta corre en el motor con una sola red de agua (dominio hidráulico); edificio por pisos, 13 equipos, 6 escenarios; con la columna en serie la estación queda en 20,94 mca | acueducto |
| 2026-10-17 | #28 | Fase 5: bodega de producto terminado contigua a empaque con paso directo, estanterías, rutas de montacargas, muelles y camiones en la planta de salsas (pedido del autor) | 5 |
| 2026-10-17 | #29 | Control de peso: tolerancia de 4 % en todos los formatos (decisión del autor); dosificador en 1,5 %; rechazo de la presentación de 1.000 ml ≈ 2,5 % | 4 |
| 2026-10-17 | #27 | Acueducto: semáforo de la casa crítica (20, 18 y 15 mca) y búsqueda de la consigna mínima de la estación; criterio en D28 | acueducto |
| 2026-10-17 | #27 | Acueducto: primer banco de la planta completa (bombas, estación, cuatro rejillas por las columnas) en `industrial-models/water-network-scale-v1`; resuelve con 13,5 m³/h y c44 a 23,0 mca, a revisar contra 20 mca | acueducto |
| 2026-10-17 | #26 | Acueducto: fugas de la rejilla en los ramales 2 y 4 con la misma descarga que las casas, en la posición 1, 3 o 5; red cerrada con caminos entre ramales (pedido del autor) | acueducto |
| 2026-10-17 | #25 | Acueducto: bombas principales de 13 m³/h para que una sola sostenga la presión (pedido del autor); rejilla con válvulas de bola de unión doble numeradas y canaletas a ras de la salida | acueducto |
| 2026-10-17 | #24 | Acueducto: estación reguladora de presión (`pressure-reducing-station`) y rejilla de un nivel (`distribution-grid`) en la librería, con capturas; termina la entrega 3 | acueducto |
| 2026-10-17 | #23 | Acueducto: el bombeo principal queda con 2 bombas de trabajo (sin reserva), como pidió el autor; escenario de disparo de bomba rehecho | acueducto |
| 2026-10-17 | #22 | Acueducto: grupo de bombeo en paralelo (`booster-pump-set`), válvula entre niveles (`regulating-valve`) y tanque de agua de 1.000 L (preset de `vessel`) en la librería, con capturas | acueducto |
| 2026-10-17 | #21 | Fase 5: rutas de montacargas y de operarios de la nave de inyección (datos, validador, plano 2D y escena con montacargas y operarios que las recorren) y 4 estanterías de semielaborado | 5 |
| 2026-10-17 | #20 | Fase 3 y 5: celda de ensamble manual con operario (tipo `assembly-cell`) en la planta de inyección; `assembly-01` y `assembly-02` simuladas y escenario `body-stop` | 3 y 5 |
| 2026-10-17 | #19 | Planta de salsas: área de empaque manual (cajas de 4, 8 y 16 sachets) con estiba en tarimas, en librería, motor y escena | 3 y 5 |
| 2026-10-17 | #18 | Fase 5: sala de control del PLC en la planta de salsas, con gabinete, puesto del operador y panel de gráficos configurable | 5 |
| 2026-10-17 | #17 | Fase 3 y 5: línea de peletizado (tipo `pelletizing-line`) y silo 5 de reciclado enlazados al molino; escenario `pelletizer-jam` | 3 y 5 |
| 2026-10-17 | #16 | Fase 3 y 5: cascada de la planta de inyección (resina seca y humedad desde los secadores, agua de moldes desde el chiller, scrap hacia el molino) y escenarios `dryer-stop` y `chiller-trip` | 3 y 5 |
| 2026-10-17 | #15 | Fase 3 y 5: geometría y comportamiento de empaque, secadores, chillers y molino de la planta de inyección, simulados en la escena | 3 y 5 |
| 2026-10-17 | #14 | Acueducto: solucionador hidráulico de redes a presión en el runtime (gradiente global) con pruebas | acueducto |
| 2026-10-17 | #13 | Diseño de la tercera planta: acueducto a escala (documento y predimensionamiento, sin código de producción) | acueducto |
| 2026-10-16 | #12 | Fase 5: la planta de inyección se simula y se ve en la escena (29 inyectoras y banda principal) | 5 |
| 2026-10-16 | #11 | Fase 5: el desvío del pasteurizador regresa a la marmita que descarga (motor, contratos, escena) | 5 |
| 2026-10-16 | #10 | Fase 5: el motor publica el caudal de cada enlace y las tuberías se animan con él | 5 |
| 2026-10-16 | #9 | Fase 5: pasarelas, tuberías animadas y recorrido de cámara | 5 |
| 2026-10-16 | #8 | Fase 5: escena de planta en 3D con simulación en vivo, selección, cámaras y HUD | 5 |
| 2026-10-16 | #7 | Registro para software en Colombia: plan, bitácora, decisiones e histórico de IA (esta carpeta) | transversal |
| 2026-10-16 | #6 | Tolerancia del control de peso en % del nominal | 4 |
| 2026-10-16 | #5 | Motor de planta y línea caliente de 1.000 ml | 4 |
| 2026-10-16 | #4 | Línea de sachets de la planta de salsas | 3 |
| 2026-10-16 | #3 | Corrección del lint que rompía el CI | 3 |
| 2026-10-16 | #2 | Librería de equipos | 2 |
| 2026-10-16 | #1 | Layouts de las plantas | 1 |

## Entradas

### 2026-10-25 · PR #83 · Control AUTO de punto fijo C44 (provisional)
- **Fecha/hora (UTC):** 2026-10-25; hora no recuperada del contexto.
- **Fase del plan:** validar proyección PLC→Fractal antes de cualquier optimización; optimización apagada.
- **Solicitado por:** Andy: «go» para el escenario PRS variable a 18 mca en C44; luego señaló «no veo en la grafica las de emulador» y «ahi no veo las de fractal, es por que no estan calvuladas aun. elnemulador que escenario uso _». Se completó el replay de 24 h y se aclaró el perfil emulador.
- **Qué se hizo:** modo `critical_point` separado del lazo de presión mínima global; señal de control fija `grid-04.p_c44 → prs-01.control_point_pressure_mca`, contrato, tags OPC UA simulado, perfil diario y presentación de HMI/Fractal. La salida de PRS varía para regular el punto; rama manual cerrada. El HTML autocontenido compara ambas series y añade Δ PLC−Fractal ampliada porque las presiones casi coinciden. No se asigna C44 como crítico físico ni se infiere lógica Grundfos.
- **Commits:** cambios locales aún sin commit en `feat/prs-fixed-outlet-scenario`; continuación del PR #83, que estaba abierto en el último estado registrado.
- **Verificación:** Suite completa `uv run pytest -q` (368 pasaron, 1 omitida) antes de los últimos ajustes de pantalla/contrato; después, 22 pruebas dirigidas de API, Fractal y modelo pasaron. Con el código final: Ruff, `twin-lib validate`, validación de planta y modelo Fractal, `pnpm -r typecheck`, `pnpm -r test` (149 geometrías), Gallery build, validación JSON Schema del perfil normalizado y `git diff --check` pasan. Smoke browser del HTML: 4 paneles, 4 series por motor, 96 marcadores PLC y 4 gráficos de diferencia. Fractal proyectó t=30…86400, 24 franjas × 3 demandas; mínimo 17,99807 mca en L4.C44 (hora de perfil 10, demanda ×1,1), C44 empató el mínimo en 72/72 casos a resolución de 0,00001 mca, junto a otras viviendas. Replay PLC virtual t=30…86400, 86.371 muestras (86.370 s integrados): mínima 17,51569 mca en L4.C44 a t=25.201 s, cero muestras <15, salida 21,18489–24,75767 mca y flujo manual máximo 0. Informe conserva las 64 presiones por escenario: [[../../architecture/validation/pdd-prs-critical-point-18-01-validation.json]] y [[../../architecture/validation/pdd-prs-critical-point-18-01-validation-hourly.csv]]; gráfica HTML de emulador/Fractal por piso: [[../../architecture/validation/pdd-prs-critical-point-18-01-pressure-by-floor.html]]. No es replay dinámico completo de 24 h, no certifica presión entre pasos ni valida la instalación real; niveles futuros siguen pendientes.
- **Decisión:** [[decisiones#PRS AUTO por punto fijo L4.C44 a 18 mca]]. C44 es candidato provisional; varias viviendas empatan como mínima.
- **Conversación:** [[2026-10-25-escenario-prs-punto-critico]]; el contexto previo fue compactado y no se reconstruyen mensajes literales que no están disponibles.

### 2026-10-25 · PR #83 · Primer escenario PRS configurable y referencia estacionaria D76–D78
- **Fecha/hora (UTC):** 2026-10-25, continuación del trabajo de horizonte PLC→Fractal.
- **Fase del plan:** validación de proyección antes de optimización; optimización permanece apagada.
- **Solicitado por:** Andy: «continua», siguiendo el siguiente paso documentado: entrada PRS objetivo 70 mca, salida fija configurable 40 mca y comprobar las 64 viviendas contra 15 mca.
- **Qué se hizo:** modo `fixed_outlet` en la rama AUTO, perfil editable por hora, nuevo preset `pdd-prs-fijo-01`, mapeo del objetivo de entrada a consigna de bomba con diferencial actual medido, y reporte Fractal de entrada/salida y mínima de las 64 viviendas. La rama manual se mantiene cerrada. El objetivo de entrada no se presenta como presión garantizada ni como reconstrucción del Grundfos. Se añadió `tools/hydraulics/validate_prs_fixed_outlet.py` para repetir el horizonte PLC/Fractal a 1 s simulado.
- **Commits:** `7dd0208` (implementación) y `414d16a` (registro) en `feat/prs-fixed-outlet-scenario`; [PR #83](https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/83).
- **Verificación:** `uv run pytest -q`: 367 pasaron, 1 omitida; Ruff completo, `twin-lib validate pressure-reducing-station`, `uv run twin-lib plant validate water-network-scale-v1`, `tools/validate_fractal_model.py`, Gallery typecheck/build y prueba `test_engine_matches_the_steady_state_bench` pasan. El CI del PR #82 había fallado esa prueba porque el banco no incluía pérdidas de checks D76–D78; el benchmark ahora modela check de salida del tanque, salida PRS y salidas de las tres válvulas entre niveles. Replay: 86.371 muestras de viviendas a cada segundo simulado t=30…86400, mínima 30,40013 mca en L4.C44/t=41 555 s; cero muestras bajo 15. Entrada medida 68,99574–70,90799 mca, salida 39,88074–39,98105, flujo manual máximo 0. Fractal: 24 franjas; mínima nominal 30,38644 mca y peor entre demandas ×0,9/×1/×1,1 29,33345 mca (L4.C44, hora 11, ×1,1); todas ≥15. JSON/CSV: [[../../architecture/validation/pdd-prs-fijo-01-24h.json]] y [[../../architecture/validation/pdd-prs-fijo-01-24h-hourly.csv]]. Muestreo no certifica presión entre pasos ni física real; niveles de tanque no validados.
- **Decisiones:** [[decisiones#PRS automática: salida fija y objetivo de entrada]]; todavía no se evalúa la consigna variable a 18 mca en C44.
- **Conversación:** nueva nota por agregar al índice histórico.

### 2026-10-25 · Alineación del horizonte PLC→Fractal y repetición D78
- **Fecha/hora (UTC):** 2026-10-25 01:00–06:10.
- **Fase del plan:** validación dinámica PLC/Fractal antes de escenarios de PRS; optimización apagada.
- **Solicitado por:** Andy: «adelante» (continuar el replay alineado previamente acordado); luego pidió «por favor commit push pr de lo que llevamos».
- **Qué se hizo:** `project_24h` usa una primera franja parcial desde el snapshot hasta el siguiente límite horario absoluto PLC (3570 s desde t=30) y luego franjas de 3600 s; se registra estado al final de cada franja para no confundir el perfil horario. El trazador ahora compara los mismos límites de tiempo y perfil, y tolera cantidades impares de eventos. Repetición D78 de 24 h guardada en JSON/CSV.
- **Commits:** `a6bbd34` (más los commits D75–D78 trasladados desde la rama anterior); PR #82: https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/82.
- **Verificación:** 27 pruebas `test_studies.py` + modelo hidráulico, Ruff limpio. Replay 2032,79 s; cobertura t=30…86400 (86.370 s simulados), 24 pares de perfil iguales, 46/46 arranques, 46/45 paradas; suministro final PLC 53,93702 % y Fractal 87,963 % (+34,02598 pp), diferencias de retornos −29,72591/−28,69322 pp. No hubo desacuerdos ≥15 mca en las 24 marcas (mínimos 15,45/15,44824); esto no certifica presión continua. Niveles sin validar y optimización apagada. Comparación: [[../../architecture/validation/pdd-rca-01-d78-aligned-interfloor-checks-24h.json]].
- **Decisiones:** primera franja parcial anclada al reloj absoluto PLC; las franjas posteriores conservan una hora. D78 sin alinear queda retirado para comparación. No se implementó todavía el escenario PRS configurable; queda como siguiente tarea.
- **Conversación:** esta sesión quedó compactada; mensajes recuperables: «adelante» y «por favor commit push pr de lo que llevamos». No se reconstruye texto no disponible.

### 2026-10-25 · PR (este) · Esquema del acueducto aplicado a los demás gemelos
- **Fecha/hora (UTC):** 2026-10-25 02:52–03:30
- **Fase del plan:** [[plan-del-proyecto]] arquitectura PLC/Fractal y datos reales (fase F)
- **Solicitado por:** Andy (02:52): «no lo toques pero revisa la manera como estamos definiendo ahí el gemelo digital con fractal y el simulador y el emulador […] y revisa como adaptariamos a los demás como plásticos salsas y otros». Aclaró (02:52) que solo existe el Fractal simulador de escenarios y falta el optimizador.
- **Qué se hizo:** documento `docs/architecture/esquema-gemelo-todos-los-modelos.md` con: las cinco piezas del acueducto, los tres estudios de Fractal y su estado, qué es genérico en el código (`sessions.py`) y qué es solo del acueducto (`plc_tags.py`, `profiles.py`, `plc.yaml`, Fractal hidráulico), una tabla de traducción por gemelo, el lugar de la programación de producción (secuenciador como planificador del PLC/MES y pedido urgente como estudio alternativo), un contrato común propuesto, un orden de PR y cinco decisiones abiertas.
- **Verificación:** solo documentación; referencias revisadas contra `main` (8a05343).
- **Decisiones:** ninguna nueva; las decisiones abiertas quedan en el documento para Andy.
- **Conversación:** [[hilo-arquitectura-para-todos-los-gemelos]]

### 2026-10-25 · PR #80 · Programación de producción a 30 días (fase E, paso E1)
- **Fecha/hora (UTC):** 2026-10-20 17:03 (pedido) a 2026-10-25 00:20 (PR).
- **Fase del plan:** [[plan-del-proyecto]] · Datos reales y pedidos, fase E.
- **Solicitado por:** Andy: «necesito en cada planta productiva, tener una tabla de programacion detallada de produccion … desde hoy hasta los proximos 30 dias, inventate pedidos que usen la capacidad de cada planta (saldas y plasticos)»; luego definió el rango hacia atrás a elección del cliente, 2 turnos en plásticos, tabla en el panel lateral, carga del 85 % con atrasos al azar y pedido urgente desde la tabla.
- **Qué se hizo:** `catalog/demand.yaml` en salsas y plásticos y sección `demand` del esquema; `twin_runtime/planning.py` (generador con semilla por fecha, secuenciador de referencia, pedido urgente con lo ejecutado congelado e impacto); `twin-lib plan`; endpoints `/api/schedules` en el emulador; export estático y despliegue cada lunes; sección PROGRAMACIÓN del panel lateral (`apps/gallery/src/schedule.ts`) con indicadores, tabla, filtros, línea AHORA, selección de equipo y ruta, y escenario de pedido urgente; `docs/programacion.md`.
- **Commits:** rama `claude/project-thread-j8tfgu`, PR #80.
- **Verificación:** 361 pruebas de Python (11 nuevas de planificación y 1 de API), Ruff, typecheck, `twin-lib catalog validate`; capturas con la API local: ![[programacion-salsas-tabla.jpg]] ![[programacion-plasticos-urgente.jpg]]
- **Decisiones:** [[decisiones#D75]].
- **Conversación:** [[hilo-programacion-de-produccion]].
### 2026-10-24 · Ficha publicada Kv y válvulas entre niveles D78
- **Fecha/hora (UTC):** 2026-10-24, continuación D77.
- **Fase del plan:** completar topología hidráulica confirmada e inspección 3D.
- **Solicitado por:** el autor confirmó un antirretorno después de cada válvula entre pisos y pidió buscar referencia internet razonable e incorporarla a modelos y 3D.
- **Qué se hizo:** consultada ficha técnica Spirax Sarco DCV6, tabla Kv DN50=39, DN80=86, DN100=158 m³/h. Kv asumidos según diámetros de las líneas del modelo; sin afirmar que marca/modelo sea el instalado. Válvulas check añadidas al contrato y geometría de cada tipo; modelo de planta, colector emulador y solver Fractal independientes. Se inició contraste completo 24 h D78.
- **Commits:** siguiente commit `feat/fractal-240x-replay`, PR #79.
- **Verificación:** validación de tipos y modelo portable; Ruff, 15 pruebas dirigidas, typecheck y test genérico 149/149. `twin-lib plant validate` OK; escenarios PRS reflejan la pérdida nueva. Presión inicial: ~2,28/0,96/0,23 mca en los tres checks inter-piso. Primera corrida D78 (1899,6 s, t=3630…86430) retirada para comparación por perfiles desplazados 30 s. Corrida alineada [[../../architecture/validation/pdd-rca-01-d78-aligned-interfloor-checks-24h.json]]: 2032,79 s, muestras t=3600…86400; suministro Fractal 87,963 % vs PLC 53,93702 % (+34,02598 pp), retornos difieren −29,72591/−28,69322 pp. 46/46 arranques, 46/45 paradas. Cero desacuerdos ≥15 mca en 24 marcas (mínimas 15,45/15,44824 mca), no certifica presión continua.
- **Decisiones:** D78; DN50 pasos 2\", DN80 retornos 3\", DN100 PRS/suministro 4\" se documentan como selección supuesta por diámetro y referencia Spirax, no identificación real. Niveles continúan sin validar, optimización apagada.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Válvula antirretorno después de la PRS
- **Fecha/hora (UTC):** 2026-10-24, tras confirmar las tres válvulas de tanque.
- **Fase del plan:** topología de red a presión y seguridad de niveles superiores.
- **Solicitado por:** el autor confirmó antirretorno a la salida de PRS antes del piso 1 y preguntó si afecta entre pisos.
- **Qué se hizo:** parámetro opcional de Kv a salida común de la estación, habilitado solo en acueducto con Kv supuesto 400 m³/h. Ambos motores representan la pérdida aguas adelante; el emulador bloquea inversión. Sin añadir equipos entre pisos sin que se confirme su existencia.
- **Commits:** continuación rama `feat/fractal-240x-replay`, PR #79.
- **Verificación:** contrato/escenario de planta válidos; a ~11,53 m³/h se midió pérdida ~0,0085 mca. Banco Fractal sin/con antirretorno: punto crítico manual 15,46150/15,45427 y AUTO asentado 15,45171/15,45064 mca. 21 pruebas dirigidas, Ruff y validaciones de estación/planta; los comandos de validación completa de planta y de pytest completo excedieron el tiempo configurado (250 s y 210 s respectivamente). Repetición continua de 24 h de niveles/presión D77 **pendiente**; tabla D76 no se renombra como nueva.
- **Decisiones:** D77; no se extrapola protección de presión crítica entre muestras.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Niveles por hora después de instalar antirretornos
- **Fecha/hora (UTC):** 2026-10-24, continuación D76.
- **Fase del plan:** niveles de tres tanques y contraste horario de 24 h.
- **Solicitado por:** el autor preguntó cómo quedaron los niveles y si debía repetirse la corrida.
- **Qué se hizo:** se repitió el día completo desde el mismo snapshot PLC de t=30 s y se agregó al diagnóstico cada nivel y volumen verdadero, caudal y presión por hora; reporte JSON ampliado y [[../../architecture/validation/pdd-rca-01-recirculation-cycles-checks-24h-hourly.csv|CSV horario]].
- **Commits:** siguiente commit en `feat/fractal-240x-replay`, PR #79.
- **Verificación:** 24 muestras completas; mayor diferencia suministro −18,77976 pp/−0,730157 m³ en hora 24, emulador 3,294604 m³ vs Fractal 2,564447 m³; 0 desacuerdos con presión ≥15 mca solo en los 24 puntos. Se hizo explícito que a t=3630 (y cada marca siguiente) el PLC lleva 30 s de la consigna **siguiente** mientras Fractal aún usa la anterior; no afirmar validación dinámica ni exactitud entre franjas. Optimización apagada.
- **Decisiones:** D76 no cambia; frontera de primera franja parcial pendiente de modelarse.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Antirretornos en cada tanque
- **Fecha/hora (UTC):** 2026-10-24, tras el diagnóstico D75.
- **Fase del plan:** topología hidráulica y validación dinámica PLC/Fractal.
- **Solicitado por:** el autor confirmó que cada tanque tiene su antirretorno, al precisar si eran individuales antes de la unión de succión.
- **Qué se hizo:** parámetro opcional `outlet_check_valve` en vaso con válvula de fondo conservada, activado en suministro y ambos retornos; el motor resuelve los tres antirretornos individualmente y Fractal suma la pérdida directa independiente. Kv=400 m³/h es supuesto por falta de placa. No se añade igualación Fractal, porque con esta topología no debe producirse.
- **Commits:** siguiente commit de `feat/fractal-240x-replay`, PR #79.
- **Verificación:** `twin-lib validate vessel`, planta agua validada, 74 pruebas API/modelo/equipo y Ruff; regresión: antirretorno de suministro abierto con flujo directo y cierre de paso inverso entre retornos. Primer ciclo: 0 m³ de cruce apagado, diferencia individual <0,071 pp. Corrida alineada de 24 h: 46 ciclos por motor, cruce apagado 0 (antes 2,538 m³), parada final Fractal 612 s antes (antes 593 s), volúmenes de retorno 185,061 vs 185,799 m³ (−0,738 m³). [[../../architecture/validation/pdd-rca-01-recirculation-cycles-checks-24h.csv|CSV D76]] y [[../../architecture/validation/pdd-rca-01-recirculation-cycles-checks-24h.json|JSON D76]]. Se resolvió primer reparto, no deriva diaria; 24 puntos de presión estabilizados sin desacuerdo sobre ≥15 mca, [[../../architecture/validation/pdd-rca-01-hourly-checks.json]], **no** presión dinámica diaria. Optimización apagada.
- **Decisiones:** D76; las curvas y los 46 ciclos D75 son evidencia de topología ya sustituida, no se deben comparar como si fueran del nuevo montaje.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Diagnóstico de cada ciclo durante 24 horas
- **Fecha/hora (UTC):** 2026-10-24 21:27 UTC en adelante.
- **Fase del plan:** validación dinámica PLC/Fractal, sin optimización.
- **Solicitado por:** «SIGUE CADA CICLO Y COMPARA».
- **Qué se hizo:** `tools/hydraulics/trace_recirculation_cycles.py` registra cada transición opcional de Fractal con el mismo tag PLC, cada evento del emulador a dt=1 s, inventario, m³ y caudal de igualación interna; CSV de 46 ciclos con marcas, desfase y agua transferida, JSON con comparación por instante. Callback del horizonte es observacional.
- **Commits:** continuación en la rama `feat/fractal-240x-replay`, PR #79.
- **Verificación:** corrida de 24 h, 46 ciclos en cada motor, desfase de parada −2/−46/−61/−593 s en ciclos 1/5/8/46, total 185,035 vs 185,753 m³ transferidos (−0,719 m³). Flujo interno de retorno 1 a 2 durante paros totaliza 2,538 m³, sin ser pérdida neta. [[../../architecture/validation/pdd-rca-01-recirculation-cycles-24h.csv|CSV]] y [[../../architecture/validation/pdd-rca-01-recirculation-cycles-24h.json|JSON]], interpretación [[../../architecture/recirculation-inventory-and-control]]. Causas (igualación interna, caudal horario fijo y rampas) no aisladas aún por contribución; no se valida futuro.
- **Decisiones:** D75, sin cambio. Optimizador deshabilitado.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Diagnóstico del primer ciclo de retorno
- **Fecha/hora (UTC):** 2026-10-24 21:27 UTC en adelante.
- **Fase del plan:** aislar primer desvío dinámico PLC → Fractal.
- **Solicitado por:** el autor aprobó contrastar primer arranque y parada con niveles, segundos simulados y agua transferida.
- **Qué se hizo:** callback opcional de transiciones del integrador Fractal, sin cambiar física, y `tools/hydraulics/trace_first_recirculation_cycle.py` que coteja ambos desde el mismo tag PLC. En el emulador se registró el caudal bidireccional de las dos salidas hacia la succión común, aun con bomba apagada.
- **Commits:** continuación en la rama `feat/fractal-240x-replay`, PR #79.
- **Verificación:** primer arranque Fractal 1318,277 s / emulador 1317 s; primera parada 1839,952 / 1842 s; al mismo instante de la parada difieren 0,007104 m³ bombeados. Con la bomba apagada el emulador pasa 0,029006 m³ del retorno 1 al 2 antes de arrancar, ~1,286 pp por depósito; Fractal no modela esa igualación. 11 tests de solver Fractal pasaron, Ruff y diff-check. Informe [[../../architecture/validation/pdd-rca-01-first-return-cycle.json]] y análisis [[../../architecture/recirculation-inventory-and-control]]. Los 19,276 pp del día no quedan explicados completamente por el primer ciclo.
- **Decisiones:** D75 sin cambio: niveles no validados, optimización apagada. Pendiente diagnóstico ciclo por ciclo e igualación hidráulica independiente.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Balance cerrado y prioridad del tanque de alimentación
- **Fecha/hora (UTC):** 2026-10-24 20:08 UTC en adelante.
- **Fase del plan:** control del circuito cerrado y validación dinámica de la proyección PLC → Fractal.
- **Solicitado por:** el autor pidió asumir tubos llenos, balancear las capacidades de alimentación y los dos retornos, iniciar recirculación si suministro ≤30 % o si se llena un retorno, comprobar el caudal real y distinguir qué disparo ocurre primero.
- **Qué se hizo:** parámetros compartidos e independientes para control PLC y Fractal; entradas individuales de nivel de cada retorno, demanda por suministro ≤30 %, prevención de alto individual ≥90 %, paro a suministro ≥90 % o retorno medio <20 %. Inventario en tanques conservado y limitación explícita de volumen de tuberías/no cebado; validador con horizonte corto configurable y documento [[../../architecture/recirculation-inventory-and-control]].
- **Commits:** continuación en la rama `feat/fractal-240x-replay`, PR #79.
- **Verificación:** 19 pruebas de política/Fractal/equipo y 14 de API/estudios/PLC pasaron; escenario de planta nominal cumple. Diagnóstico del primer arranque: t=1317 s con inventario 70/40/40 % por suministro 29,942 %, y t=1909 s con 100/40/40 % por retorno 90,045 % (suministro 41,923 %). Comparación continua de 4 h: error de suministro 1,067/1,463/2,050/3,675 pp; corrida continua completa de 24 h: máximo **19,276 pp de suministro en hora 15** (Fractal 73,176 % vs emulador 53,9 %), 2393,5 s de cálculo offline y cero desacuerdos sobre presión crítica ≥15 mca. Informe [[../../architecture/validation/pdd-rca-01-continuous-supply-priority.json]]. **No** se validan niveles: cambió el control en ambos motores respecto al informe anterior; persiste desfase de retornos. Optimización deshabilitada.
- **Decisiones:** D75; supuestos de control explícitos, parada secuencial de válvulas y volumen de tuberías aún no implementados.
- **Conversación:** [[2026-10-24-balance-recirculacion]].

### 2026-10-24 · Escritorio único y administración de escenarios
- **Fecha/hora (UTC):** 2026-10-24.
- **Fase del plan:** PLC/Fractal + gemelo 3D desktop.
- **Solicitado por:** el autor retiró el nocturno plano, pidió tres familias de escenarios (base, diurna, personalizada), gráfica dual de apertura/PRS, poder regresar en el tiempo mientras PLC funciona y administrar personalizados con nombre, edición y borrado sin salir del 3D; mobile después.
- **Qué se hizo:** plantilla personalizable 64 hogares/8 fugas por hora, migración de presets retirados, CRUD protegido y programación diferida; vista previa Fractal de presión desde PLC en play, eje derecho autoescalado o estado pendiente explícito; barra 3D/PLC/histórico con historian de fotogramas SQLite y sesión única.
- **Commits:** `97e08c5`, `c1bd258`, `4d7a77b` (+ registro); PR #79.
- **Verificación:** 41 pruebas API/Fractal, 149 de geometría con `--maxWorkers=1`, Ruff, typecheck, build, smoke browser de CRUD (crear, editar, borrar), cálculo Fractal de presión vía proxy local y recorrido del histórico 3D al presente sin modificar PLC. El comando web paralelo inicial excedió timeout bajo competencia de CPU; la suite de geometría pasó al limitar workers.
- **Decisiones:** D74; el emulador puede correr sin Fractal, pero no se inventa presión futura si faltan servicio/tags. Mobile, seguridad/retención y ×240 efectivo quedan pendientes.
- **Conversación:** [[2026-10-24-escenarios-integrados-3d]].

### 2026-10-24 · Reproducción poscorrección a ×240
- **Fecha/hora (UTC):** 2026-10-24.
- **Fase del plan:** validación del horizonte antes de optimización.
- **Solicitado por:** el autor eligió reproducir el contraste precalculado a 15 segundos reales por hora en vez de atribuir ese rendimiento a la física en vivo.
- **Qué se hizo:** corrida de 24 h poscorrección completa, validador con procedencia explícita y reproductor a reloj monotónico que rechaza reportes pre-cache/incompletos.
- **Commits:** `97e08c5`, `c1bd258`, `4d7a77b` (+ registro); PR #79.
- **Verificación:** informe de 24 h en 2596,71 s de cómputo, reproducción de 24 horas en 360,004 s (jitter máximo ≈0,007 s); presión ≥15 mca sin desacuerdos, suministro con 34,268 pp de error máximo hora 18. Referencias en `docs/architecture/validation/`.
- **Decisiones:** D73 y D72; niveles futuros **no validados**, optimización deshabilitada.
- **Conversación:** [[2026-10-24-prioridad-futuro-plc]].

### 2026-10-22 · Sesión PLC compartida inicial
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** A–C de sesión compartida.
- **Solicitado por:** Andy autorizó implementar la sincronización PLC, emulador y 3D.
- **Qué se hizo:** se añade administrador de sesión con runtime único y difusión de snapshots; API REST/WS con roles; PLC crea e inicia sesión; el 3D recibe `session_id` y se conecta como visor sin control.
- **Commits:** `4db7b19` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** API `18 passed`, ruff API y typecheck de galería.
- **Decisiones:** endpoint histórico de simulación se conserva temporalmente para compatibilidad.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Plan de sesión PLC compartida y Fractal
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** arquitectura PLC, 3D y Fractal.
- **Solicitado por:** Andy pidió dejar el plan completo en Markdown antes de implementar.
- **Qué se hizo:** se documentó el roadmap por fases para sesión hidráulica única, roles PLC/visor/Fractal, historian, objetivos configurables, optimización instantánea y futura, recomendaciones aprobadas por operador, Podman y pruebas de aceptación.
- **Commits:** `4db7b19` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** revisión de coherencia con el contrato de co-simulación existente.
- **Decisiones:** PLC es propietario de mando; 3D es visor; Fractal es lector de tags y asesor sin escritura automática.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Escena 3D contra emulador externo
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** acueducto/escena 3D desplegada.
- **Solicitado por:** Andy reportó que la escena 3D no cargaba con los contenedores locales.
- **Qué se hizo:** se propaga `?api=` a las solicitudes del plano, WebSocket de simulación y enlace a PLC; el frontend estático puede usar un emulador FastAPI separado.
- **Commits:** `4db7b19` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** typecheck/build de galería, imagen Podman y Playwright: 13 activos cargados y simulación WebSocket en vivo.
- **Decisiones:** ninguna nueva.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Contenedores Node 26 y emulador
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** despliegue de frontend y emulador.
- **Solicitado por:** Andy definió Node 26 como versión aprobada y pidió ajustar frontend y backend.
- **Qué se hizo:** se fija Node 26.12.1 para pnpm/CI, se añade el `Containerfile` Podman de build/servicio de galería y el `Containerfile` Python 3.12/FastAPI para el emulador; la guía documenta volumen persistente, CORS y URL WSS.
- **Commits:** `196099d` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** Node `v26.12.1`; build/typecheck de galería; ambas imágenes Podman construyen y el contenedor API responde `GET /api/health`; API `17 passed`; ruff API.
- **Decisiones:** Node se aplica únicamente al frontend/CI; el backend conserva Python 3.12.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Perfiles PLC y acceso al emulador
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** acueducto/PLC y despliegue.
- **Solicitado por:** Andy autorizó separar perfiles operativos de pruebas de falla y corregir la conexión HMI–emulador.
- **Qué se hizo:** se versionan PFL-BASE-01, PFL-NOC-01, PFL-NOC-02 y PFL-RES-01; la HMI los agrupa como perfiles PLC; las respuestas no JSON se detectan antes de parsear y el origen del API se puede indicar mediante `?api=`; FastAPI limita CORS a `TWIN_CORS_ORIGINS`.
- **Commits:** `6baba5e` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** API `17 passed`, typecheck de galería y ruff de API.
- **Decisiones:** fallas transitorias permanecen como pruebas técnicas del modelo, no perfiles rutinarios.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Disponibilidad de emulador PLC
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** acueducto/HMI desplegada.
- **Solicitado por:** Andy reportó el error de sintaxis al abrir la HMI publicada.
- **Qué se hizo:** se detecta una respuesta HTML/no JSON antes de decodificarla y se informa la falta del emulador; se permite configurar el origen FastAPI mediante `?api=https://host-del-emulador`.
- **Commits:** `6baba5e` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** `pnpm --filter @twin/gallery typecheck`.
- **Decisiones:** el despliegue estático no ejecuta FastAPI ni WebSocket; requiere host de emulador separado.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Cámaras 3D y respuesta PLC
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** acueducto/escena 3D y HMI.
- **Solicitado por:** Andy: diferenciar cámaras con zoom real y corregir el inicio de la simulación PLC.
- **Qué se hizo:** el encuadre 3D recibe direcciones independientes para cada piso/zona y nivel; el PLC informa el handshake, errores y conexión, impide doble clic durante la apertura del WebSocket y redibuja solo la pantalla visible para mantener respuesta fluida.
- **Commits:** `d7bf741` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** `pnpm --filter @twin/gallery typecheck`; conexión WebSocket PLC comprobada contra el emulador local.
- **Decisiones:** ninguna nueva.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Escena hidráulica y tendencias por equipo
- **Fecha/hora (UTC):** 2026-10-22.
- **Fase del plan:** acueducto/escena 3D y observabilidad.
- **Solicitado por:** Andy: corregir la percepción de equipos enterrados, reducir flechas, mostrar flujo interno de rejillas y abrir una gráfica al seleccionar un equipo.
- **Qué se hizo:** el suelo y cuadrícula del render siguen la cota más baja del plano sin cambiar cotas hidráulicas; las flechas de tuberías externas son más pequeñas; cada rejilla visualiza flujo de entrada y reparto interno; el HUD registra muestras numéricas y abre una tendencia modal con selector de señal; las cámaras usan encuadres, objetivos, cotas y direcciones diferenciados por zona y nivel.
- **Commits:** `fffa104` (implementación); actualización de registro incluida en el commit siguiente.
- **Verificación:** `pnpm --filter @twin/gallery typecheck`, `pnpm --filter @twin/3d typecheck`, `pnpm -r test` (149 pruebas).
- **Decisiones:** ninguna nueva.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · Perfiles PLC y frontera Fractal
- **Fecha/hora (UTC):** 2026-10-22 23:02.
- **Fase del plan:** acueducto/HMI, perfiles operativos y preparación de co-simulación.
- **Solicitado por:** Andy: perfiles de 24 franjas con alcance C, Fractal que lea exclusivamente del PLC por OPC UA simulado, y visualización hidráulica de tanques/niveles/flechas.
- **Qué se hizo:** se documentó la arquitectura; se agregaron perfiles persistentes SQLite con CRUD, validación, plantilla `PDD-RCA-01` y aplicación por hora simulada (15 s reales/hora, ciclo de 6 min); la HMI crea, carga, guarda, clona la hora siguiente y captura mandos actuales; el WebSocket publica tags planos PLC de solo lectura y el contrato OPC UA simulado; los tanques de agua son translúcidos y su líquido sigue `level`; las tuberías muestran flechas reducidas según velocidad y sentido publicados, y las rejillas muestran dirección interna; el suelo visual sigue el piso más bajo sin cambiar cotas hidráulicas; el HUD 3D abre tendencias por equipo; las gráficas llevan leyendas legibles, tres tarjetas por fila en el día hidráulico y ampliación modal; la recirculación muestra estado AUTO/paro, niveles y umbrales de arranque/parada. Se creó el esqueleto independiente `fractal/hydraulics/models/water-network-scale-v1/`.
- **Commits:** `30cd6fc` (implementación inicial); actualización de registro incluida en el commit siguiente.
- **Verificación:** pruebas API (17), Ruff, typecheck de galería y 3D, y pruebas de geometría (149).
- **Decisiones:** [[decisiones]] D69.
- **Conversación:** [[2026-10-22-perfiles-plc-fractal]].

### 2026-10-22 · PLC Master y carga visual de la escena
- **Fecha/hora (UTC):** 2026-10-22
- **Fase del plan:** acueducto/HMI.
- **Solicitado por:** Andy: corregir el HTML sin estilos durante la carga y hacer visibles los mandos de aperturas y la telemetría de la estación reguladora.
- **Qué se hizo:** se integra el PLC Master en la rama de arquitectura; `plant.html` conserva una pantalla de carga crítica hasta que el CSS del módulo está disponible; la rejilla expone los controles de fugas L1/L2 por nivel además de casas/global/nivel; la reguladora muestra presiones antes/después, caudal total y por rama, y apertura de cada PRV.
- **Verificación:** `pnpm --filter @twin/gallery typecheck`, `pnpm --filter @twin/gallery build`, `uv run pytest apps/twin-emulator-api/tests` (17 passed) y diff-check.
- **Decisiones:** ninguna nueva.
- **Conversación:** [[2026-10-22-arquitectura-modelos-portables]].

### 2026-10-22 · Arquitectura portable de modelos industriales
- **Fecha/hora (UTC):** 2026-10-22
- **Fase del plan:** arquitectura transversal.
- **Solicitado por:** Andy: separar lo general de lo particular y permitir llevar un único modelo industrial a un cliente.
- **Qué se hizo:** se renombra `apps/api` a `apps/twin-emulator-api`; se añade `manifest.yaml` a los seis modelos, con sus dependencias de `equipment-library`; se crea el esquema, `tools/validate_model.py`, guía de arquitectura y las bases `integrations/` y `deployments/`.
- **Verificación:** `uv run python tools/validate_model.py` (6 modelos), `uv run pytest apps/twin-emulator-api/tests` (15 passed), `uv run ruff check apps/twin-emulator-api tools/validate_model.py`, `pnpm --filter @twin/gallery typecheck` y diff-check.
- **Decisiones:** [[decisiones#D68]].
- **Conversación:** [[2026-10-22-arquitectura-modelos-portables]].

### 2026-10-22 · Cartografía vial de OpenStreetMap
- **Fecha/hora (UTC):** 2026-10-22
- **Fase del plan:** [[plan-del-proyecto]] gemelo de ciudad, corrección cartográfica.
- **Solicitado por:** Andy (sesión de código): continuar el trabajo de mapa OSM en rama aparte y usar el extracto que guardó en `city-models/`; pidió que `docs/arvantti-industrial-digital-twin.md`, que él aportó, se incluya en el mismo commit.
- **Qué se hizo:** `tools/city/osm_map.py` lee `city-models/map.osm` (extracto XML con atribución ODbL), recorta vías reales del corredor Ferrocarril–Oriental / San Juan–Juan del Corral, representa clasificación, geometría y nombres, y marca nodos de semáforo presentes en OSM. `network.py` renderiza esa base en `layout.svg`; se actualizó la copia estática de galería, el rótulo alternativo y la tarjeta del portal. El grafo SUMO reducido de 35 cruces y sus indicadores permanecen hipotéticos; no se afirma que SUMO ya use la topología OSM.
- **Verificación:** generado `layout.svg` desde el XML local y sincronizado a `apps/gallery/public/data/ciudad-plano.svg`; no se corrieron pruebas Python localmente por instrucción del autor. CI de GitHub queda a cargo de esa validación.
- **Archivos incluidos en el commit:** extracto OSM aportado por Andy y `docs/arvantti-industrial-digital-twin.md`, sin modificar este último.
- **Conversación:** [[2026-10-22-mapa-ciudad-osm]]

### 2026-10-20 12:10 · Gemelo de ciudad en la página principal
- **Fecha/hora (UTC):** 2026-10-20 11:45 a 12:10
- **Fase del plan:** [[plan-del-proyecto]] gemelo de ciudad (portal)
- **Solicitado por:** Andy (11:45, en el chat del proyecto): «ya agregaste a la home el gemelo de ciudad?».
- **Qué se hizo:** tarjeta «Gemelo de ciudad» en el portal (`apps/gallery/src/portal.ts`, imagen `public/portal/ciudad.jpg` con el plano) que abre `/ciudad.html`, porque la ciudad aún no tiene escena 3D. La página (`ciudad.html`, `src/ciudad.ts`, `src/ciudad.css`) muestra los indicadores de la línea base, el plano, el índice por corredor con su semáforo, los tramos con más minutos de atasco y la curva de 24 h. Lee copias de `layout.svg` y `resultados/linea-base.json` en `public/data/`; una prueba revisa que sigan iguales al modelo.
- **Verificación:** `pnpm typecheck` y `pnpm build` de la galería; capturas en escritorio (tema claro) y en 390 px (tema oscuro) sin desborde horizontal; clic en la tarjeta abre la página; `uv run pytest -q tools/city/tests/test_network.py` (9 pruebas); `uv run ruff check tools/city`. Evidencia: `evidencia/ciudad-pagina-linea-base.png`.
- **Decisiones:** ninguna nueva.
- **Conversación:** [[hilo-gemelo-de-ciudad]]

### 2026-10-20 00:30 · Gemelo de ciudad: día completo en SUMO
- **Fecha/hora (UTC):** 2026-10-19 23:22 a 2026-10-20 00:30
- **Fase del plan:** [[plan-del-proyecto]] gemelo de ciudad, fase 2 (motor de tráfico)
- **Solicitado por:** Andy (23:22) explica qué es JEV; (23:23) elige SUMO en la tarjeta de decisión.
- **Qué se hizo:** `tools/city/sumo_city.py` convierte la red y los 20 semáforos (un programa por franja y un WAUT que los cambia), crea 14 tipos de vehículo (7 tipos, tranquilo y con afán; motos con subcarriles), genera los 60.000 viajes del día con semilla, corre SUMO y calcula los indicadores en `city-models/centro-medellin-v1/resultados/linea-base.json`. SUMO entra como grupo opcional de uv (`city`), que el CI instala. Se corrigió el nombre de la carrera 51 en `network.yaml` (la coma partía el texto). `docs/ciudad.md` sección 6.
- **Verificación:** corrida del día completo (60.000 de 60.000 viajes, 3 bloqueos, unos 4 min); `uv run pytest -q tools/city/tests` (14 pruebas: red de SUMO con 35 cruces y 20 semáforos, ciclos por franja, viajes por hora, mezcla con pico y placa, semilla, corrida de 23 a 24 h sin bloqueos); `uv run ruff check .`.
- **Decisiones:** [[decisiones]] D66
- **Conversación:** [[hilo-gemelo-de-ciudad]]

### 2026-10-19 23:10 · Personas con modelo 3D real en todas las plantas
- **Fecha/hora (UTC):** 2026-10-19 22:39–23:20
- **Fase del plan:** [[plan-del-proyecto]] fase 4 (motor de planta), escenas 3D
- **Solicitado por:** Andy (18:04, hilo de la fábrica de cajas): «Esos muñequitos de personas están muy chistosos. No hay forma de ponerlos más reales». Eligió «Modelo real» en la tarjeta de decisión (22:39).
- **Qué se hizo:** cuatro personas de la biblioteca Microsoft Rocketbox (licencia MIT): operario con chaleco naranja, operaria con chaleco amarillo, hombre y mujer de ropa común. Convertidas de FBX a glTF con tres animaciones cada una (reposo, caminar sin desplazamiento y trabajo en mesa), texturas reducidas a 1024/512 px, malla simplificada a la mitad y compresión meshopt: ≈ 1,2 MB por modelo (4,7 MB los cuatro) en `apps/gallery/public/humans/`, con la licencia al lado. `packages/twin-3d/src/humans.ts` carga cada modelo una vez, lo clona por persona (solo el esqueleto es propio) y anima solo a quien se está dibujando; `parts.operator()` conserva su interfaz y usa la figura orgánica (`operatorFigure`) como respaldo mientras carga o sin navegador. Las capturas esperan a que lleguen los modelos.
- **Verificación:** `pnpm -r typecheck`, `pnpm -r test` (133), compilación de la galería con los modelos; capturas [[personas-modelo-real.jpg]] y [[personas-celda-de-ensamble.jpg]].
- **Decisiones:** [[decisiones]] D67
- **Conversación:** [[hilo-fabrica-de-cajas]]


### 2026-10-19 23:00 · Gemelo de ciudad: plan y red de la zona B
- **Fecha/hora (UTC):** 2026-10-19 12:05–23:00
- **Fase del plan:** [[plan-del-proyecto]] gemelo de ciudad, fase 1 (red y datos)
- **Solicitado por:** Andy (12:05): «Necesito que te inventes un pedazo de ciudad [...] del mapa de Medellín con su semaforización [...] no tiene que ser real»; (16:54) escenario hipotético sin imágenes satelitales; (18:03) monitoreos como los del acueducto; (22:45) «Haz b con la mitad de intersecciónes».
- **Qué se hizo:** plan para debatir en un documento del proyecto (zona y tamaño, datos públicos y APIs, gemelo separado del enjambre, escenarios con Fractal, aspecto realista, escenario hipotético de un día hábil y 15 indicadores con criterio de éxito). En el repositorio: `city-models/centro-medellin-v1/network.yaml` (7 carreras x 5 calles, sentidos, carriles, límites, separadores, 20 semáforos con planes de dos fases por franja), `demand.yaml` (60.000 entradas al día, perfil de 24 h, 7 franjas con velocidad y afán, mezcla de 7 tipos, pico y placa, atractores), `tools/city/network.py` (valida ciclos, franjas, sumas y que desde cada entrada se llegue a cada salida; resume y dibuja `layout.svg`), pruebas en `tools/city/tests/` y `docs/ciudad.md`.
- **Verificación:** `uv run python tools/city/network.py city-models/centro-medellin-v1` (35 cruces, 20 semáforos, 18 entradas y 18 salidas, pico 5.100 veh/h a las 7:00); `uv run pytest` y `uv run ruff check .`; plano [[ciudad-plano-red-zona-b.png]].
- **Decisiones:** [[decisiones]] D65
- **Conversación:** [[hilo-gemelo-de-ciudad]]

### 2026-10-19 16:40 · Operarios con figura orgánica en todas las plantas
- **Fecha/hora (UTC):** 2026-10-19 16:11–16:45
- **Fase del plan:** [[plan-del-proyecto]] fase 4 (motor de planta), escenas 3D
- **Solicitado por:** Andy (16:11, hilo de la fábrica de cajas): «no solamente en este hilo, sino en todos los demás hilos, los humanos deben tener una geometría mucho más cercana a la real, no tan dura».
- **Qué se hizo:** se rehízo `operator()` en `packages/twin-3d/src/parts.ts`, la figura que usan todas las plantas: extremidades de revolución que se afinan, con extremos redondeados y solapadas en rodilla y codo; tronco y cadera por perfil, aplanados de frente a espalda; chaleco que sigue el tronco con sus franjas; manos con cuatro dedos y pulgar (guante o piel); cabeza con mandíbula, orejas, ojos, cejas, nariz y boca; casco con cresta y ala; botas con caña, empeine y puntera. Postura de reposo con los brazos algo separados y el codo flexionado. Se conserva la interfaz (`setPose`, `setWalk`, `OperatorLook`). Los operarios de la mesa manual ya no van de camisa blanca.
- **Verificación:** `pnpm -r typecheck`, `pnpm -r test` (133), `ruff check`; captura [[operarios-figura-organica.jpg]] (con dotación, trabajando, caminando y civil).
- **Decisiones:** [[decisiones]] D64
- **Conversación:** [[hilo-fabrica-de-cajas]]

### 2026-10-19 15:30 · Fábrica de cajas: sensores, estaciones y atascos
- **Fecha/hora (UTC):** 2026-10-19 14:52–15:40
- **Fase del plan:** [[plan-del-proyecto]] fase 4 (motor de planta), gemelo de la fábrica de cajas
- **Solicitado por:** Andy (11:45, chat del proyecto, enviado al hilo por el coordinador): «cada banda transportadora funciona como una unidad independiente… hay procesos manuales en el intermedio con los paquetes que tienen que parar y esperar… identifique dónde convendría poner esos sensores para paradas automáticas y para paradas manuales, y que se vaya simulando como el flujo real».
- **Qué se hizo:** tipo `inline-station` (contrato, comportamiento, geometría con fotoceldas que se ponen rojas, pulsador y baliza, presets `stack-turntable`, `bundle-strapper` y `manual-table`, 6 escenarios con expectativas). En `corrugated-box-plant-v1` se simulan `tt-01`, `tt-02` y `strap-01..03`, se agregan las mesas manuales `man-01..03` y las bandas `bc-0Na`/`bc-0Nb` reemplazan a las bandas de 54 y 62,5 m; control por zonas en todas las bandas; plano y `layout.svg` regenerados. Escenarios nuevos `strapper-jams`, `operator-break`, `manual-stop` y `random-jams`. `belt-conveyor`: la unidad que llega con la entrada ocupada espera en vez de perderse. Documentación: sección «Sensores y paradas» de `docs/box-plant.md`, `docs/plant-engine.md`, `docs/plant-scene.md` y `AGENTS.md`.
- **Verificación:** `twin-lib validate`, `twin-lib plant validate` (las 5 plantas), conservación de unidades en cada enlace de la fábrica de cajas en los 7 escenarios, `pytest` (298), `ruff check`, `pnpm -r typecheck`, `pnpm -r test` (133); capturas `evidencia/cajas-amarradora-fotoceldas.jpg` y `evidencia/cajas-mesa-manual-division.jpg`.
- **Al traer main (16:50):** la ruta de las tres cajas en `catalog/products.yaml` (fase C, PR #61) pasa por las bandas partidas y la mesa manual de cada línea (`bc-0Na`, `man-0N`, `bc-0Nb`).
- **Decisiones:** [[decisiones]] D63
- **Conversación:** [[hilo-fabrica-de-cajas]]
### 2026-10-19 16:12 · Imágenes en las tarjetas del portal
- **Fecha/hora (UTC):** 2026-10-19 16:12–16:45
- **Fase del plan:** [[plan-del-proyecto]] portal de plantas
- **Solicitado por:** Andy (16:12): «en la página principal, donde están las tarjetas […] hay que poner una imagen que represente a cada uno para que se vea más animado, más claro».
- **Qué se hizo:** cada tarjeta de `apps/gallery/src/portal.ts` muestra una captura de la escena 3D de su planta (16:9, con zoom suave al pasar el cursor; la imagen también lleva a la escena). Las capturas se recortaron sin la interfaz y se guardaron en 960 px de ancho en `apps/gallery/public/portal/`.
- **Verificación:** `pnpm -r typecheck`; captura del portal en [[portal-tarjetas-con-imagen]] (`evidencia/portal-tarjetas-con-imagen.jpg`).
- **Conversación:** [[hilo-imagenes-portal]]

### 2026-10-19 11:43 · Aeropuerto: entrada a 45° en la recta y tablero PLC de bandas
- **Fecha/hora (UTC):** 2026-10-19 11:43–15:20
- **Fase del plan:** [[plan-del-proyecto]] gemelos nuevos (logística)
- **Solicitado por:** Carlos Andrés Quiceño (11:43, con captura): «Debe ser buscar una parte recta para entrar, no puede ser entrar en curva… Entrar a 45 grados sería lo ideal… hay un hueco… en forma de triángulo… eso no debe pasar»; (11:43:57) «ajustes las velocidades de las bandas y que crees como una especie de tablero monitor control… Como si fuera un PLC… las bandas tienen que tener señales start-stop y eso lo determina son los flujos de los sensores».
- **Qué se hizo:** `baggage-sorter/geometry.ts`: la banda de inducción gira 45° y su esquina de aguas arriba toca el borde de las bandejas a 1 m del inicio de la recta; la banda se dibuja como polígono con la punta cortada a inglete, paralela al lazo, y rodillo de nariz, así no queda hueco ni entra en la curva. Parámetro nuevo `chute_lead_m` (geometría y comportamiento): las rampas se reparten después de 4 m de recta; carruseles de armado y carros realineados (`plant.yaml`). `belt-conveyor`: selector del operador `run_enable` (comandos `start`/`stop`, eventos `operator_start`/`operator_stop`), salida de marcha `run_signal`, fotocelda de entrada `entry_eye` y parámetro `run_on_s` (10 s sin maletas → la banda se duerme); escenario `operator-stop-and-sleep`. Velocidades en `simulation.yaml`: inducción 0,75 m/s, línea sur 1,0, alarma y regresos de nivel 3 0,4, regreso de codificación 0,5. Escena: tablero «⚙ PLC DE BANDAS» (`apps/gallery/src/belt-plc.ts`, `&plc=1`) con una fila por banda: luces, START/STOP, consigna 0,1–2,0 m/s y lecturas; mandos por WebSocket (necesitan la API; en el sitio publicado solo lectura).
- **Verificación:** prueba en vivo de los mandos (STOP de la inducción la para y bloquea la CT; START + 0,3 m/s la arranca a 0,3; un regreso sin maletas queda dormido); 6 escenarios del aeropuerto; `twin-lib validate`, `twin-lib plant validate`, `pytest`, `pnpm -r test`, `pnpm -r typecheck`, `ruff check`; capturas `evidencia/aeropuerto-induccion-45.jpg` y `evidencia/aeropuerto-plc-bandas.jpg`.
- **Decisiones:** [[decisiones]] D62
- **Conversación:** [[hilo-equipaje-aeropuerto]]

### 2026-10-19 11:41 · Editor de hojas de ruta con tiempos
- **Fecha/hora (UTC):** 2026-10-19 11:41–15:30 (con una pausa por el límite de uso)
- **Fase del plan:** [[plan-del-proyecto]] «Datos reales y pedidos», antes de la fase E
- **Solicitado por:** Carlos Andrés Quiceño: editor de hojas de ruta que muestre los productos, la ruta en tabla y en 3D, y en cada paso el tiempo unitario y el del lote mínimo.
- **Qué se hizo:** `catalog.py` calcula los tiempos de cada etapa (`stage_times`), entrega el producto completo y la lista de herramentales, y traduce los errores del esquema; `batch_qty` y `batch_min` en el esquema; tiempos de corrugadora, pila, fajo y estiba en el catálogo de cajas; `products.ts` con el panel HOJA DE RUTA, etiquetas de tiempo en el 3D, editor (campos, etapas, equipos por clic en el 3D, validación en vivo, guardar en la sesión, YAML, nuevo y duplicar); `plant.ts` pasa los clics al editor; `plant.html` y estilos. Documentado en `docs/plant-scene.md` y `docs/datos-reales.md`.
- **Verificación:** 3 pruebas nuevas en `test_catalog.py`; `ruff check`, `pytest`, `pnpm -r typecheck` y `pnpm -r test`; recorrido con Playwright: editar la papelera (cambiar ciclo, agregar etapa vacía → error «etapa 4: falta al menos un equipo», quitarla → válida) y producto nuevo con un clic en la llenadora del 3D → válido; capturas [[salsas-hoja-de-ruta-tomate-1000.jpg]] y [[plasticos-editor-de-ruta-papelera.jpg]].
- **Decisiones:** [[decisiones#D61]]
- **Conversación:** [[hilo-datos-reales]]

### 2026-10-19 10:40 · Catálogos de salsas y cajas (fase C)
- **Fecha/hora (UTC):** 2026-10-19 10:40–11:20
- **Fase del plan:** [[plan-del-proyecto]] «Datos reales y pedidos», fase C
- **Solicitado por:** Carlos Andrés Quiceño: «d y luego c» (segunda parte).
- **Qué se hizo:** esquema con `layout_types`, `params`, `formula_pct`, `yield_pct`, `size` en el herramental, `color` en el producto y tamaños por `by`/`range` o lista de equipos; `catalog.py` con compatibilidad por clase de herramental, fórmula contra materiales y contra `recipes` del plano, y ficha de herramental para la escena; `plant.py` aplica los `params` del herramental montado y valida el lote contra la receta; catálogos nuevos `sauce-plant-v1/catalog/` y `corrugated-box-plant-v1/catalog/`; la ficha de la escena nombra receta, formato o troquel. Documentado en `docs/datos-reales.md`, `docs/plant-engine.md`, la hoja de ruta y el plan.
- **Verificación:** instantáneas finales de todos los escenarios de salsas y de cajas idénticas byte a byte antes y después; 7 pruebas nuevas en `test_catalog.py`; `twin-lib catalog validate` (3 plantas), `twin-lib plant validate`, `ruff check`, `pytest`, `pnpm -r typecheck` y `pnpm -r test`; capturas de la ruta de la mayonesa 1.000 ml [[salsas-ruta-mayonesa-1000.jpg]] y de la caja pequeña [[cajas-ruta-caja-pequena.jpg]].
- **Decisiones:** [[decisiones#D60]]
- **Conversación:** [[hilo-datos-reales]]

### 2026-10-19 09:58 · Productos y su ruta en el 3D (fase D)
- **Fecha/hora (UTC):** 2026-10-19 09:58–10:30
- **Fase del plan:** [[plan-del-proyecto]] «Datos reales y pedidos», fase D
- **Solicitado por:** Carlos Andrés Quiceño: «d y luego c».
- **Qué se hizo:** `twin_runtime/catalog.py` con `route_graph`, `summary` y `with_product`; la API (`apps/twin-emulator-api`) agrega `catalog` a `GET /api/plants/{id}` y el endpoint `POST /api/plants/{id}/products/check`; escena de planta (`apps/gallery/src/products.ts`, `plant.html`, `plant.ts`, `styles.css`) con panel PRODUCTOS, ruta resaltada y numerada, alternativas en gris, arcos animados con el color del producto, ficha con moldes, materiales y etapas, enlace `?product=` y botón CARGAR PRODUCTO; tamaño del equipo en el HUD. Documentado en `docs/datos-reales.md`, `docs/plant-scene.md`, `docs/roadmap.md` y el plan.
- **Verificación:** 2 pruebas nuevas de la API (14 pasan), `ruff check`, `pytest`, `pnpm -r typecheck` y `pnpm -r test`, `twin-lib catalog validate`; capturas con la papelera 20 L (11 etapas numeradas) [[plasticos-ruta-papelera.jpg]] y con un kit cargado desde YAML [[plasticos-producto-cargado.jpg]]; un balde gris con el molde del balde blanco se rechaza con el mensaje esperado.
- **Decisiones:** [[decisiones#D59]]
- **Conversación:** [[hilo-datos-reales]]
### 2026-10-19 00:05 · Aeropuerto: inducciones sin traslapes y simulación en el sitio publicado
- **Fecha/hora (UTC):** 2026-10-19 00:05–00:40
- **Fase del plan:** [[plan-del-proyecto]] gemelos nuevos (logística) y despliegue
- **Solicitado por:** Carlos Andrés Quiceño (con captura): «corregir esos traslapamientos en aeropuerto» y «faltaría dar play a la simulación de las maletas».
- **Qué se hizo:** las dos bandas de inducción del clasificador corrían sobre las bandejas los últimos ≈ 3 m. Ahora llegan por fuera de cada recta, a 1,3 m del eje de las bandejas, con un empujador que pasa la maleta de costado; el lector de etiquetas se corrió a 2,2 m del inicio de la recta. Para que cada inducción siga en línea con su CT el lazo pasa a 31,1 m de recta por 7,4 m de ancho (85 m de lazo, antes 89 m) y rampas de 5,6 m; los carruseles de armado, los carros y la codificación se realinearon con las rampas. Reproducción sin API: `twin_emulator_api.replay.record_plant` graba 15 min de operación normal (tras 15 min de calentamiento), un cuadro por segundo con solo lo que cambió; `tools/deploy/export_static_plants.py` la escribe en `api/replays/{id}.json` al desplegar y la escena la reproduce con ▶ SIMULAR cuando el WebSocket no responde (reloj «GRABACIÓN», velocidad y pausa funcionan).
- **Verificación:** `twin-lib plant validate` (4 plantas), escenarios del aeropuerto, `pytest` (prueba nueva de la grabación), `ruff`, `pnpm -r typecheck`, `pnpm -r test`; prueba en un servidor estático sin API (como Cloudflare Pages): el WebSocket falla, la escena carga la grabación y el reloj avanza; capturas `evidencia/aeropuerto-inducciones-*.jpg`.
- **Ampliación (09:55):** el autor pide un equipo para cada paso de una banda a otra («ahí se caerían las maletas»). La entrega de costado se reemplaza por una inducción en ángulo de 30° a favor del flujo (tramo recto, curva motorizada y banda en ángulo dibujados por el clasificador); la salida de la CT 1 gira con una curva motorizada (pieza nueva `belt_curve`) y su banda entra de costado a la línea sur por una abertura de la guía (`merge_at_m` nuevo en `belt-conveyor`); en el motor `induct-01` entrega a `induct-02`. Los 6 escenarios del aeropuerto se siguen cumpliendo; capturas `evidencia/aeropuerto-traspasos-*.jpg`.
- **Ampliación (10:37):** el autor pide pasar «el sensor» al otro lado, el «círculo» que falta en la transición entre bandas, sensores que paren o avancen las bandas para que no choquen las maletas y las bandas que devuelven al clasificador las maletas de nivel 3 y de codificación manual. Se hizo: tambor en cada extremo de banda (curvas `belt_curve`, inducción del clasificador y banda de reingreso de las estaciones, que ahora llega al borde de su huella); `zone_control` en `belt-conveyor` (zonas del largo de una maleta con fotocelda: cada zona para si la de adelante está ocupada; fotocelda de descarga dibujada, haz rojo mientras detiene la zona de cabeza; variables `photo_eye` y `zone_stopped`; escenario `queue-zone-control`) activado en todas las bandas de maletas; regreso de nivel 3 norte (curva, 2 bandas, curva y banda que entra de costado a la banda norte) y de nivel 3 sur (curva, 2 bandas que suben a 2,72 m y dos curvas que entran de costado a la inducción, segunda abertura `merge2_at_m`); regreso de codificación por el costado este (curva, banda que sube a 3,5 m y curva) a una reinducción que el clasificador dibuja con `reinduct: true`. En el motor las estaciones ya no entregan directo al clasificador sino a sus bandas. El escenario `slippery-collector` ahora espera 0 choques (las fotoceldas paran a las que llegan) y la isla A se sigue bloqueando. Queda abierta la pregunta de cuál sensor pasar al otro lado. Verificación: 6 escenarios del aeropuerto, `twin-lib validate`, `twin-lib plant validate` (5 plantas), `pytest` (288), `pnpm -r test` (129), `pnpm -r typecheck`, `ruff check`; capturas `evidencia/aeropuerto-retorno*.jpg`, `aeropuerto-reinduccion-codificacion.jpg` y `aeropuerto-fotoceldas-y-tambores.jpg`.
- **Decisiones:** [[decisiones]] D58
- **Conversación:** [[hilo-equipaje-aeropuerto]]

### 2026-10-19 01:09 · Desagüe por gravedad del nivel 1
- **Fecha/hora (UTC):** 2026-10-18 23:53–2026-10-19 01:30
- **Solicitado por:** Andy (23:53, hilo «Desagüe por gravedad del nivel 1»; 01:09: «bajar los tanques 1 metro»). Antes se le propuso una boquilla lateral a 2,2 m, sin obra civil, como recomendación; él eligió bajar.
- **Qué se hizo:** `industrial-models/water-network-scale-v1/plant.yaml`: tanques `tank-recirc-01..02` y bomba `pumpset-recirc-01` con la base a −1,0 m; boquillas de entrada en 2,245 m (las cuatro bajantes); salidas en −0,75 m y succiones en −0,68 m; el retorno de la bomba sale en −0,103 m. Comentario de la sección de recirculación actualizado. Documentación: `docs/water-network-plant.md` (tabla de equipos y de boquillas, y la simplificación ya resuelta) y la evidencia del acueducto.
- **Verificación:** `apps/twin-emulator-api` `pytest` 12 de 12 en verde (incluida la prueba de la bajante, que ahora termina en 2,245 m). Motor: `twin-lib plant validate water-network-scale-v1` en OK y 72 pruebas de runtime en verde. Capturas de la galería local: `docs/registro/evidencia/acueducto-tanques-bajados-1m.png` (vista general) y `docs/registro/evidencia/acueducto-recirculacion-foso-piso-0.png` (piso 0). Desde la zona corregida (−1,0 m), la losa del piso 0 baja al nivel de la base de los tanques: la captura de piso 0 se rehizo y muestra el foso.
- **Decisiones:** [[decisiones]] D55.
- **Conversación:** [[hilo-desague-nivel-1]].

### 2026-10-19 09:57 · Molienda de la mostaza a 60 min
- **Solicitado por:** Andy (03:10: «son datos inventados por nosotros, busca en internet»; 09:57: «si»).
- **Qué se hizo:** `plant.yaml`: `moler_y_transferir` de `rcp-mustard` de 30 a 60 min; comentario de `simulation.yaml` actualizado. La simulación no cambia.
- **Verificación:** `twin-lib plant validate sauce-plant-v1`.
- **Decisiones:** [[decisiones]] D57.
- **Conversación:** [[hilo-linea-fria-y-mostaza-de-salsas]].

### 2026-10-19 03:09 · Catálogo de datos de plásticos (fases A y B)
- **Fecha/hora (UTC):** 2026-10-19 03:09–03:45
- **Fase del plan:** [[plan-del-proyecto]] «Datos reales y pedidos», fases A y B
- **Solicitado por:** Andy eligió en la tarjeta de decisión «A+B plásticos» (03:08).
- **Qué se hizo:** esquema `industrial-models/_schema/catalog.schema.json`; módulo `twin_runtime/catalog.py` con validación cruzada (referencias, molde que cabe por tonelaje y capacidad de inyección, colores, lista de materiales, tamaños, coherencia con el plano) y ruta por producto; comando `twin-lib catalog validate | route`; catálogo `plastic-injection-plant-v1/catalog/` (materiales, moldes, productos con ruta, tamaños, montaje, pedidos vacío); el motor aplica el molde montado y `simulation.yaml` ya no repite esos parámetros; `pallet_sizing.py` toma el volumen por pieza del catálogo; documentación en `docs/datos-reales.md`, `docs/plant-engine.md` y `AGENTS.md`.
- **Verificación:** instantáneas finales de los 8 escenarios de plásticos idénticas byte a byte antes y después; `twin-lib catalog validate`, `twin-lib plant validate`, `ruff check` y `pytest` (8 pruebas nuevas en `test_catalog.py`) en verde.
- **Decisiones:** [[decisiones#D56]]
- **Conversación:** [[hilo-datos-reales]]

### 2026-10-18 23:53 – 2026-10-19 00:35 · Línea fría y mostaza de salsas conectadas
- **Solicitado por:** Andy (2026-10-18 23:53, por el hilo de coordinación): abrir los hilos necesarios; la línea fría y la de mostaza siguen a la caliente (D49) con el reparto 40/45/15 de 22 t/día.
- **Qué se hizo:** `simulation.yaml` y `plant.yaml` de `sauce-plant-v1`: línea fría (`emulsifier-01` → molino coloidal por `via` → `buffer-cold-01` → `filler-sachet-01`, `filler-pouch-02`, `filler-pouch-03` → `checkweigher-03/04/05` → mesas de 250 (la 2), 500 y 1.000 ml) y mostaza (`tank-mustard-01` → molino por `via` → `buffer-mustard-01` → `filler-sachet-03` → `checkweigher-06` → mesa 1 de 250 ml); presets nuevos `2000l-emulsifier`, `1200l-mustard` (marmita sin vapor), `mustard-buffer-2000l`, `1000ml-mayo` y `250ml-mustard`; líneas `cold-250`, `cold-500`, `cold-1000` y `mustard-250`; escenarios `cold-nominal` y `mustard-nominal` con expectativas calculadas a mano. Las mesas dejan de tener `nominal_inflow_upm: 0`. Documentado en `docs/plant-engine.md`.
- **Verificación:** `twin-lib plant validate sauce-plant-v1` (incluye los escenarios calientes sin cambios), `uv run pytest -k "sauce or plant or checkweigher or kettle or vessel or library or preset"` (252 pasan), `ruff check`, `twin-lib validate`; API en vivo por WebSocket con `mustard-nominal` (3 batches, 2.995 kg descargados, ≈ 10.860 sachets); captura de la escena con la simulación conectada: [[salsas-linea-fria-sala-de-llenado.png]].
- **Decisiones:** [[decisiones]] D53.
- **Conversación:** [[hilo-linea-fria-y-mostaza-de-salsas]].

### 2026-10-18 23:53 · Plan de datos reales para todos los gemelos
- **Fecha/hora (UTC):** 2026-10-18 23:53–00:10
- **Fase del plan:** [[plan-del-proyecto]] «Datos reales y pedidos» (nueva)
- **Solicitado por:** Carlos Andrés Quiceño: «lo que hablamos de plásticos de hoja de ruta también aplica para todos los gemelos digitales (el único que tal vez queda diferente es el de aeropuerto donde únicamente es entrada y destino y el de acueducto que se trata de condiciones de optimización de caudales, presiones y ahorros)».
- **Qué se hizo:** plan en `docs/datos-reales.md`: modelo de datos común (materiales, productos con ruta, herramental, tamaños de equipo, pedidos, secuenciación), tabla de qué aplica a cada gemelo, arquitectura del paso a Fractal, orden de fases A a G y primer PR propuesto (esquema común y catálogo piloto de plásticos). Fila nueva en `docs/roadmap.md` y en el plan. Sin código.
- **Verificación:** revisión de los `plant.yaml`, `simulation.yaml`, presets de inyectora y `pallet-sizing.yaml` actuales para anclar el plan.
- **Decisiones:** [[decisiones#D54]] (renumerada al traer main: D53 ya era la línea fría de salsas)
- **Conversación:** [[hilo-datos-reales]]

### 2026-10-18 22:00 · Fábrica de cajas: simulación del transporte
- **Fecha/hora (UTC):** 2026-10-18 17:53–22:30
- **Solicitado por:** continuación de D44 (PR #46 fusionado a las 17:53), con la decisión del autor de las 17:14: «todo es imaginario no nos pongamos trabajo de más… lo que nos consuma menos».
- **Qué se hizo:** tipos `corrugator`, `transfer-car`, `box-converter` y `palletizer` en `equipment-library/` (contrato, comportamiento, geometría, presets, escenarios, ficha); `industrial-models/corrugated-box-plant-v1/simulation.yaml` con 18 equipos simulados y escenarios `nominal`, `paper-break` y `shared-palletizer-stop`; ritmos y orientaciones del `plant.yaml` ajustados a la simulación; botón de librería en el portal; `docs/box-plant.md`, `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** `twin-lib validate` de los cuatro tipos, `pytest` de sus 19 escenarios, `twin-lib plant run` de los tres escenarios de la planta con todas sus expectativas cumplidas, `render_layout.py` sin errores; capturas de la escena en vivo: ![[cajas-sim-transporte-pilas.jpg]] ![[cajas-sim-paletizado.jpg]] ![[cajas-sim-apilador.jpg]]
- **Decisiones:** [[decisiones]] D52 (renumerada al traer main: D45 a D51 ya estaban tomadas por otros hilos).
- **Conversación:** [[hilo-fabrica-de-cajas]].
### 2026-10-18 22:44 · Estiba estándar con piezas por producto
- **Fecha/hora (UTC):** 2026-10-18 22:44–23:30
- **Solicitado por:** Carlos Andrés Quiceño (22:44): «el tamaño de la estiba es estándar, tú debes asignar un tamaño a cada producto y calcular».
- **Qué se hizo:** tabla `pallet-sizing.yaml` (volumen por pieza, supuesto) y `tools/logistics/pallet_sizing.py` que calcula las piezas por estiba de los 28 productos y las escribe en `plant.yaml` y `simulation.yaml`; la flota acepta `route_N_pallet_pieces` (0 = el general, -1 = estibas armadas) y las estanterías usan la estiba de su producto; escenarios `nominal`, `fleet-short` y `pallet-chain` recalculados a mano; dos escenarios nuevos de la flota; prueba de consistencia.
- **Verificación:** `twin-lib validate forklift-fleet` y `twin-lib plant validate` en OK, `pytest`, `ruff` y `pnpm -r typecheck`.
- **Pendiente:** reemplazar los volúmenes supuestos por los de los moldes reales; con estibas de decenas de miles de piezas (cubiertos, bisagras) la primera tarda horas en llenarse.
- **Decisiones:** [[decisiones]] D51.
- **Conversación:** [[hilo-inspeccion-visual]].

### 2026-10-18 22:10 · Subidas entre niveles desde el tubo principal
- **Fecha/hora (UTC):** 2026-10-18 20:13–22:15
- **Fase del plan:** [[plan-del-proyecto]] acueducto
- **Solicitado por:** Andy: las conexiones 1-2, 2-3 y 3-4 deben salir del tubo principal de cada nivel, al final después del último ramal (con captura marcada).
- **Qué se hizo:** `distribution-grid` prolonga el cabezal 0,25 m después del último ramal y lo lleva por fuera del costado este hasta el punto de subida (`riser_in_lz`, `riser_out_lz`); las rutas de `plant.yaml` suben en x = 12,25 con y = 4,4 / 5,25 / 6,2; válvulas verticales a 180°.
- **Verificación:** `twin-lib validate`, `twin-lib plant validate`, `pytest apps/twin-emulator-api`, `ruff check`, `pnpm typecheck`, captura `evidencia/acueducto-subidas-desde-cabezal.png`.
- **Decisiones:** [[decisiones]] D50
- **Conversación:** [[hilo-secuencia-acueducto]]
### 2026-10-18 15:04 · Sistema de equipaje de aeropuerto (gemelo nuevo)
- **Fecha/hora (UTC):** 2026-10-18 15:04–17:40
- **Fase del plan:** [[plan-del-proyecto]] gemelos nuevos (logística)
- **Solicitado por:** Carlos Andrés Quiceño: «quiero que con otro hilo construyas un sistema de bandas transportadoras de maletas de aeropuerto, ese sería otro digital twin».
- **Qué se hizo:** ficha de diseño en la carpeta del proyecto (`aeropuerto/ficha-diseno-bhs.md`); 5 tipos nuevos en la librería con contrato, comportamiento, geometría, presets, escenarios, README y FICHA: `checkin-island`, `baggage-screening` (CT con nivel 2 en pantalla y salida a nivel 3), `baggage-sorter` (bandejas basculantes, 4 rampas de vuelo y rampa manual), `baggage-carousel` (armado o reclamo) y `bag-handling-station` (nivel 3 o codificación); `belt-conveyor` acepta maletas (`item: bag`) y tiene 3 presets de equipaje. Planta `industrial-models/airport-baggage-v1` (plano de 170 × 112 m con 32 equipos, `simulation.yaml` con 22 equipos enlazados y 5 escenarios: `nominal`, `screening-fault`, `makeup-short-staff`, `sorter-trip`, `arrivals-wave`). Escena: piezas `aircraft` y `baggage_cart_train`, tarjeta «Equipaje de aeropuerto» en el portal. Documentación en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** escenarios de cada equipo y de la planta con valores calculados a mano (todos pasan); `twin-lib validate`, `twin-lib plant validate`, `pytest`, `ruff`, `pnpm -r typecheck`; capturas de la galería y de la escena con simulación (`evidencia/aeropuerto-*.jpg`).
- **Ampliación (17:55):** a pedido del autor, las rutas de las maletas suben y bajan: perfil de altura en `belt-conveyor` (preset nuevo `bhs-bridge-20m`), clasificador a 3,5 m con rampas que bajan a los carruseles, colectoras con puente a 4,2 m, bandas de alarma a 2,4 m y de llegadas a 3,6 m.
- **Física (22:46):** a pedido del autor, cada maleta se sigue en la simulación con separación mínima, choques y fricción (resbala en subidas de más de ≈ 24°); la escena dibuja la posición real de cada una; escenarios nuevos de banda (`bridge-steady`, `steep-ramp-slip`, `queue-collisions`) y de planta (`slippery-collector`).
- **Decisiones:** [[decisiones]] D47
- **Conversación:** [[hilo-equipaje-aeropuerto]]

### 2026-10-18 17:50 · Subidas directas entre niveles del acueducto
- **Fecha/hora (UTC):** 2026-10-18 17:21–18:10
- **Fase del plan:** [[plan-del-proyecto]] acueducto
- **Solicitado por:** Carlos Andrés Quiceño: «la tubería se cruza con la estructura» y, después, que la conexión entre niveles sea directa, con válvula, en puntos distintos de la cuadrícula y con un reductor tras la estación.
- **Qué se hizo:** el travesaño del cabezal de la rejilla arranca después del montante (no lo atraviesa); se quitó la columna lateral; subidas rectas de 2" nivel 1→2→3→4 con válvula vertical (`regulating-valve` con `vertical: true`) entre caminos de ramales del nivel de abajo y de arriba; los niveles 2 a 4 sin montante propio (`inlet_riser: false`); reductor dibujado en el tubo de la estación (`reduce_at`, `reduce_to_in`).
- **Verificación:** `twin-lib validate`, `twin-lib plant validate` (escenarios en tolerancia), `pytest apps/twin-emulator-api`, `ruff check`, `pnpm typecheck`, captura `evidencia/acueducto-subidas-directas.png`.
- **Decisiones:** [[decisiones]] D46
- **Conversación:** [[hilo-secuencia-acueducto]]

### 2026-10-18 17:15 · Acueducto sin losas en los pisos elevados
- **Fecha/hora (UTC):** 2026-10-18 17:12–17:30
- **Fase del plan:** [[plan-del-proyecto]] acueducto
- **Solicitado por:** Carlos Andrés Quiceño: «prefiero que quitemos los pisos y mantengamos la estructuras».
- **Qué se hizo:** `buildZones` de `plant.ts` no dibuja losa ni suelo de color en zonas con `elevation`; se conservan contorno, rótulo y estructuras.
- **Verificación:** `pnpm -r typecheck`, captura de la galería (`evidencia/acueducto-sin-pisos.png`).
- **Decisiones:** [[decisiones]] D45
- **Conversación:** [[hilo-secuencia-acueducto]]
### 2026-10-18 15:04 · Fábrica de cajas: plano y escena 3D
- **Fecha/hora (UTC):** 2026-10-18 15:04–17:30
- **Solicitado por:** Carlos Andrés Quiceño (15:04): construir en otro hilo «un sistema de transporte de una fábrica de cajas», como gemelo digital aparte, tomando como inspiración el sitio web de un fabricante de transportadores; (15:07): no mencionar nunca esa empresa. (17:14): «todo es imaginario no nos pongamos trabajo de más», varios tamaños de caja, lo que consuma menos, y una línea con paletizador y otras dos con uno compartido.
- **Qué se hizo:** planta `industrial-models/corrugated-box-plant-v1` (230 × 135 m, 17 zonas, 69 equipos, tres líneas de conversión por tamaño de caja, paletizador 1 para la línea 1 y paletizador 2 compartido por las líneas 2 y 3 con una banda de unión, flujos, pasillos y rutas de montacargas; `layout.svg`); 20 piezas de escena en `apps/gallery/src/box-plant-pieces.ts` (bobinas, portabobinas, single facer, puente, engomadora, doble mesa, cortadoras, apilador, transportadores de pilas, mesas giratorias, carro de transferencia, impresoras-plegadoras-pegadoras, troqueladora rotativa, amarradora, banda de fajos, paletizador, cocina de almidón, ciclón, compactadora); tarjeta en el portal; ficha en `docs/box-plant.md` y ficha de diseño en `/mnt/project-files/fabrica-cajas/ficha-diseno.md`.
- **Verificación:** `render_layout.py` sin errores ni avisos, `pnpm -r typecheck` y `pnpm -r test`, `pytest apps/twin-emulator-api`; capturas de la escena: ![[cajas-general.jpg]] ![[cajas-pilas.jpg]] ![[cajas-corrugadora.jpg]] ![[cajas-paletizado-compartido.jpg]]
- **Pendiente (siguiente PR):** tipos de librería y `simulation.yaml` para conectar el transporte en el motor (corrugadora → transportadores → carro → carriles → máquinas → paletizado), con la regla de reparto del carro entre carriles.
- **Decisiones:** [[decisiones]] D44.
- **Conversación:** [[hilo-fabrica-de-cajas]].

### 2026-10-18 15:06 · Proceso conectado de la planta de plásticos
- **Fecha/hora (UTC):** 2026-10-18 14:19–17:30
- **Solicitado por:** Carlos Andrés Quiceño (14:19–14:30): cada máquina con un buffer que se llena con X piezas y sale en estiba al almacén de semielaborado y de ahí a la línea de ensamble; «es muy importante que los procesos estén conectados entre sí»; primero conectar el proceso y después los datos reales. X = 1.000 (tarjeta, 14:26). Ficha confirmada (15:06) con un añadido: «los montacargas no deben ser infinitos, crea una flota según lo que necesitemos para cada área y evita choques y traspasos».
- **Qué se hizo:** tres tipos nuevos de la librería (`pallet-buffer`, `pallet-store`, `forklift-fleet`) con contrato, comportamiento, geometría, presets, escenarios calculados a mano y ficha; 28 buffers, 4 estanterías de semielaborado simuladas y una flota de 6 montacargas cableados en `simulation.yaml` y `plant.yaml` (inyectora → buffer → flota → estantería → flota → celda de ensamble, cada paso con `ready` hacia atrás); las rutas de abastecimiento de las celdas pasan a cuatro (una por estantería); los montacargas de la escena los mueven los canales del motor y se estacionan en la flota; los dos de producto terminado ceden el paso. Escenarios recalculados (`nominal`, `body-stop`) y nuevos (`fleet-short`, `pallet-chain`).
- **Verificación:** `twin-lib validate` de los 3 tipos y `twin-lib plant validate` en OK, `pytest` (219) y `pnpm -r test`/`typecheck` en verde, `render_layout.py` sin errores; capturas `plasticos-buffer-de-maquina.png` y `plasticos-flota-de-montacargas.png` en `docs/registro/evidencia/`.
- **Pendiente:** el almacén de terminado y los dos montacargas de producto terminado fuera del motor; con X = 1.000 las piezas grandes dan estibas de toneladas (decidir X por producto en la etapa de datos reales); baterías y turnos de los montacargas.
- **Decisiones:** [[decisiones]] D48.
- **Conversación:** [[hilo-inspeccion-visual]].

### 2026-10-18 14:40 · Secuencia hidráulica continua del acueducto
- **Fecha/hora (UTC):** 2026-10-18 14:40–15:50
- **Fase del plan:** [[plan-del-proyecto]] acueducto
- **Solicitado por:** Carlos Andrés Quiceño: «lanza otro hilo para seguir la secuencia de la planta de acueducto, mira que hay cosas sueltas» (con captura de válvulas entre niveles, extremo de la estación reguladora y tubos sobre los tanques).
- **Qué se hizo:** rutas de `water-network-scale-v1/plant.yaml` reescritas con las conexiones reales de cada modelo 3D (tabla en `docs/water-network-plant.md` sección 11); válvulas entre niveles en desvío de la columna (entran por la brida oeste y salen por la este) y 0,2 m más bajas; bajantes con ruta propia hasta la boquilla de cada tanque; recirculación hasta la boquilla del tanque de bombeo; panel LÍNEAS con «Red de distribución» y «Recirculación» (contador `volume_m3` por el puerto de descarga de `booster-pump-set`, `unit` opcional en las líneas); parámetro de URL `look` para capturas. Informe de qué está conectado y qué es ilustrativo: [[flujo-planta-acueducto]].
- **Verificación:** `twin-lib validate` y `twin-lib plant validate` (6 escenarios del acueducto dentro de tolerancia), `pytest` 84 pruebas en verde más una prueba nueva de continuidad de la secuencia, capturas de la galería (`evidencia/acueducto-columna-conectada.png`, `acueducto-secuencia-y-lineas.png`, `acueducto-rejilla-costado-este.png`, `acueducto-tapas-tanques-recirculacion.png`); segunda captura del autor (15:10): patas de la rejilla alineadas con su bastidor y bajantes desde la canaleta real.
- **Decisiones:** [[decisiones]] D42
- **Conversación:** [[hilo-secuencia-acueducto]]

### 2026-10-18 17:10–17:40 · Línea caliente de salsas conectada (22 t/día)
- **Solicitado por:** el autor («si», 17:10) a la propuesta del hilo de tuberías; reparto 40/45/15 aprobado a las 17:11.
- **Qué se hizo:** `plant.yaml` y `simulation.yaml` de `sauce-plant-v1`: `kettle-03`, `pump-hot-02`, `pasteurizer-02`, `holding-tube-02`, `buffer-hot-02`, `filler-sachet-02` (250 ml, 2 pistas, caliente), `cooling-tunnel-02`, `checkweigher-02` y `pack-sauce-250-b`, con la línea `hot-250`; vapor, chiller y flujos del plano actualizados; el túnel 1 queda solo con el sachet de 1.000 ml. Escenario `nominal` con marmita 3 y expectativas de la línea de 250 ml; escenario nuevo `tunnel-250-stop`. Decisión [[decisiones]] D51.
- **Verificación:** `twin-lib plant validate` y `uv run pytest packages/twin-runtime/tests/test_plant.py` (16 pasan, ≈ 6 min), plano 2D regenerado, capturas de la galería local con la simulación corriendo: [[salsas-caliente-marmita-3.png]] y [[salsas-tunel-2-sachet-250.png]].
- **Conversación:** [[hilo-linea-caliente-de-salsas]].

### 2026-10-18 14:36 · Tuberías de salsas sin cruces y flujo del proceso
- **Fecha/hora (UTC):** 2026-10-18 14:36–15:10
- **Fase del plan:** [[plan-del-proyecto]] fase 5
- **Solicitado por:** Carlos Andrés Quiceño: «corregir estos detalles en la planta de salsas, tuberías que se cruzan con las cajas, y en ese hilo dime el proceso que está conectado y qué falta, como con la planta de plásticos».
- **Qué se hizo:** en `apps/gallery/src/plant.ts` los tubos sin `route` ya no usan un nivel fijo por turno: para cada uno se prueban niveles (los de siempre, luego más bajos, luego más altos) y dos órdenes de tramos, y se descarta todo trazado que atraviese la caja de otro equipo (incluidas las estanterías con sus cajas) o quede a menos de un diámetro más 12 cm de otro tubo; si la columna de subida cae bajo otro tubo, se desplaza en horizontal. Los que no encuentran sitio pasan al frente de la cola y los demás se acomodan. Se documentó el flujo en `/mnt/project-files/inspeccion/flujo-planta-salsas.md`.
- **Capacidad (pedido de las 15:23):** el autor pidió revisar qué equipos no darían abasto en litros por día; revisión en `flujo-planta-salsas.md`: el despacho de 35 tarimas/día solo movía ≈ 8 t/día y se ajustó a 90; quedan señalados túnel, marmitas, pasteurizador y mesa de 250 ml para ajustar al conectar.
- **Verificación:** capturas de la galería local (vista general y de cerca de la bodega de empaque, CIP y marmita); la consola no reporta tuberías sin trazado libre en las tres plantas de prueba de salsas; `pnpm -r typecheck`.
- **Decisiones:** [[decisiones]] D41 y D43
- **Evidencia:** `docs/registro/evidencia/salsas-tuberias-sobre-estanteria.png`, `salsas-tuberias-sin-cruces-general.png`
- **Conversación:** [[hilo-tuberias-sin-cruces]]

### 2026-10-18 14:17 · Montacargas con carriles, almacenes separados y línea de ensamble visible
- **Fecha/hora (UTC):** 2026-10-18 14:17–14:50
- **Solicitado por:** Carlos Andrés Quiceño (14:17): los montacargas se traspasan entre sí, deben tener carriles de ida y regreso distintos y no cruzar la banda transportadora; la línea de ensamble no se ve y no se muestran sus operarios. (14:19): cada máquina con un buffer que se llena con X productos, estiba al almacén de semielaborados, de ahí al ensamble; diferenciar semielaborados de terminado. (14:24): los procesos deben estar conectados entre sí.
- **Qué se hizo:** zona `almacen-semielaborado` al norte de la nave con las 4 estanterías (cajas plásticas azules, `stage: semielaborado`; la bodega de terminado usa cartón, `stage: terminado`); rutas de montacargas rehechas por el norte (ya no cruzan la banda, se quita `passes_under`); `routes.ts` dibuja y usa dos carriles por ruta (0,8 m del eje para montacargas, 0,5 m para carros); cámara «LÍNEA DE ENSAMBLE» desde el oeste; formas propias para tampografía, etiquetadora y estación de espumado (eran cubos grises); la grúa puente se acorta para caber en la nave. Descripción del flujo y de lo que falta conectar en el motor: `/mnt/project-files/inspeccion/flujo-planta-plasticos.md`.
- **Verificación:** `render_layout.py` sin errores, `twin-lib plant validate` en OK, `pytest apps/twin-emulator-api` (11), `pnpm -r typecheck` y `pnpm -r test` (82); capturas de la vista general, del almacén y de la línea de ensamble.
- **Pendiente (siguiente PR):** conectar el proceso en el motor: buffer por máquina (X = 1.000 piezas, supuesto), almacén con inventario y viaje del montacargas.
- **Decisiones:** [[decisiones]] D40.
- **Conversación:** [[hilo-inspeccion-visual]].

### 2026-10-18 14:09 · Pantalla de carga con etapas
- **Fecha/hora (UTC):** 2026-10-18 14:09–14:40
- **Solicitado por:** Carlos Andrés Quiceño (14:09): al entrar a cada planta hay una espera de unos 5 segundos y parece un error; pidió una barra de carga que se llene y muestre varias etapas («cargando el modelo digital, procesando conexiones, renderizando»), en los tres modelos.
- **Qué se hizo:** `apps/gallery/src/boot.ts` y una capa `#boot` en `plant.html` con barra y texto de etapa (6 % conexión, 22 % plano, 34 % zonas, 48 % equipos, 66 % pasarelas y rutas, 78 % conexiones y tuberías, 88 % luces y cámaras, 94 % render; 100 % tras 12 cuadros). Cada etapa cede el hilo para pintarse antes del trabajo síncrono. Si falla la API, el mensaje de error se muestra en la barra en rojo. Se oculta en modo captura (`shot=1`).
- **Verificación:** `pnpm -r typecheck`; capturas con la API retrasada 2,5 s de las tres plantas en escritorio y de salsas a 390×844 (`/mnt/project-files/inspeccion/carga/`); la capa se retira sola al terminar.
- **Decisiones:** [[decisiones]] D39.
- **Conversación:** [[hilo-inspeccion-visual]].

### 2026-10-18 13:14 · Inspección visual y tuberías desconectadas
- **Fecha/hora (UTC):** 2026-10-18 13:14–14:10
- **Solicitado por:** Carlos Andrés Quiceño (13:13): «¿quieres hacer una inspección visual en cada uno de los modelos?»; (13:15) «veo líneas desconectadas»; (13:48) «si arregla también voy a tomar unas capturas».
- **Qué se hizo:** 32 capturas (escritorio 1440×900 y móvil 390×844) de las tres plantas, el panel PLC, el portal y la librería; informe de hallazgos. Causa de las líneas sueltas: `plant.ts` llevaba los tubos sin `route` al centro de la tapa nominal de cada equipo. Ahora `attachPoint` lanza un rayo vertical contra la geometría real (centro y puntos desplazados hacia el otro extremo), la bajante nace en la pared lateral del equipo de arriba y cada extremo lleva una brida.
- **Verificación:** `pnpm -r typecheck`; capturas antes y después de llenado, caldera y proceso en caliente de salsas, inyección general y piso 1 del acueducto.
- **Pendiente (no incluido):** panel «LÍNEAS» vacío en el acueducto, pestañas cortadas del panel PLC en móvil, y puertos de conexión por tipo de equipo (arreglo de fondo).
- **Decisiones:** [[decisiones]] D38.
- **Conversación:** [[hilo-inspeccion-visual]].

### 2026-10-18 12:00 · Tipografía solo en títulos y vista móvil
- **Fecha/hora (UTC):** 2026-10-18 12:00–12:40
- **Solicitado por:** Carlos Andrés Quiceño (12:00): «Orbitron solo para títulos ya que se vuelve pesado de leer, Y en Mobile como resolvemos eso?», con captura del celular donde el menú, el HUD y los eventos se superponían.
- **Qué se hizo:** Orbitron queda en marca, título de planta, nombre del activo y titulares; todo lo demás en Inter. Nuevo `mobile-dock.ts`: en pantallas angostas una barra inferior abre un panel a la vez y la ficha del activo se abre sola al elegir un equipo. Barra superior compacta y botones de 40 px.
- **Verificación:** `pnpm -r typecheck`, `pnpm gallery:build`, capturas con Playwright a 390×844 de la escena de salsas (con la barra y con Eventos abierto) y del panel del acueducto.
- **Decisiones:** [[decisiones]] D37.
- **Conversación:** [[hilo-despliegue-cloudflare]].

### 2026-10-18 04:23 · Planta de salsas: de cubos a equipos
- **Solicitado por:** el autor (04:23): en la planta de salsas muchos equipos son cubos 3D; y (04:26) «puedes buscar en internet y ser libre de los detalles».
- **Cambios:** `apps/gallery/src/process-pieces.ts` con 29 piezas de escena dimensionadas con la huella del plano; los tipos sin simular que ya existen en la librería (selladoras, pesadora, túnel, cocedores) usan esa forma con parámetros por defecto. Referencias consultadas: fichas de fabricantes de emulsificadores al vacío (tapa elevable con pistón, homogeneizador y agitador raspador) y de molinos coloidales (tolva cónica, motor de 3–7 HP, rotor y estator).
- **Verificación:** captura de cada pieza y de la planta completa: no queda ningún cubo.

### 2026-10-18 04:11 · Planta de plásticos: molde, canastillas, carros, estibas y operarios
- **Solicitado por:** el autor (04:11): las inyectoras deben abrir y cerrar el molde y sacar la pieza hacia una canastilla al lado; faltan carritos que la lleven; los montacargas deben mover estibas reales con producto; los humanos «están muy feos».
- **Cambios:** ciclo ilustrativo de la inyectora cuando no hay simulación (`plant.ts`); canastilla con piezas en la geometría; ruta `cart` con carros de tres canastillas (validador y plano 2D); estiba europea con cajas, cinta y fleje; operario nuevo con rostro, casco, gafas, rodillas y variedad de tonos; `actions/checkout` y `actions/setup-node` v5 (aviso de Node 20, 04:21).
- **Pendiente:** el aviso de Node 20 de `pnpm/action-setup@v4` queda hasta que haya una versión con Node 24.

### 2026-10-18 04:00 · Portal de selección de planta
- **Solicitado por:** el autor (03:5x–04:00): ver al ingresar qué planta quiere (manufactura discreta, procesos o gemelo digital de operación) y que cada una muestre solo lo suyo; menús superpuestos; iluminación muy fuerte; el dorado no es la identidad de Arvantti; «recuerda lo de los acentos y los colores».
- **Cambios:** `index.html` es el portal; la librería pasó a `equipos.html?plant=ID` y filtra los tipos por los equipos de esa planta; HUD y panel de parámetros apilados en una columna derecha con desplazamiento; luces atenuadas en `stage.ts`; acento `#3fd0ff` provisional.
- **04:10:** el autor envía el manual de marca y los nombres de las tarjetas (plásticos, salsas, acueducto); se aplican paleta, tipografías, esquinas rectas y fondo `#040421` (ver D34).
- **Pendiente:** confirmar la tipografía (Orbit u Orbitron) y el ancho de pantalla donde se superponían los menús.

### 2026-10-18 03:42–03:55 · Las tres plantas en la galería publicada
- **Fecha/hora (UTC):** 2026-10-18 03:42 a 03:55.
- **Solicitado por:** Carlos Andrés Quiceño, «solo veo la galería de equipos pero no veo las 3 plantas» (03:42).
- **Qué se hizo:** la escena de planta pide `/api/plants/{id}`, que en Pages no existe. `tools/deploy/export_static_plants.py` guarda esa misma respuesta en `apps/gallery/public/api/plants/{id}` durante el despliegue (`deploy.yml` instala uv y lo corre antes del build); la carpeta está en `.gitignore`. La barra lateral de la galería enlaza a las tres plantas. La simulación en vivo (WebSocket) sigue necesitando la API.
- **Verificación:** build local; captura de `plant.html?plant=sauce-plant-v1` servida solo con archivos estáticos (sin API) carga el plano completo; `ruff` en verde.
- **Conversación:** [[hilo-despliegue-cloudflare]].

### 2026-10-18 03:08–03:20 · Corrección del despliegue en Cloudflare Pages
- **Fecha/hora (UTC):** 2026-10-18 03:08 a 03:20.
- **Solicitado por:** Carlos Andrés Quiceño, captura del primer despliegue fallido (03:08).
- **Qué se hizo:** el job `pages` de Deploy #1 compiló bien pero falló al instalar wrangler (`ERR_PNPM_ADDING_TO_ROOT`). Se reemplaza la acción de wrangler por `pnpm dlx wrangler@4` en `deploy.yml`, porque el autor usa pnpm.
- **Verificación:** registros del job fallido; el despliegue real se confirma al correr de nuevo.
- **Conversación:** [[hilo-despliegue-cloudflare]].

### 2026-10-18 01:21–01:50 · PR CI/CD Cloudflare · Despliegue de la galería en Cloudflare Pages
- **Fecha/hora (UTC):** 2026-10-18 01:21 a 01:50.
- **Fase del plan:** [[plan-del-proyecto]] despliegue.
- **Solicitado por:** Carlos Andrés Quiceño, publicar las plantas y el panel en la cuenta Arvantti de Cloudflare con un CI/CD completo (22:54 y 23:15 del 2026-10-17); no puede desplegar desde su máquina virtual hasta el 31 de octubre (01:21).
- **Qué se hizo:** workflow `.github/workflows/deploy.yml` (build de la galería y `wrangler pages deploy` en cada push a `main`, o a mano; no falla si faltan los secretos) y guía `docs/despliegue-cloudflare.md` con el Account ID, el token de permisos mínimos (Cloudflare Pages: Editar), los secretos del repositorio y el subdominio. La API de simulación (FastAPI con WebSocket) queda fuera.
- **Commits:** ver el PR.
- **Verificación:** `pnpm install --frozen-lockfile` y `pnpm gallery:build` generan `apps/gallery/dist`. El despliegue real queda pendiente de los secretos.
- **Decisiones:** [[decisiones]] (D33).
- **Conversación:** [[hilo-despliegue-cloudflare]].

### 2026-10-17 15:28–22:55 · PR #32 · Acueducto: panel de gráficos del PLC en la galería
- **Fecha/hora (UTC):** 2026-10-17 15:28 a 18:55; conflictos con `main` resueltos a las 22:55 (pedido del autor en el PR, 22:39).
- **Fase del plan:** [[plan-del-proyecto]] acueducto (monitoreo).
- **Solicitado por:** Carlos Andrés Quiceño, «la curva día a día del panel… de hora a hora» (15:28) y «no solamente que quede aquí en artefacto en Claude, sino en el sistema» (18:02).
- **Qué se hizo:** página `apps/gallery/acueducto.html` con `src/acueducto-panel.ts` (cuatro pantallas: curva del día, bombas Grundfos, sensores en tiempo real y gemelo) y script `tools/hydraulics/dia_acueducto.py`, que corre hora a hora la red del motor (PR #31: columna en serie) con la rama manual fija en 20,94 mca frente a la consigna mínima del gemelo para 15,45 mca, bombas a 72,1 mca en la descarga, y escribe `public/data/acueducto-dia.json`. Resultado: consumo 118,4 m³/día; la casa crítica va de 18,2 mca de madrugada a 16,0 mca en el pico con la consigna fija; el gemelo baja la consigna a 18,15–20,29 mca y evita 1,6 m³/día de fugas (−5,0 %; −7,0 % de madrugada). La lista de válvulas se agrupa por nivel y ramal (pedido del autor, 17:53).
- **Commits:** ver el PR #32.
- **Verificación:** `pnpm -r typecheck`, `uv run ruff check .`, capturas de la galería local en claro y oscuro: ![[acueducto-panel-plc-curva-del-dia.png]] ![[acueducto-panel-plc-gemelo.png]] ![[acueducto-panel-plc-sensores.png]]
- **Decisiones:** [[decisiones]] (D32).
- **Conversación:** [[hilo-panel-plc-acueducto]].

### 2026-10-17 20:53–21:10 · PR #33 · Acueducto: escena 3D del edificio (entrega 5)
- **Fecha/hora (UTC):** 2026-10-17 20:53 a 21:10 (el hilo se pausó de 18:57 a 20:53 por el límite de uso).
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Sí, para eso tenemos que abrir otro hilo entonces» (18:03), para seguir con la planta y la escena.
- **Qué se hizo:** la escena (`apps/gallery/src/plant.ts`) dibuja cada zona a su cota con losas translúcidas, los tubos con la `route` y el `diameter_in` del plano, las bajantes verticales a los tanques del piso 0, soportes para la estación elevada y los niveles 2 a 4 de la rejilla, y cámaras por piso y por nivel; las esferas de los tubos avanzan a la velocidad real del agua. La API entrega `route`, `diameter_in` e `inner_diameter_mm` en cada tubería.
- **Commits:** ver el PR #33.
- **Verificación:** prueba nueva de la API (`test_water_plant_pipes_carry_route_diameter_and_hydraulic_link`), `pytest`, `ruff`, `pnpm -r typecheck`; capturas con Chromium y la simulación en vivo en `docs/registro/evidencia/`: [[acueducto-escena-general.jpg]], [[acueducto-escena-piso0.jpg]], [[acueducto-escena-piso1.jpg]], [[acueducto-escena-nivel4.jpg]].
- **Decisiones:** ninguna nueva; la rama manual quedó en 20,94 mca al fusionarse el PR #31 (la tarjeta de D31 no tuvo respuesta).
- **Conversación:** [[hilo-acueducto-planta-y-escena]].

### 2026-10-17 18:03–18:50 · PR #31 · Acueducto: la planta en el motor (entrega 4)
- **Fecha/hora (UTC):** 2026-10-17 18:03 a 18:50.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 4.
- **Solicitado por:** Carlos Andrés Quiceño, «Sí, para eso tenemos que abrir otro hilo entonces» (18:03), para seguir con la planta y la escena.
- **Qué se hizo:** dominio hidráulico del motor (puertos `hydraulic`, tubos del plano, una sola red resuelta en cada paso y otra vez si un equipo cambia algo); `plant.yaml` del edificio por pisos y `simulation.yaml` con 13 equipos y 6 escenarios (`nominal`, `night-pressure`, `manual-branch`, `pump-trip`, `leak-burst`, `between-valve`); `network.py` lee los mismos tubos y sigue la columna en serie; grupo de bombeo con `min_running` y anticipación de velocidad al disparo; validador del plano con zonas por piso.
- **Resultados:** de día estación 20,94 mca, casa crítica c44 en 15,45 mca, bombas 11,53 m³/h a 72,1 mca; de noche la rama automática ahorra 6,4 % de fugas frente a la manual; disparo de bomba: 68,9 mca un segundo.
- **Commits:** ver el PR #31.
- **Verificación:** `twin-lib validate`, `twin-lib plant validate` (las 3 plantas), `pytest` (194 pasan), `ruff check`, API en vivo (WebSocket con disparo de bomba y cierre de c44: la casa crítica pasa a c24).
- **Decisiones:** [[decisiones]] (D31). Pendiente del autor: salida fija de la rama manual (20,94 recomendada, o 18,09).
- **Conversación:** [[hilo-acueducto-planta-y-escena]].

### 2026-10-17 15:25–16:00 · PR #28 · Bodega de producto terminado y despacho a camiones
- **Fecha/hora (UTC):** 2026-10-17 15:25 a 16:00.
- **Fase del plan:** [[plan-del-proyecto]] fase 5 (pendiente «pasarelas de la nave»).
- **Solicitado por:** Carlos Andrés Quiceño, «Las pasarelas de la nave es como una bodega contigua a la zona donde se empaca… de empaque pasa directo a esa zona y después de ahí sale hacia los camiones» (15:25).
- **Qué se hizo:** `plant.yaml` de la planta de salsas gana el paso directo `door-pt-01`, la estantería `rack-pt-03` acortada para dejar un carril de alistamiento frente a los muelles, los camiones `truck-01` y `truck-02`, tres pasillos de montacargas, dos rutas (`fk-empaque-bodega`, `fk-bodega-despacho`) y el flujo `dock-02 → truck-01`. Nuevo `apps/gallery/src/warehouse.ts` con la estantería con tarimas, el paso directo, el andén con nivelador y el camión (puertas abiertas y tarimas si carga); la estantería también se ve en la planta de inyección. Cámara «Bodega y despacho». La API entrega `params`. Documentado en `docs/plant-scene.md`. Distribución supuesta, ver D30.
- **Commits:** ver el PR #28.
- **Verificación:** `twin-lib validate`, `twin-lib plant validate`, `render_layout.py` (sin errores; un aviso esperado: la puerta está dentro del pasillo de recibo), `twin-lib plant run sauce-plant-v1 --scenario nominal`, `pytest`, `ruff`, `pnpm -r typecheck` y `pnpm -r test`. Capturas con la API y la simulación en vivo: [[fase8-bodega-y-despacho.png]] y [[fase8-camiones-en-muelle.png]].
- **Decisiones:** [[decisiones]] D30.
- **Pendiente:** el panel de gráficos del PLC se mostrará en un artefacto de monitoreo, fuera de la escena (curvas por definir con el autor). El transporte sigue sin simularse en el motor.
- **Conversación:** [[hilo-bodega-de-producto-terminado]].

### 2026-10-17 15:38–16:10 · PR #29 · Control de peso: tolerancia de 4 %
- **Fecha/hora (UTC):** 2026-10-17 15:38 a 16:10.
- **Fase del plan:** [[plan-del-proyecto]] fase 4 (motor de planta), ajuste de presets.
- **Solicitado por:** Carlos Andrés Quiceño, «Los porcentajes de tolerancia están muy altos… le pondría yo 1 % de tolerancia a todos» (15:33). Después eligió «4 % y dosificador 1,5 %» en la tarjeta de decisión (15:38).
- **Qué se hizo:** la tolerancia de `checkweigher` pasa a 4 % a ambos lados en el valor por defecto y en los cuatro presets. Con 1 % y dosificación de 1,5 % el rechazo de 1.000 ml era ≈ 59 %; con 4 % es ≈ 2,5 %. Se recalculan las expectativas de `steady`, `load-cell-drift` y de la planta `sauce-plant-v1`.
- **Commits:** `617c6d5`.
- **Verificación:** `uv run twin-lib validate` (OK), `uv run pytest` (183 pasan), `uv run ruff check .` (OK).
- **Decisiones:** [[decisiones]] (D08).
- **Conversación:** [[hilo-motor-de-planta]].

### 2026-10-17 12:58–15:40 · PR #27 (borrador) · Acueducto: banco hidráulico de la planta (entrega 4, primer paso)
- **Solicitado por:** el autor (12:55 y 12:55:22 UTC): «Qué falta» y luego «Sí», para arrancar la planta.
- **Qué se hizo:** `industrial-models/water-network-scale-v1/network.py` arma en una sola red el tanque, el grupo de bombas, el colector de 4", la estación reguladora, las cuatro columnas de 2" y las cuatro rejillas, con las funciones de `equipment-library` (sin copiar la lógica). Corre en estado estacionario con consumo de día.
- **Resultado (consumo de día, consigna de la estación 26,66 mca):** converge en 6 iteraciones; bombas 13,47 m³/h; consumos 11,97 m³/h y fugas ≈ 1,50 m³/h (el balance cierra); salida de la estación 26,65 mca; c44 del nivel 4 en 22,99 mca.
- **Punto abierto:** c44 debería quedar cerca de 20 mca. Con 23,66 mca de consigna da 20,0 mca (bombas 12,63 m³/h). La consigna de 26,66 mca viene del preset de la estación y quedó con supuesto; la decisión es del autor, no se cambió el preset.
- **Tolerancia:** el solucionador no llega a 1e-6 por un ciclo límite de ≈ 1e-5 m³/h en ramales casi sin caudal del nivel 4; la red usa 5e-4 relativa (ver comentario en `network.py`).
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 12:00–12:20 · PR #26 · Acueducto: fugas al final de los ramales
- **Fecha/hora (UTC):** 2026-10-17 12:00 a 12:20.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, ajustes a la entrega 3.
- **Solicitado por:** Carlos Andrés Quiceño, «explicame como es la ubicacion de las valvulas de perdidas?» (11:57) y «No, eso está mal… tienen que ir igual que van las otras válvulas» (11:58).
- **Qué se hizo:** las fugas l1 y l2 pasaron del cabezal a los ramales 2 y 4, con la misma válvula de bola de descarga y la misma canaleta que las casas. Cada ramal tiene 5 posiciones; la fuga va en la posición que indica `leak_slot_branch2`/`leak_slot_branch4` (1, 3 o 5). Se agregaron caminos entre ramales vecinos en el extremo (posición 5) y en la tercera de los ramales 1–2 y 3–4, formando una rejilla cerrada. Escenario `branch-blockage` recalculado: con los caminos la red rodea la válvula obstruida y la caída es de 0,03 mca.
- **Commits:** ver el PR #26.
- **Verificación:** `uv run pytest equipment-library/distribution-grid` (7 pasan), `twin-lib validate`, `ruff`, `pnpm -r typecheck`.
- **Pendiente:** la posición de la fuga se elige con un parámetro por preset, no con un sorteo en la simulación (la 3D tiene que mostrar la misma posición). Se confirma con el autor si quiere sorteo por semilla.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 11:00–12:00 · PR #25 · Acueducto: una bomba sola sostiene la presión; rejilla numerada
- **Fecha/hora (UTC):** 2026-10-17 11:00 a 12:00.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, ajustes a la entrega 3.
- **Solicitado por:** Carlos Andrés Quiceño: comentario en el PR #23 (05:32) «aunque solo una de ellas trabaje puede entregar 75 mca», la opción «Bombas de 13 m³/h» (11:00) «las canaletas quedan casi a la misma altura de la salida de las válvulas para que el agua no salpique y cada válvula debe ir numerada» (11:03) y «Las válvulas de bola de la red no parecen válvulas reales» (11:42).
- **Qué se hizo:** preset principal `multistage-2x13m3h-80m` (2 bombas de 13 m³/h a 80 m, motor de 5,5 kW). El grupo arranca la segunda bomba cuando el variador pasa el 98 % aunque la presión todavía se sostenga, para que las dos trabajen de día con margen. Escenarios rehechos: de día 2 bombas al 91,7 %; si una se dispara, la otra sube al 99,7 % y sostiene 13 m³/h a 80 mca sin alarma. Rejilla: cada válvula lleva una placa con su número (C11…C44, L1, L2) y las canaletas pasan 5 cm bajo la salida de las válvulas, colgadas del bastidor. Las válvulas de bola se rehicieron como válvulas de PVC de unión doble (colas, tuercas de unión, cuerpo abombado y manija plana que gira 90°), tanto las 18 de descarga como las 4 de entrada a los ramales.
- **Commits:** ver el PR #25.
- **Verificación:** escenarios calculados a mano con la curva H = 100·s² − 0,11834·Q², `uv run twin-lib validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas: [[acueducto-grupo-de-bombeo.jpg]], [[acueducto-rejilla-numerada.jpg]], [[acueducto-rejilla-valvulas-de-bola.jpg]] y [[acueducto-rejilla-canaletas.jpg]].
- **Decisiones:** [[decisiones]] D26.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 05:30–06:15 · PR #24 · Acueducto: estación reguladora y rejilla de un nivel
- **Fecha/hora (UTC):** 2026-10-17 05:30 a 06:15.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 3 de 5 (segunda y última parte).
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (04:57) a seguir con los equipos del acueducto; el hilo anunció dos PR y este es el segundo.
- **Qué se hizo:** dos tipos nuevos. `pressure-reducing-station`: dos ramas (corte, PRV, corte) sobre la red hidráulica; la PRV automática recibe su consigna de un PID sobre la presión del punto crítico y la manual tiene salida fija; cambio de rama sin cortar el suministro, alarmas de presión crítica, potencia disipada y fallas de telemetría, piloto y diafragma; presets `station-4in-auto` y `station-4in-manual`. `distribution-grid`: cabezal y 4 ramales de 2" con válvula de bola, 16 válvulas de consumo y 2 de fuga que publican cada una su caudal y su presión, totales del nivel, alarma de presión mínima, agua no contabilizada y fallas de fuga que revienta y ramal obstruido; presets `level-1` y `level-4-critical`. Cada tipo trae su función `add_*` para el motor de planta.
- **Commits:** ver el PR #24.
- **Verificación:** escenarios con valores calculados a mano (estación: 20 mca en el punto crítico con 13 m³/h y 26,66 mca de salida; de noche 3,90 m³/h con la automática y 25,9 mca en el punto crítico con la manual. Rejilla: 3,15 m³/h de consumo y 0,39 de fugas a 27,4 mca, con el reparto independiente de `tools/hydraulics/predimensionamiento.py`), `uv run twin-lib validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas: [[acueducto-estacion-reguladora.jpg]], [[acueducto-rejilla-nivel-4.jpg]]; simulando por la API: [[acueducto-estacion-reguladora-simulando.jpg]] y [[acueducto-rejilla-simulando.jpg]].
- **Decisiones:** [[decisiones]] D25.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 05:26–05:45 · PR #23 · Acueducto: bombeo principal con 2 bombas
- **Fecha/hora (UTC):** 2026-10-17 05:26 a 05:45.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 3 de 5 (ajuste de la primera parte).
- **Solicitado por:** Carlos Andrés Quiceño, «Por qué 3 bombas?» y «Solo 2 pero ok de 1a6» (05:25–05:26). El PR #22 ya se había fusionado con 3 bombas, así que el cambio va en un PR nuevo.
- **Qué se hizo:** el preset `multistage-3x8m3h-80m` pasa a `multistage-2x8m3h-80m` (2 bombas de trabajo, sin reserva; el parámetro sigue de 1 a 6). El escenario `pump-trip` ahora muestra que, sin reserva, la bomba que queda entrega 11,3 m³/h a 60,4 mca y salta la alarma de baja presión; se agrega `pump-trip-recovery`. Diseño (supuesto S4, sección 6), ficha, README y capturas actualizados.
- **Commits:** ver el PR #23.
- **Verificación:** valores de la falla calculados a mano antes de correr, `uv run pytest equipment-library/booster-pump-set` (7 escenarios), `uv run twin-lib validate`, `uv run ruff check .`, `pnpm -r test`; captura [[acueducto-grupo-de-bombeo.jpg]] y simulación por la API [[acueducto-grupo-de-bombeo-simulando.jpg]].
- **Decisiones:** [[decisiones]] D24, punto 6.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 04:57–05:25 · PR #22 · Acueducto: grupo de bombeo y válvula entre niveles
- **Fecha/hora (UTC):** 2026-10-17 04:57 a 05:25.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 3 de 5 (primera parte).
- **Solicitado por:** Carlos Andrés Quiceño respondió «Si» (04:57) a la propuesta de seguir con los equipos de la librería del acueducto (bombas, estación reguladora y rejillas).
- **Qué se hizo:** dos tipos nuevos en la librería. `booster-pump-set`: bombas iguales en paralelo con antirretorno sobre la red hidráulica del PR #14, variador con PID de presión, entrada y salida de bombas por velocidad y caudal, alternancia de la líder, reserva que entra en el mismo paso si se dispara una bomba, modo por nivel para la recirculación, energía específica; presets `multistage-3x8m3h-80m` (2 + 1 a 80 mca; el PR #23 lo cambió a 2 bombas) y `recirculation-2x15m3h` (1 + 1 por nivel). `regulating-valve`: Kv con característica lineal o de igual porcentaje, volante o actuador con tiempo de recorrido, PID opcional de presión aguas abajo, actuador trabado y fuga por el asiento; presets `between-levels-2in` y `actuated-2in-pressure`. Preset `water-1000l` de `vessel` (S7). Cada tipo trae una función `add_*` para que el motor de planta lo agregue a la red del edificio en la entrega 4. La estación reguladora y la rejilla van en el siguiente PR.
- **Commits:** ver el PR #22.
- **Verificación:** escenarios con valores calculados a mano (por ejemplo, 13 m³/h a 80 mca con 2 bombas al 96,2 %, 4,52 kW; 21 mca aguas abajo con apertura 50,9 %), `uv run twin-lib validate`, `uv run pytest` (168 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas de la galería: [[acueducto-grupo-de-bombeo.jpg]], [[acueducto-bombas-de-recirculacion.jpg]], [[acueducto-valvula-entre-niveles.jpg]], [[acueducto-tanque-1000l.jpg]]; simulando por la API: [[acueducto-grupo-de-bombeo-simulando.jpg]] y [[acueducto-valvula-actuada-simulando.jpg]].
- **Decisiones:** [[decisiones]] D24.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 03:54–04:50 · PR #21 (fusionado en el #20) · Rutas de montacargas y de operarios de la nave de inyección
- **Fecha/hora (UTC):** 2026-10-17 03:54 a 04:50.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «hay que definir como las rutas por donde caminan los operarios y las rutas por donde caminan los montacargas que llevan la materia prima semielaborada a estanterías […], y luego […] hacia las celdas de ensamblaje, y después de las celdas de ensamblaje, producto terminado» (03:54).
- **Qué se hizo:** `plant.yaml` gana 4 estanterías de semielaborado (`rack-sf-01` a `04`, frente al pasillo sur), 7 pasillos nuevos hacia las celdas de ensamble y la bodega de producto terminado y una sección `routes` con 8 rutas de montacargas (recolección de las inyectoras a las estanterías, estanterías a las celdas, celdas a la bodega) y 5 de operarios (3 rondas de inyección, vestier a las celdas, celda 1 a empaque 3). `tools/layout/render_layout.py` valida las rutas (pasillos de montacargas, sin cruzar equipos, extremos junto a sus equipos) y las dibuja en `layout.svg`. La API entrega `aisles` y `routes`; la escena dibuja franjas y cintas y hace circular montacargas (pieza nueva `parts.forklift()`) y operarios que caminan. Documentado en `docs/plant-scene.md`. Es un PR apilado sobre el #20.
- **Commits:** ver el PR #21; entró a `main` con el #20.
- **Verificación:** `uv run python tools/layout/render_layout.py` (sin errores; el validador rechaza rutas movidas a mano a un equipo o fuera de un pasillo), `uv run twin-lib plant validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas: [[fase7-rutas-plano.png]] y [[fase7-rutas-escena.png]].
- **Decisiones:** [[decisiones]] D22.
- **Conversación:** [[hilo-celda-de-ensamble]].

### 2026-10-17 03:54–04:30 · PR #20 · Celda de ensamble manual con operario
- **Fecha/hora (UTC):** 2026-10-17 03:54 a 04:30.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si con el operario» (03:54), a la pregunta de si las celdas de ensamble eran robotizadas o manuales (03:13). Pidió además las rutas de operarios y montacargas de la nave: van en un PR aparte. El empaque de salsas y la sala del PLC los toman otros hilos (PR #18 y #19).
- **Qué se hizo:** tipo nuevo `assembly-cell` en `equipment-library/` (contrato, comportamiento, 2 presets, 7 escenarios con expectativas calculadas a mano, geometría 3D, `FICHA.md`, `README.md`): cubetas de componentes A y B, ciclo fijo del operario (35 s pedal/palanca y 20 s bisagras y tapas, de la ficha 23), bandeja de salida, estados `running`/`starved`/`blocked`/`idle`/`fault`. Pieza nueva `parts.operator()` (operario de pie con chaleco y casco) en `@twin/3d`. `assembly-01` (imm-06 y imm-19 → celda → empaque 3) y `assembly-02` (imm-08 y imm-14, flujos supuestos) simuladas en la planta; `nominal` suma 5 expectativas y hay un escenario nuevo `body-stop`. Parámetro de URL `focus=` en la escena para acercar la cámara.
- **Commits:** ver el PR #20.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest` (137), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test` (64). Expectativas calculadas a mano (35 s por unidad: (3.600 − 30) ÷ 35 = 102 u/h; la imm-19 entrega un cuerpo cada 35 s y limita la celda 1 a ≈ 100 u/h; la imm-06 trabaja 103 ÷ 288 = 36 % del tiempo). Capturas: [[fase7-celda-ensamble-galeria.png]] y [[fase7-celda-ensamble-escena.png]].
- **Decisiones:** [[decisiones]] D21.
- **Conversación:** [[hilo-celda-de-ensamble]].

### 2026-10-17 03:54–04:20 · PR #19 · Empaque manual y estibado de la planta de salsas
- **Fecha/hora (UTC):** 2026-10-17 03:54 a 04:20.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño: «nos falta la parte de empaque [...] arman paquetes con esos sachets [...] las de litro vienen 4 por caja, las de 500 gramos 8 por caja y las de 250 gramos 16 unidades por caja [...] es una línea manual donde se empacan, y luego esas cajas van para apilarse en estibas para almacenarse como producto terminado disponible para entrega» (03:54).
- **Qué se hizo:** el tipo `packing-station` gana el parámetro `item_kind` (`sachet` dibuja bolsas planas en la mesa y en la caja) y tres presets: `sachet-1000ml-4`, `sachet-500ml-8` y `sachet-250ml-16`, más tres escenarios con expectativas calculadas a mano. En `sauce-plant-v1` las encajadoras automáticas `case-pack-01` y `case-pack-02` se reemplazan por tres mesas manuales (`pack-sauce-250`, `pack-sauce-500` y `pack-sauce-1000`) en la zona de encajado, enlazadas a la envolvedora. En `simulation.yaml` la línea caliente de 1.000 ml termina ahora en `pack-sauce-1000` (control de peso → mesa → tarimas); las mesas de 500 y 250 ml se simulan sin llegadas hasta conectar sus líneas. Se ajustaron `nominal` y las pruebas que usaban `case-pack-02`.
- **Commits:** ver el PR #19.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest` (132 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Expectativas calculadas a mano (1.000 ml: 30 u/min × 60 min = 1.800 sachets ÷ 4 = 450 cajas ÷ 48 por tarima = 9 tarimas; `nominal`: 7 batches ≈ 9.000–10.800 sachets ÷ 4 = 2.160–2.700 cajas; resultado de la corrida: 2.472 cajas, 51 tarimas recogidas, mesa ocupada 27 % del tiempo). Capturas: [[fase7-empaque-sachets-galeria.png]] (galería, preset `sachet-1000ml-4`) y [[fase7-empaque-sachets-escena.png]] (escena con la API en vivo, escenario `nominal`).
- **Decisiones:** [[decisiones]] D20.
- **Conversación:** [[hilo-empaque-de-salsas]].

### 2026-10-17 03:55–04:25 · PR #18 · Sala de control del PLC y panel de gráficos
- **Fecha/hora (UTC):** 2026-10-17 03:55 a 04:25.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «nos falta una parte que es la sala de control del PLC, y en el PLC tener como un panel de gráficos que ya después definiremos» (03:54). La parte de empaque de salsas y las rutas de operarios y montacargas del mismo mensaje van en otros hilos.
- **Qué se hizo:** zona `sala-control` (14 × 10 m, junto a la subestación) y tres equipos en `plant.yaml`: `plc-01` (gabinete), `operator-desk-01` y `scada-wall-01` (panel). Pieza de escena nueva `apps/gallery/src/control-room.ts`: gabinete con luces de estado, puesto con dos monitores y panel de 8 gráficos de tendencia dibujados en un canvas con las variables de la simulación (6 asignadas, 2 libres). La API entrega la clave `panel` del equipo; la escena gana la cámara «Sala de control del PLC»; `layout.svg` regenerado; `docs/plant-scene.md` documenta el panel.
- **Commits:** ver el PR #18.
- **Verificación:** `uv run twin-lib plant validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas con la API en vivo: [[fase7-sala-de-control.png]] (panel con los gráficos recibiendo datos de la simulación) y [[fase7-sala-de-control-plc.png]] (gabinete del PLC).
- **Decisiones:** [[decisiones]] D19.
- **Conversación:** [[hilo-sala-de-control-plc]].

### 2026-10-17 02:19–02:50 · PR #17 · Línea de peletizado y lazo de reciclaje
- **Fecha/hora (UTC):** 2026-10-17 02:19 a 02:50.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «No entiendo cómo es que las inyectoras le entregan al molino, no es al revés» (02:19) y, a la propuesta de cerrar el lazo de reciclaje con la extrusora de pellet, «Sí, por favor» (02:19). También preguntó adónde van las piezas después de la inyección; se le respondió con los flujos del plano (sin cambios de código).
- **Qué se hizo:** tipo nuevo `pelletizing-line` en `equipment-library/` con contrato, comportamiento (tolva, capacidad que baja con la suciedad de la malla, temperatura de fundido, potencia), 3 presets, 9 escenarios con expectativas calculadas a mano, geometría 3D (tolva con cargador, extrusor con resistencias, cambiador de malla, baño de agua con hebras, cortadora, big-bag), `FICHA.md` y `README.md`. `simulation.yaml` simula `extruder-pel-01` y `silo-05` (un `vessel` con la forma `silo`) y enlaza molino → peletizado → silo 5 (por la estación de big-bag, sin simular). Escenario nuevo `pelletizer-jam`; `nominal` suma tres expectativas. PR apilado sobre el #16.
- **Commits:** ver el PR #17.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Expectativas calculadas a mano (arranque en frío: 600 × ln(205 ÷ 3) = 2.534 s; potencia a 86 % de carga: 110 × (0,25 + 0,6 × 0,857) + 8,8 = 92,9 kW; tolva tras el atasco: ≈ 54 kg de 200 kg). Capturas: [[fase6-peletizadora.png]] (galería) y [[fase6-reciclaje-en-la-escena.png]] (escena con la API en vivo, escenario `pelletizer-jam`: tolva al 26,5 %, 46,7 kg entregados al silo 5).
- **Decisiones:** [[decisiones]] D18.
- **Conversación:** [[hilo-cascada-de-inyeccion]].

### 2026-10-17 01:31–01:52 · PR #16 · Cascada de la planta de inyección
- **Fecha/hora (UTC):** 2026-10-17 01:31 a 01:52.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «los equipos todavía se ven como bloques simples […] hay que darle su geometría de verdad […] y después también entonces arrancamos con los equipos de inyección» (01:31). La geometría de empaque, secadores, chillers y molino ya estaba hecha en el PR #15; la de la inyectora ya era detallada (V2, 463 líneas), así que este PR hace la segunda parte: incorporarlos a las inyectoras.
- **Qué se hizo:** el motor de planta gana la magnitud `moisture_pct` (humedad de la resina; esquema, `links.py` y `docs/plant-engine.md`). Contratos: la inyectora publica la resina que pide (`resin_demand_kg_h`) y su scrap (`scrap_flow_kg_h`), recibe caudal y humedad por `resin_in` y la disponibilidad del agua por `cooling_water` (puerto ahora de tipo `material`, como la salida del chiller); sin caudal de resina más de 10 s pasa a `starved`. El secador entrega lo que pide la inyectora y su humedad; el chiller publica `water_ok`. `simulation.yaml` enlaza secador 3 → imm-01, secador 4 → imm-28 (un secador por inyectora: el motor no reparte caudal), chiller 1 → las 29 inyectoras y las 29 → molino (por `sort-01` y `wash-line-01`, sin simular); `plant.yaml` gana los flujos correspondientes sin `piped`. Escenarios nuevos `dryer-stop` y `chiller-trip`; `nominal` recalculado (secador 4: 273 kg/h, no 400; molino: ≈ 100 kg/h, no 300). Dos pruebas nuevas de la inyectora.
- **Commits:** ver el PR #16.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest` (119 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test` (57). Expectativas calculadas a mano (consumo de resina 7 × 1,03 ÷ 95 s = 273 kg/h; coladas de las 29 = 79 kg/h y rechazos base = 21,6 kg/h; circuito del chiller sin compresores 360 kW ÷ (4.186 kJ/m³K × 20 m³) = 0,0043 K/s). Capturas de la escena con la API en vivo, escenarios `chiller-trip` y `dryer-stop` a ≈ 1 h 10 min simulados: [[fase6-chiller-trip-moldes.png]] (molde de la imm-01 a 54,8 °C) y [[fase6-secador-4-detenido.png]] (imm-28 en `starved`). La geometría no cambió.
- **Decisiones:** [[decisiones]] D17.
- **Conversación:** [[hilo-cascada-de-inyeccion]].

### 2026-10-17 00:54–01:30 · PR #15 · Equipos de la planta de inyección con geometría propia
- **Fecha/hora (UTC):** 2026-10-17 00:54 a 01:30.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «si asigna un hijlo para ello» (00:54), a la propuesta del coordinador de modelar con geometría propia el empaque, los secadores, los chillers y los molinos de la planta de inyección, que seguían como bloques simples en la escena. Las pasarelas de la nave quedaron fuera de este hilo.
- **Qué se hizo:** cuatro tipos nuevos en `equipment-library/`, cada uno con contrato, comportamiento, geometría 3D, presets, escenarios con expectativas calculadas a mano, `FICHA.md` y `README.md`: `desiccant-dryer` (aire de proceso, residencia y humedad de la resina; falla de regeneración del desecante), `chiller` (etapas por banda muerta, inercia del circuito, derrateo por ambiente, disparo por alta presión), `granulator` (capacidad, desgaste de cuchillas, finos, corriente) y `packing-station` (mesa de espera, ritmo del operario, cambio de caja, tarima). `simulation.yaml` de la planta de inyección los simula (4 secadores, 2 chillers con el segundo de respaldo apagado, el molino de reciclaje y las 4 estaciones de empaque) y enlaza `conveyor-main-01 → pack-station-01`: la banda de 88 m ya entrega al empaque. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Commits:** ver el PR #15.
- **Verificación:** `uv run twin-lib validate` (14 tipos), `uv run twin-lib plant validate`, `uv run pytest` (115 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test` (57 pruebas de geometría). Expectativas calculadas a mano (por ejemplo, humedad del ABS a 4 h de residencia: 0,0035 + 0,1965·e^(−4/1,2) = 0,0105 %; chiller con 360 kW de carga: ≈ 85,4 kW eléctricos; molino de 500 kg/h con 300 kg/h de alimentación: 43,96 A). Dos expectativas se corrigieron al revisar mi propia cuenta (no la simulación): el tiempo hasta que la resina deja de estar seca ignoraba el retardo del punto de rocío, y el calor neto del chiller sobrecargado ignoraba el arranque escalonado de las etapas. Capturas con Chromium y la API local (01:19, escenario `nominal`): [[fase5f-secadores-en-la-escena.jpg]], [[fase5f-chillers-en-la-escena.jpg]], [[fase5f-empaque-en-la-escena.jpg]], [[fase5f-molino-en-la-escena.jpg]].
- **Decisiones:** [[decisiones]] D16.
- **Conversación:** [[hilo-equipos-de-inyeccion]].

### 2026-10-17 00:53–01:15 · PR #14 · Solucionador hidráulico del acueducto
- **Fecha/hora (UTC):** 2026-10-17 00:53 a 01:15.
- **Fase del plan:** [[plan-del-proyecto]], acueducto a escala, entrega 2 de 5.
- **Solicitado por:** Carlos Andrés Quiceño: pedido del acueducto (00:20) y fusión del PR #13 (00:52) sin correcciones a los supuestos, con lo que el hilo siguió con lo anunciado («si no me corriges nada, lo construyo con estos supuestos apenas fusiones el #13»).
- **Qué se hizo:** primitiva `twin_runtime/primitives/hydraulics.py`, `HydraulicNetwork`: método del gradiente global (Todini-Pilati, el de EPANET) en Python puro con eliminación dispersa de grado mínimo; tubos (Darcy-Weisbach, Swamee-Jain y Hagen-Poiseuille), válvulas por Kv (lineales o de igual porcentaje), antirretornos, bombas con curva y velocidad, descargas con exponente (consumos y fugas) y PRV con los estados de EPANET; arranque en caliente. Documentado en `docs/water-network-plant.md` (sección 5.1).
- **Verificación:** 16 pruebas nuevas en `packages/twin-runtime/tests/test_hydraulics.py` con valores calculados a mano en cada prueba y la red de diseño completa (lo que entra sale; 13,0 m³/h y 20,0 mca en la válvula crítica dentro del 2 %; noche con PRV fija 23,4 mca); `uv run pytest`, `ruff`. Sin cambios visuales, sin captura.
- **Decisiones:** [[decisiones]] D23.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-17 00:21–00:45 · PR #13 · Diseño del acueducto a escala (tercera planta)
- **Fecha/hora (UTC):** 2026-10-17 00:21 a 00:45.
- **Fase del plan:** [[plan-del-proyecto]], nueva planta de demostración (acueducto), entrega 1 de 5.
- **Solicitado por:** Carlos Andrés Quiceño (00:20): «quiero añadir una nueva planta […] va a representar el sistema de acueducto de una ciudad», con bombeo en paralelo a 80 mca, estación reguladora con rama automática y manual, rejilla de cuatro niveles con válvulas de consumo y de fuga, recirculación, y 20 mca en la válvula más crítica; «por ahora la primera fase es crear el modelo digital» y después Navier-Stokes.
- **Qué se hizo:** documento de diseño `docs/water-network-plant.md` (distribución por pisos, equipos y tipos de librería, predimensionamiento, modelo de simulación con un solucionador hidráulico en el motor, control, KPIs, escenarios, escena 3D, preparación para Navier-Stokes, entregas y supuestos S1–S7) y script `tools/hydraulics/predimensionamiento.py` que reproduce las cifras. `docs/roadmap.md` agrega la planta.
- **Verificación:** el script corre (día: 13,0 m³/h, salida PRV 26,7 mca, 20,0 mca en la válvula crítica; noche al 30 %: PRV automática 20,0 mca y 1,42 m³/h de fugas contra 23,4 mca y 1,50 m³/h con la manual) y pasa `ruff`. Sin cambios visuales, por eso no hay captura.
- **Decisiones:** [[decisiones]] D15.
- **Conversación:** [[hilo-acueducto-a-escala]].

### 2026-10-16 22:31–22:45 · PR #12 · Planta de inyección en la escena (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 22:31 a 22:45.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (22:08) a la propuesta de enlazar el desvío del pasteurizador y cubrir la planta de inyección; esta es la segunda entrega, después de fusionar el PR #11 (22:29).
- **Qué se hizo:** `industrial-models/plastic-injection-plant-v1/simulation.yaml` simula las 29 inyectoras con los parámetros del `plant.yaml` (tonelaje, cavidades, peso de pieza, ciclo, robot) sobre el preset de su tonelaje, y la banda principal de 88 m recibe las piezas de la inyectora 3. El puerto `parts_out` de la inyectora publica sus piezas buenas. La banda gana el parámetro `entry_buffer_units` (por defecto 1, sin cambio para la línea de sachets; 8 en el preset de la nave, supuesto): sin él descartaba las ráfagas de 4 piezas por ciclo y perdía la mitad de la producción. Dos escenarios: `nominal` y `conveyor-trip`. La escena y la API no necesitaron código: la planta aparece como simulada. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** `uv run pytest` (prueba nueva de piezas sin pérdida entre la inyectora 3 y la banda; las pruebas de la API se ajustaron porque ya no queda una planta solo de plano, y la planta sin simulación se prueba con una copia temporal), `twin-lib validate`, `twin-lib plant validate`, `ruff`, `pnpm -r typecheck` y `pnpm -r test`. Expectativas calculadas a mano: 300 ciclos × 4 piezas, 98 piezas que siguen en la banda (293 s de recorrido), ≈ 700 piezas con la banda detenida 20 min. Capturas con Chromium y la API local: [[fase5e-planta-inyeccion-banda-detenida.png]] (00:35, `conveyor-trip`, banda en falla y `accepting = 0`).
- **Decisiones:** [[decisiones]] D14.
- **Conversación:** [[hilo-desvio-pasteurizador]].

### 2026-10-16 22:08–22:30 · PR #11 · Desvío del pasteurizador enlazado (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 22:08 a 22:30.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (22:08) a la propuesta de enlazar el desvío del pasteurizador y cubrir la planta de inyección. Esta es la primera de dos entregas pequeñas; la planta de inyección va en un PR aparte. El PR #10 ya estaba en `main`.
- **Qué se hizo:** el pasteurizador publica `divert_kg_h` por su puerto `divert_out` y la marmita recibe por el nuevo puerto `return_in` (`returned_kg`): el producto desviado regresa con la receta del batch y se mezcla a la temperatura de retorno, y el descargado neto es descargado − regresado. El motor de planta incorpora `when` en los enlaces (compuerta: el desvío va solo a la marmita que descarga, repartido en proporción si descargan las dos) y una regla de entrada compartida (las dos marmitas comparten la bomba: solo una descarga a la vez; la otra espera). `plant.yaml` agrega el flujo `holding-tube-01 → kettle-02`; en `boiler-trip` el desvío ya no saca producto del modelo (1.498 L devueltos, 1.678 kg) y el batch de la marmita 2 se alarga. La escena no necesitó código: la API entrega los enlaces de esas tuberías y se animan con su caudal. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** `uv run pytest` (pruebas nuevas: lo desviado regresa completo y el resto llega al pulmón, el desvío va solo a la marmita que descarga, una sola marmita descarga a la vez, la compuerta nombra una variable del contrato; la prueba de balance anterior se ajustó porque el desvío ya no sale del modelo), `twin-lib validate`, `twin-lib plant validate`, `ruff`, `pnpm -r typecheck`. Expectativas nuevas de `boiler-trip` calculadas a mano (≥ 20 min de desvío × 56 kg/min). Captura con Chromium del escenario `boiler-trip` a ×900 con la API local: [[fase5d-desvio-pasteurizador.png]] (03:16, `divert = 1`, `divert_kg_h = 3360`, `forward_kg_h = 0`).
- **Decisiones:** [[decisiones]] D13.
- **Conversación:** [[hilo-desvio-pasteurizador]].

### 2026-10-16 21:31–22:00 · PR #10 · Caudal real por enlace (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 21:31 a 22:00.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (21:31) a la propuesta de que el motor publique el caudal de cada enlace para animar las tuberías con datos reales. El PR #9 ya estaba en `main`.
- **Qué se hizo:** el motor de planta guarda en cada paso el estado de cada enlace (`snapshot.links`: caudal en kg/h o u/min, temperatura, presión, demanda, `flowing`); el vapor circula con la demanda del destino mientras haya presión. `PlantModel.links_for_flow` asocia los tramos del plano con los enlaces; `GET /api/plants/{id}` entrega en cada tubería `rate`, `unit` y `links`. La escena anima cada tubería con la suma de los caudales de sus enlaces sobre un caudal de referencia (más esferas y más rápidas con más carga, ninguna sin caudal); los tramos sin simular conservan el indicio por estado. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** 3 pruebas nuevas del motor (caudal de la descarga igual al de la marmita, vapor a 3 bar y a pedido, servicio sin presión, tramos a enlaces) y una ampliación de la prueba de la API; `ruff`, `pnpm -r typecheck`; capturas con Chromium del escenario `nominal` a ×900 con la API local: [[fase5c-tuberias-sin-caudal.png]] (02:03, solo circula lo que hay) y [[fase5c-tuberias-con-caudal.png]] (04:00, esferas en las tuberías con caudal).
- **Decisiones:** [[decisiones]] D12.
- **Conversación:** [[hilo-caudal-de-enlaces]].

### 2026-10-16 19:25–19:55 · PR #9 · Pasarelas, tuberías y recorrido de cámara (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 19:25 a 19:55.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceno, «Si» (19:25) a la propuesta de completar los pendientes de la fase 5 (pasarelas, tuberías animadas y recorrido de cámara). Los PR #7 y #8 ya estaban en `main`.
- **Qué se hizo:** sección `walkways` en el `plant.yaml` (formato nuevo, validado y dibujado en el plano 2D por `render_layout.py`) con dos pasarelas en la planta de salsas; la API entrega `walkways` y `pipes` (flujos `piped`); la escena dibuja las pasarelas con barandas, columnas y escalera, las tuberías por rack con color según el medio y esferas que circulan cuando el origen está en servicio, y un recorrido de cámara de oeste a este que se interrumpe con un clic. Documentado en `docs/plant-scene.md`.
- **Verificación:** pruebas de Python (la de la API de plantas cubre `walkways` y `pipes`), `ruff`, validación de ambos layouts, `pnpm -r typecheck` y pruebas de geometría; capturas con Chromium en `docs/registro/evidencia/`: [[fase5b-proceso-caliente-tuberias-pasarela.png]], [[fase5b-proceso-frio-pasarela.png]], [[fase5b-vista-general-tuberias.png]], [[fase5b-recorrido-de-camara.png]]; el recorrido, probado en el navegador: avanza por las zonas y se detiene con un clic.
- **Decisiones:** [[decisiones]] D11.
- **Conversación:** [[hilo-escena-de-planta]].

### 2026-10-16 18:32–18:55 · PR #8 · Escena de planta en 3D (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 18:32 a 18:55.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «si» (18:32) a la pregunta «¿Hago el merge de los PRs #5 y #6 y arranco la fase 5?». Los PR #5 y #6 ya estaban fusionados a `main` cuando el hilo arrancó.
- **Qué se hizo:** API de plantas (`GET /api/plants`, `GET /api/plants/{id}`, `WS /api/plants/{id}/simulate`); página `plant.html` de la galería con zonas por clase higiénica, equipos simulados con su geometría de librería y animados en vivo, volúmenes para los equipos sin tipo, puente grúa, selección de activos con variables y comandos, cámaras por zona y HUD de líneas y eventos; documento `docs/plant-scene.md`. Se aplica la regla D07: ningún valor de tolerancia se fija en la escena, todo viene del motor.
- **Base del PR:** apilado sobre la rama del PR #7 (`docs/registro/` aún no estaba en `main`).
- **Verificación:** 82 pruebas de Python (4 nuevas de la API de plantas), `ruff`, `pnpm -r typecheck` y pruebas de geometría; capturas con Chromium de la vista general, la sala de llenado (escenario `nominal`, ×900), el cuarto de caldera (`boiler-trip`) y la planta de inyección: [[fase5-escena-vista-general.png]], [[fase5-escena-sala-de-llenado.png]], [[fase5-escena-caldera-boiler-trip.png]], [[fase5-escena-planta-inyeccion.png]] en `docs/registro/evidencia/`.
- **Decisiones:** [[decisiones]] D10.
- **Conversación:** [[hilo-escena-de-planta]].

### 2026-10-16 · PR #7 · Registro para el registro de software
- **Solicitado por:** Carlos Andrés Quiceño: «es muy muy importante dejar en el repo redactado el plan en md y los avances de la ejecución del plan, así como respaldo […] el histórico de conversaciones con la IA», y que las notas sean compatibles con Obsidian.
- **Qué se hizo:** carpeta `docs/registro/` como bóveda de Obsidian: [[00-indice]], [[plan-del-proyecto]], esta bitácora, [[decisiones]], [[como-actualizar]] e histórico en [[historico-sesion-codigo]] e [[historico-proyecto]].
- **Verificación:** revisión de secretos con `grep` (el token de un enlace de Drive se reemplazó por `[REDACTADO]`).

### 2026-10-16 17:15 · PR #6 · Tolerancia del control de peso en porcentaje
- **Solicitado por:** el autor (16:46 UTC): la tolerancia «debe ser medida en porcentaje con respecto a cada medida de cada paquete de entrega».
- **Qué se hizo:** el contrato y los presets del `checkweigher` expresan la tolerancia como % del nominal; los porcentajes son equivalentes exactos de los gramos previos (1.000 ml tomate −1,34 % / +5,00 %; 250 ml mayonesa −3,87 % / +5,16 %; 250 ml tomate −3,21 % / +5,00 %; 500 ml mayonesa −3,23 % / +4,95 %).
- **Commit:** `fa8aca1`. Merge `10e11f2`. **Verificación:** 78 pruebas Python, pruebas de la planta y CI (python y web) en verde.
- **Conversación:** [[historico-proyecto]] (hilo «Motor de planta vs cascada»). Decisión: [[decisiones]].

### 2026-10-16 16:02 · PR #5 · Motor de planta (fase 4)
- **Solicitado por:** el autor eligió «motor de planta» frente a la cascada de inyección (15:11 UTC).
- **Qué se hizo:** motor que lee el `plant.yaml`, instancia equipos y los conecta por puertos de material, piezas y servicios; enlaces por puerto en 9 contratos; simulación de la línea caliente de 1.000 ml (marmitas → pasteurizador → sachetadora → túnel → control de peso → encajonadora). Escenarios: turno normal (823 cajas en 8 h), falla de caldera, parada del túnel. CLI `twin-lib plant`. Documentación en `docs/plant-engine.md`.
- **Hallazgo:** con el dosificador al 1,5 % el control de peso rechaza ≈6,8 % de los sachets de 1.000 ml; pendiente el dato real del autor.
- **Commit:** `f67b643`. Merge `f479f04`. **Verificación:** 78 pruebas Python y 41 de geometría; CI en verde.

### 2026-10-16 15:06 · PR #3 y #4 · Merge de la línea de sachets
- **Solicitado por:** el autor: «aprobados los PR», «haz el merge» (15:05 UTC). Merge commit, mismo método que PR #1 y #2; CI en verde, sin conflictos.

### 2026-10-16 12:50–13:42 · PR #4 · Línea de sachets de la planta de salsas
- **Solicitado por:** el autor: las salsas no se guardan en botellas sino en **sachet**, de 250 ml y 1.000 ml (12:50–12:51), y luego 500 ml (13:15); confirmó la ficha (13:19).
- **Commits:** `2decd3c` fichas de la fase 3; `aeb593b` salsas en sachet 250/1.000 ml; `7edddcc` sachet 500 ml; `b73da88` sachetadora vertical `vffs-sachet-filler`; `3bbac13` banda, túnel de enfriamiento, control de peso y encajonadora; `1b7bdb7` pasteurizador tubular y caldera de vapor.
- **Verificación:** escenarios con `expect`, pruebas de Python y de geometría, capturas de la galería.

### 2026-10-16 05:18 · PR #3 · Lint de `render_layout.py`
- Corrección que rompía el CI en `main`. Commits `2b0bfac`/`a7a5031`.

### 2026-10-16 05:09–05:16 · Entrevista y plan con MCP
- **Solicitado por:** el autor (05:02): la creación de equipos por usuarios será por un **conector MCP** entre Claude y la herramienta, como una de las últimas fases. Se agregó al plan (commit `9480c03`) y la entrevista con ficha confirmada (`309c1c5`). PR #1 y #2 aprobados y fusionados (05:16).

### 2026-10-16 04:12–04:51 · PR #2 · Librería de equipos
- **Solicitado por:** el autor (04:06–04:12): tener todos los equipos «como previamente estandarizados, como si fueran librerías […] piezas de código configurado», dentro de una carpeta del repo (no en rama aparte), sin depender de Blender, y «super realista» con referencias visuales.
- **Commits:** `c401925` librería con runtime y tres tipos de referencia; `99328f1` geometría 3D paramétrica, galería, API de simulación y guía de autoría.

### 2026-10-16 03:53 · PR #1 · Layouts de las plantas
- **Solicitado por:** el autor (01:28–01:29): construir primero un ejemplo de planta de inyección de plástico y otro de salsas de tomate para representar manufactura discreta y de procesos, inspirados en dos empresas de Medellín sin nombrarlas. El autor pidió ver los planos 2D (03:56).
- **Commits:** `308a779` inicializa el repositorio; `ab95f37` layouts de inyección y salsas con validador y plano 2D.

### 2026-10-15 23:17 · Inicio
- El autor abre la sesión: revisar el repositorio (vacío) y el documento «ARVANTTI Harness — Industrial Digital Twin». La IA lee el documento, hace cuatro observaciones y propone empezar por la semana 1 del plan (monorepo, contratos, FastAPI, Vite + React Three Fiber). El autor pide primero el plan (23:26).
- **Conversación:** [[historico-sesion-codigo]].

### 2026-10-16 14:58–17:15 · Configuración del proyecto en Claude
- Proyecto «Fabtimus Demo 3D»: instrucciones del proyecto, rutinas (revisión semanal de PRs los lunes; galería de equipos los viernes), modelo por defecto Haiku 5.5 con Sonnet 5.5 y Opus 5.5 según la tarea, y regla del registro de software. Ver [[historico-proyecto]] y [[decisiones]].
