/**
 * CONFIGURACIÓN del APS de salsas: el usuario carga a mano los datos con los que programa la planta.
 *
 * Tres partes, en el orden en que se arma una planta nueva:
 *   1. PEDIDOS: agregar, editar (cantidad, entrega, importancia) y eliminar pedidos de la cartera.
 *   2. PRODUCTOS Y LLENADORAS: arrastrar una llenadora a un producto (SKU) para asignarla, quitarla, duplicar un SKU
 *      con otro nombre o quitar uno sin pedidos.
 *   3. SECUENCIA DEL PLANIFICADOR: arrastrar cada pedido a la llenadora que lo hace y ordenarlo dentro de ella.
 * Más VERSIONES: guardar la configuración con un nombre, abrir, usar en la planta o eliminar. Cada versión es una foto
 * completa (sin historial de cambios); la precargada de la demo siempre está y no se borra.
 *
 * Lo que se edita es un borrador: el plan manual que resultaría se recalcula con cada cambio (pedidos tarde, CIP,
 * merma) y no toca la planta hasta USAR EN LA PLANTA, que activa la versión para el APS, el emulador, el centro de
 * control y el 3D (store.ts) y vuelve a su plan manual.
 */
import { iso, parseLocal, type CustomerOrder, type Importance } from "@twin/cosim-core";
import { buildModel, type SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan, manualSequence } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { applyConfig, baseManual, basePortfolio, baseSauceData, configManual, configPortfolio, layoutEquipment } from "./data.ts";
import { activeConfig, configVersions, deleteConfigVersion, saveConfigVersion, setActiveConfig, type SauceConfig } from "./store.ts";
import { BULK_COLOR, dayLabel, dayNumber, when } from "./view.ts";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 1440;
const IMPORTANCE: [Importance, string][] = [["alta", "Alta"], ["normal", "Normal"], ["baja", "Baja"]];
export const PRELOADED = "PRECARGADA";

/** La configuración precargada de la demo (catálogo, cartera CART-2026-11 y secuencia APS-MAN-01). */
export function preloadedConfig(): SauceConfig {
  return {
    contract: "sauce-config.v1",
    id: PRELOADED,
    name: "Precargada de la demo",
    saved_at: "",
    orders: structuredClone(basePortfolio().orders),
    new_products: [],
    removed_products: [],
    fillers: {},
    sequence: structuredClone(baseManual().sequence),
    keep_order: false,
  };
}

/** Formato en ml de un SKU (su herramental de llenado, fmt-sachet-1000) y los que admite cada llenadora. */
const skuMl = (format?: string) => Number(format?.match(/(\d+)$/)?.[1] ?? 0);
function fillerFormats(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const e of layoutEquipment()) {
    if (!e.id.startsWith("filler-")) continue;
    const p = e.params ?? {};
    const list = Array.isArray(p.formats_ml) ? (p.formats_ml as number[]) : [Number(p.unit_ml ?? 0)];
    out[e.id] = list.map(Number);
  }
  return out;
}

export interface ConfigHost {
  now: number;
  start: number;
  /** Se activó una versión: la pantalla se vuelve a armar con esos datos. */
  activated(): void;
}

type Section = "orders" | "products" | "sequence" | "versions";

