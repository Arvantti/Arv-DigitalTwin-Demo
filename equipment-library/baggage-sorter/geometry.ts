/**
 * Geometría paramétrica del clasificador de bandejas basculantes. El lazo es un óvalo: dos rectas de straight_m y
 * dos semicírculos de diámetro loop_width_m (largo = 2 × recta + π × ancho, el mismo que usa behavior.py).
 * La recta de descarga es la del lado +Z y se recorre hacia +X; las inducciones entran al inicio de las dos rectas
 * por el extremo -X y las rampas de vuelo salen hacia +Z, repartidas en partes iguales en la recta de descarga.
 * La rampa de codificación manual sale 1,5 m después del final de esa recta, ya en la curva.
 * Si el lazo va elevado (height_m alto), las rampas bajan hasta ≈ 1 m del piso para entregar a los carruseles.
 *
 * Huella: largo = recta + ancho + 1,5 m (bandejas de 1,5 m); fondo = ancho + 1,5 m + chute_length_m (las rampas).
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
} from "@twin/3d";

const TRAY_W = 1.5;
const MANUAL_AFTER_M = 1.5;
const MAX_BAGS = 300;

export default function build(params: Params): EquipmentModel {
  const S = num(params, "straight_m", 28);
  const w = num(params, "loop_width_m", 10.5);
  const pitch = num(params, "tray_pitch_m", 1.4);
  const n = Math.max(1, Math.min(4, Math.round(num(params, "destinations", 4))));
  const cl = num(params, "chute_length_m", 4);
  const H = num(params, "height_m", 1.1);
  const r = w / 2;
  const L = P.ovalLength(S, r);
  const DX = S + w + TRAY_W;
  const DZ = w + TRAY_W + cl;
  const zc = -cl / 2; // centro del óvalo (las rampas ocupan el lado +Z)
  const root = P.group("baggage-sorter");
  const steel = M.galvanized();
  const yellow = M.paint(M.SAFETY_YELLOW, 0.45);
  const at = (s: number) => {
    const p = P.ovalPoint(s, S, r);
    return { x: p.x, z: p.z + zc, yaw: p.yaw };
  };

  // vía: tramos cortos instanciados a lo largo del óvalo, con soportes cada ≈ 3 m
  const segL = 0.5;
  const nSeg = Math.ceil(L / segL);
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(segL + 0.02, 0.22, 1.1), M.paint("#3c4248", 0.5), nSeg);
  const skirt = new THREE.InstancedMesh(new THREE.BoxGeometry(segL + 0.02, 0.35, 0.04), yellow, nSeg * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  for (let i = 0; i < nSeg; i++) {
    const p = at((i + 0.5) * segL);
    q.setFromAxisAngle(up, p.yaw);
    rail.setMatrixAt(i, m.compose(v.set(p.x, H - 0.2, p.z), q, one));
    for (const side of [0, 1]) {
      const off = (side ? 1 : -1) * 0.78;
      const ox = -Math.sin(p.yaw) * off;
      const oz = -Math.cos(p.yaw) * off;
      skirt.setMatrixAt(i * 2 + side, m.compose(v.set(p.x + ox, H - 0.28, p.z + oz), q, one));
    }
  }
  rail.name = "track";
  skirt.name = "guard_rails";
  rail.castShadow = skirt.castShadow = true;
  root.add(rail, skirt);
  const nLegs = Math.ceil(L / 3);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, H - 0.3, 0.14), steel, nLegs * 2);
  const motors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 0.35), M.paint("#2f4f6f", 0.5), nLegs);
  for (let i = 0; i < nLegs; i++) {
    const p = at(i * 3);
    q.setFromAxisAngle(up, p.yaw);
    for (const side of [0, 1]) {
      const off = (side ? 1 : -1) * 0.45;
      legs.setMatrixAt(i * 2 + side, m.compose(v.set(p.x - Math.sin(p.yaw) * off, (H - 0.3) / 2, p.z - Math.cos(p.yaw) * off), q, one));
    }
    motors.setMatrixAt(i, m.compose(v.set(p.x, H - 0.38, p.z), q, one));
  }
  legs.name = "supports";
  motors.name = "linear_motors";
  root.add(legs, motors);

  // bandejas (se mueven con el recorrido del lazo)
  const nTrays = Math.max(1, Math.floor(L / pitch));
  const trayGeo = new THREE.BoxGeometry(Math.min(pitch - 0.08, 1.3), 0.05, TRAY_W - 0.1);
  const trays = new THREE.InstancedMesh(trayGeo, M.paint("#5d7ea8", 0.4), nTrays);
  trays.name = "trays";
  trays.castShadow = true;
  root.add(trays);
  const bags = P.bagInstances(MAX_BAGS, 0.7);
  root.add(bags);

  // inducciones: dos bandas desde el borde -X hasta el inicio de cada recta
  for (const sz of [1, -1]) {
    const len = DX / 2 - S / 2;
    const belt = P.box(len, 0.08, 1.0, M.rubber(), 0.01, "inductions");
    belt.position.set(-S / 2 - len / 2, H - 0.05, zc + sz * r);
    root.add(belt);
    for (const side of [-1, 1]) {
      const g = P.box(len, 0.18, 0.04, M.stainless(), 0.005);
      g.position.set(-S / 2 - len / 2, H + 0.03, zc + sz * r + side * 0.52);
      root.add(g);
    }
  }
  // lector de etiquetas: arco sobre la recta de descarga
  const arch = P.group("tag_reader");
  for (const side of [-1, 1]) {
    const post = P.box(0.12, 1.3, 0.12, M.paint("#2c3e50", 0.4), 0.01);
    post.position.set(0, H + 0.45, side * 0.95);
    arch.add(post);
  }
  const beam = P.box(0.3, 0.2, 2.1, M.paint("#2c3e50", 0.4), 0.02);
  beam.position.set(0, H + 1.15, 0);
  arch.add(beam);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.6), M.emissive("#ff3030", 1.5));
  scan.rotation.x = -Math.PI / 2;
  scan.position.set(0, H + 1.04, 0);
  arch.add(scan);
  arch.position.set(-S / 2 + 1.0, 0, zc + r);
  root.add(arch);

  // rampas de vuelo hacia +Z
  const chuteZ0 = zc + r + TRAY_W / 2;
  // con el lazo a altura de mesa la rampa baja 0,45 m; con el lazo elevado baja hasta ≈ 1 m del piso
  const drop = Math.max(0.45, H - 1.0);
  const slope = Math.atan2(drop, cl);
  const chuteLen = Math.hypot(drop, cl);
  const chuteX: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = -S / 2 + (S * (k + 0.5)) / n;
    chuteX.push(x);
    const c = P.group("chutes");
    const bed = P.box(1.3, 0.04, chuteLen, M.stainless(), 0.005);
    bed.position.set(0, 0, chuteLen / 2);
    c.add(bed);
    for (const side of [-1, 1]) {
      const wall = P.box(0.03, 0.35, chuteLen, M.stainless(), 0.004);
      wall.position.set(side * 0.66, 0.17, chuteLen / 2);
      c.add(wall);
    }
    const label = P.nameplate([`${k + 1}`], 0.35, 0.25, "#1d2a3a", "#ffffff");
    label.position.set(0, 0.5, 0.02);
    c.add(label);
    c.rotation.x = slope;
    c.position.set(x, H - 0.1, chuteZ0);
    root.add(c);
    const endY = H - 0.1 - drop;
    const leg = P.box(0.08, endY, 0.08, steel, 0.005);
    leg.position.set(x, endY / 2, chuteZ0 + cl - 0.2);
    root.add(leg);
  }
  // rampa de manual (radial, al entrar a la curva)
  const pm = at(S + MANUAL_AFTER_M);
  const manual = P.group("manual_chute");
  const mbed = P.box(1.3, 0.04, chuteLen, M.paint("#c0392b", 0.5), 0.005);
  mbed.position.set(0, 0, chuteLen / 2);
  manual.add(mbed);
  manual.rotation.order = "YXZ";
  manual.rotation.y = pm.yaw;
  manual.rotation.x = slope;
  const radial = new THREE.Vector3(Math.sin(pm.yaw), 0, Math.cos(pm.yaw));
  manual.position.set(pm.x + radial.x * TRAY_W * 0.5, H - 0.1, pm.z + radial.z * TRAY_W * 0.5);
  root.add(manual);
  const mEndY = H - 0.1 - drop;
  const mleg = P.box(0.08, mEndY, 0.08, steel, 0.005);
  mleg.position.set(manual.position.x + radial.x * (cl - 0.2), mEndY / 2, manual.position.z + radial.z * (cl - 0.2));
  root.add(mleg);

  const light = P.stackLight(0.4);
  light.object.position.set(-S / 2 + 1.0, H + 1.25, zc + r);
  root.add(light.object);

  let time = 0;
  function update(frame: AnimationFrame, dt: number): void {
    time += dt;
    const travel = ch(frame, "loop_travel");
    for (let i = 0; i < nTrays; i++) {
      const p = at(i * pitch + travel);
      q.setFromAxisAngle(up, p.yaw);
      trays.setMatrixAt(i, m.compose(v.set(p.x, H + 0.05, p.z), q, one));
    }
    trays.instanceMatrix.needsUpdate = true;
    let k = 0;
    const onLoop = Math.min(nTrays, Math.round(ch(frame, "on_loop")));
    for (let j = 0; j < onLoop && k < MAX_BAGS; j++) {
      const tray = Math.floor((j * nTrays) / Math.max(1, onLoop));
      const p = at(tray * pitch + travel);
      q.setFromAxisAngle(up, p.yaw);
      bags.setMatrixAt(k++, m.compose(v.set(p.x, H + 0.075, p.z), q, one));
    }
    // maletas en las rampas, apiladas desde el fondo
    for (let c = 0; c < n; c++) {
      const count = Math.min(6, Math.round(ch(frame, `chute_${c + 1}`)));
      for (let i = 0; i < count && k < MAX_BAGS; i++) {
        const d = chuteLen - 0.45 - i * 0.8;
        if (d < 0.2) break;
        bags.setMatrixAt(k++, m.makeTranslation(chuteX[c], H - 0.1 - Math.sin(slope) * d + 0.03, chuteZ0 + Math.cos(slope) * d));
      }
    }
    const mc = Math.min(4, Math.round(ch(frame, "chute_manual")));
    for (let i = 0; i < mc && k < MAX_BAGS; i++) {
      const d = chuteLen - 0.45 - i * 0.8;
      const base = manual.position;
      bags.setMatrixAt(k++, m.makeTranslation(base.x + radial.x * Math.cos(slope) * d, H - 0.1 - Math.sin(slope) * d + 0.03, base.z + radial.z * Math.cos(slope) * d));
    }
    bags.count = k;
    bags.instanceMatrix.needsUpdate = true;
    light.set(ch(frame, "stack_light"), time);
  }
  update({ channels: { loop_travel: 0, on_loop: 12, chute_1: 2, chute_3: 1, stack_light: 1 }, state: "running" }, 0);

  return {
    root,
    size: { dx: DX, dy: DZ, height: H + 1.6 },
    update: (frame, dt) => update(frame, dt),
    dispose: () => disposeObject(root),
  };
}
