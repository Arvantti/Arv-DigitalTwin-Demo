/**
 * Geometría paramétrica del túnel de enfriamiento: cerramiento inoxidable con ventanas de
 * inspección, banda de malla, cabezales de aspersión, cortinas en la entrada y la salida,
 * bomba y tanque de agua. El flujo va hacia +X.
 */
import * as THREE from "three";
import {
  type AnimationFrame,
  type EquipmentModel,
  type Params,
  ch,
  disposeObject,
  materials as M,
  num,
  parts as P,
  str,
} from "@twin/3d";

const MAX_ITEMS = 600;

function droplet(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(220,240,255,0.9)");
  grad.addColorStop(1, "rgba(220,240,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 6);
  const W = num(params, "width_m", 1.5);
  const unitMl = num(params, "unit_ml", 1000);
  const color = str(params, "item_color", "#c62828");
  const yBelt = 0.95;
  const Hc = 1.75;
  const root = P.group("cooling-tunnel");
  const steel = M.stainless();

  // patas y estructura
  const nLegs = Math.max(2, Math.ceil(L / 2) + 1);
  for (let i = 0; i < nLegs; i++) {
    const x = -L / 2 + 0.1 + ((L - 0.2) * i) / (nLegs - 1);
    for (const sz of [-1, 1]) {
      const leg = P.box(0.06, yBelt - 0.25, 0.06, steel, 0.008);
      leg.geometry.translate(0, (yBelt - 0.25) / 2, 0);
      leg.position.set(x, 0, sz * (W / 2 - 0.05));
      root.add(leg);
      const foot = P.cylinder(0.05, 0.05, 0.03, M.rubber(), 12);
      foot.position.set(x, 0, sz * (W / 2 - 0.05));
      root.add(foot);
    }
  }
  // bandeja de escurrido inferior
  const pan = P.slab(L, 0.08, W - 0.05, steel, 0.01);
  pan.position.y = yBelt - 0.28;
  root.add(pan);

  // cerramiento: techo, laterales con ventanas, marcos
  const encl = P.group("enclosure");
  const roof = P.box(L, 0.04, W, steel, 0.01);
  roof.position.y = Hc;
  encl.add(roof);
  const roofRidge = P.box(L, 0.12, 0.3, steel, 0.02);
  roofRidge.position.y = Hc + 0.06;
  encl.add(roofRidge);
  const panels = Math.max(2, Math.round(L / 1.2));
  const pw = L / panels;
  for (const sz of [-1, 1]) {
    const lower = P.box(L, 0.25, 0.03, steel, 0.008);
    lower.position.set(0, yBelt - 0.12, sz * W / 2);
    encl.add(lower);
    for (let i = 0; i < panels; i++) {
      const x = -L / 2 + pw * (i + 0.5);
      if (sz === 1) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.1, Hc - yBelt - 0.05), M.glass("#dff0ff", 0.18));
        pane.position.set(x, (Hc + yBelt) / 2, W / 2);
        pane.renderOrder = 2;
        encl.add(pane);
        const handle = P.box(0.18, 0.03, 0.03, M.polishedSteel(), 0.008);
        handle.position.set(x, Hc - 0.15, W / 2 + 0.02);
        encl.add(handle);
      } else {
        const wall = P.box(pw - 0.02, Hc - yBelt + 0.12, 0.02, steel, 0.004);
        wall.position.set(x, (Hc + yBelt - 0.12) / 2, -W / 2);
        encl.add(wall);
      }
      const post = P.box(0.05, Hc - yBelt + 0.2, 0.05, M.polishedSteel(), 0.008);
      post.position.set(-L / 2 + pw * i, (Hc + yBelt - 0.2) / 2, sz * W / 2);
      encl.add(post);
    }
    const endPost = P.box(0.05, Hc - yBelt + 0.2, 0.05, M.polishedSteel(), 0.008);
    endPost.position.set(L / 2, (Hc + yBelt - 0.2) / 2, sz * W / 2);
    encl.add(endPost);
  }
  // cortinas de tiras en la entrada y la salida
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: "#cfe7ff", transparent: true, opacity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  for (const sx of [-1, 1]) {
    const strips = Math.floor((W - 0.1) / 0.12);
    for (let i = 0; i < strips; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.11, Hc - yBelt - 0.05), curtainMat);
      strip.position.set((sx * L) / 2, (Hc + yBelt) / 2, -W / 2 + 0.1 + i * 0.12);
      strip.rotation.y = Math.PI / 2;
      encl.add(strip);
    }
  }
  root.add(encl);

  // banda de malla
  const belt = P.box(L + 0.3, 0.015, W - 0.15, new THREE.MeshStandardMaterial({ color: "#9aa3aa", metalness: 0.9, roughness: 0.4 }), 0.004, "mesh_belt");
  belt.position.y = yBelt;
  root.add(belt);
  const nBars = Math.floor((L + 0.3) / 0.04);
  const barGeo = new THREE.BoxGeometry(0.006, 0.006, W - 0.15);
  const bars = new THREE.InstancedMesh(barGeo, M.darkSteel(), nBars);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < nBars; i++) bars.setMatrixAt(i, mtx.makeTranslation(-(L + 0.3) / 2 + i * 0.04, yBelt + 0.009, 0));
  root.add(bars);

  // cabezales de aspersión con boquillas
  const headers = 3;
  for (let k = 0; k < headers; k++) {
    const z = -W / 2 + 0.3 + ((W - 0.6) * k) / (headers - 1);
    const header = P.cylinderX(0.025, L - 0.2, M.polishedSteel(), 12, "spray_headers");
    header.position.set(0, Hc - 0.18, z);
    root.add(header);
  }
  // gotas de aspersión (partículas)
  const dropCount = Math.round(60 * L);
  const dropGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(dropCount * 3);
  const seeds = new Float32Array(dropCount);
  for (let i = 0; i < dropCount; i++) {
    pos.set([(Math.random() - 0.5) * (L - 0.3), Hc - 0.2, (Math.random() - 0.5) * (W - 0.4)], i * 3);
    seeds[i] = Math.random();
  }
  dropGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const tex = droplet();
  const dropMat = new THREE.PointsMaterial({ size: 0.05, map: tex ?? undefined, transparent: true, opacity: 0.6, depthWrite: false, color: "#d8f0ff" });
  const drops = new THREE.Points(dropGeo, dropMat);
  root.add(drops);

  // vapor a la entrada
  const steamCount = 40;
  const steamGeo = new THREE.BufferGeometry();
  const spos = new Float32Array(steamCount * 3);
  const sseeds = new Float32Array(steamCount);
  for (let i = 0; i < steamCount; i++) {
    spos.set([-L / 2 - 0.1 + Math.random() * 0.8, yBelt + 0.1, (Math.random() - 0.5) * (W - 0.3)], i * 3);
    sseeds[i] = Math.random();
  }
  steamGeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  const steamMat = new THREE.PointsMaterial({ size: 0.3, map: tex ?? undefined, transparent: true, opacity: 0, depthWrite: false, color: "#ffffff" });
  root.add(new THREE.Points(steamGeo, steamMat));

  // bomba, tanque y tuberías al lado posterior
  const tank = P.slab(1.0, 0.7, 0.6, steel, 0.03);
  tank.position.set(L / 2 - 0.7, 0, -W / 2 - 0.45);
  root.add(tank);
  const pump = P.group("pump");
  const volute = P.cylinderZ(0.14, 0.12, M.paint("#2f4f6f", 0.4), 24);
  pump.add(volute);
  const mot = P.motor(4, "#2f4f6f");
  mot.position.x = -0.32;
  pump.add(mot);
  pump.position.set(L / 2 - 1.6, 0.25, -W / 2 - 0.45);
  root.add(pump);
  root.add(P.pipe([new THREE.Vector3(L / 2 - 1.6, 0.4, -W / 2 - 0.45), new THREE.Vector3(L / 2 - 1.6, Hc + 0.25, -W / 2 - 0.45), new THREE.Vector3(L / 2 - 1.6, Hc + 0.25, 0), new THREE.Vector3(L / 2 - 1.6, Hc - 0.1, 0)], 0.035, M.polishedSteel(), 0.12, "piping"));
  const chilled = P.pipe([new THREE.Vector3(L / 2 - 0.3, 0.75, -W / 2 - 0.45), new THREE.Vector3(L / 2 - 0.3, 0.75, -W / 2 - 1.2)], 0.04, M.paint("#1565c0", 0.4), 0.1);
  root.add(chilled);

  // unidades sobre la banda
  const { w: sw, h: shh } = { w: 0.12 * Math.pow(unitMl / 250, 0.35), h: 0.18 * Math.pow(unitMl / 250, 0.35) };
  const itemGeo = new THREE.BoxGeometry(shh, 0.035 + 0.01 * Math.cbrt(unitMl / 250), sw);
  const itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 0.9 });
  const items = new THREE.InstancedMesh(itemGeo, itemMat, MAX_ITEMS);
  items.count = 0;
  items.castShadow = true;
  root.add(items);
  const perRow = Math.max(1, Math.floor((W - 0.3) / (sw * 1.6)));

  const lightPost = P.stackLight(0.25);
  lightPost.object.position.set(L / 2 - 0.2, Hc + 0.12, W / 2 - 0.2);
  root.add(lightPost.object);

  const m = new THREE.Matrix4();
  function update(frame: AnimationFrame): void {
    const n = Math.min(MAX_ITEMS, Math.round(ch(frame, "units_count")));
    const travel = ch(frame, "belt_travel");
    const rows = Math.ceil(n / perRow);
    const spacing = rows > 0 ? (L - 0.2) / rows : 1;
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const x = -L / 2 + 0.1 + ((r * spacing + (travel % spacing)) % (L - 0.2));
      for (let c = 0; c < perRow && k < n; c++) {
        const z = -((perRow - 1) * sw * 1.6) / 2 + c * sw * 1.6;
        items.setMatrixAt(k++, m.makeTranslation(x, yBelt + 0.03, z));
      }
    }
    items.count = k;
    items.instanceMatrix.needsUpdate = true;

    const spray = ch(frame, "spray", 1);
    drops.visible = spray > 0.5;
    const t = performance.now() / 1000;
    const p = dropGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dropCount; i++) p.setY(i, Hc - 0.2 - ((t * 1.6 + seeds[i]) % 1) * (Hc - yBelt - 0.25));
    p.needsUpdate = true;
    const heat = ch(frame, "inlet_heat");
    steamMat.opacity = 0.3 * heat;
    const sp = steamGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < steamCount; i++) sp.setY(i, yBelt + 0.1 + ((t * 0.4 + sseeds[i]) % 1) * 0.9);
    sp.needsUpdate = true;
    lightPost.set(frame.state === "fault" ? 3 : frame.state === "running" ? 1 : 2, t);
  }
  update({ channels: { units_count: 120, spray: 1 }, state: "idle" });

  return {
    root,
    size: { dx: L + 0.4, dy: W + 1.3, height: Hc + 0.6 },
    update,
    dispose: () => disposeObject(root),
  };
}
