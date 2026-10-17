/**
 * Geometría del operario: figura de 7,5 cabezas (1,70 m por defecto) mirando hacia +X, con
 * piernas y brazos articulados en cadera y hombro. EPP según la planta:
 * - injection: casco (color por rol), gafas, overol azul con franjas reflectivas, botas negras.
 * - food: cofia, tapabocas, bata blanca hasta la rodilla, botas blancas.
 * Chaleco de alta visibilidad para montacarguista y supervisor; caja de herramientas del técnico;
 * tabla del inspector. El rumbo gira la figura sobre Y (plano +y = mundo −Z).
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

const HELMET: Record<string, string> = {
  operator: "#f2b705",
  technician: "#1e5aa8",
  inspector: "#2e9e4f",
  forklift_driver: "#ff7a1a",
  supervisor: "#f4f4f4",
};

function capsule(r: number, length: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, length - 2 * r), 6, 16);
  geo.translate(0, -length / 2, 0); // pivote en el extremo superior
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

export default function build(params: Params): EquipmentModel {
  const role = str(params, "role", "technician");
  const ppe = str(params, "ppe", "injection");
  const H = num(params, "height_m", 1.7);
  const k = H / 1.7;
  const food = ppe === "food";
  const root = P.group("operator");
  const body = P.group("body");
  root.add(body);
  body.scale.setScalar(k);

  const skin = M.plastic("#c69c7b", 0.6);
  const cloth = M.paint(food ? "#f2f2f0" : "#1f3a5f", 0.85);
  const bootMat = M.rubber();
  if (food) bootMat.color.set("#f0f0ee");
  const hipY = 0.88;
  const shoulderY = 1.4;

  // piernas: muslo, rodilla, pantorrilla y bota
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const thighL = 0.43;
  const shinL = hipY - thighL - 0.06;
  for (const sz of [-1, 1]) {
    const hip = P.group("legs");
    hip.position.set(0, hipY, sz * 0.095);
    hip.add(capsule(0.078, thighL + 0.04, cloth));
    const knee = P.group();
    knee.position.y = -thighL;
    knee.add(capsule(0.066, shinL + 0.03, cloth));
    const boot = P.box(0.27, 0.1, 0.115, bootMat, 0.035, "boots");
    boot.position.set(0.045, -shinL - 0.01, 0);
    knee.add(boot);
    hip.add(knee);
    body.add(hip);
    legs.push(hip);
    knees.push(knee);
  }
  // torso y cadera
  const pelvis = P.box(0.2, 0.16, 0.32, cloth, 0.05);
  pelvis.position.y = hipY + 0.04;
  body.add(pelvis);
  const torso = P.box(0.22, 0.52, 0.38, cloth, 0.07, "torso");
  torso.position.y = hipY + 0.32;
  body.add(torso);
  if (food) {
    // bata hasta la rodilla
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 20, 1, true), M.paint("#ffffff", 0.8));
    (coat.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    coat.scale.set(0.7, 1, 1);
    coat.position.y = hipY - 0.12;
    body.add(coat);
  } else {
    // franjas reflectivas del overol
    for (const y of [hipY + 0.22, hipY + 0.42]) {
      const stripe = P.box(0.225, 0.03, 0.385, M.emissive("#c8ccd0", 0.25), 0.01);
      stripe.position.y = y;
      body.add(stripe);
    }
  }
  if (role === "forklift_driver" || role === "supervisor") {
    const vest = P.box(0.235, 0.4, 0.395, M.paint("#d7ff1a", 0.6), 0.06, "vest");
    vest.position.y = hipY + 0.34;
    body.add(vest);
    for (const y of [hipY + 0.24, hipY + 0.42]) {
      const s = P.box(0.24, 0.025, 0.4, M.emissive("#e8eaec", 0.4), 0.008);
      s.position.y = y;
      body.add(s);
    }
  }
  // brazos: hombro, codo y mano
  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  const glove = food ? M.plastic("#3b82f6", 0.4) : role === "technician" ? M.paint("#2a2d31", 0.8) : skin;
  for (const sz of [-1, 1]) {
    const sh = P.group("arms");
    sh.position.set(0, shoulderY, sz * 0.23);
    sh.add(capsule(0.055, 0.32, cloth));
    const elbow = P.group();
    elbow.position.y = -0.3;
    elbow.add(capsule(0.047, 0.28, cloth));
    const hand = P.mesh(new THREE.SphereGeometry(0.048, 16, 12), glove, "hands");
    hand.scale.set(0.8, 1.15, 0.7);
    hand.position.y = -0.31;
    elbow.add(hand);
    sh.add(elbow);
    body.add(sh);
    arms.push(sh);
    elbows.push(elbow);
  }
  const belt = P.box(0.215, 0.05, 0.33, M.paint("#2a2d31", 0.6), 0.02);
  belt.position.y = hipY + 0.08;
  if (!food) body.add(belt);
  // herramienta en la mano derecha
  if (role === "technician") {
    const box = P.box(0.32, 0.14, 0.12, M.paint("#c62828", 0.45), 0.015, "toolbox");
    box.position.set(0, -0.4, 0.02);
    elbows[1].add(box);
  } else if (role === "inspector") {
    const board = P.box(0.22, 0.3, 0.012, M.paint("#8d6e4f", 0.7), 0.004);
    board.rotation.z = 0.3;
    board.position.set(0.08, -0.25, 0.04);
    elbows[0].add(board);
  }
  // cuello y cabeza
  const neck = P.cylinder(0.045, 0.05, 0.08, skin, 16);
  neck.position.y = shoulderY + 0.04;
  body.add(neck);
  const head = P.mesh(new THREE.SphereGeometry(0.105, 24, 18), skin, "head");
  head.scale.set(1, 1.15, 0.92);
  head.position.y = shoulderY + 0.2;
  body.add(head);
  const headTop = shoulderY + 0.2 + 0.12;
  if (food) {
    const cap = P.mesh(new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.paint("#e3e6e9", 0.95), "helmet_or_cap");
    cap.scale.set(1, 0.75, 1);
    cap.position.y = headTop - 0.06;
    body.add(cap);
    const mask = P.box(0.03, 0.08, 0.15, M.paint("#e8f1f8", 0.9), 0.015, "glasses_or_mask");
    mask.position.set(0.095, shoulderY + 0.16, 0);
    body.add(mask);
  } else {
    const helmetMat = M.plastic(HELMET[role] ?? "#f2b705", 0.3);
    const shell = P.mesh(new THREE.SphereGeometry(0.128, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat, "helmet_or_cap");
    shell.scale.set(1.08, 0.9, 1);
    shell.position.y = headTop - 0.05;
    body.add(shell);
    const brim = P.cylinder(0.14, 0.14, 0.012, helmetMat, 28);
    brim.scale.set(1.15, 1, 1);
    brim.position.set(0.02, headTop - 0.055, 0);
    body.add(brim);
    const glasses = P.box(0.02, 0.035, 0.17, M.glass("#2b3a44", 0.6), 0.01, "glasses_or_mask");
    glasses.position.set(0.1, shoulderY + 0.22, 0);
    body.add(glasses);
  }

  let swingNow = 0;
  function update(frame: AnimationFrame, dt: number): void {
    const pose = ch(frame, "pose");
    const cycle = ch(frame, "walk_cycle");
    const walking = pose > 0.5 && pose < 1.5;
    const working = pose >= 1.5;
    const target = walking ? Math.sin(cycle * Math.PI * 2) * 0.45 : 0;
    swingNow += (target - swingNow) * Math.min(1, dt * 12 || 1);
    legs[0].rotation.z = swingNow;
    legs[1].rotation.z = -swingNow;
    // la rodilla se dobla cuando la pierna va hacia atrás
    knees[0].rotation.z = -Math.max(0, -swingNow) * 1.2 - (walking ? 0.08 : 0);
    knees[1].rotation.z = -Math.max(0, swingNow) * 1.2 - (walking ? 0.08 : 0);
    if (working) {
      // brazos al frente con los codos doblados, como sobre un HMI o un tablero
      arms[0].rotation.z = 0.55;
      arms[1].rotation.z = role === "technician" ? 0.25 : 0.55;
      elbows[0].rotation.z = 1.1;
      elbows[1].rotation.z = role === "technician" ? 0.3 : 1.1;
      body.position.y = 0;
    } else {
      arms[0].rotation.z = -swingNow * 0.7;
      arms[1].rotation.z = swingNow * 0.7;
      elbows[0].rotation.z = elbows[1].rotation.z = walking ? 0.25 : 0.08;
      body.position.y = walking ? Math.abs(Math.sin(cycle * Math.PI * 2)) * 0.02 : 0;
    }
    root.rotation.y = ch(frame, "heading");
  }
  update({ channels: { pose: 0 }, state: "idle" }, 0);

  return { root, size: { dx: 0.4 * k, dy: 0.55 * k, height: H }, update, dispose: () => disposeObject(root) };
}
