/**
 * Contratos JSON del cosimulador, comunes a todas las plantas (esquemas en platform/cosim-core/schemas/).
 *
 * Versión de plataforma: no nombra ninguna planta. Cada planta en plants/<planta>/cosim/ importa estos tipos y
 * agrega su modelo (máquinas, recetas, moldes) y su programa lineal.
 *
 * `production-plan.v1` es el mismo formato que ya devuelve `/api/schedules/{planta}` (pedidos, filas de
 * programación, paradas y uso de equipos), con la cabecera del plan: de dónde salió y si es la vigente.
 */

export type Importance = "alta" | "normal" | "baja";

/** Un pedido del cliente (`customer-orders.v1`). Fechas ISO con la zona de la planta. */
export interface CustomerOrder {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  unit?: string;
  color?: string;
  due: string;
  created: string;
  importance: Importance;
  /** Agregado a mano en la pantalla de pedidos. */
  added?: boolean;
}

export interface CustomerOrders {
  contract: "customer-orders.v1";
  plant: string;
  portfolio_id: string;
  timezone: string;
  /** Inicio de la programación de esta cartera (lunes 06:00). */
  plan_start: string;
  orders: CustomerOrder[];
}

export type PlanSource = "manual" | "solver" | "reference" | "fractal";

export interface PlanOrderRow {
  id: string;
  product: string;
  product_name: string;
  quantity: number;
  unit: string;
  customer: string;
  priority: number;
  importance: Importance;
  created: string;
  due: string;
  start: string;
  completion: string;
  late_h: number;
  color?: string;
  urgent?: boolean;
  added?: boolean;
  /** Unidades que el plan no alcanzó a programar en el horizonte. */
  unscheduled?: number;
}

/**
 * Qué manda en un cambio de referencia.
 * Inyección: montaje de molde, purga de resina o purga de color.
 * Alimentos: cambio de receta, cambio de formato en la llenadora, limpieza CIP o limpieza por alérgeno (CIP completo
 * con verificación).
 */
export type ChangeoverKind = "molde" | "resina" | "color" | "receta" | "formato" | "cip" | "alergeno";

export interface PlanScheduleRow {
  op: string;
  order: string;
  product: string;
  stage: string;
  equipment: string;
  start: string;
  end: string;
  quantity: number;
  unit: string;
  changeover_min: number;
  /** Qué manda en el cambio de referencia (ver ChangeoverKind). */
  changeover_kind?: ChangeoverKind;
  tooling?: string;
  color?: string;
  /** Lote [número, de cuántos] del trabajo (aps.yaml). */
  batch?: [number, number];
  /** Tamaño del lote de proceso que alimenta la fila (una marmita de receta compartida por varios pedidos). */
  batch_kg?: number;
  /** Lote de proceso compartido: filas de varios pedidos con el mismo id salen de la misma tanda. */
  batch_id?: string;
}

export interface PlanKpis {
  orders: number;
  on_time_pct: number;
  late_orders: number;
  /** Atraso total de los pedidos tarde, en horas. */
  tardiness_h: number;
  changeovers: number;
  changeover_h: number;
  /** Cambios que incluyen montaje de molde. */
  mold_changes?: number;
  /** Horas de limpieza CIP programadas. */
  cip_h?: number;
  /** Merma: producto perdido por cambios, purgas o tiempo de espera vencido. */
  waste_kg?: number;
  busiest: { equipment: string; busy_pct: number };
}

export interface ProductionPlan {
  contract: "production-plan.v1";
  plan_id: string;
  source: PlanSource;
  status: "vigente" | "propuesta" | "borrador";
  plant: string;
  portfolio_id: string;
  from: string;
  to: string;
  timezone: string;
  load_pct: number;
  calendar: { workdays: number[]; shifts: { name: string; start: string; end: string }[] };
  orders: PlanOrderRow[];
  schedule: PlanScheduleRow[];
  downtime: { equipment: string; start: string; end: string; reason: string }[];
  equipment: Record<string, { busy_pct: number; down_h: number }>;
  products: { id: string; name: string; unit: string; colors: string[] }[];
  kpis: PlanKpis;
  solver?: { status: string; seconds: number; variables: number; constraints: number; objective: number };
  /** Replaneado desde este instante: lo anterior quedó congelado. */
  frozen_until?: string;
  notes?: string[];
  /** Herramental con el que se calculó (máquina → molde o formato montado, o null si se desmontó). */
  molds?: Record<string, string | null>;
  /** Cambios a la cartera con los que se calculó (p. ej. un pedido adelantado). */
  order_changes?: { order: string; due?: string; importance?: Importance }[];
  /** Pedidos fijados por el planificador: sus lotes no se mueven al replanear; el resto se organiza alrededor. */
  fixed_orders?: string[];
}

/**
 * Evento de planta en tiempo real (`plant-event.v1`), lo emite el emulador: una máquina sale de servicio por falla o
 * paro de emergencia. El emulador no programa paradas futuras: `start` es siempre el instante en que ocurrió y
 * `est_end` la reparación estimada. El cosimulador lo trata como parada y replanea desde AHORA.
 */
export interface PlantEvent {
  contract: "plant-event.v1";
  id: string;
  plant: string;
  equipment: string;
  kind: "falla" | "paro-emergencia";
  reason: string;
  start: string;
  est_end: string;
  /** Cuándo volvió a servicio; mientras no tenga, sigue fuera de servicio. */
  cleared?: string;
}

/** Parada que decide el planificador o Fractal desde AHORA (por ejemplo, montar un molde en otra máquina). */
export interface PlannedStop {
  equipment: string;
  start: string;
  end: string;
  reason: string;
}

/** Secuencia escrita por el planificador (`manual-sequence.v1`): por máquina, los pedidos en el orden en que se hacen. */
export interface ManualSequence {
  contract: "manual-sequence.v1";
  plan_id: string;
  plant: string;
  portfolio_id: string;
  author: string;
  note?: string;
  sequence: Record<string, string[]>;
}
