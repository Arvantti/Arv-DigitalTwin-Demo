/**
 * Geometría del pasteurizador tubular: skid con haz de tubos encamisados en serpentín
 * (curvas en U), línea de vapor con válvula de control, bomba sanitaria, tubo de retención
 * inclinado con sondas, válvula de desvío de tres vías y tablero. Flujo hacia +X.
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
  const passes = Math.max(2, Math.round(num(params, "tube_passes", 6)));
  const flow = num(params, "flow_l_h", 3000);
  const holdS = num(params, "hold_s", 30);
  const L = 4.6;
  const D = 1.8;
  const root = P.group("tubular-pasteurizer");
  const steel = M.stainless();
  const clad = M.insulationCladding();

  // skid
  const skid = P.group("skid");
  for (const sz of [-1, 1]) {
    const beam = P.box(L + 0.2, 0.14, 0.1, M.paint("#3b4650", 0.5), 0.01);
    beam.position.set(0, 0.07, sz * (D / 2 - 0.05));
    skid.add(beam);
  }
  for (const x of [-L / 2, 0, L / 2]) {
    const cross = P.box(0.1, 0.14, D, M.paint("#3b4650", 0.5), 0.01);
    cross.position.set(x, 0.07, 0);
    skid.add(cross);
  }
  root.add(skid);

  // bastidor del haz de tubos
  const tubeR = 0.035 + 0.006 * Math.sqrt(flow / 1000);
  const jacketR = tubeR + 0.03;
  const pitch = jacketR * 2 + 0.05;
  const y0 = 0.45;
  const bundleL = L - 0.8;
  for (const x of [-bundleL / 2 - 0.1, bundleL / 2 + 0.1]) {
    for (const z of [-0.35, 0.35]) {
      const post = P.box(0.06, y0 + passes * pitch + 0.1, 0.06, steel, 0.008);
      post.geometry.translate(0, (y0 + passes * pitch + 0.1) / 2, 0);
      post.position.set(x, 0.14, z);
      root.add(post);
    }
  }
  // haz: tubos encamisados horizontales y curvas en U alternando extremos
  const bundle = P.group("tube_bundle");
  const productMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < passes; i++) {
    const y = y0 + 0.2 + i * pitch;
    const jacket = P.cylinderX(jacketR, bundleL, clad, 24, "steam_jacket");
    jacket.position.set(0, y, 0);
    bundle.add(jacket);
    for (const x of [-bundleL / 2 + 0.15, 0, bundleL / 2 - 0.15]) {
      const band = P.cylinderX(jacketR + 0.006, 0.03, M.polishedSteel(), 24);
      band.position.set(x, y, 0);
      bundle.add(band);
    }
    if (i < passes - 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const mat = new THREE.MeshStandardMaterial({ color: "#c8cdd2", metalness: 1, roughness: 0.25, emissive: "#ff5a1f", emissiveIntensity: 0 });
      productMats.push(mat);
      const bendGeo = new THREE.TorusGeometry(pitch / 2, tubeR, 12, 24, Math.PI);
      const bend = P.mesh(bendGeo, mat);
      bend.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      bend.position.set(side * (bundleL / 2), y + pitch / 2, 0);
      bundle.add(bend);
    }
  }
  root.add(bundle);
  const topY = y0 + 0.2 + (passes - 1) * pitch;

  // línea de vapor: cabezal vertical con derivaciones a cada camisa, válvula de control y manómetro
  const steamX = -bundleL / 2 + 0.4;
  root.add(P.pipe([new THREE.Vector3(steamX, topY + 0.6, -0.45), new THREE.Vector3(steamX, y0 + 0.2, -0.45)], 0.045, clad, 0.1));
  for (let i = 0; i < passes; i++) {
    const y = y0 + 0.2 + i * pitch;
    root.add(P.pipe([new THREE.Vector3(steamX, y, -0.45), new THREE.Vector3(steamX, y, -jacketR)], 0.018, M.polishedSteel(), 0.04));
  }
  const steamValve = P.group("steam_valve");
  steamValve.add(P.box(0.16, 0.12, 0.16, M.darkSteel(), 0.02));
  const diaphragm = P.cylinder(0.15, 0.15, 0.1, M.paint("#1e5aa8", 0.4), 32);
  diaphragm.position.y = 0.12;
  steamValve.add(diaphragm);
  steamValve.position.set(steamX, topY + 0.35, -0.45);
  root.add(steamValve);
  const gauge = P.cylinderZ(0.07, 0.03, M.paint("#eeeeee", 0.3), 24);
  gauge.position.set(steamX + 0.25, topY + 0.25, -0.43);
  root.add(gauge);

  // bomba sanitaria de producto en la entrada
  const pump = P.group("product_pump");
  const shroud = P.cylinderX(0.15, 0.45, M.polishedSteel(), 32);
  pump.add(shroud);
  const volute = P.cylinderZ(0.13, 0.1, M.polishedSteel(), 32);
  volute.position.x = 0.3;
  pump.add(volute);
  pump.position.set(-L / 2 + 0.25, 0.4, 0.45);
  root.add(pump);
  root.add(P.pipe([new THREE.Vector3(-L / 2 + 0.55, 0.4, 0.45), new THREE.Vector3(-bundleL / 2 + 0.05, 0.4, 0.45), new THREE.Vector3(-bundleL / 2 + 0.05, y0 + 0.2, 0.12), new THREE.Vector3(-bundleL / 2 + 0.2, y0 + 0.2, 0)], tubeR * 0.9, M.polishedSteel(), 0.12));

  // tubo de retención inclinado (serpentín) a lo largo del costado +Z
  const hold = P.group("holding_tube");
  const holdLegs = Math.max(2, Math.round(holdS / 10));
  const hx0 = -bundleL / 2;
  const hx1 = bundleL / 2;
  const pts: THREE.Vector3[] = [new THREE.Vector3(hx1 + 0.1, topY, 0)];
  for (let i = 0; i < holdLegs; i++) {
    const y = topY - 0.05 - i * 0.12;
    const zx = i % 2 === 0;
    pts.push(new THREE.Vector3(zx ? hx1 : hx0, y, 0.75));
    pts.push(new THREE.Vector3(zx ? hx0 : hx1, y - 0.06, 0.75));
  }
  hold.add(P.pipe(pts, tubeR * 0.85, M.polishedSteel(), 0.12));
  for (let i = 0; i < 4; i++) {
    const bracket = P.box(0.04, topY, 0.04, steel, 0.006);
    bracket.geometry.translate(0, topY / 2, 0);
    bracket.position.set(hx0 + ((hx1 - hx0) * i) / 3, 0.14, 0.75);
    hold.add(bracket);
  }
  root.add(hold);
  const lastPt = pts[pts.length - 1];
  // sondas de temperatura
  for (const pt of [pts[0], lastPt]) {
    const probe = P.cylinder(0.035, 0.035, 0.12, M.paint("#1e5aa8", 0.4), 16, "probes");
    probe.position.set(pt.x, pt.y + tubeR, pt.z);
    root.add(probe);
  }
  // válvula de desvío de tres vías con actuador y testigo
  const divertG = P.group("divert_valve");
  divertG.add(P.cylinder(tubeR * 1.8, tubeR * 1.8, 0.22, M.polishedSteel(), 24));
  const actuator = P.cylinder(0.07, 0.07, 0.3, M.plastic("#f4f4f4", 0.4), 24);
  actuator.position.y = 0.22;
  divertG.add(actuator);
  const indicatorMat = M.emissive("#22e06b", 3);
  const indicator = P.cylinder(0.072, 0.072, 0.05, indicatorMat, 24);
  indicator.position.y = 0.52;
  divertG.add(indicator);
  divertG.position.set(lastPt.x - 0.1, 0.55, lastPt.z);
  root.add(divertG);
  root.add(P.pipe([lastPt, new THREE.Vector3(lastPt.x - 0.1, 0.77, lastPt.z)], tubeR * 0.85, M.polishedSteel(), 0.1));
  root.add(P.pipe([new THREE.Vector3(lastPt.x - 0.1, 0.55, lastPt.z), new THREE.Vector3(lastPt.x - 0.1, 0.3, lastPt.z), new THREE.Vector3(-L / 2 - 0.2, 0.3, lastPt.z)], tubeR * 0.85, M.polishedSteel(), 0.1));

  // tablero y baliza
  const cab = P.cabinet(0.7, 1.2, 0.3, "#d9dde1");
  cab.position.set(L / 2 - 0.35, 0.14, -D / 2 + 0.2);
  cab.rotation.y = Math.PI;
  root.add(cab);
  const hmi = P.hmiPanel(0.1);
  hmi.object.position.set(L / 2 - 0.35, 1.0, -D / 2 + 0.05);
  hmi.object.rotation.y = Math.PI;
  root.add(hmi.object);
  const light = P.stackLight(0.2);
  light.object.position.set(L / 2 - 0.15, 1.34, -D / 2 + 0.2);
  root.add(light.object);
  const plate = P.nameplate([`PASTEURIZADOR ${Math.round(flow).toLocaleString("es-CO")} L/H`, `RETENCIÓN ${Math.round(holdS)} s`], 0.5, 0.12);
  plate.position.set(0, 0.25, D / 2 + 0.002);
  root.add(plate);

  const hot = new THREE.Color("#ff5a1f");
  let hmiTimer = 0;
  function update(frame: AnimationFrame, dt: number): void {
    const heat = ch(frame, "heat");
    const flowOn = ch(frame, "flow");
    productMats.forEach((m, i) => (m.emissiveIntensity = flowOn * heat * (0.1 + (0.35 * i) / Math.max(1, productMats.length))));
    diaphragm.scale.y = 1 + 0.4 * ch(frame, "steam");
    const divert = ch(frame, "divert");
    indicatorMat.emissive.copy(divert > 0.5 ? new THREE.Color("#ffb000") : hot.clone().set("#22e06b"));
    indicatorMat.emissiveIntensity = flowOn > 0 ? 4 : 0.3;
    light.set(ch(frame, "alarm_light", 0), performance.now() / 1000);
    hmiTimer -= dt;
    if (hmiTimer <= 0) {
      hmiTimer = 0.5;
      const v = frame.variables ?? {};
      const f = (k: string, d = 0, u = "") => (typeof v[k] === "number" ? `${(v[k] as number).toFixed(d)} ${u}`.trim() : "—");
      hmi.draw(
        frame.label ?? "PASTEURIZADOR",
        [
          ["Entrada", f("product_in_c", 1, "°C")],
          ["Salida", f("product_out_c", 1, "°C")],
          ["Retención", f("hold_temp_c", 1, "°C")],
          ["Valor P", f("p_value_min", 2, "min")],
          ["Vapor", f("steam_flow_kg_h", 0, "kg/h")],
          ["Ensuciam.", f("fouling_pct", 0, "%")],
        ],
        divert > 0.5 ? "DESVÍO" : frame.state.toUpperCase(),
        divert > 0.5 ? "#ffb000" : frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
  }
  update({ channels: { flow: 1, heat: 0.9 }, state: "idle" }, 0);

  return { root, size: { dx: L + 0.6, dy: D + 0.4, height: topY + 1.0 }, update, dispose: () => disposeObject(root) };
}
