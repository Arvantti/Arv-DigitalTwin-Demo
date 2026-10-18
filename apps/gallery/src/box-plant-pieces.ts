/**
 * Piezas de la escena para la fábrica de cajas de cartón corrugado (corrugated-box-plant-v1).
 *
 * Como las de `process-pieces.ts`: sin comportamiento ni canales, dimensionadas con la huella del plant.yaml
 * (`footprint`: x = largo en x, y = largo en y, z = alto). Origen en el centro de la huella, en el piso; x del plano =
 * x local y y del plano = −z local. Las máquinas de conversión alimentan por +x (el este, donde llegan las pilas) y
 * entregan por −x; la corrugadora avanza hacia +x. Los transportadores corren a lo largo de su lado mayor.
 *
 * Formas tomadas de equipos típicos de una planta de cartón corrugado: portabobinas de brazos, single facer con
 * rodillos corrugadores, puente con festones de cartón, doble mesa de planchas calientes, cortadoras, apilador,
 * transportadores de rodillos motorizados por zonas, mesas giratorias, carro de transferencia sobre riel, impresoras-
 * troqueladoras-plegadoras-pegadoras, troqueladora rotativa, amarradora, paletizador, bobinas,
 * cocina de almidón, ciclón y compactadora de recorte.
 */
import * as THREE from "three";
import { materials as M, parts as P } from "@twin/3d";

type Footprint = [number, number, number];
type PieceBuilder = (footprint: Footprint, params: Record<string, unknown>) => THREE.Object3D;

const machine = () => M.paint("#24617c", 0.4);
const machineLight = () => M.paint("#d7dadd", 0.42);
const frame = () => M.paint("#59626c", 0.55);
const yellow = () => M.paint(M.SAFETY_YELLOW, 0.5);
const dark = () => M.darkSteel();
const steel = () => M.stainless();
const kraft = (shade = 0) => M.paint(["#b8915e", "#a9804f", "#c4a06c"][shade % 3], 0.88);

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Copias de una geometría en posiciones dadas (rodillos, bobinas, fajos): una sola malla para que la escena siga liviana. */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, positions: [number, number, number][], rotation?: THREE.Euler): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, positions.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
  const s = new THREE.Vector3(1, 1, 1);
  positions.forEach((p, i) => inst.setMatrixAt(i, m.compose(new THREE.Vector3(...p), q, s)));
  inst.count = positions.length;
  inst.castShadow = inst.receiveShadow = true;
  return inst;
}

/** Pila de láminas de cartón (w a lo largo de x, d a lo ancho): bandas de tono para que se lean las capas, base de cartón grueso. */
function sheetStack(w: number, d: number, h: number): THREE.Group {
  const g = P.group("stack");
  g.add(at(P.box(w + 0.04, 0.06, d + 0.04, M.paint("#7c5a35", 0.9), 0.005), 0, 0.03, 0));
  const bands = Math.max(3, Math.round(h / 0.2));
  for (let i = 0; i < bands; i++) {
    const bh = (h - 0.06) / bands;
    g.add(at(P.box(w - (i % 2) * 0.012, bh - 0.004, d - (i % 3) * 0.01, kraft(i), 0.003), 0, 0.06 + bh * (i + 0.5), 0));
  }
  return g;
}

/** Arma la pieza a lo largo de x con largo L y ancho W y la gira si en el plano corre a lo largo de y. */
function alongLong(fp: Footprint, build: (L: number, W: number, h: number) => THREE.Group): THREE.Group {
  const [dx, dy, h] = fp;
  const g = build(Math.max(dx, dy), Math.min(dx, dy), h);
  if (dy > dx) g.rotation.y = Math.PI / 2;
  const outer = P.group("oriented");
  outer.add(g);
  return outer;
}

/** Bastidor de transportador de rodillos (largo L, ancho W, plano de rodillos a `top`), con rodillos instanciados. */
function rollerBed(L: number, W: number, top: number, pitch = 0.16): THREE.Group {
  const g = P.group("roller-bed");
  for (const s of [-1, 1]) g.add(at(P.box(L, 0.16, 0.06, frame(), 0.006), 0, top - 0.06, s * (W / 2 - 0.03)));
  const legsN = Math.max(2, Math.ceil(L / 1.6) + 1);
  for (let i = 0; i < legsN; i++) {
    const x = -L / 2 + 0.1 + ((L - 0.2) * i) / (legsN - 1);
    for (const s of [-1, 1]) g.add(at(P.box(0.06, top - 0.12, 0.06, frame(), 0.004), x, (top - 0.12) / 2, s * (W / 2 - 0.05)));
  }
  const n = Math.max(2, Math.floor(L / pitch));
  const rollers: [number, number, number][] = [];
  for (let i = 0; i < n; i++) rollers.push([-L / 2 + pitch / 2 + i * pitch, top - 0.03, 0]);
  const geo = new THREE.CylinderGeometry(0.03, 0.03, W - 0.14, 10);
  g.add(instanced(geo, M.galvanized(), rollers, new THREE.Euler(Math.PI / 2, 0, 0)));
  // motorreductores de zona en un costado
  const zones = Math.max(1, Math.round(L / 2.4));
  for (let i = 0; i < zones; i++) {
    const m = P.motor(0.75, "#24617c");
    m.scale.setScalar(0.8);
    m.position.set(-L / 2 + (L / zones) * (i + 0.5), top - 0.22, W / 2 + 0.12);
    g.add(m);
  }
  return g;
}

