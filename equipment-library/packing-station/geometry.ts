/**
 * Geometría de la estación de empaque manual: mesa de acero inoxidable con el extremo de la banda
 * de entrada, piezas esperando (se llena con la mesa), caja abierta que se llena con el ciclo,
 * sellador de cinta, impresora de etiquetas, almacén de cajas plegadas, tarima con cajas apiladas
 * (crece con el avance de la tarima), tapete del operario con franja de seguridad, pantalla y baliza.
 * La banda llega por -X; el operario trabaja en el lado +Z.
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

const MAX_PARTS_TABLE = 120;
const MAX_PARTS_BOX = 60;
const MAX_PALLET_BOXES = 16;

export default function build(params: Params): EquipmentModel {
  const cs = num(params, "box_size_m", 0.5);
  const color = str(params, "item_color", "#1e6fd9");
  const L = 3.0;
  const W = 2.0;
  const yTop = 0.85;
  const root = P.group("packing-station");
  const steel = M.stainless();
  const cardboard = M.paint("#b08a5a", 0.9);
  const itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.4 });

  // mesa de trabajo
  const top = P.slab(1.6, 0.05, 0.9, steel, 0.01, "table");
  top.position.set(0.1, yTop - 0.05, 0);
  root.add(top);
  const shelf = P.slab(1.5, 0.03, 0.8, steel, 0.008);
  shelf.position.set(0.1, 0.25, 0);
  root.add(shelf);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = P.box(0.05, yTop - 0.05, 0.05, steel, 0.006);
      leg.position.set(0.1 + sx * 0.75, (yTop - 0.05) / 2, sz * 0.4);
      root.add(leg);
    }
  }
  const backsplash = P.slab(1.6, 0.18, 0.03, steel, 0.006);
  backsplash.position.set(0.1, yTop, -0.43);
  root.add(backsplash);

  // extremo de la banda de entrada, con bordes guía
  const belt = P.group("infeed_end");
  const beltBody = P.slab(1.0, yTop - 0.05, 0.5, M.paint("#3a4047", 0.5), 0.01);
  beltBody.position.set(-1.0, 0, 0);
  belt.add(beltBody);
  const surface = P.slab(1.0, 0.03, 0.46, M.rubber(), 0.006);
  surface.position.set(-1.0, yTop - 0.05, 0);
  belt.add(surface);
  for (const sz of [-1, 1]) {
    const guide = P.box(1.0, 0.07, 0.015, steel, 0.004);
    guide.position.set(-1.0, yTop + 0.03, sz * 0.245);
    belt.add(guide);
  }
  const roller = P.cylinderZ(0.03, 0.46, M.polishedSteel(), 16);
  roller.position.set(-0.5, yTop - 0.03, 0);
  belt.add(roller);
  root.add(belt);

  // piezas esperando en la mesa (se muestran según el llenado)
  const partsTable = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.03, 0.08), itemMat, MAX_PARTS_TABLE);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < MAX_PARTS_TABLE; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10) % 4;
    const layer = Math.floor(i / 40);
    q.setFromEuler(new THREE.Euler(0, ((i * 37) % 17) * 0.05 - 0.4, 0));
    m.compose(new THREE.Vector3(-0.58 + col * 0.045, yTop + 0.015 + layer * 0.03, -0.17 + row * 0.11), q, new THREE.Vector3(1, 1, 1));
    partsTable.setMatrixAt(i, m);
  }
  partsTable.castShadow = true;
  root.add(partsTable);

  // caja abierta en curso, con las piezas ya colocadas
  const box = P.group("carton");
  const ch_ = cs * 0.6;
  for (const [x, y, z, w, h, d] of [
    [0, ch_ / 2, cs * 0.35, cs, ch_, 0.008],
    [0, ch_ / 2, -cs * 0.35, cs, ch_, 0.008],
    [cs / 2, ch_ / 2, 0, 0.008, ch_, cs * 0.7],
    [-cs / 2, ch_ / 2, 0, 0.008, ch_, cs * 0.7],
    [0, 0.004, 0, cs, 0.008, cs * 0.7],
  ]) {
    const w_ = P.box(w, h, d, cardboard, 0.002);
    w_.position.set(x, y, z);
    box.add(w_);
  }
  for (const sz of [-1, 1]) {
    const flap = P.box(cs, 0.006, cs * 0.3, cardboard, 0.002);
    flap.position.set(0, ch_ + 0.05, sz * (cs * 0.35 + 0.12));
    flap.rotation.x = sz * -0.5;
    box.add(flap);
  }
  const inside = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.03, 0.06), itemMat, MAX_PARTS_BOX);
  const cols = 6;
  for (let i = 0; i < MAX_PARTS_BOX; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols) % 5;
    const layer = Math.floor(i / (cols * 5));
    inside.setMatrixAt(i, m.makeTranslation(-cs * 0.4 + c * ((cs * 0.8) / cols), 0.02 + layer * 0.035, -cs * 0.3 + r * ((cs * 0.6) / 5)));
  }
  box.add(inside);
  box.position.set(0.2, yTop, 0.05);
  root.add(box);
  // caja cerrada y rotulada (mientras se cambia de caja)
  const closed = P.group("closed_carton");
  closed.add(P.slab(cs, ch_, cs * 0.7, cardboard, 0.004));
  const tape = P.box(cs * 1.01, 0.002, 0.05, M.paint("#c8a46a", 0.5), 0);
  tape.position.y = ch_ + 0.001;
  closed.add(tape);
  const label = P.box(0.14, 0.001, 0.1, M.paint("#f2f2f2", 0.6), 0);
  label.position.set(cs * 0.25, ch_ + 0.002, 0.1);
  closed.add(label);
  closed.position.set(0.2, yTop, 0.05);
  closed.visible = false;
  root.add(closed);

  // sellador de cinta e impresora de etiquetas
  const sealer = P.group("sealer");
  sealer.add(P.slab(0.3, 0.22, 0.25, M.paint("#3a3f45", 0.5), 0.02));
  const roll = P.cylinderZ(0.07, 0.05, M.paint("#c8a46a", 0.6), 24);
  roll.position.set(0, 0.28, 0);
  sealer.add(roll);
  sealer.position.set(0.7, yTop, -0.1);
  root.add(sealer);
  const printerMat = M.emissive("#3fd0ff", 0.4);
  const printer = P.group("label_printer");
  printer.add(P.slab(0.28, 0.22, 0.3, M.paint("#2b2f35", 0.5), 0.02));
  const screen = P.box(0.12, 0.07, 0.01, printerMat, 0.002);
  screen.position.set(0, 0.16, 0.152);
  printer.add(screen);
  printer.position.set(0.75, yTop, 0.3);
  root.add(printer);

  // almacén de cajas plegadas
  const magazine = P.group("carton_magazine");
  for (let i = 0; i < 14; i++) {
    const flat = P.box(cs * 1.1, 0.014, cs * 0.8, cardboard, 0.002);
    flat.position.set(0, 0.08 + i * 0.016, 0);
    flat.rotation.y = i % 2 ? 0.03 : -0.02;
    magazine.add(flat);
  }
  magazine.add(P.slab(cs * 1.15, 0.06, cs * 0.85, M.darkSteel(), 0.005));
  magazine.position.set(0.05, 0, -0.95);
  root.add(magazine);

  // tarima con las cajas apiladas
  const pallet = P.group("pallet");
  const wood = M.paint("#8a6a43", 0.9);
  pallet.add(P.slab(1.2, 0.04, 1.0, wood, 0.004));
  for (const x of [-0.5, 0, 0.5]) {
    const runner = P.slab(0.1, 0.1, 1.0, wood, 0.004);
    runner.position.x = x;
    pallet.add(runner);
  }
  const deck = P.slab(1.2, 0.03, 1.0, wood, 0.004);
  deck.position.y = 0.1;
  pallet.add(deck);
  const stackBox = P.box(cs, ch_, cs * 0.7, cardboard, 0.004);
  const stack = new THREE.InstancedMesh(stackBox.geometry, cardboard, MAX_PALLET_BOXES);
  for (let i = 0; i < MAX_PALLET_BOXES; i++) {
    const layer = Math.floor(i / 4);
    const k = i % 4;
    stack.setMatrixAt(i, m.makeTranslation((k % 2 ? 1 : -1) * (cs / 2 + 0.01), 0.13 + ch_ / 2 + layer * ch_, (Math.floor(k / 2) ? 1 : -1) * (cs * 0.35 + 0.01)));
  }
  stack.castShadow = true;
  pallet.add(stack);
  pallet.position.set(1.15, 0, 0.1);
  root.add(pallet);

  // tapete y franja de seguridad del lado del operario
  const mat = P.slab(1.4, 0.015, 0.6, M.rubber(), 0.004);
  mat.position.set(0.1, 0, 0.8);
  root.add(mat);
  for (const [x, z, w, d] of [
    [0.1, 0.5, 1.5, 0.04],
    [0.1, 1.1, 1.5, 0.04],
    [-0.65, 0.8, 0.04, 0.64],
    [0.85, 0.8, 0.04, 0.64],
  ] as [number, number, number, number][]) {
    const tapeY = P.box(w, 0.004, d, M.hazard(), 0);
    tapeY.position.set(x, 0.01, z);
    root.add(tapeY);
  }

  const hmi = P.hmiPanel(0.35);
  hmi.object.position.set(0.55, yTop, 0.4);
  hmi.object.scale.setScalar(0.75);
  root.add(hmi.object);
  const light = P.stackLight(0.4);
  light.object.position.set(-0.3, yTop, -0.4);
  root.add(light.object);

  let lastKey = "";
  function update(frame: AnimationFrame): void {
    const table = Math.max(0, Math.min(1, ch(frame, "table_fill")));
    partsTable.count = Math.round(MAX_PARTS_TABLE * table);
    const fill = Math.max(0, Math.min(1, ch(frame, "box_fill")));
    inside.count = Math.round(MAX_PARTS_BOX * fill);
    const changing = frame.state === "setup";
    closed.visible = changing;
    box.visible = !changing;
    const pallet_ = Math.max(0, Math.min(1, ch(frame, "pallet_fill")));
    stack.count = Math.round(MAX_PALLET_BOXES * pallet_);
    printerMat.emissiveIntensity = changing ? 4 : 0.4;
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const v = frame.variables ?? {};
    const key = `${frame.state}|${fill.toFixed(2)}|${v.boxes_count ?? ""}|${v.pallet_boxes ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "EMPAQUE",
        [
          ["Caja", `${(fill * 100).toFixed(0)} %`],
          ["Cajas", String(v.boxes_count ?? "—")],
          ["Tarima", `${v.pallet_boxes ?? "—"} cajas`],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: { table_fill: 0.5, box_fill: 0.6, pallet_fill: 0.5, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: 1.9 }, update: (f) => update(f), dispose: () => disposeObject(root) };
}
