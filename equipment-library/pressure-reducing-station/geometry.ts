/**
 * Geometría de la estación reguladora: la línea de llegada entra por −X, una te la abre en dos ramas paralelas
 * a lo largo de X (rama A automática al frente, +Z; rama B manual atrás, −Z), cada una con válvula de corte de
 * compuerta con volante, PRV de cuerpo de globo con bonete de diafragma y otra válvula de corte, y otra te las une
 * hacia la salida en +X. La PRV automática lleva un actuador de consigna y un tablero con pantalla (presión del
 * punto crítico) y baliza; la manual, el piloto de resorte con su tubería de control. Manómetros a la entrada, a la
 * salida y aguas abajo de cada PRV; soportes al piso. Proporciones de catálogo para 4": separación de ramas ≈ 7
 * diámetros, eje del tubo a 0,55 m del piso.
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
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Manómetro de carátula mirando a +Z, con su toma hacia abajo; origen en la base de la toma. */
function gauge(r: number, stemH: number): { object: THREE.Group; set(f: number): void } {
  const g = P.group("gauge");
  const stem = P.cylinder(r * 0.14, r * 0.14, stemH, M.chrome(), 10);
  g.add(stem);
  const head = P.group();
  head.position.y = stemH + r;
  head.add(P.cylinderZ(r, r * 0.45, M.polishedSteel(), 28));
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 28), M.paint("#f4f4f0", 0.6));
  face.position.z = r * 0.23;
  head.add(face);
  const band = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.78, 20, 1, -Math.PI * 0.25, Math.PI * 0.25), M.paint("#c62828", 0.5));
  band.position.z = r * 0.235;
  head.add(band);
  const needle = P.box(r * 0.08, r * 0.75, r * 0.03, M.paint("#1b1e22", 0.4), 0);
  needle.geometry.translate(0, r * 0.32, 0);
  needle.position.z = r * 0.25;
  head.add(needle);
  g.add(head);
  return {
    object: g,
    set(f) {
      needle.rotation.z = Math.PI * 0.75 - clamp(f, 0, 1) * Math.PI * 1.5;
    },
  };
}

/** Brida en un tubo a lo largo de X, con pernos. */
function flange(r: number, mat: THREE.Material): THREE.Group {
  const g = P.group("flange");
  g.add(P.cylinderX(r * 1.75, r * 0.32, mat, 28));
  const bolts = P.boltCircle(r * 1.45, 8, r * 0.09, r * 0.46);
  bolts.rotation.z = Math.PI / 2;
  bolts.position.x = r * 0.23;
  g.add(bolts);
  return g;
}

/** Válvula de compuerta con volante, en un tubo a lo largo de X; origen en el eje. Devuelve el volante. */
function gateValve(r: number, color: string): { object: THREE.Group; wheel: THREE.Group; stem: THREE.Mesh } {
  const g = P.group("gate-valve");
  const mat = M.paint(color, 0.45);
  const body = P.cylinderX(r * 1.35, r * 2.0, mat, 28);
  g.add(body);
  for (const s of [-1, 1]) {
    const f = flange(r, mat);
    f.position.x = s * r * 1.1;
    g.add(f);
  }
  const bonnet = P.box(r * 1.6, r * 2.2, r * 1.0, mat, r * 0.2);
  bonnet.position.y = r * 1.6;
  g.add(bonnet);
  const stem = P.cylinder(r * 0.1, r * 0.1, r * 1.6, M.chrome(), 10);
  stem.position.y = r * 2.7;
  g.add(stem);
  const wheel = P.group("handwheel");
  const red = M.paint("#c62828", 0.45);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.1, 8, 32), red);
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  for (let i = 0; i < 3; i++) {
    const spoke = P.box(r * 2.2, r * 0.1, r * 0.12, red, r * 0.02);
    spoke.rotation.y = (i * Math.PI) / 3;
    wheel.add(spoke);
  }
  wheel.position.y = r * 3.4;
  g.add(wheel);
  return { object: g, wheel, stem };
}

