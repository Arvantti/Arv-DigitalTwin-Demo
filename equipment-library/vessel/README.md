# vessel

Familia paramétrica de recipientes: silos de sólidos, tanques de almacenamiento, tanques pulmón con chaqueta y tanques con agitador. Visual V2 · comportamiento B3.

## Qué simula
- **Balance de masa** con caudales de entrada y salida limitados por capacidad y disponibilidad (nunca rebosa ni queda negativo).
- **Estados**: `starved` (se pide descarga y está vacío), `blocked` (se pide llenado y está lleno), `cleaning` (CIP).
- **Temperatura** de mezcla perfecta, con chaqueta controlada por PID (`jacketed`) y pérdidas al ambiente.
- **Alarmas** de nivel bajo y alto por flanco.
- **Fallas**: transmisor de nivel congelado (la lectura deja de cambiar, la masa real sí), válvula de descarga, disparo del agitador.

## Presets
`resin-silo-40t`, `oil-tank-30m3`, `hot-buffer-3000l`, `cold-buffer-3000l`.

## Dimensiones
`vessel_dimensions()` en `behavior.py` es la misma regla que usa la geometría (H/D = 1,5 en tanques y 2,5 en silos si no se fija el diámetro).
