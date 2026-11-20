# 2026-11-19 · Desglose de latencia del Durable Object

## Evidencia
Con el despliegue del PR #229, se hizo un solo POST con PDD-RCA-01, objetivo ×60, horizonte y paso de 1 h. La HMI recibió HTTP 502 por timeout. Del egreso de Fractal a la entrada al Worker pasaron 31 ms; la llamada Worker → Durable Object duró 56.122 ms y devolvió 409. El emulador midió 32,4 ms de consulta y rechazó `session_not_running` cerca del momento de pausar, sin crear manifiestos ni ejecuciones. El 409 tardío no explica el timeout original. No se recuperaron las marcas del Durable Object en el tail; el panel histórico de Cloudflare tampoco las mostró al consultar 04:24–04:29 UTC y cargar más eventos (el panel advierte que los resultados pueden estar incompletos).

## Cambio
Para respuestas HTTP del POST de manifiesto, el Durable Object devuelve por cabecera interna su marca de entrada y las duraciones de disponibilidad, inactividad y TCP. El Worker valida los campos numéricos, registra el desglose y quita la cabecera antes de responder. No se transportan IDs, cuerpos ni credenciales en esa telemetría. La marca absoluta se compara con el inicio de la llamada del Worker teniendo en cuenta el posible desfase de relojes. El tiempo TCP incluye espera hasta recibir la respuesta del emulador; no mide solo tránsito de red. No se altera el timeout, ni la autorización, ni el estado o cuerpo de respuesta. Cuando no hay respuesta HTTP, el registro local del Durable Object sigue siendo la fuente de los tiempos parciales.

## Validación
Typecheck y 35 pruebas del Worker. La prueba del proxy verifica 409, cuerpo intacto, tiempos visibles en el Worker, cabecera ausente hacia el cliente, sanitización y ruta de salud silenciosa. Sin nuevo despliegue ni reintento remoto.
