/**
 * Programación de producción en el panel lateral (fase E, docs/programacion.md).
 *
 * Pide a la API los pedidos inventados y su plan (`/api/schedules/{planta}`): por defecto el mes en curso hacia atrás
 * y 30 días hacia adelante, con el rango hacia atrás que escoja el usuario. Sin API (versión publicada) lee el
 * archivo estático que guarda el despliegue y recorta el mismo rango. El plan no depende de la hora: aquí se decide
 * con el reloj de la planta qué está hecho, en curso o programado.
 *
 * El pedido urgente se pide desde la tabla: la API replanea desde ahora en un escenario aparte, la tabla muestra qué
 * cambia y el usuario lo acepta (queda guardado en este navegador hasta la fase F) o lo descarta.
 */

import { stageName } from "./products.ts";

export interface PlanOrder {
  id: string;
  product: string;
  product_name: string;
  quantity: number;
  unit: string;
  customer: string;
  priority: number;
  created: string;
  due: string;
  start: string;
  completion: string;
  late_h: number;
  color?: string;
  hold?: { until: string; reason: string };
  urgent?: boolean;
}
export interface PlanRow {
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
  tooling?: string;
  color?: string;
  batch?: [number, number];
}
export interface PlanDoc {
  plant: string;
  from: string;
  to: string;
  timezone: string;
  load_pct: number;
  orders: PlanOrder[];
  schedule: PlanRow[];
  downtime: { equipment: string; start: string; end: string; reason: string }[];
  equipment: Record<string, { busy_pct: number; down_h: number }>;
  products: { id: string; name: string; unit: string; colors: string[] }[];
  impact?: { moved: number; newly_late: string[]; delayed: { order: string; delay_h: number }[]; urgent: { order: string; on_time: boolean; late_h: number }[] };
}
interface Op {
  op: string;
  order: PlanOrder;
  stage: string;
  product: string;
  equipment: string[];
  start: string;
  end: string;
  quantity: number;
  unit: string;
  batches: number;
  changeover_min: number;
  tooling?: string;
}
interface UrgentInput {
  product: string;
  quantity: number;
  due: string;
  color?: string;
  customer?: string;
}
interface Options {
  plantId: string;
  /** Selecciona un equipo en el HUD. */
  select: (id: string) => void;
  /** Resalta en el 3D la ruta de un producto. */
  showProduct?: (id: string) => void;
}

const BACK_OPTIONS: [string, string][] = [
  ["month", "Mes en curso"],
  ["7d", "Últimos 7 días"],
  ["30d", "Últimos 30 días"],
  ["90d", "Últimos 90 días"],
];
const FILTERS: [string, string][] = [
  ["all", "Todas"],
  ["now", "En curso"],
  ["todo", "Por hacer"],
  ["late", "Atrasadas"],
  ["done", "Hechas"],
];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLOR_NAMES: Record<string, string> = { "mb-blanco": "blanco", "mb-azul": "azul", "mb-gris": "gris" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const nf = (v: number, digits = 0) => v.toLocaleString("es-CO", { maximumFractionDigits: digits });
/** "2026-10-22T08:31-05:00" → "22-oct 08:31" (hora de la planta, tal como viene). */
const when = (iso: string) => `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(11, 16)}`;
const day = (iso: string) => `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3.6e6;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento: solo dura la sesión */
    }
  },
};

/** Hora local de la planta "AAAA-MM-DDTHH:MM" con su desfase ("-05:00"); se compara como texto con las del plan. */
function plantNow(tz: string): string {
  const sign = tz.startsWith("-") ? -1 : 1;
  const [h, m] = tz.slice(1).split(":").map(Number);
  const forced = new URLSearchParams(location.search).get("now");
  if (forced) return forced.slice(0, 16);
  return new Date(Date.now() + sign * (h * 60 + m) * 60000).toISOString().slice(0, 16);
}

function windowFor(back: string, today: string): [string, string] {
  const t = new Date(`${today}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = back === "month" ? `${today.slice(0, 8)}01` : iso(new Date(t.getTime() - Number(back.replace("d", "")) * 864e5));
  return [first, iso(new Date(t.getTime() + 30 * 864e5))];
}

