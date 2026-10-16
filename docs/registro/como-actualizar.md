---
tipo: procedimiento
tags: [registro, procedimiento]
---
# Cómo mantener este registro

Regla del autor: **todo cambio al repositorio actualiza la bitácora y el histórico** en el mismo pull request. Índice: [[00-indice]].

## En cada pull request
1. Agrega una entrada **al inicio** de la tabla y de la sección de detalle de [[bitacora]], copiando [[plantilla-entrada]]. Incluye fecha UTC, PR, commits, qué se hizo, qué pidió el autor y cómo se verificó.
2. Si se tomó una decisión nueva o una regla del autor, anótala en [[decisiones]] (una sección por decisión, con fecha y motivo).
3. Si el plan cambió, actualiza el estado de la fase en [[plan-del-proyecto]] (y `docs/roadmap.md`, que es la versión técnica).
4. Guarda la conversación con la IA que originó el cambio:
   - Sesión de código: nueva nota `historico/sesion-codigo/<fecha>-<tema>.md` con frontmatter (`tipo: historico-ia`, `fuente`, `desde`, `hasta`, `tags`) y enlázala en [[historico-sesion-codigo]].
   - Chat del proyecto (hilos): agrega el hilo a [[historico-proyecto]].
   - Formato: autor y fecha-hora UTC por mensaje, texto completo del usuario y de la IA, herramientas resumidas en una línea.
5. **Nunca** incluyas tokens, contraseñas, claves de API ni enlaces con credenciales (por ejemplo `mcp_token=` en URLs). Reemplázalos por `[REDACTADO]`. Antes de abrir el PR: `grep -rEn "token|password|secret|api[_-]?key|ghp_|sk-" docs/registro`.

## Convenciones de Obsidian
- Frontmatter YAML al inicio de cada nota con `tipo` y `tags`.
- Enlaces entre notas con `[[nombre-de-la-nota]]` (nombre del archivo sin `.md`; los nombres son únicos en la bóveda).
- Etiquetas: `#registro` en todo; además `#bitacora`, `#decision`, `#historico-ia`, `#plan`.
- Fechas en ISO (`2026-10-16`) y horas en UTC.
