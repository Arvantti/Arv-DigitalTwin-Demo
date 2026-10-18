/**
 * Piezas industriales reutilizables. Cada función devuelve un Object3D con su origen en un
 * punto natural (base o eje) para componerlas fácilmente desde los geometry.ts de la librería.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as M from "./materials.ts";
import { hmiScreen, textTexture } from "./textures.ts";

// ------------------------------------------------------------------ utilidades básicas

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export function group(name?: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (name) g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Caja con bordes redondeados (los cantos vivos delatan un modelo "de juguete"). Origen en el centro. */
export function box(w: number, h: number, d: number, material: THREE.Material, radius = 0.015, name?: string): THREE.Mesh {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  const geo = r > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  return mesh(geo, material, name);
}

/** Caja apoyada: origen en el centro de la cara inferior. */
export function slab(w: number, h: number, d: number, material: THREE.Material, radius = 0.015, name?: string): THREE.Mesh {
  const m = box(w, h, d, material, radius, name);
  m.geometry.translate(0, h / 2, 0);
  return m;
}

/** Cilindro vertical apoyado (origen en el centro de la base). */
export function cylinder(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 40, name?: string, open = false): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open);
  geo.translate(0, h / 2, 0);
  return mesh(geo, material, name);
}

/** Cilindro a lo largo de +X, centrado en el origen. */
export function cylinderX(r: number, length: number, material: THREE.Material, segments = 32, name?: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, length, segments);
  geo.rotateZ(Math.PI / 2);
  return mesh(geo, material, name);
}

/** Cilindro a lo largo de +Z, centrado en el origen. */
export function cylinderZ(r: number, length: number, material: THREE.Material, segments = 32, name?: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, length, segments);
  geo.rotateX(Math.PI / 2);
  return mesh(geo, material, name);
}

/** Fondo/tapa toriesférica aproximada (elipse 2:1). Origen en el plano de unión, abombada hacia +Y (o -Y si down). */
export function dishedHead(radius: number, material: THREE.Material, down = false, depthRatio = 0.25, name?: string): THREE.Mesh {
  const depth = radius * 2 * depthRatio;
  const pts: THREE.Vector2[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * depth * (down ? -1 : 1)));
  }
  if (down) pts.reverse();
  const geo = new THREE.LatheGeometry(pts, 48);
  return mesh(geo, material, name);
}

/** Tronco de cono vertical apoyado: rBottom abajo, rTop arriba. */
export function frustum(rBottom: number, rTop: number, h: number, material: THREE.Material, name?: string): THREE.Mesh {
  return cylinder(rTop, rBottom, h, material, 48, name);
}

/** Anillo/brida en un plano perpendicular a Y. */
export function ring(rOuter: number, thickness: number, height: number, material: THREE.Material, name?: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rOuter - thickness, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, material, name);
}

/** Tubería por una polilínea con codos redondeados. */
export function pipe(points: THREE.Vector3[], radius: number, material: THREE.Material, bendRadius = radius * 3, name?: string): THREE.Mesh {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let current = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (!next) {
      path.add(new THREE.LineCurve3(current, p.clone()));
      break;
    }
    const inDir = p.clone().sub(current).normalize();
    const outDir = next.clone().sub(p).normalize();
    const r = Math.min(bendRadius, p.distanceTo(current) / 2, next.distanceTo(p) / 2);
    const a = p.clone().addScaledVector(inDir, -r);
    const b = p.clone().addScaledVector(outDir, r);
    path.add(new THREE.LineCurve3(current, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    current = b;
  }
  const segments = Math.max(16, points.length * 24);
  const geo = new THREE.TubeGeometry(path, segments, radius, 16, false);
  return mesh(geo, material, name);
}

/** Pernos distribuidos en círculo (detalle de bridas). */
export function boltCircle(radius: number, count: number, boltR: number, height: number, material: THREE.Material = M.darkSteel()): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(boltR, boltR, height, 6);
  geo.translate(0, height / 2, 0);
  const inst = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  return inst;
}

// ------------------------------------------------------------------ piezas electromecánicas

