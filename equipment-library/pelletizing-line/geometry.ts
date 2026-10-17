/**
 * Geometría de la línea de peletizado de hebras: tolva con cargador de vacío, extrusor de husillo con
 * resistencias en el cilindro (brillan con el ciclo de calefacción), motor y reductor, cambiador de malla,
 * cabezal de hebras, baño de agua con las hebras a la vista, cortadora con su tambor y rodillos, canaleta y
 * big-bag de descarga. Eje de la línea sobre +X (alimentación a la izquierda, pellet a la derecha); el operario
 * mira a +Z.
 *
 * Escala: s = ∛(capacidad ÷ 350 kg/h), limitada a [0,6; 1,6]; a 350 kg/h la huella es de ≈ 9,6 × 2,0 × 2,4 m.
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

export default function build(params: Params): EquipmentModel {
  const throughput = num(params, "throughput_kg_h", 350);
  const motorKw = num(params, "motor_kw", 110);
  const s = Math.max(0.6, Math.min(1.6, Math.cbrt(throughput / 350)));
  const root = P.group("pelletizing-line");
  const green = M.paint("#3d7a5a", 0.4);
  const dark = M.paint("#3a4047", 0.5);
  const yellow = M.paint("#f2b705", 0.45);
  const steel = M.stainless();

  const L = 9.6 * s;
  const x0 = -L / 2;
  const yAxis = 1.0 * s; // eje del husillo

  // bastidor del extrusor
  const frame = P.slab(5.0 * s, 0.4 * s, 0.9 * s, dark, 0.02, "frame");
  frame.position.set(x0 + 2.6 * s, 0, 0);
  root.add(frame);

  // motor y reductor en el extremo -X
  const motor = P.motor(motorKw, "#2f4f6f");
  const ms = Math.max(0.8, s);
  motor.scale.setScalar(ms);
  motor.rotation.y = Math.PI / 2;
  motor.position.set(x0 + 0.45 * s, 0.4 * s + (motor.userData.radius as number) * ms, 0);
  root.add(motor);
  const gearbox = P.gearbox(0.7 * s, "#3d7a5a");
  gearbox.position.set(x0 + 1.55 * s, yAxis - 0.35 * s, 0);
  gearbox.name = "gearbox";
  root.add(gearbox);

  // cilindro con resistencias
  const barrelLen = 3.0 * s;
  const barrelR = 0.2 * s;
  const xBarrel = x0 + 2.0 * s + barrelLen / 2;
  const barrel = P.cylinderX(barrelR, barrelLen, M.paint("#8c949b", 0.35), 36, "barrel");
  barrel.position.set(xBarrel, yAxis, 0);
  root.add(barrel);
  const bands = P.group("heater_bands");
  const bandMats: THREE.MeshStandardMaterial[] = [];
  const bandCount = 5;
  for (let i = 0; i < bandCount; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: "#2a2d31", roughness: 0.5, emissive: "#ff5a1f", emissiveIntensity: 0 });
    bandMats.push(mat);
    const band = P.cylinderX(barrelR * 1.12, 0.38 * s, mat, 36);
    band.position.set(xBarrel - barrelLen / 2 + (i + 0.6) * (barrelLen / bandCount), yAxis, 0);
    bands.add(band);
  }
  root.add(bands);
  // soportes del cilindro
  for (const px of [0.2, 0.8]) {
    const post = P.box(0.18 * s, yAxis - barrelR - 0.4 * s, 0.5 * s, dark, 0.01);
    post.position.set(xBarrel - barrelLen / 2 + px * barrelLen, 0.4 * s + (yAxis - barrelR - 0.4 * s) / 2, 0);
    root.add(post);
  }

  // tolva de alimentación y cargador de vacío
  const xHop = x0 + 2.35 * s;
  const hopperH = 0.9 * s;
  const hopper = P.cylinder(0.55 * s, 0.2 * s, hopperH, steel, 4, "hopper");
  hopper.rotation.y = Math.PI / 4;
  hopper.position.set(xHop, yAxis + barrelR, 0);
  root.add(hopper);
  const flakeMat = new THREE.MeshStandardMaterial({ color: "#b9b2a0", roughness: 0.9 });
  const heap = P.cylinder(0.2 * s, 0.5 * s, 0.4 * s, flakeMat, 4, "flakes");
  heap.rotation.y = Math.PI / 4;
  heap.position.set(xHop, yAxis + barrelR + hopperH - 0.18 * s, 0);
  root.add(heap);
  const loader = P.cylinder(0.2 * s, 0.2 * s, 0.7 * s, M.paint("#c9ced2", 0.4), 28, "loader");
  loader.position.set(xHop, yAxis + barrelR + hopperH + 0.1 * s, 0);
  root.add(loader);
  const loaderHose = P.pipe(
    [
      new THREE.Vector3(xHop + 0.2 * s, yAxis + barrelR + hopperH + 0.45 * s, 0),
      new THREE.Vector3(xHop + 0.7 * s, yAxis + barrelR + hopperH + 0.45 * s, 0),
      new THREE.Vector3(xHop + 0.7 * s, yAxis + barrelR + hopperH + 1.0 * s, 0.3 * s),
    ],
    0.05 * s,
    M.paint("#2a2d31", 0.6),
    0.15 * s,
  );
  root.add(loaderHose);

  // cambiador de malla y cabezal de hebras
  const xScr = x0 + 2.0 * s + barrelLen + 0.3 * s;
  const screen = P.slab(0.5 * s, 0.7 * s, 0.6 * s, green, 0.02, "screen_changer");
  screen.position.set(xScr, yAxis - 0.35 * s, 0);
  root.add(screen);
  const screenHandle = P.cylinderZ(0.03 * s, 0.35 * s, M.darkSteel(), 12);
  screenHandle.position.set(xScr, yAxis + 0.05 * s, 0.4 * s);
  root.add(screenHandle);
  const xDie = xScr + 0.65 * s;
  const die = P.slab(0.55 * s, 0.55 * s, 0.8 * s, M.paint("#8c949b", 0.35), 0.02, "die_head");
  die.position.set(xDie, yAxis - 0.28 * s, 0);
  root.add(die);

  // baño de agua con las hebras a la vista
  const xBath0 = xDie + 0.4 * s;
  const bathLen = 3.4 * s;
  const bathY = 0.55 * s;
  const bathH = 0.45 * s;
  const bath = P.slab(bathLen, bathH, 0.9 * s, steel, 0.015, "water_bath");
  bath.position.set(xBath0 + bathLen / 2, bathY, 0);
  root.add(bath);
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(bathLen - 0.1, 0.01, 0.8 * s),
    new THREE.MeshStandardMaterial({ color: "#4aa3df", transparent: true, opacity: 0.55, roughness: 0.15 }),
  );
  water.position.set(xBath0 + bathLen / 2, bathY + bathH - 0.05 * s, 0);
  root.add(water);
  for (const lx of [0.15, 0.85]) {
    for (const lz of [-0.4, 0.4]) {
      const leg = P.box(0.08 * s, bathY, 0.08 * s, dark, 0.005);
      leg.position.set(xBath0 + lx * bathLen, bathY / 2, lz * s);
      root.add(leg);
    }
  }
  // hebras: del cabezal al baño y a lo largo de él
  const strands = P.group("strands");
  const strandMat = new THREE.MeshStandardMaterial({ color: "#6e6a5e", roughness: 0.6 });
  const strandCount = 8;
  const yWater = bathY + bathH - 0.045 * s;
  const yDie = yAxis - 0.28 * s;
  const dropLen = Math.hypot(0.4 * s, yDie - yWater);
  for (let i = 0; i < strandCount; i++) {
    const z = (i - (strandCount - 1) / 2) * 0.09 * s;
    const drop = P.cylinderX(0.012 * s, dropLen, strandMat, 8);
    drop.position.set(xDie + 0.25 * s + 0.2 * s, (yDie + yWater) / 2, z);
    drop.rotation.z = -Math.atan2(yDie - yWater, 0.4 * s);
    strands.add(drop);
    const run = P.cylinderX(0.012 * s, bathLen - 0.2 * s, strandMat, 8);
    run.position.set(xBath0 + bathLen / 2 + 0.1 * s, yWater, z);
    strands.add(run);
  }
  root.add(strands);

  // cortadora: rodillos de arrastre y tambor con cuchillas
  const xCut = xBath0 + bathLen + 0.55 * s;
  const cutBody = P.slab(0.9 * s, 0.9 * s, 0.9 * s, green, 0.025, "pelletizer");
  cutBody.position.set(xCut, bathY - 0.05 * s, 0);
  root.add(cutBody);
  const cutter = P.group("cutter");
  cutter.position.set(xCut, bathY + 0.55 * s, 0.46 * s);
  const drum = P.cylinderZ(0.16 * s, 0.1, M.darkSteel(), 24);
  cutter.add(drum);
  for (let i = 0; i < 6; i++) {
    const blade = P.box(0.03 * s, 0.14 * s, 0.14, M.chrome(), 0.004);
    const a = (i / 6) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.17 * s, Math.sin(a) * 0.17 * s, 0);
    blade.rotation.z = a;
    cutter.add(blade);
  }
  root.add(cutter);
  const guard = P.box(0.95 * s, 0.1 * s, 0.05, yellow, 0.01);
  guard.position.set(xCut, bathY + 0.55 * s + 0.2 * s, 0.52 * s);
  root.add(guard);

  // canaleta inclinada y big-bag
  const xBag = xCut + 1.55 * s;
  const chute = P.box(1.1 * s, 0.05, 0.5 * s, steel, 0.01, "chute");
  chute.position.set(xCut + 0.75 * s, bathY - 0.35 * s + 0.2 * s, 0);
  chute.rotation.z = -0.5;
  root.add(chute);
  const bag = P.group("bigbag");
  const bagBody = P.box(0.95 * s, 1.0 * s, 0.95 * s, M.paint("#b8aa86", 0.9), 0.06);
  bagBody.position.set(xBag, 0.12 + 0.5 * s, 0);
  bag.add(bagBody);
  const pellets = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 0.01, 0.8 * s), new THREE.MeshStandardMaterial({ color: "#6e6a5e", roughness: 0.7 }));
  pellets.position.set(xBag, 0.12 + 0.95 * s, 0);
  bag.add(pellets);
  for (const bx of [-1, 1]) {
    for (const bz of [-1, 1]) {
      const post = P.box(0.05, 1.5 * s, 0.05, yellow, 0.004);
      post.position.set(xBag + bx * 0.55 * s, 0.75 * s, bz * 0.55 * s);
      bag.add(post);
    }
  }
  root.add(bag);

  // pellets que bajan por la canaleta
  const dotCount = 10;
  const chuteStart = new THREE.Vector3(xCut + 0.35 * s, bathY - 0.1 * s, 0);
  const chuteEnd = new THREE.Vector3(xBag - 0.1 * s, 0.12 + 0.98 * s, 0);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025 * s, 8, 6), strandMat, dotCount);
  root.add(dots);
  const mtx = new THREE.Matrix4();
  const tmp = new THREE.Vector3();

  // mando
  const cab = P.cabinet(0.8 * s, 1.8 * s, 0.4 * s);
  cab.position.set(x0 + 1.5 * s, 0, -0.95 * s);
  cab.rotation.y = Math.PI;
  root.add(cab);
  const hmi = P.hmiPanel(0.5);
  hmi.object.position.set(xDie + 0.3 * s, 0, 0.85 * s);
  hmi.object.scale.setScalar(0.9);
  root.add(hmi.object);
  const light = P.stackLight(0.3);
  light.object.position.set(xScr, 0.4 * s + 0.1, -0.5 * s);
  root.add(light.object);
  const plate = P.nameplate([`PELETIZADO ${throughput} KG/H`, `MOTOR ${motorKw} KW`], 0.45, 0.11);
  plate.position.set(x0 + 3.1 * s, 0.4 * s + 0.2 * s, 0.45 * s + 0.004);
  root.add(plate);

  let phase = 0;
  let lastKey = "";
  function update(frame: AnimationFrame, dt = 0.016): void {
    const screw = ch(frame, "screw_speed");
    const glow = ch(frame, "heater_glow");
    for (const m of bandMats) m.emissiveIntensity = 1.6 * Math.max(0, Math.min(1, glow));
    const flow = ch(frame, "strand_flow");
    strands.visible = flow > 0.02;
    cutter.rotation.z -= dt * (screw * 10 + flow * 14);
    phase = (phase + dt * (0.15 + flow * 0.8)) % 1;
    dots.count = flow > 0.02 ? dotCount : 0;
    for (let i = 0; i < dots.count; i++) {
      tmp.lerpVectors(chuteStart, chuteEnd, (phase + i / dotCount) % 1);
      dots.setMatrixAt(i, mtx.makeTranslation(tmp.x, tmp.y, tmp.z));
    }
    dots.instanceMatrix.needsUpdate = true;
    const fill = Math.max(0, Math.min(1, ch(frame, "hopper_fill")));
    heap.scale.setScalar(Math.max(0.001, fill));
    heap.visible = fill > 0.01;
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const v = frame.variables ?? {};
    const key = `${frame.state}|${ch(frame, "motor_load").toFixed(2)}|${v.filter_pressure_bar ?? ""}|${v.melt_temp_c ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "PELETIZADORA",
        [
          ["Carga motor", `${(ch(frame, "motor_load") * 100).toFixed(0)} %`],
          ["Fundido", v.melt_temp_c == null ? "—" : `${Number(v.melt_temp_c).toFixed(0)} °C`],
          ["Presión filtro", v.filter_pressure_bar == null ? "—" : `${Number(v.filter_pressure_bar).toFixed(0)} bar`],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: { screw_speed: 1, heater_glow: 0.4, strand_flow: 0.7, hopper_fill: 0.5, motor_load: 0.7, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: 2.0 * s, height: 2.4 * s }, update, dispose: () => disposeObject(root) };
}
