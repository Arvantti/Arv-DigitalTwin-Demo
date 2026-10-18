/**
 * Geometría paramétrica de la isla de check-in. Los mostradores van en fila sobre X (uno cada counter_pitch_m).
 * Hacia -Z queda el área de fila de los pasajeros (queue_depth_m de fondo, con postes y cintas); hacia +Z el
 * agente, el panel de fondo con el número de cada mostrador y las bandas de inyección que llevan la maleta hasta
 * el borde +Z, donde pasa la colectora (fuera de esta pieza).
 *
 * Relaciones: largo = mostradores × paso + 1 m de remates; fondo = 3 m (mostrador, agente e inyección) + fila.
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

const MAX_QUEUE_FIGURES = 28;
const SHIRTS = ["#3d5a80", "#c44536", "#5b8e7d", "#d9a441", "#6d597a", "#2b2d42", "#8d99ae", "#bc6c25"];
const SKINS = ["#c99a76", "#8d5a3b", "#e0b896", "#a8774f"];

export default function build(params: Params): EquipmentModel {
  const n = Math.max(1, Math.round(num(params, "counters", 8)));
  const pitch = num(params, "counter_pitch_m", 3.5);
  const queueDepth = num(params, "queue_depth_m", 8);
  const deskColor = str(params, "desk_color", "#2f5f8f");
  const DX = n * pitch + 1.0;
  const DZ = 3.0 + queueDepth;
  const root = P.group("checkin-island");
  const zEdge = DZ / 2; // borde de la colectora
  const zDesk = zEdge - 2.4;
  const zWall = zEdge - 1.1;
  const x0 = -DX / 2 + 0.5;

  const deskFront = M.paint(deskColor, 0.45);
  const top = M.paint("#e9e6df", 0.3);
  const steel = M.stainless();

  // panel de fondo elevado (las bandas pasan por debajo) con postes
  const wall = P.box(DX, 1.4, 0.12, M.paint("#f2f3f4", 0.5), 0.02, "signage");
  wall.position.set(0, 1.85, zWall);
  root.add(wall);
  const band = P.box(DX, 0.28, 0.13, deskFront, 0.01);
  band.position.set(0, 2.42, zWall);
  root.add(band);
  for (let i = 0; i <= n; i++) {
    const post = P.box(0.12, 1.15, 0.12, steel, 0.01);
    post.position.set(x0 + i * pitch, 0.575, zWall);
    root.add(post);
  }

  const passengers: THREE.Object3D[] = [];
  const bagSpots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * pitch;
    // mostrador
    const desk = P.box(1.6, 1.05, 0.7, deskFront, 0.03, "counters");
    desk.position.set(cx - 0.45, 0.525, zDesk);
    root.add(desk);
    const deskTop = P.box(1.7, 0.04, 0.8, top, 0.01);
    deskTop.position.set(cx - 0.45, 1.07, zDesk);
    root.add(deskTop);
    const screen = P.box(0.5, 0.32, 0.03, M.darkSteel(), 0.01, "monitors");
    screen.position.set(cx - 0.45, 1.3, zDesk + 0.15);
    root.add(screen);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), M.emissive("#5fb4ff", 0.6));
    glow.position.set(cx - 0.45, 1.3, zDesk + 0.17);
    root.add(glow);
    // báscula (banda de pesaje) junto al mostrador, del lado del pasajero
    const scale = P.box(0.95, 0.28, 0.85, M.paint("#4a5058", 0.5), 0.02, "weigh_belts");
    scale.position.set(cx + 0.9, 0.14, zDesk);
    root.add(scale);
    const scaleBelt = P.box(0.9, 0.02, 0.8, M.rubber(), 0.005);
    scaleBelt.position.set(cx + 0.9, 0.29, zDesk);
    root.add(scaleBelt);
    // banda de inyección hasta la colectora
    const injLen = zEdge - zDesk - 0.4;
    const inj = P.box(0.8, 0.06, injLen, M.rubber(), 0.01, "injection_belts");
    inj.position.set(cx + 0.9, 0.55, zDesk + 0.4 + injLen / 2);
    root.add(inj);
    for (const sx of [-1, 1]) {
      const rail = P.box(0.04, 0.12, injLen, steel, 0.005);
      rail.position.set(cx + 0.9 + sx * 0.42, 0.6, zDesk + 0.4 + injLen / 2);
      root.add(rail);
      const leg = P.box(0.05, 0.52, 0.05, steel, 0.005);
      leg.position.set(cx + 0.9 + sx * 0.38, 0.26, zEdge - 0.3);
      root.add(leg);
    }
    // número del mostrador
    const sign = P.nameplate([`${i + 1}`], 0.5, 0.36, "#1d2a3a", "#ffffff");
    sign.position.set(cx - 0.45, 1.95, zWall - 0.065);
    sign.rotation.y = Math.PI;
    root.add(sign);
    // agente detrás del mostrador, mirando a la fila
    const agent = P.operator("#2f5f8f", "#ffffff", { civilian: true, skin: SKINS[i % SKINS.length] });
    agent.object.position.set(cx - 0.45, 0, zDesk + 0.75);
    agent.object.rotation.y = Math.PI;
    agent.object.name = "agents";
    root.add(agent.object);
    // pasajero frente al mostrador (visible si el mostrador atiende)
    const pax = P.operator("#000000", SHIRTS[i % SHIRTS.length], { civilian: true, skin: SKINS[(i + 2) % SKINS.length], hair: "#3b2a20" });
    pax.object.position.set(cx + 0.2, 0, zDesk - 0.75);
    pax.object.name = "passengers";
    root.add(pax.object);
    passengers.push(pax.object);
    bagSpots.push(new THREE.Vector3(cx + 0.9, 0.3, zDesk));
  }

  // área de fila: carriles en serpentina con postes y cinta
  const zq0 = zDesk - 1.6;
  const zq1 = -DZ / 2 + 0.3;
  const lanes = Math.max(1, Math.floor((zq0 - zq1) / 1.2));
  const tape = M.paint("#1f3b73", 0.5);
  const postMat = M.chrome();
  const qx0 = -DX / 2 + 1.2;
  const qx1 = DX / 2 - 1.2;
  for (let l = 0; l <= lanes; l++) {
    const z = zq0 - l * 1.2;
    const nPosts = Math.max(2, Math.ceil((qx1 - qx0) / 2) + 1);
    for (let k = 0; k < nPosts; k++) {
      const x = qx0 + ((qx1 - qx0) * k) / (nPosts - 1);
      const post = P.cylinder(0.025, 0.025, 0.95, postMat, 10, "queue_stanchions");
      post.position.set(x, 0.475, z);
      root.add(post);
      const base = P.cylinder(0.15, 0.17, 0.03, postMat, 18);
      base.position.set(x, 0.015, z);
      root.add(base);
    }
    // la cinta deja abierta la vuelta de la serpentina, alternando el extremo
    const open = 1.4;
    const tx0 = l % 2 === 0 ? qx0 : qx0 + open;
    const tx1 = l % 2 === 0 ? qx1 - open : qx1;
    const t = P.box(tx1 - tx0, 0.05, 0.01, tape, 0.002);
    t.position.set((tx0 + tx1) / 2, 0.9, z);
    root.add(t);
  }
  // pasajeros en la fila, a lo largo de la serpentina (de la boca de la fila hacia atrás)
  const queueSpots: { x: number; z: number; yaw: number }[] = [];
  // la cabeza de la fila está en el extremo +X del carril 0 (la cinta queda abierta ahí hacia los mostradores);
  // cada carril se recorre en sentido contrario al anterior
  for (let l = 0; l < lanes; l++) {
    const z = zq0 - (l + 0.5) * 1.2;
    const forward = l % 2 === 0; // avanza hacia +X
    for (let k = 0; ; k++) {
      const x = forward ? qx1 - 0.4 - k * 0.75 : qx0 + 0.4 + k * 0.75;
      if (x < qx0 || x > qx1) break;
      queueSpots.push({ x, z, yaw: forward ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  const queueFigures: THREE.Object3D[] = [];
  for (let i = 0; i < Math.min(MAX_QUEUE_FIGURES, queueSpots.length); i++) {
    const sp = queueSpots[i];
    const fig = P.operator("#000000", SHIRTS[(i * 3 + 1) % SHIRTS.length], { civilian: true, skin: SKINS[i % SKINS.length], hair: i % 3 ? "#2a1d16" : "#6b4a2f" });
    fig.object.position.set(sp.x, 0, sp.z);
    fig.object.rotation.y = sp.yaw;
    fig.object.visible = false;
    fig.object.name = "passengers";
    root.add(fig.object);
    queueFigures.push(fig.object);
  }

  // maletas en las básculas
  const bags = P.bagInstances(n * 2, 0.7);
  root.add(bags);
  const m = new THREE.Matrix4();

  // baliza de la isla
  const light = P.stackLight(0.3);
  light.object.position.set(DX / 2 - 0.3, 2.56, zWall);
  root.add(light.object);

  let time = 0;
  function update(frame: AnimationFrame, dt: number): void {
    time += dt;
    const busy = Math.round(ch(frame, "counters_busy"));
    passengers.forEach((p, i) => (p.visible = i < busy));
    const q = Math.round(ch(frame, "queue_len"));
    queueFigures.forEach((f, i) => (f.visible = i < q));
    const waiting = Math.min(n * 2, Math.round(ch(frame, "bags_waiting")));
    let k = 0;
    for (let i = 0; i < waiting; i++) {
      const spot = bagSpots[i % n];
      const layer = Math.floor(i / n);
      m.makeRotationY(0.1 * ((i % 3) - 1));
      m.setPosition(spot.x, spot.y + layer * 0.25, spot.z);
      bags.setMatrixAt(k++, m);
    }
    bags.count = k;
    bags.instanceMatrix.needsUpdate = true;
    light.set(ch(frame, "stack_light"), time);
  }
  update({ channels: { counters_busy: Math.ceil(n / 2), queue_len: 10, bags_waiting: 2, stack_light: 1 }, state: "running" }, 0);

  return {
    root,
    size: { dx: DX, dy: DZ, height: 2.6 },
    update: (frame, dt) => update(frame, dt),
    dispose: () => disposeObject(root),
  };
}