/** PRV de cuerpo de globo con bonete de diafragma; origen en el eje, flujo a lo largo de X. */
function prvBody(r: number, color: string): { object: THREE.Group; topY: number; indicator: THREE.Mesh } {
  const g = P.group("prv");
  const mat = M.paint(color, 0.4);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 28, 18), mat);
  globe.scale.set(1.25, 1, 1);
  globe.castShadow = true;
  g.add(globe);
  g.add(P.cylinderX(r * 1.05, r * 4.4, mat, 24));
  for (const s of [-1, 1]) {
    const f = flange(r, mat);
    f.position.x = s * r * 2.2;
    g.add(f);
  }
  const cover = P.cylinder(r * 2.0, r * 2.0, r * 0.45, mat, 32);
  cover.position.y = r * 1.45;
  g.add(cover);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.scale.y = 0.45;
  dome.position.y = r * 1.9;
  g.add(dome);
  const bolts = P.boltCircle(r * 1.8, 12, r * 0.08, r * 0.55);
  bolts.position.y = r * 1.4;
  g.add(bolts);
  // indicador de posición: vástago de bronce dentro de un tubo de vidrio, sube con el caudal
  const glass = P.cylinder(r * 0.22, r * 0.22, r * 1.1, M.glass("#e8f1f5", 0.3), 16);
  glass.position.y = r * 2.75;
  g.add(glass);
  const indicator = P.cylinder(r * 0.1, r * 0.1, r * 0.9, M.paint("#c9a227", 0.35), 10);
  indicator.position.y = r * 2.75;
  g.add(indicator);
  return { object: g, topY: r * 3.85, indicator };
}

