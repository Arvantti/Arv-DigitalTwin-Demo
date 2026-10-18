/**
 * Equipos de proceso, empaque y servicios de la escena de planta que aún no tienen tipo en la librería.
 *
 * Son piezas de la escena (como la bodega y la sala de control): sin comportamiento ni canales, dimensionadas con la
 * huella del plant.yaml (`footprint`: x = ancho, y = largo, z = alto). Formas tomadas de equipos típicos de la
 * industria de salsas (tanques sanitarios sobre patas, emulsificador al vacío con tapa elevable, molino coloidal
 * con tolva cónica, patines con bombas de lóbulos, skid de CIP, etc.). Origen en el centro de la huella, en el piso;
 * x del plano = x local, y del plano = z local.
 */
import * as THREE from "three";
import { materials as M, parts as P } from "@twin/3d";
import { aircraft, baggageCartTrain } from "./airport-pieces.ts";

type Footprint = [number, number, number];
export type PieceBuilder = (footprint: Footprint, params: Record<string, unknown>) => THREE.Object3D;

const steel = () => M.stainless();
const frame = () => M.paint("#59626c", 0.55);
const blue = () => M.paint("#2f5d8a", 0.4);
const white = () => M.paint("#e9ecef", 0.4);
const yellow = () => M.paint(M.SAFETY_YELLOW, 0.5);
const dark = () => M.darkSteel();

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Recipiente vertical sanitario: cuerpo cilíndrico, fondo y tapa abombados y patas; base del cuerpo a `yBottom`. */
function vessel(r: number, h: number, yBottom: number, mat: THREE.Material, legs = 4): THREE.Group {
  const g = P.group("vessel");
  const body = P.cylinder(r, r, h, mat, 48);
  body.position.y = yBottom;
  g.add(body);
  g.add(at(P.dishedHead(r, mat, true, 0.22), 0, yBottom, 0));
  g.add(at(P.dishedHead(r, mat, false, 0.2), 0, yBottom + h, 0));
  if (yBottom > 0.05) g.add(P.legs(legs, r * 0.8, yBottom - r * 0.44 + 0.05, 0.04, steel()));
  return g;
}

function ladderSide(g: THREE.Group, r: number, h: number, angle = 0.7): void {
  const l = P.ladder(h, 0.4, h > 3);
  l.position.set(Math.cos(angle) * (r + 0.1), 0, Math.sin(angle) * (r + 0.1));
  l.rotation.y = -angle + Math.PI / 2;
  g.add(l);
}

function nozzle(r: number, length: number, mat: THREE.Material): THREE.Group {
  const g = P.group("nozzle");
  const pipe = P.cylinderX(r, length, mat, 16);
  pipe.position.x = length / 2;
  g.add(pipe);
  const flange = P.cylinderX(r * 1.6, 0.02, mat, 20);
  flange.position.x = length;
  g.add(flange);
  return g;
}

function pumpUnit(scale = 1, lobe = false): THREE.Group {
  const g = P.group(lobe ? "lobe-pump" : "pump");
  const base = P.box(1.1 * scale, 0.08, 0.5 * scale, frame(), 0.01);
  base.position.y = 0.14;
  g.add(base);
  const motor = P.motor(lobe ? 5.5 : 4, "#2f5d8a");
  motor.scale.setScalar(scale);
  motor.position.set(-0.25 * scale, 0.32 + 0.1 * scale, 0);
  g.add(motor);
  if (lobe) {
    const gear = P.box(0.28 * scale, 0.3 * scale, 0.34 * scale, M.paint("#2f5d8a", 0.4), 0.03);
    gear.position.set(0.22 * scale, 0.38, 0);
    g.add(gear);
    const head = P.box(0.32 * scale, 0.3 * scale, 0.3 * scale, steel(), 0.04);
    head.position.set(0.5 * scale, 0.38, 0);
    g.add(head);
    const cover = P.cylinderX(0.1 * scale, 0.05, steel(), 24);
    cover.position.set(0.68 * scale, 0.38, 0);
    g.add(cover);
    g.add(at(P.cylinder(0.05 * scale, 0.05 * scale, 0.22 * scale, steel(), 16), 0.5 * scale, 0.5, 0));
    g.add(at(nozzle(0.04 * scale, 0.2 * scale, steel()), 0.5 * scale, 0.38, 0.15 * scale));
  } else {
    const volute = P.cylinderX(0.17 * scale, 0.14 * scale, steel(), 32);
    volute.position.set(0.3 * scale, 0.42, 0);
    g.add(volute);
    g.add(at(P.cylinder(0.05 * scale, 0.05 * scale, 0.3 * scale, steel(), 16), 0.3 * scale, 0.5, 0));
    g.add(at(nozzle(0.045 * scale, 0.22 * scale, steel()), 0.3 * scale, 0.42, 0.0));
  }
  return g;
}

function mount(root: THREE.Group, inner: THREE.Object3D): THREE.Group {
  root.add(inner);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return root;
}

// ------------------------------------------------------------------ tanques

const storageTank: PieceBuilder = ([dx, dy, h]) => {
  const r = Math.min(dx, dy) / 2 - 0.05;
  const g = P.group("storage_tank");
  const yBottom = 0.45;
  const bodyH = h - yBottom - r * 0.4;
  const v = vessel(r, bodyH, yBottom, steel(), 6);
  g.add(v);
  ladderSide(g, r, h * 0.92);
  g.add(at(P.cylinder(r * 0.25, r * 0.25, 0.1, steel(), 24), 0, h - r * 0.1, 0));
  const manway = P.cylinder(0.2, 0.2, 0.12, steel(), 24);
  manway.position.set(r * 0.5, h - r * 0.28, 0);
  g.add(manway);
  const gauge = P.cylinder(0.02, 0.02, bodyH * 0.9, M.glass("#cfe6f5", 0.4), 10);
  gauge.position.set(-r - 0.08, yBottom + 0.1, 0);
  g.add(gauge);
  g.add(at(nozzle(0.05, 0.25, steel()), r - 0.02, yBottom + 0.3, r * 0.3));
  return g;
};