/** Motor eléctrico TEFC con aletas, ventilador y caja de bornes. Eje a lo largo de +X; origen en el centro del eje. */
export function motor(powerKw: number, color = "#2f4f6f"): THREE.Group {
  const r = 0.09 + 0.035 * Math.sqrt(powerKw);
  const len = r * 3.2;
  const g = group("motor");
  const body = cylinderX(r, len, M.paint(color, 0.35), 40);
  g.add(body);
  // aletas de enfriamiento
  const finGeo = new THREE.BoxGeometry(len * 0.82, 0.012, r * 0.18);
  const fins = new THREE.InstancedMesh(finGeo, M.paint(color, 0.35), 16);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    mtx.makeRotationX(a).setPosition(0, Math.cos(a) * r, Math.sin(a) * r);
    mtx.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
    fins.setMatrixAt(i, mtx);
  }
  fins.castShadow = true;
  g.add(fins);
  const fan = cylinderX(r * 1.05, len * 0.22, M.paint("#3a3d42", 0.5), 40);
  fan.position.x = -len * 0.6;
  g.add(fan);
  const shaft = cylinderX(r * 0.18, len * 0.3, M.polishedSteel(), 16);
  shaft.position.x = len * 0.62;
  g.add(shaft);
  const tbox = box(r * 0.9, r * 0.5, r * 0.8, M.paint(color, 0.35), 0.01);
  tbox.position.set(0, r + r * 0.25, 0);
  g.add(tbox);
  for (const s of [-1, 1]) {
    const foot = box(len * 0.25, r * 0.25, r * 1.6, M.paint(color, 0.35), 0.005);
    foot.position.set(s * len * 0.3, -r - r * 0.05, 0);
    g.add(foot);
  }
  g.userData.length = len * 1.3;
  g.userData.radius = r;
  return g;
}

/** Reductor de engranajes (caja). Origen en el centro. */
export function gearbox(size: number, color = "#2f4f6f"): THREE.Group {
  const g = group("gearbox");
  g.add(box(size, size * 0.9, size * 0.8, M.paint(color, 0.4), size * 0.08));
  const out = cylinder(size * 0.18, size * 0.18, size * 0.3, M.polishedSteel(), 24);
  out.position.y = -size * 0.75;
  g.add(out);
  return g;
}

/** Gabinete eléctrico con puerta, bisagras, manija y rejilla. Origen en el centro de la base; frente a +Z. */
export function cabinet(w: number, h: number, d: number, color = "#cfd3d6"): THREE.Group {
  const g = group("control_cabinet");
  g.add(slab(w, h, d, M.paint(color, 0.45), 0.02));
  const seam = M.paint("#7d8287", 0.6);
  const doors = Math.max(1, Math.round(w / 0.8));
  for (let i = 1; i < doors; i++) {
    const s = box(0.006, h * 0.94, 0.004, seam, 0);
    s.position.set(-w / 2 + (w / doors) * i, h / 2, d / 2 + 0.001);
    g.add(s);
  }
  for (let i = 0; i < doors; i++) {
    const cx = -w / 2 + (w / doors) * (i + 0.5);
    const handle = box(0.03, 0.14, 0.03, M.darkSteel(), 0.008);
    handle.position.set(cx + (w / doors) * 0.36, h * 0.55, d / 2 + 0.02);
    g.add(handle);
    for (let k = 0; k < 6; k++) {
      const v = box(0.18, 0.012, 0.006, M.paint("#9aa0a6", 0.6), 0.002);
      v.position.set(cx, h * 0.12 + k * 0.025, d / 2 + 0.003);
      g.add(v);
    }
  }
  const plate = nameplate(["CONTROL", "400 V · 60 Hz"], 0.2, 0.08);
  plate.position.set(-w / 2 + 0.16, h * 0.85, d / 2 + 0.004);
  g.add(plate);
  return g;
}

export interface OperatorHandle {
  object: THREE.Group;
  /** 0 de pie, 1 inclinado sobre el trabajo con los brazos adelante (animación de trabajo). */
  setPose(work: number): void;
  /** Paso de caminata: fase en radianes (un paso completo = 2π); piernas y brazos se balancean. */
  setWalk(phase: number): void;
}

/**
 * Operario de pie (≈ 1,75 m) con proporciones humanas: cuello, cabello, orejas, nariz, gafas de seguridad, casco, camiseta con
 * chaleco reflectivo, guantes, pantalón con rodillas articuladas y botas de seguridad con suela.
 * Origen en el suelo entre los pies; mira a +Z. `look` varía tono de piel y cabello entre personas.
 */
export interface OperatorLook {
  skin?: string;
  hair?: string;
  pants?: string;
  helmet?: string;
  /** Persona sin dotación (pasajero, agente de mostrador): sin casco, chaleco ni gafas. */
  civilian?: boolean;
}

function capsule(r: number, length: number, material: THREE.Material, sx = 1, sz = 1): THREE.Mesh {
  const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, length), 6, 14), material);
  m.scale.set(sx, 1, sz);
  return m;
}

