---
tipo: historico-ia
fuente: hilo «Motor de planta vs cascada»
desde: 2026-10-16 15:06
hasta: 2026-10-16 16:51
tags: [registro, historico-ia]
---
# Hilo: Motor de planta vs cascada de inyección (PR #5 y #6)

Parte de [[historico-proyecto]] · Índice: [[00-indice]]. Autor humano: Carlos Andrés Quiceño. Hora en UTC.

---

### 👤 Carlos Andrés Quiceño · 15:06:22 UTC

explicame que es la decision de motor de planta y cascada de inyeccion en detalle

### 🤖 Claude · 15:06:28 UTC

Estoy releyendo la sesión anterior para explicarte bien las dos opciones.

### 🤖 Claude · 15:07:56 UTC

Es una decisión sobre qué construir después de la línea de sachets, que ya quedó en `main` (PR #3 y #4 unidos). Hoy la librería tiene 10 equipos, pero **cada uno se simula solo**: lo que recibe de afuera (vapor, agua fría, si la banda de salida está libre) lo inventa el escenario de prueba, no otra máquina. Por ejemplo, la inyectora recibe `resin_moisture_pct` y `cooling_water_ok` como datos fijos (`equipment-library/injection-molding-machine/README.md`).

**Motor de planta (fase 4 de `docs/roadmap.md`)**
- Qué construye: un programa que lee el `plant.yaml`, crea cada equipo desde la librería y los conecta por puertos de material, piezas y servicios, para que la salida de uno sea la entrada del siguiente. Suma recetas, líneas y KPIs de planta.
- Qué muestra la demo: la línea de salsa corriendo de punta a punta, de la marmita a la caja, con efectos en cadena reales: si la caldera pierde presión, el pasteurizador desvía; si el túnel se llena, la sachetadora frena.
- Límite: la planta de salsas tiene unos 35 tipos de equipo y la librería cubre 10. Lo que falta (tanques, bombas, molino coloidal, chiller) entraría simplificado o quedaría fuera al principio. Esto lo deduzco del `plant.yaml`; la sesión anterior no lo dijo.

**Cascada de inyección (seguir la fase 3)**
- Qué construye: los equipos auxiliares de los que depende la inyectora: secadores desecantes (4 en el `plant.yaml`), chillers (2), granulador o molino, y operarios.
- Qué muestra la demo: más máquinas en la galería, cada una funcionando sola. La cadena "el secador falla, la resina llega húmeda y salen piezas con defectos" solo se vería al conectarlas, y eso lo hace el motor de planta.
- Los operarios no figuran como equipo en ningún `plant.yaml`, así que habría que definir cómo modelarlos.

**Por qué se recomendó el motor de planta**
- La línea de sachets ya tiene todas sus máquinas, así que el motor tiene algo completo que conectar y la demo pasa de "máquinas sueltas" a "planta funcionando".
- El motor define cómo se conectan los equipos. Si se hacen antes el secador y el chiller, probablemente habría que ajustarlos después a ese contrato (esto es inferencia mía).

¿Cuál eliges: el motor de planta (recomendado) o la cascada de inyección?

### 👤 Carlos Andrés Quiceño · 15:11:10 UTC

motor de planta elegido

### 🤖 Claude · 15:11:14 UTC

Perfecto, voy con el motor de planta. Primero reviso cómo están hechos el runtime y los equipos para diseñar las conexiones.

### 🤖 Claude · 15:48:48 UTC

Ya está el motor de planta en el [PR #5](https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/5), en borrador. Ahora la línea de tomate de 1.000 ml corre completa, desde las dos marmitas hasta la caja, conectada según los flujos del `plant.yaml`. Las pruebas pasan en local y ya le estoy haciendo seguimiento al CI.

**Lo que se ve al simular** (`twin-lib plant run sauce-plant-v1`):
- **Turno normal de 8 h:** salen 823 cajas. El cuello de botella es la cocción: dos batches de 2.000 kg cada 2 h apenas igualan lo que pide la sachetadora, que se queda sin producto cerca del 19 % del tiempo.
- **Falla de la caldera:** la presión cae porque la marmita que está calentando gasta el vapor, el pasteurizador desvía unos 900 L y no sale producto sin pasteurizar.
- **Parada del túnel:** la sachetadora se bloquea, el pulmón llega al 90 % y la segunda marmita tiene que esperar para descargar.

**Un hallazgo que necesita tu criterio:** el control de peso rechaza cerca del 6,8 % de los sachets de 1.000 ml. Pasa porque la sachetadora dosifica con una desviación de 1,5 % (16,8 g) y el límite inferior es de solo 15 g, y eso no se veía con los equipos sueltos. Si me confirmas una precisión real del dosificador, por ejemplo 0,7 %, ajusto el preset.

Quedan para después la planta de inyección, el retorno del producto desviado a la marmita y la vista de planta en la galería, que es la fase 5.

### 🤖 Claude · 15:50:19 UTC

El [PR #5](https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/5) ya está unido a main. Sigue pendiente lo que te pregunté de la precisión del dosificador de 1.000 ml.

### 👤 Carlos Andrés Quiceño · 16:45:03 UTC

que falta

### 🤖 Claude · 16:45:13 UTC

De tu lado solo falta un dato: la precisión real del dosificador de 1.000 ml. Con el 1,5 % actual, el control de peso rechaza cerca del 7 % de los sachets. Si me dices, por ejemplo, 0,7 %, ajusto el preset y debería bajar a menos del 1 %.

En el plan del proyecto, lo que sigue es:
- **Resto de la planta de salsas en el motor:** las líneas de 250 ml y 500 ml, y la línea fría de mayonesa. Necesitan equipos que aún no existen (emulsificador, molino coloidal, chiller) y una regla para repartir la salida del túnel entre los dos controles de peso.
- **Planta de inyección:** faltan los secadores, chillers, molinos y robots, y después conectarla al motor.
- **Mejoras del motor:** que el producto desviado vuelva a la marmita y que las recetas se lean directo del `plant.yaml`.
- **Fase 5, escena de planta:** ver la planta completa en 3D simulándose en la galería. Hoy la galería muestra un equipo a la vez.

Te recomiendo seguir con la fase 5, porque así la demo se ve funcionando. ¿Sigo con esa o con otra?

### 👤 Carlos Andrés Quiceño · 16:46:42 UTC

Es que la tolerancia no debe ser medida sobre mililitros, la tolerancia debe ser medida en porcentaje con respecto a cada medida de, de cada eh, paquete de entrega. Si es sachet, entonces con respecto a sachet, si es eh, el de mil, con respecto al de mil, y así sucesivamente.

### 🤖 Claude · 16:46:52 UTC

Entendido: la tolerancia se expresa como porcentaje del peso nominal de cada paquete, no en gramos fijos. Reviso el contrato del control de peso y sus presets, y ajusto el cálculo para que cada formato use su propio porcentaje.

### 🤖 Claude · 16:49:40 UTC

Hecho. La tolerancia del control de peso ahora es un porcentaje del nominal de cada paquete, así que el de 1.000 ml se mide contra su propio peso. Está en el [PR #6](https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/6), en borrador.

Los porcentajes de los presets son los equivalentes exactos de los gramos anteriores, así que la simulación no cambia:
- 1.000 ml tomate: −1,34 % / +5,00 %
- 250 ml mayonesa: −3,87 % / +5,16 %
- 250 ml tomate: −3,21 % / +5,00 %
- 500 ml mayonesa: −3,23 % / +4,95 %

Las pruebas pasan: 78 de Python y las de la planta. Esos valores son supuestos; si tienes la tolerancia real por formato, dímela y la pongo.

### 🤖 Claude · 16:51:23 UTC

El [PR #6](https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/6) pasó el CI (python y web en verde) y ya salió de borrador, listo para tu revisión. Lo único que queda abierto es la tolerancia real por formato, si la tienes.