const mixingTank: PieceBuilder = ([dx, dy, h]) => {
  const r = Math.min(dx, dy) / 2 - 0.05;
  const g = P.group("mixing_tank");
  const yBottom = 0.55;
  const bodyH = h - yBottom - r * 0.45 - 0.5;
  g.add(vessel(r, bodyH, yBottom, steel(), 4));
  const jacket = P.cylinder(r + 0.035, r + 0.035, bodyH * 0.6, M.insulationCladding(), 48);
  jacket.position.y = yBottom + bodyH * 0.12;
  g.add(jacket);
  const top = yBottom + bodyH + r * 0.4;
  const motor = P.motor(5.5, "#2f5d8a");
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0, top + 0.5, 0);
  g.add(motor);
  g.add(at(P.box(0.4, 0.3, 0.4, blue(), 0.03), 0, top + 0.15, 0));
  g.add(at(P.cylinder(0.025, 0.025, bodyH * 0.8, steel(), 12), 0, yBottom + 0.1, 0));
  const blade = P.box(r * 1.1, 0.025, 0.1, steel(), 0.01);
  blade.position.set(0, yBottom + 0.25, 0);
  g.add(blade);
  g.add(at(P.cylinder(0.18, 0.18, 0.08, steel(), 24), r * 0.5, top - 0.05, 0));
  return g;
};

const jacketedTank: PieceBuilder = mixingTank;

const emulsifier: PieceBuilder = ([dx, dy, h]) => {
  const r = Math.min(dx, dy) / 2 - 0.35;
  const g = P.group("vacuum_emulsifier");
  const bodyBottom = 0.55;
  const bodyH = h * 0.5;
  g.add(vessel(r, bodyH, bodyBottom, steel(), 4));
  const jacket = P.cylinder(r + 0.04, r + 0.04, bodyH * 0.75, M.insulationCladding(), 48);
  jacket.position.y = bodyBottom + 0.1;
  g.add(jacket);
  // tapa elevable con pistón hidráulico
  const lidY = bodyBottom + bodyH + r * 0.4 + 0.12;
  g.add(at(P.dishedHead(r + 0.03, steel(), false, 0.18), 0, lidY, 0));
  g.add(at(P.ring(r + 0.05, 0.05, 0.05, steel()), 0, lidY - 0.05, 0));
  const piston = P.cylinder(0.05, 0.05, 0.6, M.chrome(), 16);
  piston.position.set(r + 0.25, bodyBottom + bodyH - 0.1, 0);
  g.add(piston);
  g.add(at(P.cylinder(0.08, 0.08, 0.35, white(), 16), r + 0.25, bodyBottom + bodyH - 0.55, 0));
  // homogeneizador (motor vertical) y agitador raspador
  g.add(at(P.cylinder(0.2, 0.2, 0.55, blue(), 24), 0, lidY + 0.3, 0));
  g.add(at(P.cylinder(0.08, 0.08, 0.2, steel(), 16), 0, lidY + 0.85, 0));
  const scrape = P.motor(4, "#2f5d8a");
  scrape.rotation.z = Math.PI / 2;
  scrape.position.set(-r * 0.55, lidY + 0.7, 0);
  g.add(scrape);
  // bomba de vacío, tolva de ingredientes y panel
  g.add(at(P.cylinder(0.2, 0.2, 0.4, M.paint("#3a6b8a", 0.4), 20), -r - 0.5, 0.2, r * 0.3));
  g.add(at(P.pipe([new THREE.Vector3(-r - 0.5, 0.45, r * 0.3), new THREE.Vector3(-r - 0.5, lidY + 0.3, r * 0.3), new THREE.Vector3(-r * 0.4, lidY + 0.3, r * 0.3)], 0.025, steel()), 0, 0, 0));
  const panel = P.cabinet(0.6, 1.3, 0.3, "#cfd3d6");
  panel.position.set(r + 0.55, 0, r * 0.5);
  g.add(panel);
  g.add(at(P.cylinder(0.25, 0.1, 0.3, steel(), 24), r * 0.45, lidY + 0.15, -r * 0.45));
  return g;
};

// ------------------------------------------------------------------ molinos y patines

function hopperMill(hopperR: number, hopperH: number, stone: boolean): THREE.Group {
  const g = P.group(stone ? "stone_mill" : "colloid_mill");
  const base = P.box(1.3, 0.1, 0.9, frame(), 0.01);
  base.position.set(0, 0.05, 0);
  g.add(base);
  const motor = P.motor(stone ? 11 : 15, "#2f5d8a");
  motor.scale.setScalar(1.15);
  motor.position.set(-0.35, 0.5, 0);
  g.add(motor);
  if (stone) {
    const housing = P.cylinder(0.38, 0.38, 0.35, steel(), 40);
    housing.position.set(0.3, 0.45, 0);
    g.add(housing);
    g.add(at(P.dishedHead(0.38, steel(), false, 0.12), 0.3, 0.8, 0));
  } else {
    const head = P.cylinderX(0.2, 0.4, steel(), 32);
    head.position.set(0.25, 0.5, 0);
    g.add(head);
    g.add(at(P.cylinderX(0.14, 0.12, M.polishedSteel(), 24), 0.52, 0.5, 0));
  }
  const hopper = P.frustum(0.08, hopperR, hopperH, steel(), "hopper");
  hopper.position.set(stone ? 0.3 : 0.3, stone ? 0.85 : 0.7, 0);
  g.add(hopper);
  g.add(at(P.ring(hopperR + 0.01, 0.03, 0.03, steel()), stone ? 0.3 : 0.3, (stone ? 0.85 : 0.7) + hopperH, 0));
  g.add(at(nozzle(0.045, 0.3, steel()), 0.2, 0.3, 0.3));
  return g;
}

