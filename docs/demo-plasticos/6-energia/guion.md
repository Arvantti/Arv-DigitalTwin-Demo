---
title: Guion · Menos energía
escenario: 6-energia
tags: [demo, plasticos, guion, fractal, energia]
modulos: [DigitalTwin, APS, CoSimulation, Fractal]
duracion_aprox: 2 min 30 s
cifras:
  - ["0,82 kWh/kg", "energía de la programación vigente, sin precios: solo kWh"]
  - ["33.741 → 23.876 kWh", "de AHORA al final del plan: calientes de noche frente a apagar y agrupar"]
  - ["65 → 49", "calentamientos en frío, sin atrasar más pedidos"]
ahorro:
  - ["Energía desde ahora", "33.741 kWh (calientes de noche)", "23.876 kWh", "9.865 kWh menos (29 %)"]
  - ["Frente a la vigente (ya se apaga)", "24.729 kWh", "23.876 kWh", "853 kWh menos"]
  - ["Calentamientos en frío", "65", "49", "16 menos"]
  - ["Pedidos tarde", "7", "7", "ninguno más"]
---

# Escenario 6 · Menos energía

Mensaje central: cada inyectora gasta según su física (catalog/energy.yaml sale de los modelos de la librería): produciendo, en espera caliente o apagada, y cada arranque en frío cuesta un calentamiento. La planta trabaja dos turnos (06:00 a 22:00, sin domingos). Solo se cuentan kWh, sin precios ni franjas. Fractal compara dejar las máquinas calientes de noche con apagarlas y agrupar la producción.

### S01 · La energía del plan
- imagen: capturas/01-propuesta-energia.png
- duración: 16 s
- en pantalla: la tarjeta Energía · kWh de la propuesta
- foco: la energía del plan => Energía · kWh => kWh y kWh por kilo

> Cada programación ya trae su energía. El cosimulador suma lo que gasta cada inyectora produciendo, esperando y calentando, más los servicios: chiller, secadores, compresor y vacío. Aquí no hay precios, solo kilovatios hora y kilovatios hora por kilo.

### S02 · Energía en vivo
- imagen: capturas/03-control-energia.png
- duración: 16 s
- en pantalla: el bloque ENERGÍA · AHORA y los kW de cada inyectora
- foco: los kilovatios de la planta => ENERGÍA · AHORA => kW de la planta frente al transformador

> En el centro de control se ve la potencia en este instante: cada inyectora con sus kilovatios, la planta frente al límite del transformador y la curva del día. Una inyectora que espera caliente sigue gastando; una apagada casi no gasta.

### S03 · Calcular con el objetivo energía
- imagen: capturas/06-objetivo-energia.png
- duración: 14 s
- en pantalla: la opción Mejorar consumo energético
- foco: el objetivo de energía => Mejorar consumo energético => Un objetivo por corrida

> Al calcular, el cosimulador pregunta un solo objetivo. Con energía, pone cada pieza en la inyectora que gasta menos y enciende menos días de máquina, porque cada día encendido cuesta un calentamiento en frío. Las entregas se respetan siempre.

### S04 · La pregunta a Fractal
- imagen: capturas/08-fractal-pregunta.png
- duración: 14 s
- en pantalla: la tarjeta 6 · MENOS ENERGÍA
- foco: Le preguntamos a Fractal => MENOS ENERGÍA => 6 · Menos energía

> La vigente gasta cerca de cincuenta y ocho mil kilovatios hora en la semana. Le preguntamos a Fractal: ¿apagar o dejar calientes las inyectoras de noche, y cómo agrupar la producción para gastar menos sin atrasar pedidos?

### S05 · La recomendación
- imagen: capturas/09-fractal.png
- duración: 26 s
- en pantalla: la recomendación y las tarjetas ENERGÍA DESDE AHORA y CALENTAMIENTOS EN FRÍO
- foco: Su recomendación => Apagar y agrupar la producción => Apagar y agrupar
- foco: casi diez mil kilovatios hora menos => 9.865 kWh menos => −29 % frente a calientes
- foco: Los pedidos tarde son los mismos => Pedidos tarde + 7 => Ninguno más tarde

> En unos segundos compara tres opciones. Dejar las máquinas calientes de noche ahorra calentamientos, pero gasta casi treinta y cuatro mil kilovatios hora de aquí al final del plan. Apagarlas fuera de turno y agrupar la producción gasta veintitrés mil ochocientos: casi diez mil menos, un veintinueve por ciento. Los calentamientos bajan de sesenta y cinco a cuarenta y nueve, y los pedidos tarde son los mismos. A cambio hay unos cambios de referencia más: Fractal lo muestra para que la persona decida.

### S06 · El plan adoptado en la planta
- imagen: capturas/10-control-adoptado.png
- duración: 14 s
- en pantalla: el bloque ENERGÍA · AHORA y las inyectoras sin orden en casi cero kW
- foco: las máquinas sin orden => SIN ORDEN => Apagadas: casi 0 kW

> Adoptamos la recomendación. En el centro de control, las inyectoras sin orden quedan apagadas, casi en cero, y la planta trabaja muy por debajo del límite del transformador.

### S07 · El ahorro potencial
- imagen: capturas/09-fractal.png
- duración: 20 s
- en pantalla: la recomendación y la columna ENERGÍA DESDE AHORA
- foco: veintinueve por ciento => 9.865 kWh menos => 33.741 → 23.876 kWh (−29 %)

> Este es el ahorro: apagar fuera de turno y agrupar la producción gasta un veintinueve por ciento menos que dejar las inyectoras calientes de noche, y dieciséis calentamientos en frío menos que la vigente, sin atrasar ningún pedido. Todo sale del modelo físico de cada máquina, no de un número fijo en el programa.