/** Ocupación fija e ilustrativa de las zonas (sin simulación): unas sí y otras no, para que se lea la acumulación. */
const zoneFilled = (i: number, seed: number) => (i * 7 + seed * 3) % 5 < 3;

// ------------------------------------------------------------------ bodega de bobinas

const paperRollStack: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("paper_roll_stack");
  const d = Number(params.roll_d_m) || 1.2;
  const r = d / 2 - 0.02;
  const tiers = Math.max(1, Math.round(h / 2.2));
  const rh = h / tiers - 0.02;
  const nx = Math.max(1, Math.floor(dx / (d + 0.08)));
  const nz = Math.max(1, Math.floor(dy / (d + 0.08)));
  const pos: [number, number, number][] = [];
  const cores: [number, number, number][] = [];
  for (let t = 0; t < tiers; t++)
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        if (t === tiers - 1 && (i * 3 + k) % 7 === 0) continue; // huecos arriba: la bodega está en uso
        const x = -dx / 2 + (dx / nx) * (i + 0.5);
        const z = -dy / 2 + (dy / nz) * (k + 0.5);
        pos.push([x, t * (rh + 0.02) + rh / 2, z]);
        cores.push([x, t * (rh + 0.02) + rh / 2, z]);
      }
  const medium = String(params.paper ?? "").includes("medium");
  g.add(instanced(new THREE.CylinderGeometry(r, r, rh, 28), M.paint(medium ? "#c9a878" : "#9c6e40", 0.85), pos));
  g.add(instanced(new THREE.CylinderGeometry(0.075, 0.075, rh + 0.01, 12), M.paint("#5b4630", 0.8), cores));
  return g;
};

// ------------------------------------------------------------------ corrugadora

const millRollStand: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("mill_roll_stand");
  g.add(at(P.box(dx, 0.25, dy, frame(), 0.02), 0, 0.125, 0));
  for (const s of [-1, 1]) {
    // brazos que sujetan la bobina por el eje
    const arm = P.box(0.35, h * 0.75, 0.3, machine(), 0.03);
    arm.position.set(s * dx * 0.22, h * 0.4, -dy / 2 + 0.2);
    arm.rotation.z = s * 0.35;
    g.add(arm);
    const arm2 = arm.clone();
    arm2.position.z = dy / 2 - 0.2;
    g.add(arm2);
  }
  g.add(at(P.box(0.5, h * 0.85, 0.5, machine(), 0.04), 0, h * 0.425, -dy / 2 + 0.25));
  g.add(at(P.box(0.5, h * 0.85, 0.5, machine(), 0.04), 0, h * 0.425, dy / 2 - 0.25));
  // dos bobinas: la que corre y la de empalme
  const r = Math.min(0.6, h * 0.22);
  for (const s of [-1, 1]) {
    const roll = P.cylinderZ(r, dy - 0.7, kraft(s > 0 ? 1 : 0), 32);
    roll.position.set(s * dx * 0.3, h * 0.42, 0);
    g.add(roll);
    g.add(at(P.cylinderZ(0.09, dy - 0.4, M.polishedSteel(), 12), s * dx * 0.3, h * 0.42, 0));
  }
  // empalmador arriba
  g.add(at(P.box(dx * 0.5, 0.35, dy - 0.3, machineLight(), 0.03), 0, h - 0.2, 0));
  g.add(at(P.box(0.06, 0.04, dy - 0.4, yellow(), 0.005), dx * 0.25, h - 0.4, 0));
  return g;
};

