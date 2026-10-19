/**
 * Productos de la planta y su ruta en 3D (fase D de docs/datos-reales.md).
 *
 * La lista sale del catálogo que entrega la API (`catalog.products`); al elegir un producto se resaltan los equipos
 * de cada etapa (los activos con su número de etapa, las alternativas en gris) y se dibuja el recorrido entre etapas
 * con piezas que avanzan. "Cargar producto" valida un YAML con la API (`/products/check`) y lo agrega a la sesión.
 */
import yaml from "js-yaml";
import * as THREE from "three";
import type { Stage } from "@twin/3d";

export interface RouteStage {
  product: string;
  stage: string;
  equipment: string[];
  active: string[];
  tooling?: string;
  cycle_s?: number;
  transfer_min?: number;
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
  stages: RouteStage[];
  edges: [number, number][];
  /** Cargado en esta sesión (no está en el catálogo del repositorio). */
  local?: boolean;
}
const TOOLING_LABEL: Record<string, string> = { mold: "Molde", recipe: "Receta", format: "Formato", die: "Troquel" };

export interface CatalogDoc {
  products: CatalogProduct[];
  sizes: Record<string, string>;
}

interface Options {
  plantId: string;
  catalog: CatalogDoc;
  stage: Stage;
  /** Raíz 3D de cada equipo del plano. */
  rootOf: (id: string) => THREE.Object3D | undefined;
  /** Selecciona un equipo en el HUD. */
  select: (id: string) => void;
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

function edgesBox(box: THREE.Box3, color: string, opacity: number): THREE.LineSegments {
  const size = box.getSize(new THREE.Vector3());
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.4, size.y + 0.4, size.z + 0.4)),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  lines.position.copy(box.getCenter(new THREE.Vector3()));
  return lines;
}

export function buildProducts(opts: Options): (time: number) => void {
  const { catalog, stage } = opts;
  const list = document.getElementById("products")!;
  const detail = document.getElementById("product-detail")!;
  const products = [...catalog.products];
  let current: string | null = null;
  let group: THREE.Group | null = null;
  const movers: { curve: THREE.Curve<THREE.Vector3>; mesh: THREE.Mesh; offset: number; length: number }[] = [];

  document.getElementById("products-section")!.hidden = false;

  function clearRoute(): void {
    if (group) {
      stage.scene.remove(group);
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
    }
    group = null;
    movers.length = 0;
  }

  function drawRoute(p: CatalogProduct): void {
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
      for (let k = 0; k < Math.max(1, Math.round(length / 12)); k++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), pieceMat);
        group.add(mesh);
        movers.push({ curve, mesh, offset: k / Math.max(1, Math.round(length / 12)), length });
      }
    }
    stage.scene.add(group);
    if (!all.isEmpty()) {
      const size = all.getSize(new THREE.Vector3());
      const probe = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
      probe.position.copy(all.getCenter(new THREE.Vector3()));
      probe.updateMatrixWorld(true);
      stage.frame(probe, 0.95);
    }
  }

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
        const detail = m.detail ?? `${m.cavities ?? "?"} cav · ${m.part_g ?? "?"} g · ${m.cycle_s ?? "?"} s · ${m.material ?? ""}`;
        return `<div class="kv"><span>${TOOLING_LABEL[m.kind ?? "mold"]}</span><span>${esc(m.name)} · ${esc(detail)}</span></div>`;
      })
      .join("");
    const bom = p.bom.map((b) => `<div class="kv"><span>Lleva</span><span>${b.qty} × ${esc(b.name)}</span></div>`).join("");
    const colors = p.colors.map((c) => `<i class="swatch" style="background:${esc(c.hex ?? "#888")}" title="${esc(c.name)}"></i>`).join("");
    const stages = p.stages
      .map((st, i) => {
        const where = st.active.map((id) => `<a href="#" data-eq="${esc(id)}">${esc(id)}</a>`).join(", ");
        const alt = st.equipment.length > st.active.length ? ` <span class="dim">(+${st.equipment.length - st.active.length} alternativas)</span>` : "";
        const extra = [st.cycle_s ? `${st.cycle_s} s` : "", st.transfer_min ? `→ ${st.transfer_min} min` : ""].filter(Boolean).join(" · ");
        const owner = st.product !== p.id ? `<span class="dim">${esc(products.find((x) => x.id === st.product)?.name ?? st.product)} · </span>` : "";
        return `<li><span class="n">${i + 1}</span><div>${owner}<b>${esc(stageName(st.stage))}</b> ${where}${alt}${extra ? `<small>${extra}</small>` : ""}</div></li>`;
      })
      .join("");
    detail.innerHTML = `
      <div class="product-card">
        <div class="product-name">${esc(p.name)} ${colors}</div>
        <div class="dim">${p.kind === "semi" ? "Semielaborado" : "Producto terminado"}${p.size ? ` · ${esc(p.size)}` : ""}${p.family ? ` · ${esc(p.family)}` : ""}${p.local ? " · cargado en esta sesión" : ""}${p.assumed ? " · datos supuestos" : ""}</div>
        ${molds}${bom}
        <div class="label">RUTA</div>
        <ol class="route">${stages}</ol>
      </div>`;
    detail.querySelectorAll<HTMLAnchorElement>("a[data-eq]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        opts.select(a.dataset.eq!);
      }),
    );
  }

  function choose(id: string | null): void {
    current = id === current ? null : id;
    const p = products.find((x) => x.id === current) ?? null;
    list.querySelectorAll("li").forEach((li) => li.classList.toggle("active", li.dataset.product === current));
    if (p) drawRoute(p);
    else clearRoute();
    renderDetail(p);
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

  // Cargar un producto: YAML o JSON con el formato de catalog/products.yaml (uno o una lista `products:`).
  const input = document.getElementById("product-file") as HTMLInputElement;
  document.getElementById("btn-load-product")!.onclick = () => input.click();
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
  const initial = new URLSearchParams(location.search).get("product");
  if (initial && products.some((p) => p.id === initial)) choose(initial);

  return (time: number) => {
    for (const m of movers) {
      const u = ((time * 6) / m.length + m.offset) % 1;
      m.mesh.position.copy(m.curve.getPoint(u));
    }
  };
}