export function mountConfig(panel: HTMLElement, host: ConfigHost): { render(): void } {
  const formats = fillerFormats();
  const baseModel = buildModel(baseSauceData());
  const active = activeConfig();
  let draft: SauceConfig = structuredClone(active ?? preloadedConfig());
  let dirty = false;
  let section: Section = "orders";
  let msg = "";
  let msgBad = false;
  let editingName = false;
  let dupOf: string | null = null;

  const today = Math.floor(host.now / DAY) * DAY;
  const lastDue = Math.max(...basePortfolio().orders.map((o) => parseLocal(o.due)));
  const dueClose = baseModel.calendar.shifts.map((x) => x.end).sort().at(-1) ?? "22:00";
  const pending = (o: CustomerOrder) => parseLocal(o.due) >= today + DAY;

  /** El modelo y el plan manual que daría el borrador (o el error que lo impide). */
  function evaluate(): { model: SauceModel; kpis?: { late: number; tard: number; cip: number; waste: number }; error?: string } {
    let model = baseModel;
    try {
      model = buildModel(applyConfig(baseSauceData(), draft));
      const p = manualPlan(model, configPortfolio(draft), configManual(draft));
      return { model, kpis: { late: p.kpis.late_orders, tard: p.kpis.tardiness_h, cip: p.kpis.cip_h ?? 0, waste: p.kpis.waste_kg ?? 0 } };
    } catch (err) {
      return { model, error: (err as Error).message ?? String(err) };
    }
  }

  const say = (text: string, bad = false) => {
    msg = text;
    msgBad = bad;
  };
  const changed = () => {
    dirty = true;
    render();
  };
  const fillerOf = () => {
    const m = new Map<string, string>();
    for (const [f, ids] of Object.entries(draft.sequence)) for (const id of ids) m.set(id, f);
    return m;
  };
  const unassign = (id: string) => {
    for (const f of Object.keys(draft.sequence)) draft.sequence[f] = draft.sequence[f].filter((x) => x !== id);
  };

  // ------------------------------------------------------------------ vistas
  function render() {
    const ev = evaluate();
    const opened = draft.id === PRELOADED ? "la precargada de la demo" : `«${draft.name}»`;
    const isActive = (active?.id ?? PRELOADED) === draft.id;
    const k = ev.kpis;
    const head = `
      <div class="cf-head">
        <div class="cf-head-t">
          <h2 class="fr-title">⚙ Configuración de la planta</h2>
          <p class="fr-intro">Aquí se cargan a mano los datos con los que el APS programa: los pedidos, qué llenadora hace cada producto y la secuencia del planificador. La demo abre con una configuración precargada; cualquier cambio queda en un borrador hasta que lo guardes como versión y lo uses en la planta.</p>
          <p class="cf-open">Editando ${esc(opened)}${isActive ? ' <span class="chip done">EN LA PLANTA</span>' : ""}${dirty ? ' <span class="chip late">CAMBIOS SIN GUARDAR</span>' : ""}</p>
        </div>
        <div class="cf-preview">
          <div class="fr-k">PLAN MANUAL CON ESTE BORRADOR</div>
          ${k ? `<div class="cf-kpis"><div><b class="${k.late ? "bad" : "ok"}">${num(k.late)}</b><small>pedidos tarde</small></div><div><b>${num(k.tard, 1)} h</b><small>atraso</small></div><div><b>${num(k.cip, 1)} h</b><small>de CIP</small></div><div><b>${num(k.waste)} kg</b><small>merma</small></div></div>` : `<p class="bad small">${esc(ev.error ?? "")}</p>`}
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
            ["products", "2 · PRODUCTOS Y LLENADORAS"],
            ["sequence", "3 · SECUENCIA DEL PLANIFICADOR"],
            ["versions", `VERSIONES GUARDADAS (${configVersions().length})`],
          ] as [Section, string][]
        )
          .map(([s, t]) => `<button data-cf="${s}" class="${section === s ? "active" : ""}">${t}</button>`)
          .join("")}
      </nav>`;
    const body = section === "orders" ? ordersView(ev.model) : section === "products" ? productsView(ev.model) : section === "sequence" ? sequenceView(ev.model) : versionsView();
    panel.innerHTML = head + body;
  }

  function dueOptions(selected?: string) {
    const opts: string[] = [];
    for (let t = today + DAY; t <= lastDue; t += DAY) {
      const v = iso(t, baseModel.timezone).slice(0, 10);
      opts.push(`<option value="${v}"${selected?.slice(0, 10) === v ? " selected" : ""}>${esc(dayLabel(t, host.start))}</option>`);
    }
    return opts.join("");
  }

  function ordersView(model: SauceModel) {
    const skus = Object.values(model.products);
    const list = draft.orders.filter(pending).sort((a, b) => parseLocal(a.due) - parseLocal(b.due) || a.id.localeCompare(b.id));
    const past = draft.orders.length - list.length;
    const customers = [...new Set(draft.orders.map((o) => o.customer))].sort();
    const rows = list
      .map((o) => {
        const sku = model.products[o.product];
        return `<tr data-row="${esc(o.id)}"${o.added ? ' class="cf-new"' : ""}>
          <td><b>${esc(o.id)}</b>${o.added ? ' <span class="chip now">NUEVO</span>' : ""}</td>
          <td>${esc(o.customer)}</td>
          <td><i class="dot" style="background:${BULK_COLOR[sku?.bulk ?? ""] ?? "#9ab"}"></i>${esc(sku?.name ?? o.product)}</td>
          <td><input class="cf-in" data-edit="quantity" type="number" min="1" step="1" value="${o.quantity}" /></td>
          <td><select class="cf-in" data-edit="due">${dueOptions(o.due)}</select></td>
          <td><select class="cf-in" data-edit="importance">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${o.importance === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><button class="cf-del" data-del="${esc(o.id)}" title="Eliminar el pedido">🗑 ELIMINAR</button></td>
        </tr>`;
      })
      .join("");
    return `
      <section class="aps-add cf-add">
        <div class="label">AGREGAR PEDIDO</div>
        <div class="aps-add-grid">
          <label class="f-wide">Cliente <input id="cf-customer" list="cf-customers" placeholder="Nombre del cliente" /></label>
          <datalist id="cf-customers">${customers.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
          <label>Producto <select id="cf-product">${skus.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
          <label>Cantidad (u) <input id="cf-qty" type="number" min="1" step="1" value="2000" /></label>
          <label>Entrega (cierre ${esc(dueClose)}) <select id="cf-due">${dueOptions(iso(today + 3 * DAY, baseModel.timezone))}</select></label>
          <label>Importancia <select id="cf-imp">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${v === "normal" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <button id="cf-add" class="primary">＋ AGREGAR</button>
        </div>
      </section>
      <p class="dim small">${list.length} pedidos por entregar desde mañana (se editan aquí mismo: cantidad, entrega e importancia) y ${past} ya entregados o de hoy, que quedan como están. Un pedido nuevo entra a la secuencia del planificador como «sin asignar»: el plan manual lo pone al final de su línea hasta que lo ubiques en el paso 3.</p>
      <div class="aps-table-wrap"><table class="route-table aps-table cf-orders">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Unidades</th><th>Entrega</th><th>Importancia</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  function productsView(model: SauceModel) {
    const counts: Record<string, number> = {};
    for (const o of draft.orders) if (pending(o)) counts[o.product] = (counts[o.product] ?? 0) + 1;
    const bulkName = (b: string) => baseSauceData().products.products.find((p) => p.id === b)?.name ?? b;
    const palette = model.fillers
      .concat(baseModel.fillers.filter((f) => !model.fillers.includes(f)))
      .map((f) => `<span class="cf-filler" draggable="true" data-filler="${esc(f)}"><b>${esc(f)}</b><small>${formats[f]?.map((x) => `${num(x)} ml`).join(" / ") ?? ""}</small></span>`)
      .join("");
    const isNew = new Set(draft.new_products.map((p) => p.id));
    const cards = Object.values(model.products)
      .map((p) => {
        const ml = skuMl(p.format);
        const chips = p.fillers.map((f, i) => `<span class="cf-chip${i === 0 ? " first" : ""}">${esc(f)}<button data-unassign="${esc(p.id)}|${esc(f)}" title="Quitar esta llenadora">✕</button></span>`).join("");
        return `<article class="cf-sku" data-sku="${esc(p.id)}">
          <div class="cf-sku-h"><i class="dot" style="background:${BULK_COLOR[p.bulk] ?? "#9ab"}"></i><b>${esc(p.name)}</b>${isNew.has(p.id) ? ' <span class="chip now">NUEVO</span>' : ""}</div>
          <p class="dim small">${esc(p.id)} · receta ${esc(bulkName(p.bulk))} · ${num(ml)} ml · ${counts[p.id] ?? 0} pedidos por entregar</p>
          <div class="cf-drop" data-drop-sku="${esc(p.id)}">${chips}<span class="cf-hint">suelta aquí una llenadora de ${num(ml)} ml</span></div>
          <div class="cf-sku-b">
            ${dupOf === p.id
              ? `<span class="cf-name"><input id="cf-dup-name" value="${esc(p.name)} (nuevo)" /><button id="cf-dup-ok" class="primary">✓ CREAR</button><button id="cf-dup-x">✕</button></span>`
              : `<button data-dup="${esc(p.id)}">⧉ DUPLICAR</button><button data-rmsku="${esc(p.id)}"${counts[p.id] ? ' disabled title="Tiene pedidos: elimínalos o cámbialos primero"' : ""}>🗑 QUITAR</button>`}
          </div>
        </article>`;
      })
      .join("");
    return `
      <p class="dim small">Cada producto (SKU) es una receta en un formato. Arrastra una llenadora desde la barra y suéltala sobre un producto para asignarla; la primera es la habitual y las demás, alternativas que el APS puede usar. Solo se aceptan llenadoras con ese formato montable. ⧉ DUPLICAR crea un SKU nuevo con la misma receta y formato.</p>
      <div class="cf-palette"><span class="fr-k">LLENADORAS</span>${palette}</div>
      <div class="cf-skus">${cards}</div>`;
  }

  function sequenceView(model: SauceModel) {
    const where = fillerOf();
    const byId = new Map(draft.orders.map((o) => [o.id, o]));
    const card = (o: CustomerOrder) => {
      const sku = model.products[o.product];
      return `<div class="cf-card${o.added ? " cf-new" : ""}" draggable="true" data-card="${esc(o.id)}" style="--c:${BULK_COLOR[sku?.bulk ?? ""] ?? "#9ab"}">
        <b>${esc(o.id)}</b><span>${esc(sku?.name.replace(/^Salsa de |^Salsa /, "") ?? o.product)}</span><small>${num(o.quantity)} u · entrega ${esc(dayLabel(parseLocal(o.due), host.start).split(" · ")[0])}${o.importance === "alta" ? " · ALTA" : ""}</small>
      </div>`;
    };
    const pool = draft.orders.filter((o) => pending(o) && !where.has(o.id)).sort((a, b) => parseLocal(a.due) - parseLocal(b.due));
    const cols = model.fillers
      .map((f) => {
        const ids = (draft.sequence[f] ?? []).filter((id) => byId.has(id) && pending(byId.get(id)!));
        return `<div class="cf-col" data-col="${esc(f)}"><div class="cf-col-h"><b>${esc(f)}</b><small>${formats[f]?.map((x) => `${num(x)} ml`).join(" / ") ?? ""} · ${ids.length} pedidos</small></div><div class="cf-col-b">${ids.map((id) => card(byId.get(id)!)).join("")}</div></div>`;
      })
      .join("");
    return `
      <p class="dim small">La secuencia es lo que el planificador decide a mano: en qué llenadora va cada pedido y en qué orden. Arrastra una tarjeta a otra llenadora (solo se aceptan las que pueden llenar ese producto) o súbela o bájala dentro de la suya. Se muestran los pedidos por entregar desde mañana. ${draft.keep_order ? "<b>Se respeta el orden que pusiste.</b>" : "Mientras no reordenes, cada línea los hace por orden de llegada."}
        <button id="cf-auto">↺ ASIGNAR POR ORDEN DE LLEGADA</button></p>
      <div class="cf-board">
        <div class="cf-col pool" data-col=""><div class="cf-col-h"><b>SIN ASIGNAR</b><small>${pool.length} pedidos</small></div><div class="cf-col-b">${pool.map(card).join("")}</div></div>
        ${cols}
      </div>`;
  }

  function versionsView() {
    const act = active?.id ?? PRELOADED;
    const row = (c: SauceConfig) => `<tr class="${c.id === draft.id ? "sel" : ""}">
      <td><b>${esc(c.name)}</b>${c.id === act ? ' <span class="chip done">EN LA PLANTA</span>' : ""}${c.id === draft.id ? ' <span class="chip now">ABIERTA</span>' : ""}</td>
      <td>${c.saved_at ? esc(when(c.saved_at)) : "—"}</td>
      <td class="num">${num(c.orders.length)}</td>
      <td class="num">${num(c.new_products.length)}</td>
      <td class="fr-btns"><button data-open="${esc(c.id)}">ABRIR</button><button data-use="${esc(c.id)}"${c.id === act ? " disabled" : ""}>✓ USAR EN LA PLANTA</button>${c.id === PRELOADED ? "" : `<button class="cf-del" data-rmver="${esc(c.id)}">🗑 ELIMINAR</button>`}</td>
    </tr>`;
    return `
      <p class="dim small">Cada versión guarda la configuración completa tal como quedó (pedidos, productos, llenadoras y secuencia), sin el historial de cambios. Se guardan en este navegador. La precargada de la demo siempre está.</p>
      <div class="aps-table-wrap"><table class="route-table aps-table cf-versions">
        <thead><tr><th>Versión</th><th>Guardada</th><th class="num">Pedidos</th><th class="num">SKU nuevos</th><th></th></tr></thead>
        <tbody>${[preloadedConfig(), ...configVersions()].map(row).join("")}</tbody>
      </table></div>`;
  }

  // ------------------------------------------------------------------ acciones
  function addOrder() {
    const v = (id: string) => (panel.querySelector(`#${id}`) as HTMLInputElement).value;
    const customer = v("cf-customer").trim();
    const qty = Math.round(Number(v("cf-qty")));
    if (!customer) return say("Escribe el cliente.", true), render();
    if (!(qty > 0)) return say("La cantidad debe ser mayor que cero.", true), render();
    const due = `${v("cf-due")}T${dueClose}${baseModel.timezone}`;
    const d = String(dayNumber(parseLocal(due), host.start)).padStart(2, "0");
    let n = 1;
    while (draft.orders.some((o) => o.id === `PED-D${d}-${String(n).padStart(2, "0")}`)) n++;
    const id = `PED-D${d}-${String(n).padStart(2, "0")}`;
    draft.orders.push({ id, customer, product: v("cf-product"), quantity: qty, unit: "u", due, created: iso(host.now, baseModel.timezone), importance: v("cf-imp") as Importance, added: true });
    say(`${id} agregado. Ubícalo en una llenadora en el paso 3 o déjalo sin asignar.`);
    changed();
  }

  function assignFiller(sku: string, filler: string, model: SauceModel) {
    const p = model.products[sku];
    if (!p) return;
    const ml = skuMl(p.format);
    if (!formats[filler]?.includes(ml)) return say(`${filler} no tiene formato de ${num(ml)} ml: no puede llenar ${p.name}.`, true), render();
    if (p.fillers.includes(filler)) return say(`${filler} ya está asignada a ${p.name}.`, true), render();
    draft.fillers[sku] = [...p.fillers, filler];
    say(`${filler} asignada a ${p.name}.`);
    changed();
  }

  function unassignFiller(sku: string, filler: string, model: SauceModel) {
    const p = model.products[sku];
    if (!p) return;
    if (p.fillers.length <= 1) return say(`${p.name} necesita al menos una llenadora.`, true), render();
    draft.fillers[sku] = p.fillers.filter((f) => f !== filler);
    // Sus pedidos en esa llenadora quedan sin asignar.
    const ids = new Set(draft.orders.filter((o) => o.product === sku).map((o) => o.id));
    const moved = (draft.sequence[filler] ?? []).filter((id) => ids.has(id)).length;
    draft.sequence[filler] = (draft.sequence[filler] ?? []).filter((id) => !ids.has(id));
    say(`${filler} ya no llena ${p.name}${moved ? `; ${moved} pedidos quedaron sin asignar` : ""}.`);
    changed();
  }

  function moveCard(id: string, to: string, before: string | null, model: SauceModel) {
    const o = draft.orders.find((x) => x.id === id);
    if (!o) return;
    const from = fillerOf().get(id) ?? "";
    if (to && !model.products[o.product]?.fillers.includes(to)) return say(`${to} no puede llenar ${model.products[o.product]?.name ?? o.product}: asígnala en el paso 2 si tiene el formato.`, true), render();
    unassign(id);
    if (to) {
      const list = (draft.sequence[to] ??= []);
      const at = before ? list.indexOf(before) : -1;
      list.splice(at < 0 ? list.length : at, 0, id);
      // Reordenar dentro de una llenadora (o meter un pedido antes de otro) es decidir el orden: desde ahí se respeta.
      if (from === to || before) draft.keep_order = true;
    }
    say(to ? `${id} en ${to}${before ? `, antes de ${before}` : ", al final"}.` : `${id} quedó sin asignar.`);
    changed();
  }

  function saveAs(name: string) {
    const ids = configVersions().map((c) => Number(c.id.replace(/\D/g, "")) || 0);
    const id = `CFG-${String(Math.max(0, ...ids) + 1).padStart(2, "0")}`;
    draft = { ...draft, id, name: name.trim() || id, saved_at: iso(host.now, baseModel.timezone) };
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
    if (el.closest("#cf-add")) return addOrder();
    const del = el.closest<HTMLElement>("[data-del]")?.dataset.del;
    if (del) {
      draft.orders = draft.orders.filter((o) => o.id !== del);
      unassign(del);
      say(`${del} eliminado.`);
      return changed();
    }
    const un = el.closest<HTMLElement>("[data-unassign]")?.dataset.unassign;
    if (un) return unassignFiller(un.split("|")[0], un.split("|")[1], model);
    const dup = el.closest<HTMLElement>("[data-dup]")?.dataset.dup;
    if (dup) return (dupOf = dup), render();
    if (el.closest("#cf-dup-x")) return (dupOf = null), render();
    if (el.closest("#cf-dup-ok") && dupOf) {
      const name = (panel.querySelector("#cf-dup-name") as HTMLInputElement).value.trim();
      const all = new Set([...Object.keys(model.products), ...draft.new_products.map((p) => p.id)]);
      let n = 2;
      while (all.has(`${dupOf}-v${n}`)) n++;
      const id = `${dupOf}-v${n}`;
      const base = draft.new_products.find((p) => p.id === dupOf)?.base ?? dupOf;
      draft.new_products.push({ id, name: name || id, base });
      draft.fillers[id] = [...model.products[dupOf].fillers];
      say(`SKU ${id} creado a partir de ${model.products[dupOf].name}.`);
      dupOf = null;
      return changed();
    }
    const rm = el.closest<HTMLElement>("[data-rmsku]")?.dataset.rmsku;
    if (rm) {
      if (draft.orders.some((o) => o.product === rm)) return say("Ese producto tiene pedidos.", true), render();
      if (draft.new_products.some((p) => p.id === rm)) draft.new_products = draft.new_products.filter((p) => p.id !== rm);
      else draft.removed_products.push(rm);
      delete draft.fillers[rm];
      say(`${rm} quitado del catálogo.`);
      return changed();
    }
    if (el.closest("#cf-auto")) {
      const seq = manualSequence(model, configPortfolio(draft)).sequence;
      // Las entregas pasadas quedan donde estaban; lo pendiente se reparte por llegada.
      const past = new Set(draft.orders.filter((o) => !pending(o)).map((o) => o.id));
      draft.sequence = Object.fromEntries(model.fillers.map((f) => [f, [...(draft.sequence[f] ?? []).filter((id) => past.has(id)), ...(seq[f] ?? []).filter((id) => !past.has(id))]]));
      draft.keep_order = false;
      say("Pedidos repartidos por orden de llegada, alternando llenadoras.");
      return changed();
    }
    if (el.closest("#cf-save") && draft.id !== PRELOADED) {
      draft.saved_at = iso(host.now, baseModel.timezone);
      saveConfigVersion(draft);
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
        draft.saved_at = iso(host.now, baseModel.timezone);
        saveConfigVersion(draft);
      }
      return use(draft.id);
    }
    if (el.closest("#cf-revert")) {
      draft = structuredClone(draft.id === PRELOADED ? preloadedConfig() : (configVersions().find((c) => c.id === draft.id) ?? preloadedConfig()));
      dirty = false;
      say("Cambios descartados.");
      return render();
    }
    const open = el.closest<HTMLElement>("[data-open]")?.dataset.open;
    if (open) {
      draft = structuredClone(open === PRELOADED ? preloadedConfig() : configVersions().find((c) => c.id === open)!);
      dirty = false;
      section = "orders";
      say(`Abierta «${draft.name}».`);
      return render();
    }
    const u = el.closest<HTMLElement>("[data-use]")?.dataset.use;
    if (u) return use(u);
    const rmv = el.closest<HTMLElement>("[data-rmver]")?.dataset.rmver;
    if (rmv) {
      deleteConfigVersion(rmv);
      if (draft.id === rmv) (draft = preloadedConfig()), (dirty = false);
      say("Versión eliminada.");
      return render();
    }
  });

  // Edición en la tabla de pedidos.
  panel.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    const field = el.dataset.edit;
    const id = el.closest<HTMLElement>("[data-row]")?.dataset.row;
    const o = id ? draft.orders.find((x) => x.id === id) : null;
    if (!field || !o) return;
    if (field === "quantity") {
      const q = Math.round(Number(el.value));
      if (!(q > 0)) return say("La cantidad debe ser mayor que cero.", true), render();
      o.quantity = q;
    } else if (field === "due") o.due = `${el.value}T${dueClose}${baseModel.timezone}`;
    else if (field === "importance") o.importance = el.value as Importance;
    say(`${o.id} actualizado.`);
    changed();
  });

  // Arrastrar y soltar: llenadoras sobre productos y pedidos entre llenadoras.
  let dragging: { kind: "filler" | "card"; id: string } | null = null;
  panel.addEventListener("dragstart", (e) => {
    const el = e.target as HTMLElement;
    const f = el.closest<HTMLElement>("[data-filler]")?.dataset.filler;
    const c = el.closest<HTMLElement>("[data-card]")?.dataset.card;
    dragging = f ? { kind: "filler", id: f } : c ? { kind: "card", id: c } : null;
    if (!dragging) return;
    e.dataTransfer?.setData("text/plain", dragging.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
    // Marca dónde se puede soltar.
    const model = evaluate().model;
    if (dragging.kind === "filler") {
      for (const d of panel.querySelectorAll<HTMLElement>("[data-drop-sku]")) {
        const p = model.products[d.dataset.dropSku!];
        d.classList.toggle("ok", !!p && formats[dragging.id]?.includes(skuMl(p.format)) && !p.fillers.includes(dragging.id));
        d.classList.toggle("no", !d.classList.contains("ok"));
      }
    } else {
      const o = draft.orders.find((x) => x.id === dragging!.id);
      for (const col of panel.querySelectorAll<HTMLElement>("[data-col]")) {
        const ok = !col.dataset.col || (!!o && !!model.products[o.product]?.fillers.includes(col.dataset.col));
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
    const t = (e.target as HTMLElement).closest<HTMLElement>(dragging?.kind === "filler" ? "[data-drop-sku]" : "[data-col]");
    if (!dragging || !t) return;
    e.preventDefault();
    panel.querySelectorAll(".over").forEach((x) => x !== t && x.classList.remove("over"));
    t.classList.add("over");
  });
  panel.addEventListener("drop", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const el = e.target as HTMLElement;
    const model = evaluate().model;
    const d = dragging;
    dragging = null;
    if (d.kind === "filler") {
      const sku = el.closest<HTMLElement>("[data-drop-sku]")?.dataset.dropSku;
      if (sku) assignFiller(sku, d.id, model);
      return;
    }
    const col = el.closest<HTMLElement>("[data-col]");
    if (!col) return;
    // Suelta antes de la tarjeta que está bajo el cursor (en su mitad de arriba) o después.
    const over = el.closest<HTMLElement>("[data-card]");
    let before: string | null = null;
    if (over && over.dataset.card !== d.id) {
      const r = over.getBoundingClientRect();
      before = e.clientY < r.top + r.height / 2 ? over.dataset.card! : ((over.nextElementSibling as HTMLElement | null)?.dataset.card ?? null);
    }
    moveCard(d.id, col.dataset.col ?? "", before, model);
  });

  return { render };
}
