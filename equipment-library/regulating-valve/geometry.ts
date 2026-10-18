/**
 * Geometría de la válvula de regulación en línea: un carrete de tubería a lo largo de +X con bridas, el cuerpo
 * de globo pintado en el centro, el bonete arriba y encima el volante manual o el actuador eléctrico, un
 * indicador de posición, un manómetro a cada lado y dos soportes al piso.
 *
 * Proporciones de catálogo para 2": cuerpo ≈ 3,2 × diámetro de tubo, carrete ≈ 12 diámetros, eje del tubo a
 * 0,35 m del piso. El volante gira con la apertura (5 vueltas de cerrada a abierta); el actuador mueve la
 * aguja de su indicador. Lado de entrada en −X.
 */
import * as THREE from "three";
import {
  type AnimationFrame,
  type EquipmentModel,
  type Params,
  bool,
  ch,
  disposeObject,
  materials as M,
  num,
  parts as P,
  str,
} from "@twin/3d";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Manómetro de carátula mirando a +Z; origen en el centro de la carátula. */
function gauge(r: number): { object: THREE.Group; set(f: number): void } {
  const g = P.group("gauge");
  g.add(P.cylinderZ(r, r * 0.45, M.polishedSteel(), 28));
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 28), M.paint("#f4f4f0", 0.6));
  face.position.z = r * 0.23;
  g.add(face);
  const red = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.78, 20, 1, -Math.PI * 0.25, Math.PI * 0.25), M.paint("#c62828", 0.5));
  red.position.z = r * 0.235;
  g.add(red);
  const needle = P.box(r * 0.08, r * 0.75, r * 0.03, M.paint("#1b1e22", 0.4), 0);
  needle.geometry.translate(0, r * 0.32, 0);
  needle.position.z = r * 0.25;
  g.add(needle);
  return {
    object: g,
    set(f) {
      needle.rotation.z = Math.PI * 0.75 - clamp(f, 0, 1) * Math.PI * 1.5;
    },
  };
}