const colloidMill: PieceBuilder = () => hopperMill(0.3, 0.45, false);
const stoneMill: PieceBuilder = () => hopperMill(0.34, 0.4, true);

const dosingSkid: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("dosing_skid");
  g.add(at(P.box(dx * 0.95, 0.1, dy * 0.9, frame(), 0.01), 0, 0.05, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.06, h * 0.6, 0.06, frame(), 0.005), sx * dx * 0.42, h * 0.3 + 0.1, sz * dy * 0.38));
  g.add(at(P.box(dx * 0.92, 0.06, dy * 0.8, frame(), 0.005), 0, h * 0.62, 0));
  // medidor másico coriolis: carcasa y dos tubos en U
  g.add(at(P.box(0.5, 0.25, 0.3, steel(), 0.03), 0, h * 0.5, 0));
  g.add(at(P.box(0.25, 0.18, 0.2, white(), 0.03), 0, h * 0.5 + 0.22, 0));
  for (const sz of [-1, 1]) g.add(at(P.pipe([new THREE.Vector3(-0.35, 0.3, sz * 0.12), new THREE.Vector3(-0.2, h * 0.5, sz * 0.12), new THREE.Vector3(0.2, h * 0.5, sz * 0.12), new THREE.Vector3(0.35, 0.3, sz * 0.12)], 0.025, steel()), 0, 0, 0));
  g.add(at(pumpUnit(0.8, true), -dx * 0.25, 0.1, dy * 0.25));
  g.add(at(P.butterflyValve(0.04), dx * 0.3, 0.45, -dy * 0.2));
  return g;
};

const cipSkid: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("cip_skid");
  g.add(at(P.box(dx * 0.98, 0.12, dy * 0.95, frame(), 0.01), 0, 0.06, 0));
  const tanks = 4;
  const r = Math.min(dx / tanks / 2 - 0.08, dy / 2 - 0.5);
  for (let i = 0; i < tanks; i++) {
    const x = -dx / 2 + dx / tanks / 2 + (i * dx) / tanks;
    const v = vessel(r, h * 0.55, h * 0.18, steel(), 3);
    v.position.set(x, 0.12, -dy * 0.22);
    g.add(v);
    g.add(at(P.cylinder(0.04, 0.04, 0.2, M.paint(i % 2 ? "#c0392b" : "#2980b9", 0.4), 12), x, h * 0.18 + h * 0.55 + r * 0.3 + 0.12, -dy * 0.22));
  }
  for (let i = 0; i < 3; i++) g.add(at(pumpUnit(0.8), -dx * 0.35 + i * dx * 0.3, 0.12, dy * 0.32));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.45, 0.5, dy * 0.05), new THREE.Vector3(dx * 0.45, 0.5, dy * 0.05)], 0.04, steel()), 0, 0, 0));
  const panel = P.cabinet(0.7, 1.6, 0.3, "#cfd3d6");
  panel.position.set(dx * 0.42, 0.12, dy * 0.32);
  g.add(panel);
  return g;
};

const holdingTube: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("holding_tube");
  g.add(at(P.box(dx * 0.96, 0.1, dy * 0.9, frame(), 0.01), 0, 0.05, 0));
  for (const sx of [-1, 1]) g.add(at(P.box(0.06, h * 0.8, 0.06, frame(), 0.004), sx * dx * 0.46, h * 0.4 + 0.1, 0));
  const runs = 3;
  for (let i = 0; i < runs; i++) {
    const y = h * 0.28 + i * (h * 0.2);
    const a = new THREE.Vector3(-dx * 0.46, y, 0);
    const b = new THREE.Vector3(dx * 0.46, y, 0);
    g.add(at(P.pipe([a, b], 0.04, steel()), 0, 0, 0));
    g.add(at(P.cylinderZ(0.07, 0.03, dark(), 12), -dx * 0.46, y, 0));
    if (i < runs - 1) g.add(at(P.pipe([b, new THREE.Vector3(dx * 0.46 + 0.1, y + h * 0.1, 0), new THREE.Vector3(dx * 0.46, y + h * 0.2, 0)], 0.04, steel(), 0.1), 0, 0, 0));
  }
  g.add(at(P.cylinder(0.05, 0.05, 0.16, M.paint("#c0392b", 0.4), 12), dx * 0.2, h * 0.28 + 0.06, 0.1));
  return g;
};

const steamStation: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("steam_pressure_station");
  g.add(at(P.box(dx * 0.95, 0.08, dy * 0.9, frame(), 0.01), 0, 0.04, 0));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.45, h * 0.5, 0), new THREE.Vector3(dx * 0.45, h * 0.5, 0)], 0.06, M.paint("#9aa3ab", 0.5)), 0, 0, 0));
  g.add(at(P.cylinder(0.12, 0.12, 0.3, white(), 20), 0, h * 0.5 + 0.05, 0));
  g.add(at(P.cylinder(0.2, 0.2, 0.12, blue(), 20), 0, h * 0.5 + 0.35, 0));
  const gauge = P.cylinderZ(0.07, 0.03, white(), 24);
  gauge.position.set(-dx * 0.25, h * 0.5 + 0.25, 0.05);
  g.add(gauge);
  g.add(at(P.cylinderZ(0.07, 0.03, white(), 24), dx * 0.25, h * 0.5 + 0.25, 0.05));
  g.add(at(P.cylinder(0.1, 0.1, 0.3, M.paint("#c0392b", 0.4), 16), dx * 0.38, h * 0.5 - 0.1, 0));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.1, h * 0.5, 0), new THREE.Vector3(-dx * 0.1, h * 0.25, 0), new THREE.Vector3(dx * 0.1, h * 0.25, 0), new THREE.Vector3(dx * 0.1, h * 0.5, 0)], 0.03, steel()), 0, 0, 0));
  for (const sx of [-1, 1]) g.add(at(P.box(0.05, h * 0.5, 0.05, frame(), 0.003), sx * dx * 0.42, h * 0.25, 0));
  return g;
};

