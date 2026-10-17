/**
 * Geometría del molino granulador de cuchillas: cámara de corte con puerta de servicio, tolva con
 * cubierta acústica y el scrap a la vista, motor con transmisión por correa tras su guarda y volante,
 * soplador de descarga, tubería de transporte neumático (con granulado en movimiento), ciclón y
 * contenedor de recogida. Eje del rotor sobre +X; el operario mira a +Z.
 *
 * Escala: todas las dimensiones siguen s = ∛(capacidad ÷ 500 kg/h), limitada a [0,45; 1,8];
 * a 500 kg/h la huella es de 3,0 × 2,2 × 2,5 m.
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
  const throughput = num(params, "throughput_kg_h", 500);
  const screen = num(params, "screen_mm", 10);
  const motorKw = num(params, "motor_kw", 37);
  const s = Math.max(0.45, Math.min(1.8, Math.cbrt(throughput / 500)));
  const L = 3.0 * s;
  const W = 2.2 * s;
  const H = 2.5 * s;
  const root = P.group("granulator");
  const blue = M.paint("#2f5f93", 0.4);
  const grey = M.paint("#cfd3d6", 0.45);
  const steel = M.stainless();

  // bastidor y cámara de corte
  const x0 = -0.55 * s; // centro de la cámara
  const base = P.slab(1.6 * s, 0.25 * s, 1.1 * s, M.paint("#3a4047", 0.5), 0.015, "frame");
  base.position.set(x0 - 0.1 * s, 0, 0);
  root.add(base);
  const chamber = P.slab(1.1 * s, 0.85 * s, 0.95 * s, blue, 0.025, "grinding_chamber");
  chamber.position.set(x0, 0.25 * s, 0);
  root.add(chamber);
  const door = P.box(0.6 * s, 0.6 * s, 0.03, grey, 0.012, "door");
  door.position.set(x0, 0.25 * s + 0.43 * s, 0.95 * s * 0.5 + 0.015);
  root.add(door);
  const handle = P.box(0.03, 0.2 * s, 0.04, M.darkSteel(), 0.008);
  handle.position.set(x0 + 0.24 * s, 0.25 * s + 0.43 * s, 0.95 * s * 0.5 + 0.05);
  root.add(handle);
  const interlock = P.box(0.06, 0.1, 0.05, M.paint("#f2b705", 0.45), 0.008);
  interlock.position.set(x0 - 0.3 * s, 0.25 * s + 0.43 * s, 0.95 * s * 0.5 + 0.03);
  root.add(interlock);

  // tolva con cubierta acústica (cuatro lados) y scrap a la vista
  const yHop = 0.25 * s + 0.85 * s;
  const hopperH = 0.8 * s;
  const hopper = P.cylinder(0.78 * s, 0.5 * s, hopperH, M.paint("#2a2d31", 0.5), 4, "hopper");
  hopper.rotation.y = Math.PI / 4;
  hopper.position.set(x0, yHop, 0);
  root.add(hopper);
  const rimY = yHop + hopperH + 0.02;
  for (const [x, z, w, d] of [
    [0, 0.55 * s, 1.1 * s, 0.06],
    [0, -0.55 * s, 1.1 * s, 0.06],
    [0.55 * s, 0, 0.06, 1.1 * s],
    [-0.55 * s, 0, 0.06, 1.1 * s],
  ] as [number, number, number, number][]) {
    const edge = P.box(w, 0.07, d, M.paint("#f2b705", 0.45), 0.01);
    edge.position.set(x0 + x, rimY, z);
    root.add(edge);
  }
  const scrapMat = new THREE.MeshStandardMaterial({ color: "#c9c2b0", roughness: 0.85 });
  const heap = P.cylinder(0.25 * s, 0.7 * s, 0.4 * s, scrapMat, 4, "scrap");
  heap.rotation.y = Math.PI / 4;
  heap.position.set(x0, yHop + hopperH - 0.15 * s, 0);
  root.add(heap);

  // motor, correa y volante en el extremo -X
  const guard = P.box(0.18 * s, 0.7 * s, 0.4 * s, M.paint("#f2b705", 0.45), 0.012, "belt_guard");
  guard.position.set(x0 - 0.65 * s, 0.25 * s + 0.45 * s, 0);
  root.add(guard);
  const fly = P.group("flywheel");
  fly.position.set(x0 - 0.78 * s, 0.25 * s + 0.45 * s, 0);
  const disc = P.cylinderX(0.3 * s, 0.05, M.paint("#3a4047", 0.4), 40);
  fly.add(disc);
  const mark = P.box(0.06, 0.07 * s, 0.3 * s, M.paint("#f2f2f2", 0.5), 0.004);
  mark.position.set(-0.03, 0.12 * s, 0);
  fly.add(mark);
  root.add(fly);
  const motor = P.motor(motorKw, "#2f4f6f");
  motor.rotation.y = Math.PI / 2;
  const ms = Math.max(0.7, s);
  motor.scale.setScalar(ms);
  motor.position.set(x0 - 0.65 * s, (motor.userData.radius as number) * ms * 1.3, -0.75 * s);
  root.add(motor);
  const beltRun = P.box(0.04, 0.5 * s, 0.04, M.rubber(), 0.004);
  beltRun.position.set(x0 - 0.7 * s, 0.25 * s + 0.2 * s, -0.4 * s);
  beltRun.rotation.x = 0.8;
  root.add(beltRun);

  // descarga neumática: soplador, tubería, ciclón y contenedor
  const xc = L / 2 - 0.45 * s;
  const yPipe = 0.5 * s;
  const blower = P.cylinder(0.16 * s, 0.16 * s, 0.3 * s, M.paint("#2f4f6f", 0.35), 28, "discharge_blower");
  blower.position.set(x0 + 0.85 * s, 0.1, 0.1 * s);
  root.add(blower);
  const points = [
    new THREE.Vector3(x0 + 0.5 * s, yPipe, 0),
    new THREE.Vector3(xc, yPipe, 0),
    new THREE.Vector3(xc, H - 0.45 * s, 0),
  ];
  root.add(P.pipe(points, 0.07 * s, M.paint("#aeb5bb", 0.4), 0.2 * s, "transport_pipe"));
  const cycTop = H - 0.3 * s;
  const cyc = P.cylinder(0.4 * s, 0.4 * s, 0.4 * s, steel, 32, "cyclone");
  cyc.position.set(xc, cycTop - 0.4 * s, 0);
  root.add(cyc);
  const cone = P.cylinder(0.4 * s, 0.1 * s, 0.7 * s, steel, 32);
  cone.position.set(xc, cycTop - 1.1 * s, 0);
  root.add(cone);
  const outlet = P.cylinder(0.1 * s, 0.1 * s, 0.25 * s, steel, 20);
  outlet.position.set(xc, cycTop, 0);
  root.add(outlet);
  const bin = P.slab(0.9 * s, 0.7 * s, 0.9 * s, M.paint("#d97b1e", 0.5), 0.02, "collection_bin");
  bin.position.set(xc, 0, 0);
  root.add(bin);
  const binFill = P.box(0.8 * s, 0.01, 0.8 * s, new THREE.MeshStandardMaterial({ color: "#c9c2b0", roughness: 0.9 }), 0.004);
  binFill.position.set(xc, 0.45 * s, 0);
  root.add(binFill);

  // granulado en movimiento por la tubería
  const path = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.05);
  const dotCount = 14;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035 * s, 8, 6), scrapMat, dotCount);
  root.add(dots);
  const mtx = new THREE.Matrix4();

  // mando
  const cab = P.cabinet(0.7 * s, 1.3 * s, 0.35 * s);
  cab.position.set(x0 + 0.3 * s, 0, -0.85 * s);
  cab.rotation.y = Math.PI;
  root.add(cab);
  const hmi = P.hmiPanel(0.45);
  hmi.object.position.set(x0 + 0.9 * s, 0, 0.75 * s);
  hmi.object.scale.setScalar(0.85);
  root.add(hmi.object);
  const light = P.stackLight(0.25);
  light.object.position.set(x0 + 0.5 * s, 0.25 * s + 0.85 * s, 0.4 * s);
  root.add(light.object);
  const plate = P.nameplate([`MOLINO ${throughput} KG/H`, `CRIBA Ø${screen} MM`], 0.4, 0.1);
  plate.position.set(x0 - 0.3 * s, 0.25 * s + 0.15 * s, 0.95 * s * 0.5 + 0.004);
  root.add(plate);

  let phase = 0;
  let lastKey = "";
  function update(frame: AnimationFrame, dt = 0.016): void {
    const rotor = ch(frame, "rotor_speed");
    fly.rotation.x += dt * rotor * 12;
    const flow = ch(frame, "out_flow");
    phase = (phase + dt * (0.15 + flow * 0.7)) % 1;
    dots.count = flow > 0.02 ? dotCount : 0;
    for (let i = 0; i < dots.count; i++) {
      const p = path.getPoint((phase + i / dotCount) % 1);
      dots.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z));
    }
    dots.instanceMatrix.needsUpdate = true;
    const fill = Math.max(0, Math.min(1, ch(frame, "hopper_fill")));
    heap.scale.setScalar(Math.max(0.001, fill));
    heap.visible = fill > 0.01;
    binFill.scale.y = 1 + 40 * Math.min(1, flow * 0.4 + 0.1);
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const v = frame.variables ?? {};
    const key = `${frame.state}|${ch(frame, "motor_load").toFixed(2)}|${v.knife_sharpness_pct ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "MOLINO",
        [
          ["Carga motor", `${(ch(frame, "motor_load") * 100).toFixed(0)} %`],
          ["Filo", v.knife_sharpness_pct == null ? "—" : `${Number(v.knife_sharpness_pct).toFixed(0)} %`],
          ["Finos", v.fines_pct == null ? "—" : `${Number(v.fines_pct).toFixed(1)} %`],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: { rotor_speed: 1, hopper_fill: 0.5, motor_load: 0.6, out_flow: 0.6, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: H + 0.5 }, update, dispose: () => disposeObject(root) };
}
