---
tipo: historico-ia
fuente: hilo «Panel de gráficos del PLC del acueducto» (Claude Projects)
desde: 2026-10-17 15:28
hasta: 2026-10-17 18:05
tags: [registro, historico-ia, acueducto, panel-plc]
---
# Hilo: panel de gráficos del PLC del acueducto (PR del panel en la galería)

Parte de [[historico-proyecto]] · Índice: [[00-indice]] · Bitácora: [[bitacora]] · Relacionado: [[hilo-acueducto-a-escala]], [[hilo-sala-de-control-plc]]. Autor humano: Carlos Andrés Quiceño. Hora en UTC. Las listas de progreso del hilo no se reproducen. Credenciales: ninguna.

---

### 👤 Carlos Andrés Quiceño · 15:28:01 UTC

Algo que se me ocurre que puede tener ese panel de gráficos es la curva día a día del panel. Día a día, de hora a hora. Entonces, cómo están los consumos de agua cada hora, cómo están las presiones de cada piso, que se puedan ver por válvula y por promedio de piso, pues de piso de la rejilla, ¿cierto? Que se puedan ver por el sistema completo, juntando todas las válvulas de todos los pisos. Otra gráfica para mostrar la cabeza de presión de las bombas Grunfos en el mismo rango de tiempo. Se divide en 24 ciclos, una hora por cada ciclo en el eje X de los gráficos. El eje Y pueden ser metros columna de agua o puede ser caudal también. Tener esas dos gráficas. Tener un modelo de predicción del gemelo digital, es decir, el gemelo digital toma como todos esos datos de sensórica y hay un panel donde están como mostrándose en tiempo real todos los sensores, qué datos están enviando, y luego entonces otra pantalla más que muestre el resultado calculado por el gemelo digital con Navier Stokes ante optimización.

### 🤖 Claude · 15:28:11 UTC

Empiezo revisando qué datos por hora puede dar el banco del acueducto para alimentar las gráficas.

*(Herramientas: lectura del banco `water-network-scale-v1`, corrida de 24 horas con el banco, armado y publicación del artefacto. 15:40 UTC: el coordinador avisó que el banco cambió a consigna de 18,09 mca y bombas al piso de 70 mca; se recalculó el día.)*

### 🤖 Claude · 15:48:23 UTC