const singleFacer: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("single_facer");
  g.add(at(P.box(dx, 0.3, dy, frame(), 0.02), 0, 0.15, 0));
  for (const s of [-1, 1]) g.add(at(P.box(dx * 0.75, h * 0.7, 0.4, machine(), 0.04), 0, 0.3 + h * 0.35, s * (dy / 2 - 0.2)));
  // rodillos corrugadores y de presión entre los bastidores
  for (const [x, y, r] of [[-dx * 0.08, h * 0.45, 0.32], [dx * 0.1, h * 0.55, 0.28], [-dx * 0.05, h * 0.7, 0.25]] as [number, number, number][])
    g.add(at(P.cylinderZ(r, dy - 0.8, M.polishedSteel(), 32), x, y, 0));
  // precalentadores
  for (const s of [-1, 1]) g.add(at(P.cylinderZ(0.38, dy - 0.8, machineLight(), 32), s * dx * 0.36, h * 0.6, 0));
  // guarda y ducto de vapor
  g.add(at(P.box(dx * 0.5, 0.05, dy - 0.5, yellow(), 0.01), 0, h - 0.05, 0));
  g.add(at(P.box(dx * 0.6, 0.4, dy * 0.3, M.glass("#cfe6f5", 0.25), 0.01), 0, h * 0.85, dy * 0.2));
  // cartón de una cara saliendo hacia el puente
  const web = P.box(dx * 0.45, 0.02, dy - 1.0, kraft(1), 0.002);
  web.position.set(dx * 0.3, h * 0.9, 0);
  web.rotation.z = 0.5;
  g.add(web);
  const cab = P.cabinet(0.9, 1.9, 0.45);
  cab.position.set(-dx * 0.35, 0, dy / 2 + 0.35);
  g.add(cab);
  g.add(at(P.nameplate([`SINGLE FACER · ONDA ${String(params.flute ?? "B")}`], 0.9, 0.18), 0, 0.3 + h * 0.62, dy / 2 + 0.01));
  return g;
};

const corrugatorBridge: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("corrugator_bridge");
  const deck = h - 0.7;
  g.add(at(P.box(dx, 0.12, dy, frame(), 0.01), 0, deck, 0));
  const n = Math.ceil(dx / 3);
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) g.add(at(P.box(0.12, deck, 0.12, frame(), 0.006), -dx / 2 + (dx * i) / n, deck / 2, s * (dy / 2 - 0.08)));
  // festones de cartón de una cara acumulados sobre el puente
  const loops = Math.floor(dx / 0.7);
  const loopMat = kraft(2);
  for (let i = 0; i < loops; i++) {
    const loop = P.box(0.03, 0.5, dy - 0.4, loopMat, 0.003);
    loop.position.set(-dx / 2 + 0.35 + i * 0.7, deck + 0.3, 0);
    loop.rotation.z = (i % 2 ? 1 : -1) * 0.45;
    g.add(loop);
  }
  // rampas de subida (desde los single facers) y de bajada (hacia la engomadora)
  for (const s of [-1, 1]) {
    const ramp = P.box(3.2, 0.03, dy - 0.5, kraft(1), 0.003);
    ramp.position.set(s * (dx / 2 - 1.4), deck - 0.9, 0);
    ramp.rotation.z = s * -0.55;
    g.add(ramp);
  }
  g.add(P.handrail([new THREE.Vector2(-dx / 2, dy / 2), new THREE.Vector2(dx / 2, dy / 2)], 1.0).translateY(deck + 0.06));
  g.add(P.handrail([new THREE.Vector2(-dx / 2, -dy / 2), new THREE.Vector2(dx / 2, -dy / 2)], 1.0).translateY(deck + 0.06));
  g.add(at(P.ladder(deck, 0.5, true), -dx / 2 + 0.6, 0, dy / 2 + 0.3));
  return g;
};

const glueMachine: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("glue_machine");
  g.add(at(P.box(dx, 0.3, dy, frame(), 0.02), 0, 0.15, 0));
  // triple precalentador
  for (let i = 0; i < 3; i++) g.add(at(P.cylinderZ(0.42, dy - 0.6, machineLight(), 32), -dx * 0.3, 0.75 + i * 0.6, 0));
  for (const s of [-1, 1]) g.add(at(P.box(dx * 0.35, h - 0.3, 0.3, machine(), 0.03), -dx * 0.3, 0.3 + (h - 0.3) / 2, s * (dy / 2 - 0.15)));
  // engomadora: rodillos y bandeja de adhesivo
  g.add(at(P.box(dx * 0.45, h * 0.6, dy - 0.2, machine(), 0.04), dx * 0.22, 0.3 + h * 0.3, 0));
  g.add(at(P.box(dx * 0.4, 0.15, dy - 0.6, M.paint("#efe7cf", 0.3), 0.01), dx * 0.22, h * 0.72, 0));
  g.add(at(P.cylinderZ(0.15, dy - 0.7, M.polishedSteel(), 24), dx * 0.22, h * 0.82, 0));
  g.add(at(P.hmiPanel(0.6).object, dx * 0.4, 1.1, dy / 2 + 0.1));
  return g;
};

