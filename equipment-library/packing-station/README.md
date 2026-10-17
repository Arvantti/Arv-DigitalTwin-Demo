# packing-station

Estación de empaque manual con mesa, caja, sellador, impresora de etiquetas y tarima. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Mesa de espera (`table_capacity_units`), ritmo del operario (`pack_rate_upm`), cambio de caja (`box_change_s`) y tarima de `boxes_per_pallet` cajas que se recoge si la salida está libre.
- Sin operario, sin cajas, con la tarima llena sin recoger o con una falla, la estación se detiene; cuando la mesa se llena deja de aceptar y bloquea la banda anterior.
- Entradas: `inflow_upm`, `operator_present`, `boxes_available`, `downstream_free`. Presets: `lids-250`, `buckets-20`, `cutlery-1000` y, para la planta de salsas, `sachet-1000ml-4`, `sachet-500ml-8` y `sachet-250ml-16` (parámetro `item_kind: sachet` dibuja bolsas planas).
- Decisión: la ficha 23 preveía un tipo combinado `workstation` (ensamble, tampografía, espumado y empaque); aquí el empaque es un tipo propio porque recibe de una banda y cuenta cajas y tarimas. Las demás estaciones siguen pendientes.
