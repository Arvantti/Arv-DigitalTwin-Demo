---
tipo: evidencia
tags: [registro, acueducto]
---
# Flujo de la planta de acueducto: qué está conectado y qué no

Fuente: `industrial-models/water-network-scale-v1/plant.yaml` (flujos y rutas), `simulation.yaml` (enlaces del motor) y `apps/gallery/src/plant.ts` (escena). Describe lo que queda en `main` cuando se fusione el PR de esta revisión; lo que cambia respecto a antes está marcado.

## La secuencia que quieres (la real)

1. Los **tanques de recirculación** (piso 0) reciben el agua que sale de las casas por las canaletas y las bajantes.
2. Las **bombas de recirculación** (piso 0, 1 trabaja y 1 de reserva) la suben al **tanque de bombeo** (piso 1).
3. Las **bombas Grundfos** (2, las dos de trabajo) toman del tanque de bombeo y entregan mínimo 70 mca.
4. La **estación reguladora** (rama automática o manual) baja la presión hasta dejar la casa crítica en 15,45 mca.
5. El agua baja 1 m y entra al **nivel 1** de la rejilla; de ahí sube por la columna, pasando por una **válvula de regulación entre niveles**, a los niveles 2, 3 y 4 (cada uno 1,20 m más arriba).
6. Cada casa (y cada fuga) descarga a su canaleta, la bajante baja y el agua vuelve al paso 1.

## Qué está conectado en el motor (simulado, una sola red hidráulica)

| Tramo | Estado |
|---|---|
| Tanques de recirculación → bombas de recirculación | Conectado: dos tubos de 3", resueltos por la red; las bombas arrancan por nivel (60 % de los tanques de retorno) |
| Bombas de recirculación → tanque de bombeo | Conectado: tubo de 3"; paran cuando el tanque de bombeo llega a 90 % |
| Tanque de bombeo → bombas Grundfos | Conectado: tubo de 4" |
| Bombas Grundfos → estación reguladora | Conectado: tubo de 4" que sube 1 m; el motor lee la presión del sensor de descarga y mantiene 72,1 mca |
| Estación reguladora → nivel 1 | Conectado: tubo de 4" que baja 1 m |
| Nivel 1 → válvula entre niveles → nivel 2 → … → nivel 4 | Conectado en serie: tubos de 2" y tres válvulas con su apertura, caída de presión y caudal |
| Telemetría de las casas → estación | Conectado: el motor entrega a la estación la presión más baja de las 4 rejillas (la casa crítica se calcula en cada corrida) |
| Niveles de tanques → bombas de recirculación | Conectado (señales) |
| Bajantes de las canaletas → tanques de recirculación | Conectado por enlaces del motor (caudal que cae de cada nivel), con tubo propio en la escena |

**Panel LÍNEAS (arreglado en esta revisión):** estaba vacío porque el plano no definía líneas. Ahora muestra dos: *Red de distribución* (volumen que bombean las Grundfos, en m³ y m³/h) y *Recirculación* (volumen que devuelven las bombas de retorno).

## Qué se arregló en la escena (tubos sueltos de tu captura)

- **Válvulas entre niveles:** los tubos pasaban por el medio del cuerpo y las bridas de los lados quedaban abiertas. Ahora la columna entra por la brida oeste de cada válvula y sale por la brida este hacia la toma del nivel siguiente.
- **Estación reguladora:** el tubo de llegada y el de salida estaban 0,15 m más bajos y ~0,2 m separados de sus bridas, y por eso el extremo con manómetro quedaba abierto. Las rutas ahora empiezan y terminan en las bridas reales.
- **Tanques de recirculación y de bombeo:** el codo blanco de la tapa (boquilla de entrada) y la salida inferior quedaban al aire. Las bajantes y el retorno llegan ahora a la boquilla de entrada; la succión sale de la boquilla inferior hasta el colector de las bombas.
- **Bombas:** los colectores de succión y descarga terminaban abiertos al este; ahora reciben el tubo.

## Qué NO está conectado o es solo ilustrativo

- **Cotas de los tubos:** el motor usa la longitud y el diámetro de cada ruta (y las elevaciones declaradas de cada rejilla: 0; 1,2; 2,4; 3,6 m), no la cota de cada punto del trazado 3D. El trazado dibuja el recorrido físico.
- **Bajante del nivel 1:** desagua a 2,5 m, pero la boquilla de entrada del tanque de recirculación está a 3,25 m (los tanques de 1,70 m con patas y fondos miden 2,9 m y sobresalen del piso 1). Es una simplificación del dibujo; para que fuera real hay que bajar los tanques o poner una bomba de sumidero. Los niveles 2 a 4 sí caen por gravedad.
- **Tubería de las bajantes:** el motor no calcula pérdidas en ellas (no son red a presión); la escena las dibuja con el caudal de los enlaces.
- **Tubos de recirculación:** las rutas son de recorrido (suben a la cota de la boquilla del tanque de bombeo, 6,4 m); no son un diseño de detalle.
- **Casas y fugas:** cada válvula de consumo y de fuga es del motor (apertura y Kv), pero su descarga a la canaleta es una animación del chorro; el agua no se mide por casa fuera de las rejillas.
- **PLC propio de las Grundfos:** es cerrado; el gemelo ve solo el sensor de descarga (72,1 mca de consigna supuesta).
- **Sensores en vivo en el panel PLC (/acueducto.html):** sigue leyendo el día simulado de `public/data/acueducto-dia.json`; falta conectarlo a la API en vivo del motor.
- **OPC UA / MCP:** la interfaz para crear escenarios conversando con Claude y la comunicación OPC UA con el PLC no existen todavía; los escenarios del archivo son solo pruebas de la planta.

## Siguiente paso propuesto

1. Decidir qué hacer con los tanques de recirculación (bajarlos o permitir que atraviesen el piso 1) para que el nivel 1 también desagüe por gravedad.
2. Agregar puertos de conexión por tipo de equipo (boquillas) para que las rutas se calculen en vez de escribirse a mano (propuesta del informe de inspección).
3. Conectar los sensores del panel PLC a la API en vivo.