const drumTipper: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("drum_tipper");
  for (const sx of [-1, 1]) {
    g.add(at(P.box(0.1, h * 0.85, 0.1, yellow(), 0.01), sx * dx * 0.4, h * 0.425, -dy * 0.3));
    g.add(at(P.box(0.1, 0.1, dy * 0.8, yellow(), 0.01), sx * dx * 0.4, 0.05, 0));
  }
  g.add(at(P.box(dx * 0.9, 0.1, 0.1, yellow(), 0.01), 0, h * 0.82, -dy * 0.3));
  g.add(at(P.box(dx * 0.65, 0.06, dy * 0.6, steel(), 0.01), 0, h * 0.45, dy * 0.05));
  const box = P.box(0.9, 0.8, 0.9, M.paint("#f2f3f5", 0.7), 0.04);
  box.position.set(0, h * 0.45 + 0.45, dy * 0.05);
  g.add(box);
  g.add(at(P.frustum(0.12, 0.45, 0.7, steel()), 0, h * 0.45 + 0.5, dy * 0.05));
  return g;
};

// ------------------------------------------------------------------ bombas

const pump: PieceBuilder = () => pumpUnit(1.0, false);
const lobePump: PieceBuilder = () => pumpUnit(1.0, true);

// ------------------------------------------------------------------ pesaje, lavado, mesas y estantes

const floorScale: PieceBuilder = ([dx, dy]) => {
  const g = P.group("floor_scale");
  g.add(at(P.box(dx * 0.95, 0.08, dy * 0.95, M.paint("#b8bec4", 0.5), 0.01), 0, 0.06, 0));
  g.add(at(P.box(dx * 0.95, 0.025, dy * 0.95, M.paint("#2b3036", 0.7), 0.005), 0, 0.12, 0));
  g.add(at(P.cylinder(0.025, 0.025, 1.0, steel(), 10), dx * 0.45, 0, dy * 0.4));
  g.add(at(P.box(0.3, 0.2, 0.06, white(), 0.01), dx * 0.45, 1.05, dy * 0.4));
  g.add(at(P.box(0.24, 0.1, 0.01, M.emissive("#22e06b", 0.6), 0.002), dx * 0.45, 1.07, dy * 0.4 + 0.035));
  return g;
};

const benchScale: PieceBuilder = ([dx, dy]) => {
  const g = P.group("bench_scale");
  g.add(at(P.box(dx * 0.7, 0.04, dy * 0.7, steel(), 0.005), 0, 0.82, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.05, 0.8, 0.05, frame(), 0.003), sx * dx * 0.3, 0.4, sz * dy * 0.3));
  g.add(at(P.box(0.35, 0.05, 0.3, white(), 0.01), 0, 0.875, 0));
  g.add(at(P.box(0.28, 0.1, 0.02, white(), 0.005), 0, 0.97, -0.12));
  g.add(at(P.box(0.2, 0.05, 0.01, M.emissive("#22e06b", 0.6), 0.002), 0, 0.97, -0.108));
  return g;
};

const handwash: PieceBuilder = ([dx, dy]) => {
  const g = P.group("handwash_station");
  g.add(at(P.box(dx * 0.85, 0.9, dy * 0.6, steel(), 0.02), 0, 0.45, 0));
  g.add(at(P.box(dx * 0.75, 0.06, dy * 0.52, M.paint("#cfd6dc", 0.3), 0.02), 0, 0.92, 0));
  g.add(at(P.box(dx * 0.7, 0.4, 0.04, steel(), 0.005), 0, 1.15, -dy * 0.28));
  for (const sx of [-0.25, 0.25]) g.add(at(P.pipe([new THREE.Vector3(sx * dx, 0.92, -dy * 0.18), new THREE.Vector3(sx * dx, 1.15, -dy * 0.18), new THREE.Vector3(sx * dx, 1.15, -dy * 0.05)], 0.015, M.chrome()), 0, 0, 0));
  g.add(at(P.cylinder(0.08, 0.08, 0.3, M.paint("#2ecc71", 0.5), 16), dx * 0.3, 0.92, 0.1));
  g.add(at(P.box(0.4, 0.04, 0.4, M.paint("#2b3036", 0.7), 0.01), dx * 0.3, 0.02, dy * 0.45));
  return g;
};

const labBench: PieceBuilder = ([dx, dy]) => {
  const g = P.group("lab_bench");
  const top = P.box(dx, 0.05, dy, M.paint("#1d2228", 0.35), 0.01);
  top.position.y = 0.9;
  g.add(top);
  const n = Math.max(2, Math.round(dx / 1.2));
  for (let i = 0; i < n; i++) {
    const x = -dx / 2 + (i + 0.5) * (dx / n);
    g.add(at(P.box(dx / n - 0.04, 0.85, dy * 0.92, M.paint("#e3e6e9", 0.5), 0.01), x, 0.45, 0));
    g.add(at(P.box(0.03, 0.16, 0.02, dark(), 0.003), x + dx / n * 0.35, 0.65, dy * 0.47));
  }
  // equipos de ensayo: balanza, refractómetro, pH-metro, viscosímetro, frascos
  g.add(at(P.box(0.35, 0.1, 0.3, white(), 0.02), -dx * 0.35, 0.98, 0));
  g.add(at(P.box(0.22, 0.14, 0.12, M.paint("#2f5d8a", 0.4), 0.02), -dx * 0.15, 1.0, 0));
  g.add(at(P.cylinder(0.04, 0.04, 0.35, steel(), 12), dx * 0.05, 0.93, -0.2));
  g.add(at(P.box(0.3, 0.2, 0.25, white(), 0.02), dx * 0.2, 1.03, 0));
  for (let i = 0; i < 5; i++) g.add(at(P.cylinder(0.04, 0.04, 0.14, M.glass("#e8f0f6", 0.45), 12), dx * 0.35 + i * 0.1 - 0.15, 0.93, 0.15));
  g.add(at(P.box(dx * 0.8, 0.04, 0.3, M.paint("#cfd3d6", 0.5), 0.005), 0, 1.5, -dy * 0.4));
  for (const sx of [-1, 1]) g.add(at(P.box(0.03, 0.6, 0.3, frame(), 0.003), sx * dx * 0.4, 1.2, -dy * 0.4));
  return g;
};

