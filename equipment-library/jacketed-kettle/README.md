# jacketed-kettle

Marmita de cocción con chaqueta de vapor y agitador de ancla (manufactura por procesos, batch). Visual V2 · comportamiento B3.

## Qué simula
- **Fases de batch tipo ISA-88**: `charge`, `heat`, `hold`, `cool`, `agitate`, `sample`, `discharge`, `wait`, enviadas con el comando `run_phases`.
- **Energía**: vapor saturado por la chaqueta (temperatura de saturación según presión, área mojada según nivel), agua de enfriamiento, pérdidas, evaporación y **ebullición a la presión local** (≈ 96 °C a 1.500 m): por encima, el calor sobrante evapora agua y concentra el producto.
- **Control**: PID sobre la válvula de vapor; consumo de vapor en kg/h y por batch.
- **Composición**: Brix (sólidos solubles), pH (curva empírica a partir de la acidez) y consistencia Bostwick (índice de espesantes), a partir de los ingredientes cargados.
- **Calidad**: la fase `sample` compara contra la especificación y registra `first_pass_in_spec`.
- **Fallas**: disparo del agitador, válvula de vapor pegada, deriva de la sonda de temperatura.

## Entradas del entorno
`steam_supply_bar` (de la caldera), `material_available`, `downstream_free`, `ingredient_temp_c`.

## Ingredientes conocidos
`agua`, `pasta_tomate[_NNbrix]`, `azucar`, `sal`, `vinagre`, `almidon_modificado`, `especias`, `conservante`. Uno desconocido se trata como agua; para agregar otro, edite `INGREDIENTS` en `behavior.py`.

## Escenarios
`tomato-sauce-batch` usa la receta del `plant.yaml` de la planta de salsas y verifica que cumpla Brix, pH y Bostwick.
