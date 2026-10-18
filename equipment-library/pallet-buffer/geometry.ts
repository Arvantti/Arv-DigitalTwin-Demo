/**
 * Geometría del buffer de máquina con estiba: una tarima de armado (la primera de la hilera, cajas azules que suben con
 * `fill`) y hasta `max_waiting_pallets` tarimas llenas esperando recogida (`waiting`), sobre franja amarilla en el piso;
 * la franja se pone roja si el buffer bloquea a la máquina (`blocked`). Hilera sobre +X, origen en el centro de la huella.
 * Tarima de 1,1 × 0,9 m en pasos de 1,15 m; cada tarima lleva 24 cajas (4 × 3 × 2 capas).
 */
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P, str } from "@twin/3d";

const BOXES = 24;
const STEP = 1.15;

export default function build(params: Params): EquipmentModel {
  const waitingSlots = Math.max(1, Math.min(6, Math.round(num(params, "max_waiting_pallets", 2))));
  const color = str(params, "color", "#1e6fd9");
  const slots = waitingSlots + 1;
  const L = slots * STEP + 0.1;
  const root = P.group("pallet-buffer");
  const wood = M.paint("#8a6a43", 0.9);
  const tape = M.hazard();
  const matBox = M.plastic(color);

  const floor = P.slab(L, 0.01, 1.0, M.paint("#d4a912", 0.8), 0.002);
  floor.position.set(0, 0.006, 0);
  root.add(floor);
  const redMat = new THREE.MeshStandardMaterial({ color: "#2ecc71", roughness: 0.6 });
  const edge = P.slab(L, 0.012, 0.08, redMat, 0.002);
  edge.position.set(0, 0.012, 0.46);
  root.add(edge);

  const boxGeo = new THREE.BoxGeometry(0.26, 0.2, 0.28);
  const mkBoxes = (n: number): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(boxGeo, matBox, n);
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  };
  const slotX = (i: number) => (i - (slots - 1) / 2) * STEP;
  const m = new THREE.Matrix4();
  const place = (im: THREE.InstancedMesh, k: number, cx: number): void => {
    const c = k % 4;
    const r = Math.floor(k / 4) % 3;
    const layer = Math.floor(k / 12);
    m.makeTranslation(cx - 0.4 + c * 0.267, 0.17 + 0.07 + layer * 0.215, -0.28 + r * 0.29);
    im.setMatrixAt(k, m);
  };
  for (let i = 0; i < slots; i++) {
    const base = P.slab(1.1, 0.14, 0.9, wood, 0.01);
    base.position.set(slotX(i), 0.08, 0);
    root.add(base);
  }
  // tarima de armado: las cajas se ordenan de abajo arriba y se muestran según el llenado
  const loose = mkBoxes(BOXES);
  for (let k = 0; k < BOXES; k++) place(loose, k, slotX(0));
  root.add(loose);
  // tarimas llenas: todas sus cajas
  const full = mkBoxes(BOXES * waitingSlots);
  for (let s = 0; s < waitingSlots; s++) for (let k = 0; k < BOXES; k++) {
    const idx = s * BOXES + k;
    const c = k % 4;
    const r = Math.floor(k / 4) % 3;
    const layer = Math.floor(k / 12);
    m.makeTranslation(slotX(s + 1) - 0.4 + c * 0.267, 0.17 + 0.07 + layer * 0.215, -0.28 + r * 0.29);
    full.setMatrixAt(idx, m);
  }
  root.add(full);
  // franja de peligro al frente de la hilera
  const strip = P.box(L, 0.004, 0.06, tape, 0);
  strip.position.set(0, 0.02, -0.5);
  root.add(strip);

  function update(frame: AnimationFrame): void {
    loose.count = Math.round(BOXES * Math.max(0, Math.min(1, ch(frame, "fill"))));
    full.count = Math.min(waitingSlots, Math.round(ch(frame, "waiting"))) * BOXES;
    redMat.color.set(ch(frame, "blocked") > 0.5 ? "#ff2a1a" : "#2ecc71");
  }
  update({ channels: { fill: 0.5, waiting: 1, blocked: 0 }, state: "running" });
  return { root, size: { dx: L, dy: 1.0, height: 1.0 }, update, dispose: () => disposeObject(root) };
}
