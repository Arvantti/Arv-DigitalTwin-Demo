/**
 * Geometría del chiller enfriado por aire: skid galvanizado, bahía de compresores con paneles de
 * malla, condensador en V con ventiladores en una o dos filas, evaporador aislado, bomba y tanque
 * del lazo, tablero y baliza. Con banco de hielo, tanque aislado con tapa en el extremo −X.
 * Largo ≈ 1,6 + capacidad/150 m; ancho 2,2 m desde 300 kW (dos filas de ventiladores), si no 1,2 m.
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

export default function build(params: Params): EquipmentModel {
  const cap = num(params, "capacity_kw", 600);
  const stages = Math.max(1, Math.round(num(params, "stages", 4)));
  const loopM3 = num(params, "loop_m3", 15);
  const storage = num(params, "storage_kwh", 0);
  const color = str(params, "body_color", "#d7dadd");
  const L = 1.6 + cap / 150;
  const W = cap >= 300 ? 2.2 : 1.2;
  const rows = W > 2 ? 2 : 1;
  const hBay = 1.15;
  const hCoil = 0.95;
  const H = 0.15 + hBay + hCoil;
  const root = P.group("chiller");
  const casing = M.paint(color, 0.45);
  const galv = M.galvanized();

  // skid
  for (const sz of [-1, 1]) {
    const rail = P.box(L + 0.1, 0.15, 0.12, galv, 0.01, "skid");
    rail.position.set(0, 0.075, sz * (W / 2 - 0.06));
    root.add(rail);
  }
  // bahía de compresores: postes, paneles de malla y compresores scroll
  const bay = P.group("compressors");
  const posts = Math.max(2, Math.ceil(L / 1.4) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -L / 2 + (L * i) / (posts - 1);
    for (const sz of [-1, 1]) {
      const post = P.box(0.06, hBay, 0.06, casing, 0.008);
      post.position.set(Math.max(-L / 2 + 0.03, Math.min(L / 2 - 0.03, x)), 0.15 + hBay / 2, sz * (W / 2 - 0.03));
      bay.add(post);
    }
  }
  const floor = P.box(L, 0.04, W, M.paint("#3b4650", 0.6), 0.005);
  floor.position.y = 0.17;
  bay.add(floor);
  const meshMat = new THREE.MeshStandardMaterial({ color: "#7d868e", metalness: 0.7, roughness: 0.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  for (const sz of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.08, hBay - 0.1), meshMat);
    panel.position.set(0, 0.15 + hBay / 2, sz * (W / 2 - 0.02));
    panel.renderOrder = 2;
    bay.add(panel);
  }
  const compMats: THREE.MeshStandardMaterial[] = [];
  const usable = L - 1.4;
  for (let i = 0; i < stages; i++) {
    const x = -L / 2 + 0.4 + (usable * (i + 0.5)) / stages;
    const z = rows > 1 ? (i % 2 === 0 ? -0.35 : 0.35) : 0;
    const shell = P.cylinder(0.17, 0.17, 0.62, M.paint("#2b2f35", 0.45), 28);
    shell.position.set(x, 0.19, z);
    bay.add(shell);
    const dome = P.dishedHead(0.17, M.paint("#2b2f35", 0.45), false, 0.35);
    dome.position.set(x, 0.81, z);
    bay.add(dome);
    const mat = M.emissive("#22e06b", 0);
    compMats.push(mat);
    const led = P.box(0.05, 0.03, 0.01, mat, 0.003);
    led.position.set(x, 0.6, z + 0.172);
    bay.add(led);
    bay.add(P.pipe([new THREE.Vector3(x, 0.95, z), new THREE.Vector3(x, 1.18, z), new THREE.Vector3(x + 0.3, 1.18, z)], 0.02, M.paint("#b87333", 0.35), 0.06));
  }
  root.add(bay);

  // condensador en V con aletas
  const coilMat = new THREE.MeshStandardMaterial({ color: "#6f7b84", metalness: 0.6, roughness: 0.55 });
  const coilLen = L - 0.1;
  const yCoil = 0.15 + hBay;
  const coils = P.group("condenser_coils");
  for (let r = 0; r < rows; r++) {
    const zc = rows > 1 ? (r === 0 ? -W / 4 : W / 4) : 0;
    for (const side of [-1, 1]) {
      const panel = P.box(coilLen, hCoil / Math.cos(0.32), 0.07, coilMat, 0.01);
      panel.rotation.x = side * 0.32;
      panel.position.set(0, yCoil + hCoil / 2, zc + side * (W / (rows * 2) - 0.18));
      coils.add(panel);
      const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, hCoil * 0.95, 0.075), M.aluminum(), Math.floor(coilLen / 0.05));
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.32, 0, 0));
      for (let i = 0; i < fins.count; i++) {
        m.compose(new THREE.Vector3(-coilLen / 2 + 0.025 + i * 0.05, yCoil + hCoil / 2, zc + side * (W / (rows * 2) - 0.18)), q, new THREE.Vector3(1, 1, 1));
        fins.setMatrixAt(i, m);
      }
      coils.add(fins);
    }
  }
  // tapa superior y ventiladores
  const deck = P.box(L, 0.05, W, casing, 0.01);
  deck.position.y = H - 0.02;
  coils.add(deck);
  for (const sx of [-1, 1]) {
    const endPanel = P.box(0.05, hCoil, W, casing, 0.008);
    endPanel.position.set((sx * L) / 2, yCoil + hCoil / 2, 0);
    coils.add(endPanel);
  }
  root.add(coils);
  const fans: THREE.Object3D[] = [];
  const perRow = Math.max(1, Math.floor((L - 0.2) / 1.05));
  const fanR = Math.min(0.42, (W / rows) * 0.4);
  for (let r = 0; r < rows; r++) {
    const zc = rows > 1 ? (r === 0 ? -W / 4 : W / 4) : 0;
    for (let i = 0; i < perRow; i++) {
      const x = -L / 2 + (L * (i + 0.5)) / perRow;
      const shroud = P.ring(fanR + 0.03, 0.03, 0.14, M.paint("#2b2f35", 0.5));
      shroud.position.set(x, H, zc);
      root.add(shroud);
      const rotor = P.group("fans");
      const hub = P.cylinder(0.07, 0.07, 0.06, M.paint("#2b2f35", 0.5), 20);
      rotor.add(hub);
      for (let b = 0; b < 5; b++) {
        const blade = P.box(fanR * 0.9, 0.012, 0.13, M.paint("#3a4048", 0.5), 0.004);
        blade.geometry.translate(fanR * 0.48, 0, 0);
        blade.rotation.set(0.25, (b / 5) * Math.PI * 2, 0);
        rotor.add(blade);
      }
      rotor.position.set(x, H + 0.04, zc);
      root.add(rotor);
      fans.push(rotor);
      const guard = P.ring(fanR + 0.02, 0.012, 0.012, M.darkSteel());
      guard.position.set(x, H + 0.13, zc);
      root.add(guard);
      for (const a of [0, Math.PI / 2]) {
        const bar = P.box(2 * fanR, 0.01, 0.012, M.darkSteel(), 0.002);
        bar.rotation.y = a;
        bar.position.set(x, H + 0.135, zc);
        root.add(bar);
      }
    }
  }

  // extremo +X: evaporador, bomba, tanque del lazo y tablero
  const evap = P.cylinderX(0.22, 1.1, M.paint("#1b1e22", 0.7), 32, "evaporator");
  evap.position.set(L / 2 - 0.75, 0.55, rows > 1 ? 0.45 : 0);
  root.add(evap);
  const tankR = Math.min(0.55, 0.3 + 0.02 * loopM3);
  const tankH = 1.5;
  const tank = P.group("tank");
  const tankBody = P.cylinder(tankR, tankR, tankH, M.insulationCladding(), 36);
  tankBody.position.y = 0.15;
  tank.add(tankBody);
  const tankTop = P.dishedHead(tankR, M.insulationCladding(), false, 0.2);
  tankTop.position.y = 0.15 + tankH;
  tank.add(tankTop);
  tank.add(P.legs(3, tankR * 0.7, 0.15, 0.03, galv));
  tank.position.set(L / 2 + tankR + 0.15, 0, -W / 2 + tankR + 0.1);
  root.add(tank);
  const pump = P.group("pump");
  const pmot = P.motor(Math.max(2, cap / 40), "#2f4f6f");
  pump.add(pmot);
  const pbody = P.cylinderZ(0.13, 0.12, M.paint("#1e5aa8", 0.4), 24);
  pbody.position.x = 0.35;
  pump.add(pbody);
  pump.position.set(L / 2 + 0.55, 0.2, W / 2 - 0.35);
  root.add(pump);
  // tuberías de suministro (azul que se vuelve rojo con el calor) y retorno
  const supplyMat = M.emissive("#2e7dff", 0.6);
  const supplyPipe = P.pipe([new THREE.Vector3(L / 2 - 0.2, 0.55, rows > 1 ? 0.45 : 0), new THREE.Vector3(L / 2 + 0.25, 0.55, W / 2 - 0.35), new THREE.Vector3(L / 2 + 0.4, 0.3, W / 2 - 0.35)], 0.06, M.insulationCladding(), 0.15);
  root.add(supplyPipe);
  const band = P.cylinder(0.075, 0.075, 0.06, supplyMat, 24);
  band.position.set(L / 2 + 0.4, 0.3, W / 2 - 0.35);
  root.add(band);
  const cab = P.cabinet(0.7, 1.2, 0.3, "#d4d8dc");
  cab.rotation.y = Math.PI / 2;
  cab.position.set(L / 2 + 0.17, 0.15, -0.1 + (rows > 1 ? 0 : 0.2));
  root.add(cab);
  const light = P.stackLight(0.25);
  light.object.position.set(L / 2 + 0.17, 1.35, -0.1 + (rows > 1 ? 0 : 0.2));
  root.add(light.object);
  const plate = P.nameplate([`CHILLER ${Math.round(cap)} kW`, `${stages} COMPRESORES · AIRE`], 0.5, 0.12);
  plate.position.set(-L / 4, 0.15 + hBay / 2, W / 2 + 0.002);
  root.add(plate);

  // banco de hielo
  let iceMat: THREE.MeshStandardMaterial | null = null;
  let iceX = 0;
  if (storage > 0) {
    const vol = (storage * 3600) / 334 / 900 + 1.5; // hielo + agua de circulación, m³
    const tw = Math.min(3, Math.max(1.4, Math.cbrt(vol) * 1.4));
    const th = Math.min(2.2, vol / (tw * tw * 0.6));
    const ice = P.group("ice_bank");
    const tankBox = P.box(tw, th, tw * 0.6, M.paint("#e6e8ea", 0.5), 0.03);
    tankBox.position.y = 0.1 + th / 2;
    ice.add(tankBox);
    const lid = P.box(tw + 0.05, 0.06, tw * 0.6 + 0.05, M.paint("#2f5d8a", 0.45), 0.01);
    lid.position.y = 0.1 + th + 0.03;
    ice.add(lid);
    iceMat = M.emissive("#9fe8ff", 1.5);
    const gauge = P.box(0.06, th * 0.8, 0.02, iceMat, 0.004);
    gauge.position.set(tw / 2 - 0.15, 0.1 + th * 0.1 + (th * 0.8) / 2, (tw * 0.6) / 2 + 0.012);
    ice.add(gauge);
    iceX = -L / 2 - 0.3 - tw / 2;
    ice.position.x = iceX;
    root.add(ice);
    root.add(P.pipe([new THREE.Vector3(iceX + tw / 2, 0.5, 0), new THREE.Vector3(-L / 2, 0.5, 0)], 0.05, M.insulationCladding(), 0.1));
    iceX -= tw / 2;
  }

  const blue = new THREE.Color("#2e7dff");
  const red = new THREE.Color("#ff3b30");
  function update(frame: AnimationFrame, dt: number): void {
    const spin = ch(frame, "fans") * 14 * dt;
    for (const f of fans) f.rotation.y += spin;
    const frac = ch(frame, "compressors");
    const on = Math.round(frac * stages);
    compMats.forEach((m, i) => (m.emissiveIntensity = i < on ? 3 : 0));
    supplyMat.emissive.copy(blue).lerp(red, ch(frame, "supply_heat"));
    if (iceMat) {
      iceMat.emissiveIntensity = 0.3 + 2 * ch(frame, "ice", 1);
    }
    light.set(ch(frame, "alarm_light", 1), performance.now() / 1000);
  }
  update({ channels: { fans: 0.7, compressors: 0.5, ice: 1 }, state: "running" }, 0);

  const minX = storage > 0 ? iceX : -L / 2 - 0.05;
  const maxX = L / 2 + 2 * tankR + 0.2;
  root.position.x = -(minX + maxX) / 2;
  const wrapper = P.group("chiller-root", root);
  return { root: wrapper, size: { dx: maxX - minX, dy: W + 0.4, height: H + 0.2 }, update, dispose: () => disposeObject(wrapper) };
}