Ya está el primer prototipo del panel: [Panel PLC · Acueducto a escala](https://claude.ai/artifact/RLiUZmGZLcafZDo6VAP5j2). Por ahora es privado; para mostrárselo al cliente hay que compartirlo desde el menú Compartir de la página.

Los datos de las 24 horas salen del banco hidráulico del acueducto con la configuración nueva: la reguladora fija en 18,09 mca, las bombas a la velocidad mínima que sostiene 70 mca y la casa crítica en 15,45 mca. El consumo sigue un perfil residencial que supuse yo, con picos a las 07:00 y a las 19:00. No son datos de sensores reales.

El panel tiene cuatro pantallas:
• **Curva del día:** el consumo y las fugas de cada hora, en m³/h o L/min. La presión se puede ver del sistema completo (promedio con mínima y máxima), por piso o por válvula, y en mca o en caudal. Tiene las líneas del semáforo en 20, 18 y 15.
• **Bombas Grundfos:** en el mismo eje de 24 horas, con tres vistas: la presión y la cabeza en mca, el caudal y la velocidad. Muestra las líneas de 70, 65 y 80 mca.
• **Sensores en tiempo real:** reproduce el día con un reloj acelerado. Muestra las tarjetas de los sensores (PT, FT, apertura de la PRV y velocidad), la rejilla de cada nivel con el semáforo por válvula y las últimas tramas que llegan al PLC. Cuando conectes el simulador de tiempo real, estas tarjetas pueden leerlo.
• **Gemelo digital:** compara la operación actual con la consigna que calcula el gemelo hora a hora.

Hay tres cosas que vale la pena saber antes de mostrarlo:
1. Bajar la consigna de 26,66 a 18,09 mca reduce las fugas un 18 % (unos 6,7 m³ al día). Ajustarla además hora a hora casi no suma, apenas 0,01 m³ al día. En el banco la fricción es muy pequeña, así que con 18,09 mca la red ya está casi en su mínimo.
2. La presión en las casas se ve casi plana durante el día por esa misma razón: la que fija la presión es la reguladora.
3. El gemelo resuelve la red de tuberías en una dimensión con Darcy-Weisbach, que es la forma de Navier-Stokes que se usa para flujo en tubería. No es una simulación CFD en 3D. En la página lo dice tal cual.

No toqué el repositorio. Los scripts que generan los datos quedaron en acueducto/panel-plc para volver a correrlos cuando el banco cambie.

¿Quieres que lo pase al sitio de monitoreo en el repo, o primero ajustamos las curvas contigo?

### 👤 Carlos Andrés Quiceño · 17:51:23 UTC

Hay dos errores. No tiene sentido que la presión a lo largo de todo el día sea constante en las rejillas y en las válvulas de salida. No tiene sentido eso porque la presión varía en la entrada, debe variar en la salida. La presión varía en la entrada en cada uno de los puntos porque la estación reguladora de presión debe entregar, o sea, una cosa es el sistema optimizando a que no baje, otra cosa es organizar el sistema para que en caso de que baje, el punto mínimo pues no se baje de los 15 metros columna de agua. Es decir, piensa en el funcionamiento de la bomba y yo debería ajustar la presión a la salida de la bomba tal que garantice eso, pero no sé, no me está haciendo sentido de que la presión en cada una de las casas sea constante. Pensándolo de pronto puede que sí, pero no sé, dame un argumento sólido como para debatir eso, a ver si el equivocado soy yo. Y segundo, ya te digo el otro comentario que vi en las gráficas.

### 🤖 Claude · 17:51:57 UTC

Tienes razón a medias. Para una red real la presión en las casas sí cambia durante el día. En este banco casi no cambia, por dos razones que se pueden medir:

**1. La reguladora corta lo que pasa aguas arriba.** Una PRV sostiene su presión de salida mientras la entrada esté por encima de la consigna. Que la bomba entregue 65, 70 u 80 mca no llega a las casas: solo cambia cuánto se cierra la válvula de la PRV. Por eso, con la PRV en servicio, la presión de la bomba no se ajusta para cuidar la casa crítica. La bomba solo tiene que mantenerse por encima de la consigna más la pérdida de la propia PRV.

**2. Después de la reguladora, lo único que cambia con la hora es la fricción.** La presión en una casa es la consigna, menos la altura, menos la pérdida por fricción. La fricción crece con el cuadrado del caudal. En el banco el caudal pasa de 2,1 m³/h en la madrugada a 9,6 m³/h en el pico, repartido en cuatro columnas de 2". El agua va a unos 0,3 m/s por unos pocos metros de tubo. La casa C44 del nivel 4 varía solo entre 15,45 y 15,49 mca en todo el día. La línea plana es la física de una red pequeña y corta.

**Dónde tienes razón:**
• En un acueducto real hay kilómetros de tubería y velocidades de 1 a 2 m/s. La fricción del pico de la mañana puede quitar 5 a 15 mca en el punto crítico. Por eso allá la consigna se sube en el pico y se baja de noche, con control por punto crítico. Esa es la optimización que quieres mostrar, y en este banco casi no tiene de dónde sacar ahorro, como ya se vio: 0,01 m³ al día.
• El banco usa una PRV ideal. Una real pierde presión de salida cuando sube el caudal (caída de regulación) y tarda en responder. Eso sí haría variar la presión de las casas durante el día.
• Si la PRV queda totalmente abierta, la curva de la bomba pasa directo a las casas y ahí sí manda la presión de la bomba.

Para que el panel muestre curvas con sentido, tengo dos propuestas:
1. Agregar al modelo de la PRV su caída de regulación con el caudal.
2. Agregar un escenario a escala de ciudad, con tramos largos entre la estación y la rejilla.

Las dos tocan el banco que está cambiando el hilo del acueducto, así que las coordinaría con ese hilo. ¿Cuál era el segundo comentario sobre las gráficas?

### 👤 Carlos Andrés Quiceño · 17:52:19 UTC

Claro, el otro punto es que no sé si estamos partiendo de la base de que todas las válvulas se abren o se cierran a la misma amplitud, o estamos poniendo escenarios muy aleatorios. Para esa gráfica que me mostraste donde la presión es constante durante el día.

### 🤖 Claude · 17:52:30 UTC

No abrí todas las válvulas igual, pero tampoco fue un escenario al azar. La apertura de cada casa en cada hora salió de multiplicar tres factores:

1. **Un perfil diario común a todas:** 10 % de apertura a las 2 y 3 de la madrugada, 100 % a las 7 de la mañana, 95 % a las 7 de la noche y valores intermedios el resto del día.
2. **Un factor fijo por casa entre 0,70 y 1,00:** unas casas consumen siempre un poco menos que otras.
3. **Una variación de ±15 % por hora:** para que no todas se muevan exactamente igual.

La apertura de cada casa quedó entre 2 % y 100 %. Las dos fugas de cada nivel quedaron abiertas al 100 % todo el día. La semilla es fija, así que el escenario se repite igual en cada corrida.

Aun así la presión sale plana, y no es por las aperturas: en el pico de las 7 todas las casas están entre 70 % y 100 % abiertas, y la caída en la casa crítica es de 0,04 mca. Con la red del banco ningún patrón de aperturas la mueve mucho. Por eso tiene más efecto lo que te propuse antes: la reguladora real que pierde presión con el caudal, o tramos largos de tubería.

Para el panel puedo agregar un selector de escenario: todas iguales, el perfil actual con dispersión y el peor caso con todas al 100 %. Este último es el punto de partida para el algoritmo genético que busca la peor combinación. ¿Lo agrego junto con alguno de los dos cambios del banco?

### 👤 Carlos Andrés Quiceño · 17:53:30 UTC

Y otro punto, cuando lo miro por válvula, no debería mostrarme, perdón, sí, cuando lo miro por válvula y escojo el nivel, por ejemplo el nivel 1, entonces me debe mostrar solamente las opciones de las válvulas correspondientes al nivel 1, nivel 2, así sucesivamente. Y en ese momento estoy tomando nivel 1 y me toma todas las válvulas del nivel 2, 3, 4, incluso las del nivel 1, ahí en la lista desplegable.

### 🤖 Claude · 17:53:34 UTC

Entendido: al elegir un nivel, la lista de válvulas debe mostrar solo las de ese nivel. Reviso el código y lo corrijo.

### 🤖 Claude · 17:54:15 UTC

Ya cambié la lista de válvulas en el [panel](https://claude.ai/artifact/RLiUZmGZLcafZDo6VAP5j2).

La lista ya filtraba por nivel: si eliges el nivel 1, solo trae las 18 válvulas del nivel 1. La confusión venía de los nombres. En C23, el 2 es el ramal y el 3 es la casa dentro del ramal, no el nivel. Cada nivel tiene su propia C11 a C44, así que la lista parecía traer válvulas de los niveles 2, 3 y 4.

Ahora la lista está agrupada por ramal y cada opción dice el nivel, por ejemplo "N2 · R3 · Casa 2 (C32)" o "N2 · R4 · Fuga L2". Lo probé eligiendo el nivel 2 y solo aparecen válvulas de ese nivel.

### 👤 Carlos Andrés Quiceño · 17:58:10 UTC

Bueno, lo que mencionas de los escenarios, eso no nos corresponde definirlo acá. Aquí debemos tener apertura de la mente, es decir, apertura para que estemos dispuestos a analizar cualquier escenario, ¿cierto? Y los diferentes escenarios, esos ya los crea el gemelo digital. No, mejor dicho, no es que los cree el gemelo digital. Los crea el usuario a través de un chat que va a tener con Claude, conectado a este sistema por MCP, para crear las variaciones de escenarios que quiera probar. El sistema va a responder como si fuera un sistema conectado al sistema en tiempo real, porque va a tener entradas o PCUA para todo, para toda la comunicación con PLC. Y pues como es un escenario simulado, no tenemos el sistema real, entonces eso es lo que el usuario le ingresaría como sistema real, pues cuasi real, ¿cierto? Entonces, bueno, está bien así lo de las gráficas. Recuerdo, si no estoy mal, algún dato que tenía del sistema físico real que habíamos construido, pero que ya desmontamos. No estoy seguro si la velocidad era como cercano a los 6 metros por segundo, algo así, pero no me acuerdo si eso era 6 metros por segundo a la salida en las válvulas, o era 6 metros por segundo en la salida de las bombas. Revisa que si ese dato se hace sentido en algún lado.

### 🤖 Claude · 17:58:20 UTC

Entendido, las gráficas quedan así. Reviso dónde encajan los 6 m/s con los datos del banco y de las bombas.

### 🤖 Claude · 17:58:42 UTC

Los 6 m/s solo cuadran en la salida de las bombas. En la salida de las válvulas no cuadran. Lo revisé contra los datos del banco (docs/water-network-plant.md) y con cálculo directo.

**Salida de las bombas: sí cuadra.** Cada bomba da 13 m³/h. Con ese caudal, 6 m/s corresponden a una boquilla de unos 28 mm de diámetro interior, o sea de 1". Con las dos bombas juntas (26 m³/h), corresponden a unos 39 mm, de 1½". Las bombas multietapa pequeñas suelen tener boquillas de ese tamaño, así que el dato es creíble ahí. Más adelante la velocidad baja mucho: 0,44 m/s en el colector de 4" y 1,67 m/s en las columnas de 2".

**Salida de las válvulas de casa: no cuadra.** El chorro que sale a la atmósfera tiene una velocidad que depende de la presión, v ≈ √(2·g·h):
• A 15 mca da unos 17 m/s, y a 20 mca unos 20 m/s.
• Un chorro de 6 m/s supone apenas 1,8 mca justo antes de la salida.
• Si los 6 m/s fueran dentro del tubo de ½" de la válvula, cada casa estaría tomando unos 4 m³/h. El banco da 0,15 a 0,2 m³/h por casa.

Si recuerdas el modelo de las bombas o el diámetro de su boquilla de descarga, lo dejo anotado en el diseño como dato del sistema físico.

### 👤 Carlos Andrés Quiceño · 18:00:31 UTC

No, no recuerdo ese dato. Pero entonces sí, es 6 metros alrededor de la salida de las bombas, ese es el caudal.

### 🤖 Claude · 18:00:37 UTC

Listo, queda anotado que los 6 m/s son en la descarga de las bombas. Una precisión: 6 m/s es la velocidad del agua. El caudal sigue siendo 13 m³/h por bomba, y los dos datos juntos dicen que la boquilla es de más o menos 1". Lo guardé en la memoria del proyecto como dato del sistema físico. Así el hilo del acueducto lo puede usar cuando dimensione la descarga de las bombas.

### 👤 Carlos Andrés Quiceño · 18:02:50 UTC

Bueno, entonces este artefacto hay que llevar el código para que el sistema después lo utilice para montar el frontend, o más bien en el frontend tener una interfaz de gráficas, ¿cierto? No solamente que quede aquí en artefacto en Claude, sino en el sistema.

### 🤖 Claude · 18:02:52 UTC

Sí, el panel debe vivir en el frontend del sistema. Reviso cómo está armado el frontend del repo para integrarlo ahí.

*(Herramientas: script `tools/hydraulics/dia_acueducto.py`, página `apps/gallery/acueducto.html` con `src/acueducto-panel.ts`, captura de la galería local y PR.)*