export function operator(vest = "#f26b1d", shirt = "#2f5f8f", look: OperatorLook = {}): OperatorHandle {
  const g = group("operator");
  const skin = M.paint(look.skin ?? "#c99a76", 0.62);
  const hairMat = M.paint(look.hair ?? "#2a1d16", 0.85);
  const pants = M.paint(look.pants ?? "#2b3442", 0.85);
  const boots = M.paint("#2a211b", 0.6);
  const sole = M.paint("#111111", 0.9);
  const vestMat = M.paint(vest, 0.7);
  const shirtMat = M.paint(shirt, 0.85);
  const helmet = M.paint(look.helmet ?? "#f4f4f2", 0.35);
  const glove = M.paint("#d9d2c3", 0.8);
  const reflect = M.paint("#e3e7ea", 0.25);

  // piernas: cadera → muslo → rodilla → pantorrilla → bota
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const sx of [-1, 1]) {
    const hip = group("leg");
    hip.position.set(sx * 0.095, 0.93, 0);
    const thigh = capsule(0.077, 0.28, pants, 1, 1.05);
    thigh.position.y = -0.22;
    hip.add(thigh);
    const knee = group("knee");
    knee.position.y = -0.44;
    const shin = capsule(0.058, 0.27, pants);
    shin.position.y = -0.2;
    knee.add(shin);
    const kneeCap = mesh(new THREE.SphereGeometry(0.066, 12, 10), pants);
    knee.add(kneeCap);
    const boot = box(0.105, 0.09, 0.27, boots, 0.035);
    boot.position.set(0, -0.435, 0.05);
    knee.add(boot);
    const bootSole = box(0.11, 0.025, 0.285, sole, 0.01);
    bootSole.position.set(0, -0.485, 0.05);
    knee.add(bootSole);
    const shaft = capsule(0.062, 0.05, boots);
    shaft.position.y = -0.4;
    knee.add(shaft);
    hip.add(knee);
    g.add(hip);
    legs.push({ hip, knee });
  }
  const pelvis = box(0.34, 0.2, 0.2, pants, 0.08);
  pelvis.position.y = 0.97;
  g.add(pelvis);

  const torso = group("torso");
  torso.position.y = 1.0;
  const chest = box(0.37, 0.5, 0.2, shirtMat, 0.08);
  chest.position.y = 0.26;
  torso.add(chest);
  // chaleco reflectivo con franjas
  if (!look.civilian) {
    const vestBody = box(0.385, 0.42, 0.215, vestMat, 0.07);
    vestBody.position.y = 0.23;
    torso.add(vestBody);
    for (const y of [0.1, 0.27]) {
      const band = box(0.392, 0.035, 0.222, reflect, 0.012);
      band.position.y = y;
      torso.add(band);
    }
  }
  const neck = cylinder(0.045, 0.05, 0.1, skin, 14);
  neck.position.y = 0.52;
  torso.add(neck);
  for (const sx of [-1, 1]) {
    const shoulder = mesh(new THREE.SphereGeometry(0.06, 14, 10), shirtMat);
    shoulder.position.set(sx * 0.205, 0.45, 0);
    torso.add(shoulder);
  }

  // cabeza: cráneo ovalado, cabello, orejas, nariz, ojos, gafas y casco
  const head = group("head");
  head.position.y = 0.67;
  const skull = mesh(new THREE.SphereGeometry(0.1, 24, 18), skin);
  skull.scale.set(0.9, 1.12, 1);
  head.add(skull);
  const hair = mesh(new THREE.SphereGeometry(0.104, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hair.scale.set(0.92, 1.12, 1.02);
  hair.position.set(0, 0.004, -0.008);
  head.add(hair);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.091, -0.005, 0);
    head.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.01, 8, 6), M.paint("#15110f", 0.3));
    eye.position.set(sx * 0.034, 0.014, 0.093);
    head.add(eye);
    if (!look.civilian) {
      const lens = box(0.058, 0.032, 0.006, M.glass("#bfe3ff", 0.35), 0.003);
      lens.position.set(sx * 0.034, 0.014, 0.1);
      head.add(lens);
    }
  }
  if (!look.civilian) {
    const bridge = box(0.02, 0.006, 0.006, M.paint("#222a30", 0.5), 0.002);
    bridge.position.set(0, 0.018, 0.101);
    head.add(bridge);
  }
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.034, 8), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.012, 0.108);
  head.add(nose);
  const mouth = box(0.04, 0.006, 0.006, M.paint("#8a4b4b", 0.6), 0.002);
  mouth.position.set(0, -0.052, 0.092);
  head.add(mouth);
  if (!look.civilian) {
    const hat = mesh(new THREE.SphereGeometry(0.112, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), helmet);
    hat.scale.set(0.96, 1.05, 1.08);
    hat.position.set(0, 0.03, -0.004);
    head.add(hat);
    const ridge = box(0.03, 0.012, 0.2, helmet, 0.005);
    ridge.position.set(0, 0.135, -0.004);
    head.add(ridge);
    const brim = box(0.2, 0.012, 0.07, helmet, 0.005);
    brim.position.set(0, 0.052, 0.1);
    head.add(brim);
  }
  torso.add(head);

  // brazos: hombro → codo → antebrazo → guante
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const arm = group("arm");
    arm.position.set(sx * 0.215, 0.45, 0);
    const upper = capsule(0.04, 0.17, shirtMat);
    upper.position.y = -0.14;
    arm.add(upper);
    const fore = group("forearm");
    fore.position.y = -0.3;
    const lower = capsule(0.034, 0.16, shirtMat);
    lower.position.y = -0.13;
    fore.add(lower);
    const hand = mesh(new THREE.SphereGeometry(0.04, 12, 10), glove);
    hand.scale.set(0.9, 1.15, 0.7);
    hand.position.y = -0.285;
    fore.add(hand);
    arm.add(fore);
    arm.userData.fore = fore;
    torso.add(arm);
    arms.push(arm);
  }
  g.add(torso);
  function setPose(work: number): void {
    const w = Math.max(0, Math.min(1, work));
    torso.rotation.x = 0.3 * w;
    for (const [i, arm] of arms.entries()) {
      arm.rotation.x = -0.5 * w - 0.05;
      arm.rotation.z = (i ? -1 : 1) * 0.04;
      (arm.userData.fore as THREE.Group).rotation.x = -(0.2 + 0.7 * w + 0.12 * Math.sin(i * 2) * w);
    }
    for (const l of legs) {
      l.hip.rotation.x = 0;
      l.knee.rotation.x = 0;
    }
  }
  function setWalk(phase: number): void {
    const swing = Math.sin(phase) * 0.5;
    legs[0].hip.rotation.x = swing;
    legs[1].hip.rotation.x = -swing;
    // la rodilla se flexiona mientras la pierna avanza
    legs[0].knee.rotation.x = Math.max(0, -Math.cos(phase)) * 0.7;
    legs[1].knee.rotation.x = Math.max(0, Math.cos(phase)) * 0.7;
    arms[0].rotation.x = -swing * 0.8 - 0.05;
    arms[1].rotation.x = swing * 0.8 - 0.05;
    (arms[0].userData.fore as THREE.Group).rotation.x = -0.25 - Math.max(0, swing) * 0.4;
    (arms[1].userData.fore as THREE.Group).rotation.x = -0.25 - Math.max(0, -swing) * 0.4;
    torso.rotation.x = 0.03;
    torso.rotation.y = swing * 0.12;
    g.position.y = Math.abs(Math.cos(phase)) * 0.02;
  }
  setPose(0);
  return { object: g, setPose, setWalk };
}