const doubleFacer: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("double_facer");
  const top = h * 0.55;
  g.add(at(P.box(dx, 0.25, dy, frame(), 0.02), 0, 0.125, 0));
  // planchas calientes (primera mitad) y sección de arrastre con banda
  const plates = Math.floor((dx * 0.55) / 1.1);
  for (let i = 0; i < plates; i++) g.add(at(P.box(1.0, top - 0.25, dy - 0.3, M.polishedSteel(), 0.02), -dx / 2 + 0.6 + i * 1.1, 0.25 + (top - 0.25) / 2, 0));
  g.add(at(P.box(dx * 0.42, top - 0.25, dy - 0.3, machine(), 0.03), dx * 0.27, 0.25 + (top - 0.25) / 2, 0));
  // cartón doble pared pasando por la mesa y banda superior
  g.add(at(P.box(dx, 0.035, dy - 0.6, kraft(0), 0.004), 0, top + 0.02, 0));
  g.add(at(P.box(dx - 0.6, 0.04, dy - 0.5, dark(), 0.01), 0, top + 0.12, 0));
  for (let x = -dx / 2 + 0.8; x < dx / 2; x += 2.4) for (const s of [-1, 1]) g.add(at(P.box(0.12, h - top, 0.12, machine(), 0.01), x, top + (h - top) / 2, s * (dy / 2 - 0.1)));
  g.add(at(P.box(dx, 0.1, 0.15, machine(), 0.01), 0, h - 0.05, dy / 2 - 0.1));
  g.add(at(P.box(dx, 0.1, 0.15, machine(), 0.01), 0, h - 0.05, -dy / 2 + 0.1));
  // cabezales de vapor
  for (let i = 0; i < plates; i += 2) g.add(at(P.cylinderZ(0.05, dy + 0.3, M.insulationCladding(), 12), -dx / 2 + 0.6 + i * 1.1, 0.4, 0));
  return g;
};

/** Pórtico con rodillos (cortadora longitudinal o cuchilla transversal); `drums` cuchillas visibles. */
function portal(name: string, drums: number): PieceBuilder {
  return ([dx, dy, h]) => {
    const g = P.group(name);
    g.add(at(P.box(dx, 0.25, dy, frame(), 0.02), 0, 0.125, 0));
    for (const s of [-1, 1]) g.add(at(P.box(dx * 0.8, h - 0.25, 0.45, machine(), 0.04), 0, 0.25 + (h - 0.25) / 2, s * (dy / 2 - 0.22)));
    for (let i = 0; i < drums; i++) g.add(at(P.cylinderZ(0.2, dy - 0.9, M.polishedSteel(), 28), (i - (drums - 1) / 2) * 0.45, h * 0.5 + (i % 2) * 0.4, 0));
    g.add(at(P.box(dx * 0.8, 0.12, dy - 0.4, yellow(), 0.01), 0, h - 0.06, 0));
    g.add(at(P.box(dx, 0.03, dy - 0.9, kraft(0), 0.003), 0, h * 0.5 - 0.22, 0));
    return g;
  };
}

const sheetStacker: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("sheet_stacker");
  const stackH = Math.min(Number(params.stack_h_m) || 1.4, h - 0.5);
  // banda de traslape inclinada que sube las láminas desde la cuchilla
  const ramp = P.box(dx * 0.55, 0.06, dy - 0.6, dark(), 0.01);
  ramp.position.set(-dx * 0.2, 0.6 + stackH * 0.4, 0);
  ramp.rotation.z = 0.14;
  g.add(ramp);
  g.add(at(P.box(dx * 0.5, 0.025, dy - 0.8, kraft(2), 0.003), -dx * 0.2, 0.65 + stackH * 0.4, 0).rotateZ(0.14));
  for (const x of [-dx * 0.42, -dx * 0.05]) for (const s of [-1, 1]) g.add(at(P.box(0.12, 0.6 + stackH * 0.4, 0.12, frame(), 0.01), x, (0.6 + stackH * 0.4) / 2, s * (dy / 2 - 0.2)));
  // bahía de apilado con compuertas y la pila que se forma
  const bayX = dx * 0.3;
  for (const s of [-1, 1]) g.add(at(P.box(dx * 0.35, h, 0.25, machine(), 0.03), bayX, h / 2, s * (dy / 2 - 0.12)));
  g.add(at(P.box(dx * 0.35, 0.2, dy, machine(), 0.03), bayX, h - 0.1, 0));
  g.add(at(rollerBed(dx * 0.33, dy - 0.6, 0.35), bayX, 0, 0));
  g.add(at(sheetStack(1.6, 2.1, stackH * 0.7), bayX, 0.35, 0));
  g.add(at(P.box(0.08, stackH, dy - 0.7, M.glass("#cfe6f5", 0.3), 0.01), bayX + dx * 0.17, 0.35 + stackH / 2, 0));
  g.add(at(P.stackLight(0.3).object, bayX, h, dy / 2 - 0.1));
  return g;
};

// ------------------------------------------------------------------ transporte de pilas

