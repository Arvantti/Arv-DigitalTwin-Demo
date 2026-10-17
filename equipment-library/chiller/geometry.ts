/**
 * Geometría del enfriador de agua enfriado por aire: bastidor galvanizado, carcasa baja con
 * compresores tras una ventana de servicio, serpentines del condensador en V con los ventiladores
 * encima, evaporador aislado con las boquillas de agua (suministro azul, retorno gris) con válvula
 * y manómetro, gabinete eléctrico y baliza. Eje largo sobre +X; el operario mira a +Z.
 *
 * Proporciones de catálogo: largo ≈ 1,8 m + 7 mm por kW (600 kW → 6,0 × 2,5 × 2,5 m), un ventilador
 * por cada 1,25 m de largo y un compresor por etapa.
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function build(params: Params): EquipmentModel {
  const cap = num(params, "capacity_kw", 600);
  const stages = Math.round(num(params, "stages", 3));
  const supplyC = num(params, "supply_c", 12);
  const L = clamp(1.8 + cap * 0.007, 2.4, 14);
  const W = clamp(1.4 + cap * 0.0018, 1.4, 3);
  const caseH = 1.1;
  const coilH = clamp(0.8 + cap * 0.0006, 0.8, 1.6);
  const H = caseH + coilH + 0.15;
  const root = P.group("chiller");
  const body = M.paint("#d9dde1", 0.45);
  const trim = M.paint("#2f5f93", 0.4);
  const insul = M.insulationCladding();

  // bastidor
  const base = P.slab(L, 0.14, W * 0.9, M.galvanized(), 0.01, "skid");
  root.add(base);
  const casing = P.slab(L * 0.94, caseH - 0.14, W * 0.8, body, 0.02, "casing");
  casing.position.set(-0.04 * L, 0.14, 0);
  root.add(casing);
  const stripe = P.box(L * 0.94, 0.06, 0.004, trim, 0);
  stripe.position.set(-0.04 * L, caseH - 0.12, (W * 0.8) / 2 + 0.003);
  root.add(stripe);
  const casingX = -0.04 * L;
  const casingEnd = casingX + (L * 0.94) / 2;

  // paneles con rejilla y ventana de servicio con los compresores
  const panelN = Math.max(2, Math.round((L * 0.94) / 1.0));
  for (let i = 1; i < panelN; i++) {
    const seam = P.box(0.006, caseH - 0.3, 0.004, M.paint("#7d8287", 0.6), 0);
    seam.position.set(casingX - (L * 0.94) / 2 + ((L * 0.94) / panelN) * i, 0.14 + (caseH - 0.14) / 2, (W * 0.8) / 2 + 0.002);
    root.add(seam);
  }
  const winW = Math.min(2.2, L * 0.4);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.62), M.glass("#cfe6f5", 0.22));
  win.position.set(casingX - L * 0.05, 0.62, (W * 0.8) / 2 + 0.01);
  win.renderOrder = 2;
  root.add(win);
  const compressors = P.group("compressors");
  const stageLeds: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < stages; i++) {
    const x = casingX - L * 0.05 - winW / 2 + (winW / stages) * (i + 0.5);
    const shell = P.cylinderX(0.13, 0.5 * Math.min(1, winW / stages / 0.45), M.paint("#2f5f93", 0.35), 24);
    shell.position.set(x, 0.55, (W * 0.8) / 2 - 0.35);
    compressors.add(shell);
    const motor = P.box(0.22, 0.2, 0.22, M.paint("#3a4047", 0.4), 0.02);
    motor.position.set(x + 0.15, 0.6, (W * 0.8) / 2 - 0.35);
    compressors.add(motor);
    const led = M.emissive("#22e06b", 0.05);
    stageLeds.push(led);
    const l = P.box(0.05, 0.05, 0.01, led, 0.004);
    l.position.set(x, 0.98, (W * 0.8) / 2 + 0.006);
    root.add(l);
  }
  root.add(compressors);

  // serpentines del condensador en V
  const coilMat = M.paint("#7f878f", 0.55);
  const slatMat = M.paint("#4b5159", 0.6);
  const bankL = L * 0.9;
  const slatCount = Math.floor(bankL / 0.045);
  const banks = P.group("condenser_coils");
  for (const sz of [-1, 1]) {
    const bank = P.group();
    const frameB = P.box(bankL, coilH / Math.cos(0.42), 0.07, coilMat, 0.01);
    bank.add(frameB);
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, (coilH / Math.cos(0.42)) * 0.94, 0.012), slatMat, slatCount);
    const m = new THREE.Matrix4();
    for (let i = 0; i < slatCount; i++) slats.setMatrixAt(i, m.makeTranslation(-bankL / 2 + 0.03 + i * 0.045, 0, sz * 0.04));
    bank.add(slats);
    bank.position.set(casingX, caseH + coilH / 2, sz * (W * 0.8 * 0.3));
    bank.rotation.x = sz * 0.42;
    banks.add(bank);
  }
  root.add(banks);
  // cabeceras laterales que cierran la V
  for (const sx of [-1, 1]) {
    const cap_ = P.box(0.05, coilH, W * 0.8 * 0.6, body, 0.01);
    cap_.position.set(casingX + sx * (bankL / 2), caseH + coilH / 2, 0);
    root.add(cap_);
  }

  // ventiladores
  const fanN = Math.max(2, Math.round(L / 1.25));
  const fanR = clamp(W * 0.19, 0.3, 0.55);
  const fans: THREE.Group[] = [];
  const yFan = caseH + coilH + 0.02;
  for (let i = 0; i < fanN; i++) {
    const x = casingX - bankL / 2 + (bankL / fanN) * (i + 0.5);
    const shroud = P.ring(fanR, 0.03, 0.14, M.darkSteel());
    shroud.position.set(x, yFan, 0);
    root.add(shroud);
    const blades = P.group("fan");
    blades.position.set(x, yFan + 0.07, 0);
    const hub = P.cylinder(0.07, 0.07, 0.06, M.darkSteel(), 16);
    hub.position.y = -0.03;
    blades.add(hub);
    for (let b = 0; b < 5; b++) {
      const blade = P.box(fanR * 0.9, 0.012, 0.11, M.paint("#3a3d42", 0.5), 0.004);
      const a = (b / 5) * Math.PI * 2;
      blade.position.set(Math.cos(a) * fanR * 0.5, 0, Math.sin(a) * fanR * 0.5);
      blade.rotation.y = -a;
      blade.rotation.x = 0.25;
      blades.add(blade);
    }
    root.add(blades);
    fans.push(blades);
    // rejilla de protección
    for (let k = 0; k < 3; k++) {
      const wire = P.cylinder(fanR * (0.35 + k * 0.3), fanR * (0.35 + k * 0.3), 0.012, M.paint("#9aa0a6", 0.6), 32, undefined, true);
      wire.position.set(x, yFan + 0.15, 0);
      root.add(wire);
    }
  }

  // evaporador aislado que sale por el extremo +X, con boquillas de agua
  const evap = P.cylinderX(0.3, 1.1, insul, 32, "evaporator");
  evap.position.set(casingEnd + 0.1, 0.5, 0);
  root.add(evap);
  const evapCap = P.cylinderX(0.31, 0.04, M.paint("#3a4047", 0.45), 32);
  evapCap.position.set(casingEnd + 0.67, 0.5, 0);
  root.add(evapCap);
  for (const [name, dz, color] of [
    ["supply", -0.16, "#2f7fd9"],
    ["return", 0.16, "#8a9199"],
  ] as [string, number, string][]) {
    const pipeM = P.pipe(
      [new THREE.Vector3(casingEnd + 0.1, 0.78, dz), new THREE.Vector3(casingEnd + 0.1, 1.0, dz), new THREE.Vector3(casingEnd + 0.5, 1.0, dz * 2.2)],
      0.05,
      M.paint(color, 0.4),
      0.12,
      name,
    );
    root.add(pipeM);
    const flange = P.cylinder(0.085, 0.085, 0.03, M.galvanized(), 24);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(casingEnd + 0.5, 1.0, dz * 2.2);
    root.add(flange);
    const gauge = P.cylinderZ(0.045, 0.025, M.polishedSteel(), 20);
    gauge.position.set(casingEnd + 0.25, 1.1, dz * 2.2 + (dz > 0 ? 0.06 : -0.06));
    root.add(gauge);
  }
  // bomba y válvula de la línea de suministro, a modo de indicio del circuito
  const valve = P.butterflyValve(0.05);
  valve.position.set(casingEnd + 0.4, 1.0, -0.35);
  root.add(valve);

  // gabinete eléctrico en el extremo -X
  const cab = P.cabinet(Math.min(1.2, L * 0.3), 1.1, 0.4);
  cab.position.set(casingX - (L * 0.94) / 2 - 0.2, 0.14, 0);
  cab.rotation.y = -Math.PI / 2;
  root.add(cab);
  const plate = P.nameplate([`ENFRIADOR ${cap} KW`, `AGUA ${supplyC} °C`], 0.5, 0.12);
  plate.position.set(casingX + L * 0.28, 0.8, (W * 0.8) / 2 + 0.004);
  root.add(plate);
  const hmi = P.hmiPanel(0.5);
  hmi.object.position.set(casingX + L * 0.2, 0, (W * 0.8) / 2 + 0.5);
  hmi.object.scale.setScalar(0.85);
  root.add(hmi.object);
  const light = P.stackLight(0.3);
  light.object.position.set(casingEnd - 0.2, caseH - 0.02, (W * 0.8) / 2 - 0.1);
  root.add(light.object);

  let lastKey = "";
  function update(frame: AnimationFrame, dt = 0.016): void {
    const speed = ch(frame, "fan_speed");
    fans.forEach((f, i) => (f.rotation.y -= dt * speed * (10 + i * 0.3)));
    const on = Math.round(ch(frame, "stages_on"));
    stageLeds.forEach((m, i) => (m.emissiveIntensity = i < on ? 4 : 0.05));
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const supply = ch(frame, "supply_temp_c", supplyC);
    const ret = ch(frame, "return_temp_c", supplyC + 2);
    const key = `${frame.state}|${supply.toFixed(1)}|${ret.toFixed(1)}|${on}|${ch(frame, "load_pct").toFixed(2)}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "CHILLER",
        [
          ["Suministro", `${supply.toFixed(1)} °C`],
          ["Retorno", `${ret.toFixed(1)} °C`],
          ["Etapas", `${on} / ${stages}`],
          ["Carga", `${(ch(frame, "load_pct") * 100).toFixed(0)} %`],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ff6a3d",
      );
    }
  }
  update({ channels: { fan_speed: 0.5, stages_on: Math.min(stages, 2), supply_temp_c: supplyC, return_temp_c: supplyC + 1.7, load_pct: 0.6, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L + 1.2, dy: W, height: H + 0.5 }, update, dispose: () => disposeObject(root) };
}
