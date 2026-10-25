---
tipo: historico-ia
fuente: sesión de código pi (transcripción anterior compactada)
desde: 2026-10-25 01:00 UTC
hasta: 2026-10-25 06:10 UTC
tags: [registro, historico-ia, plc, fractal]
---
# Alineación del horizonte PLC→Fractal y repetición D78

## Mensajes recuperables del autor

**Autor — 2026-10-25, hora exacta no disponible (UTC):** «adelante».

**Autor — 2026-10-25 06:04 UTC:** «por favor commit push pr de lo que llevamos».

La transcripción de los mensajes anteriores a la compactación no está disponible literalmente. El resumen de contexto conservado decía: repetir el replay D78 de 24 h con alineación absoluta de perfiles/horas; revisar niveles, presiones y ciclos; optimización deshabilitada; todavía no implementar los escenarios de PRS configurables hasta registrar este estado.

## Trabajo del asistente

- Consultó el log del replay alineado: 24 marcas t=3600…86400, 92/91 eventos de arranque/parada, 46 arranques y 46/45 paradas, duración 2032,79 s reales.
- Analizó los resultados; suministro al final 53,93702 % PLC vs 87,963 % Fractal (+34,02598 puntos porcentuales, +1,322930 m³), retornos con diferencias −29,72591/−28,69322 pp. La cobertura fue t=30…86400 (86.370 s simulados, 24 fronteras horarias), no 24 h relativas al snapshot. Las presiones mínimas en marcas horarias fueron 15,45/15,44824 mca, sin desacuerdos respecto a 15 mca; esto no prueba presión continua. Niveles quedan sin validar.
- Guardó JSON y CSV de la corrida alineada, corrigió enlaces y redacción que todavía presentaban la primera corrida temporalmente desfasada como comparable, y preparó registro de bitácora.
- Ejecutó 27 pruebas dirigidas de estudios/solver y Ruff; todas pasaron.
- Detectó que la rama antigua parte de un commit anterior a PR #80/#81; creó `feat/d78-aligned-replay` desde `origin/main` y trasladó los cinco commits pendientes de D75–D78. Integró cambios de bitácora conservando las entradas recientes de main.
- El escenario PRS de entrada/salida configurables no se implementó en este cambio; permanece como trabajo siguiente, sin atribuir un control inventado al PLC Grundfos ni a la PRV.

## Herramientas

Inspección y análisis del replay JSON/CSV; pytest y Ruff; Git fetch, cherry-pick sobre `origin/main`, resolución de conflictos de bitácora. No se aplicaron mandos PLC.

## Respuesta final del asistente

Pendiente de registrar en el histórico final una vez creado el commit y el PR.