const stackRollerConveyor: PieceBuilder = (fp, params) =>
  alongLong(fp, (L, W) => {
    const g = P.group("stack_roller_conveyor");
    const top = 0.45;
    g.add(rollerBed(L, W, top));
    const zones = Math.max(1, Math.round(L / 2.4));
    const seed = String(params.feeds ?? params.role ?? "").length;
    for (let i = 0; i < zones; i++) {
      if (zones > 1 && !zoneFilled(i, seed)) continue;
      const x = -L / 2 + (L / zones) * (i + 0.5);
      g.add(at(sheetStack(Math.min(1.6, L / zones - 0.4), Math.min(2.1, W - 0.4), 1.2 + ((i + seed) % 3) * 0.1), x, top, 0));
    }
    // fotoceldas de zona y franjas de piso
    for (let i = 0; i <= zones; i++) g.add(at(P.box(0.05, 0.12, 0.05, yellow(), 0.005), -L / 2 + (L / zones) * i, top + 0.08, W / 2 - 0.02));
    return g;
  });

const stackTurntable: PieceBuilder = ([dx, dy]) => {
  const g = P.group("stack_turntable");
  const r = Math.min(dx, dy) / 2 - 0.05;
  g.add(at(P.box(dx, 0.2, dy, frame(), 0.02), 0, 0.1, 0));
  g.add(at(P.cylinder(r, r, 0.12, M.paint("#3a4047", 0.5), 48), 0, 0.26, 0));
  g.add(at(P.ring(r + 0.02, 0.06, 0.05, yellow()), 0, 0.3, 0));
  const bed = rollerBed(Math.min(dx, dy) * 0.75, Math.min(dx, dy) * 0.62, 0.45);
  bed.rotation.y = 0.35;
  g.add(bed);
  const stack = sheetStack(1.5, 1.9, 1.3);
  stack.rotation.y = 0.35;
  g.add(at(stack, 0, 0.45, 0));
  return g;
};

const transferCar: PieceBuilder = (fp, params) =>
  alongLong(fp, (L, W) => {
    const g = P.group("transfer_car");
    // riel doble empotrado y franjas de seguridad a ambos lados del recorrido
    for (const s of [-0.35, 0.35]) g.add(at(P.box(L, 0.06, 0.08, M.polishedSteel(), 0.005), 0, 0.03, s * W));
    for (const s of [-1, 1]) g.add(at(P.box(L, 0.012, 0.12, M.hazard(), 0), 0, 0.006, s * (W / 2 + 0.25)));
    // barandas en los extremos y cadena portacables
    for (const s of [-1, 1]) g.add(at(P.box(0.15, 1.1, W, yellow(), 0.01), s * (L / 2 - 0.1), 0.55, 0));
    g.add(at(P.box(L * 0.5, 0.18, 0.18, dark(), 0.02), -L * 0.25, 0.09, W / 2 + 0.05));
    // el carro con su cama de rodillos y una pila
    const pos = Math.min(0.95, Math.max(0.05, Number(params.car_y ?? 0.5)));
    const car = P.group("car");
    car.add(at(P.box(3.0, 0.35, W + 0.2, M.paint(M.SAFETY_YELLOW, 0.45), 0.04), 0, 0.25, 0));
    for (const sx of [-1, 1]) for (const sz of [-0.35, 0.35]) car.add(at(P.cylinderZ(0.12, 0.1, dark(), 16), sx * 1.1, 0.12, sz * W));
    const bed = rollerBed(2.8, W + 0.1, 0.62);
    bed.rotation.y = Math.PI / 2;
    car.add(bed);
    car.add(at(sheetStack(1.6, 2.0, 1.35), 0, 0.62, 0).rotateY(Math.PI / 2));
    car.add(at(P.cabinet(0.6, 1.4, 0.35, "#cfd3d6"), 1.25, 0.42, W / 2 - 0.1));
    car.add(at(P.stackLight(0.25).object, 1.25, 1.85, W / 2 - 0.1));
    car.position.x = -L / 2 + 1.6 + (L - 3.2) * pos;
    g.add(car);
    return g;
  });

// ------------------------------------------------------------------ conversión

/** Unidad de impresión flexográfica: bastidores, cilindro portaclisé, rodillo anilox y bomba de tinta. */
function printUnit(len: number, W: number, h: number, ink: string): THREE.Group {
  const g = P.group("print-unit");
  for (const s of [-1, 1]) g.add(at(P.box(len - 0.06, h - 0.3, 0.35, machine(), 0.04), 0, 0.3 + (h - 0.3) / 2, s * (W / 2 - 0.18)));
  g.add(at(P.cylinderZ(0.32, W - 0.8, M.polishedSteel(), 32), 0, h * 0.42, 0));
  g.add(at(P.cylinderZ(0.13, W - 0.8, M.paint(ink, 0.3), 24), len * 0.22, h * 0.6, 0));
  g.add(at(P.box(len * 0.8, 0.08, W - 0.6, yellow(), 0.01), 0, h - 0.04, 0));
  g.add(at(P.cylinder(0.18, 0.18, 0.4, M.paint(ink, 0.35), 20), len * 0.3, 0.2, W / 2 + 0.25));
  return g;
}

