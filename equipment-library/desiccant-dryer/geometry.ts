/**
 * Geometría del secador desecante de tolva: tolva cilíndrica aislada con fondo cónico sobre patas,
 * mirilla con el nivel de resina, cargador de vacío en la tapa con su manguera, unidad de proceso
 * (soplador, calentador y dos torres de tamiz molecular) con la tubería de aire hacia la tolva,
 * gabinete con pantalla (rocío y temperatura) y baliza. Eje largo sobre +X; el operario mira a +Z.
 *
 * Proporciones de catálogo: el volumen de la tolva sale de throughput × residencia a 550 kg/m³;
 * cilindro de 2,2 × radio de alto y cono de 1,2 × radio (misma fórmula que usa el comportamiento).
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

const BULK_KG_M3 = 550;

/** Radio de la tolva (m) para un volumen dado: V = π r² (2,2 r) + ⅓ π r² (1,2 r) = 8,17 r³. */
export function hopperRadius(throughputKgH: number, residenceH: number): number {
  return Math.cbrt((throughputKgH * residenceH) / BULK_KG_M3 / 8.17);
}

export default function build(params: Params): EquipmentModel {
  const throughput = num(params, "throughput_kg_h", 150);
  const residence = num(params, "residence_h", 4);
  const material = str(params, "material", "ABS");
  const R = Math.max(0.3, hopperRadius(throughput, residence));
  const cylH = 2.2 * R;
  const coneH = 1.2 * R;
  const legH = 0.65;
  const unitL = 1.1;
  const L = 2 * R + 0.25 + unitL;
  const W = Math.max(1.3, 2 * R + 0.4);
  const xHop = -L / 2 + R + 0.05;
  const xUnit = L / 2 - unitL / 2;
  const H = legH + coneH + cylH + 0.35;
  const root = P.group("desiccant-dryer");
  const clad = M.insulationCladding();
  const steel = M.stainless();
  const paint = M.paint("#cfd3d6", 0.45);
  const blue = M.paint("#2f5f93", 0.4);

  // bastidor
  const skid = P.slab(L, 0.1, W, M.galvanized(), 0.01, "skid");
  root.add(skid);

  // tolva: patas, cono, cilindro aislado y tapa
  const hopper = P.group("hopper");
  hopper.position.set(xHop, 0, 0);
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const leg = P.box(0.07, legH + 0.1, 0.07, M.paint("#3a4047", 0.5), 0.008);
    leg.position.set(Math.cos(a) * R * 0.92, (legH + 0.1) / 2, Math.sin(a) * R * 0.92);
    hopper.add(leg);
  }
  const cone = P.cylinder(R, 0.1, coneH, clad, 48, "cone");
  cone.position.y = legH;
  hopper.add(cone);
  const spout = P.cylinder(0.1, 0.1, 0.18, steel, 24);
  spout.position.y = legH - 0.18;
  hopper.add(spout);
  const gate = P.box(0.26, 0.05, 0.12, M.paint("#f2b705", 0.45), 0.008);
  gate.position.set(0.1, legH - 0.1, 0);
  hopper.add(gate);
  const body = P.cylinder(R, R, cylH, clad, 48, "insulation");
  body.position.y = legH + coneH;
  hopper.add(body);
  for (const k of [0.25, 0.5, 0.75]) {
    const band = P.cylinder(R + 0.008, R + 0.008, 0.03, steel, 48);
    band.position.y = legH + coneH + cylH * k;
    hopper.add(band);
  }
  const lid = P.cylinder(R * 0.9, R, 0.1, steel, 48);
  lid.position.y = legH + coneH + cylH;
  hopper.add(lid);

  // mirilla con el nivel de resina (frente, +Z)
  const winH = cylH * 0.8;
  const yWin = legH + coneH + cylH * 0.1;
  const frame = P.box(0.16, winH + 0.04, 0.03, M.darkSteel(), 0.006);
  frame.position.set(0, yWin + winH / 2, R + 0.012);
  hopper.add(frame);
  const resinMat = new THREE.MeshStandardMaterial({ color: "#d9a441", roughness: 0.7 });
  const resin = P.box(0.12, winH, 0.01, resinMat, 0);
  resin.geometry.translate(0, winH / 2, 0);
  resin.position.set(0, yWin, R + 0.03);
  hopper.add(resin);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.13, winH), M.glass("#e6f2ff", 0.18));
  pane.position.set(0, yWin + winH / 2, R + 0.038);
  hopper.add(pane);
  // lámpara de humedad (verde seca, roja húmeda)
  const lampMat = M.emissive("#22e06b", 2);
  const lamp = P.cylinderZ(0.035, 0.03, lampMat, 20);
  lamp.position.set(0.22, yWin + winH * 0.92, R + 0.02);
  hopper.add(lamp);

  // cargador de vacío en la tapa y manguera
  const yTop = legH + coneH + cylH + 0.1;
  const loader = P.cylinder(0.14, 0.14, 0.34, steel, 32, "loader");
  loader.position.set(-R * 0.3, yTop, 0);
  hopper.add(loader);
  const loaderMotor = P.cylinder(0.1, 0.1, 0.16, M.paint("#2f4f6f", 0.35), 24);
  loaderMotor.position.set(-R * 0.3, yTop + 0.34, 0);
  hopper.add(loaderMotor);
  const hoseMat = M.rubber();
  const hose = P.pipe(
    [new THREE.Vector3(-R * 0.3 - 0.14, yTop + 0.2, 0), new THREE.Vector3(-R - 0.35, yTop + 0.2, 0), new THREE.Vector3(-R - 0.35, 0.6, 0.1)],
    0.025,
    hoseMat,
    0.12,
    "hose",
  );
  hopper.add(hose);
  const loadMat = M.emissive("#3fd0ff", 0.05);
  const loadLamp = P.cylinder(0.03, 0.03, 0.04, loadMat, 16);
  loadLamp.position.set(-R * 0.3, yTop + 0.52, 0);
  hopper.add(loadLamp);
  root.add(hopper);

  // unidad de proceso: gabinete, torres de desecante y soplador
  const unit = P.group("process_unit");
  unit.position.set(xUnit, 0.1, 0);
  const cabH = 1.0;
  const cab = P.slab(unitL, cabH, W * 0.8, paint, 0.02, "cabinet");
  unit.add(cab);
  for (let i = 0; i < 5; i++) {
    const v = P.box(0.3, 0.012, 0.006, M.paint("#9aa0a6", 0.6), 0.002);
    v.position.set(-unitL * 0.25, 0.12 + i * 0.03, (W * 0.8) / 2 + 0.003);
    unit.add(v);
  }
  const towerR = 0.2;
  const towerH = 1.2;
  const towers: THREE.Mesh[] = [];
  const towerMats = [0, 1].map(() => (steel as THREE.MeshPhysicalMaterial).clone()); // propios: una torre se calienta al regenerar
  for (const [i, sz] of [-1, 1].entries()) {
    const t = P.cylinder(towerR, towerR, towerH, towerMats[i], 32, "tower");
    t.position.set(unitL * 0.18, cabH, sz * (W * 0.8 * 0.25));
    unit.add(t);
    const capT = P.dishedHead(towerR, steel);
    capT.position.set(unitL * 0.18, cabH + towerH, sz * (W * 0.8 * 0.25));
    unit.add(capT);
    towers.push(t);
  }
  const blower = P.cylinder(0.17, 0.17, 0.25, blue, 28, "blower");
  blower.position.set(-unitL * 0.25, cabH, -W * 0.8 * 0.2);
  unit.add(blower);
  const bmotor = P.motor(1.5, "#2f4f6f");
  bmotor.position.set(-unitL * 0.25, cabH + 0.12, -W * 0.8 * 0.2 - 0.32);
  bmotor.rotation.y = Math.PI / 2;
  unit.add(bmotor);
  root.add(unit);

  // tuberías de aire de proceso entre la unidad y la tolva (retorno y suministro)
  const pipeMat = M.paint("#aeb5bb", 0.4);
  const yA = 0.9;
  const supply = P.pipe(
    [new THREE.Vector3(xUnit - unitL / 2, 1.0 + 0.1, 0.35), new THREE.Vector3(xHop + R + 0.1, 1.1, 0.35), new THREE.Vector3(xHop + R * 0.2, yA, 0.2)],
    0.045,
    pipeMat,
    0.15,
    "air_supply",
  );
  root.add(supply);
  const ret = P.pipe(
    [new THREE.Vector3(xHop + R * 0.2, legH + coneH + cylH * 0.85, 0), new THREE.Vector3(xHop + R + 0.2, legH + coneH + cylH * 0.85, -0.2), new THREE.Vector3(xUnit - unitL / 2 + 0.1, 1.3, -0.3)],
    0.045,
    pipeMat,
    0.15,
    "air_return",
  );
  root.add(ret);

  // pantalla del secador sobre el gabinete (rocío, temperatura, humedad) y baliza
  const hmi = P.hmiPanel(0.35);
  hmi.object.position.set(xUnit - unitL * 0.1, 1.1, (W * 0.8) / 2 - 0.05);
  hmi.object.scale.setScalar(0.8);
  root.add(hmi.object);
  const plate = P.nameplate([`SECADOR · ${material.toUpperCase()}`, `${throughput} KG/H`], 0.34, 0.1);
  plate.position.set(xUnit - unitL * 0.3, 0.75, (W * 0.8) / 2 + 0.114);
  root.add(plate);
  const light = P.stackLight(0.3);
  light.object.position.set(xUnit + unitL * 0.4, 1.1, (W * 0.8) / 2 - 0.08);
  root.add(light.object);

  const hmiFrame = (frame: AnimationFrame) => {
    const v = frame.variables ?? {};
    const dew = ch(frame, "dew_point_c", -40);
    const temp = ch(frame, "air_temp_c", 80);
    const dry = ch(frame, "dry_ok", 1) > 0.5;
    hmi.draw(
      frame.label ?? "SECADOR",
      [
        ["Rocío", `${dew.toFixed(0)} °C`],
        ["Aire", `${temp.toFixed(0)} °C`],
        ["Humedad", v.resin_moisture_pct == null ? "—" : `${Number(v.resin_moisture_pct).toFixed(3)} %`],
      ],
      frame.state === "running" ? (dry ? "RESINA SECA" : "RESINA HÚMEDA") : frame.state.toUpperCase(),
      dry ? "#22e06b" : "#ff6a3d",
    );
  };

  let last = "";
  function update(frame: AnimationFrame): void {
    const level = Math.max(0, Math.min(1, ch(frame, "hopper_level", 1)));
    resin.scale.y = Math.max(0.001, level);
    const dry = ch(frame, "dry_ok", 1) > 0.5;
    lampMat.emissive.set(dry ? "#22e06b" : "#ff2a2a");
    loadMat.emissiveIntensity = ch(frame, "loading") > 0.5 ? 5 : 0.05;
    const hot = Math.max(0, Math.min(1, (ch(frame, "air_temp_c", 25) - 25) / 55));
    // la torre en regeneración se ve caliente; alternan cada pocos segundos
    const regen = Math.floor(performance.now() / 4000) % 2;
    towerMats.forEach((m, i) => {
      m.emissive.set("#ff5a1a");
      m.emissiveIntensity = ch(frame, "heater_duty") * hot * (regen === i ? 0.5 : 0.05);
    });
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const key = `${frame.state}|${Math.round(ch(frame, "dew_point_c", -40))}|${Math.round(ch(frame, "air_temp_c", 80))}|${dry}|${frame.variables?.resin_moisture_pct ?? ""}`;
    if (key !== last) {
      last = key;
      hmiFrame(frame);
    }
  }
  update({ channels: { hopper_level: 0.85, air_temp_c: 80, dew_point_c: -40, dry_ok: 1, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: H + 0.6 }, update: (f) => update(f), dispose: () => disposeObject(root) };
}
