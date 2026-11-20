# 2026-11-18 · Observabilidad acotada del manifiesto PLC

- Tras desplegar #226 se reanudó PDD-RCA-01 a ×60 y se ejecutó una prueba remota de 1 h y paso de 1 h con autorización. Fractal devolvió timeout; el Worker registró HTTP 409 en 47,6 s. D1 siguió sin manifiestos ni ejecuciones para la sesión. Se devolvió la sesión a pausa.
- La versión desplegada no declara observabilidad en Fractal ni Acueducto. Las muestras posteriores a reanudar muestran dos bombas activas, salida PRS ≥21,63 mca y consistencia del perfil; no demuestran el estado exacto al procesarse la petición.
- Se habilita captura solo en esos dos contenedores y se deshabilita el access log de Uvicorn en su arranque Cloudflare para evitar registrar las rutas de sesión. Se añaden códigos de rechazo fijos y tiempos de carga de sesión/perfil; se conservan los estados y mensajes HTTP. Los mensajes nuevos no incluyen identificadores, cuerpos ni credenciales.
- Validación local: Ruff, 18 pruebas Python, typecheck y 32 pruebas del Worker. No se desplegó el cambio ni se reintentó la prueba. Tras autorización separada, consultar los logs de ambos contenedores filtrando por `comparison_manifest` durante un único intento corto.