const workbench: PieceBuilder = ([dx, dy]) => {
  const g = P.group("workbench");
  g.add(at(P.box(dx, 0.06, dy, M.paint("#8a6a43", 0.8), 0.01), 0, 0.9, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.08, 0.88, 0.08, M.paint("#3a4047", 0.5), 0.005), sx * (dx / 2 - 0.1), 0.44, sz * (dy / 2 - 0.1)));
  g.add(at(P.box(dx - 0.2, 0.03, dy - 0.2, M.paint("#3a4047", 0.5), 0.003), 0, 0.3, 0));
  g.add(at(P.box(0.4, 0.2, 0.3, M.paint("#c0392b", 0.4), 0.02), -dx * 0.3, 1.03, 0));
  g.add(at(P.box(0.25, 0.15, 0.15, steel(), 0.01), dx * 0.2, 1.0, 0));
  const vise = P.box(0.18, 0.14, 0.14, M.paint("#2f5d8a", 0.4), 0.01);
  vise.position.set(dx * 0.4, 1.0, dy * 0.35);
  g.add(vise);
  g.add(at(P.box(dx * 0.8, 0.9, 0.04, M.paint("#cfd3d6", 0.5), 0.005), 0, 1.45, -dy * 0.45));
  return g;
};

const shelving: PieceBuilder = ([dx, dy, h], params) => {
  const g = P.group("shelving");
  const levels = Math.max(3, Math.round(h / 0.7));
  const frameMat = M.paint("#2f5d8a", 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.05, h, 0.05, frameMat, 0.003), sx * (dx / 2 - 0.03), h / 2, sz * (dy / 2 - 0.03)));
  const boxMat = M.paint(String(params.allergen) === "huevo" ? "#e8d9a8" : "#b08a5a", 0.8);
  for (let l = 0; l < levels; l++) {
    const y = 0.2 + (l * (h - 0.3)) / levels;
    g.add(at(P.box(dx, 0.04, dy, M.paint("#b8bec4", 0.5), 0.005), 0, y, 0));
    for (let i = 0; i < Math.floor(dx / 0.6); i++) g.add(at(P.box(0.5, 0.4, dy * 0.8, boxMat, 0.02), -dx / 2 + 0.35 + i * 0.6, y + 0.22, 0));
  }
  return g;
};

// ------------------------------------------------------------------ empaque

const stretchWrapper: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("stretch_wrapper");
  g.add(at(P.box(dx * 0.4, 0.15, dy * 0.4, yellow(), 0.01), -dx * 0.1, 0.075, 0));
  g.add(at(P.cylinder(0.85, 0.85, 0.12, dark(), 40), -dx * 0.1, 0.15, 0));
  g.add(at(P.cylinder(0.9, 0.9, 0.04, yellow(), 40), -dx * 0.1, 0.27, 0));
  const pallet = P.palletLoad(4);
  pallet.position.set(-dx * 0.1, 0.3, 0);
  g.add(pallet);
  const wrap = P.cylinder(0.72, 0.72, 1.3, M.glass("#dff0ff", 0.12), 28);
  wrap.position.set(-dx * 0.1, 0.45, 0);
  g.add(wrap);
  g.add(at(P.box(0.25, h * 0.9, 0.3, white(), 0.02), dx * 0.38, h * 0.45, 0));
  g.add(at(P.box(0.3, 0.5, 0.3, yellow(), 0.02), dx * 0.3, h * 0.35, 0));
  g.add(at(P.cylinder(0.14, 0.14, 0.5, M.glass("#eef6ff", 0.3), 20), dx * 0.3, h * 0.35 + 0.0, 0.15));
  const cabinet = P.cabinet(0.5, 1.2, 0.3, "#cfd3d6");
  cabinet.position.set(dx * 0.4, 0, dy * 0.4);
  g.add(cabinet);
  return g;
};

const packingStation: PieceBuilder = ([dx, dy]) => {
  const g = P.group("packing_station");
  g.add(at(P.box(dx, 0.05, dy * 0.5, steel(), 0.01), 0, 0.85, -dy * 0.2));
  for (const sx of [-1, 1]) g.add(at(P.box(0.05, 0.83, dy * 0.45, frame(), 0.003), sx * (dx / 2 - 0.1), 0.42, -dy * 0.2));
  for (let i = 0; i < 6; i++) g.add(at(P.box(0.14, 0.16, 0.1, M.plastic("#e8e4da", 0.4), 0.02), -dx * 0.35 + i * 0.16, 0.95, -dy * 0.2));
  const carton = P.box(0.6, 0.3, 0.4, M.paint("#b08a5a", 0.8), 0.01);
  carton.position.set(dx * 0.25, 0.4, dy * 0.25);
  g.add(carton);
  const pallet = P.palletLoad(1);
  pallet.scale.setScalar(0.5);
  pallet.position.set(-dx * 0.3, 0, dy * 0.3);
  g.add(pallet);
  return g;
};

