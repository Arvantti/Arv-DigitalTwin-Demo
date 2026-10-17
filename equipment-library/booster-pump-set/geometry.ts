/**
 * Geometría del grupo de bombeo en paralelo: bastidor galvanizado, una fila de bombas a lo largo de +X,
 * colector de succión adelante (+Z, abajo) y de descarga atrás (−Z, arriba) en inoxidable, cada bomba con
 * válvula de corte en la succión y antirretorno más válvula de corte en la descarga, manómetro e
 * hidroacumulador en el colector de descarga, y tablero con variador, HMI y baliza en el extremo −X.
 *
 * Bomba multietapa vertical: base con bocas en línea, cuerpo de etapas (≈ 0,07 m por cada 10 m de altura de
 * diseño) con tirantes, linterna y motor vertical encima. Bomba de succión axial: voluta con la boca de
 * succión hacia el colector, descarga hacia arriba y motor horizontal detrás.
 * Separación entre bombas ≈ 0,45 m + 3 × diámetro del colector; el lado del operador mira a +Z.
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Gauge {
  object: THREE.Group;
  set(fraction: number): void;
}

/** Manómetro de carátula: origen en el centro de la carátula, mirando a +Z. */
function gauge(r: number): Gauge {
  const g = P.group("gauge");
  const rim = P.cylinderZ(r, r * 0.45, M.polishedSteel(), 28);
  g.add(rim);
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
  const stem = P.cylinder(r * 0.18, r * 0.18, r * 0.9, M.chrome(), 12);
  stem.position.y = -r * 1.4;
  g.add(stem);
  return {
    object: g,
    set(f) {
      needle.rotation.z = Math.PI * 0.75 - clamp(f, 0, 1) * Math.PI * 1.5;
    },
  };
}

/** Válvula de cuerpo corto (antirretorno o de corte) en un tubo a lo largo del eje dado. */
function inlineValve(pipeR: number, color: string, handle: boolean): THREE.Group {
  const g = P.group("valve");
  const body = P.cylinder(pipeR * 1.55, pipeR * 1.55, pipeR * 2.4, M.paint(color, 0.45), 24);
  body.position.y = -pipeR * 1.2;
  g.add(body);
  for (const s of [-1, 1]) {
    const fl = P.cylinder(pipeR * 1.9, pipeR * 1.9, pipeR * 0.35, M.paint(color, 0.45), 24);
    fl.position.y = s * pipeR * 1.25 - pipeR * 0.18;
    g.add(fl);
  }
  if (handle) {
    const lever = P.box(pipeR * 5, pipeR * 0.4, pipeR * 0.7, M.paint("#c62828", 0.5), pipeR * 0.1);
    lever.position.set(pipeR * 2.2, 0, pipeR * 2.0);
    g.add(lever);
  } else {
    const cap = P.box(pipeR * 1.6, pipeR * 0.9, pipeR * 2.6, M.paint(color, 0.45), pipeR * 0.2);
    cap.position.set(0, 0, 0);
    g.add(cap);
  }
  return g;
}