export default function build(params: Params): EquipmentModel {
  const dn = num(params, "diameter_in", 4);
  const setpoint = num(params, "critical_setpoint_mca", 20);
  const manualSetting = num(params, "manual_setting_mca", 26.66);
  const inletMca = num(params, "bench_inlet_mca", 79);

  const r = Math.max(0.02, (dn * 0.0254) / 2 + 0.006); // radio exterior del tubo
  const axisY = Math.max(0.55, r * 8);
  const dz = Math.max(0.4, r * 7); // media separación entre ramas
  const L = Math.max(2.6, r * 46);
  const xTeeIn = -L / 2 + r * 8;
  const xTeeOut = L / 2 - r * 8;
  const steel = M.paint("#5b6b7a", 0.5); // tubería de hierro dúctil pintada
  const root = P.group("pressure-reducing-station");

  // llegada, salida y colectores verticales de las tes
  const inLine = P.cylinderX(r, xTeeIn + L / 2, steel, 28);
  inLine.position.set((-L / 2 + xTeeIn) / 2, axisY, 0);
  root.add(inLine);
  const outLine = P.cylinderX(r, L / 2 - xTeeOut, steel, 28);
  outLine.position.set((xTeeOut + L / 2) / 2, axisY, 0);
  root.add(outLine);
  for (const x of [-L / 2 + 0.02, L / 2 - 0.02]) {
    const f = flange(r, steel);
    f.position.set(x, axisY, 0);
    root.add(f);
  }
  for (const x of [xTeeIn, xTeeOut]) {
    const header = P.cylinderZ(r, dz * 2 + r * 2, steel, 28);
    header.position.set(x, axisY, 0);
    root.add(header);
    for (const s of [-1, 1]) {
      const cap = P.cylinderZ(r * 1.12, r * 0.4, steel, 28);
      cap.position.set(x, axisY, s * (dz + r));
      root.add(cap);
    }
  }

  // ramas: corte, PRV, corte
  const xIso1 = xTeeIn + r * 5.5;
  const xIso2 = xTeeOut - r * 5.5;
  const xPrv = (xIso1 + xIso2) / 2;
  const branchMats: Record<string, string> = { a: "#2f6fb3", b: "#3f7f5f" };
  const wheels: Record<string, { wheel: THREE.Group; stem: THREE.Mesh }[]> = { a: [], b: [] };
  const indicators: Record<string, THREE.Mesh> = {};
  const branchGauges: Record<string, { set(f: number): void }> = {};
  for (const [tag, z] of [["a", dz], ["b", -dz]] as const) {
    const pipe = P.cylinderX(r, xTeeOut - xTeeIn, steel, 28);
    pipe.position.set((xTeeIn + xTeeOut) / 2, axisY, z);
    root.add(pipe);
    for (const x of [xIso1, xIso2]) {
      const v = gateValve(r, "#3a3d42");
      v.object.position.set(x, axisY, z);
      root.add(v.object);
      wheels[tag].push({ wheel: v.wheel, stem: v.stem });
    }
    const prv = prvBody(r, branchMats[tag]);
    prv.object.position.set(xPrv, axisY, z);
    root.add(prv.object);
    indicators[tag] = prv.indicator;
    const g = gauge(Math.max(0.05, r * 0.9), r * 1.6);
    g.object.position.set(xPrv + r * 4.2, axisY + r * 0.9, z);
    root.add(g.object);
    branchGauges[tag] = g;
    const plate = P.nameplate([tag === "a" ? "RAMA A · AUTOMÁTICA" : "RAMA B · MANUAL"], Math.max(0.22, r * 4), Math.max(0.05, r * 0.9));
    plate.position.set(xPrv, axisY - r * 2.6, z + r * 1.2 * Math.sign(z));
    if (z < 0) plate.rotation.y = Math.PI;
    root.add(plate);

    if (tag === "b") {
      // piloto de resorte con su tubería de control (toma aguas arriba y aguas abajo)
      const copper = M.paint("#b87333", 0.35);
      const pilot = P.group("pilot");
      const body = P.box(r * 1.2, r * 1.0, r * 0.9, M.paint("#9aa3ab", 0.4), r * 0.15);
      pilot.add(body);
      const spring = P.cylinder(r * 0.32, r * 0.32, r * 1.6, M.paint("#9aa3ab", 0.4), 16);
      spring.position.y = r * 0.5;
      pilot.add(spring);
      const screw = P.cylinder(r * 0.1, r * 0.1, r * 0.7, M.chrome(), 8);
      screw.position.y = r * 2.1;
      pilot.add(screw);
      pilot.position.set(xPrv, axisY + r * 2.2, z - r * 2.6);
      root.add(pilot);
      const tubeR = Math.max(0.004, r * 0.08);
      root.add(P.pipe([v3(xPrv - r * 3, axisY + r, z - r * 0.6), v3(xPrv - r * 3, axisY + r * 2.2, z - r * 2.6), v3(xPrv - r * 0.6, axisY + r * 2.2, z - r * 2.6)], tubeR, copper));
      root.add(P.pipe([v3(xPrv + r * 0.6, axisY + r * 2.2, z - r * 2.6), v3(xPrv + r * 3, axisY + r * 2.2, z - r * 2.6), v3(xPrv + r * 3, axisY + r, z - r * 0.6)], tubeR, copper));
      root.add(P.pipe([v3(xPrv, axisY + r * 2.7, z - r * 2.6), v3(xPrv, axisY + r * 3.3, z - r * 2.6), v3(xPrv, axisY + r * 3.3, z), v3(xPrv, axisY + r * 2.9, z)], tubeR, copper));
    }
  }

  // actuador de consigna de la PRV automática (motor sobre el piloto) y su cable al tablero
  const act = P.slab(r * 1.8, r * 1.5, r * 1.4, M.paint("#8a949c", 0.45), r * 0.2, "actuator");
  act.position.set(xPrv + r * 2.4, axisY + r * 2.0, dz + r * 2.2);
  root.add(act);
  root.add(P.pipe([v3(xPrv + r * 2.4, axisY + r * 2.2, dz + r * 1.4), v3(xPrv + r * 2.4, axisY + r * 1.0, dz + r * 0.2)], Math.max(0.004, r * 0.08), M.paint("#b87333", 0.35)));

  // manómetros de entrada y salida
  const gIn = gauge(Math.max(0.05, r * 0.9), r * 1.6);
  gIn.object.position.set(-L / 2 + r * 4, axisY + r * 0.9, 0);
  root.add(gIn.object);
  const gOut = gauge(Math.max(0.05, r * 0.9), r * 1.6);
  gOut.object.position.set(L / 2 - r * 4, axisY + r * 0.9, 0);
  root.add(gOut.object);

  // tablero del controlador con pantalla y baliza, frente a la rama automática
  const panelH = 1.25;
  const cab = P.cabinet(0.5, panelH, 0.25, "#cfd3d6");
  const panelX = xTeeIn - r * 1;
  const panelZ = dz + r * 6.5;
  cab.position.set(panelX, 0, panelZ);
  root.add(cab);
  const hmi = P.hmiPanel(0.3);
  hmi.object.position.set(panelX, panelH * 0.45, panelZ + 0.14);
  hmi.object.scale.setScalar(0.6);
  root.add(hmi.object);
  const light = P.stackLight(0.22);
  light.object.position.set(panelX + 0.15, panelH, panelZ);
  root.add(light.object);
  const plate = P.nameplate(["ESTACIÓN REGULADORA", `${dn}" · PUNTO CRÍTICO ${setpoint} MCA`], 0.42, 0.1);
  plate.position.set(panelX, panelH * 0.86, panelZ + 0.126);
  root.add(plate);
  root.add(P.pipe([v3(panelX + 0.2, panelH * 0.3, panelZ - 0.1), v3(xPrv + r * 2.4, panelH * 0.3, panelZ - 0.1), v3(xPrv + r * 2.4, axisY + r * 2.0, dz + r * 2.2)], 0.008, M.rubber()));

  // soportes en silla bajo la línea y las ramas
  const support = (x: number, z: number) => {
    const post = P.slab(r * 1.0, axisY - r * 1.05, r * 1.0, M.galvanized(), r * 0.05);
    post.position.set(x, 0, z);
    root.add(post);
    const base = P.slab(r * 2.6, r * 0.2, r * 2.6, M.galvanized(), r * 0.05);
    base.position.set(x, 0, z);
    root.add(base);
    const saddle = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.12, 6, 20, Math.PI), M.galvanized());
    saddle.rotation.set(0, Math.PI / 2, Math.PI);
    saddle.position.set(x, axisY, z);
    root.add(saddle);
  };
  support(-L / 2 + r * 2.5, 0);
  support(L / 2 - r * 2.5, 0);
  for (const z of [dz, -dz]) {
    support(xIso1 + r * 2.6, z);
    support(xIso2 - r * 2.6, z);
  }

  const fullScale = Math.max(20, Math.ceil((inletMca * 1.25) / 10) * 10);
  const lowScale = Math.max(10, Math.ceil((Math.max(manualSetting, setpoint) * 2) / 10) * 10);
  let lastKey = "";
  function update(frame: AnimationFrame): void {
    for (const tag of ["a", "b"] as const) {
      const open = clamp(ch(frame, tag === "a" ? "valve_a_open" : "valve_b_open"), 0, 1);
      for (const w of wheels[tag]) {
        w.wheel.rotation.y = -open * Math.PI * 2 * 4;
        w.wheel.position.y = r * 3.4 + open * r * 0.8;
        w.stem.position.y = r * 2.7 + open * r * 0.8;
      }
      const lift = clamp(ch(frame, tag === "a" ? "flow_a_norm" : "flow_b_norm") * 1.5, 0, 1);
      indicators[tag].position.y = r * 2.75 + lift * r * 0.25 - r * 0.1;
      branchGauges[tag].set(open > 0.02 ? ch(frame, "outlet_pressure_mca") / lowScale : 0);
    }
    gIn.set(ch(frame, "inlet_pressure_mca") / fullScale);
    gOut.set(ch(frame, "outlet_pressure_mca") / lowScale);
    light.set(ch(frame, "stack_light"), performance.now() / 1000);
    const crit = ch(frame, "critical_pressure_mca");
    const sp = ch(frame, "auto_setpoint_mca");
    const auto = ch(frame, "valve_a_open") >= ch(frame, "valve_b_open");
    const key = `${frame.state}|${crit.toFixed(1)}|${sp.toFixed(1)}|${auto}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "ESTACIÓN",
        [
          ["Pto. crítico", `${crit.toFixed(1)} mca`],
          ["Consigna", `${setpoint.toFixed(1)} mca`],
          ["Salida PRV A", `${sp.toFixed(1)} mca`],
          ["Rama", auto ? "A automática" : "B manual"],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ff6a3d",
      );
    }
  }
  update({
    channels: { valve_a_open: 1, valve_b_open: 0, flow_a_norm: 0.22, flow_b_norm: 0, inlet_pressure_mca: inletMca, outlet_pressure_mca: manualSetting, critical_pressure_mca: setpoint, auto_setpoint_mca: manualSetting, stack_light: 1 },
    state: "running",
  });

  return { root, size: { dx: L, dy: dz * 2 + r * 14, height: Math.max(panelH + 0.35, axisY + r * 5) }, update, dispose: () => disposeObject(root) };
}