/** Alimentador de láminas (prealimentador de rodillos con una pila esperando) en el extremo +x de la máquina. */
function feeder(x: number, W: number, h: number, len: number): THREE.Group {
  const g = P.group("feeder");
  g.add(at(rollerBed(len, W - 0.6, 0.45), x, 0, 0));
  g.add(at(sheetStack(1.5, Math.min(2.0, W - 0.9), 1.0), x + len * 0.15, 0.45, 0));
  for (const s of [-1, 1]) g.add(at(P.box(0.25, h * 0.75, 0.25, machine(), 0.03), x - len / 2 + 0.2, (h * 0.75) / 2, s * (W / 2 - 0.25)));
  g.add(at(P.box(0.25, 0.25, W - 0.3, machine(), 0.03), x - len / 2 + 0.2, h * 0.75, 0));
  return g;
}

/** Contador-expulsor: torre al final de la máquina con el fajo listo. */
function counterEjector(x: number, W: number, h: number, len: number): THREE.Group {
  const g = P.group("counter-ejector");
  g.add(at(P.box(len, h * 1.05, W * 0.8, machineLight(), 0.04), x, (h * 1.05) / 2, 0));
  g.add(at(P.box(len * 0.6, 0.6, W * 0.5, M.glass("#cfe6f5", 0.3), 0.01), x, h * 0.4, W * 0.15));
  g.add(at(P.box(0.6, 0.35, 0.45, kraft(2), 0.01), x - len / 2 - 0.4, 0.55, 0));
  g.add(at(P.stackLight(0.3).object, x, h * 1.05, W * 0.3));
  return g;
}

const flexoFolderGluer: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("flexo_folder_gluer");
  g.add(at(P.box(dx, 0.3, dy * 0.85, frame(), 0.02), 0, 0.15, 0));
  // de este a oeste: prealimentador, alimentador, impresoras, ranuradora, troquel, plegadora-pegadora, contador-expulsor
  const feedLen = dx * 0.16;
  let x = dx / 2 - feedLen / 2;
  g.add(feeder(x, dy, h, feedLen));
  x -= feedLen / 2;
  const colors = Math.max(1, Math.min(6, Number(params.colors) || 4));
  const inks = ["#1f4ea8", "#c0392b", "#1b1e22", "#2d8a4e", "#e0a82e", "#7a3a8a"];
  const unit = (dx * 0.36) / (colors + 2);
  g.add(at(P.box(unit, h * 0.9, dy - 0.4, machine(), 0.04), x - unit / 2, (h * 0.9) / 2, 0)); // alimentador de vacío
  x -= unit;
  for (let i = 0; i < colors; i++) {
    g.add(at(printUnit(unit, dy, h, inks[i]), x - unit / 2, 0, 0));
    x -= unit;
  }
  g.add(at(P.box(unit, h * 0.85, dy - 0.4, machineLight(), 0.04), x - unit / 2, (h * 0.85) / 2, 0)); // ranuradora
  x -= unit;
  // plegadora-pegadora: mesa larga y baja con correas
  const foldLen = dx * 0.32;
  g.add(at(P.box(foldLen, 0.9, dy * 0.6, machine(), 0.03), x - foldLen / 2, 0.75, 0));
  for (const s of [-1, 1]) g.add(at(P.box(foldLen, 0.08, 0.25, dark(), 0.01), x - foldLen / 2, 1.24, s * dy * 0.22));
  g.add(at(P.box(foldLen * 0.9, 0.04, dy * 0.38, kraft(0), 0.004), x - foldLen / 2, 1.22, 0));
  x -= foldLen;
  g.add(counterEjector(x - (x + dx / 2) / 2, dy, h, x + dx / 2));
  // pasarela del operador y HMI
  g.add(at(P.box(dx * 0.6, 0.05, 0.8, M.galvanized(), 0.005), dx * 0.05, 0.4, dy / 2 - 0.1));
  g.add(at(P.hmiPanel(0.7).object, dx * 0.3, 1.0, dy / 2 + 0.2));
  return g;
};