export default function build(params: Params): EquipmentModel {
  const n = Math.round(clamp(num(params, "pumps", 3), 1, 6));
  const style = str(params, "pump_style", "vertical_multistage");
  const q = num(params, "design_flow_m3h", 8);
  const head = num(params, "design_head_m", 80);
  const kw = num(params, "motor_kw", 4);
  const setpoint = num(params, "setpoint_mca", 80);
  const dn = num(params, "header_diameter_in", 4);
  const headerR = (dn * 0.0254) / 2 + 0.006;
  const branchR = clamp(headerR * 0.55, 0.018, 0.12);
  const vertical = style === "vertical_multistage";
  const sp = 0.45 + 6 * headerR;
  const panelW = 0.8;
  const rowL = n * sp;
  const L = rowL + panelW + 0.3;
  const W = vertical ? 1.2 : 1.5;
  const x0 = -L / 2 + panelW + 0.3 + sp / 2; // primera bomba
  const skidH = 0.12;
  const suctionY = skidH + 0.2;
  const suctionZ = W / 2 - 0.18;
  const stackH = vertical ? clamp(0.07 * (head / 10), 0.25, 1.4) : 0;
  const pumpR = clamp(0.08 + 0.012 * Math.sqrt(q), 0.08, 0.3);
  const motorR = 0.09 + 0.035 * Math.sqrt(kw);
  const pumpTop = vertical ? skidH + 0.22 + stackH + 0.12 : skidH + 0.25 + pumpR * 2.2;
  const dischargeY = vertical ? skidH + 0.22 + stackH * 0.6 : pumpTop + 0.25;
  const dischargeZ = -W / 2 + 0.2;

  const root = P.group("booster_pump_set");
  const steel = M.stainless();
  const frame = M.galvanized();
  const pumpBlue = M.paint("#1f5fa8", 0.35);

  // bastidor: dos largueros y travesaños
  for (const z of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const rail = P.box(L, skidH, 0.1, frame, 0.008);
    rail.position.set(0, skidH / 2, z);
    root.add(rail);
  }
  for (let i = 0; i <= n + 1; i++) {
    const x = -L / 2 + 0.05 + ((L - 0.1) / (n + 1)) * i;
    const cross = P.box(0.08, skidH * 0.8, W - 0.1, frame, 0.006);
    cross.position.set(x, skidH * 0.4, 0);
    root.add(cross);
  }
  const plate = P.box(rowL + 0.2, 0.012, W - 0.2, M.paint("#8a9096", 0.6), 0.004);
  plate.position.set(x0 - sp / 2 + rowL / 2, skidH + 0.006, 0);
  root.add(plate);

  // colectores
  const xa = x0 - sp / 2 - 0.05;
  const xb = x0 + rowL - sp / 2 + 0.15;
  const suction = P.pipe([new THREE.Vector3(xb + 0.35, suctionY, suctionZ), new THREE.Vector3(xa, suctionY, suctionZ)], headerR, steel);
  root.add(suction);
  const discharge = P.pipe(
    [new THREE.Vector3(xa, dischargeY, dischargeZ), new THREE.Vector3(xb, dischargeY, dischargeZ), new THREE.Vector3(xb + 0.35, dischargeY, dischargeZ)],
    headerR,
    steel,
  );
  root.add(discharge);
  for (const [x, y, z] of [[xa, suctionY, suctionZ], [xa, dischargeY, dischargeZ]]) {
    const cap = P.dishedHead(headerR, steel);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(x, y, z);
    root.add(cap);
  }
  for (const [y, z] of [[suctionY, suctionZ], [dischargeY, dischargeZ]]) {
    const fl = P.cylinderX(headerR * 1.7, 0.03, steel, 28);
    fl.position.set(xb + 0.35, y, z);
    root.add(fl);
  }
  // soportes del colector de descarga
  for (const x of [xa + 0.1, xb - 0.05]) {
    const post = P.box(0.05, dischargeY - skidH, 0.05, frame, 0.004);
    post.position.set(x, skidH + (dischargeY - skidH) / 2, dischargeZ);
    root.add(post);
  }

  const lamps: THREE.MeshStandardMaterial[] = [];
  const rotors: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * sp;
    const g = P.group(`pump_${i + 1}`);
    g.position.x = x;
    root.add(g);
    let suctionPort: THREE.Vector3;
    let dischargePort: THREE.Vector3;
    let lampPos: THREE.Vector3;
    if (vertical) {
      // base con bocas en línea (succión +Z, descarga −Z)
      const base = P.box(pumpR * 3.2, 0.12, pumpR * 3.6, M.paint("#3a3d42", 0.5), 0.01);
      base.position.y = skidH + 0.06;
      g.add(base);
      const foot = P.cylinder(pumpR * 1.1, pumpR * 1.25, 0.1, pumpBlue, 28);
      foot.position.y = skidH + 0.12;
      g.add(foot);
      const stack = P.cylinder(pumpR, pumpR, stackH, steel, 32);
      stack.position.y = skidH + 0.22;
      g.add(stack);
      for (let k = 1; k < Math.max(2, Math.round(stackH / 0.07)); k++) {
        const ring = P.cylinder(pumpR * 1.02, pumpR * 1.02, 0.006, M.polishedSteel(), 32);
        ring.position.y = skidH + 0.22 + (stackH * k) / Math.max(2, Math.round(stackH / 0.07));
        g.add(ring);
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const rod = P.cylinder(0.008, 0.008, stackH + 0.08, M.polishedSteel(), 8);
        rod.position.set(Math.cos(a) * pumpR * 1.25, skidH + 0.2, Math.sin(a) * pumpR * 1.25);
        g.add(rod);
      }
      const head = P.cylinder(pumpR * 1.2, pumpR * 1.1, 0.1, pumpBlue, 28);
      head.position.y = skidH + 0.22 + stackH;
      g.add(head);
      const lantern = P.cylinder(motorR * 0.8, pumpR * 1.0, 0.12, pumpBlue, 24);
      lantern.position.y = skidH + 0.32 + stackH;
      g.add(lantern);
      const mot = P.motor(kw, "#1f5fa8");
      mot.rotation.z = -Math.PI / 2; // eje vertical, ventilador arriba
      const motorLen = (mot.userData.length as number) / 1.3;
      mot.position.y = skidH + 0.44 + stackH + motorLen / 2;
      g.add(mot);
      const fanY = skidH + 0.44 + stackH + motorLen * 1.15;
      const rotor = P.group("rotor");
      rotor.position.y = fanY + 0.01;
      for (const a of [0, Math.PI / 2]) {
        const blade = P.box(motorR * 1.7, 0.012, 0.03, M.paint(M.SAFETY_YELLOW, 0.5), 0.004);
        blade.rotation.y = a;
        rotor.add(blade);
      }
      g.add(rotor);
      rotors.push(rotor);
      suctionPort = new THREE.Vector3(0, skidH + 0.14, pumpR * 1.6);
      dischargePort = new THREE.Vector3(0, skidH + 0.14, -pumpR * 1.6);
      lampPos = new THREE.Vector3(0, fanY + 0.06, motorR * 0.6);
    } else {
      // succión axial: voluta adelante, motor atrás, eje a lo largo de Z
      const baseplate = P.box(pumpR * 3, 0.06, 0.95, M.paint("#3a3d42", 0.5), 0.008);
      baseplate.position.set(0, skidH + 0.03, -0.05);
      g.add(baseplate);
      const cy = skidH + 0.1 + pumpR * 1.1;
      const volute = P.cylinderZ(pumpR * 1.1, pumpR * 0.9, pumpBlue, 32);
      volute.position.set(0, cy, 0.25);
      g.add(volute);
      const tongue = P.box(pumpR * 0.9, pumpR * 1.2, pumpR * 0.8, pumpBlue, 0.01);
      tongue.position.set(0, cy + pumpR * 0.9, 0.25);
      g.add(tongue);
      const bracket = P.cylinderZ(pumpR * 0.45, 0.22, pumpBlue, 20);
      bracket.position.set(0, cy, 0.02);
      g.add(bracket);
      const mot = P.motor(kw, "#1f5fa8");
      mot.rotation.y = Math.PI / 2; // eje a lo largo de Z, ventilador atrás
      mot.position.set(0, cy, -0.3);
      g.add(mot);
      const guard = P.box(pumpR * 1.2, pumpR * 0.9, 0.12, M.paint(M.SAFETY_YELLOW, 0.5), 0.01);
      guard.position.set(0, cy, -0.06);
      g.add(guard);
      const rotor = P.group("rotor");
      rotor.position.set(0, cy, -0.06);
      const mark = P.box(0.012, pumpR * 0.8, 0.13, M.paint("#1b1e22", 0.5), 0.002);
      rotor.add(mark);
      g.add(rotor);
      rotors.push(rotor);
      suctionPort = new THREE.Vector3(0, cy, 0.25 + pumpR * 0.45);
      dischargePort = new THREE.Vector3(0, cy + pumpR * 1.5, 0.25);
      lampPos = new THREE.Vector3(0, cy + motorR + 0.06, -0.3);
    }
    // succión: del colector a la boca de la bomba, con válvula de corte
    const sPath = vertical
      ? [new THREE.Vector3(0, suctionY, suctionZ), new THREE.Vector3(0, suctionY, suctionPort.z)]
      : [new THREE.Vector3(0, suctionY, suctionZ), new THREE.Vector3(0, suctionY, suctionZ - 0.08), new THREE.Vector3(0, suctionPort.y, suctionZ - 0.08), suctionPort];
    g.add(P.pipe(sPath, branchR, steel));
    const sValve = inlineValve(branchR, "#3a3d42", true);
    sValve.rotation.x = Math.PI / 2;
    sValve.position.set(0, suctionY, (suctionZ + suctionPort.z) / 2 + (vertical ? 0 : -0.04));
    if (!vertical) {
      sValve.position.set(0, (suctionY + suctionPort.y) / 2, suctionZ - 0.08);
      sValve.rotation.x = 0;
    }
    g.add(sValve);
    // descarga: sube, antirretorno y válvula de corte, y entra al colector
    const riseZ = vertical ? dischargePort.z - 0.1 : dischargePort.z;
    const dPath = vertical
      ? [dischargePort, new THREE.Vector3(0, dischargePort.y, riseZ), new THREE.Vector3(0, dischargeY, riseZ), new THREE.Vector3(0, dischargeY, dischargeZ)]
      : [dischargePort, new THREE.Vector3(0, dischargeY, dischargePort.z), new THREE.Vector3(0, dischargeY, dischargeZ)];
    g.add(P.pipe(dPath, branchR, steel));
    const yMid = vertical ? dischargePort.y + (dischargeY - dischargePort.y) * 0.35 : (dischargePort.y + dischargeY) / 2;
    const check = inlineValve(branchR, "#5b6168", false);
    check.position.set(0, yMid + branchR * 1.2, vertical ? riseZ : dischargePort.z);
    g.add(check);
    const iso = inlineValve(branchR, "#3a3d42", true);
    iso.position.set(0, yMid + branchR * 5.2, vertical ? riseZ : dischargePort.z);
    g.add(iso);
    // luz de estado
    const lampMat = M.emissive("#22e06b", 0.05);
    const lamp = P.cylinder(0.022, 0.022, 0.03, lampMat, 16);
    lamp.position.copy(lampPos);
    g.add(lamp);
    lamps.push(lampMat);
    const tag = P.nameplate([`B-${i + 1}`], 0.12, 0.06);
    tag.position.set(0, skidH + 0.07, vertical ? pumpR * 1.81 : 0.4);
    g.add(tag);
  }

  // manómetro e hidroacumulador sobre la descarga
  const dial = gauge(0.07);
  dial.object.position.set(xb - 0.1, dischargeY + headerR + 0.17, dischargeZ + 0.02);
  root.add(dial.object);
  const tankR = clamp(0.12 + 0.01 * q, 0.12, 0.35);
  const tank = P.group("pressure_tank");
  const shell = P.cylinder(tankR, tankR, tankR * 2.2, M.paint("#2a6fb5", 0.35), 32);
  shell.position.y = tankR;
  tank.add(shell);
  for (const [y, down] of [[tankR, true], [tankR * 3.2, false]] as const) {
    const h = P.dishedHead(tankR, M.paint("#2a6fb5", 0.35), down);
    h.position.y = y;
    tank.add(h);
  }
  tank.position.set(xb + 0.15, skidH, dischargeZ + tankR + 0.12);
  root.add(tank);
  const link = P.pipe([new THREE.Vector3(xb + 0.15, dischargeY, dischargeZ), new THREE.Vector3(xb + 0.15, dischargeY, dischargeZ + tankR + 0.12), new THREE.Vector3(xb + 0.15, skidH + tankR * 3.4, dischargeZ + tankR + 0.12)], branchR * 0.5, steel);
  root.add(link);

  // tablero con variadores, HMI y baliza
  const cabH = 1.5;
  const cab = P.cabinet(panelW, cabH, 0.35, "#cfd3d6");
  cab.position.set(-L / 2 + panelW / 2 + 0.05, skidH, 0);
  root.add(cab);
  const vfdLeds: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < n; i++) {
    const mat = M.emissive("#22e06b", 0.05);
    const led = P.box(0.06, 0.02, 0.01, mat, 0.002);
    led.position.set(-L / 2 + 0.15 + (i % 3) * 0.12, skidH + cabH * 0.7 - Math.floor(i / 3) * 0.05, 0.18);
    root.add(led);
    vfdLeds.push(mat);
  }
  const hmi = P.hmiPanel(0.35);
  hmi.object.position.set(-L / 2 + panelW / 2 + 0.05, skidH + cabH * 0.42, 0.2);
  hmi.object.scale.setScalar(0.7);
  root.add(hmi.object);
  const light = P.stackLight(0.25);
  light.object.position.set(-L / 2 + panelW - 0.1, skidH + cabH, 0);
  root.add(light.object);
  const plate2 = P.nameplate([`GRUPO DE BOMBEO ${n}×${q} M³/H`, `${head} M · ${kw} KW C/U`], 0.5, 0.11);
  plate2.position.set(-L / 2 + panelW / 2 + 0.05, skidH + cabH * 0.88, 0.181);
  root.add(plate2);

  const fullScale = Math.ceil((setpoint * 1.6) / 10) * 10;
  let lastKey = "";
  function update(frame: AnimationFrame, dt = 0.016): void {
    for (let i = 0; i < n; i++) {
      const v = ch(frame, `pump_${i + 1}`);
      rotors[i].rotation[vertical ? "y" : "z"] += dt * Math.max(0, v) * 40;
      const tripped = v < -0.5;
      lamps[i].color.set(tripped ? "#ff2a2a" : "#22e06b");
      lamps[i].emissive.set(tripped ? "#ff2a2a" : "#22e06b");
      lamps[i].emissiveIntensity = tripped ? 5 : v > 0 ? 4 : 0.05;
      vfdLeds[i].emissive.set(tripped ? "#ff2a2a" : "#22e06b");
      vfdLeds[i].emissiveIntensity = tripped || v > 0 ? 4 : 0.05;
    }
    const p = ch(frame, "discharge_pressure_mca");
    dial.set(p / fullScale);
    light.set(ch(frame, "stack_light"), performance.now() / 1000);
    const running = Array.from({ length: n }, (_, i) => ch(frame, `pump_${i + 1}`)).filter((v) => v > 0);
    const key = `${frame.state}|${p.toFixed(1)}|${running.length}|${(running[0] ?? 0).toFixed(2)}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? "BOMBEO",
        [
          ["Descarga", `${p.toFixed(1)} mca`],
          ["Bombas", `${running.length} / ${n}`],
          ["Velocidad", `${((running[0] ?? 0) * 100).toFixed(0)} %`],
          ["Caudal", `${(ch(frame, "flow_norm") * Math.max(1, running.length) * q).toFixed(1)} m³/h`],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ff6a3d",
      );
    }
  }
  const demo: Record<string, number> = { discharge_pressure_mca: setpoint, flow_norm: 0.8, stack_light: 1 };
  for (let i = 0; i < 6; i++) demo[`pump_${i + 1}`] = i < Math.min(2, n) ? 0.96 : 0;
  update({ channels: demo, state: "running" });

  return { root, size: { dx: L + 0.5, dy: W + 0.2, height: Math.max(pumpTop + motorR * 3, skidH + cabH + 0.5) }, update, dispose: () => disposeObject(root) };
}