export default function build(params: Params): EquipmentModel {
  const dn = num(params, "diameter_in", 2);
  const vertical = bool(params, "vertical", false);
  const actuated = bool(params, "actuated", false);
  const color = str(params, "body_color", "#2f5f93");
  const setpoint = num(params, "setpoint_mca", 20);

  const r = Math.max(0.012, (dn * 0.0254) / 2 + 0.004); // radio exterior del tubo
  const axisY = Math.max(0.35, r * 6);
  const L = vertical ? Math.max(0.4, r * 9) : Math.max(0.6, r * 24);
  const bodyMat = M.paint(color, 0.45);
  const steel = M.galvanized();
  const root = P.group("regulating-valve");
  // en vertical el eje del tubo pasa por el origen y sube por +Y: el cuerpo se acuesta y el volante queda de costado
  const body = vertical ? P.group("body") : root;
  if (vertical) {
    body.rotation.z = Math.PI / 2;
    body.position.x = axisY;
    root.add(body);
  }

  // carrete con bridas en los extremos y junto al cuerpo
  const spool = P.cylinderX(r, L, steel, 28, "spool");
  spool.position.y = axisY;
  body.add(spool);
  const flangeR = r * 2.1;
  const bodyHalf = r * 1.9;
  for (const x of [-L / 2 + 0.01, L / 2 - 0.01, -bodyHalf, bodyHalf]) {
    const fl = P.cylinderX(flangeR, r * 0.35, x === -bodyHalf || x === bodyHalf ? bodyMat : steel, 28);
    fl.position.set(x, axisY, 0);
    body.add(fl);
    const bolts = P.boltCircle(flangeR * 0.8, 4, r * 0.12, r * 0.5);
    bolts.rotation.z = Math.PI / 2;
    bolts.position.set(x + r * 0.25, axisY, 0);
    body.add(bolts);
  }

  // cuerpo de globo y bonete
  const globe = new THREE.Mesh(new THREE.SphereGeometry(r * 1.75, 28, 18), bodyMat);
  globe.scale.set(1.1, 1, 0.95);
  globe.position.y = axisY;
  globe.castShadow = true;
  body.add(globe);
  const neck = P.cylinderX(r * 1.15, bodyHalf * 2, bodyMat, 24);
  neck.position.y = axisY;
  body.add(neck);
  const bonnetFl = P.cylinder(r * 1.45, r * 1.45, r * 0.3, bodyMat, 24);
  bonnetFl.position.y = axisY + r * 1.45;
  body.add(bonnetFl);
  const bonnet = P.cylinder(r * 0.9, r * 1.2, r * 1.6, bodyMat, 24);
  bonnet.position.y = axisY + r * 1.75;
  body.add(bonnet);
  const topY = axisY + r * 3.35;

  // flecha de sentido de flujo fundida en el cuerpo (+X)
  const arrow = P.box(r * 1.4, r * 0.18, r * 0.05, M.paint("#f4f4f0", 0.5), 0);
  arrow.position.set(0, axisY, r * 1.68);
  body.add(arrow);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, r * 0.4, 3), M.paint("#f4f4f0", 0.5));
  tip.rotation.z = -Math.PI / 2;
  tip.position.set(r * 0.85, axisY, r * 1.68);
  body.add(tip);

  // volante o actuador
  let wheel: THREE.Group | null = null;
  let stem: THREE.Mesh | null = null;
  let actNeedle: THREE.Mesh | null = null;
  let ledMat: THREE.MeshStandardMaterial | null = null;
  const yokeH = r * 2.6;
  const stemMat = M.chrome();
  if (!actuated) {
    // yugo con dos columnas, vástago que sube con la apertura y volante rojo
    for (const s of [-1, 1]) {
      const col = P.cylinder(r * 0.16, r * 0.16, yokeH, M.darkSteel(), 10);
      col.position.set(s * r * 0.75, topY, 0);
      body.add(col);
    }
    const yokeTop = P.box(r * 1.9, r * 0.3, r * 0.6, M.darkSteel(), r * 0.05);
    yokeTop.position.set(0, topY + yokeH, 0);
    body.add(yokeTop);
    stem = P.cylinder(r * 0.12, r * 0.12, yokeH + r * 1.2, stemMat, 12);
    stem.position.y = topY;
    body.add(stem);
    wheel = P.group("handwheel");
    const rimR = r * 2.1;
    const red = M.paint("#c62828", 0.45);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, r * 0.17, 10, 40), red);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    wheel.add(rim);
    for (let i = 0; i < 3; i++) {
      const spoke = P.box(rimR * 2, r * 0.18, r * 0.22, red, r * 0.04);
      spoke.rotation.y = (i * Math.PI) / 3;
      wheel.add(spoke);
    }
    const hub = P.cylinder(r * 0.4, r * 0.4, r * 0.4, red, 16);
    hub.position.y = -r * 0.2;
    wheel.add(hub);
    wheel.position.y = topY + yokeH + r * 0.5;
    body.add(wheel);
  } else {
    // acople, actuador eléctrico con tapa e indicador, y prensaestopa del cable
    const coupling = P.cylinder(r * 0.55, r * 0.55, r * 1.0, M.darkSteel(), 16);
    coupling.position.y = topY;
    body.add(coupling);
    const actW = r * 3.6;
    const actH = r * 3.0;
    const act = P.slab(actW, actH, r * 2.8, M.paint("#8a949c", 0.45), r * 0.25, "actuator");
    act.position.y = topY + r * 1.0;
    body.add(act);
    const cover = P.cylinder(r * 1.2, r * 1.2, r * 0.6, M.paint("#8a949c", 0.45), 24);
    cover.position.y = topY + r * 1.0 + actH;
    body.add(cover);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass("#e8f1f5", 0.35));
    dome.position.y = topY + r * 1.6 + actH;
    body.add(dome);
    actNeedle = P.box(r * 1.5, r * 0.1, r * 0.25, M.paint(M.SAFETY_YELLOW, 0.45), 0);
    actNeedle.position.y = topY + r * 1.65 + actH;
    body.add(actNeedle);
    ledMat = M.emissive("#22e06b", 3);
    const led = P.box(r * 0.4, r * 0.25, r * 0.06, ledMat, 0);
    led.position.set(-actW * 0.25, topY + r * 1.0 + actH * 0.75, r * 1.42);
    body.add(led);
    const gland = P.cylinderX(r * 0.25, r * 0.6, M.darkSteel(), 12);
    gland.position.set(actW / 2 + r * 0.3, topY + r * 1.0 + actH * 0.3, 0);
    body.add(gland);
    const cable = P.pipe(
      [
        new THREE.Vector3(actW / 2 + r * 0.6, topY + r * 1.0 + actH * 0.3, 0),
        new THREE.Vector3(actW / 2 + r * 1.6, topY + r * 1.0 + actH * 0.3, 0),
        new THREE.Vector3(actW / 2 + r * 1.6, 0.02, 0),
      ],
      r * 0.12,
      M.rubber(),
    );
    body.add(cable);
  }

  // manómetros antes y después, con su toma en la parte de arriba del tubo
  const gR = Math.max(0.04, r * 1.3);
  const gauges = (vertical ? [] : [-1, 1]).map((s) => {
    const x = s * (bodyHalf + r * 3.5);
    const tap = P.cylinder(r * 0.18, r * 0.18, gR * 1.6, M.chrome(), 10);
    tap.position.set(x, axisY + r * 0.9, 0);
    body.add(tap);
    const g = gauge(gR);
    g.object.position.set(x, axisY + r * 0.9 + gR * 1.6 + gR, 0);
    body.add(g.object);
    return g;
  });

  // soportes al piso cerca de los extremos
  for (const s of vertical ? [] : [-1, 1]) {
    const x = s * (L / 2 - r * 3);
    const post = P.slab(r * 0.9, axisY - r * 1.1, r * 0.9, steel, r * 0.05);
    post.position.set(x, 0, 0);
    body.add(post);
    const base = P.slab(r * 3, r * 0.25, r * 3, steel, r * 0.05);
    base.position.set(x, 0, 0);
    body.add(base);
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.12, 6, 20, Math.PI), steel);
    cradle.rotation.set(0, Math.PI / 2, Math.PI);
    cradle.position.set(x, axisY, 0);
    body.add(cradle);
  }

  const plate = P.nameplate([`VÁLVULA ${dn}"`, actuated ? "ACTUADA" : "MANUAL"], Math.max(0.12, r * 3.4), Math.max(0.045, r * 1.3));
  plate.position.set(0, axisY - r * 2.4, r * 1.2);
  body.add(plate);

  const fullScale = Math.max(10, Math.ceil((Math.max(setpoint, num(params, "bench_inlet_mca", 25)) * 1.6) / 10) * 10);
  function update(frame: AnimationFrame): void {
    const open = clamp(ch(frame, "opening"), 0, 1);
    if (wheel && stem) {
      wheel.rotation.y = -open * Math.PI * 2 * 5;
      const lift = open * r * 0.9;
      wheel.position.y = topY + yokeH + r * 0.5 + lift;
      stem.position.y = topY + lift;
    }
    if (actNeedle) actNeedle.rotation.y = -open * (Math.PI / 2);
    if (ledMat) {
      const fault = frame.state === "fault";
      ledMat.emissive.set(fault ? "#ff2a2a" : open > 0 ? "#22e06b" : "#ffb300");
    }
    gauges[0]?.set(ch(frame, "inlet_pressure_mca") / fullScale);
    gauges[1]?.set(ch(frame, "outlet_pressure_mca") / fullScale);
  }
  update({ channels: { opening: num(params, "opening_pct", 100) / 100, inlet_pressure_mca: 25, outlet_pressure_mca: 22.5, flow_norm: 0.5 }, state: "running" });

  const height = actuated ? topY + r * 5 : topY + yokeH + r * 1.6;
  return { root, size: { dx: L, dy: flangeR * 2 + 0.1, height }, update, dispose: () => disposeObject(root) };
}