/** Recorta un plan amplio (archivo estático) al rango pedido, con la misma regla de la API. */
function clip(plan: PlanDoc, first: string, last: string): PlanDoc {
  const end = `${last}T23:59`;
  const keep = new Set(
    plan.orders.filter((o) => (o.due.slice(0, 10) >= first && o.due.slice(0, 10) <= last) || (o.completion.slice(0, 16) >= first && o.start.slice(0, 16) <= end)).map((o) => o.id),
  );
  return { ...plan, from: first, to: last, orders: plan.orders.filter((o) => keep.has(o.id)), schedule: plan.schedule.filter((r) => keep.has(r.order)) };
}

export function buildSchedule(opts: Options): void {
  const section = document.getElementById("schedule-section") as HTMLElement;
  const sidebar = document.getElementById("sidebar") as HTMLElement;
  const key = (k: string) => `twin.schedule.${opts.plantId}.${k}`;
  let back = store.get(key("back")) ?? "month";
  let filter = "all";
  let wide = store.get(key("wide")) === "1";
  let accepted: UrgentInput[] = JSON.parse(store.get(key("urgent")) ?? "[]");
  let plan: PlanDoc | null = null;
  let preview: { plan: PlanDoc; urgent: UrgentInput[] } | null = null;
  let live = true;
  let chosen: string | null = null;
  let formOpen = false;
  let message = "";

  section.hidden = false;
  section.innerHTML = `
    <h3>PROGRAMACIÓN</h3>
    <label class="sched-back">Hacia atrás <select id="sched-back">${BACK_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
    <div id="sched-kpis" class="sched-kpis"></div>
    <div class="sim-controls"><button id="sched-toggle" title="Ver la tabla de órdenes de producción en el panel">▦ TABLA</button><button id="sched-urgent" title="Pedir un pedido urgente y ver qué cambia">＋ URGENTE</button></div>
    <div id="sched-form" class="sched-form" hidden></div>
    <div id="sched-msg" class="sched-msg"></div>
    <div id="sched-body" class="sched-body" hidden></div>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const backSel = $<HTMLSelectElement>("sched-back");
  backSel.value = back;
  backSel.onchange = () => {
    back = backSel.value;
    store.set(key("back"), back);
    void load();
  };
  $("sched-toggle").onclick = () => {
    wide = !wide;
    store.set(key("wide"), wide ? "1" : null);
    render();
  };
  $("sched-urgent").onclick = () => {
    formOpen = !formOpen;
    renderForm();
  };

  async function fetchPlan(first: string, last: string, urgent: UrgentInput[], now: string): Promise<PlanDoc> {
    try {
      const r = urgent.length
        ? await fetch(`/api/schedules/${opts.plantId}/urgent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: first, to: last, now, orders: urgent }),
          })
        : await fetch(`/api/schedules/${opts.plantId}?from=${first}&to=${last}`);
      if (r.status === 422) throw new Error(((await r.json()) as { detail: string }).detail);
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) throw new TypeError("sin API");
      live = true;
      return await r.json();
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      const r = await fetch(`/api/schedules/${opts.plantId}.json`);
      if (!r.ok) throw new Error("No hay programación publicada para esta planta.");
      live = false;
      return clip(await r.json(), first, last);
    }
  }

  async function load(): Promise<void> {
    const now = plantNow(plan?.timezone ?? "-05:00");
    const [first, last] = windowFor(back, now.slice(0, 10));
    try {
      plan = await fetchPlan(first, last, live ? accepted : [], now);
      message = !live && accepted.length ? "Los pedidos urgentes aceptados necesitan la API; se muestra el plan base." : "";
    } catch (err) {
      message = (err as Error).message;
    }
    preview = null;
    render();
  }

  function ops(p: PlanDoc): Op[] {
    const orders = new Map(p.orders.map((o) => [o.id, o]));
    const byOp = new Map<string, Op>();
    for (const r of p.schedule) {
      const order = orders.get(r.order);
      if (!order) continue;
      const op = byOp.get(r.op);
      if (!op) {
        byOp.set(r.op, { op: r.op, order, stage: r.stage, product: r.product, equipment: [r.equipment], start: r.start, end: r.end, quantity: r.quantity, unit: r.unit, batches: r.batch ? 1 : 0, changeover_min: r.changeover_min, tooling: r.tooling });
        continue;
      }
      if (!op.equipment.includes(r.equipment)) op.equipment.push(r.equipment);
      if (r.start < op.start) op.start = r.start;
      if (r.end > op.end) op.end = r.end;
      op.quantity += r.quantity;
      op.batches += r.batch ? 1 : 0;
      op.changeover_min += r.changeover_min;
    }
    return [...byOp.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.op < b.op ? -1 : 1));
  }

  function state(op: Op, now: string): "done" | "now" | "todo" {
    if (op.end.slice(0, 16) <= now) return "done";
    if (op.start.slice(0, 16) <= now) return "now";
    return "todo";
  }

  function renderKpis(p: PlanDoc, now: string): void {
    const inWindow = p.orders.filter((o) => o.due.slice(0, 10) >= p.from && o.due.slice(0, 10) <= p.to);
    const late = inWindow.filter((o) => o.late_h > 0);
    const onTime = inWindow.length ? Math.round((100 * (inWindow.length - late.length)) / inWindow.length) : 100;
    const [busiest, use] = Object.entries(p.equipment).sort((a, b) => b[1].busy_pct - a[1].busy_pct)[0] ?? ["—", { busy_pct: 0 }];
    const running = ops(p).filter((o) => state(o, now) === "now").length;
    $("sched-kpis").innerHTML = `
      <div><b>${inWindow.length}</b><small>pedidos con entrega ${day(`${p.from}T`)}–${day(`${p.to}T`)}</small></div>
      <div><b class="${onTime < 90 ? "warn" : "ok"}">${onTime} %</b><small>a tiempo · ${late.length} tarde</small></div>
      <div><b>${running}</b><small>órdenes en curso</small></div>
      <div><b>${nf(use.busy_pct, 0)} %</b><small>${esc(busiest.toUpperCase())}, el más ocupado</small></div>
      <p class="dim small">${live ? "" : "Versión publicada: plan guardado al desplegar. "}Carga objetivo ${p.load_pct} % de la capacidad; pedidos inventados.</p>`;
  }

  function render(): void {
    sidebar.classList.toggle("wide", wide);
    $("sched-toggle").classList.toggle("active", wide);
    $("sched-msg").innerHTML = message ? `<p class="bad">${esc(message)}</p>` : "";
    const p = preview?.plan ?? plan;
    if (!p) return;
    const now = plantNow(p.timezone);
    renderKpis(p, now);
    renderImpact();
    const body = $("sched-body");
    body.hidden = !wide;
    if (!wide) return;
    const all = ops(p);
    const rows = all.filter((o) => {
      const st = state(o, now);
      if (filter === "late") return o.order.late_h > 0 && st !== "done";
      return filter === "all" || filter === st;
    });
    let nowShown = false;
    const tr: string[] = [];
    for (const o of rows) {
      const st = state(o, now);
      if (!nowShown && o.start.slice(0, 16) > now && filter === "all") {
        tr.push(`<tr class="now-row" id="sched-now"><td colspan="7">AHORA · ${when(`${now}`)}</td></tr>`);
        nowShown = true;
      }
      const slack = hours(o.order.completion, o.order.due);
      const late = o.order.late_h > 0;
      const qty = o.batches ? `${o.batches} lote${o.batches > 1 ? "s" : ""} · ${nf(o.quantity)} ${o.unit}` : `${nf(o.quantity)} ${o.unit}`;
      const chip = { done: "HECHA", now: "EN CURSO", todo: "PROGRAMADA" }[st];
      tr.push(`<tr data-op="${esc(o.op)}" class="${st}${o.op === chosen ? " chosen" : ""}${o.order.urgent ? " urgent" : ""}">
        <td><b>${esc(o.op)}</b><small>${esc(o.order.id)}${o.order.urgent ? " · URGENTE" : ""}</small></td>
        <td>${esc(o.order.product_name)}<small>${esc(o.order.customer)}</small></td>
        <td>${esc(stageName(o.stage))}<small>${o.equipment.map((e) => esc(e.toUpperCase())).join(", ")}</small></td>
        <td>${when(o.start)}<small>${when(o.end)}</small></td>
        <td>${qty}${o.changeover_min ? `<small>cambio ${nf(o.changeover_min)} min</small>` : ""}</td>
        <td>${day(o.order.due)}<small class="${late ? "bad" : ""}">${late ? `tarde ${nf(o.order.late_h, 1)} h` : `holgura ${nf(slack / 24, 1)} d`}</small></td>
        <td><span class="chip ${st}">${chip}</span>${late ? '<span class="chip late">TARDE</span>' : ""}</td>
      </tr>`);
    }
    body.innerHTML = `
      <div class="sched-filters">${FILTERS.map(([v, l]) => `<button data-filter="${v}" class="${v === filter ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="sched-scroll"><table class="route-table sched-table">
        <thead><tr><th>Orden / pedido</th><th>Producto / cliente</th><th>Etapa / equipo</th><th>Inicio / fin</th><th>Cantidad</th><th>Entrega</th><th>Estado</th></tr></thead>
        <tbody>${tr.join("") || '<tr><td colspan="7" class="dim">Sin órdenes con este filtro.</td></tr>'}</tbody>
      </table></div>
      <div id="sched-detail" class="sched-detail"></div>`;
    body.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) => (b.onclick = () => ((filter = b.dataset.filter!), render())));
    body.querySelectorAll<HTMLTableRowElement>("tr[data-op]").forEach((row) => (row.onclick = () => choose(row.dataset.op!)));
    renderDetail(all.find((o) => o.op === chosen) ?? null);
    // Desplaza solo la tabla (no el panel) hasta la orden elegida o la línea de AHORA.
    const scroller = body.querySelector<HTMLElement>(".sched-scroll")!;
    const target = body.querySelector<HTMLElement>(chosen ? "tr.chosen" : "#sched-now");
    if (target) scroller.scrollTop = Math.max(0, target.offsetTop - scroller.clientHeight / 3);
  }

  function choose(op: string): void {
    chosen = op === chosen ? null : op;
    const p = preview?.plan ?? plan;
    const o = p ? ops(p).find((x) => x.op === chosen) : undefined;
    if (o) {
      opts.select(o.equipment[0]);
      opts.showProduct?.(o.order.product);
    }
    render();
  }

  function renderDetail(o: Op | null): void {
    const el = document.getElementById("sched-detail");
    if (!el) return;
    if (!o) {
      el.innerHTML = '<p class="dim small">Haz clic en una orden: se resalta su equipo y la ruta del producto en el 3D.</p>';
      return;
    }
    const ord = o.order;
    el.innerHTML = `
      <div class="label">${esc(o.op)} · ${esc(stageName(o.stage))}</div>
      <p>Pedido <b>${esc(ord.id)}</b> de ${esc(ord.customer)}: ${nf(ord.quantity)} ${esc(ord.unit)} de ${esc(ord.product_name)}${ord.color ? ` (${esc(COLOR_NAMES[ord.color] ?? ord.color)})` : ""}.
      Llegó el ${when(ord.created)}, entrega el ${when(ord.due)}${ord.priority === 2 ? " (plazo corto)" : ""}${ord.urgent ? " (urgente)" : ""}.</p>
      <p>Esta orden: ${o.equipment.map((e) => esc(e.toUpperCase())).join(", ")}${o.tooling ? ` con ${esc(o.tooling)}` : ""}, de ${when(o.start)} a ${when(o.end)}.
      El pedido termina el ${when(ord.completion)}: ${ord.late_h > 0 ? `<span class="bad">${nf(ord.late_h, 1)} h tarde</span>` : "a tiempo"}.</p>
      ${ord.hold ? `<p class="warn">Retenido hasta el ${when(ord.hold.until)}: ${esc(ord.hold.reason)}.</p>` : ""}`;
  }

  function renderForm(): void {
    const el = $("sched-form");
    $("sched-urgent").classList.toggle("active", formOpen);
    el.hidden = !formOpen;
    if (!formOpen) return;
    if (!live) {
      el.innerHTML = '<p class="dim small">El pedido urgente replanea con la API del gemelo; la versión publicada sin API solo muestra el plan guardado.</p>';
      return;
    }
    const products = plan?.products ?? [];
    const now = plantNow(plan?.timezone ?? "-05:00");
    const due = new Date(Date.parse(`${now.slice(0, 10)}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
    el.innerHTML = `
      <label>Producto <select id="urg-product">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
      <label>Cantidad <input id="urg-qty" type="number" min="1" step="1" /> <span id="urg-unit" class="dim"></span></label>
      <label>Entrega <input id="urg-due" type="date" value="${due}" /></label>
      <label id="urg-color-wrap">Color <select id="urg-color"></select></label>
      <div class="sim-controls"><button id="urg-run" class="primary">▶ VER QUÉ CAMBIA</button></div>`;
    const sel = $<HTMLSelectElement>("urg-product");
    const sync = () => {
      const p = products.find((x) => x.id === sel.value);
      $("urg-unit").textContent = p?.unit ?? "";
      $<HTMLInputElement>("urg-qty").value = String(p?.unit === "u" && p.id.includes("cubiertos") ? 50000 : 1000);
      $("urg-color-wrap").hidden = !p?.colors.length;
      $("urg-color").innerHTML = (p?.colors ?? []).map((c) => `<option value="${esc(c)}">${esc(COLOR_NAMES[c] ?? c)}</option>`).join("");
    };
    sel.onchange = sync;
    sync();
    $("urg-run").onclick = () => void runUrgent();
  }

  async function runUrgent(): Promise<void> {
    const input: UrgentInput = {
      product: $<HTMLSelectElement>("urg-product").value,
      quantity: Number($<HTMLInputElement>("urg-qty").value),
      due: $<HTMLInputElement>("urg-due").value,
      customer: "Pedido urgente",
    };
    const color = $<HTMLSelectElement>("urg-color").value;
    if (color) input.color = color;
    const urgent = [...accepted, input];
    const now = plantNow(plan?.timezone ?? "-05:00");
    const [first, last] = windowFor(back, now.slice(0, 10));
    try {
      const p = await fetchPlan(first, last, urgent, now);
      preview = { plan: p, urgent };
      message = "";
      wide = true;
      filter = "all";
      formOpen = false;
      renderForm();
      const mine = p.orders.filter((o) => o.urgent).at(-1);
      chosen = mine ? (ops(p).find((o) => o.order.id === mine.id)?.op ?? null) : null;
    } catch (err) {
      message = (err as Error).message;
    }
    render();
  }

  function renderImpact(): void {
    const el = $("sched-form");
    const box = document.getElementById("sched-impact") ?? el.insertAdjacentElement("afterend", Object.assign(document.createElement("div"), { id: "sched-impact", className: "sched-impact" }))!;
    if (!preview?.plan.impact) {
      box.innerHTML = accepted.length
        ? `<p class="small">${accepted.length} pedido${accepted.length > 1 ? "s" : ""} urgente${accepted.length > 1 ? "s" : ""} aceptado${accepted.length > 1 ? "s" : ""} en este navegador. <button id="urg-clear">QUITAR</button></p>`
        : "";
      const clear = document.getElementById("urg-clear");
      if (clear)
        clear.onclick = () => {
          accepted = [];
          store.set(key("urgent"), null);
          void load();
        };
      return;
    }
    const imp = preview.plan.impact;
    const u = imp.urgent.at(-1)!;
    const done = preview.plan.orders.find((o) => o.id === u.order);
    box.innerHTML = `
      <div class="label">ESCENARIO · PEDIDO URGENTE</div>
      <p>${esc(u.order)} ${u.on_time ? '<span class="ok">sale a tiempo</span>' : `<span class="bad">sale ${nf(u.late_h, 1)} h tarde</span>`}${done ? `: termina el ${when(done.completion)}` : ""}.
      Se mueven ${imp.moved} pedido${imp.moved === 1 ? "" : "s"}; ${imp.newly_late.length ? `<span class="bad">pasan a tarde: ${imp.newly_late.map(esc).join(", ")}</span>` : "ninguno pasa a tarde"}.
      ${imp.delayed.length ? `El más corrido: ${esc(imp.delayed[0].order)}, ${nf(imp.delayed[0].delay_h, 1)} h.` : ""}</p>
      <div class="sim-controls"><button id="urg-accept" class="primary">✓ ACEPTAR</button><button id="urg-discard">✕ DESCARTAR</button></div>`;
    $("urg-accept").onclick = () => {
      accepted = preview!.urgent;
      store.set(key("urgent"), JSON.stringify(accepted));
      plan = preview!.plan;
      preview = null;
      render();
    };
    $("urg-discard").onclick = () => {
      preview = null;
      chosen = null;
      render();
    };
  }

  void load();
}