/**
 * Canastilla plástica (≈ 0,6 × 0,4 × 0,3 m) con asas y ranuras de ventilación. Origen en el centro de la base.
 * Con `fill` > 0 lleva piezas moldeadas apiladas (0..1).
 */
export function basket(color = "#2f6fb0", w = 0.6, d = 0.4, h = 0.3): THREE.Group {
  const g = group("basket");
  const mat = M.plastic(color, 0.5);
  const floor = box(w, 0.03, d, mat, 0.01);
  floor.position.y = 0.015;
  g.add(floor);
  for (const sz of [-1, 1]) {
    const wall = box(w, h, 0.025, mat, 0.008);
    wall.position.set(0, h / 2, sz * (d / 2 - 0.0125));
    g.add(wall);
    for (let i = 0; i < 5; i++) {
      const slot = box(w * 0.1, h * 0.28, 0.03, M.darkSteel(), 0.004);
      slot.position.set(-w * 0.4 + i * w * 0.2, h * 0.55, sz * (d / 2 - 0.0125));
      g.add(slot);
    }
  }
  for (const sx of [-1, 1]) {
    const end = box(0.025, h, d, mat, 0.008);
    end.position.set(sx * (w / 2 - 0.0125), h / 2, 0);
    g.add(end);
    const handle = box(0.03, 0.04, d * 0.35, M.darkSteel(), 0.01);
    handle.position.set(sx * (w / 2 + 0.005), h * 0.8, 0);
    g.add(handle);
  }
  return g;
}

export interface CartHandle {
  object: THREE.Group;
  /** Muestra las canastillas llenas (0 = vacío, 1 = tres canastillas con piezas). */
  setLoaded(loaded: boolean): void;
}

/**
 * Carro de transporte interno (≈ 1,3 × 0,75 × 1,1 m): plataforma baja con cuatro ruedas, manubrio y tres canastillas
 * con piezas. Origen en el suelo, centrado; avanza hacia +Z (el manubrio queda atrás).
 */
