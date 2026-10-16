/**
 * Geometría del control de peso con detector de metales: banda de entrada que pasa por el
 * cabezal del detector, banda de pesaje sobre la celda de carga, banda de salida con empujador
 * y canasta de rechazos, y torre con pantalla y baliza. Flujo hacia +X.
 */
import * as THREE from "three";
import {
  type AnimationFrame,
  type EquipmentModel,
  type Params,
  bool,
  ch,
  disposeObject,
  materials as M,
  num,
  parts as P,
  str,
} from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const bw = num(params, "belt_width_m", 0.3);
  const metal = bool(params, "metal_detector", true);
  const color = str(params, "item_color", "#c62828");
  const nominal = num(params, "nominal_g", 280);
  const yBelt = 0.82;
  const root = P.group("checkweigher");
  const steel = M.stainless();
  const sections: [string, number, number][] = [
    ["infeed", -0.75, 0.6],
    ["weigh_belt", 0.0, 0.45],
    ["outfeed", 0.65, 0.7],
  ];
  for (const [name, x, len] of sections) {
    const belt = P.box(len - 0.02, 0.03, bw, M.rubber(), 0.008, name);
    belt.position.set(x, yBelt, 0);
    root.add(belt);
    for (const sz of [-1, 1]) {
      const side = P.box(len, 0.06, 0.025, steel, 0.005);
      side.position.set(x, yBelt - 0.03, sz * (bw / 2 + 0.02));
      root.add(side);
    }
  }
  // celda de carga bajo la banda de pesaje
  const cell = P.box(0.3, 0.12, bw * 0.8, M.paint("#3a3f45", 0.5), 0.01);
  cell.position.set(0, yBelt - 0.12, 0);
  root.add(cell);
  // bastidor y patas
  const frame = P.box(2.1, 0.08, bw + 0.2, steel, 0.01, "legs");
  frame.position.set(-0.05, yBelt - 0.24, 0);
  root.add(frame);
  for (const x of [-0.95, 0.85]) {
    for (const sz of [-1, 1]) {
      const leg = P.box(0.05, yBelt - 0.28, 0.05, steel, 0.006);
      leg.geometry.translate(0, (yBelt - 0.28) / 2, 0);
      leg.position.set(x, 0, sz * (bw / 2 + 0.06));
      root.add(leg);
    }
  }
  // cabezal del detector de metales (marco con abertura)
  if (metal) {
    const det = P.group("metal_detector");
    const aw = bw + 0.12;
    const ah = 0.2;
    const thick = 0.14;
    const mat = M.paint("#1f5fa8", 0.35);
    const top = P.box(0.28, thick, aw + 2 * thick, mat, 0.03);
    top.position.y = ah + thick / 2;
    const bottom = P.box(0.28, thick, aw + 2 * thick, mat, 0.03);
    bottom.position.y = -thick / 2;
    const left = P.box(0.28, ah, thick, mat, 0.02);
    left.position.set(0, ah / 2, aw / 2 + thick / 2);
    const right = left.clone();
    right.position.z = -(aw / 2 + thick / 2);
    det.add(top, bottom, left, right);
    const plate = P.nameplate(["METAL DETECTOR"], 0.22, 0.05, "#1f5fa8", "#ffffff");
    plate.position.set(0, ah + thick / 2, aw / 2 + thick + 0.001);
    det.add(plate);
    det.position.set(-0.75, yBelt - 0.02, 0);
    root.add(det);
  }
  // empujador de rechazo y canasta
  const pusher = P.group("pusher");
  const cyl = P.cylinderZ(0.03, 0.22, M.polishedSteel(), 16);
  cyl.position.z = 0.11;
  pusher.add(cyl);
  const paddle = P.box(0.18, 0.08, 0.02, M.plastic("#ff3b3b", 0.4), 0.01);
  paddle.position.z = -0.01;
  pusher.add(paddle);
  pusher.position.set(0.75, yBelt + 0.06, bw / 2 + 0.05);
  root.add(pusher);
  const bin = P.group("reject_bin");
  const binBox = P.slab(0.45, 0.5, 0.4, M.plastic("#d32f2f", 0.5), 0.02);
  bin.add(binBox);
  const lid = P.box(0.45, 0.02, 0.4, M.glass("#ffffff", 0.3), 0.005);
  lid.position.y = 0.52;
  bin.add(lid);
  bin.position.set(0.75, 0, -(bw / 2 + 0.35));
  root.add(bin);
  root.add(P.pipe([new THREE.Vector3(0.75, yBelt - 0.02, -bw / 2), new THREE.Vector3(0.75, 0.6, -(bw / 2 + 0.2))], 0.06, M.glass("#ffffff", 0.2), 0.05));

  // torre con pantalla y baliza
  const tower = P.box(0.18, 1.55, 0.18, steel, 0.02, "display_tower");
  tower.geometry.translate(0, 0.775, 0);
  tower.position.set(0, 0, bw / 2 + 0.35);
  root.add(tower);
  const hmi = P.hmiPanel(0.05);
  hmi.object.position.set(0, 1.25, bw / 2 + 0.45);
  root.add(hmi.object);
  const light = P.stackLight(0.15);
  light.object.position.set(0, 1.55, bw / 2 + 0.35);
  root.add(light.object);

  // unidades de muestra sobre las bandas
  const itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 0.8 });
  const sw = Math.min(bw * 0.8, 0.12 * Math.pow(nominal / 280, 0.35));
  const units: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const u = P.box(sw * 1.5, 0.035, sw, itemMat, 0.01);
    root.add(u);
    units.push(u);
  }

  let hmiTimer = 0;
  function update(frame: AnimationFrame, dt: number): void {
    const travel = ch(frame, "belt_travel");
    units.forEach((u, i) => {
      const x = -1.0 + ((travel * 1.0 + i * 0.5) % 2.0);
      u.position.set(x, yBelt + 0.035, 0);
      u.visible = frame.state === "running";
    });
    pusher.position.z = bw / 2 + 0.05 - (bw + 0.05) * ch(frame, "pusher");
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    hmiTimer -= dt;
    if (hmiTimer <= 0) {
      hmiTimer = 0.4;
      const v = frame.variables ?? {};
      const f = (k: string, d = 0, u = "") => (typeof v[k] === "number" ? `${(v[k] as number).toFixed(d)} ${u}`.trim() : "—");
      hmi.draw(
        frame.label ?? `${Math.round(nominal)} g`,
        [
          ["Peso", f("last_weight_g", 1, "g")],
          ["Media", f("mean_g", 1, "g")],
          ["Desv.", f("sd_g", 2, "g")],
          ["Rechazo peso", f("rejects_weight")],
          ["Rechazo metal", f("rejects_metal")],
          ["Prueba metal", f("minutes_since_metal_test", 0, "min")],
        ],
        v.lot_on_hold === 1 ? "RETENIDO" : frame.state.toUpperCase(),
        v.lot_on_hold === 1 ? "#ffb000" : frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: {}, state: "idle" }, 0);

  return { root, size: { dx: 2.2, dy: bw + 1.3, height: 1.85 }, update, dispose: () => disposeObject(root) };
}
