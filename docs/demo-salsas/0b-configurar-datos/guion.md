---
title: Guion · Cargar los datos a mano
escenario: 0b-configurar-datos
tags: [demo, salsas, guion, aps, configuracion]
duracion_aprox: 2 min
---

# Apertura · Cargar los datos a mano

Va dentro de la apertura, entre la cartera (0-S08) y los escenarios (0-S09). Mensaje central: la configuración que trae
la demo también se carga a mano en el APS (pedidos, llenadoras de cada producto, secuencia del planificador) y se guarda
por versiones. Grabación: `grabar-salsas.cjs 0b --video --hd`.

### S01 · Los datos se pueden cargar a mano
- imagen: capturas/01-configuracion.png
- foco: en la pestaña de configuración del APS => ⚙ CONFIGURACIÓN => Configuración
- foco: Se trabaja sobre un borrador => PLAN MANUAL CON ESTE BORRADOR => El plan con este borrador

> Esta cartera venía ya cargada, pero todo se puede cargar a mano, en la pestaña de configuración del APS. Se trabaja sobre un borrador: arriba, el sistema recalcula al instante cuántos pedidos quedarían tarde, cuántas horas de lavado y cuánta merma habría con esos datos.

### S02 · Los pedidos
- imagen: capturas/02-pedido-nuevo.png
- foco: Agregamos uno => PED-D12-11 agregado. Ubícalo en una llenadora en el paso 3 o déjalo sin asignar. => Pedido nuevo
- foco: o se elimina => 🗑 ELIMINAR => Eliminar

> Primero, los pedidos. Agregamos uno: un restaurante pide mil quinientas unidades de salsa BBQ de un litro para el sábado. En la misma tabla se cambia la cantidad, la fecha de entrega o la importancia de cualquier pedido, o se elimina.

### S03 · Qué llenadora hace cada producto
- imagen: capturas/04-llenadora-asignada.png
- foco: para asignarla => filler-pouch-02 asignada a Salsa BBQ 1.000 ml. => Llenadora asignada

> Segundo, qué llenadora hace cada producto. Basta arrastrar una llenadora sobre el producto para asignarla.

### S03b · Lo que no se puede
- imagen: capturas/05-rechazada.png
- foco: el sistema la rechaza => filler-sachet-02 no tiene formato de 1.000 ml: no puede llenar Salsa BBQ 1.000 ml. => Rechazada: otro formato
- foco: duplicando uno que ya existe => ⧉ DUPLICAR => Duplicar

> Si no tiene ese tamaño de envase, el sistema la rechaza: una llenadora de sachets de doscientos cincuenta mililitros no puede llenar un doypack de un litro. Aquí también se crea un producto nuevo duplicando uno que ya existe.

### S04 · La secuencia del planificador
- imagen: capturas/07-secuencia-movida.png
- foco: lo arrastramos a su llenadora => PED-D12-11 => En su llenadora
- foco: los indicadores cambian => PLAN MANUAL CON ESTE BORRADOR => Recalculado

> Tercero, la secuencia: en qué llenadora va cada pedido y en qué orden, como lo decidiría el planificador. El pedido nuevo está sin asignar: lo arrastramos a su llenadora y lo subimos en la fila. Arriba, los indicadores cambian en el momento.

### S05 · Guardar la versión
- imagen: capturas/08-guardada.png
- foco: como una versión con nombre => Versión «Semana 45 · pedido BBQ» guardada. => Versión guardada

> Por último, guardamos esta configuración como una versión con nombre.

### S05b · Las versiones
- imagen: capturas/09-versiones.png
- foco: se puede abrir => ABRIR => Abrir, usar o eliminar

> Cada versión es una foto completa de los datos, sin el historial de cambios, y se puede abrir, usar en la planta o eliminar.

### S05c · Usarla en la planta
- imagen: capturas/10-en-la-planta.png
- foco: trabajan con estos datos => DATOS · Semana 45 · pedido BBQ => Datos en uso

> Al usarla, el APS, el emulador, el centro de control y el gemelo 3D trabajan con estos datos. Para los escenarios volvemos a la cartera precargada.