export function cart(color = "#2f6fb0"): CartHandle {
  const g = group("cart");
  const steel = M.paint("#59616a", 0.5);
  const bed = box(0.7, 0.05, 1.25, steel, 0.015);
  bed.position.y = 0.2;
  g.add(bed);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = cylinderX(0.07, 0.04, M.rubber(), 16);
      wheel.position.set(sx * 0.3, 0.07, sz * 0.5);
      g.add(wheel);
      const fork = box(0.02, 0.1, 0.06, M.darkSteel(), 0.004);
      fork.position.set(sx * 0.3, 0.14, sz * 0.5);
      g.add(fork);
    }
  }
  for (const sx of [-1, 1]) {
    const post = cylinder(0.014, 0.014, 0.9, steel, 10);
    post.position.set(sx * 0.3, 0.65, -0.58);
    g.add(post);
  }
  const grip = cylinderX(0.016, 0.62, M.paint("#1d2228", 0.7), 12);
  grip.position.set(0, 1.1, -0.58);
  g.add(grip);
  const load = group("load");
  const partMat = M.plastic("#e8e4da", 0.3);
  for (let i = 0; i < 3; i++) {
    const b = basket(color);
    b.position.set(0, 0.225, -0.4 + i * 0.4);
    load.add(b);
    for (let k = 0; k < 8; k++) {
      const p = box(0.09, 0.05, 0.09, partMat, 0.015);
      p.position.set(-0.15 + (k % 2) * 0.3, 0.27 + Math.floor(k / 4) * 0.05, -0.4 + i * 0.4 - 0.08 + ((k >> 1) % 2) * 0.16);
      p.rotation.y = k * 0.7;
      load.add(p);
    }
  }
  g.add(load);
  load.visible = false;
  return { object: g, setLoaded: (v) => (load.visible = v) };
}

/** Estiba europea (1,2 × 0,8 m) con cajas de cartón apiladas en traslape, esquineros y fleje; origen en la base. */
export function palletLoad(layers = 3, boxColor = "#b08a5a"): THREE.Group {
  const g = group("pallet-load");
  const wood = M.paint("#a07a4a", 0.9);
  for (const sx of [-1, 0, 1]) {
    const runner = box(0.1, 0.09, 0.8, wood, 0.004);
    runner.position.set(sx * 0.5, 0.075, 0);
    g.add(runner);
  }
  for (let i = 0; i < 7; i++) {
    const slat = box(1.2, 0.022, 0.1, wood, 0.003);
    slat.position.set(0, 0.14, -0.35 + i * 0.1167);
    g.add(slat);
  }
  const carton = M.paint(boxColor, 0.85);
  const tape = M.paint("#d8c9a4", 0.6);
  const label = M.paint("#f4f4f2", 0.6);
  for (let l = 0; l < layers; l++) {
    const y = 0.15 + l * 0.27 + 0.135;
    for (let ix = 0; ix < 2; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const swap = l % 2 === 1;
        const cx = swap ? (iz - 0.5) * 0.6 : (ix - 0.5) * 0.6;
        const cz = swap ? (ix - 0.5) * 0.4 : (iz - 0.5) * 0.4;
        const b = box(swap ? 0.4 : 0.6, 0.265, swap ? 0.6 : 0.4, carton, 0.006);
        b.position.set(cx, y, cz);
        g.add(b);
        const seam = box(swap ? 0.4 : 0.05, 0.268, swap ? 0.05 : 0.4, tape, 0.002);
        seam.position.set(cx, y, cz);
        g.add(seam);
        const lab = box(0.001 + 0.0, 0.1, 0.14, label, 0);
        lab.position.set(swap ? cx : cx + 0.3 * Math.sign(cx || 1), y, swap ? cz + 0.3 * Math.sign(cz || 1) : cz);
        if (swap) lab.rotation.y = Math.PI / 2;
        g.add(lab);
      }
    }
  }
  const top = 0.15 + layers * 0.27;
  for (const sy of [0.3, 0.7]) {
    const strap = mesh(new THREE.BoxGeometry(1.22, 0.012, 0.012), M.paint("#1d2228", 0.6));
    strap.position.set(0, top * sy, 0.402);
    g.add(strap);
    const strap2 = strap.clone();
    strap2.position.z = -0.402;
    g.add(strap2);
  }
  return g;
}

export interface ForkliftHandle {
  object: THREE.Group;
  /** Muestra u oculta la estiba con carga sobre las horquillas. */
  setLoaded(loaded: boolean): void;
}

