# PLC Master: organización y reproducción de resultados

## Recorrido del operador

- **Simulación**: 01 Escenario, 02 Emulación PLC, 03 Cosimulador, 04 Fractal y 05 Revisión. Cosimulador proyecta el perfil activo; Fractal conserva las opciones de evaluación y optimización. Ningún resultado se aplica automáticamente.
- **Estudios y comparación**: biblioteca, tiempos de referencia y comparación de resultados guardados.
- **Editar escenarios**: curva horaria y ajustes avanzados; editar no envía mandos instantáneos.
- **Día 24 h / Tendencias / Historial**: consulta con estados vacíos explícitos cuando no hay una serie registrada.
- **Operación en vivo**: tanques, bombas, regulación y red. Una sesión detenida muestra su última instantánea y mantiene los mandos deshabilitados.

## Reproducción y gauges

Consultar un instante en el PLC no abre automáticamente el 3D. Las acciones «Ver instante en 3D» y «Reproducir en 3D» son explícitas. Comparación y panel flotante comparten cálculo, instante, fuente y reproducción a 1/2/4 horas simuladas por segundo, separada de la velocidad de emulación.

Los gauges de histórico y estudio individual usan los datos de su instantánea/resultado y señalan su contexto. La vivienda mínima se identifica entre las presiones residenciales disponibles, sin asumir C44. La reproducción del estudio utiliza muestras guardadas, sin interpolar lecturas.

El panel flotante aparece abajo a la izquierda; se mueve por el encabezado y se redimensiona por bordes/esquinas. Los gauges se arrastran por el título, conservan posición durante la reproducción y mantienen líneas hacia el equipo. Doble clic restablece posición automática. Las posiciones automáticas buscan espacio libre próximo al equipo sin cubrir paneles. Un viewport muy compacto puede requerir reubicación manual.

## Integridad del cálculo

Las muestras históricas conservan el perfil activo en su propio instante. Su identificador debe ser verificable y coincidir con los tags históricos; el hash de historia sigue validándose. El perfil futuro y la instantánea de comparación no se relabelan.

Las aperturas VRP publicadas por la optimización coinciden en comandos, tags, variables y animación del frame; la entrada permanece inmutable.

## Verificación de esta revisión

- 68 pruebas Python de Fractal Engineering/adaptador de agua; Ruff de los módulos modificados.
- Typecheck y build de Gallery.
- Auditoría Playwright local de siete pestañas en cuatro anchos, incluidos desplegables.
- Pruebas de revisión temporal, reproducción acelerada y coordinación PLC/3D en ensayo aislado.
- Inspección visual en localhost: seis gauges del estudio, seis líneas y sin cruces con los paneles en el viewport examinado. Esto no certifica toda combinación de cámara y viewport.

Las bases de ensayo, capturas y ejecutores particulares permanecen fuera del PR. No se incluyen voces ni videos como entrega de esta revisión.
