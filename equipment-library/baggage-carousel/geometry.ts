/**
 * Geometría paramétrica del carrusel de equipaje: óvalo de placas articuladas de length_m de recorrido y width_m de
 * ancho exterior (radio del eje = ancho / 2 − 0,6 m; las rectas completan el largo). Al lado +Z queda una franja de
 * 1,6 m para los operarios (armado) o los pasajeros (reclamo). La rampa de entrada llega por el extremo +X en armado
 * (desde el clasificador) y por el extremo -X en reclamo (banda de llegadas). En reclamo las placas van inclinadas.
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

const PLATE_W = 1.1;
const STRIP = 1.6;
const PLATE_Y = 0.45;
const SHIRTS = ["#3d5a80", "#c44536", "#5b8e7d", "#d9a441", "#6d597a", "#2b2d42", "#8d99ae", "#bc6c25"];

export default function build(params: Params): EquipmentModel {
  const length = num(params, "length_m", 40);
  const W = num(params, "width_m", 6);
  const pitch = num(params, "pitch_m", 1.0);
  const mode = str(params, "mode", "makeup");
  const plateColor = str(params, "plate_color", "#3b4148");
  const handlers = Math.round(num(params, "handlers", 2));
  const r = Math.max(0.6, W / 2 - PLATE_W / 2 - 0.05);
  const S = Math.max(0.5, (length - 2 * Math.PI * r) / 2);
  const L = P.ovalLength(S, r);
  const DX = S + W;
  const DZ = W + STRIP;
  const zc = -STRIP / 2; // eje del óvalo; la franja de personas queda en +Z
  const reclaim = mode === "reclaim";
  const root = P.group("baggage-carousel");
  const at = (s: number) => {
    const p = P.ovalPoint(s, S, r);
    return { x: p.x, z: p.z + zc, yaw: p.yaw };
  };

  // bastidor y faldón
  const frameMat = M.paint("#59626c", 0.5);
  const segL = 0.5;
  const nSeg = Math.ceil(L / segL);
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(segL + 0.02, PLATE_Y - 0.05, PLATE_W + 0.1), frameMat, nSeg);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  for (let i = 0; i < nSeg; i++) {
    const p = at((i + 0.5) * segL);
    q.setFromAxisAngle(up, p.yaw);
    frame.setMatrixAt(i, m.compose(v.set(p.x, (PLATE_Y - 0.05) / 2, p.z), q, one));
  }
  frame.name = "frame";
  frame.castShadow = frame.receiveShadow = true;
  root.add(frame);

  // isla central
  const islandW = Math.max(0.2, 2 * r - PLATE_W - 0.1);
  const island = P.box(S + 0.01, reclaim ? 0.9 : 0.55, islandW, reclaim ? M.stainless() : M.paint("#8a939c", 0.5), 0.03, "center_island");
  island.position.set(0, reclaim ? 0.45 : 0.275, zc);
  root.add(island);
  for (const sx of [-1, 1]) {
    const cap = P.cylinder(islandW / 2, islandW / 2, reclaim ? 0.9 : 0.55, island.material as THREE.Material, 32);
    cap.position.set((sx * S) / 2, reclaim ? 0.45 : 0.275, zc);
    root.add(cap);
  }
  if (reclaim) {
    const screen = P.nameplate(["LLEGADAS", "EQUIPAJE"], 1.6, 0.6, "#0f1f33", "#ffd34d");
    screen.position.set(0, 1.6, zc + 0.03);
    root.add(screen);
    const pole = P.box(0.12, 1.3, 0.12, M.stainless(), 0.01);
    pole.position.set(0, 0.95, zc);
    root.add(pole);
  }

  // placas
  const plateLen = 0.55;
  const nPlates = Math.ceil(L / 0.45);
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(plateLen, 0.035, PLATE_W), M.paint(plateColor, 0.45), nPlates);
  plates.name = "plates";
  plates.castShadow = plates.receiveShadow = true;
  root.add(plates);
  const bags = P.bagInstances(240, 0.7);
  root.add(bags);
  const slant = reclaim ? 0.2 : 0.05; // inclinación hacia afuera

  // rampa de entrada
  const infeed = P.group("infeed_chute");
  const rampL = 2.2;
  const bed = P.box(rampL, 0.05, 1.0, reclaim ? M.rubber() : M.stainless(), 0.01);
  bed.position.set(rampL / 2, 0, 0);
  infeed.add(bed);
  for (const side of [-1, 1]) {
    const wall = P.box(rampL, 0.25, 0.03, M.stainless(), 0.004);
    wall.position.set(rampL / 2, 0.12, side * 0.52);
    infeed.add(wall);
  }
  // sube hacia afuera desde el borde de las placas
  const out = reclaim ? -1 : 1;
  infeed.rotation.order = "YZX";
  infeed.rotation.y = reclaim ? Math.PI : 0;
  infeed.rotation.z = 0.25;
  infeed.position.set(out * (S / 2 + r + PLATE_W / 2 - 0.3), PLATE_Y + 0.08, zc);
  root.add(infeed);

  // motor y baliza
  const drive = P.motor(num(params, "motor_kw", 2.2));
  drive.position.set(-S / 4, 0.25, zc + r + PLATE_W / 2 + 0.15);
  drive.name = "drive";
  root.add(drive);
  const light = P.stackLight(0.4);
  light.object.position.set(S / 2, 0.55, zc);
  light.object.name = "beacon";
  root.add(light.object);

  // personas en la franja +Z, mirando al carrusel
  const people: THREE.Object3D[] = [];
  const nPeople = reclaim ? 8 : Math.max(handlers, 1);
  for (let i = 0; i < nPeople; i++) {
    const fig = reclaim
      ? P.operator("#000000", SHIRTS[i % SHIRTS.length], { civilian: true, skin: i % 2 ? "#8d5a3b" : "#c99a76" })
      : P.operator("#f26b1d", "#2f5f8f");
    const x = -S / 2 + ((i + 0.5) * S) / nPeople;
    fig.object.position.set(x, 0, zc + r + PLATE_W / 2 + 0.55);
    fig.object.rotation.y = Math.PI;
    fig.object.name = reclaim ? "passengers" : "handlers";
    if (!reclaim) fig.setPose(0.6);
    root.add(fig.object);
    people.push(fig.object);
  }

  let time = 0;
  function update(frame: AnimationFrame, dt: number): void {
    time += dt;
    const travel = ch(frame, "travel");
    for (let i = 0; i < nPlates; i++) {
      const p = at((i * L) / nPlates + travel);
      q.setFromAxisAngle(up, p.yaw);
      tilt.setFromAxisAngle(xAxis, -slant);
      q.multiply(tilt);
      plates.setMatrixAt(i, m.compose(v.set(p.x, PLATE_Y, p.z), q, one));
    }
    plates.instanceMatrix.needsUpdate = true;
    const count = Math.min(240, Math.floor(L / pitch), Math.round(ch(frame, "bags_count")));
    for (let j = 0; j < count; j++) {
      const p = at((j * L) / Math.max(1, count) + travel);
      q.setFromAxisAngle(up, p.yaw);
      tilt.setFromAxisAngle(xAxis, -slant);
      q.multiply(tilt);
      bags.setMatrixAt(j, m.compose(v.set(p.x, PLATE_Y + 0.02, p.z), q, one));
    }
    bags.count = count;
    bags.instanceMatrix.needsUpdate = true;
    const active = reclaim ? (count > 0 ? nPeople : 2) : Math.round(ch(frame, "handlers_active"));
    people.forEach((f, i) => (f.visible = reclaim ? i < active : i < Math.max(active, handlers)));
    light.set(ch(frame, "stack_light"), time);
  }
  update({ channels: { travel: 0, bags_count: Math.floor(L / pitch / 3), handlers_active: handlers, stack_light: 1 }, state: "running" }, 0);

  return {
    root,
    size: { dx: DX, dy: DZ, height: reclaim ? 2.0 : 1.9 },
    update: (frame, dt) => update(frame, dt),
    dispose: () => disposeObject(root),
  };
}
