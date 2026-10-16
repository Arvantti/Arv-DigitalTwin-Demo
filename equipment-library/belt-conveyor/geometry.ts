/**
 * Geometría paramétrica de la banda transportadora. El flujo va hacia +X (descarga en +L/2).
 * Las unidades acumuladas se dibujan juntas contra la descarga; las que avanzan se reparten en
 * el resto del largo y se desplazan con el recorrido de la banda.
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

const MAX_ITEMS = 400;

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 6);
  const W = num(params, "width_m", 0.4);
  const H = num(params, "height_m", 0.85);
  const pitch = num(params, "pitch_m", 0.25);
  const kind = str(params, "kind", "flat");
  const item = str(params, "item", "sachet");
  const size = num(params, "item_size_m", 0.18);
  const color = str(params, "item_color", "#c62828");
  const motorKw = num(params, "motor_kw", 0.75);
  const root = P.group("belt-conveyor");
  const steel = M.stainless();

  // bastidor: canales laterales y patas
  const frameH = 0.12;
  for (const sz of [-1, 1]) {
    const channel = P.box(L, frameH, 0.04, steel, 0.008, "frame");
    channel.position.set(0, H - frameH / 2, sz * (W / 2 + 0.03));
    root.add(channel);
  }
  const nLegs = Math.max(2, Math.ceil(L / 2.5) + 1);
  for (let i = 0; i < nLegs; i++) {
    const x = -L / 2 + 0.15 + ((L - 0.3) * i) / (nLegs - 1);
    for (const sz of [-1, 1]) {
      const leg = P.box(0.04, H - frameH, 0.04, steel, 0.006, "legs");
      leg.geometry.translate(0, (H - frameH) / 2, 0);
      leg.position.set(x, 0, sz * (W / 2 + 0.03));
      root.add(leg);
      const foot = P.cylinder(0.035, 0.035, 0.02, M.rubber(), 12);
      foot.position.set(x, 0, sz * (W / 2 + 0.03));
      root.add(foot);
    }
    const brace = P.box(0.03, 0.03, W + 0.06, steel, 0.004);
    brace.position.set(x, 0.25, 0);
    root.add(brace);
  }

  // superficie de transporte
  const surfaceY = H;
  if (kind === "roller") {
    const n = Math.floor(L / 0.08);
    const geo = new THREE.CylinderGeometry(0.025, 0.025, W, 16);
    geo.rotateX(Math.PI / 2);
    const rollers = new THREE.InstancedMesh(geo, M.polishedSteel(), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) rollers.setMatrixAt(i, m.makeTranslation(-L / 2 + 0.04 + i * 0.08, surfaceY - 0.025, 0));
    rollers.castShadow = rollers.receiveShadow = true;
    rollers.name = "rollers";
    root.add(rollers);
  } else {
    const beltMat =
      kind === "mesh"
        ? new THREE.MeshStandardMaterial({ color: "#8e979f", metalness: 0.9, roughness: 0.45, wireframe: false })
        : kind === "slat"
          ? M.plastic("#e6e8ea", 0.5)
          : M.rubber();
    const belt = P.box(L, 0.012, W, beltMat, 0.004, "belt");
    belt.position.set(0, surfaceY - 0.006, 0);
    root.add(belt);
    if (kind === "slat" || kind === "mesh") {
      const n = Math.floor(L / 0.05);
      const geo = new THREE.BoxGeometry(0.008, 0.004, W);
      const lines = new THREE.InstancedMesh(geo, M.paint("#5e666d", 0.6), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) lines.setMatrixAt(i, m.makeTranslation(-L / 2 + i * 0.05, surfaceY + 0.001, 0));
      root.add(lines);
    }
    for (const sx of [-1, 1]) {
      const drum = P.cylinderZ(0.05, W + 0.02, M.polishedSteel(), 24);
      drum.position.set((sx * L) / 2, surfaceY - 0.05, 0);
      root.add(drum);
    }
  }
  // guías laterales para unidades sueltas
  if (item !== "box") {
    for (const sz of [-1, 1]) {
      const guide = P.box(L, 0.03, 0.01, M.plastic("#d8dde2", 0.4), 0.003);
      guide.position.set(0, surfaceY + 0.06, sz * (W / 2 - 0.01));
      root.add(guide);
      const nb = Math.max(2, Math.ceil(L / 1.5));
      for (let i = 0; i < nb; i++) {
        const bracket = P.box(0.02, 0.07, 0.02, steel, 0.003);
        bracket.position.set(-L / 2 + 0.2 + ((L - 0.4) * i) / (nb - 1), surfaceY + 0.035, sz * (W / 2 + 0.01));
        root.add(bracket);
      }
    }
  }
  // motorreductor en la descarga
  const drive = P.group("drive_motor");
  const mot = P.motor(motorKw, "#2f4f6f");
  mot.rotation.y = Math.PI / 2;
  drive.add(mot);
  const gb = P.gearbox(0.12 + 0.03 * Math.sqrt(motorKw));
  gb.position.z = -0.12;
  drive.add(gb);
  drive.position.set(L / 2 - 0.12, surfaceY - 0.12, -(W / 2 + 0.25));
  root.add(drive);

  // unidades transportadas (instanciadas)
  let itemGeo: THREE.BufferGeometry;
  let itemMat: THREE.Material;
  let itemH: number;
  if (item === "box") {
    itemGeo = new THREE.BoxGeometry(size, size * 0.7, size * 0.8);
    itemMat = M.paint(color, 0.85);
    itemH = size * 0.7;
  } else if (item === "part") {
    itemGeo = new THREE.BoxGeometry(size, size * 0.5, size * 0.8);
    itemMat = M.plastic(color, 0.3);
    itemH = size * 0.5;
  } else {
    itemGeo = new THREE.BoxGeometry(size * 1.5, 0.03, size);
    itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 });
    itemH = 0.03;
  }
  const items = new THREE.InstancedMesh(itemGeo, itemMat, MAX_ITEMS);
  items.name = "items";
  items.castShadow = true;
  items.count = 0;
  root.add(items);
  const m = new THREE.Matrix4();
  const yItem = surfaceY + itemH / 2 + 0.002;

  function update(frame: AnimationFrame): void {
    const capacity = Math.floor(L / pitch) + 1; // lo que cabe físicamente sobre la banda
    const total = Math.min(MAX_ITEMS, capacity, Math.round(ch(frame, "items_count")));
    const acc = Math.min(total, Math.round(ch(frame, "accumulated")));
    const travel = ch(frame, "belt_travel");
    let k = 0;
    for (let i = 0; i < acc; i++) items.setMatrixAt(k++, m.makeTranslation(L / 2 - size * 0.75 - i * pitch, yItem, 0));
    const moving = total - acc;
    const free = L - acc * pitch - size;
    if (moving > 0 && free > 0) {
      const spacing = free / moving;
      const offset = travel % spacing;
      for (let i = 0; i < moving; i++) {
        const x = -L / 2 + size * 0.75 + offset + i * spacing;
        items.setMatrixAt(k++, m.makeTranslation(Math.min(x, L / 2 - size * 0.75 - acc * pitch), yItem, 0));
      }
    }
    items.count = k;
    items.instanceMatrix.needsUpdate = true;
  }
  update({ channels: { items_count: Math.min(MAX_ITEMS, Math.floor(L / pitch / 2)) }, state: "idle" });

  return {
    root,
    size: { dx: L, dy: W + 0.6, height: H + 0.2 },
    update: (frame) => update(frame),
    dispose: () => disposeObject(root),
  };
}
