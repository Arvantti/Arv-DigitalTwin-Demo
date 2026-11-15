/**
 * Energía de un plan de plásticos, en kWh y sin precio, a partir de catalog/energy.yaml.
 *
 * Los kW de cada inyectora con cada molde los midió el modelo físico de la librería (tools/energy/). Aquí solo se
 * cuenta cuánto tiempo pasa cada máquina en cada estado según la programación:
 *  - produciendo: los minutos de turno de cada fila después de su cambio de referencia, a run_kw;
 *  - espera caliente: el cambio de molde o la purga, y los huecos entre lotes del mismo día, a standby_kw;
 *  - calentamiento: antes del primer lote de cada día, heatup_min minutos que suman heatup_kwh (fuera de turno la
 *    máquina se apaga; con `overnight: "caliente"` se queda en espera caliente y solo calienta el primer día);
 *  - apagada: el resto, a off_kw.
 * Los servicios piden nominal_kw × (idle_fraction + (1 − idle_fraction) × fracción de producción) mientras alguna de
 * las inyectoras que atienden está encendida. La demanda pico es la mayor potencia media de 15 minutos.
 * La celda de ensamble no tiene datos de energía y no suma.
 */
import type { PlanEnergy, ProductionPlan } from "../../core/contracts.ts";
import { DAY_MIN, iso, parseLocal, rng } from "../../core/time.ts";
import type { PlasticsModel } from "./model.ts";

export interface EnergyProfile {
  run_kw: number;
  standby_kw: number;
  off_kw: number;
  heatup_min: number;
  heatup_kwh: number;
  kwh_per_kg?: number | null;
  /** Pico de la inyección y variación de la media de cada minuto produciendo (% de run_kw). */
  run_peak_kw?: number;
  run_sd_pct?: number;
  /** Potencia al encender en frío. */
  heatup_peak_kw?: number;
}
export interface EnergyTransformer {
  id: string;
  rating_kva?: number;
  power_factor?: number;
  limit_kw: number;
}
export interface EnergyService {
  name?: string;
  nominal_kw: number;
  idle_fraction: number;
  feeds?: string[];
}
export interface EnergyYaml {
  policy?: { off_outside_shifts?: boolean; preheat?: string };
  injection: Record<string, Record<string, EnergyProfile>>;
  services?: Record<string, EnergyService>;
  transformer?: EnergyTransformer;
}
/** Lo que el modelo de la planta guarda para calcular la energía. */
export interface EnergyData {
  injection: EnergyYaml["injection"];
  services: Record<string, EnergyService>;
  transformer?: EnergyTransformer;
  overnight: "apagar" | "caliente";
  /** Kilos de una pieza de cada molde y resina del molde. */
  partKg: Record<string, number>;
  resin: Record<string, string | undefined>;
}

export type Overnight = PlanEnergy["overnight"];
const BUCKET = 15;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Intervalo de una máquina: estado, molde y kW. */
export interface Span {
  a: number;
  b: number;
  kind: "run" | "standby" | "heatup";
  mold: string;
}

/** Tramos de turno de una fila: los minutos de trabajo entre start y end (el despacho salta noches y domingos). */
function workSpans(model: PlasticsModel, a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = Math.floor(a / DAY_MIN) * DAY_MIN; d < b; d += DAY_MIN) {
    if (!model.calendar.isWorkday(d)) continue;
    for (const [s, e] of model.calendar.spans) {
      const x = Math.max(a, d + s);
      const y = Math.min(b, d + e);
      if (y > x) out.push([x, y]);
    }
  }
  return out;
}

type PlanLike = Pick<ProductionPlan, "from" | "to" | "schedule" | "timezone"> & { energy?: Pick<PlanEnergy, "overnight"> };

/**
 * Energía de un plan. `overnight` decide qué hacen las inyectoras fuera de turno; por defecto, lo que dice
 * energy.yaml (apagarlas). Devuelve undefined si la planta no tiene datos de energía.
 */
export function planEnergy(model: PlasticsModel, plan: PlanLike, overnight?: Overnight): PlanEnergy | undefined {
  return energyCurves(model, plan, overnight)?.energy;
}