// ------------------------------------------------------------------ servicios

const airCompressor: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("air_compressor");
  g.add(at(P.box(dx * 0.5, h * 0.9, dy * 0.8, M.paint("#2f7d6b", 0.4), 0.04), -dx * 0.25, h * 0.45, 0));
  g.add(at(P.box(dx * 0.4, 0.1, dy * 0.7, M.paint("#1f2a30", 0.5), 0.02), -dx * 0.25, h * 0.9, 0));
  g.add(at(P.box(0.25, 0.16, 0.02, M.emissive("#3fd0ff", 0.5), 0.003), -dx * 0.25, h * 0.7, dy * 0.4 + 0.01));
  const r = Math.min(dx * 0.22, dy * 0.4);
  const tank = P.cylinder(r, r, h * 0.65, M.paint("#2f7d6b", 0.4), 32);
  tank.position.set(dx * 0.27, 0.2, 0);
  g.add(tank);
  g.add(at(P.dishedHead(r, M.paint("#2f7d6b", 0.4), false, 0.2), dx * 0.27, 0.2 + h * 0.65, 0));
  g.add(at(P.legs(3, r * 0.75, 0.2, 0.025, steel()), dx * 0.27, 0, 0));
  g.add(at(P.cylinderZ(0.05, 0.03, white(), 16), dx * 0.27 + r * 0.9, 0.2 + h * 0.5, 0));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.0, h * 0.8, 0), new THREE.Vector3(dx * 0.1, h * 0.8, 0), new THREE.Vector3(dx * 0.27, h * 0.8, 0)], 0.025, steel()), 0, 0, 0));
  return g;
};

const waterSoftener: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("water_softener");
  const r = Math.min(dx / 4, dy / 2) - 0.03;
  for (const sx of [-1, 1]) {
    const mat = M.paint("#2f5d8a", 0.4);
    g.add(at(P.cylinder(r, r, h * 0.8, mat, 32), sx * dx * 0.25, 0.1, 0));
    g.add(at(P.dishedHead(r, mat, false, 0.25), sx * dx * 0.25, 0.1 + h * 0.8, 0));
    g.add(at(P.box(0.2, 0.2, 0.2, white(), 0.02), sx * dx * 0.25, 0.1 + h * 0.8 + r * 0.45, 0));
    g.add(at(P.cylinder(r + 0.01, r + 0.01, 0.05, frame(), 24), sx * dx * 0.25, 0.1, 0));
  }
  g.add(at(P.cylinder(0.25, 0.25, 0.7, M.paint("#cfd3d6", 0.5), 24), 0, 0, dy * 0.3));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.25, h * 0.5, 0), new THREE.Vector3(0, h * 0.5, 0), new THREE.Vector3(dx * 0.25, h * 0.5, 0)], 0.035, steel()), 0, 0, 0));
  return g;
};

const reverseOsmosis: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("reverse_osmosis");
  g.add(at(P.box(dx * 0.95, 0.12, dy * 0.9, frame(), 0.01), 0, 0.06, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.05, h * 0.6, 0.05, frame(), 0.003), sx * dx * 0.46, h * 0.3 + 0.1, sz * dy * 0.4));
  for (let i = 0; i < 3; i++) {
    const m = P.cylinderX(0.1, dx * 0.7, M.paint("#e9ecef", 0.35), 24);
    m.position.set(-dx * 0.05, h * 0.5 + i * 0.28 - 0.2, -dy * 0.2);
    g.add(m);
    g.add(at(P.cylinderX(0.105, 0.04, M.paint("#2f5d8a", 0.4), 24), dx * 0.3, h * 0.5 + i * 0.28 - 0.2, -dy * 0.2));
    g.add(at(P.cylinderX(0.105, 0.04, M.paint("#2f5d8a", 0.4), 24), -dx * 0.4, h * 0.5 + i * 0.28 - 0.2, -dy * 0.2));
  }
  g.add(at(pumpUnit(0.9), -dx * 0.3, 0.12, dy * 0.25));
  const panel = P.cabinet(0.5, 1.2, 0.3, "#cfd3d6");
  panel.position.set(dx * 0.4, 0.12, dy * 0.3);
  g.add(panel);
  return g;
};

const chiller: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("chiller");
  g.add(at(P.box(dx * 0.95, h * 0.7, dy * 0.9, M.paint("#cfd6dc", 0.45), 0.04), 0, h * 0.35 + 0.1, 0));
  for (let i = 0; i < 3; i++) {
    const x = -dx * 0.3 + i * dx * 0.3;
    g.add(at(P.cylinder(0.5, 0.5, 0.05, dark(), 32), x, h * 0.7 + 0.12, 0));
    const fan = P.group("fan");
    for (let k = 0; k < 5; k++) {
      const blade = P.box(0.4, 0.015, 0.08, M.paint("#2b3036", 0.5), 0.003);
      blade.position.set(0.2, 0, 0);
      const arm = P.group();
      arm.add(blade);
      arm.rotation.y = (k / 5) * Math.PI * 2;
      fan.add(arm);
    }
    fan.position.set(x, h * 0.7 + 0.2, 0);
    g.add(fan);
  }
  g.add(at(P.box(0.4, h * 0.5, 0.02, M.paint("#9aa3ab", 0.5), 0.003), 0, h * 0.35 + 0.1, dy * 0.46));
  g.add(at(P.box(0.3, 0.2, 0.02, M.emissive("#3fd0ff", 0.4), 0.003), dx * 0.35, h * 0.5, dy * 0.46));
  return g;
};