/**
 * Montacargas de contrapeso eléctrico (≈ 2,3 × 1,1 × 2,1 m) con mástil, horquillas, techo de protección y baliza.
 * Origen en el suelo, centrado; avanza hacia +Z (las horquillas apuntan a +Z).
 */
export function forklift(body = "#f2b705"): ForkliftHandle {
  const g = group("forklift");
  const paint = M.paint(body, 0.45);
  const dark = M.paint("#2b2f35", 0.6);
  const tyre = M.rubber();
  const chassis = box(1.05, 0.7, 1.7, paint, 0.06);
  chassis.position.set(0, 0.55, -0.1);
  g.add(chassis);
  const counter = box(1.05, 0.55, 0.5, paint, 0.1);
  counter.position.set(0, 0.8, -0.85);
  g.add(counter);
  const seat = box(0.5, 0.12, 0.5, dark, 0.04);
  seat.position.set(0, 1.0, -0.2);
  g.add(seat);
  const back = box(0.5, 0.45, 0.08, dark, 0.03);
  back.position.set(0, 1.2, -0.45);
  g.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const post = box(0.06, 1.0, 0.06, dark, 0.01);
    post.position.set(sx * 0.46, 1.5, sz * 0.4 - 0.15);
    g.add(post);
  }
  const roof = box(1.0, 0.05, 0.95, dark, 0.01);
  roof.position.set(0, 2.02, -0.15);
  g.add(roof);
  for (const sx of [-1, 1]) {
    const wf = cylinderX(0.3, 0.22, tyre, 20);
    wf.position.set(sx * 0.5, 0.3, 0.45);
    g.add(wf);
    const wb = cylinderX(0.25, 0.2, tyre, 20);
    wb.position.set(sx * 0.46, 0.25, -0.7);
    g.add(wb);
    const rail = box(0.07, 1.9, 0.08, M.paint("#3a4047", 0.5), 0.01);
    rail.position.set(sx * 0.3, 0.95, 0.9);
    g.add(rail);
    const fork = box(0.1, 0.05, 1.1, M.darkSteel(), 0.01);
    fork.position.set(sx * 0.3, 0.07, 1.45);
    g.add(fork);
  }
  const carriage = box(0.8, 0.5, 0.06, M.paint("#3a4047", 0.5), 0.01);
  carriage.position.set(0, 0.35, 0.95);
  g.add(carriage);
  const beacon = mesh(new THREE.SphereGeometry(0.07, 12, 8), M.emissive("#ff8a00", 1.5));
  beacon.position.set(0.4, 2.12, -0.5);
  g.add(beacon);
  const load = group("load");
  const pallet = palletLoad(3);
  pallet.rotation.y = Math.PI / 2;
  load.add(pallet);
  load.position.set(0, 0.06, 1.55);
  g.add(load);
  load.visible = false;
  return { object: g, setLoaded: (v) => (load.visible = v) };
}

/** Placa de datos (texto). Plano orientado a +Z. */
export function nameplate(lines: string[], w = 0.25, h = 0.1, bg = "#d9dde1", fg = "#1b1e22"): THREE.Mesh {
  const tex = textTexture(lines, { width: 512, height: Math.round((512 * h) / w), bg, fg, font: "700 44px Inter, Arial, sans-serif" });
  const mat = new THREE.MeshStandardMaterial({ color: tex ? "#ffffff" : bg, map: tex ?? undefined, roughness: 0.4, metalness: 0.3 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.name = "nameplate";
  return m;
}

export interface HmiHandle {
  object: THREE.Group;
  draw: (title: string, rows: [string, string][], status: string, statusColor: string) => void;
}

/** Panel HMI con pantalla táctil emisiva sobre brazo. Origen en la base del brazo; pantalla mirando a +Z. */
export function hmiPanel(armHeight = 0.5): HmiHandle {
  const g = group("hmi_panel");
  const arm = cylinder(0.03, 0.03, armHeight, M.aluminum(), 16);
  g.add(arm);
  const head = group("hmi_head");
  head.position.y = armHeight + 0.2;
  head.rotation.x = -0.18;
  head.add(box(0.5, 0.36, 0.06, M.paint("#2b2f35", 0.5), 0.015));
  const { texture, draw } = hmiScreen();
  const screenMat = new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: "#ffffff",
    emissiveMap: texture ?? undefined,
    emissiveIntensity: texture ? 1.2 : 0.2,
    roughness: 0.15,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.275), screenMat);
  screen.position.z = 0.031;
  screen.name = "hmi_screen";
  head.add(screen);
  g.add(head);
  return { object: g, draw };
}

export interface StackLightHandle {
  object: THREE.Group;
  /** 0 apagada, 1 verde, 2 amarilla, 3 roja. */
  set(level: number, time: number): void;
}