const rotaryDieCutter: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("rotary_die_cutter");
  g.add(at(P.box(dx, 0.3, dy * 0.85, frame(), 0.02), 0, 0.15, 0));
  const feedLen = dx * 0.22;
  let x = dx / 2 - feedLen / 2;
  g.add(feeder(x, dy, h, feedLen));
  x -= feedLen / 2;
  const colors = Math.max(1, Math.min(4, Number(params.colors) || 2));
  const unit = dx * 0.12;
  for (let i = 0; i < colors; i++) {
    g.add(at(printUnit(unit, dy, h, ["#1f4ea8", "#1b1e22", "#c0392b", "#2d8a4e"][i]), x - unit / 2, 0, 0));
    x -= unit;
  }
  // troquel rotativo: cilindro grande con la madera del troquel y yunque de poliuretano
  const dieLen = dx * 0.2;
  for (const s of [-1, 1]) g.add(at(P.box(dieLen, h, 0.45, machine(), 0.05), x - dieLen / 2, h / 2, s * (dy / 2 - 0.22)));
  g.add(at(P.cylinderZ(0.55, dy - 0.9, M.paint("#9c7a4c", 0.7), 40), x - dieLen / 2, h * 0.5, 0));
  g.add(at(P.cylinderZ(0.45, dy - 0.9, M.paint("#d9a21f", 0.5), 40), x - dieLen / 2, h * 0.5 - 1.0, 0));
  x -= dieLen;
  // apilador de salida (troqueladas) y banda de desperdicio
  const outLen = x + dx / 2;
  g.add(at(rollerBed(outLen, dy - 0.8, 0.45), x - outLen / 2, 0, 0));
  g.add(at(sheetStack(1.2, 1.6, 1.1), x - outLen / 2, 0.45, 0));
  g.add(at(P.box(outLen * 0.8, 0.4, 0.6, dark(), 0.02), x - outLen / 2, 0.2, -dy / 2 + 0.3));
  g.add(at(P.hmiPanel(0.7).object, dx * 0.15, 1.0, dy / 2 + 0.2));
  return g;
};

const bundleStrapper: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("bundle_strapper");
  g.add(at(rollerBed(dx, Math.min(1.4, dy - 0.4), 0.75), 0, 0, 0));
  g.add(at(P.box(0.9, 0.5, 1.0, kraft(0), 0.01), 0, 0.75 + 0.25, 0));
  // arco de flejado y cabezal
  for (const s of [-1, 1]) g.add(at(P.box(0.25, h, 0.25, machineLight(), 0.03), 0, h / 2, s * (dy / 2 - 0.15)));
  g.add(at(P.box(0.3, 0.3, dy, machineLight(), 0.03), 0, h - 0.15, 0));
  g.add(at(P.box(0.6, 0.6, 0.5, machine(), 0.04), 0.3, 0.3, -dy / 2 + 0.3));
  g.add(at(P.cylinderZ(0.3, 0.12, dark(), 24), 0.3, 0.9, -dy / 2 + 0.3));
  return g;
};

const bundleConveyor: PieceBuilder = (fp) =>
  alongLong(fp, (L, W, h) => {
    const g = P.group("bundle_conveyor");
    const top = Math.max(0.5, h);
    g.add(at(P.box(L, 0.12, W, frame(), 0.01), 0, top - 0.06, 0));
    g.add(at(P.box(L, 0.02, W - 0.15, M.rubber(), 0.005), 0, top + 0.01, 0));
    const legsN = Math.max(2, Math.ceil(L / 3) + 1);
    const legs: [number, number, number][] = [];
    for (let i = 0; i < legsN; i++) for (const s of [-1, 1]) legs.push([-L / 2 + 0.1 + ((L - 0.2) * i) / (legsN - 1), (top - 0.12) / 2, s * (W / 2 - 0.06)]);
    g.add(instanced(new THREE.BoxGeometry(0.06, top - 0.12, 0.06), frame(), legs));
    const bundles: [number, number, number][] = [];
    for (let x = -L / 2 + 1.5, i = 0; x < L / 2 - 0.6; x += 2.2, i++) if (zoneFilled(i, 1)) bundles.push([x, top + 0.24, 0]);
    g.add(instanced(new THREE.BoxGeometry(0.95, 0.45, Math.min(1.0, W - 0.2)), kraft(2), bundles));
    // flejes de cada fajo
    const straps: [number, number, number][] = [];
    for (const [bx, by, bz] of bundles) for (const o of [-0.25, 0.25]) straps.push([bx + o, by, bz]);
    g.add(instanced(new THREE.BoxGeometry(0.02, 0.46, Math.min(1.0, W - 0.2) + 0.01), M.paint("#1d2228", 0.6), straps));
    return g;
  });

const palletizer: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("palletizer");
  // celda cercada: mesa de formación de capa, elevador y la estiba que crece
  g.add(P.safetyFence(dx, dy, Math.min(2.2, h), dy * 0.35));
  g.add(at(rollerBed(dx * 0.45, dy * 0.45, 0.9), dx * 0.22, 0, 0));
  g.add(at(P.box(0.95, 0.45, 0.9, kraft(0), 0.01), dx * 0.3, 1.15, 0));
  g.add(at(P.box(0.95, 0.45, 0.9, kraft(1), 0.01), dx * 0.15, 1.15, 0));
  for (const s of [-1, 1]) g.add(at(P.box(0.25, h, 0.25, yellow(), 0.03), -dx * 0.2, h / 2, s * (dy / 2 - 0.4)));
  g.add(at(P.box(0.3, 0.3, dy - 0.6, yellow(), 0.03), -dx * 0.2, h - 0.15, 0));
  const pallet = P.palletLoad(4, "#b8915e");
  pallet.position.set(-dx * 0.2, 0, 0);
  g.add(pallet);
  g.add(at(P.box(1.3, 0.05, 1.0, machine(), 0.01), -dx * 0.2, 1.4, 0));
  const cab = P.cabinet(0.8, 1.8, 0.4);
  cab.position.set(dx / 2 - 0.6, 0, dy / 2 + 0.3);
  g.add(cab);
  return g;
};

