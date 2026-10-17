/**
 * Geometría del secador desecante: tolva aislada con cono de 60° sobre bastidor, cargador al
 * vacío arriba, mirilla de nivel, caja de descarga con compuerta, gabinete del secador con dos
 * torres de desecante, soplador, mangueras de aire de proceso y retorno, HMI y baliza.
 * Tolva: V = throughput × residencia / densidad aparente; cilindro de 1,3 D y cono de 0,87 D,
 * V ≈ 1,25 D³. Gabinete hacia +X; operador hacia +Z.
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
  const thr = num(params, "throughput_kg_h", 150);
  const res = num(params, "residence_h", 3);
  const rho = num(params, "bulk_density_kg_l", 0.6);
  const heaterKw = num(params, "heater_kw", 12);
  const color = str(params, "body_color", "#2f5d8a");
  const material = str(params, "material", "ABS");
  const V = (thr * res) / (rho * 1000);
  const D = Math.max(0.45, Math.cbrt(V / 1.25));
  const R = D / 2;
  const hCyl = 1.3 * D;
  const hCone = 0.87 * D;
  const yOut = 0.55; // salida del cono
  const yCyl = yOut + hCone;
  const yTop = yCyl + hCyl;
  const root = P.group("desiccant-dryer");
  const steel = M.stainless();
  const clad = M.insulationCladding();
  const frameMat = M.paint("#2a2d31", 0.55);

  // ---------------------------------------------------------------- tolva
  const hopperX = -0.15 - 0.1 * D;
  const hopper = P.group("hopper");
  const shell = P.cylinder(R + 0.03, R + 0.03, hCyl, clad, 48, "hopper");
  shell.position.y = yCyl;
  hopper.add(shell);
  for (const f of [0.02, 0.5, 0.98]) {
    const band = P.cylinder(R + 0.037, R + 0.037, 0.03, M.polishedSteel(), 48);
    band.position.y = yCyl + hCyl * f - 0.015;
    hopper.add(band);
  }
  const cone = P.frustum(0.08, R + 0.03, hCone, steel, "cone");
  cone.position.y = yOut;
  hopper.add(cone);
  const lid = P.dishedHead(R + 0.03, clad, false, 0.2);
  lid.position.y = yTop;
  hopper.add(lid);
  // mirilla vertical con barra de nivel
  const glassH = hCyl * 0.8;
  const glassStrip = P.box(0.07, glassH, 0.02, M.glass("#ffffff", 0.3), 0.008);
  glassStrip.position.set(0, yCyl + hCyl * 0.1 + glassH / 2, R + 0.045);
  hopper.add(glassStrip);
  const pelletMat = M.plastic(material === "ABS" ? "#e8dcc0" : material === "PS" ? "#f1f1ee" : "#d9d4c8", 0.6);
  const levelBar = P.box(0.05, 1, 0.012, pelletMat, 0.002);
  hopper.add(levelBar);
  const sightFrame = P.box(0.1, glassH + 0.04, 0.012, M.polishedSteel(), 0.004);
  sightFrame.position.set(0, yCyl + hCyl * 0.1 + glassH / 2, R + 0.034);
  hopper.add(sightFrame);
  // caja de descarga con compuerta y tubo al manifold
  const drawOff = P.box(0.22, 0.2, 0.22, steel, 0.01, "outlet");
  drawOff.position.set(0, yOut - 0.2, 0);
  hopper.add(drawOff);
  const gate = P.box(0.3, 0.025, 0.06, M.paint(M.SAFETY_YELLOW, 0.45), 0.004);
  gate.position.set(0.12, yOut - 0.1, 0.12);
  hopper.add(gate);
  hopper.add(P.pipe([new THREE.Vector3(0, yOut - 0.2, 0), new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, 0.22, -0.6)], 0.035, M.polishedSteel(), 0.12));
  hopper.position.x = hopperX;
  root.add(hopper);

  // bastidor de cuatro patas con riostras
  const legH = yCyl + 0.1;
  const legOff = R * 0.82;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = P.box(0.06, legH, 0.06, frameMat, 0.006);
      leg.geometry.translate(0, legH / 2, 0);
      leg.position.set(hopperX + sx * legOff, 0, sz * legOff);
      root.add(leg);
      const foot = P.box(0.14, 0.012, 0.14, frameMat, 0.003);
      foot.position.set(hopperX + sx * legOff, 0, sz * legOff);
      root.add(foot);
    }
    const brace = P.box(0.04, 0.04, 2 * legOff, frameMat, 0.004);
    brace.position.set(hopperX + sx * legOff, 0.35, 0);
    root.add(brace);
    const ring = P.box(2 * legOff + 0.06, 0.06, 0.05, frameMat, 0.004);
    ring.position.set(hopperX, yCyl, sx * legOff);
    root.add(ring);
  }

  // cargador al vacío sobre la tolva
  const loaderG = P.group("loader");
  const recR = Math.min(0.22, R * 0.45);
  const receiver = P.cylinder(recR, recR, 0.38, steel, 32);
  receiver.position.y = 0.12;
  loaderG.add(receiver);
  const recCone = P.frustum(0.06, recR, 0.14, steel);
  loaderG.add(recCone);
  const recLid = P.cylinder(recR + 0.02, recR + 0.02, 0.06, M.paint("#2a2d31", 0.5), 32);
  recLid.position.y = 0.5;
  loaderG.add(recLid);
  const loaderLampMat = M.emissive("#3fd0ff", 0);
  const loaderLamp = P.cylinder(0.025, 0.025, 0.03, loaderLampMat, 16);
  loaderLamp.position.y = 0.56;
  loaderG.add(loaderLamp);
  loaderG.position.set(hopperX, yTop + D * 0.1, 0);
  root.add(loaderG);
  // manguera de vacío y de material desde el piso (central de materiales)
  const hoseMat = M.plastic("#cfd8dc", 0.45);
  root.add(P.pipe([new THREE.Vector3(hopperX + recR, yTop + D * 0.1 + 0.3, 0), new THREE.Vector3(hopperX + recR + 0.25, yTop + D * 0.1 + 0.3, 0), new THREE.Vector3(hopperX + recR + 0.25, yTop + D * 0.1 + 0.3, -R - 0.25), new THREE.Vector3(hopperX + recR + 0.25, 0.3, -R - 0.25)], 0.03, hoseMat, 0.15));

  // ---------------------------------------------------------------- gabinete del secador
  const cabW = 0.6 + 0.012 * heaterKw;
  const cabD = 0.75;
  const cabH = 1.55;
  const cabX = hopperX + R + 0.35 + cabW / 2;
  const cab = P.group("dryer_cabinet");
  const body = P.box(cabW, cabH, cabD, M.paint(color, 0.4), 0.025);
  body.position.y = 0.08 + cabH / 2;
  cab.add(body);
  const plinth = P.box(cabW + 0.04, 0.08, cabD + 0.04, frameMat, 0.01);
  plinth.position.y = 0.04;
  cab.add(plinth);
  // puertas y rejillas en el frente (+Z)
  for (const sx of [-1, 1]) {
    const seam = P.box(0.006, cabH - 0.1, 0.004, M.paint("#1b2733", 0.6), 0);
    seam.position.set((sx * cabW) / 6, 0.08 + cabH / 2, cabD / 2 + 0.002);
    cab.add(seam);
  }
  for (let i = 0; i < 6; i++) {
    const louver = P.box(cabW * 0.5, 0.012, 0.012, M.paint("#1b2733", 0.6), 0.002);
    louver.position.set(0, 0.2 + i * 0.045, cabD / 2 + 0.006);
    cab.add(louver);
  }
  // ventana del calentador
  const heaterMat = M.emissive("#ff6a1a", 0);
  const heaterWin = P.box(0.14, 0.05, 0.01, heaterMat, 0.003);
  heaterWin.position.set(-cabW * 0.25, 0.62, cabD / 2 + 0.006);
  cab.add(heaterWin);
  // indicador de punto de rocío
  const dewMat = M.emissive("#22e06b", 2.5);
  const dewLamp = P.cylinderZ(0.045, 0.02, dewMat, 24);
  dewLamp.position.set(cabW * 0.3, 0.95, cabD / 2 + 0.01);
  cab.add(dewLamp);
  const dewBezel = P.ring(0.055, 0.012, 0.025, M.polishedSteel());
  dewBezel.rotation.x = Math.PI / 2;
  dewBezel.position.set(cabW * 0.3, 0.95, cabD / 2 + 0.01);
  cab.add(dewBezel);
  // dos torres de desecante sobre el gabinete, atrás
  const towerMats: THREE.MeshStandardMaterial[] = [];
  for (const [i, sx] of [-1, 1].entries()) {
    const tower = P.cylinder(0.11, 0.11, 0.55, M.paint("#9aa3ab", 0.5), 32, "towers");
    tower.position.set((sx * cabW) / 4, 0.08 + cabH, -cabD / 4);
    cab.add(tower);
    const cap = P.dishedHead(0.11, M.paint("#9aa3ab", 0.5), false, 0.3);
    cap.position.set((sx * cabW) / 4, 0.08 + cabH + 0.55, -cabD / 4);
    cab.add(cap);
    const mat = M.emissive(i === 0 ? "#22e06b" : "#ffb000", 2);
    towerMats.push(mat);
    const band = P.cylinder(0.115, 0.115, 0.03, mat, 32);
    band.position.set((sx * cabW) / 4, 0.08 + cabH + 0.4, -cabD / 4);
    cab.add(band);
  }
  // soplador lateral
  const blower = P.group("blower");
  const volute = P.cylinderZ(0.16, 0.12, M.paint("#2a2d31", 0.5), 32);
  blower.add(volute);
  const mot = P.motor(1.5 + heaterKw * 0.1, "#2f4f6f");
  mot.rotation.y = Math.PI / 2;
  mot.position.z = -0.2;
  blower.add(mot);
  blower.position.set(cabW / 2 + 0.12, 0.35, 0);
  cab.add(blower);
  const hmi = P.hmiPanel(0.0);
  hmi.object.position.set(0, 1.12, cabD / 2 + 0.01);
  cab.add(hmi.object);
  const light = P.stackLight(0.22);
  light.object.position.set(cabW / 2 - 0.08, 0.08 + cabH, cabD / 2 - 0.08);
  cab.add(light.object);
  const plate = P.nameplate([`SECADOR DESECANTE ${Math.round(thr)} kg/h`, `${material} · TOLVA ${Math.round(V * 1000)} L`], 0.36, 0.08);
  plate.position.set(-cabW * 0.08, 0.76, cabD / 2 + 0.008);
  cab.add(plate);
  cab.position.x = cabX;
  root.add(cab);

  // mangueras: aire seco caliente a la entrada del cono, retorno desde la tapa
  root.add(P.pipe([new THREE.Vector3(cabX - cabW / 2, 0.9, 0.15), new THREE.Vector3(hopperX + R + 0.15, 0.9, 0.15), new THREE.Vector3(hopperX + R + 0.15, yCyl + 0.1, 0.15), new THREE.Vector3(hopperX + R * 0.9, yCyl + 0.1, 0.15)], 0.05, clad, 0.15));
  root.add(P.pipe([new THREE.Vector3(hopperX + R * 0.4, yTop + 0.05, -R * 0.5), new THREE.Vector3(hopperX + R * 0.4, yTop + 0.3, -R * 0.5), new THREE.Vector3(cabX - cabW * 0.3, yTop + 0.3, -R * 0.5), new THREE.Vector3(cabX - cabW * 0.3, 0.08 + cabH, -R * 0.5)], 0.045, M.rubber(), 0.18));

  const green = new THREE.Color("#22e06b");
  const red = new THREE.Color("#ff3b30");
  const amber = new THREE.Color("#ffb000");
  let hmiTimer = 0;
  function update(frame: AnimationFrame, dt: number): void {
    const level = Math.max(0, Math.min(1, ch(frame, "level", 0.9)));
    const filled = Math.max(0.01, glassH * Math.min(1, Math.max(0, (level * (hCyl + hCone) - hCone - hCyl * 0.1) / glassH)));
    levelBar.scale.y = filled;
    levelBar.position.set(0, yCyl + hCyl * 0.1 + filled / 2, R + 0.04);
    loaderLampMat.emissiveIntensity = ch(frame, "loader") > 0.5 ? 3 : 0.2;
    heaterMat.emissiveIntensity = 3 * ch(frame, "heater_glow");
    const dew = ch(frame, "dew_indicator", 0.25);
    dewMat.emissive.copy(green).lerp(red, Math.max(0, Math.min(1, (dew - 0.25) / 0.5)));
    const t = ch(frame, "tower");
    towerMats[0].emissive.copy(t < 0.5 ? green : amber);
    towerMats[1].emissive.copy(t < 0.5 ? amber : green);
    light.set(ch(frame, "alarm_light", 1), performance.now() / 1000);
    hmiTimer -= dt;
    if (hmiTimer <= 0) {
      hmiTimer = 0.5;
      const v = frame.variables ?? {};
      const f = (k: string, d = 0, u = "") => (typeof v[k] === "number" ? `${(v[k] as number).toFixed(d)} ${u}`.trim() : "—");
      hmi.draw(
        frame.label ?? "SECADOR",
        [
          ["Rocío", f("dew_point_c", 1, "°C")],
          ["Aire", f("process_air_c", 1, "°C")],
          ["Humedad", f("outlet_moisture_pct", 3, "%")],
          ["Tolva", f("hopper_level_pct", 0, "%")],
          ["Caudal", f("throughput_kg_h", 0, "kg/h")],
          ["Residencia", f("residence_h", 1, "h")],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: { level: 0.9, heater_glow: 1, dew_indicator: 0.25 }, state: "running" }, 0);

  const minX = hopperX - R - 0.06;
  const maxX = cabX + cabW / 2 + 0.3;
  root.position.x = -(minX + maxX) / 2; // centrar la huella
  const wrapper = P.group("desiccant-dryer-root", root);
  return {
    root: wrapper,
    size: { dx: maxX - minX, dy: Math.max(D + 0.2, cabD + 0.6), height: yTop + D * 0.1 + 0.6 },
    update,
    dispose: () => disposeObject(wrapper),
  };
}
