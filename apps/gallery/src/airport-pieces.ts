/**
 * Piezas de la plataforma del aeropuerto (sistema de equipaje): avión de pasillo único y tren de carros de equipaje.
 * Son piezas de la escena: sin comportamiento, dimensionadas con la huella del plant.yaml (x = largo, y del plano =
 * z local, z = alto). Origen en el centro de la huella, en el piso. Formas genéricas, sin marcas.
 */
import * as THREE from "three";
import { materials as M, parts as P } from "@twin/3d";
import type { PieceBuilder } from "./process-pieces.ts";

/** Avión de pasillo único con la nariz hacia +X: fuselaje, alas en flecha, motores bajo las alas, empenaje y tren. */
export const aircraft: PieceBuilder = ([dx, dy, h]) => {
  const g = P.group("aircraft");
  const white = M.paint("#c4cad1", 0.55);
  const grey = M.paint("#8e98a2", 0.4);
  const belly = M.paint("#5d6d7e", 0.45);
  const len = dx * 0.92;
  const R = Math.max(1.2, dx * 0.052);
  const yc = R + 1.1;
  const body = P.cylinderX(R, len * 0.78, white, 40);
  body.position.set(-len * 0.02, yc, 0);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(1, 1.7, 1);
  nose.position.set(len * 0.37, yc, 0);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(R, len * 0.2, 32), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-len * 0.41 - len * 0.1 + 0.4, yc + R * 0.25, 0);
  tail.scale.set(1, 1, 0.9);
  g.add(tail);
  const stripe = P.cylinderX(R + 0.01, len * 0.78, belly, 40);
  stripe.scale.set(1, 0.18, 1.0);
  stripe.position.set(-len * 0.02, yc - R * 0.55, 0);
  g.add(stripe);
  // ventanillas de cabina y de pasajeros
  const glass = M.paint("#1b2733", 0.2);
  for (const sz of [-1, 1]) {
    const cockpit = P.box(0.9, 0.35, 0.05, glass, 0.03);
    cockpit.position.set(len * 0.4, yc + R * 0.45, sz * R * 0.72);
    cockpit.rotation.y = sz * 0.6;
    g.add(cockpit);
    const nWin = Math.floor(len * 0.6);
    for (let i = 0; i < nWin; i++) {
      const win = P.box(0.22, 0.3, 0.04, glass, 0.04);
      win.position.set(len * 0.3 - i * 0.95, yc + R * 0.3, sz * (R * 0.95));
      g.add(win);
    }
  }
  // alas en flecha
  const span = dy * 0.98;
  for (const sz of [-1, 1]) {
    const wing = P.box(dx * 0.17, 0.35, span / 2 - R * 0.6, white, 0.1);
    wing.position.set(-dx * 0.04, yc - R * 0.55, sz * (R * 0.6 + (span / 2 - R * 0.6) / 2));
    wing.rotation.y = sz * 0.42;
    wing.scale.set(1, 1, 1);
    g.add(wing);
    const tip = P.box(0.8, 1.6, 0.12, grey, 0.05);
    tip.position.set(-dx * 0.04 - Math.tan(0.42) * (span / 2) + 0.2, yc - R * 0.55 + 0.8, sz * (span / 2 - 0.3));
    g.add(tip);
    // motor
    const eng = P.cylinderX(R * 0.55, R * 2.0, grey, 32);
    const ez = sz * span * 0.17;
    eng.position.set(dx * 0.06 - Math.tan(0.42) * Math.abs(ez) * 0.3, yc - R * 1.05, ez);
    g.add(eng);
    const inlet = P.cylinderX(R * 0.45, 0.05, M.darkSteel(), 32);
    inlet.position.set(eng.position.x + R * 1.0, eng.position.y, ez);
    g.add(inlet);
    const pylon = P.box(R * 1.2, R * 0.5, 0.2, white, 0.05);
    pylon.position.set(eng.position.x - R * 0.2, yc - R * 0.65, ez);
    g.add(pylon);
    // estabilizador horizontal
    const stab = P.box(dx * 0.09, 0.2, dy * 0.18, white, 0.06);
    stab.position.set(-dx * 0.43, yc + R * 0.35, sz * (R * 0.3 + dy * 0.09));
    stab.rotation.y = sz * 0.5;
    g.add(stab);
  }
  // deriva
  const finH = Math.max(2, h - yc - R * 0.6);
  const fin = P.box(dx * 0.13, finH, 0.3, white, 0.08);
  fin.position.set(-dx * 0.42, yc + R * 0.5 + finH / 2, 0);
  fin.rotation.z = 0.5;
  g.add(fin);
  const finBand = P.box(dx * 0.1, finH * 0.35, 0.32, M.paint("#1f4e79", 0.4), 0.06);
  finBand.position.set(-dx * 0.44 - finH * 0.2, yc + R * 0.5 + finH * 0.7, 0);
  finBand.rotation.z = 0.5;
  g.add(finBand);
  // tren de aterrizaje
  const tire = M.rubber();
  const gear = (x: number, z: number, top: number) => {
    const strut = P.cylinder(0.08, 0.08, top - 0.4, M.chrome(), 12);
    strut.position.set(x, (top + 0.4) / 2, z);
    g.add(strut);
    for (const s of [-1, 1]) {
      const w = P.cylinderZ(0.42, 0.3, tire, 20);
      w.position.set(x, 0.42, z + s * 0.25);
      g.add(w);
    }
  };
  gear(len * 0.33, 0, yc - R);
  for (const sz of [-1, 1]) gear(-dx * 0.06, sz * R * 1.4, yc - R * 0.6);
  // puerta de bodega abierta (lado +Z, donde llegan los carros)
  const door = P.box(1.6, 1.2, 0.08, belly, 0.03);
  door.position.set(len * 0.15, yc - R * 0.2, R + 0.05);
  g.add(door);
  return g;
};