const iceBank: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("ice_bank");
  g.add(at(P.box(dx * 0.95, h * 0.85, dy * 0.95, M.paint("#dfe6ec", 0.55), 0.05), 0, h * 0.425 + 0.1, 0));
  for (let i = 0; i < 4; i++) g.add(at(P.box(0.04, h * 0.85, dy * 0.97, M.paint("#c9d1d8", 0.5), 0.003), -dx * 0.35 + i * dx * 0.23, h * 0.425 + 0.1, 0));
  g.add(at(P.box(0.5, 0.06, 0.5, steel(), 0.01), dx * 0.3, h * 0.85 + 0.12, 0));
  g.add(at(P.cylinder(0.05, 0.05, 0.4, steel(), 12), -dx * 0.3, h * 0.85 + 0.1, 0));
  g.add(at(nozzle(0.04, 0.3, steel()), dx * 0.47, h * 0.4, dy * 0.2));
  return g;
};

const transformer: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("transformer");
  g.add(at(P.box(dx * 0.7, h * 0.65, dy * 0.7, M.paint("#6b7a86", 0.45), 0.05), 0, h * 0.325 + 0.15, 0));
  for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) g.add(at(P.box(0.03, h * 0.5, dy * 0.55, M.paint("#6b7a86", 0.45), 0.003), sx * (dx * 0.37 + 0.02), h * 0.33 + 0.15, -dy * 0.25 + i * (dy * 0.5 / 8)));
  for (let i = 0; i < 3; i++) {
    const x = -dx * 0.2 + i * dx * 0.2;
    g.add(at(P.cylinder(0.07, 0.05, 0.4, M.paint("#cfd6dc", 0.3), 16), x, h * 0.65 + 0.15, -dy * 0.15));
    g.add(at(P.cylinder(0.04, 0.04, 0.14, M.paint("#3a3d42", 0.5), 12), x, h * 0.65 + 0.55, -dy * 0.15));
    g.add(at(P.cylinder(0.045, 0.035, 0.3, M.paint("#cfd6dc", 0.3), 16), x, h * 0.65 + 0.15, dy * 0.15));
  }
  g.add(at(P.cylinderX(0.18, dx * 0.7, M.paint("#6b7a86", 0.45), 24), 0, h * 0.7 + 0.35, dy * 0.3));
  g.add(at(P.box(dx * 0.95, 0.12, dy * 0.95, M.paint("#8a9199", 0.7), 0.01), 0, 0.06, 0));
  return g;
};

const boiler: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("fire_tube_boiler");
  const r = Math.min(dy, h) * 0.38;
  const shellMat = M.paint("#7a2e2e", 0.45);
  g.add(at(P.box(dx * 0.85, 0.2, dy * 0.8, frame(), 0.01), 0, 0.1, 0));
  const shell = P.cylinderX(r, dx * 0.7, shellMat, 40);
  shell.position.set(0, 0.2 + r + 0.15, 0);
  g.add(shell);
  const insul = P.cylinderX(r + 0.04, dx * 0.62, M.insulationCladding(), 40);
  insul.position.set(0, 0.2 + r + 0.15, 0);
  g.add(insul);
  for (const sx of [-1, 1]) g.add(at(P.cylinderX(r + 0.02, 0.05, dark(), 40), sx * dx * 0.36, 0.2 + r + 0.15, 0));
  const burner = P.cylinderX(r * 0.5, dx * 0.2, M.paint("#2b3036", 0.5), 28);
  burner.position.set(-dx * 0.45, 0.2 + r + 0.15, 0);
  g.add(burner);
  g.add(at(P.box(0.35, 0.3, 0.3, M.paint("#c0392b", 0.4), 0.03), -dx * 0.45, 0.2 + r + 0.15 + r * 0.55, 0));
  const stack = P.cylinder(0.18, 0.2, h + 0.5, M.paint("#5b636b", 0.55), 24);
  stack.position.set(dx * 0.3, 0.2 + r * 1.6, 0);
  g.add(stack);
  for (let i = 0; i < 3; i++) g.add(at(P.cylinder(0.04, 0.04, 0.5, M.paint("#cfd3d6", 0.5), 12), dx * 0.1 + i * 0.2, 0.2 + 2 * r + 0.15, dy * 0.2));
  g.add(at(P.cylinderZ(0.08, 0.04, white(), 20), -dx * 0.1, 0.2 + 2 * r + 0.1, dy * 0.25));
  const panel = P.cabinet(0.6, 1.4, 0.3, "#cfd3d6");
  panel.position.set(-dx * 0.2, 0.2, dy * 0.4);
  g.add(panel);
  return g;
};

const wastewaterPlant: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("wastewater_plant");
  g.add(at(P.box(dx, 0.1, dy, M.paint("#9aa3ab", 0.8), 0.01), 0, 0.05, 0));
  const r = Math.min(dx * 0.17, dy * 0.4);
  const mat = M.paint("#2f5d8a", 0.45);
  for (let i = 0; i < 3; i++) {
    const x = -dx * 0.3 + i * dx * 0.3;
    g.add(at(P.cylinder(r, r, h * 0.7, mat, 40), x, 0.1, -dy * 0.15));
    g.add(at(P.dishedHead(r, mat, false, 0.12), x, 0.1 + h * 0.7, -dy * 0.15));
    g.add(at(P.ring(r + 0.03, 0.03, 0.05, steel()), x, h * 0.7 + 0.05, -dy * 0.15));
  }
  // flotación por aire disuelto (DAF): tanque rectangular con raspador y cinta
  g.add(at(P.box(dx * 0.35, h * 0.45, dy * 0.3, M.paint("#cfd6dc", 0.5), 0.03), dx * 0.25, h * 0.225 + 0.1, dy * 0.28));
  g.add(at(P.box(dx * 0.3, 0.05, 0.4, steel(), 0.01), dx * 0.25, h * 0.45 + 0.12, dy * 0.28));
  for (let i = 0; i < 2; i++) g.add(at(pumpUnit(0.9), -dx * 0.35 + i * 1.3, 0.1, dy * 0.35));
  g.add(at(P.pipe([new THREE.Vector3(-dx * 0.3, h * 0.35, dy * 0.0), new THREE.Vector3(dx * 0.3, h * 0.35, 0), new THREE.Vector3(dx * 0.3, h * 0.2, dy * 0.2)], 0.07, M.paint("#3a6b8a", 0.45)), 0, 0, 0));
  const panel = P.cabinet(0.8, 1.7, 0.4, "#cfd3d6");
  panel.position.set(dx * 0.45, 0.1, -dy * 0.35);
  g.add(panel);
  return g;
};

