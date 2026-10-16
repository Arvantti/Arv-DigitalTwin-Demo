/**
 * Geometría de la caldera pirotubular: cuerpo cilíndrico horizontal sobre base, puerta frontal
 * con quemador y ventilador, chimenea desde la parte trasera, columna de nivel, manómetro,
 * válvulas de seguridad y principal, bomba de alimentación y tablero.
 * Tamaño escalado con la potencia: largo ≈ 3,2·(BHP/60)^0,33 m · diámetro ≈ 1,5·(BHP/60)^0,33 m.
 * Frente (quemador) hacia +X.
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
} from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const bhp = num(params, "rating_bhp", 60);
  const k = Math.cbrt(bhp / 60);
  const Ls = 3.2 * k;
  const Ds = 1.5 * k;
  const r = Ds / 2;
  const yAxis = 0.35 + r;
  const root = P.group("steam-boiler");
  const shellMat = M.paint("#8e1b1b", 0.45);

  // base y cunas
  const base = P.slab(Ls + 0.4, 0.2, Ds * 0.8, M.paint("#2a2d31", 0.6), 0.02, "base");
  root.add(base);
  for (const x of [-Ls * 0.35, Ls * 0.35]) {
    const saddle = P.box(0.25, 0.35, Ds * 0.85, M.paint("#2a2d31", 0.6), 0.02);
    saddle.position.set(x, 0.3, 0);
    root.add(saddle);
  }
  // cuerpo
  const shell = P.cylinderX(r, Ls, shellMat, 64, "shell");
  shell.position.set(0, yAxis, 0);
  root.add(shell);
  for (let i = 0; i <= 4; i++) {
    const band = P.cylinderX(r + 0.012, 0.05, M.polishedSteel(), 64);
    band.position.set(-Ls / 2 + (Ls * i) / 4, yAxis, 0);
    root.add(band);
  }
  // puertas delantera y trasera
  const front = P.cylinderX(r * 0.98, 0.18, M.paint("#2a2d31", 0.5), 64, "front_door");
  front.position.set(Ls / 2 + 0.09, yAxis, 0);
  root.add(front);
  const bolts = P.boltCircle(r * 0.88, 16, 0.02, 0.04);
  bolts.rotation.z = -Math.PI / 2;
  bolts.position.set(Ls / 2 + 0.18, yAxis, 0);
  root.add(bolts);
  const rear = P.cylinderX(r * 0.98, 0.12, M.paint("#2a2d31", 0.5), 64);
  rear.position.set(-Ls / 2 - 0.06, yAxis, 0);
  root.add(rear);

  // quemador con ventilador y mirilla de llama
  const burner = P.group("burner");
  const housing = P.box(0.6, 0.7 * k, 0.6 * k, M.paint("#c62828", 0.35), 0.05);
  burner.add(housing);
  const blower = P.cylinderX(0.22 * k, 0.25, M.paint("#2a2d31", 0.5), 32, "blower");
  blower.position.set(0.15, -0.38 * k, 0);
  burner.add(blower);
  const mot = P.motor(7.5 * k, "#2f4f6f");
  mot.position.set(0.45, -0.38 * k, 0);
  burner.add(mot);
  const flameMat = M.emissive("#ff7a1a", 0);
  const peep = P.cylinderZ(0.05, 0.04, flameMat, 24);
  peep.position.set(0.0, 0.1, 0.3 * k + 0.02);
  burner.add(peep);
  burner.position.set(Ls / 2 + 0.5, yAxis, 0);
  root.add(burner);
  // tren de gas
  root.add(P.pipe([new THREE.Vector3(Ls / 2 + 0.5, yAxis + 0.35 * k, 0), new THREE.Vector3(Ls / 2 + 0.5, yAxis + r + 0.4, 0), new THREE.Vector3(Ls / 2 + 0.5, yAxis + r + 0.4, -Ds)], 0.035, M.paint("#f2b705", 0.4), 0.1));

  // chimenea desde la caja de humos trasera
  const stackH = 6.0;
  const stack = P.group("stack");
  const smokebox = P.box(0.6, 0.6, 0.6, M.paint("#2a2d31", 0.5), 0.03);
  smokebox.position.set(-Ls / 2 + 0.1, yAxis + r + 0.15, 0);
  stack.add(smokebox);
  const chimney = P.cylinder(0.2 * k, 0.2 * k, stackH - (yAxis + r + 0.45), M.galvanized(), 32);
  const outletMat = M.emissive("#ff8a3d", 0);
  const outlet = P.ring(0.2 * k, 0.03, 0.02, outletMat);
  outlet.position.set(-Ls / 2 + 0.1, stackH - 0.02, 0);
  stack.add(outlet);
  chimney.position.set(-Ls / 2 + 0.1, yAxis + r + 0.45, 0);
  stack.add(chimney);
  const cap = P.frustum(0.32 * k, 0.05, 0.25, M.galvanized());
  cap.position.set(-Ls / 2 + 0.1, stackH + 0.1, 0);
  stack.add(cap);
  root.add(stack);

  // columna de nivel con mirilla
  const column = P.group("water_column");
  column.add(P.cylinder(0.05, 0.05, 0.7, M.polishedSteel(), 16));
  const glassTube = P.cylinder(0.025, 0.025, 0.45, M.glass("#ffffff", 0.35), 12);
  glassTube.position.set(0, 0.12, 0.07);
  column.add(glassTube);
  const levelMat = M.emissive("#3fd0ff", 1.2);
  const levelBar = P.cylinder(0.018, 0.018, 1, levelMat, 12);
  levelBar.position.set(0, 0.12, 0.07);
  column.add(levelBar);
  column.position.set(Ls / 2 - 0.4, yAxis - 0.1, r + 0.12);
  root.add(column);

  // manómetro, válvulas de seguridad y válvula principal
  const gaugeG = P.group("gauges");
  const dial = P.cylinderZ(0.11, 0.04, M.paint("#f2f2f2", 0.3), 32);
  gaugeG.add(dial);
  const needle = P.box(0.09, 0.008, 0.005, M.paint("#c62828", 0.4), 0);
  needle.geometry.translate(0.04, 0, 0);
  needle.position.z = 0.025;
  gaugeG.add(needle);
  gaugeG.position.set(Ls / 2 - 0.4, yAxis + r * 0.75, r * 0.7 + 0.08);
  root.add(gaugeG);
  for (const x of [-0.3, 0.1]) {
    const sv = P.cylinder(0.06, 0.05, 0.3, M.paint("#f2b705", 0.4), 16, "safety_valves");
    sv.position.set(x, yAxis + r, 0);
    root.add(sv);
  }
  const mainValve = P.group("main_valve");
  mainValve.add(P.box(0.22, 0.18, 0.22, M.darkSteel(), 0.02));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 8, 24), M.paint("#c62828", 0.4));
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = 0.25;
  mainValve.add(wheel);
  mainValve.position.set(Ls * 0.25, yAxis + r + 0.09, 0);
  root.add(mainValve);
  root.add(P.pipe([new THREE.Vector3(Ls * 0.25, yAxis + r + 0.2, 0), new THREE.Vector3(Ls * 0.25, yAxis + r + 0.7, 0), new THREE.Vector3(Ls * 0.25, yAxis + r + 0.7, -Ds * 0.9)], 0.06, M.insulationCladding(), 0.15));

  // bomba de alimentación y tablero
  const feed = P.group("feed_pump");
  const fm = P.motor(3, "#2f4f6f");
  feed.add(fm);
  const fp = P.cylinderZ(0.1, 0.08, M.paint("#1e5aa8", 0.4), 24);
  fp.position.x = 0.32;
  feed.add(fp);
  feed.position.set(-Ls * 0.15, 0.32, r + 0.45);
  root.add(feed);
  const cab = P.cabinet(0.8, 1.4, 0.35, "#d4d8dc");
  cab.position.set(Ls / 2 - 1.2, 0, -(r + 0.45));
  cab.rotation.y = Math.PI;
  root.add(cab);
  const light = P.stackLight(0.25);
  light.object.position.set(Ls / 2 - 1.2, 1.4, -(r + 0.45));
  root.add(light.object);
  const plate = P.nameplate([`CALDERA ${Math.round(bhp)} BHP`, "PIROTUBULAR · GAS"], 0.5, 0.14, "#11161c", "#e9edf1");
  plate.position.set(0, yAxis, r + 0.005);
  root.add(plate);

  function update(frame: AnimationFrame): void {
    const flame = ch(frame, "flame");
    flameMat.emissiveIntensity = flame > 0 ? 3 + 4 * flame * (0.85 + 0.15 * Math.sin(performance.now() / 70)) : 0;
    outletMat.emissiveIntensity = 1.5 * ch(frame, "stack");
    needle.rotation.z = Math.PI * 0.75 - ch(frame, "pressure_norm") * Math.PI * 1.5;
    const v = frame.variables ?? {};
    const level = typeof v.water_level_pct === "number" ? (v.water_level_pct as number) / 100 : 0.55;
    levelBar.scale.y = Math.max(0.02, 0.45 * level);
    levelBar.position.y = 0.12 - 0.225 + (0.45 * level) / 2;
    light.set(ch(frame, "alarm_light", 1), performance.now() / 1000);
  }
  update({ channels: { flame: 0.5, pressure_norm: 0.8 }, state: "running" });

  return {
    root,
    size: { dx: Ls + 1.4, dy: Ds + 1.0, height: stackH + 0.4 },
    update: (f) => update(f),
    dispose: () => disposeObject(root),
  };
}