/** Baliza de 3 colores (andon). Origen en la base. */
export function stackLight(poleHeight = 0.35): StackLightHandle {
  const g = group("stack_light");
  g.add(cylinder(0.012, 0.012, poleHeight, M.aluminum(), 12));
  const colors = ["#22e06b", "#ffb000", "#ff2a2a"];
  const mats = colors.map((c) => M.emissive(c, 0.05));
  mats.forEach((mat, i) => {
    const seg = cylinder(0.035, 0.035, 0.07, mat, 24);
    seg.position.y = poleHeight + i * 0.075;
    g.add(seg);
  });
  const cap = cylinder(0.03, 0.035, 0.02, M.paint("#222", 0.5), 24);
  cap.position.y = poleHeight + 3 * 0.075;
  g.add(cap);
  return {
    object: g,
    set(level, time) {
      mats.forEach((mat, i) => {
        const on = Math.round(level) === i + 1;
        const blink = i === 2 ? 0.55 + 0.45 * Math.sin(time * 8) : 1;
        mat.emissiveIntensity = on ? 6 * blink : 0.04;
      });
    },
  };
}

/** Escalera de gato con jaula opcional. Origen en el pie; sube por +Y; peldaños a lo largo de X. */
export function ladder(height: number, width = 0.45, cage = true, material: THREE.Material = M.paint(M.SAFETY_YELLOW, 0.5)): THREE.Group {
  const g = group("ladder");
  for (const s of [-1, 1]) {
    const rail = cylinder(0.02, 0.02, height, material, 10);
    rail.position.x = (s * width) / 2;
    g.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.012, 0.012, width, 8);
  rungGeo.rotateZ(Math.PI / 2);
  const n = Math.floor(height / 0.3);
  const rungs = new THREE.InstancedMesh(rungGeo, material, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) rungs.setMatrixAt(i, m.makeTranslation(0, 0.3 * (i + 1), 0));
  rungs.castShadow = true;
  g.add(rungs);
  if (cage && height > 3) {
    const hoopGeo = new THREE.TorusGeometry(0.38, 0.012, 6, 24, Math.PI * 1.4);
    hoopGeo.rotateX(Math.PI / 2);
    hoopGeo.rotateY(-Math.PI * 0.2);
    for (let y = 2.2; y < height; y += 0.9) {
      const hoop = mesh(hoopGeo, material);
      hoop.position.set(0, y, 0.38);
      g.add(hoop);
    }
  }
  return g;
}

/** Baranda tubular (pasamanos, rodapié) por una polilínea en el plano XZ. Origen en el nivel del piso. */
export function handrail(points: THREE.Vector2[], height = 1.1, material: THREE.Material = M.paint(M.SAFETY_YELLOW, 0.45)): THREE.Group {
  const g = group("handrail");
  const top = points.map((p) => new THREE.Vector3(p.x, height, p.y));
  const mid = points.map((p) => new THREE.Vector3(p.x, height * 0.5, p.y));
  g.add(pipe(top, 0.024, material, 0.1));
  g.add(pipe(mid, 0.018, material, 0.1));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const p = a.clone().lerp(b, k / n);
      const post = cylinder(0.022, 0.022, height, material, 10);
      post.position.set(p.x, 0, p.y);
      g.add(post);
    }
  }
  return g;
}

/** Guarda perimetral de seguridad: postes de aluminio + paneles de vidrio. Rectángulo w×d centrado. */
export function safetyFence(w: number, d: number, h = 2.0, openFront = 0): THREE.Group {
  const g = group("safety_fence");
  const post = M.aluminum();
  const corners = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  const sides: [number[], number[], boolean][] = [
    [corners[0], corners[1], false],
    [corners[1], corners[2], false],
    [corners[2], corners[3], true],
    [corners[3], corners[0], false],
  ];
  for (const [a, b, front] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.4));
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const cx = a[0] + (b[0] - a[0]) * (t0 + t1) / 2;
      const cz = a[1] + (b[1] - a[1]) * (t0 + t1) / 2;
      const segLen = len / n;
      if (front && openFront > 0 && Math.abs(cx) < openFront / 2) continue; // acceso del operador
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(segLen - 0.06, h - 0.25), M.glass());
      panel.position.set(cx, h / 2 + 0.08, cz);
      panel.rotation.y = -angle;
      panel.renderOrder = 2;
      g.add(panel);
      const rail = box(segLen, 0.04, 0.04, post, 0.006);
      rail.position.set(cx, h, cz);
      rail.rotation.y = -angle;
      g.add(rail);
      const kick = box(segLen, 0.1, 0.03, M.paint(M.SAFETY_YELLOW, 0.5), 0.005);
      kick.position.set(cx, 0.05, cz);
      kick.rotation.y = -angle;
      g.add(kick);
    }
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = box(0.05, h, 0.05, post, 0.008);
      p.position.set(a[0] + (b[0] - a[0]) * t, h / 2, a[1] + (b[1] - a[1]) * t);
      g.add(p);
    }
  }
  return g;
}