/** kWh de cada equipo en cada día (minutos locales de las 00:00), para la pestaña de insumos. */
export function energyByDay(model: PlasticsModel, plan: PlanLike, days: number[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const c = energyCurves(model, plan);
  if (!c) return out;
  for (const [id, arr] of Object.entries(c.curves)) {
    out.set(
      id,
      days.map((d) => {
        let s = 0;
        for (let i = Math.max(0, Math.floor((d - c.h0) / BUCKET)); i < Math.min(arr.length, Math.floor((d + DAY_MIN - c.h0) / BUCKET)); i++) s += arr[i];
        return s;
      }),
    );
  }
  return out;
}

/** kWh, calentamientos y pico de 15 min de un plan desde el instante `from` (minutos) hasta su fin. */
export function energyFrom(model: PlasticsModel, plan: PlanLike, from: number, overnight?: Overnight): { kwh: number; heatups: number; peak_kw: number; overnight: Overnight } | undefined {
  const c = energyCurves(model, plan, overnight);
  if (!c) return undefined;
  const i0 = Math.max(0, Math.floor((from - c.h0) / c.bucketMin));
  const n = Object.values(c.curves)[0]?.length ?? 0;
  let kwh = 0;
  let peak = 0;
  for (let i = i0; i < n; i++) {
    let tot = 0;
    for (const arr of Object.values(c.curves)) tot += arr[i];
    kwh += tot;
    peak = Math.max(peak, (tot * 60) / c.bucketMin);
  }
  const heatups = Object.values(c.spans).reduce((s, sp) => s + sp.filter((x) => x.kind === "heatup" && x.b > from).length, 0);
  return { kwh: Math.round(kwh), heatups, peak_kw: round1(peak), overnight: c.energy.overnight };
}

/** Energía y curvas de kWh cada 15 minutos por equipo (desde h0). */
export interface EnergyCurves {
  energy: PlanEnergy;
  h0: number;
  bucketMin: number;
  curves: Record<string, Float64Array>;
  /** Estados de cada inyectora en el tiempo (producción, espera caliente, calentamiento); fuera de ellos, apagada. */
  spans: Record<string, Span[]>;
  /** Molde con el que arranca cada inyectora (para los servicios que atienden una resina). */
  moldAt: Record<string, string>;
}

export function energyCurves(model: PlasticsModel, plan: PlanLike, overnight?: Overnight): EnergyCurves | undefined {
  const data = model.energy;
  if (!data) return undefined;
  // Lo que dice el plan (un escenario de Fractal puede dejarlas calientes de noche) o la política de energy.yaml.
  const mode = overnight ?? plan.energy?.overnight ?? data.overnight;
  const h0 = parseLocal(plan.from);
  const h1 = parseLocal(plan.to) + DAY_MIN;
  const n = Math.ceil((h1 - h0) / BUCKET);
  const total = new Float64Array(n);
  const byEq: Record<string, number> = {};
  const curves: Record<string, Float64Array> = {};
  const spansOut: Record<string, Span[]> = {};
  const add = (arr: Float64Array, a: number, b: number, kw: number) => {
    for (let t = Math.max(a, h0); t < Math.min(b, h1); ) {
      const i = Math.floor((t - h0) / BUCKET);
      const end = Math.min(b, h0 + (i + 1) * BUCKET);
      arr[i] += (kw * (end - t)) / 60;
      t = end;
    }
  };
  const out = { run: 0, standby: 0, heatup: 0, off: 0, services: 0, heatups: 0, kg: 0 };

  // Por inyectora: intervalos de producción y de cambio, día por día.
  const machines = Object.keys(data.injection);
  const runShare: Record<string, Float64Array> = {};
  const onShare: Record<string, Float64Array> = {};
  const moldAt: Record<string, string> = {};
  for (const m of machines) {
    const profiles = data.injection[m];
    const rows = plan.schedule.filter((r) => r.equipment === m && r.tooling).sort((x, y) => (x.start < y.start ? -1 : 1));
    const mounted = model.initialTooling[m] ?? model.mounted[m] ?? Object.keys(profiles)[0];
    const prof = (mold: string) => profiles[mold] ?? profiles[mounted] ?? Object.values(profiles)[0];
    moldAt[m] = rows[0]?.tooling ?? mounted;
    const spans: Span[] = [];
    for (const r of rows) {
      let change = r.changeover_min;
      for (const [a, b] of workSpans(model, parseLocal(r.start), parseLocal(r.end))) {
        const c = Math.min(change, b - a);
        if (c > 0) spans.push({ a, b: a + c, kind: "standby", mold: r.tooling! });
        if (b > a + c) spans.push({ a: a + c, b, kind: "run", mold: r.tooling! });
        change -= c;
      }
      out.kg += r.quantity * (data.partKg[r.tooling!] ?? 0);
    }
    spans.sort((x, y) => x.a - y.a);
    // Días con trabajo: encendida desde el primer intervalo hasta el último; huecos en espera caliente.
    const days = new Map<number, Span[]>();
    for (const s of spans) {
      const d = Math.floor(s.a / DAY_MIN) * DAY_MIN;
      if (!days.has(d)) days.set(d, []);
      days.get(d)!.push(s);
    }
    const full: Span[] = [];
    let prevEnd: number | undefined;
    for (const [, list] of [...days.entries()].sort((x, y) => x[0] - y[0])) {
      const first = list[0];
      const p = prof(first.mold);
      if (mode === "caliente" && prevEnd !== undefined) {
        full.push({ a: prevEnd, b: first.a, kind: "standby", mold: first.mold });
      } else {
        full.push({ a: first.a - p.heatup_min, b: first.a, kind: "heatup", mold: first.mold });
        out.heatups++;
      }
      let cur = first.a;
      for (const s of list) {
        if (s.a > cur) full.push({ a: cur, b: s.a, kind: "standby", mold: s.mold });
        full.push(s);
        cur = Math.max(cur, s.b);
      }
      prevEnd = cur;
    }
    spansOut[m] = full;
    const kwArr = new Float64Array(n);
    const run = (runShare[m] = new Float64Array(n));
    const on = (onShare[m] = new Float64Array(n));
    let onMin = 0;
    for (const s of full) {
      const p = prof(s.mold);
      const kw = s.kind === "run" ? p.run_kw : s.kind === "standby" ? p.standby_kw : (p.heatup_kwh * 60) / Math.max(1, p.heatup_min);
      add(kwArr, s.a, s.b, kw);
      add(on, s.a, s.b, 60 / BUCKET); // fracción del bucket encendida
      if (s.kind === "run") add(run, s.a, s.b, (60 / BUCKET) * p.run_kw);
      const kwh = (kw * (s.b - s.a)) / 60;
      if (s.kind === "run") out.run += kwh;
      else if (s.kind === "standby") out.standby += kwh;
      else out.heatup += kwh;
      onMin += s.b - s.a;
    }
    const offKwh = (prof(mounted).off_kw * Math.max(0, h1 - h0 - onMin)) / 60;
    out.off += offKwh;
    // Lo apagado se reparte parejo en el horizonte.
    let eqKwh = 0;
    for (let i = 0; i < n; i++) {
      kwArr[i] += offKwh / n;
      total[i] += kwArr[i];
      eqKwh += kwArr[i];
    }
    curves[m] = kwArr;
    byEq[m] = round1(eqKwh);
  }

  // Servicios: siguen la producción de las inyectoras que atienden.
  for (const [sid, svc] of Object.entries(data.services)) {
    const fed = machines.filter((m) => !svc.feeds?.length || svc.feeds.includes(data.resin[moldAt[m]] ?? ""));
    if (!fed.length) continue;
    const capacity = fed.reduce((s, m) => s + Math.max(...Object.values(data.injection[m]).map((p) => p.run_kw)), 0);
    const arr = new Float64Array(n);
    let kwh = 0;
    for (let i = 0; i < n; i++) {
      const onFrac = Math.min(1, Math.max(...fed.map((m) => onShare[m][i])));
      if (onFrac <= 0) continue;
      const prod = capacity ? Math.min(1, fed.reduce((s, m) => s + runShare[m][i], 0) / capacity) : 0;
      const e = (svc.nominal_kw * (svc.idle_fraction * onFrac + (1 - svc.idle_fraction) * prod) * BUCKET) / 60;
      arr[i] = e;
      kwh += e;
      total[i] += e;
    }
    out.services += kwh;
    curves[sid] = arr;
    byEq[sid] = round1(kwh);
  }

  let peak = 0;
  let peakI = 0;
  for (let i = 0; i < n; i++) {
    if (total[i] > peak) {
      peak = total[i];
      peakI = i;
    }
  }
  const kwh = out.run + out.standby + out.heatup + out.off + out.services;
  const energy: PlanEnergy = {
    kwh: Math.round(kwh),
    run_kwh: Math.round(out.run),
    standby_kwh: Math.round(out.standby),
    heatup_kwh: Math.round(out.heatup),
    off_kwh: Math.round(out.off),
    services_kwh: Math.round(out.services),
    heatups: out.heatups,
    kg: Math.round(out.kg),
    kwh_per_kg: out.kg ? Math.round((1000 * kwh) / out.kg) / 1000 : 0,
    peak_kw: round1((peak * 60) / BUCKET),
    peak_at: iso(h0 + peakI * BUCKET, plan.timezone),
    overnight: mode,
    by_equipment: byEq,
  };
  return { energy, h0, bucketMin: BUCKET, curves, spans: spansOut, moldAt };
}

// ------------------------------------------------------------------ potencia en vivo, con variación

export type PowerState = "run" | "standby" | "heatup" | "off";
export interface PowerNow {
  kw: number;
  state: PowerState;
}
export interface PlantPower {
  kw: number;
  machinesKw: number;
  servicesKw: number;
  byEq: Record<string, PowerNow>;
  limitKw?: number;
}

const memo = new WeakMap<object, EnergyCurves | null>();
function curvesOf(model: PlasticsModel, plan: PlanLike): EnergyCurves | undefined {
  if (!memo.has(plan)) memo.set(plan, energyCurves(model, plan) ?? null);
  return memo.get(plan) ?? undefined;
}

/** Ruido reproducible alrededor de 0 (suma de tres uniformes ≈ normal, desviación 1), por equipo y minuto. */
function noise(key: string): number {
  const r = rng(key);
  return (r() + r() + r() - 1.5) * 2;
}

/**
 * Potencia de una inyectora en el instante t (minutos locales): la del estado que trae la programación, con la
 * variación que midió el modelo físico (run_sd_pct de la media de cada minuto produciendo). `stopped`: la máquina está
 * fuera de servicio por una falla del emulador y se cuenta apagada.
 */
export function powerAt(model: PlasticsModel, plan: PlanLike, id: string, t: number, stopped = false): PowerNow {
  const c = curvesOf(model, plan);
  const profiles = model.energy?.injection[id];
  if (!c || !profiles) return { kw: 0, state: "off" };
  const minute = Math.floor(t);
  const span = stopped ? undefined : c.spans[id]?.find((s) => s.a <= t && t < s.b);
  const p = profiles[span?.mold ?? c.moldAt[id]] ?? Object.values(profiles)[0];
  if (!span) return { kw: p.off_kw, state: "off" };
  const z = noise(`${id}:${minute}`);
  if (span.kind === "run") return { kw: Math.max(0, p.run_kw * (1 + (z * (p.run_sd_pct ?? 0)) / 100)), state: "run" };
  if (span.kind === "standby") return { kw: Math.max(0, p.standby_kw * (1 + z * 0.01)), state: "standby" };
  // Calentamiento: arranca con las resistencias a tope y baja hacia la espera caliente al acercarse a la temperatura,
  // con la misma energía total del modelo (heatup_kwh).
  const f = (t - span.a) / Math.max(1, span.b - span.a);
  const avg = (p.heatup_kwh * 60) / Math.max(1, p.heatup_min);
  const peak = Math.max(avg, p.heatup_peak_kw ?? avg);
  const end = Math.max(0, 2 * avg - peak);
  return { kw: peak + (end - peak) * f, state: "heatup" };
}

/** Potencia de la planta en t: inyectoras y servicios, que siguen la producción del momento. */
export function plantPowerAt(model: PlasticsModel, plan: PlanLike, t: number, stopped: Set<string> = new Set()): PlantPower {
  const data = model.energy;
  const c = curvesOf(model, plan);
  const byEq: Record<string, PowerNow> = {};
  if (!data || !c) return { kw: 0, machinesKw: 0, servicesKw: 0, byEq };
  let machinesKw = 0;
  for (const m of Object.keys(data.injection)) {
    byEq[m] = powerAt(model, plan, m, t, stopped.has(m));
    machinesKw += byEq[m].kw;
  }
  let servicesKw = 0;
  for (const [sid, svc] of Object.entries(data.services)) {
    const fed = Object.keys(data.injection).filter((m) => !svc.feeds?.length || svc.feeds.includes(data.resin[c.moldAt[m]] ?? ""));
    if (!fed.length) continue;
    const cap = fed.reduce((s, m) => s + Math.max(...Object.values(data.injection[m]).map((p) => p.run_kw)), 0);
    const on = fed.some((m) => byEq[m].state !== "off");
    const prod = fed.reduce((s, m) => s + (byEq[m].state === "run" ? byEq[m].kw : 0), 0) / Math.max(1, cap);
    const kw = on ? svc.nominal_kw * (svc.idle_fraction + (1 - svc.idle_fraction) * Math.min(1, prod)) * (1 + noise(`${sid}:${Math.floor(t)}`) * 0.02) : 0;
    byEq[sid] = { kw: Math.max(0, kw), state: kw > 0 ? "run" : "off" };
    servicesKw += byEq[sid].kw;
  }
  return { kw: machinesKw + servicesKw, machinesKw, servicesKw, byEq, limitKw: data.transformer?.limit_kw };
}

/** Curva de potencia de la planta entre a y b (minutos), un punto cada `step` minutos. */
export function plantCurve(model: PlasticsModel, plan: PlanLike, a: number, b: number, step = 5, stoppedAt?: (t: number) => Set<string>): { t: number; kw: number }[] {
  const out: { t: number; kw: number }[] = [];
  for (let t = a; t <= b; t += step) out.push({ t, kw: plantPowerAt(model, plan, t, stoppedAt?.(t)).kw });
  return out;
}
