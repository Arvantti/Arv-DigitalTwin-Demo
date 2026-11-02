# Colector T de drenaje

Componente pasivo del Acueducto a escala: suma el caudal de las cuatro bajantes de los pisos y entrega el caudal total a dos ramas que descargan a los tanques de recirculación.

- La conexión común y la T se muestran en `industrial-models/water-network-scale-v1/plant.yaml`: el tronco cae verticalmente al centro, los tanques enfrentan sus entradas superiores a los extremos de la T y las salidas inferiores miran hacia afuera.
- `tank_1_share` configura el reparto; 0,5 (50/50) es un supuesto simétrico, no una curva hidráulica calibrada.
- `balance_error_kg_h` publica la conservación de caudal. Debe ser cero.
- No modela llenado de tubería, remanso, pérdida de carga ni cruce entre las entradas de los tanques. Requiere diámetros, longitudes, pendientes y cotas para subir a fidelidad hidráulica.