// ------------------------------------------------------------------ servicios y recorte

const starchKitchen: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("starch_kitchen");
  const r = Math.min(dx / 6, dy / 3, 1.1);
  for (let i = 0; i < 3; i++) {
    const t = P.cylinder(r, r, h * 0.65, i === 1 ? steel() : M.paint("#e9ecef", 0.4), 32);
    t.position.set(-dx / 3 + (dx / 3) * i, 0.4, -dy * 0.15);
    g.add(t);
    g.add(at(P.dishedHead(r, steel(), false, 0.2), -dx / 3 + (dx / 3) * i, 0.4 + h * 0.65, -dy * 0.15));
    g.add(at(P.legs(4, r * 0.8, 0.45, 0.04, steel()), -dx / 3 + (dx / 3) * i, 0, -dy * 0.15));
    const m = P.motor(3, "#2f5d8a");
    m.rotation.z = Math.PI / 2;
    m.position.set(-dx / 3 + (dx / 3) * i, 0.4 + h * 0.65 + r * 0.25 + 0.3, -dy * 0.15);
    g.add(m);
  }
  // silo de almidón en polvo y plataforma de dosificación
  g.add(at(P.box(dx * 0.9, 0.08, 1.2, M.galvanized(), 0.005), 0, h * 0.75, dy / 2 - 0.8));
  g.add(at(P.box(1.4, 1.1, 1.0, M.paint("#efe7cf", 0.6), 0.02), dx * 0.3, h * 0.75 + 0.55, dy / 2 - 0.8));
  g.add(at(P.cabinet(1.2, 1.9, 0.45), -dx / 2 + 0.8, 0, dy / 2 - 0.3));
  return g;
};

const trimCyclone: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("trim_cyclone");
  const r = Math.min(dx, dy) / 2 - 0.3;
  g.add(at(P.cylinder(r, r, h * 0.3, M.galvanized(), 32), 0, h * 0.62, 0));
  g.add(at(P.frustum(r, 0.35, h * 0.32, M.galvanized()), 0, h * 0.3, 0));
  g.add(at(P.cylinder(0.25, 0.25, 0.6, M.galvanized(), 16), 0, h * 0.92, 0));
  g.add(P.legs(4, r * 0.9, h * 0.62, 0.08, frame()));
  // ducto de entrada (el recorte llega soplado desde la planta) y bajante a la compactadora
  g.add(at(P.cylinderX(0.3, 3, M.galvanized(), 16), -r - 1.2, h * 0.8, 0));
  g.add(at(P.cylinder(0.3, 0.3, h * 0.3, M.galvanized(), 16), 0, 0, 0));
  return g;
};

const trimBaler: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("trim_baler");
  g.add(at(P.box(dx * 0.7, h * 0.55, dy * 0.6, M.paint("#2f5d8a", 0.4), 0.04), dx * 0.05, (h * 0.55) / 2, 0));
  g.add(at(P.box(dx * 0.25, h, dy * 0.6, M.paint("#2f5d8a", 0.4), 0.04), -dx * 0.12, h / 2, 0)); // tolva
  g.add(at(P.cylinderX(0.25, dx * 0.35, M.chrome(), 20), dx * 0.3, h * 0.35, 0)); // cilindro de la prensa
  // pacas listas
  for (let i = 0; i < 3; i++) g.add(at(P.box(1.1, 0.8, 0.8, kraft(i), 0.02), -dx / 2 + 0.6, 0.4 + i * 0.82, dy / 2 - 0.45));
  g.add(at(P.cabinet(0.8, 1.6, 0.4), dx * 0.4, 0, dy / 2 - 0.25));
  return g;
};

export const boxPlantBuilders: Record<string, PieceBuilder> = {
  paper_roll_stack: paperRollStack,
  mill_roll_stand: millRollStand,
  single_facer: singleFacer,
  corrugator_bridge: corrugatorBridge,
  glue_machine: glueMachine,
  double_facer: doubleFacer,
  slitter_scorer: portal("slitter_scorer", 4),
  cutoff_knife: portal("cutoff_knife", 2),
  sheet_stacker: sheetStacker,
  stack_roller_conveyor: stackRollerConveyor,
  stack_turntable: stackTurntable,
  transfer_car: transferCar,
  flexo_folder_gluer: flexoFolderGluer,
  rotary_die_cutter: rotaryDieCutter,
  bundle_strapper: bundleStrapper,
  bundle_conveyor: bundleConveyor,
  palletizer,
  starch_kitchen: starchKitchen,
  trim_cyclone: trimCyclone,
  trim_baler: trimBaler,
};
