/**
 * Geometría del almacén de estibas: estantería de un fondo con marcos azules y largueros naranja (vanos de 2 estibas
 * por nivel), cuyo largo, alto y niveles salen de los parámetros. Las estibas son instancias (tarima de madera y bulto de
 * cajas del color del producto) que se muestran de abajo arriba y de vano en vano según `fill`; durante una entrega
 * (`releasing`) la baliza del extremo se pone ámbar. Largo sobre +X, frente hacia +Z, origen en el piso al centro.
 */
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P, str } from "@twin/3d";

const BAY = 2.7;

export default function build(params: Params): EquipmentModel {
  const length = Math.max(3, num(params, "rack_length_m", 16));
  const height = Math.max(2, num(params, "rack_height_m", 6));
  const levels = Math.max(1, Math.round(num(params, "levels", 4)));
  const positions = Math.max(1, Math.round(num(params, "positions", 48)));
  const color = str(params, "color", "#2f6fb0");
  const bays = Math.max(1, Math.round(length / BAY));
  const bay = length / bays;
  const depth = 1.4;
  const perBay = 2;
  const capacity = bays * levels * perBay;
  const root = P.group("pallet-store");
  const upright = M.paint("#1f5fa8", 0.5);
  const beam = M.paint("#ee7d1a", 0.5);
  const beamY = Array.from({ length: levels }, (_, i) => 0.15 + ((height - 1.9) / Math.max(1, levels - 1)) * i);

  for (let b = 0; b <= bays; b++) {
    for (const z of [-depth / 2 + 0.04, depth / 2 - 0.04]) {
      const post = P.box(0.1, height, 0.08, upright, 0.005);
      post.position.set(-length / 2 + b * bay, height / 2, z);
      root.add(post);
    }
  }
  for (let b = 0; b < bays; b++) for (const y of beamY) for (const z of [-depth / 2 + 0.04, depth / 2 - 0.04]) {
    const bm = P.box(bay - 0.1, 0.12, 0.06, beam, 0.004);
    bm.position.set(-length / 2 + (b + 0.5) * bay, y + 0.06, z);
    root.add(bm);
  }

  const wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.14, 0.9), M.paint("#8a6a43", 0.9), capacity);
  const load = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 1.1, 0.84), M.plastic(color), capacity);
  const m = new THREE.Matrix4();
  let idx = 0;
  // orden de llenado: nivel de abajo hacia arriba, vano por vano
  for (let l = 0; l < levels; l++) for (let b = 0; b < bays; b++) for (let p = 0; p < perBay; p++) {
    const x = -length / 2 + b * bay + bay * (0.27 + 0.46 * p) + 0.0;
    m.makeTranslation(x, beamY[l] + 0.12 + 0.07, 0);
    wood.setMatrixAt(idx, m);
    m.makeTranslation(x, beamY[l] + 0.12 + 0.14 + 0.55, 0);
    load.setMatrixAt(idx, m);
    idx++;
  }
  for (const im of [wood, load]) {
    im.castShadow = im.receiveShadow = true;
    root.add(im);
  }
  const light = P.stackLight(0.4);
  light.object.position.set(length / 2 - 0.2, height + 0.2, depth / 2);
  root.add(light.object);

  function update(frame: AnimationFrame): void {
    const shown = Math.round(positions * Math.max(0, Math.min(1, ch(frame, "fill"))));
    const n = Math.min(capacity, Math.round((shown / positions) * capacity));
    wood.count = n;
    load.count = n;
    light.set(ch(frame, "releasing") > 0.5 ? 2 : frame.state === "running" ? 1 : frame.state === "fault" ? 3 : 2, performance.now() / 1000);
  }
  update({ channels: { fill: 0.6, releasing: 0 }, state: "running" });
  return { root, size: { dx: length, dy: depth, height }, update, dispose: () => disposeObject(root) };
}
