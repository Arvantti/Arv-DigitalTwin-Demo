# Fileteadora industrial de 4 hilos

Puesto de overlock de dos agujas/cuatro hilos atendido por una operaria. Procesa una pieza por ciclo SAM configurable, retiene WIP en cola finita y respeta bloqueo de salida. La geometría incorpora cuchilla, áncoras/loopers, alimentación diferencial y conos de hilo; animaciones salen exclusivamente de canales publicados.

- Preset base: 45 s por unidad, 5.500 puntadas/min máximas referenciadas; parámetros no equivalen a prendas/min.
- Fallas: rotura de hilo y aguja; frecuencia y reparación son supuestos.
- Limitaciones: sin modelar tensión, diferencial, corte de cuchilla ni rechazo de calidad; ver `FICHA.md`.
