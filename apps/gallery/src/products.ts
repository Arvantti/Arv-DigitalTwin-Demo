/**
 * Productos de la planta, su hoja de ruta y el editor de rutas (docs/datos-reales.md, fase D y editor).
 *
 * La lista sale del catálogo que entrega la API (`catalog.products`). Al elegir un producto se resaltan en 3D los
 * equipos de cada etapa (los activos con su número y sus tiempos, las alternativas en gris), se dibuja el recorrido
 * y se abre el panel HOJA DE RUTA con la tabla de pasos: equipos, tiempo unitario, lote y tiempo hasta el siguiente.
 * EDITAR convierte la tabla en un editor: nombre de la etapa, herramental, tiempos, equipos (con clic en el 3D) y
 * orden de las etapas. Cada cambio se redibuja y se valida con la API (`/products/check`); el resultado se guarda en
 * la sesión del navegador o se descarga como YAML para el catálogo. "Cargar producto" sube un YAML ya hecho.
 */
import yaml from "js-yaml";
import * as THREE from "three";
import type { Stage } from "@twin/3d";

export interface StageTimes {
  unit: string;
  unit_s?: number;
  unit_source?: string;
  batch_qty?: number | null;
  batch_min?: number | null;
  batch_source?: string;
  transfer_min?: number;
}
export interface RouteStage {
  product: string;
  stage: string;
  equipment: string[];
  active: string[];
  tooling?: string;
  cycle_s?: number;
  batch_qty?: number;
  batch_min?: number;
  transfer_min?: number;
  times?: StageTimes;
}
/** Etapa tal como va en catalog/products.yaml. */
export interface RoutingRow {
  stage: string;
  equipment: string[];
  tooling?: string;
  cycle_s?: number;
  batch_qty?: number;
  batch_min?: number;
  transfer_min?: number;
  operators?: number;
}
/** Producto tal como va en catalog/products.yaml. */
export interface ProductSource {
  id: string;
  name: string;
  kind: "finished" | "semi";
  unit: string;
  routing: RoutingRow[];
  [key: string]: unknown;
}
export interface CatalogProduct {
  id: string;
  name: string;
  family?: string | null;
  kind: "finished" | "semi";
  unit: string;
  colors: { id: string; name: string; hex: string | null }[];
  bom: { item: string; qty: number; name: string }[];
  size?: string | null;
  tooling: {
    id: string;
    kind?: "mold" | "recipe" | "format" | "die";
    name: string;
    /** Resumen de una línea armado por la API (cavidades y ciclo, lote y rendimiento, formato…). */
    detail?: string;
    cavities?: number;
    part_g?: number;
    cycle_s?: number;
    material?: string | null;
    change_min?: number;
  }[];
  assumed?: boolean;
  source?: ProductSource;
  stages: RouteStage[];
  edges: [number, number][];
  /** Cargado o editado en esta sesión (no está en el catálogo del repositorio). */
  local?: boolean;
}
export interface CatalogDoc {
  products: CatalogProduct[];
  sizes: Record<string, string>;
  tooling?: { id: string; kind: string; name: string; product?: string; size?: string }[];
}
const TOOLING_LABEL: Record<string, string> = { mold: "Molde", recipe: "Receta", format: "Formato", die: "Troquel" };

interface Options {
  plantId: string;
  catalog: CatalogDoc;
  stage: Stage;
  /** Raíz 3D de cada equipo del plano. */
  rootOf: (id: string) => THREE.Object3D | undefined;
  /** Selecciona un equipo en el HUD. */
  select: (id: string) => void;
}
export interface ProductsApi {
  update: (time: number) => void;
  /** Clic en un equipo del 3D: true si el editor lo tomó (agregar o quitar de una etapa). */
  pick: (id: string) => boolean;
}

