/**
 * ⚙ CONFIGURACIÓN del APS de plásticos: el usuario carga a mano los datos con los que el APS programa la planta.
 *
 * Tres pasos, en el orden en que se arma una planta nueva:
 *   1. PEDIDOS: agregar, editar (cantidad, color, entrega, importancia) y eliminar pedidos de la cartera.
 *   2. MOLDES Y MÁQUINAS: arrastrar una inyectora sobre una pieza para montarle su molde (solo si le cabe y queda una
 *      copia libre del molde) o quitársela.
 *   3. SECUENCIA DEL PLANIFICADOR: arrastrar cada pedido a la máquina que lo hace y ordenarlo dentro de ella.
 * Más VERSIONES: guardar la configuración con un nombre, abrir, usar en la planta o eliminar. Cada versión es una foto
 * completa (sin historial de cambios); la precargada de la demo siempre está y no se borra.
 *
 * Lo que se edita es un borrador: el plan manual que resultaría se recalcula con cada cambio y no toca la planta hasta
 * USAR EN LA PLANTA, que activa la versión en el APS, el gemelo 3D, el emulador y el centro de control (aps-store.ts).
 */
import type { CustomerOrder, Importance } from "@twin/cosim/core/contracts.ts";
import { basePortfolio, baseManual, catalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { buildModel, type PlasticsModel, type Step } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { manualPlan } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import { applyConfig, configManual, configPortfolio, mountProblem, preloadedConfig, PRELOADED, setupOf, type PlasticsConfig } from "@twin/cosim/adapters/plastic-injection-plant-v1/config.ts";
import { activeConfig, configVersions, deleteConfigVersion, now, saveConfigVersion, setActiveConfig } from "./aps-store.ts";
import { COLOR_NAMES, day, dayNumber, esc, nf, when } from "./schedule.ts";

const DAY_MS = 864e5;
const IMPORTANCE: [Importance, string][] = [["alta", "Alta"], ["normal", "Normal"], ["baja", "Baja"]];
const PART_COLORS: Record<string, string> = {
  cubiertos: "#4EA7FF",
  "balde-12l": "#ff9f43",
  "papelera-20l": "#22c46b",
  "cuerpo-papelera-20l": "#7bd88f",
  "pedal-palanca-papelera": "#2ec4b6",
};
const PART_NAMES: Record<string, string> = { "cuerpo-papelera-20l": "Cuerpo de papelera 20 L", "pedal-palanca-papelera": "Pedal y palanca", "papelera-20l": "Ensamble de papelera 20 L" };
const MACHINE_NAMES: Record<string, string> = { "assembly-01": "ENSAMBLE-01" };
const mName = (m: string) => MACHINE_NAMES[m] ?? m.toUpperCase();

export interface ConfigHost {
  /** Se activó una versión: la pantalla se vuelve a armar con esos datos. */
  activated(): void;
}

type Section = "orders" | "molds" | "sequence" | "versions";
const SECTIONS: Section[] = ["orders", "molds", "sequence", "versions"];

/** Una pieza que se programa en una máquina: la de un producto o un componente suyo (cuerpo, pedal) o el ensamble. */
interface Part {
  id: string;
  name: string;
  step: Step;
}

export function mountConfig(panel: HTMLElement, host: ConfigHost): { render(): void } {
  const cat0 = catalogData();
  const baseModel = buildModel(cat0);
  const injection = Object.keys(cat0.machines ?? {}).sort();
  const active = activeConfig();
  const preloaded = () => preloadedConfig(basePortfolio, baseManual);
  let draft: PlasticsConfig = structuredClone(active ?? preloaded());
  let dirty = false;
  const asked = new URLSearchParams(location.search).get("cfg") as Section | null;
  let section: Section = asked && SECTIONS.includes(asked) ? asked : "orders";
  let msg = "";
  let msgBad = false;
  let editingName = false;

  const t = () => now();
  const tz = baseModel.timezone;
  const close = baseModel.calendar.shifts.map((s) => s.end).sort().at(-1) ?? "22:00";
  const plus = (n: number) => new Date(Date.parse(`${t().slice(0, 10)}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
  const pending = (o: CustomerOrder) => o.due.slice(0, 16) >= t();

  /** El modelo y el plan manual que daría el borrador (o el error que lo impide). */
  function evaluate(): { model: PlasticsModel; kpis?: { onTime: number; late: number; tard: number; changes: number; changeH: number }; error?: string } {
    let model = baseModel;
    try {
      model = buildModel(applyConfig(cat0, draft));
      const pf = configPortfolio(basePortfolio, draft);
      const p = manualPlan(model, pf, configManual(baseManual, draft, pf.portfolio_id));
      return { model, kpis: { onTime: p.kpis.on_time_pct, late: p.kpis.late_orders, tard: p.kpis.tardiness_h, changes: p.kpis.changeovers, changeH: p.kpis.changeover_h } };
    } catch (err) {
      return { model, error: (err as Error).message ?? String(err) };
    }
  }

  /** Piezas programables del modelo: una por molde (o por celda de ensamble), en el orden del catálogo. */
  function partsOf(model: PlasticsModel): Part[] {
    const out = new Map<string, Part>();
    for (const p of Object.values(model.products))
      for (const st of [...p.components.map((c) => c.step), p.final]) if (!out.has(st.product)) out.set(st.product, { id: st.product, name: PART_NAMES[st.product] ?? model.products[st.product]?.name ?? st.product, step: st });
    return [...out.values()];
  }
  /** Pasos de un pedido: los componentes y la pieza final, con las unidades de cada uno. */
  const stepsOf = (model: PlasticsModel, o: CustomerOrder) => {
    const p = model.products[o.product];
    return p ? [...p.components.map((c) => ({ step: c.step, qty: o.quantity * c.qty })), { step: p.final, qty: o.quantity }] : [];
  };
  const placedOn = (id: string, machines: string[]) => machines.find((m) => draft.sequence[m]?.includes(id));

  const say = (text: string, bad = false) => {
    msg = text;
    msgBad = bad;
  };
  const changed = () => {
    dirty = true;
    render();
  };

  // ------------------------------------------------------------------ vistas
  function render() {
    const ev = evaluate();
    const opened = draft.id === PRELOADED ? "la precargada de la demo" : `«${draft.name}»`;
    const isActive = (activeConfig()?.id ?? PRELOADED) === draft.id;
    const k = ev.kpis;
    const head = `
      <div class="cf-head">
        <div class="cf-head-t">
          <h2 class="fr-title">⚙ Configuración de la planta</h2>
          <p class="fr-intro">Aquí se cargan a mano los datos con los que el APS programa: los pedidos, qué molde lleva cada inyectora y la secuencia del planificador. La demo abre con una configuración precargada; cualquier cambio queda en un borrador hasta que lo guardes como versión y lo uses en la planta.</p>
          <p class="cf-open">Editando ${esc(opened)}${isActive ? ' <span class="chip done">EN LA PLANTA</span>' : ""}${dirty ? ' <span class="chip late">CAMBIOS SIN GUARDAR</span>' : ""}</p>
        </div>
        <div class="cf-preview">
          <div class="fr-k">PLAN MANUAL CON ESTE BORRADOR</div>
          ${k ? `<div class="cf-kpis"><div><b>${nf(k.onTime, 1)} %</b><small>a tiempo</small></div><div><b class="${k.late ? "bad" : "ok"}">${nf(k.late)}</b><small>pedidos tarde</small></div><div><b>${nf(k.tard, 1)} h</b><small>de atraso</small></div><div><b>${nf(k.changes)}</b><small>cambios · ${nf(k.changeH, 1)} h</small></div></div>` : `<p class="bad small">${esc(ev.error ?? "")}</p>`}
          <div class="cf-actions">
            ${draft.id !== PRELOADED ? `<button id="cf-save" class="primary"${dirty ? "" : " disabled"}>💾 GUARDAR</button>` : ""}
            ${editingName
              ? `<span class="cf-name"><input id="cf-name" value="${esc(draft.id === PRELOADED ? `Configuración ${configVersions().length + 1}` : `${draft.name} (copia)`)}" /><button id="cf-save-new" class="primary">✓ GUARDAR</button><button id="cf-name-x">✕</button></span>`
              : `<button id="cf-save-as"${draft.id === PRELOADED ? ' class="primary"' : ""}>💾 GUARDAR COMO VERSIÓN NUEVA</button>`}
            <button id="cf-use"${(isActive && !dirty) || ev.error ? " disabled" : ""}>✓ USAR EN LA PLANTA</button>
            <button id="cf-revert"${dirty ? "" : " disabled"}>↺ DESCARTAR CAMBIOS</button>
          </div>
          <p id="cf-msg" class="small ${msgBad ? "bad" : "ok"}">${esc(msg)}</p>
        </div>
      </div>
      <nav class="cf-tabs">
        ${(
          [
            ["orders", "1 · PEDIDOS"],
            ["molds", "2 · MOLDES Y MÁQUINAS"],
            ["sequence", "3 · SECUENCIA DEL PLANIFICADOR"],
            ["versions", `VERSIONES GUARDADAS (${configVersions().length})`],
          ] as [Section, string][]
        )
          .map(([s, l]) => `<button data-cf="${s}" class="${section === s ? "active" : ""}">${l}</button>`)
          .join("")}
      </nav>`;
    const body = section === "orders" ? ordersView(ev.model) : section === "molds" ? moldsView(ev.model) : section === "sequence" ? sequenceView(ev.model) : versionsView();
    panel.innerHTML = head + body;
  }

  function dueOptions(selected?: string) {
    const opts: string[] = [];
    const sel = selected?.slice(0, 10);
    if (sel && (sel < plus(1) || sel > plus(baseModel.windowDays))) opts.push(`<option value="${sel}" selected>${esc(day(sel))}</option>`);
    for (let n = 1; n <= baseModel.windowDays; n++) opts.push(`<option value="${plus(n)}"${sel === plus(n) ? " selected" : ""}>${esc(day(plus(n)))}${n === 1 ? " (mañana)" : ""}</option>`);
    return opts.join("");
  }
  const colorOptions = (model: PlasticsModel, product: string, selected?: string) =>
    (model.products[product]?.colors ?? []).map((c) => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(COLOR_NAMES[c] ?? c)}</option>`).join("");

  function ordersView(model: PlasticsModel) {
    const products = Object.values(model.products).filter((p) => model.demand.some((d) => d.product === p.id));
    const list = draft.orders.filter(pending).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id)));
    const past = draft.orders.length - list.length;
    const customers = [...new Set([...model.customers, ...draft.orders.map((o) => o.customer)])].sort();
    const rows = list
      .map(
        (o) => `<tr data-row="${esc(o.id)}"${o.added ? ' class="cf-new"' : ""}>
          <td><b>${esc(o.id)}</b>${o.added ? ' <span class="chip now">NUEVO</span>' : ""}</td>
          <td>${esc(o.customer)}</td>
          <td><i class="cf-dot" style="background:${PART_COLORS[o.product] ?? "#9ab"}"></i>${esc(model.products[o.product]?.name ?? o.product)}</td>
          <td><select class="cf-in" data-edit="color">${colorOptions(model, o.product, o.color)}</select></td>
          <td><input class="cf-in" data-edit="quantity" type="number" min="1" step="1" value="${o.quantity}" /></td>
          <td><select class="cf-in" data-edit="due">${dueOptions(o.due)}</select></td>
          <td><select class="cf-in" data-edit="importance">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${o.importance === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><button class="cf-del" data-del="${esc(o.id)}" title="Eliminar el pedido">🗑 ELIMINAR</button></td>
        </tr>`,
      )
      .join("");
    const first = products[0]?.id ?? "";
    return `
      <section class="aps-add cf-add">
        <div class="label">AGREGAR PEDIDO</div>
        <div class="aps-add-grid">
          <label class="f-wide">Cliente <input id="cf-customer" list="cf-customers" placeholder="Nombre del cliente" /></label>
          <datalist id="cf-customers">${customers.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
          <label>Producto <select id="cf-product">${products.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
          <label>Color <select id="cf-color">${colorOptions(model, first)}</select></label>
          <label>Cantidad <input id="cf-qty" type="number" min="1" step="1" value="${qtyOf(model, first)}" /></label>
          <label>Entrega (cierre ${esc(close)}) <select id="cf-due">${dueOptions(plus(Math.min(5, baseModel.windowDays)))}</select></label>
          <label>Importancia <select id="cf-imp">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${v === "normal" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <button id="cf-add" class="primary">＋ AGREGAR</button>
        </div>
      </section>
      <p class="dim small">${list.length} pedidos por entregar desde ahora (se editan aquí mismo: color, cantidad, entrega e importancia) y ${past} ya entregados, que quedan como están. Un pedido nuevo entra a la secuencia del planificador como «sin asignar»: el plan manual lo pone al final de la máquina menos cargada hasta que lo ubiques en el paso 3.</p>
      <div class="aps-table-wrap"><table class="route-table aps-table cf-orders">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Color</th><th>Cantidad</th><th>Entrega</th><th>Importancia</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  /** Cantidad típica de un pedido del producto (mitad del rango de la demanda, redondeada). */
  function qtyOf(model: PlasticsModel, product: string) {
    const line = model.demand.find((d) => d.product === product);
    const step = line?.round ?? 1;
    return line ? Math.round((line.order_qty[0] + line.order_qty[1]) / 2 / step) * step : 1000;
  }

  function moldsView(model: PlasticsModel) {
    const setup = setupOf(cat0, draft.molds);
    const machines = cat0.machines ?? {};
    const toolName = (id?: string) => cat0.tooling.tooling.find((x) => x.id === id)?.name ?? id ?? "";
    const palette = injection
      .map((m) => {
        const mold = setup[m]?.tooling;
        return `<span class="cf-filler${mold ? "" : " free"}" draggable="true" data-machine="${esc(m)}"><b>${esc(mName(m))}</b><small>${nf(machines[m]?.clamp_t ?? 0)} t · ${mold ? esc(toolName(mold)) : "SIN MOLDE"}</small></span>`;
      })
      .join("");
    const cards = partsOf(model)
      .map((part) => {
        const tool = cat0.tooling.tooling.find((x) => x.id === part.step.tooling);
        const chips = part.step.machines.map((m) => `<span class="cf-chip">${esc(mName(m))}${tool ? `<button data-unmount="${esc(m)}" title="Quitar el molde de esta máquina">✕</button>` : ""}</span>`).join("");
        const used = tool ? Object.values(setup).filter((s) => s.tooling === tool.id).length : 0;
        const spec = tool
          ? `${esc(tool.name ?? `molde ${tool.id}`)} · ${tool.cavities} cavidades · ciclo ${nf(tool.cycle_s, 1)} s · necesita ${nf(tool.min_clamp_t ?? 0)} t de cierre · <b>${used} de ${tool.copies ?? used} copias montadas</b>`
          : `celda de ensamble · ${nf(part.step.unitMin * 60)} s por unidad`;
        return `<article class="cf-sku" data-part="${esc(part.id)}">
          <div class="cf-sku-h"><i class="cf-dot" style="background:${PART_COLORS[part.id] ?? "#9ab"}"></i><b>${esc(part.name)}</b></div>
          <p class="dim small">${spec}</p>
          <div class="cf-drop"${tool ? ` data-drop-tool="${esc(tool.id)}"` : ""}>${chips}${tool ? `<span class="cf-hint">suelta aquí una inyectora de ${nf(tool.min_clamp_t ?? 0)} t o más</span>` : '<span class="cf-hint">fija: no lleva molde</span>'}</div>
        </article>`;
      })
      .join("");
    return `
      <p class="dim small">Cada pieza se hace con su molde, y una inyectora solo hace la pieza del molde que tiene montado. Arrastra una inyectora desde la barra y suéltala sobre una pieza para montarle ese molde (si tenía otro, se lo quita). Solo se acepta si el molde le cabe (fuerza de cierre y tiro) y queda una copia libre del molde. ✕ desmonta el molde y la máquina queda libre. Los pedidos que esa máquina tenía quedan sin asignar en el paso 3.</p>
      <div class="cf-palette"><span class="fr-k">INYECTORAS</span>${palette}</div>
      <div class="cf-skus">${cards}</div>`;
  }

  function sequenceView(model: PlasticsModel) {
    const byId = new Map(draft.orders.map((o) => [o.id, o]));
    const parts = partsOf(model);
    const partOn = (m: string) => parts.find((p) => p.step.machines.includes(m));
    const card = (o: CustomerOrder, step: Step, qty: number) => `<div class="cf-card${o.added ? " cf-new" : ""}" draggable="true" data-card="${esc(o.id)}" data-part="${esc(step.product)}" style="--c:${PART_COLORS[step.product] ?? "#9ab"}">
        <b>${esc(o.id)}</b><span>${esc(PART_NAMES[step.product] ?? model.products[step.product]?.name ?? step.product)}</span><small>${nf(qty)} u · entrega ${esc(day(o.due))}${o.importance === "alta" ? " · ALTA" : ""}</small>
      </div>`;
    const open = draft.orders.filter(pending).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    const pool = open.flatMap((o) => stepsOf(model, o).filter((s) => !placedOn(o.id, s.step.machines)).map((s) => card(o, s.step, s.qty)));
    const machines = parts.flatMap((p) => p.step.machines);
    const cols = machines
      .map((m) => {
        const part = partOn(m)!;
        const items = (draft.sequence[m] ?? []).map((id) => byId.get(id)).filter((o): o is CustomerOrder => !!o && pending(o));
        const cards = items.flatMap((o) => stepsOf(model, o).filter((s) => s.step.product === part.id).map((s) => card(o, s.step, s.qty)));
        return `<div class="cf-col" data-col="${esc(m)}" style="--c:${PART_COLORS[part.id] ?? "#9ab"}"><div class="cf-col-h"><b>${esc(mName(m))}</b><small>${esc(part.name)} · ${cards.length} pedidos</small></div><div class="cf-col-b">${cards.join("")}</div></div>`;
      })
      .join("");
    return `
      <p class="dim small">La secuencia es lo que el planificador decide a mano: en qué máquina va cada pedido y en qué orden. Arrastra una tarjeta a otra máquina (solo se aceptan las que tienen el molde de esa pieza) o súbela o bájala dentro de la suya: el plan manual respeta ese orden. Un pedido de papelera tiene tres tarjetas: cuerpo, pedal y ensamble. Se muestran los pedidos por entregar desde ahora.
        <button id="cf-auto"${pool.length ? "" : " disabled"}>⇢ ASIGNAR LOS SIN ASIGNAR</button></p>
      <div class="cf-board" style="grid-template-columns: repeat(${machines.length + 1}, minmax(170px, 1fr))">
        <div class="cf-col pool" data-col=""><div class="cf-col-h"><b>SIN ASIGNAR</b><small>${pool.length} tarjetas</small></div><div class="cf-col-b">${pool.join("")}</div></div>
        ${cols}
      </div>`;
  }

  function versionsView() {
    const act = activeConfig()?.id ?? PRELOADED;
    const row = (c: PlasticsConfig) => `<tr class="${c.id === draft.id ? "sel" : ""}">
      <td><b>${esc(c.name)}</b>${c.id === act ? ' <span class="chip done">EN LA PLANTA</span>' : ""}${c.id === draft.id ? ' <span class="chip now">ABIERTA</span>' : ""}</td>
      <td>${c.saved_at ? esc(when(c.saved_at)) : "—"}</td>
      <td class="num">${nf(c.orders.length)}</td>
      <td class="num">${nf(Object.keys(c.molds).length)}</td>
      <td class="fr-btns"><button data-open="${esc(c.id)}">ABRIR</button><button data-use="${esc(c.id)}"${c.id === act ? " disabled" : ""}>✓ USAR EN LA PLANTA</button>${c.id === PRELOADED ? "" : `<button class="cf-del" data-rmver="${esc(c.id)}">🗑 ELIMINAR</button>`}</td>
    </tr>`;
    return `
      <p class="dim small">Cada versión guarda la configuración completa tal como quedó (pedidos, moldes montados y secuencia), sin el historial de cambios. Se guardan en este navegador. La precargada de la demo siempre está y no se borra.</p>
      <div class="aps-table-wrap"><table class="route-table aps-table cf-versions">
        <thead><tr><th>Versión</th><th>Guardada</th><th class="num">Pedidos</th><th class="num">Máquinas con otro molde</th><th></th></tr></thead>
        <tbody>${[preloaded(), ...configVersions()].map(row).join("")}</tbody>
      </table></div>`;
  }

  // ------------------------------------------------------------------ acciones
  function addOrder(model: PlasticsModel) {
    const v = (id: string) => (panel.querySelector(`#${id}`) as HTMLInputElement).value;
    const customer = v("cf-customer").trim();
    const qty = Math.round(Number(v("cf-qty")));
    if (!customer) return say("Escribe el cliente.", true), render();
    if (!(qty > 0)) return say("La cantidad debe ser mayor que cero.", true), render();
    const due = `${v("cf-due")}T${close}${tz}`;
    const d = String(dayNumber(due)).padStart(2, "0");
    let n = 1;
    while (draft.orders.some((o) => o.id === `PED-D${d}-${String(n).padStart(2, "0")}`)) n++;
    const id = `PED-D${d}-${String(n).padStart(2, "0")}`;
    const product = v("cf-product");
    const order: CustomerOrder = { id, customer, product, quantity: qty, unit: model.products[product]?.unit ?? "u", due, created: `${t()}${tz}`, importance: v("cf-imp") as Importance, added: true };
    const color = v("cf-color");
    if (color) order.color = color;
    draft.orders.push(order);
    say(`${id} agregado. Ubícalo en una máquina en el paso 3 o déjalo sin asignar.`);
    changed();
  }

  /** Quita de la secuencia de `m` los pedidos que ya no se pueden hacer ahí (la máquina cambió de molde). */
  function dropMismatched(m: string, keepPart?: string): number {
    const model = buildModel(applyConfig(cat0, draft));
    const before = draft.sequence[m]?.length ?? 0;
    if (!before) return 0;
    const byId = new Map(draft.orders.map((o) => [o.id, o]));
    draft.sequence[m] = draft.sequence[m].filter((id) => {
      const o = byId.get(id);
      if (!o) return false;
      if (!pending(o)) return true;
      return !!keepPart && stepsOf(model, o).some((s) => s.step.product === keepPart);
    });
    return before - draft.sequence[m].length;
  }

  function setMold(m: string, tooling: string | null) {
    const base = cat0.setup.setup[m]?.tooling ?? null;
    if (tooling === base) delete draft.molds[m];
    else draft.molds[m] = tooling;
  }

  function mount(machine: string, tooling: string) {
    const problem = mountProblem(cat0, draft.molds, machine, tooling);
    if (problem) return say(`No se puede: ${problem}.`, true), render();
    const setup = setupOf(cat0, draft.molds);
    const old = setup[machine]?.tooling;
    if (old && Object.values(setup).filter((s) => s.tooling === old).length <= 1) return say(`${mName(machine)} es la única máquina con el molde ${old}: esa pieza quedaría sin máquina.`, true), render();
    setMold(machine, tooling);
    const part = partsOf(buildModel(applyConfig(cat0, draft))).find((p) => p.step.tooling === tooling);
    const freed = dropMismatched(machine, part?.id);
    say(`Molde ${tooling} montado en ${mName(machine)}${old ? ` (se desmontó ${old})` : ""}${freed ? `; ${freed} pedidos quedaron sin asignar` : ""}.`);
    changed();
  }

  function unmount(machine: string) {
    const setup = setupOf(cat0, draft.molds);
    const tool = setup[machine]?.tooling;
    if (!tool) return;
    if (Object.values(setup).filter((s) => s.tooling === tool).length <= 1) return say(`${mName(machine)} es la única máquina con el molde ${tool}: la pieza necesita al menos una.`, true), render();
    setMold(machine, null);
    const freed = dropMismatched(machine);
    say(`${mName(machine)} quedó sin molde${freed ? `; ${freed} pedidos quedaron sin asignar` : ""}.`);
    changed();
  }

  function moveCard(id: string, part: string, to: string, before: string | null, model: PlasticsModel) {
    const p = partsOf(model).find((x) => x.id === part);
    if (!p) return;
    if (to && !p.step.machines.includes(to)) return say(`${mName(to)} no tiene el molde de ${p.name}: móntaselo en el paso 2 si le cabe.`, true), render();
    for (const m of p.step.machines) if (draft.sequence[m]) draft.sequence[m] = draft.sequence[m].filter((x) => x !== id);
    if (to) {
      const list = (draft.sequence[to] ??= []);
      const at = before ? list.indexOf(before) : -1;
      list.splice(at < 0 ? list.length : at, 0, id);
    }
    say(to ? `${id} (${p.name}) en ${mName(to)}${before ? `, antes de ${before}` : ", al final"}.` : `${id} (${p.name}) quedó sin asignar.`);
    changed();
  }

  /** Cada tarjeta sin asignar va al final de la máquina de su pieza con menos trabajo, por fecha de entrega. */
  function autoAssign(model: PlasticsModel) {
    const byId = new Map(draft.orders.map((o) => [o.id, o]));
    const load: Record<string, number> = {};
    for (const part of partsOf(model))
      for (const m of part.step.machines)
        load[m] = (draft.sequence[m] ?? []).reduce((s, id) => {
          const o = byId.get(id);
          const st = o && pending(o) ? stepsOf(model, o).find((x) => x.step.product === part.id) : undefined;
          return s + (st ? st.qty * st.step.unitMin : 0);
        }, 0);
    let n = 0;
    for (const o of draft.orders.filter(pending).sort((a, b) => (a.due < b.due ? -1 : 1)))
      for (const s of stepsOf(model, o)) {
        if (placedOn(o.id, s.step.machines)) continue;
        const m = [...s.step.machines].sort((a, b) => load[a] - load[b])[0];
        (draft.sequence[m] ??= []).push(o.id);
        load[m] += s.qty * s.step.unitMin;
        n++;
      }
    say(`${n} tarjetas asignadas a la máquina menos cargada de su pieza, por fecha de entrega.`);
    changed();
  }

  function saveAs(name: string) {
    const ids = configVersions().map((c) => Number(c.id.replace(/\D/g, "")) || 0);
    const id = `CFG-${String(Math.max(0, ...ids) + 1).padStart(2, "0")}`;
    draft = { ...structuredClone(draft), id, name: name.trim() || id, saved_at: `${t()}${tz}` };
    saveConfigVersion(draft);
    dirty = false;
    editingName = false;
    say(`Versión «${draft.name}» guardada.`);
    render();
  }

  function use(id: string) {
    setActiveConfig(id === PRELOADED ? null : id);
    host.activated();
  }

  panel.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const model = evaluate().model;
    const s = el.closest<HTMLElement>("[data-cf]")?.dataset.cf as Section | undefined;
    if (s) return (section = s), (msg = ""), render();
    if (el.closest("#cf-add")) return addOrder(model);
    const del = el.closest<HTMLElement>("[data-del]")?.dataset.del;
    if (del) {
      draft.orders = draft.orders.filter((o) => o.id !== del);
      for (const m of Object.keys(draft.sequence)) draft.sequence[m] = draft.sequence[m].filter((x) => x !== del);
      say(`${del} eliminado.`);
      return changed();
    }
    const um = el.closest<HTMLElement>("[data-unmount]")?.dataset.unmount;
    if (um) return unmount(um);
    if (el.closest("#cf-auto")) return autoAssign(model);
    if (el.closest("#cf-save") && draft.id !== PRELOADED) {
      draft.saved_at = `${t()}${tz}`;
      saveConfigVersion(structuredClone(draft));
      dirty = false;
      say(`Versión «${draft.name}» guardada.`);
      return render();
    }
    if (el.closest("#cf-save-as")) return (editingName = true), render();
    if (el.closest("#cf-name-x")) return (editingName = false), render();
    if (el.closest("#cf-save-new")) return saveAs((panel.querySelector("#cf-name") as HTMLInputElement).value);
    if (el.closest("#cf-use")) {
      if (dirty) {
        if (draft.id === PRELOADED) return (editingName = true), say("Guarda el borrador como versión para usarlo en la planta.", true), render();
        draft.saved_at = `${t()}${tz}`;
        saveConfigVersion(structuredClone(draft));
      }
      return use(draft.id);
    }
    if (el.closest("#cf-revert")) {
      draft = structuredClone(draft.id === PRELOADED ? preloaded() : (configVersions().find((c) => c.id === draft.id) ?? preloaded()));
      dirty = false;
      say("Cambios descartados.");
      return render();
    }
    const open = el.closest<HTMLElement>("[data-open]")?.dataset.open;
    if (open) {
      draft = structuredClone(open === PRELOADED ? preloaded() : configVersions().find((c) => c.id === open)!);
      dirty = false;
      section = "orders";
      say(`Abierta «${draft.name}».`);
      return render();
    }
    const u = el.closest<HTMLElement>("[data-use]")?.dataset.use;
    if (u) return use(u);
    const rmv = el.closest<HTMLElement>("[data-rmver]")?.dataset.rmver;
    if (rmv) {
      const wasActive = activeConfig()?.id === rmv;
      deleteConfigVersion(rmv);
      if (wasActive) return host.activated();
      if (draft.id === rmv) (draft = preloaded()), (dirty = false);
      say("Versión eliminada.");
      return render();
    }
  });

  // Edición en la tabla de pedidos y en el formulario de agregar.
  panel.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    const model = evaluate().model;
    if (el.id === "cf-product") {
      (panel.querySelector("#cf-color") as HTMLSelectElement).innerHTML = colorOptions(model, el.value);
      (panel.querySelector("#cf-qty") as HTMLInputElement).value = String(qtyOf(model, el.value));
      return;
    }
    const field = el.dataset.edit;
    const id = el.closest<HTMLElement>("[data-row]")?.dataset.row;
    const o = id ? draft.orders.find((x) => x.id === id) : null;
    if (!field || !o) return;
    if (field === "quantity") {
      const q = Math.round(Number(el.value));
      if (!(q > 0)) return say("La cantidad debe ser mayor que cero.", true), render();
      o.quantity = q;
    } else if (field === "due") o.due = `${el.value}T${close}${tz}`;
    else if (field === "importance") o.importance = el.value as Importance;
    else if (field === "color") o.color = el.value;
    say(`${o.id} actualizado.`);
    changed();
  });

  // Arrastrar y soltar: inyectoras sobre piezas y pedidos entre máquinas.
  let dragging: { kind: "machine" | "card"; id: string; part?: string } | null = null;
  panel.addEventListener("dragstart", (e) => {
    const el = e.target as HTMLElement;
    const m = el.closest<HTMLElement>("[data-machine]")?.dataset.machine;
    const c = el.closest<HTMLElement>("[data-card]");
    dragging = m ? { kind: "machine", id: m } : c ? { kind: "card", id: c.dataset.card!, part: c.dataset.part } : null;
    if (!dragging) return;
    e.dataTransfer?.setData("text/plain", dragging.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
    // Marca dónde se puede soltar.
    if (dragging.kind === "machine") {
      for (const d of panel.querySelectorAll<HTMLElement>(".cf-drop")) {
        const tool = d.dataset.dropTool;
        const ok = !!tool && !mountProblem(cat0, draft.molds, dragging.id, tool);
        d.classList.toggle("ok", ok);
        d.classList.toggle("no", !ok);
      }
    } else {
      const part = partsOf(evaluate().model).find((p) => p.id === dragging!.part);
      for (const col of panel.querySelectorAll<HTMLElement>("[data-col]")) {
        const ok = !col.dataset.col || !!part?.step.machines.includes(col.dataset.col);
        col.classList.toggle("ok", ok);
        col.classList.toggle("no", !ok);
      }
    }
  });
  panel.addEventListener("dragend", () => {
    dragging = null;
    panel.querySelectorAll(".dragging, .ok, .no, .over").forEach((x) => x.classList.remove("dragging", "ok", "no", "over"));
  });
  panel.addEventListener("dragover", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(dragging?.kind === "machine" ? "[data-drop-tool]" : "[data-col]");
    if (!dragging || !target) return;
    e.preventDefault();
    panel.querySelectorAll(".over").forEach((x) => x !== target && x.classList.remove("over"));
    target.classList.add("over");
  });
  panel.addEventListener("drop", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const el = e.target as HTMLElement;
    const model = evaluate().model;
    const d = dragging;
    dragging = null;
    if (d.kind === "machine") {
      const tool = el.closest<HTMLElement>("[data-drop-tool]")?.dataset.dropTool;
      if (tool) mount(d.id, tool);
      return;
    }
    const col = el.closest<HTMLElement>("[data-col]");
    if (!col || !d.part) return;
    // Suelta antes de la tarjeta que está bajo el cursor (en su mitad de arriba) o después.
    const over = el.closest<HTMLElement>("[data-card]");
    let before: string | null = null;
    if (over && over.dataset.card !== d.id) {
      const r = over.getBoundingClientRect();
      before = e.clientY < r.top + r.height / 2 ? over.dataset.card! : ((over.nextElementSibling as HTMLElement | null)?.dataset.card ?? null);
    }
    moveCard(d.id, d.part, col.dataset.col ?? "", before, model);
  });

  return { render };
}
