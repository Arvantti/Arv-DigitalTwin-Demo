/**
 * Geometría de un nivel de la rejilla: un bastidor galvanizado sostiene el cabezal de 2" a lo largo de X al frente
 * (+Z) y cuatro ramales hacia el fondo (−Z), cada uno con su válvula de bola a la entrada y cuatro válvulas de
 * consumo (azules) que miran hacia abajo; dos válvulas de fuga (rojas) cuelgan del cabezal en los nodos 2 y 4.
 * Debajo, una canaleta por ramal desagua a un colector al frente que baja por una bajante. La entrada es un
 * montante que sube del piso al nodo 1 del cabezal, con manómetro. Cada válvula muestra un chorro proporcional a
 * su caudal y gira su manija con la apertura; la más crítica de la red (c44 del nivel 4) lleva un anillo amarillo.
 *
 * Separación entre nodos spacing_m (0,5 m): huella de 2,0 × 2,0 m; tubería a 0,9 m del piso.
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
  str,
  parts as P,
} from "@twin/3d";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface ValveHandle {
  id: string;
  lever: THREE.Mesh;
  jet: THREE.Mesh;
  jetLen: number;
}

export default function build(params: Params): EquipmentModel {
  const s = num(params, "spacing_m", 0.5);
  const level = num(params, "level", 1);
  const critical = bool(params, "critical_marker", false);
  const blue = str(params, "consumer_color", "#2f6fb3");
  const red = str(params, "leak_color", "#c62828");
  const r = Math.max(0.012, (num(params, "pipe_id_mm", 52.5) / 1000) / 2 + 0.004);
  const gy = 0.9; // eje de la tubería
  const xIn = -2 * s;
  const zHead = 2 * s;
  const xNode = (j: number) => -2 * s + j * s; // j = 1..4
  const zNode = (i: number) => zHead - i * s; // i = 1..4
  const pvc = M.paint("#8f989f", 0.6); // PVC gris
  const galv = M.galvanized();
  const root = P.group("distribution-grid");

  // bastidor: patas, vigas perimetrales y travesaños bajo los ramales
  const x0 = xIn - s * 0.3;
  const x1 = xNode(4) + s * 0.3;
  const z0 = zNode(4) - s * 0.3;
  const z1 = zHead + s * 0.3;
  const beamY = gy - r - 0.04;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const leg = P.slab(0.05, beamY + 0.02, 0.05, galv, 0.006);
    leg.position.set(x, 0, z);
    root.add(leg);
  }
  for (const z of [z0, z1]) {
    const beam = P.box(x1 - x0 + 0.05, 0.05, 0.05, galv, 0.006);
    beam.position.set((x0 + x1) / 2, beamY, z);
    root.add(beam);
  }
  for (const x of [x0, x1]) {
    const beam = P.box(0.05, 0.05, z1 - z0, galv, 0.006);
    beam.position.set(x, beamY, (z0 + z1) / 2);
    root.add(beam);
  }
  for (const zc of [zHead, zNode(1) - s / 2, zNode(3) - s / 2]) {
    const cross = P.box(x1 - x0, 0.04, 0.04, galv, 0.005);
    cross.position.set((x0 + x1) / 2, beamY, zc);
    root.add(cross);
  }

  // montante de entrada, cabezal y ramales
  const riser = P.pipe([v3(xIn, 0, zHead), v3(xIn, gy, zHead), v3(xNode(4), gy, zHead)], r, pvc, r * 2.5);
  root.add(riser);
  const capEnd = P.cylinderX(r * 1.15, r * 0.6, pvc, 24);
  capEnd.position.set(xNode(4) + r * 0.3, gy, zHead);
  root.add(capEnd);
  const inGauge = P.group("inlet-gauge");
  const gR = 0.05;
  inGauge.add(P.cylinder(r * 0.2, r * 0.2, 0.12, M.chrome(), 10));
  const gHead = P.group();
  gHead.position.y = 0.12 + gR;
  gHead.add(P.cylinderZ(gR, gR * 0.45, M.polishedSteel(), 28));
  const gFace = new THREE.Mesh(new THREE.CircleGeometry(gR * 0.86, 28), M.paint("#f4f4f0", 0.6));
  gFace.position.z = gR * 0.23;
  gHead.add(gFace);
  const gNeedle = P.box(gR * 0.08, gR * 0.75, gR * 0.03, M.paint("#1b1e22", 0.4), 0);
  gNeedle.geometry.translate(0, gR * 0.32, 0);
  gNeedle.position.z = gR * 0.25;
  gHead.add(gNeedle);
  inGauge.add(gHead);
  inGauge.position.set(xIn + s * 0.5, gy + r * 0.9, zHead);
  root.add(inGauge);

  const valves: ValveHandle[] = [];
  const consumerMat = M.paint(blue, 0.4);
  const leakMat = M.paint(red, 0.4);
  const water = M.emissive("#4aa8ff", 1.6);
  const gutterTop = 0.32;
  const jetBottom = gutterTop - 0.03;

  /** Válvula de descarga hacia abajo bajo un nodo; la manija gira con la apertura. */
  const dropValve = (id: string, x: number, z: number, mat: THREE.Material) => {
    const g = P.group(id);
    g.position.set(x, gy, z);
    const nipple = P.cylinder(r * 0.35, r * 0.35, 0.09, pvc, 12);
    nipple.position.y = -0.09 - r * 0.6;
    g.add(nipple);
    const body = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 0.75, 0.034), 18, 12), mat);
    body.position.y = -0.11 - r * 0.6;
    body.castShadow = true;
    g.add(body);
    const spout = P.cylinder(r * 0.28, r * 0.22, 0.06, M.chrome(), 12);
    spout.position.y = -0.17 - r * 0.6;
    g.add(spout);
    const lever = P.box(0.12, 0.016, 0.024, mat, 0.005);
    lever.geometry.translate(0.045, 0, 0);
    lever.position.set(0, -0.11 - r * 0.6 + r * 0.75, 0);
    g.add(lever);
    const jetTop = gy - 0.17 - r * 0.6;
    const jetLen = Math.max(0.05, jetTop - jetBottom);
    const jet = P.cylinder(0.012, 0.016, jetLen, water, 10);
    jet.position.y = -0.17 - r * 0.6 - jetLen;
    g.add(jet);
    root.add(g);
    valves.push({ id, lever, jet, jetLen });
    return g;
  };

  for (let j = 1; j <= 4; j++) {
    const x = xNode(j);
    // te del cabezal con la válvula de bola de entrada al ramal
    const tee = new THREE.Mesh(new THREE.SphereGeometry(r * 1.2, 16, 10), pvc);
    tee.position.set(x, gy, zHead);
    root.add(tee);
    const bv = P.cylinderZ(r * 1.3, r * 2.2, M.paint("#3a3d42", 0.45), 20);
    bv.position.set(x, gy, zHead - s * 0.22);
    root.add(bv);
    const bvLever = P.box(0.012, 0.012, 0.1, M.paint("#c62828", 0.45), 0.003);
    bvLever.position.set(x, gy + r * 1.4, zHead - s * 0.22);
    root.add(bvLever);
    const branch = P.cylinderZ(r, zHead - zNode(4), pvc, 20);
    branch.position.set(x, gy, (zHead + zNode(4)) / 2);
    root.add(branch);
    const cap = P.cylinderZ(r * 1.15, r * 0.6, pvc, 20);
    cap.position.set(x, gy, zNode(4) - r * 0.3);
    root.add(cap);
    for (let i = 1; i <= 4; i++) {
      const z = zNode(i);
      const fit = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10), pvc);
      fit.position.set(x, gy, z);
      root.add(fit);
      dropValve(`c${j}${i}`, x, z, consumerMat);
    }
    // canaleta bajo el ramal: fondo y dos paredes, con pendiente hacia el colector del frente
    const len = zHead - zNode(4) + s * 0.4;
    const ch_ = P.group(`gutter-${j}`);
    const floor = P.box(0.16, 0.012, len, galv, 0.003);
    ch_.add(floor);
    for (const sx of [-1, 1]) {
      const wall = P.box(0.012, 0.06, len, galv, 0.003);
      wall.position.set(sx * 0.08, 0.03, 0);
      ch_.add(wall);
    }
    ch_.position.set(x, gutterTop - 0.06, (zNode(4) - s * 0.2 + zHead - s * 0.2) / 2 - s * 0.05);
    ch_.rotation.x = -0.03;
    root.add(ch_);
  }
  for (const [id, j] of [["l1", 2], ["l2", 4]] as const) {
    const g = dropValve(id, xNode(j) + s * 0.25, zHead, leakMat);
    const stub = P.cylinderX(r * 0.45, s * 0.25, pvc, 12);
    stub.position.set(-s * 0.125, 0, 0);
    g.add(stub);
  }

  // colector al frente y bajante
  const colLen = x1 - x0;
  const collector = P.group("collector");
  const cFloor = P.box(colLen, 0.012, 0.2, galv, 0.003);
  collector.add(cFloor);
  for (const sz of [-1, 1]) {
    const wall = P.box(colLen, 0.08, 0.012, galv, 0.003);
    wall.position.set(0, 0.04, sz * 0.1);
    collector.add(wall);
  }
  collector.position.set((x0 + x1) / 2, gutterTop - 0.12, zHead + s * 0.05);
  root.add(collector);
  const downpipe = P.pipe([v3(x1 - 0.06, gutterTop - 0.12, zHead + s * 0.05), v3(x1 - 0.06, 0.0, zHead + s * 0.05)], 0.035, M.plastic("#8c939a", 0.5));
  root.add(downpipe);

  // anillo de la válvula más crítica
  if (critical) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 28), M.emissive(M.SAFETY_YELLOW, 2.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(xNode(4), gy - 0.11 - r * 0.6, zNode(4));
    root.add(ring);
    const tag = P.nameplate(["VÁLVULA MÁS CRÍTICA"], 0.44, 0.09, M.SAFETY_YELLOW);
    tag.position.set(xNode(4) + s * 0.35, gy + 0.12, zNode(4));
    tag.rotation.y = Math.PI / 2;
    root.add(tag);
  }
  const sign = P.nameplate([`NIVEL ${level}`, `COMUNA ${level}`], 0.34, 0.12);
  sign.position.set(x0 + 0.25, beamY + 0.12, z1 + 0.03);
  root.add(sign);

  const fullScale = 40;
  function update(frame: AnimationFrame): void {
    for (const v of valves) {
      const open = clamp(ch(frame, `open_${v.id}`), 0, 1);
      v.lever.rotation.y = -(1 - open) * (Math.PI / 2);
      const q = Math.max(0, ch(frame, `q_${v.id}`)); // L/min
      const radius = clamp(Math.sqrt(q / 3.3), 0, 3); // ≈ 1 a caudal de diseño de una casa
      v.jet.visible = q > 0.05;
      v.jet.scale.set(Math.max(0.2, radius), 1, Math.max(0.2, radius));
    }
    gNeedle.rotation.z = Math.PI * 0.75 - clamp(ch(frame, "inlet_pressure_mca") / fullScale, 0, 1) * Math.PI * 1.5;
  }
  const demo: Record<string, number> = { inlet_pressure_mca: 27.4, min_pressure_mca: 27.4, flow_in_norm: 1 };
  for (const v of valves) {
    demo[`open_${v.id}`] = 1;
    demo[`q_${v.id}`] = 3.3;
  }
  update({ channels: demo, state: "running" });

  return { root, size: { dx: x1 - x0 + 0.2, dy: z1 - z0 + 0.3, height: gy + 0.3 }, update, dispose: () => disposeObject(root) };
}
