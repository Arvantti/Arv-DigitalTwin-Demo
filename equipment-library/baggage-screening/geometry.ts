/**
 * Geometría paramétrica de la máquina CT de inspección de equipaje. El flujo va hacia +X: banda de entrada
 * (1,5 m), cuerpo de la máquina (tunnel_length_m) con el pórtico giratorio al centro y cortinas plomadas en
 * las bocas, y banda de salida (1,5 m) con el desviador hacia nivel 3 del lado `alarm_side`.
 *
 * Relaciones: largo = tunnel_length_m + 3 m; ancho del cuerpo = belt_width_m + 1,0 m; alto 2,1 m; boca del
 * túnel de 1,1 × 0,8 m sobre la banda a 0,75 m.
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

const BELT_Y = 0.75;
const FEED_L = 1.5;

export default function build(params: Params): EquipmentModel {
  const L = num(params, "tunnel_length_m", 5);
  const W = num(params, "belt_width_m", 1.0);
  const color = str(params, "body_color", "#aeb6bf");
  const side = str(params, "alarm_side", "left") === "right" ? 1 : -1; // izquierda del flujo +X = -Z
  const DX = L + 2 * FEED_L;
  const BW = W + 1.0;
  const H = 2.1;
  const root = P.group("baggage-screening");
  const shell = M.paint(color, 0.35);
  const trim = M.paint("#2c3e50", 0.45);
  const steel = M.stainless();

  // bandas de entrada y salida
  for (const sx of [-1, 1]) {
    const cx = sx * (L / 2 + FEED_L / 2);
    const belt = P.box(FEED_L, 0.06, W, M.rubber(), 0.01, sx < 0 ? "infeed_belt" : "outfeed_belt");
    belt.position.set(cx, BELT_Y - 0.03, 0);
    root.add(belt);
    for (const sz of [-1, 1]) {
      const rail = P.box(FEED_L, 0.16, 0.05, steel, 0.006);
      rail.position.set(cx, BELT_Y + 0.02, sz * (W / 2 + 0.03));
      root.add(rail);
      for (const lx of [-1, 1]) {
        const leg = P.box(0.05, BELT_Y - 0.06, 0.05, steel, 0.005);
        leg.position.set(cx + lx * (FEED_L / 2 - 0.1), (BELT_Y - 0.06) / 2, sz * (W / 2 + 0.03));
        root.add(leg);
      }
    }
  }

  // cuerpo: dos módulos de carcasa y el pórtico circular al centro
  const modL = (L - 1.6) / 2;
  for (const sx of [-1, 1]) {
    const mod = P.box(modL, H - 0.25, BW, shell, 0.06, "gantry");
    mod.position.set(sx * (0.8 + modL / 2), (H - 0.25) / 2, 0);
    root.add(mod);
    const skirt = P.box(modL, 0.12, BW + 0.02, trim, 0.02);
    skirt.position.set(sx * (0.8 + modL / 2), 0.06, 0);
    root.add(skirt);
  }
  const ring = P.cylinderX(H / 2, 1.6, shell, 48, "gantry");
  ring.position.set(0, H / 2, 0);
  ring.scale.set(1, 1, BW / H);
  root.add(ring);
  for (const sx of [-1, 1]) {
    const band = P.cylinderX(H / 2 + 0.01, 0.12, trim, 48);
    band.position.set(sx * 0.74, H / 2, 0);
    band.scale.set(1, 1, (BW + 0.02) / (H + 0.02));
    root.add(band);
  }
  // bocas del túnel con cortinas plomadas (tiras)
  const stripMat = M.plastic("#2b2f33", 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 + 0.005);
    const frame = P.box(0.04, 0.95, 1.3, trim, 0.01, "tunnel_curtains");
    frame.position.set(x, BELT_Y + 0.42, 0);
    root.add(frame);
    const hole = P.box(0.05, 0.8, 1.1, M.darkSteel(), 0.005);
    hole.position.set(x, BELT_Y + 0.4, 0);
    root.add(hole);
    for (let i = 0; i < 8; i++) {
      const strip = P.box(0.01, 0.72, 0.13, stripMat, 0.002);
      strip.position.set(x + sx * 0.03, BELT_Y + 0.44, -0.49 + i * 0.14);
      root.add(strip);
    }
  }
  // señal de radiación y luz de rayos X
  for (const sz of [-1, 1]) {
    const sign = P.nameplate(["☢ RAYOS X"], 0.5, 0.18, "#f2b705", "#1b1e22");
    sign.position.set(0.8 + modL / 2, 1.35, sz * (BW / 2 + 0.005));
    if (sz < 0) sign.rotation.y = Math.PI;
    sign.name = "radiation_signs";
    root.add(sign);
  }
  const xrayMat = M.emissive("#ff9a1f", 0.05);
  const lamp = P.cylinder(0.08, 0.08, 0.12, xrayMat, 20, "warning_light");
  lamp.position.set(-0.8 - modL / 2, H - 0.19, 0);
  root.add(lamp);
  const light = P.stackLight(0.25);
  light.object.position.set(L / 2 - 0.2, H - 0.25, BW / 2 - 0.2);
  root.add(light.object);
  const hmi = P.hmiPanel(0.3);
  hmi.object.position.set(-L / 2 + 0.4, H - 0.25, BW / 2 - 0.15);
  hmi.object.name = "operator_console";
  root.add(hmi.object);
  hmi.draw("CT · NIVEL 1", [["Estado", "--"]], "LISTO", "#22e06b");

  // desviador a nivel 3 en la banda de salida
  const pusher = P.box(0.9, 0.12, 0.08, M.paint("#f2b705", 0.4), 0.01);
  pusher.position.set(L / 2 + FEED_L / 2, BELT_Y + 0.1, -side * (W / 2 - 0.05));
  pusher.rotation.y = side * 0.35;
  root.add(pusher);
  const chute = P.box(0.9, 0.04, 0.3, steel, 0.005);
  chute.position.set(L / 2 + FEED_L / 2, BELT_Y - 0.02, side * (W / 2 + 0.15));
  root.add(chute);

  // maletas: en la entrada, dentro del túnel y saliendo
  const bags = P.bagInstances(40, 0.7);
  root.add(bags);
  const m = new THREE.Matrix4();
  let time = 0;
  let lastState = "";

  function update(frame: AnimationFrame, dt: number): void {
    time += dt;
    const travel = ch(frame, "belt_travel");
    const queue = Math.min(3, Math.round(ch(frame, "entry_queue")));
    const inTunnel = Math.min(8, Math.round(ch(frame, "in_tunnel")));
    let k = 0;
    for (let i = 0; i < queue; i++) bags.setMatrixAt(k++, m.makeTranslation(-L / 2 - 0.45 - i * 0.8, BELT_Y, 0));
    for (let i = 0; i < inTunnel; i++) {
      const x = -L / 2 + 0.4 + (((travel / 10) * L + (i * L) / Math.max(1, inTunnel)) % (L - 0.8));
      bags.setMatrixAt(k++, m.makeTranslation(x, BELT_Y, 0));
    }
    bags.count = k;
    bags.instanceMatrix.needsUpdate = true;
    const on = ch(frame, "xray_on") > 0.5;
    xrayMat.emissiveIntensity = on ? 3 + 1.5 * Math.sin(time * 10) : 0.05;
    light.set(ch(frame, "stack_light"), time);
    if (frame.state !== lastState) {
      lastState = frame.state;
      const label = frame.state === "fault" ? ["FALLA", "#ff2a2a"] : frame.state === "blocked" ? ["SALIDA LLENA", "#ffb000"] : ["EN LÍNEA", "#22e06b"];
      hmi.draw("CT · NIVEL 1", [["Estado", frame.state]], label[0], label[1]);
    }
  }
  update({ channels: { entry_queue: 1, in_tunnel: 2, xray_on: 1, stack_light: 1 }, state: "running" }, 0);

  return {
    root,
    size: { dx: DX, dy: BW + 0.6, height: H },
    update: (frame, dt) => update(frame, dt),
    dispose: () => disposeObject(root),
  };
}