const STAGE_NAMES: Record<string, string> = {
  inyeccion: "Inyección",
  estiba: "Estiba en buffer",
  transporte: "Montacargas",
  "almacen-semielaborado": "Almacén de semielaborado",
  "almacen-terminado": "Bodega de terminado",
  ensamble: "Ensamble",
  empaque: "Empaque",
};
const stageName = (s: string) => STAGE_NAMES[s] ?? s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ROUTE_COLOR = "#ffb000";
const nf = (v: number, digits = 2) => v.toLocaleString("es-CO", { maximumFractionDigits: digits });

/** Tiempo en s, min o h según su tamaño. */
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${nf(seconds, seconds < 1 ? 3 : 1)} s`;
  if (seconds < 3 * 3600) return `${nf(seconds / 60, 1)} min`;
  return `${nf(seconds / 3600, 1)} h`;
}
const fmtUnit = (t?: StageTimes) => (t?.unit_s != null ? `${fmtDuration(t.unit_s)}/${t.unit}` : "");
const fmtBatch = (t?: StageTimes) =>
  t?.batch_qty ? `${nf(t.batch_qty, 1)} ${t.unit}${t.batch_min != null ? ` · ${fmtDuration(t.batch_min * 60)}` : ""}` : t?.batch_min != null ? fmtDuration(t.batch_min * 60) : "";

/** Etiqueta con el número de etapa, siempre de frente a la cámara. */
function badge(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#040421";
  g.font = "700 64px Inter, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 1.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Tiempos de la etapa junto al número: una o dos líneas sobre fondo oscuro. */
function timeLabel(lines: string[]): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "600 40px Inter, sans-serif";
  g.font = font;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 36;
  const h = lines.length * 50 + 20;
  c.width = w;
  c.height = h;
  g.fillStyle = "rgba(4, 4, 33, 0.82)";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = ROUTE_COLOR;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  g.font = font;
  g.textBaseline = "middle";
  lines.forEach((l, i) => {
    g.fillStyle = i === 0 ? "#ffffff" : "#ffd27a";
    g.fillText(l, 18, 35 + i * 50);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  const scale = 0.022;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.center.set(0, 0.5);
  sprite.renderOrder = 10;
  return sprite;
}

function edgesBox(box: THREE.Box3, color: string, opacity: number): THREE.LineSegments {
  const size = box.getSize(new THREE.Vector3());
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.4, size.y + 0.4, size.z + 0.4)),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  lines.position.copy(box.getCenter(new THREE.Vector3()));
  return lines;
}

/** Quita campos vacíos para que el YAML descargado quede como los del catálogo. */
function cleanSource(src: ProductSource): ProductSource {
  const routing = src.routing.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v))) out[k] = v;
    return out as unknown as RoutingRow;
  });
  return { ...src, routing };
}

export function buildProducts(opts: Options): ProductsApi {
  const { catalog, stage } = opts;
  const list = document.getElementById("products")!;
  const detail = document.getElementById("product-detail")!;
  const panel = document.getElementById("route-panel")!;
  const products = [...catalog.products];
  const toolingList = catalog.tooling ?? [];
  let current: string | null = null;
  let group: THREE.Group | null = null;
  const movers: { curve: THREE.Curve<THREE.Vector3>; mesh: THREE.Mesh; offset: number; length: number }[] = [];

  // Estado del editor
  let draft: ProductSource | null = null;
  let draftBase: CatalogProduct | null = null; // producto del que salen las etapas de los componentes
  let preview: CatalogProduct | null = null; // lo que se ve mientras se edita (validado por la API si se pudo)
  let validation: { state: "pending" | "ok" | "errors" | "offline"; errors: string[] } = { state: "pending", errors: [] };
  let pickRow: number | null = null;
  let checkTimer = 0;
  let checkSeq = 0;

  document.getElementById("products-section")!.hidden = false;

  // ------------------------------------------------------------------ 3D
  function clearRoute(): void {
    if (group) {
      stage.scene.remove(group);
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
        mat?.map?.dispose();
        mat?.dispose();
      });
    }
    group = null;
    movers.length = 0;
  }

  function drawRoute(p: CatalogProduct, frame: boolean): void {
    clearRoute();
    group = new THREE.Group();
    group.name = `ruta-${p.id}`;
    const color = p.colors.find((c) => c.hex)?.hex ?? ROUTE_COLOR;
    const all = new THREE.Box3();
    const points: (THREE.Vector3 | null)[] = [];
    p.stages.forEach((st, i) => {
      const boxes: THREE.Box3[] = [];
      for (const id of st.equipment) {
        const root = opts.rootOf(id);
        if (!root) continue;
        const box = new THREE.Box3().setFromObject(root);
        const active = st.active.includes(id);
        group!.add(edgesBox(box, active ? ROUTE_COLOR : "#9aa3b2", active ? 1 : 0.45));
        if (active) boxes.push(box);
      }
      if (!boxes.length) {
        points.push(null);
        return;
      }
      const box = boxes.reduce((a, b) => a.clone().union(b));
      all.union(box);
      const top = box.getCenter(new THREE.Vector3()).setY(box.max.y + 1.4);
      const tag = badge(String(i + 1), ROUTE_COLOR);
      tag.position.copy(top).add(new THREE.Vector3(0, 0.9, 0));
      group!.add(tag);
      const lines = [fmtUnit(st.times), st.times?.batch_qty || st.times?.batch_min ? `lote ${fmtBatch(st.times)}` : ""].filter(Boolean);
      if (lines.length) {
        const label = timeLabel(lines);
        label.position.copy(top).add(new THREE.Vector3(0.95, 0.9, 0));
        group!.add(label);
      }
      points.push(top);
    });
    const tubeMat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: ROUTE_COLOR, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
    const pieceMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    for (const [a, b] of p.edges) {
      const pa = points[a];
      const pb = points[b];
      if (!pa || !pb || pa.distanceTo(pb) < 0.5) continue;
      const mid = pa.clone().lerp(pb, 0.5);
      mid.y = Math.max(pa.y, pb.y) + Math.min(5, 0.6 + pa.distanceTo(pb) * 0.06);
      const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.12, 6, false), tubeMat));
      const length = curve.getLength();
      const n = Math.max(1, Math.round(length / 12));
      for (let k = 0; k < n; k++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), pieceMat);
        group.add(mesh);
        movers.push({ curve, mesh, offset: k / n, length });
      }
    }
    stage.scene.add(group);
    if (frame && !all.isEmpty()) {
      const size = all.getSize(new THREE.Vector3());
      const probe = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
      probe.position.copy(all.getCenter(new THREE.Vector3()));
      probe.updateMatrixWorld(true);
      stage.frame(probe, 0.95);
    }
  }

  // ------------------------------------------------------------------ barra lateral
  function renderDetail(p: CatalogProduct | null, errors: string[] = []): void {
    if (errors.length) {
      detail.innerHTML = `<div class="product-errors"><b>No se pudo cargar el producto</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      return;
    }
    if (!p) {
      detail.innerHTML = "";
      return;
    }
    const molds = p.tooling
      .map((m) => {
        const d = m.detail ?? `${m.cavities ?? "?"} cav · ${m.part_g ?? "?"} g · ${m.cycle_s ?? "?"} s · ${m.material ?? ""}`;
        return `<div class="kv"><span>${TOOLING_LABEL[m.kind ?? "mold"]}</span><span>${esc(m.name)} · ${esc(d)}</span></div>`;
      })
      .join("");
    const bom = p.bom.map((b) => `<div class="kv"><span>Lleva</span><span>${nf(b.qty, 4)} × ${esc(b.name)}</span></div>`).join("");
    const colors = p.colors.map((c) => `<i class="swatch" style="background:${esc(c.hex ?? "#888")}" title="${esc(c.name)}"></i>`).join("");
    detail.innerHTML = `
      <div class="product-card">
        <div class="product-name">${esc(p.name)} ${colors}</div>
        <div class="dim">${p.kind === "semi" ? "Semielaborado" : "Producto terminado"}${p.size ? ` · ${esc(p.size)}` : ""}${p.family ? ` · ${esc(p.family)}` : ""}${p.local ? " · de esta sesión" : ""}${p.assumed ? " · datos supuestos" : ""}</div>
        ${molds}${bom}
        <div class="dim route-hint">La hoja de ruta está en el panel de abajo.</div>
      </div>`;
  }

  function renderList(): void {
    list.innerHTML = products
      .map(
        (p) =>
          `<li data-product="${esc(p.id)}" class="${p.id === current ? "active" : ""}">${esc(p.name)}<small>${p.kind === "semi" ? "semielaborado" : "terminado"} · ${p.stages.length} etapas${p.local ? " · nuevo" : ""}</small></li>`,
      )
      .join("");
    list.querySelectorAll<HTMLLIElement>("li").forEach((li) => (li.onclick = () => choose(li.dataset.product!)));
  }

  // ------------------------------------------------------------------ panel HOJA DE RUTA
  function stageRows(p: CatalogProduct): string {
    return p.stages
      .map((st, i) => {
        const where = st.active.map((id) => `<a href="#" data-eq="${esc(id)}">${esc(id)}</a>`).join(", ") || '<span class="bad">sin equipo</span>';
        const alt = st.equipment.filter((e) => !st.active.includes(e));
        const owner = st.product !== p.id ? `<div class="dim small">${esc(products.find((x) => x.id === st.product)?.name ?? st.product)}</div>` : "";
        const t = st.times;
        const tool = st.tooling ? `<div class="dim small">${esc(toolingList.find((x) => x.id === st.tooling)?.name ?? st.tooling)}</div>` : "";
        return `<tr>
          <td class="n"><span>${i + 1}</span></td>
          <td>${owner}<b>${esc(stageName(st.stage))}</b>${tool}</td>
          <td>${where}${alt.length ? `<div class="dim small">alternativas: ${alt.map(esc).join(", ")}</div>` : ""}</td>
          <td title="${esc(t?.unit_source ?? "")}">${esc(fmtUnit(t)) || '<span class="dim">—</span>'}</td>
          <td title="${esc(t?.batch_source ?? "")}">${esc(fmtBatch(t)) || '<span class="dim">sin lote</span>'}</td>
          <td>${t?.transfer_min != null ? esc(fmtDuration(t.transfer_min * 60)) : '<span class="dim">—</span>'}</td>
        </tr>`;
      })
      .join("");
  }

  const numInput = (row: number, key: keyof RoutingRow, value: unknown, placeholder: string, title: string) =>
    `<input type="number" min="0" step="any" data-row="${row}" data-key="${key}" value="${value ?? ""}" placeholder="${esc(placeholder)}" title="${esc(title)}" />`;

  function editRows(): string {
    const base = draftBase;
    const comps = base ? base.stages.filter((st) => st.product !== base.id) : [];
    const own = preview ? preview.stages.filter((st) => st.product === draft!.id) : [];
    // Las etapas de cada componente van en una sola fila: se editan en su propio producto.
    const groups: { product: string; from: number; to: number; names: string[] }[] = [];
    comps.forEach((st, i) => {
      const last = groups[groups.length - 1];
      if (last && last.product === st.product) {
        last.to = i + 1;
        last.names.push(stageName(st.stage));
      } else groups.push({ product: st.product, from: i + 1, to: i + 1, names: [stageName(st.stage)] });
    });
    const compRows = groups
      .map(
        (g) =>
          `<tr class="readonly"><td class="n"><span>${g.from}</span></td><td colspan="6">Etapas ${g.from} a ${g.to}: <b>${esc(products.find((x) => x.id === g.product)?.name ?? g.product)}</b> <span class="dim small">(${esc(g.names.join(" → "))}; se edita en su propio producto)</span></td></tr>`,
      )
      .join("");
    const rows = draft!.routing
      .map((r, i) => {
        const t = own[i]?.times;
        const chips = r.equipment
          .map((id) => `<span class="chip">${esc(id)}<button data-row="${i}" data-remove="${esc(id)}" title="Quitar">×</button></span>`)
          .join("");
        const picking = pickRow === i;
        const tools = [`<option value="">— sin herramental —</option>`]
          .concat(toolingList.map((x) => `<option value="${esc(x.id)}" ${x.id === r.tooling ? "selected" : ""}>${esc(TOOLING_LABEL[x.kind] ?? x.kind)}: ${esc(x.name)}</option>`))
          .join("");
        return `<tr class="${picking ? "picking" : ""}">
          <td class="n"><span>${comps.length + i + 1}</span></td>
          <td><input type="text" data-row="${i}" data-key="stage" value="${esc(r.stage)}" /><select data-row="${i}" data-key="tooling">${tools}</select></td>
          <td>${chips}<button class="pick ${picking ? "active" : ""}" data-pick="${i}">${picking ? "clic en el 3D… (Esc)" : "＋ equipo"}</button></td>
          <td>${numInput(i, "cycle_s", r.cycle_s, t?.unit_s != null && r.cycle_s == null ? `${nf(t.unit_s, 3)} (calc.)` : "s por unidad", t?.unit_source ?? "Segundos por unidad del producto")}</td>
          <td>${numInput(i, "batch_qty", r.batch_qty, t?.batch_qty && r.batch_qty == null ? `${nf(t.batch_qty)} (calc.)` : "cantidad", t?.batch_source ?? "Lote mínimo")}
              ${numInput(i, "batch_min", r.batch_min, t?.batch_min != null && r.batch_min == null ? `${nf(t.batch_min)} (calc.)` : "min", "Duración del lote en minutos")}</td>
          <td>${numInput(i, "transfer_min", r.transfer_min, "min", "Minutos hasta la etapa siguiente")}</td>
          <td class="row-actions"><button data-move="${i}" data-dir="-1" title="Subir" ${i === 0 ? "disabled" : ""}>↑</button><button data-move="${i}" data-dir="1" title="Bajar" ${i === draft!.routing.length - 1 ? "disabled" : ""}>↓</button><button data-delete="${i}" title="Quitar etapa">✕</button></td>
        </tr>`;
      })
      .join("");
    return compRows + rows;
  }

  function validationBox(): string {
    if (validation.state === "pending") return `<div class="validation dim">Validando…</div>`;
    if (validation.state === "offline")
      return `<div class="validation warn">Sin la API del gemelo no se puede validar contra la planta ni calcular los tiempos que salen del plano; la vista previa usa solo lo que escribes.</div>`;
    if (validation.state === "ok") return `<div class="validation ok">✓ La ruta es válida para esta planta.</div>`;
    return `<div class="validation bad"><b>Para guardar falta corregir:</b><ul>${validation.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
  }

  function renderPanel(): void {
    const p = draft ? preview : products.find((x) => x.id === current) ?? null;
    if (!p && !draft) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (!draft) {
      const prod = p!;
      panel.innerHTML = `
        <div class="route-sticky"><div class="route-head">
          <div><div class="label">HOJA DE RUTA</div><div class="route-title">${esc(prod.name)}</div></div>
          <div class="route-buttons">
            <button id="rp-edit" class="primary" ${prod.source ? "" : "disabled"}>✎ EDITAR</button>
            <button id="rp-dup" ${prod.source ? "" : "disabled"}>⧉ DUPLICAR</button>
            <button id="rp-yaml" ${prod.source ? "" : "disabled"}>⤓ YAML</button>
            <button id="rp-close" title="Cerrar">✕</button>
          </div>
        </div></div>
        <table class="route-table">
          <thead><tr><th>#</th><th>Etapa</th><th>Equipos</th><th>Tiempo unitario</th><th>Lote (mínimo)</th><th>Hasta la siguiente</th></tr></thead>
          <tbody>${stageRows(prod)}</tbody>
        </table>
        <div class="dim small">Pasa el cursor sobre un tiempo para ver de dónde sale (catálogo, molde, receta o plano). Sin lote: la etapa trabaja pieza a pieza.</div>`;
      panel.querySelector("#rp-edit")?.addEventListener("click", () => startEdit(prod, false));
      panel.querySelector("#rp-dup")?.addEventListener("click", () => startEdit(prod, true));
      panel.querySelector("#rp-yaml")?.addEventListener("click", () => download(prod.source!));
      panel.querySelector("#rp-close")?.addEventListener("click", () => choose(null));
      panel.querySelectorAll<HTMLAnchorElement>("a[data-eq]").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          opts.select(a.dataset.eq!);
        }),
      );
      return;
    }
    const d = draft;
    panel.innerHTML = `
      <div class="route-sticky"><div class="route-head">
        <div><div class="label">EDITANDO HOJA DE RUTA</div>
          <div class="route-fields">
            <label>Id <input type="text" id="rp-id" value="${esc(d.id)}" /></label>
            <label>Nombre <input type="text" id="rp-name" value="${esc(d.name)}" /></label>
            <label>Tipo <select id="rp-kind"><option value="finished" ${d.kind === "finished" ? "selected" : ""}>terminado</option><option value="semi" ${d.kind === "semi" ? "selected" : ""}>semielaborado</option></select></label>
            <label>Unidad <select id="rp-unit">${["u", "kg", "l"].map((u) => `<option ${d.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="route-buttons">
          <button id="rp-save" class="primary" ${validation.state === "ok" ? "" : "disabled"} title="Queda en este navegador hasta que exista el almacenamiento (fase F)">✓ GUARDAR EN LA SESIÓN</button>
          <button id="rp-yaml">⤓ YAML</button>
          <button id="rp-cancel">CANCELAR</button>
        </div>
      </div>
      ${validationBox()}</div>
      <table class="route-table edit">
        <thead><tr><th>#</th><th>Etapa y herramental</th><th>Equipos</th><th>Tiempo unitario (s)</th><th>Lote: cantidad · min</th><th>Hasta la siguiente (min)</th><th></th></tr></thead>
        <tbody>${editRows()}</tbody>
      </table>
      <div class="route-foot"><button id="rp-add">＋ ETAPA</button><span class="dim small">Vacío = lo calcula el sistema (molde, receta o plano). Para un equipo, pulsa ＋ equipo y haz clic sobre él en el 3D; otro clic sobre un equipo ya agregado lo quita.</span></div>`;
    const field = (id: string) => panel.querySelector<HTMLInputElement>(id)!;
    field("#rp-id").onchange = (e) => edit(() => (d.id = (e.target as HTMLInputElement).value.trim()));
    field("#rp-name").onchange = (e) => edit(() => (d.name = (e.target as HTMLInputElement).value));
    panel.querySelector<HTMLSelectElement>("#rp-kind")!.onchange = (e) => edit(() => (d.kind = (e.target as HTMLSelectElement).value as ProductSource["kind"]));
    panel.querySelector<HTMLSelectElement>("#rp-unit")!.onchange = (e) => edit(() => (d.unit = (e.target as HTMLSelectElement).value));
    panel.querySelector("#rp-save")!.addEventListener("click", save);
    panel.querySelector("#rp-yaml")!.addEventListener("click", () => download(d));
    panel.querySelector("#rp-cancel")!.addEventListener("click", cancelEdit);
    panel.querySelector("#rp-add")!.addEventListener("click", () => edit(() => d.routing.push({ stage: `etapa-${d.routing.length + 1}`, equipment: [] })));
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]").forEach((el) => {
      el.onchange = () => {
        const row = d.routing[Number(el.dataset.row)];
        const key = el.dataset.key as keyof RoutingRow;
        const raw = el.value.trim();
        edit(() => {
          if (key === "stage") row.stage = raw;
          else if (key === "tooling") row.tooling = raw || undefined;
          else (row as unknown as Record<string, number | undefined>)[key] = raw === "" ? undefined : Number(raw);
        });
      };
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => {
      b.onclick = () => edit(() => (d.routing[Number(b.dataset.row)].equipment = d.routing[Number(b.dataset.row)].equipment.filter((x) => x !== b.dataset.remove)));
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => {
      b.onclick = () => {
        pickRow = pickRow === Number(b.dataset.pick) ? null : Number(b.dataset.pick);
        renderPanel();
      };
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((b) => {
      b.onclick = () =>
        edit(() => {
          const i = Number(b.dataset.move);
          const j = i + Number(b.dataset.dir);
          [d.routing[i], d.routing[j]] = [d.routing[j], d.routing[i]];
        });
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((b) => {
      b.onclick = () => edit(() => d.routing.splice(Number(b.dataset.delete), 1));
    });
  }

  // ------------------------------------------------------------------ editor
  /** Vista previa local: las etapas de los componentes del producto base y las del borrador, sin validar. */
  function localPreview(): CatalogProduct {
    const d = draft!;
    const base = draftBase;
    const comps = base ? base.stages.filter((st) => st.product !== base.id) : [];
    const compEdges = base ? base.edges.filter(([a, b]) => a < comps.length && b < comps.length) : [];
    const ends = base ? base.edges.filter(([a, b]) => a < comps.length && b === comps.length).map(([a]) => a) : [];
    const own: RouteStage[] = d.routing.map((r) => ({
      product: d.id,
      ...r,
      active: [...r.equipment],
      times: {
        unit: d.unit,
        unit_s: r.cycle_s,
        unit_source: r.cycle_s != null ? "catálogo" : undefined,
        batch_qty: r.batch_qty,
        batch_min: r.batch_min,
        transfer_min: r.transfer_min,
      },
    }));
    const first = comps.length;
    const edges: [number, number][] = [...compEdges, ...(own.length ? ends.map((a) => [a, first] as [number, number]) : [])];
    for (let i = 0; i < own.length - 1; i++) edges.push([first + i, first + i + 1]);
    return {
      ...(base ?? { colors: [], bom: [], tooling: [] }),
      id: d.id,
      name: d.name,
      kind: d.kind,
      unit: d.unit,
      source: d,
      stages: [...comps, ...own],
      edges,
      local: true,
    } as CatalogProduct;
  }

  function edit(change: () => void): void {
    change();
    preview = localPreview();
    validation = { state: "pending", errors: [] };
    drawRoute(preview, false);
    renderPanel();
    window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(check, 350);
  }

  async function check(): Promise<void> {
    if (!draft) return;
    const seq = ++checkSeq;
    const body = JSON.stringify(cleanSource(draft));
    let res: { ok: boolean; errors: string[]; product?: CatalogProduct };
    try {
      const r = await fetch(`/api/plants/${opts.plantId}/products/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!r.ok) throw new Error(String(r.status));
      res = await r.json();
    } catch {
      if (seq !== checkSeq) return;
      validation = { state: "offline", errors: [] };
      renderPanel();
      return;
    }
    if (seq !== checkSeq || !draft) return;
    if (res.ok && res.product) {
      preview = { ...res.product, source: draft, local: true };
      validation = { state: "ok", errors: [] };
      drawRoute(preview, false);
    } else validation = { state: "errors", errors: res.errors };
    renderPanel();
  }

  function startEdit(p: CatalogProduct, duplicate: boolean): void {
    const src = structuredClone(p.source!) as ProductSource;
    if (duplicate) {
      src.id = `${src.id}-copia`;
      src.name = `${src.name} (copia)`;
    }
    draft = src;
    draftBase = p;
    pickRow = null;
    edit(() => {});
    drawRoute(preview!, true);
  }

  function startNew(): void {
    current = null;
    list.querySelectorAll("li").forEach((li) => li.classList.remove("active"));
    renderDetail(null);
    draft = { id: "producto-nuevo", name: "Producto nuevo", kind: "finished", unit: "u", routing: [{ stage: "etapa-1", equipment: [] }] };
    draftBase = null;
    pickRow = 0;
    edit(() => {});
  }

  function cancelEdit(): void {
    draft = null;
    draftBase = null;
    preview = null;
    pickRow = null;
    const p = products.find((x) => x.id === current) ?? null;
    if (p) drawRoute(p, false);
    else clearRoute();
    renderPanel();
  }

  function save(): void {
    if (!draft || !preview || validation.state !== "ok") return;
    const product = { ...preview, source: cleanSource(draft), local: true };
    const at = products.findIndex((x) => x.id === product.id);
    if (at >= 0) products[at] = product;
    else products.push(product);
    draft = null;
    draftBase = null;
    preview = null;
    pickRow = null;
    current = null;
    renderList();
    choose(product.id);
  }

  function download(src: ProductSource): void {
    const text = `# Producto para industrial-models/${opts.plantId}/catalog/products.yaml (hecho en el editor de rutas)\n${yaml.dump({ products: [cleanSource(src)] }, { lineWidth: 160, noRefs: true })}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
    a.download = `${src.id}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pick(id: string): boolean {
    if (!draft || pickRow === null) return false;
    const row = draft.routing[pickRow];
    if (!row) return false;
    edit(() => {
      row.equipment = row.equipment.includes(id) ? row.equipment.filter((x) => x !== id) : [...row.equipment, id];
    });
    opts.select(id);
    return true;
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pickRow !== null) {
      pickRow = null;
      renderPanel();
    }
  });

  // ------------------------------------------------------------------ selección
  function choose(id: string | null): void {
    if (draft) cancelEdit();
    current = id === current ? null : id;
    const p = products.find((x) => x.id === current) ?? null;
    list.querySelectorAll("li").forEach((li) => li.classList.toggle("active", li.dataset.product === current));
    if (p) drawRoute(p, true);
    else clearRoute();
    renderDetail(p);
    renderPanel();
  }

  // Cargar un producto: YAML o JSON con el formato de catalog/products.yaml (uno o una lista `products:`).
  const input = document.getElementById("product-file") as HTMLInputElement;
  document.getElementById("btn-load-product")!.onclick = () => input.click();
  document.getElementById("btn-new-product")!.onclick = startNew;
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    let items: unknown[];
    try {
      const data = yaml.load(await file.text()) as { products?: unknown[] } | unknown[];
      items = Array.isArray(data) ? data : (data as { products?: unknown[] }).products ?? [data];
    } catch (err) {
      renderDetail(null, [`El archivo no es YAML ni JSON válido: ${(err as Error).message}`]);
      return;
    }
    let lastOk: string | null = null;
    for (const item of items) {
      let res: { ok: boolean; errors: string[]; product?: CatalogProduct };
      try {
        const r = await fetch(`/api/plants/${opts.plantId}/products/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        if (!r.ok) throw new Error(String(r.status));
        res = await r.json();
      } catch {
        renderDetail(null, ["La validación necesita la API del gemelo; la versión publicada sin API solo muestra los productos del catálogo."]);
        return;
      }
      if (!res.ok || !res.product) {
        renderDetail(null, res.errors);
        return;
      }
      const product = { ...res.product, local: true };
      const at = products.findIndex((x) => x.id === product.id);
      if (at >= 0) products[at] = product;
      else products.push(product);
      lastOk = product.id;
    }
    renderList();
    current = null;
    if (lastOk) choose(lastOk);
  };

  renderList();
  const params = new URLSearchParams(location.search);
  const initial = params.get("product");
  if (initial && products.some((p) => p.id === initial)) {
    choose(initial);
    if (params.get("edit") === "1") startEdit(products.find((p) => p.id === initial)!, false);
  }

  return {
    update: (time: number) => {
      for (const m of movers) {
        const u = ((time * 6) / m.length + m.offset) % 1;
        m.mesh.position.copy(m.curve.getPoint(u));
      }
    },
    pick,
  };
}