// ------------------------------------------------------------------ operaciones secundarias (plástico)

/** Tampografía: bastidor con cabezal de tampón, mesa de pieza y gabinete de tintas. */
const padPrinter: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("pad_printer");
  g.add(at(P.box(dx * 0.8, h * 0.5, dy * 0.8, M.paint("#2f5d8a", 0.4), 0.03), 0, h * 0.25, 0));
  g.add(at(P.box(dx * 0.5, 0.05, dy * 0.6, steel(), 0.01), 0, h * 0.52, 0));
  g.add(at(P.box(0.12, h * 0.4, 0.12, frame(), 0.01), -dx * 0.3, h * 0.72, 0));
  g.add(at(P.box(dx * 0.55, 0.1, 0.12, frame(), 0.01), -dx * 0.05, h * 0.92, 0));
  g.add(at(P.cylinder(0.09, 0.09, 0.14, M.paint("#e9ecef", 0.6), 16), dx * 0.2, h * 0.84, 0));
  g.add(at(P.box(0.3, 0.2, 0.02, M.emissive("#3fd0ff", 0.5), 0.003), dx * 0.2, h * 0.38, dy * 0.4 + 0.01));
  return g;
};

/** Etiquetadora: banda corta con cabezal dispensador y rollo de etiquetas. */
const labelerPiece: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("labeler");
  g.add(at(P.box(dx, 0.1, dy * 0.5, dark(), 0.01), 0, 0.8, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.box(0.06, 0.78, 0.06, frame(), 0.005), sx * (dx / 2 - 0.1), 0.39, sz * dy * 0.18));
  g.add(at(P.box(0.5, h * 0.55, 0.5, M.paint("#e9ecef", 0.4), 0.03), dx * 0.1, 0.85 + h * 0.275, -dy * 0.3));
  g.add(at(P.cylinder(0.2, 0.2, 0.06, M.paint("#f2b705", 0.5), 24), dx * 0.1, 0.85 + h * 0.4, -dy * 0.3 - 0.3));
  for (let i = 0; i < 4; i++) g.add(at(P.box(0.25, 0.14, 0.18, M.plastic("#e8e4da", 0.4), 0.02), -dx * 0.35 + i * 0.3, 0.93, 0));
  return g;
};

/** Estación de espumado de poliuretano: carrusel con moldes (fixtures), cabezal mezclador y tanques de poliol e isocianato. */
const foamingStation: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("pu_foaming_station");
  const r = Math.min(dx, dy) * 0.4;
  g.add(at(P.cylinder(r, r, 0.12, dark(), 36), -dx * 0.12, 0.3, 0));
  g.add(at(P.cylinder(0.12, 0.12, 0.6, frame(), 16), -dx * 0.12, 0.3, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const fx = -dx * 0.12 + Math.cos(a) * r * 0.62;
    const fz = Math.sin(a) * r * 0.62;
    g.add(at(P.box(r * 0.55, h * 0.4, r * 0.55, M.paint("#cfd3d6", 0.5), 0.02), fx, 0.36 + h * 0.2, fz));
  }
  g.add(at(P.box(0.3, 0.3, 0.3, yellow(), 0.02), -dx * 0.12, h * 0.85, 0));
  for (const sz of [-1, 1]) g.add(at(P.cylinder(0.3, 0.3, h * 0.6, M.paint(sz > 0 ? "#2f5d8a" : "#c0392b", 0.4), 24), dx * 0.38, h * 0.3, sz * dy * 0.25));
  return g;
};

export const processBuilders: Record<string, PieceBuilder> = {
  aircraft,
  baggage_cart_train: baggageCartTrain,
  storage_tank: storageTank,
  mixing_tank: mixingTank,
  jacketed_tank: jacketedTank,
  vacuum_emulsifier: emulsifier,
  colloid_mill: colloidMill,
  stone_mill: stoneMill,
  dosing_skid: dosingSkid,
  cip_skid: cipSkid,
  holding_tube: holdingTube,
  steam_pressure_station: steamStation,
  drum_tipper: drumTipper,
  pump,
  lobe_pump: lobePump,
  floor_scale: floorScale,
  bench_scale: benchScale,
  handwash_station: handwash,
  lab_bench: labBench,
  workbench,
  shelving,
  stretch_wrapper: stretchWrapper,
  packing_station: packingStation,
  air_compressor: airCompressor,
  water_softener: waterSoftener,
  reverse_osmosis: reverseOsmosis,
  chiller,
  ice_bank: iceBank,
  transformer,
  fire_tube_boiler: boiler,
  wastewater_plant: wastewaterPlant,
  pad_printer: padPrinter,
  labeler: labelerPiece,
  pu_foaming_station: foamingStation,
};

/** Construye la pieza de un tipo del plano; `null` si ese tipo aún no tiene forma propia. */
export function buildProcessPiece(type: string, footprint: Footprint, params: Record<string, unknown>): THREE.Object3D | null {
  const b = processBuilders[type];
  if (!b) return null;
  const root = P.group(type);
  return mount(root, b(footprint, params));
}
