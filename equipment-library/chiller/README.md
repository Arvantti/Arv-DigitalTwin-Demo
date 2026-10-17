# chiller

Enfriador de agua por aire con banco de hielo opcional. Visual V2 · comportamiento B3. Ver `FICHA.md`.

- Lazo perfectamente mezclado: `C · dT/dt = carga − frío de compresores − frío del hielo`, con `C = loop_m3 × 4.186 kJ/K`.
- Etapas iguales que suben o bajan de a una con banda muerta y `min_stage_s` entre cambios. COP según la temperatura de suministro.
- Banco de hielo (`storage_kwh > 0`): cubre el déficit (hasta la mitad de su capacidad por hora) y se recarga con el sobrante.
- Entradas: `load_kw` (None = `nominal_load_kw`), `power_available`. En una planta, el puerto `chilled_water` ofrece `supply_temp_c` y recibe la suma de `cooling_load_kw` de las inyectoras.
