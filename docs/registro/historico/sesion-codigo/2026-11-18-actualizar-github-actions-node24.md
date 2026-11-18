# Actualizar GitHub Actions a runtime Node 24

Se atendió el aviso de Pages: `pnpm/action-setup@v4` y `astral-sh/setup-uv@v6` declaraban Node 20 y GitHub los estaba forzando a Node 24. No indicaba que la Gallery compilara con Node 20; el proyecto usa Node 26.12.1 (`.node-version`) y Pages ya había desplegado exitosamente bajo la transición del runner. Para retirar la dependencia de compatibilidad, se actualizaron todos los workflows: pnpm setup a v6, uv setup a v10.3.3; el workflow manual del Acueducto también usa checkout/setup-node v5 en lugar de v4. La metadata publicada de los releases confirma que las acciones nuevas usan Node 24 y conservan las entradas empleadas.

CI del PR verificará los workflows Python/web. Sin cambios de dependencias de la aplicación, configuración Cloudflare, secrets ni despliegues de Workers.
