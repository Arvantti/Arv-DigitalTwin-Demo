/**
 * Geometría del molino granulador. Escala s = (capacidad/40)^0,33.
 * - beside_press: molino bajo sobre ruedas, tolva cuadrada insonorizada, cámara de corte, motor con
 *   guarda de correa y volante, cajón de criba y caja de molido al frente (+Z).
 * - central: bastidor sobre patas, tolva grande con rampa de alimentación, motor y volante grandes,
 *   soplador de descarga, tubería al ciclón y saco grande bajo el ciclón (+X).
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

function squareHopper(wBottom: number, wTop: number, h: number, material: THREE.Material, closed = false): THREE.Mesh {
  const geo = new THREE.CylinderGeometry((wTop / 2) * Math.SQRT2, (wBottom / 2) * Math.SQRT2, h, 4, 1, !closed);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, h / 2, 0);
  const mat = (material as THREE.MeshStandardMaterial).clone();
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export default function build(params: Params): EquipmentModel {
  const cap = num(params, "capacity_kg_h", 40);
  const kind = str(params, "kind", "beside_press");
  const rotorKw = num(params, "rotor_kw", 5.5);
  const screen = num(params, "screen_mm", 8);
  const color = str(params, "body_color", "#2f5d8a");
  const s = Math.cbrt(cap / 40);
  const central = kind === "central";
  const root = P.group("granulator");
  const body = M.paint(color, 0.42);
  const dark = M.paint("#2a2d31", 0.5);

  // ---------------------------------------------------------------- base y cámara de corte
  const bw = 0.55 * s; // ancho de la cámara (X)
  const bd = 0.5 * s; // fondo (Z)
  const baseH = central ? 0.9 * s : 0.55 * s;
  const baseG = P.group("base");
  if (central) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = P.box(0.1, baseH, 0.1, dark, 0.01);
        leg.geometry.translate(0, baseH / 2, 0);
        leg.position.set((sx * bw) / 2, 0, (sz * bd) / 2);
        baseG.add(leg);
      }
    const ring = P.box(bw + 0.12, 0.1, bd + 0.12, dark, 0.01);
    ring.position.y = baseH - 0.05;
    baseG.add(ring);
  } else {
    const cabinet = P.box(bw, baseH - 0.08, bd, body, 0.02);
    cabinet.position.y = 0.08 + (baseH - 0.08) / 2;
    baseG.add(cabinet);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const caster = P.cylinderZ(0.035, 0.03, M.rubber(), 16);
        caster.position.set((sx * bw) / 2 - sx * 0.05, 0.035, (sz * bd) / 2 - sz * 0.05);
        baseG.add(caster);
      }
    // cajón de criba
    const drawer = P.box(bw * 0.7, 0.12, 0.02, dark, 0.006, "screen_drawer");
    drawer.position.set(0, baseH - 0.2, bd / 2 + 0.01);
    baseG.add(drawer);
    const handle = P.box(0.12, 0.02, 0.03, M.polishedSteel(), 0.005);
    handle.position.set(0, baseH - 0.2, bd / 2 + 0.03);
    baseG.add(handle);
  }
  root.add(baseG);
  const chamberH = 0.38 * s;
  const chamber = P.box(bw * 0.92, chamberH, bd * 0.92, M.paint("#3b4650", 0.45), 0.02, "cutting_chamber");
  chamber.position.y = baseH + chamberH / 2;
  root.add(chamber);
  // tapa abisagrada con pernos de seguridad
  const cover = P.box(bw * 0.95, 0.04, bd * 0.95, body, 0.01);
  cover.position.y = baseH + chamberH + 0.02;
  root.add(cover);
  for (const sx of [-1, 1]) {
    const knob = P.cylinder(0.025, 0.025, 0.05, M.paint("#c62828", 0.4), 16);
    knob.position.set(sx * bw * 0.38, baseH + chamberH + 0.04, bd * 0.4);
    root.add(knob);
  }

  // ---------------------------------------------------------------- tolva insonorizada
  const hopperH = (central ? 0.9 : 0.6) * s;
  const yHop = baseH + chamberH + 0.04;
  const hopper = squareHopper(bw * 0.6, bw * (central ? 1.5 : 1.25), hopperH, body);
  hopper.name = "hopper";
  hopper.position.y = yHop;
  root.add(hopper);
  const rimW = bw * (central ? 1.55 : 1.3);
  for (const [dx, dz, rot] of [[0, rimW / 2, 0], [0, -rimW / 2, 0], [rimW / 2, 0, Math.PI / 2], [-rimW / 2, 0, Math.PI / 2]] as [number, number, number][]) {
    const bar = P.box(rimW + 0.04, 0.04, 0.04, dark, 0.006);
    bar.rotation.y = rot;
    bar.position.set(dx, yHop + hopperH, dz);
    root.add(bar);
  }
  // cortina de lamas a la entrada (sound box)
  const curtain = P.box(bw * 0.9, 0.18, 0.012, M.rubber(), 0.003, "sound_box");
  curtain.position.set(0, yHop + hopperH - 0.1, 0);
  root.add(curtain);
  // material en la tolva y piezas que caen
  const scrapMat = M.plastic("#d9c27a", 0.5);
  const pile = squareHopper(bw * 0.58, bw * 0.9, hopperH * 0.6, scrapMat, true);
  pile.position.y = yHop + 0.01;
  root.add(pile);
  const falling = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05 * s, 0.015 * s, 0.03 * s), scrapMat, 8);
  falling.name = "feed";
  root.add(falling);
  if (central) {
    const chute = P.box(0.7 * s, 0.04, 0.4 * s, M.galvanized(), 0.01);
    chute.rotation.z = -0.5;
    chute.position.set(-bw * 0.95, yHop + hopperH + 0.25 * s, 0);
    root.add(chute);
  }

  // ---------------------------------------------------------------- motor, correa y volante
  const drive = P.group("motor");
  const mot = P.motor(rotorKw, "#2f4f6f");
  mot.rotation.y = Math.PI / 2;
  drive.add(mot);
  drive.position.set(bw / 2 + 0.25 * s, central ? baseH * 0.35 : 0.3 * s, -bd * 0.2);
  root.add(drive);
  const guard = P.box(0.08 * s, (central ? baseH : baseH) * 0.9, bd * 0.75, M.paint(M.SAFETY_YELLOW, 0.45), 0.01, "belt_guard");
  guard.position.set(bw / 2 + 0.06 * s, baseH * 0.45 + 0.15 * s, -bd * 0.05);
  root.add(guard);
  const flywheel = P.group("flywheel");
  const fly = P.cylinderX(0.22 * s, 0.07 * s, M.paint("#3b4650", 0.4), 32);
  flywheel.add(fly);
  const spoke = P.box(0.075 * s, 0.4 * s, 0.05 * s, M.paint(M.SAFETY_YELLOW, 0.4), 0.004);
  flywheel.add(spoke);
  flywheel.position.set(-bw / 2 - 0.06 * s, baseH + chamberH / 2, 0);
  root.add(flywheel);

  // ---------------------------------------------------------------- salida del molido
  const regrindMat = M.plastic("#e6d9a8", 0.6);
  let binFill: THREE.Mesh;
  let binTop = 0;
  let maxX = Math.max(bw / 2 + 0.55 * s, (bw * 1.3) / 2);
  let minX = -bw / 2 - 0.12 * s;
  if (central) {
    // soplador y tubería al ciclón con saco grande
    const blower = P.group("blower");
    blower.add(P.cylinderZ(0.22 * s * 0.6, 0.15 * s, dark, 32));
    const bm = P.motor(rotorKw * 0.15, "#2f4f6f");
    bm.position.z = -0.25 * s;
    blower.add(bm);
    blower.position.set(0, 0.3 * s, bd / 2 + 0.3 * s);
    root.add(blower);
    const cx = bw / 2 + 1.0 * s;
    const cycR = 0.32 * s;
    const yCyc = 1.5 * s;
    root.add(P.pipe([new THREE.Vector3(0, 0.3 * s, bd / 2 + 0.3 * s), new THREE.Vector3(0, yCyc + 0.7 * s, bd / 2 + 0.3 * s), new THREE.Vector3(cx, yCyc + 0.7 * s, bd / 2 + 0.3 * s), new THREE.Vector3(cx, yCyc + 0.7 * s, cycR * 0.6)], 0.06 * s, M.galvanized(), 0.25 * s));
    const cyc = P.group("cyclone");
    const cylP = P.cylinder(cycR, cycR, 0.6 * s, M.galvanized(), 32);
    cylP.position.y = yCyc + 0.3 * s;
    cyc.add(cylP);
    const coneP = P.frustum(0.08 * s, cycR, 0.6 * s, M.galvanized());
    coneP.position.y = yCyc - 0.3 * s;
    cyc.add(coneP);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = P.box(0.06, yCyc, 0.06, dark, 0.006);
        leg.geometry.translate(0, yCyc / 2, 0);
        leg.position.set(sx * cycR * 1.15, 0, sz * cycR * 1.15);
        cyc.add(leg);
      }
    const support = P.box(cycR * 2.4, 0.05, cycR * 2.4, dark, 0.006);
    support.position.y = yCyc;
    cyc.add(support);
    // saco grande (big bag) bajo el ciclón
    const bagH = Math.min(0.9 * s, yCyc - 0.45 * s);
    const bag = P.box(0.75 * s, bagH, 0.75 * s, M.plastic("#e8e8e2", 0.8), 0.06 * s);
    bag.position.y = bagH / 2 + 0.02;
    cyc.add(bag);
    binFill = P.box(0.7 * s, 1, 0.7 * s, regrindMat, 0.02);
    cyc.add(binFill);
    binTop = bagH;
    cyc.position.set(cx, 0, 0);
    root.add(cyc);
    maxX = cx + Math.max(cycR * 1.2, 0.4 * s);
  } else {
    // caja de molido al frente, bajo la descarga
    const bin = P.group("bin");
    const binH = 0.32 * s;
    const tote = P.box(bw * 0.8, binH, 0.3 * s, M.plastic("#1e5aa8", 0.5), 0.02);
    tote.position.y = binH / 2 + 0.02;
    bin.add(tote);
    binFill = P.box(bw * 0.75, 1, 0.27 * s, regrindMat, 0.01);
    bin.add(binFill);
    binTop = binH;
    bin.position.set(0, 0, bd / 2 + 0.17 * s);
    root.add(bin);
  }

  const light = P.stackLight(0.2);
  light.object.position.set(-bw * 0.35, yHop + hopperH, -bd * 0.45);
  root.add(light.object);
  const plate = P.nameplate([`MOLINO ${Math.round(cap)} kg/h`, `CRIBA ${screen} mm`], 0.3 * Math.max(1, s * 0.7), 0.08 * Math.max(1, s * 0.7));
  plate.position.set(0, baseH + chamberH / 2, bd * 0.46 + 0.012);
  root.add(plate);

  const m4 = new THREE.Matrix4();
  let t = 0;
  function update(frame: AnimationFrame, dt: number): void {
    t += dt;
    flywheel.rotation.x += ch(frame, "rotor") * 25 * dt;
    const fill = Math.max(0.02, Math.min(1, ch(frame, "throat_fill")));
    pile.scale.set(1, fill, 1);
    pile.visible = ch(frame, "throat_fill") > 0.01;
    const feeding = ch(frame, "feed") > 0.5;
    falling.count = feeding ? 8 : 0;
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.8 + i / 8) % 1;
      m4.makeRotationY(i * 1.3 + t);
      m4.setPosition(((i % 3) - 1) * 0.1 * s, yHop + hopperH * (1.3 - 0.9 * ph), (((i * 7) % 3) - 1) * 0.08 * s);
      falling.setMatrixAt(i, m4);
    }
    falling.instanceMatrix.needsUpdate = true;
    const lvl = Math.max(0.01, Math.min(1, ch(frame, "bin_level")));
    binFill.scale.y = lvl * binTop * 0.9;
    binFill.position.y = 0.03 + (lvl * binTop * 0.9) / 2;
    binFill.visible = ch(frame, "bin_level") > 0.01;
    light.set(ch(frame, "alarm_light", 1), performance.now() / 1000);
  }
  update({ channels: { rotor: 1, feed: 1, throat_fill: 0.4, bin_level: 0.5 }, state: "running" }, 0);

  root.position.x = -(minX + maxX) / 2;
  const wrapper = P.group("granulator-root", root);
  const height = Math.max(yHop + hopperH + 0.3, central ? 1.5 * s + 0.75 * s : 0);
  return { root: wrapper, size: { dx: maxX - minX, dy: central ? bd + 1.0 * s : bd + 0.5 * s, height }, update, dispose: () => disposeObject(wrapper) };
}
