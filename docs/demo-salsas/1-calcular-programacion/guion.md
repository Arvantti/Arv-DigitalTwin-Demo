---
title: Guion · Calcular la programación
escenario: 1-calcular-programacion
tags: [demo, salsas, guion, aps, cosimulador]
duracion_aprox: 2,5 min
---

# Escenario 1 · Calcular la programación

Mensaje central: desde AHORA, sin mover lo que ya se hizo, el cosimulador entrega en una décima de segundo un plan que
salva los pedidos que todavía se podían salvar, lava menos por alérgeno y bota tres toneladas menos de salsa.

### S01 · El plan manual en el Gantt
- imagen: capturas/01-gantt-manual.png
- foco: una barra por tanda => T021 => Una barra = una tanda
- foco: rojo es un CIP por alérgeno => CIP por alérgeno => Rojo: CIP por alérgeno
- foco: celeste un CIP de rutina => CIP => Celeste: CIP
- foco: violeta un cambio de receta => receta => Violeta: cambio de receta

> La programación vigente la hizo el planificador a mano, por orden de llegada. Así se ve en el Gantt, el diagrama de barras en el tiempo: una fila por equipo y una barra por tanda o por llenado. El rayado al comienzo de cada barra es el cambio: rojo es un CIP por alérgeno, celeste un CIP de rutina, violeta un cambio de receta.

### S02 · Lo que cuesta el plan manual
- imagen: capturas/00-pedidos-manual.png
- foco: nueve pedidos llegan tarde => — => 9 pedidos tarde
- foco: doscientas cuarenta y cuatro horas => — => 244 h de atraso
- foco: lava ochenta y siete horas => — => 87 h de CIP
- foco: ocho mil ochocientos setenta y cuatro kilos => — => 8.874 kg de merma

> Con este plan, nueve pedidos llegan tarde, con doscientas cuarenta y cuatro horas de atraso. La planta lava ochenta y siete horas, diez de esos lavados por alérgeno, y bota ocho mil ochocientos setenta y cuatro kilos de salsa vencida.

### S03 · Calcular con el cosimulador
- imagen: capturas/03-propuesta.png
- foco: Tarda menos de un segundo => HiGHS Optimal => Menos de un segundo

> Ahora pulsamos calcular. El cosimulador es el gemelo que simula la planta: replanea desde ahora, sin mover lo que ya se hizo, respetando el orden de recetas, los alérgenos y el tiempo de espera de cada salsa. Tarda menos de un segundo.

### S04 · La propuesta
- imagen: capturas/03-propuesta.png
- foco: pasamos a tres => Pedidos tarde + 3 => 9 → 3 pedidos tarde
- foco: El atraso baja => Atraso total + 83,9 h => 244 → 84 h de atraso
- foco: la merma baja => Merma de granel + 5.722 kg => 8.874 → 5.722 kg

> El resultado: de nueve pedidos tarde pasamos a tres, y esos tres ya habían salido tarde antes de hoy. El atraso baja de doscientas cuarenta y cuatro a ochenta y cuatro horas. Hay cuatro lavados por alérgeno menos, y la merma baja a cinco mil setecientos veintidós kilos: más de tres toneladas de salsa que ya no se botan.

### S05 · Adoptarla y verla en la planta
- orbita: orbitas/05-play
- imagen: capturas/05c-centro-control.png
- foco: el centro de control mide el OEE => OEE => OEE = disponibilidad × rendimiento × calidad

> Al aprobarla, pasa a ser la programación vigente y la planta la sigue: el gemelo 3D muestra en cada equipo qué tanda corre o qué está lavando, y el centro de control mide el OEE de cada uno, la eficiencia general del equipo: disponibilidad por rendimiento por calidad.
