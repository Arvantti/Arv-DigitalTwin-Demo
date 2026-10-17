/**
 * Geometría de un nivel de la rejilla: un bastidor galvanizado sostiene el cabezal de 2" a lo largo de X al frente
 * (+Z) y cuatro ramales hacia el fondo (−Z), cada uno con su válvula de bola a la entrada y cuatro válvulas de
 * consumo (azules) que miran hacia abajo; dos válvulas de fuga (rojas) cuelgan al final de los ramales 2 y 4, igual
 * que las casas, y descargan a su canaleta.
 * Debajo, una canaleta por ramal desagua a un colector al frente que baja por una bajante. La entrada es un
 * montante que sube del piso al nodo 1 del cabezal, con manómetro. Cada válvula muestra un chorro proporcional a
 * su caudal y gira su manija con la apertura; la más crítica de la red (c44 del nivel 4) lleva un anillo amarillo.
 *
 * Separación entre nodos spacing_m (0,5 m): huella de 2,0 × 2,5 m; tubería a 0,9 m del piso.
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
  textures,
} from "@twin/3d";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface ValveHandle {
  id: string;
  lever: THREE.Object3D;
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
  const zNode = (i: number) => zHead - i * s; // i = 1..5; el 5 es la fuga al final de un ramal
  const leakBranch = (j: number) => j === 2 || j === 4; // ramales con fuga al final
  const zEnd = (j: number) => (leakBranch(j) ? zNode(5) : zNode(4));
  const pvc = M.paint("#8f989f", 0.6); // PVC gris
  const galv = M.galvanized();
  const root = P.group("distribution-grid");

  // bastidor: patas, vigas perimetrales y travesaños bajo los ramales
  const x0 = xIn - s * 0.3;
  const x1 = xNode(4) + s * 0.3;
  const z0 = zNode(5) - s * 0.3;
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
  // canaletas casi a ras de la salida de las válvulas para que el agua no salpique: 5 cm bajo la boquilla
  const spoutBottom = gy - 0.21 - r * 0.6;
  const gutterTop = spoutBottom - 0.05;
  const jetBottom = gutterTop - 0.05;

  /**
   * Válvula de bola de PVC de unión doble, a lo largo de Y y centrada en el origen: colas a cada lado, tuercas de
   * unión facetadas, cuerpo abombado con el vástago hacia +Z y la manija plana. La manija va en `lever`, que gira
   * sobre Z: 0 = abierta (paralela al tubo), π/2 = cerrada.
   */
  const ballValve = (a: number, len: number, bodyMat: THREE.Material, handleMat: THREE.Material) => {
    const g = P.group("ball-valve");
    for (const sy of [-1, 1]) {
      const tail = P.cylinder(a * 1.22, a * 1.22, len * 0.16, bodyMat, 20);
      tail.position.y = sy * len * 0.42 - len * 0.08;
      g.add(tail);
      const nut = P.cylinder(a * 1.8, a * 1.8, len * 0.17, bodyMat, 10); // tuerca de unión: caras de agarre
      nut.position.y = sy * len * 0.27 - len * 0.085;
      g.add(nut);
    }
    const prof: THREE.Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const y = (t - 0.5) * len * 0.38;
      prof.push(new THREE.Vector2(a * (1.45 + 0.22 * Math.sin(Math.PI * t)), y));
    }
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), bodyMat);
    body.castShadow = true;
    g.add(body);
    const boss = P.cylinderZ(a * 0.55, a * 1.0, bodyMat, 16);
    boss.position.z = a * 1.6;
    g.add(boss);
    const lever = P.group("lever");
    lever.position.z = a * 2.15;
    const hub = P.cylinderZ(a * 0.62, a * 0.35, handleMat, 16);
    lever.add(hub);
    const armLen = len * 0.75;
    const arm = P.box(a * 1.0, armLen, a * 0.3, handleMat, a * 0.1);
    arm.position.y = armLen / 2;
    lever.add(arm);
    const grip = P.box(a * 1.05, armLen * 0.35, a * 0.4, handleMat, a * 0.15);
    grip.position.y = armLen * 0.82;
    lever.add(grip);
    g.add(lever);
    return { group: g, lever };
  };
  const valveBody = M.paint("#596067", 0.5); // PVC gris oscuro de válvula

  /** Placa de 13 × 6,5 cm con el número de la válvula en letra grande. */
  const numberPlate = (text: string, bg: string) => {
    const tex = textures.textTexture([text], { width: 256, height: 128, bg, fg: "#ffffff", font: "800 96px Inter, Arial, sans-serif" });
    const mat = new THREE.MeshStandardMaterial({ color: tex ? "#ffffff" : bg, map: tex ?? undefined, roughness: 0.4, metalness: 0.1 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.065), mat);
    m.name = "valve-number";
    return m;
  };

  /** Válvula de descarga hacia abajo bajo un nodo, con su placa de número; la manija gira con la apertura. */
  const dropValve = (id: string, x: number, z: number, mat: THREE.Material, plateBg: string) => {
    const g = P.group(id);
    g.position.set(x, gy, z);
    const o = r * 0.6;
    const a = r * 0.42; // tubo de ¾" que baja del ramal
    const vTop = -0.06 - o;
    const vLen = 0.12;
    const nipple = P.cylinder(a, a, -r - vTop, pvc, 12);
    nipple.position.y = vTop;
    g.add(nipple);
    const valve = ballValve(a, vLen, valveBody, mat);
    valve.group.position.y = vTop - vLen / 2;
    g.add(valve.group);
    const lever = valve.lever;
    const spout = P.cylinder(a * 0.85, a * 0.7, 0.03, M.chrome(), 12); // boquilla de salida
    spout.position.y = vTop - vLen - 0.03;
    g.add(spout);
    const jetTop = gy + vTop - vLen - 0.03;
    const jetLen = Math.max(0.05, jetTop - jetBottom);
    const jet = P.cylinder(0.012, 0.016, jetLen, water, 10);
    jet.position.y = jetTop - gy - jetLen;
    g.add(jet);
    // placa con el número de la válvula sobre el tubo, inclinada hacia quien mira desde el frente
    const post = P.cylinder(0.004, 0.004, 0.05, galv, 6);
    post.position.y = r + 0.025;
    g.add(post);
    const plate = numberPlate(id.toUpperCase(), plateBg);
    plate.position.set(0, r + 0.05 + 0.03, 0.01);
    plate.rotation.x = -0.55;
    g.add(plate);
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
    const bv = ballValve(r, r * 6.5, valveBody, M.paint("#c62828", 0.45));
    bv.group.rotation.x = -Math.PI / 2; // a lo largo del ramal, manija arriba
    bv.group.position.set(x, gy, zHead - s * 0.22);
    root.add(bv.group);
    const branch = P.cylinderZ(r, zHead - zEnd(j), pvc, 20);
    branch.position.set(x, gy, (zHead + zEnd(j)) / 2);
    root.add(branch);
    if (!leakBranch(j)) {
      const cap = P.cylinderZ(r * 1.15, r * 0.6, pvc, 20);
      cap.position.set(x, gy, zNode(4) - r * 0.3);
      root.add(cap);
    }
    for (let i = 1; i <= 4; i++) {
      const z = zNode(i);
      const fit = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10), pvc);
      fit.position.set(x, gy, z);
      root.add(fit);
      dropValve(`c${j}${i}`, x, z, consumerMat, blue);
    }
    // canaleta bajo el ramal: fondo y dos paredes, con pendiente hacia el colector del frente
    const len = zHead - zEnd(j) + s * 0.4;
    const ch_ = P.group(`gutter-${j}`);
    const floor = P.box(0.16, 0.012, len, galv, 0.003);
    ch_.add(floor);
    for (const sx of [-1, 1]) {
      const wall = P.box(0.012, 0.06, len, galv, 0.003);
      wall.position.set(sx * 0.08, 0.03, 0);
      ch_.add(wall);
    }
    ch_.position.set(x, gutterTop - 0.06, (zEnd(j) - s * 0.2 + zHead - s * 0.2) / 2 - s * 0.05);
    ch_.rotation.x = -0.015;
    root.add(ch_);
    // colgadores de la canaleta desde los travesaños del bastidor
    for (const zc of [zNode(1) - s / 2, zNode(3) - s / 2]) {
      for (const sx of [-1, 1]) {
        const hanger = P.box(0.012, beamY - gutterTop, 0.025, galv, 0.002);
        hanger.position.set(x + sx * 0.08, (beamY + gutterTop) / 2, zc);
        root.add(hanger);
      }
    }
  }
  for (const [id, j] of [["l1", 2], ["l2", 4]] as const) {
    const fit = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10), pvc);
    fit.position.set(xNode(j), gy, zNode(5));
    root.add(fit);
    dropValve(id, xNode(j), zNode(5), leakMat, red);
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
  for (const x of [x0 + 0.05, x1 - 0.05]) {
    const hanger = P.box(0.012, beamY - (gutterTop - 0.04), 0.025, galv, 0.002);
    hanger.position.set(x, (beamY + gutterTop - 0.04) / 2, zHead + s * 0.05 + 0.1);
    root.add(hanger);
  }
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
      v.lever.rotation.z = (1 - open) * (Math.PI / 2);
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