/** Patas redondas con base para recipientes. Origen en el piso; patas sobre un círculo de radio r. */
export function legs(count: number, circleR: number, height: number, legR: number, material: THREE.Material): THREE.Group {
  const g = group("legs");
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    const x = Math.cos(a) * circleR;
    const z = Math.sin(a) * circleR;
    const leg = cylinder(legR, legR, height, material, 20);
    leg.position.set(x, 0, z);
    g.add(leg);
    const foot = cylinder(legR * 1.9, legR * 2.2, 0.04, material, 20);
    foot.position.set(x, 0, z);
    g.add(foot);
    const pad = box(legR * 3, 0.015, legR * 3, material, 0.003);
    pad.position.set(x, height - 0.02, z);
    g.add(pad);
  }
  return g;
}

/** Válvula mariposa con manija, en línea a lo largo de Y. Origen en el centro. */
export function butterflyValve(pipeR: number, material: THREE.Material = M.stainless()): THREE.Group {
  const g = group("valve");
  const bodyGeo = new THREE.CylinderGeometry(pipeR * 1.8, pipeR * 1.8, pipeR * 1.2, 32);
  g.add(mesh(bodyGeo, material));
  const neck = cylinderX(pipeR * 0.35, pipeR * 2.2, material, 12);
  neck.position.x = pipeR * 2.4;
  g.add(neck);
  const handle = box(pipeR * 5, pipeR * 0.4, pipeR * 0.8, M.paint("#c62828", 0.5), pipeR * 0.15);
  handle.position.set(pipeR * 3.6, 0, pipeR * 1.6);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

// ------------------------------------------------------------------ equipaje (aeropuerto)

/** Colores de maletas: oscuros y sobrios, con algunos vivos, como en una banda real. */
export const BAG_COLORS = ["#1f2a44", "#7a1f2b", "#2f4f3a", "#3a3a3a", "#5a3d8a", "#b5651d", "#264d73", "#8c8c8c", "#c9a227", "#111418"];

/**
 * Maletas instanciadas, acostadas (como viajan en las bandas): largo `size` sobre X, alto 0,35 × size,
 * ancho 0,65 × size. Cada instancia tiene su color. El origen de cada maleta está en el centro de su base.
 */
export function bagInstances(maxCount: number, size = 0.7, name = "bags"): THREE.InstancedMesh {
  const h = size * 0.35;
  const geo = new RoundedBoxGeometry(size, h, size * 0.65, 2, Math.min(0.04, h / 3));
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.05 });
  const bags = new THREE.InstancedMesh(geo, mat, Math.max(1, maxCount));
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  for (let i = 0; i < bags.count; i++) {
    bags.setColorAt(i, c.set(BAG_COLORS[(i * 7 + 3) % BAG_COLORS.length]));
    bags.setMatrixAt(i, m.makeTranslation(0, 0, 0));
  }
  bags.castShadow = true;
  bags.name = name;
  bags.count = 0;
  return bags;
}

/**
 * Punto de un óvalo (dos rectas de largo `straight` y dos semicírculos de radio `r`) a la distancia `s` de su
 * inicio. El recorrido empieza en el extremo -X de la recta +Z y avanza hacia +X (sentido horario visto desde arriba
 * con +Z hacia el observador). Devuelve x, z y el ángulo de avance (rotación en Y).
 */
export function ovalPoint(s: number, straight: number, r: number): { x: number; z: number; yaw: number } {
  const L = 2 * straight + 2 * Math.PI * r;
  let d = ((s % L) + L) % L;
  const h = straight / 2;
  if (d < straight) return { x: -h + d, z: r, yaw: 0 };
  d -= straight;
  if (d < Math.PI * r) {
    const a = d / r; // de +Z a -Z por el extremo +X
    return { x: h + r * Math.sin(a), z: r * Math.cos(a), yaw: a };
  }
  d -= Math.PI * r;
  if (d < straight) return { x: h - d, z: -r, yaw: Math.PI };
  d -= straight;
  const a = d / r;
  return { x: -h - r * Math.sin(a), z: -r * Math.cos(a), yaw: Math.PI + a };
}

/** Largo del óvalo de `ovalPoint`. */
export function ovalLength(straight: number, r: number): number {
  return 2 * straight + 2 * Math.PI * r;
}