/** Tren de equipaje: tractor y carros con lona y maletas, hacia +X. */
export const baggageCartTrain: PieceBuilder = ([dx, dy], params) => {
  const g = P.group("baggage_cart_train");
  const carts = Math.max(1, Math.floor((dx - 3) / 3));
  const tug = P.group("tug");
  const body = P.box(2.4, 1.0, Math.min(1.6, dy - 0.2), M.paint(M.SAFETY_YELLOW, 0.45), 0.08);
  body.position.y = 0.8;
  tug.add(body);
  const cab = P.box(1.0, 0.9, Math.min(1.4, dy - 0.3), M.glass("#cfe6f5", 0.3), 0.05);
  cab.position.set(-0.4, 1.75, 0);
  tug.add(cab);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = P.cylinderZ(0.3, 0.22, M.rubber(), 18);
      w.position.set(sx * 0.8, 0.3, sz * 0.7);
      tug.add(w);
    }
  }
  tug.position.x = dx / 2 - 1.3;
  g.add(tug);
  const bags = P.bagInstances(carts * 6, 0.65);
  const m = new THREE.Matrix4();
  let k = 0;
  const loaded = params.loaded !== false;
  for (let i = 0; i < carts; i++) {
    const cx = dx / 2 - 3.3 - i * 3;
    const bed = P.box(2.6, 0.08, Math.min(1.5, dy - 0.3), M.paint("#59626c", 0.5), 0.02);
    bed.position.set(cx, 0.55, 0);
    g.add(bed);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = P.cylinderZ(0.2, 0.15, M.rubber(), 14);
        w.position.set(cx + sx * 1.0, 0.2, sz * 0.6);
        g.add(w);
        const post = P.box(0.05, 1.2, 0.05, M.galvanized(), 0.005);
        post.position.set(cx + sx * 1.25, 1.2, sz * 0.7);
        g.add(post);
      }
    }
    const roof = P.box(2.7, 0.05, Math.min(1.6, dy - 0.2), M.paint("#2f5f8f", 0.6), 0.02);
    roof.position.set(cx, 1.82, 0);
    g.add(roof);
    const bar = P.box(0.6, 0.05, 0.05, M.darkSteel(), 0.005);
    bar.position.set(cx + 1.6, 0.4, 0);
    g.add(bar);
    if (loaded) {
      for (let b = 0; b < 6; b++) {
        bags.setMatrixAt(k++, m.makeTranslation(cx - 0.8 + (b % 3) * 0.8, 0.6 + Math.floor(b / 3) * 0.24, 0));
      }
    }
  }
  bags.count = k;
  g.add(bags);
  return g;
};
