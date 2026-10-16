/**
 * Geometría paramétrica de la sachetadora vertical.
 *
 * Ancho ≈ 0,9 + 0,35·pistas m · fondo 1,6 m · alto ≈ 2,6 m + ajuste por volumen.
 * Ancho del sachet ≈ 0,12·(mL/250)^0,35 m y alto ≈ 1,5 veces el ancho
 * (250 ml ≈ 12 × 18 cm · 1.000 ml ≈ 19,5 × 29 cm).
 * Frente del operador hacia +Z; rollo de laminado atrás (-Z).
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

export function sachetSize(unitMl: number): { w: number; h: number } {
  const w = 0.12 * Math.pow(unitMl / 250, 0.35);
  return { w, h: 1.5 * w };
}

export default function build(params: Params): EquipmentModel {
  const lanes = Math.max(1, Math.round(num(params, "lanes", 2)));
  const unitMl = num(params, "unit_ml", 250);
  const filmColor = str(params, "film_color", "#c62828");
  const product = str(params, "product", "salsa");
  const W = 0.9 + 0.35 * lanes;
  const D = 1.6;
  const H = 2.6 + 0.25 * Math.cbrt(unitMl / 1000);
  const { w: sw, h: sh } = sachetSize(unitMl);
  const laneGap = Math.max(sw * 1.4, 0.3);
  const laneX = (i: number) => (i - (lanes - 1) / 2) * laneGap;

  const root = P.group("vffs-sachet-filler");
  const steel = M.stainless();
  const frameMat = M.polishedSteel();

  // ------------------------------------------------------------------ base y estructura
  const yBase = 0.85;
  const base = P.slab(W, yBase - 0.12, D * 0.9, steel, 0.03, "frame");
  base.position.y = 0.12;
  root.add(base);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = P.cylinder(0.035, 0.035, 0.12, frameMat, 16);
      leg.position.set(sx * (W / 2 - 0.08), 0, sz * (D * 0.45 - 0.08));
      root.add(leg);
      const foot = P.cylinder(0.06, 0.06, 0.02, M.rubber(), 16);
      foot.position.copy(leg.position);
      root.add(foot);
    }
  }
  // puertas del gabinete inferior
  for (let i = 0; i < 2; i++) {
    const seam = P.box(0.006, yBase - 0.25, 0.004, M.paint("#7d8287", 0.6), 0);
    seam.position.set(-W / 2 + (W / 2) * (i + 1) - (i === 1 ? W / 2 : 0), 0.12 + (yBase - 0.12) / 2, (D * 0.9) / 2 + 0.002);
    if (i === 0) root.add(seam);
    const handle = P.box(0.025, 0.12, 0.02, M.polishedSteel(), 0.006);
    handle.position.set(i === 0 ? -0.08 : 0.08, 0.55, (D * 0.9) / 2 + 0.012);
    root.add(handle);
  }

  // columnas y travesaños de la sección de formado (perfil cuadrado)
  const colH = H - 0.35 - yBase;
  const frame = P.group("doors");
  const fw = W - 0.04;
  const fd = D * 0.82;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = P.box(0.05, colH, 0.05, frameMat, 0.008);
      col.position.set((sx * fw) / 2, yBase + colH / 2, (sz * fd) / 2);
      frame.add(col);
    }
  }
  for (const y of [yBase + 0.02, yBase + colH]) {
    for (const sz of [-1, 1]) {
      const rail = P.box(fw, 0.05, 0.05, frameMat, 0.008);
      rail.position.set(0, y, (sz * fd) / 2);
      frame.add(rail);
    }
    for (const sx of [-1, 1]) {
      const rail = P.box(0.05, 0.05, fd, frameMat, 0.008);
      rail.position.set((sx * fw) / 2, y, 0);
      frame.add(rail);
    }
  }
  // puertas de policarbonato (frente y laterales)
  const doorH = colH - 0.1;
  for (const [x, z, w, rot] of [
    [-fw / 4, fd / 2, fw / 2 - 0.04, 0],
    [fw / 4, fd / 2, fw / 2 - 0.04, 0],
    [fw / 2, 0, fd - 0.06, Math.PI / 2],
    [-fw / 2, 0, fd - 0.06, Math.PI / 2],
  ] as [number, number, number, number][]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, doorH), M.glass("#e6f2ff", 0.14));
    pane.position.set(x, yBase + colH / 2, z);
    pane.rotation.y = rot;
    pane.renderOrder = 2;
    frame.add(pane);
  }
  for (const s of [-1, 1]) {
    const hinge = P.box(0.03, 0.18, 0.03, M.darkSteel(), 0.006);
    hinge.position.set(s * 0.06, yBase + colH * 0.5, fd / 2 + 0.03);
    frame.add(hinge);
  }
  root.add(frame);

  // ------------------------------------------------------------------ rollo de laminado y recorrido de la película
  const filmW = Math.min(fw - 0.1, lanes * sw * 2 + 0.04);
  const filmMat = new THREE.MeshPhysicalMaterial({ color: filmColor, roughness: 0.25, metalness: 0.1, clearcoat: 0.8, side: THREE.DoubleSide });
  const yRoll = yBase + 0.55;
  const zRoll = -D / 2 - 0.05;
  const rollGroup = P.group("film_roll");
  const core = P.cylinderX(0.04, filmW + 0.2, M.polishedSteel(), 16);
  rollGroup.add(core);
  const rollMesh = P.cylinderX(1, filmW, filmMat, 48);
  rollGroup.add(rollMesh);
  const rollStripe = P.cylinderX(1.002, filmW * 0.15, M.paint("#f5f5f5", 0.3), 48);
  rollGroup.add(rollStripe);
  rollGroup.position.set(0, yRoll, zRoll);
  root.add(rollGroup);
  for (const sx of [-1, 1]) {
    const arm = P.box(0.05, 0.6, 0.05, frameMat, 0.008);
    arm.position.set((sx * (filmW + 0.24)) / 2, yRoll - 0.25, zRoll + 0.1);
    root.add(arm);
  }
  // rodillos bailarines
  const yTop = yBase + colH - 0.25; // altura del cuello formador
  const rollers: THREE.Vector3[] = [
    new THREE.Vector3(0, yRoll + 0.35, zRoll + 0.15),
    new THREE.Vector3(0, yTop - 0.35, -fd / 2 + 0.12),
    new THREE.Vector3(0, yTop + 0.08, -0.25),
  ];
  for (const r of rollers) {
    const roller = P.cylinderX(0.035, filmW + 0.06, M.chrome(), 20, "dancer");
    roller.position.copy(r);
    root.add(roller);
  }
  // película: tramos planos entre el rollo y los rodillos, hasta el cuello
  const webPts = [new THREE.Vector3(0, yRoll + 0.18, zRoll), ...rollers, new THREE.Vector3(0, yTop, -0.05)];
  for (let i = 0; i < webPts.length - 1; i++) {
    const a = webPts[i];
    const b = webPts[i + 1];
    const len = a.distanceTo(b);
    const web = new THREE.Mesh(new THREE.PlaneGeometry(filmW, len), filmMat);
    web.position.copy(a).add(b).multiplyScalar(0.5);
    web.lookAt(b);
    web.rotateX(Math.PI / 2);
    root.add(web);
  }
  // codificadora sobre el recorrido
  const coder = P.box(0.18, 0.14, 0.12, M.paint("#2b2f35", 0.5), 0.02, "coder");
  coder.position.set(filmW / 2 - 0.05, yTop - 0.2, -fd / 2 + 0.22);
  root.add(coder);

  // ------------------------------------------------------------------ cuello, tubo formador, tolva y dosificador
  const yJaw = yBase + 0.42;
  const tubeR = Math.max(0.025, sw / Math.PI);
  const pistons: THREE.Object3D[] = [];
  const hanging: THREE.Mesh[] = [];
  const falling: THREE.Mesh[] = [];
  const sachetMat = filmMat;
  for (let i = 0; i < lanes; i++) {
    const x = laneX(i);
    const collar = P.frustum(tubeR * 1.05, tubeR * 2.6, 0.16, M.polishedSteel(), "forming_collar");
    collar.position.set(x, yTop - 0.16, 0);
    root.add(collar);
    const tube = P.cylinder(tubeR, tubeR, yTop - 0.16 - (yJaw + 0.12), M.polishedSteel(), 24, "forming_tube");
    tube.position.set(x, yJaw + 0.12, 0);
    root.add(tube);
    const filmTube = P.cylinder(tubeR * 1.12, tubeR * 1.12, (yTop - 0.2 - (yJaw + 0.1)) * 0.92, filmMat, 24, undefined, true);
    filmTube.position.set(x, yJaw + 0.1, 0);
    root.add(filmTube);
    // sachet en formación bajo el tubo (se infla con la dosificación)
    const hang = P.box(sw, sh, 0.03, sachetMat, 0.01, "sachet");
    hang.position.set(x, yJaw - sh / 2 + 0.05, 0);
    root.add(hang);
    hanging.push(hang);
    const fall = P.box(sw, sh, 0.025, sachetMat, 0.01, "sachet");
    fall.visible = false;
    root.add(fall);
    falling.push(fall);
  }
  const hopperW = Math.max(0.35, lanes * laneGap);
  const hopper = P.group("hopper");
  const hopperBody = P.frustum(0.12, hopperW / 2, 0.32, steel);
  hopper.add(hopperBody);
  const lid = P.dishedHead(hopperW / 2, M.polishedSteel(), false, 0.12);
  lid.position.y = 0.32;
  hopper.add(lid);
  hopper.position.set(0, yTop + 0.12, 0.12);
  root.add(hopper);
  // tubería de producto desde atrás
  root.add(P.pipe([new THREE.Vector3(0, yTop + 0.3, 0.12), new THREE.Vector3(0, H + 0.15, 0.12), new THREE.Vector3(0, H + 0.15, -D / 2 - 0.3)], 0.025, M.polishedSteel(), 0.1));
  // dosificador de pistón (uno por pista)
  for (let i = 0; i < lanes; i++) {
    const housing = P.cylinder(0.055, 0.055, 0.28, M.polishedSteel(), 20, "dosing_piston");
    housing.position.set(laneX(i), yTop + 0.42, 0.12 + hopperW * 0.15);
    root.add(housing);
    const rod = P.cylinder(0.018, 0.018, 0.22, M.chrome(), 12);
    rod.position.set(laneX(i), yTop + 0.7, 0.12 + hopperW * 0.15);
    root.add(rod);
    pistons.push(rod);
  }

  // ------------------------------------------------------------------ mordazas de sellado
  const jawW = Math.max(0.2, lanes * laneGap + 0.08);
  const jawFront = P.group("jaws");
  const jawBack = P.group();
  const heatMat = new THREE.MeshStandardMaterial({ color: "#3a3f45", metalness: 0.8, roughness: 0.35, emissive: "#ff5a1f", emissiveIntensity: 0.4 });
  for (const [g, s] of [[jawFront, 1], [jawBack, -1]] as [THREE.Group, number][]) {
    const bar = P.box(jawW, 0.07, 0.06, heatMat, 0.01);
    g.add(bar);
    const carriage = P.box(jawW * 0.6, 0.1, 0.12, M.darkSteel(), 0.01);
    carriage.position.z = s * 0.09;
    g.add(carriage);
    g.position.set(0, yJaw, s * 0.16);
    root.add(g);
  }
  // rieles de las mordazas
  for (const sx of [-1, 1]) {
    const rail = P.cylinderZ(0.015, 0.6, M.chrome(), 12);
    rail.position.set((sx * jawW) / 2 + sx * 0.04, yJaw + 0.06, 0);
    root.add(rail);
  }

  // ------------------------------------------------------------------ descarga, gabinete, HMI y baliza
  const chute = P.box(jawW + 0.05, 0.02, 0.5, steel, 0.005, "discharge_chute");
  chute.position.set(0, yBase + 0.04, 0.32);
  chute.rotation.x = 0.35;
  root.add(chute);
  // banda corta de salida sobre patas, con guías laterales
  const zOut = D * 0.45 + 0.3;
  const outBelt = P.slab(jawW + 0.1, 0.04, 0.6, M.rubber(), 0.01);
  outBelt.position.set(0, yBase - 0.1, zOut);
  root.add(outBelt);
  for (const sx of [-1, 1]) {
    const side = P.box(0.03, 0.08, 0.62, steel, 0.005);
    side.position.set((sx * (jawW + 0.14)) / 2, yBase - 0.06, zOut);
    root.add(side);
    for (const dz of [-0.24, 0.24]) {
      const leg = P.cylinder(0.02, 0.02, yBase - 0.1, frameMat, 12);
      leg.position.set((sx * (jawW + 0.1)) / 2, 0, zOut + dz);
      root.add(leg);
    }
  }
  for (const dz of [-0.3, 0.3]) {
    const drum = P.cylinderX(0.035, jawW + 0.1, M.polishedSteel(), 16);
    drum.position.set(0, yBase - 0.08, zOut + dz);
    root.add(drum);
  }

  const cab = P.cabinet(0.5, 0.9, 0.35, "#d9dde1");
  cab.position.set(W / 2 + 0.2, yBase + 0.4, -0.2);
  cab.rotation.y = Math.PI / 2;
  root.add(cab);
  const hmi = P.hmiPanel(0.45);
  hmi.object.position.set(W / 2 - 0.1, yBase + colH * 0.45, D * 0.45);
  hmi.object.rotation.y = -0.4;
  root.add(hmi.object);
  const light = P.stackLight(0.3);
  light.object.position.set(-W / 2 + 0.1, yBase + colH + 0.03, -fd / 2 + 0.1);
  root.add(light.object);
  const plate = P.nameplate([`VFFS ${lanes} PISTA${lanes > 1 ? "S" : ""} · ${Math.round(unitMl)} ML`, product.toUpperCase()], 0.5, 0.12);
  plate.position.set(0, yBase - 0.2, (D * 0.9) / 2 + 0.003);
  root.add(plate);

  // ------------------------------------------------------------------ animación
  let rollAngle = 0;
  let lastFeed = 0;
  let hmiTimer = 0;
  const yFallStart = yJaw - sh / 2 - 0.05;
  const yFallEnd = yBase + 0.05;

  function update(frame: AnimationFrame, dt: number): void {
    const remaining = Math.max(0, Math.min(1, ch(frame, "roll_remaining", 0.8)));
    const r = 0.08 + 0.2 * Math.sqrt(remaining);
    rollMesh.scale.set(1, r, r);
    rollStripe.scale.set(1, r, r);
    const feed = ch(frame, "film_feed");
    const delta = feed >= lastFeed ? feed - lastFeed : feed;
    lastFeed = feed;
    rollAngle -= (delta * sh * 2) / Math.max(0.05, r);
    rollGroup.rotation.x = rollAngle;

    const jaws = ch(frame, "jaws");
    jawFront.position.z = 0.16 - 0.13 * jaws;
    jawBack.position.z = -0.16 + 0.13 * jaws;
    heatMat.emissiveIntensity = 0.25 + 0.5 * jaws;

    const dosing = ch(frame, "dosing");
    pistons.forEach((rod) => (rod.position.y = yTop + 0.7 - 0.12 * dosing));
    hanging.forEach((m) => {
      m.scale.z = 0.4 + 1.6 * dosing;
      m.scale.y = 0.5 + 0.5 * Math.max(dosing, feed);
    });

    const drop = ch(frame, "unit_drop");
    falling.forEach((m, i) => {
      m.visible = drop > 0.02;
      m.position.set(laneX(i), yFallEnd + (yFallStart - yFallEnd) * drop, 0.05 + 0.3 * (1 - drop));
      m.rotation.x = (1 - drop) * 1.2;
    });
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);

    hmiTimer -= dt;
    if (hmiTimer <= 0) {
      hmiTimer = 0.5;
      const v = frame.variables ?? {};
      const f = (k: string, d = 0, u = "") => (typeof v[k] === "number" ? `${(v[k] as number).toFixed(d)} ${u}`.trim() : "—");
      hmi.draw(
        frame.label ?? `VFFS ${Math.round(unitMl)} ML`,
        [
          ["Velocidad", f("speed_upm", 0, "u/min")],
          ["Peso medio", f("fill_weight_avg_g", 1, "g")],
          ["Nominal", f("nominal_weight_g", 1, "g")],
          ["Mordazas", f("jaw_temp_c", 1, "°C")],
          ["Producto", f("product_temp_c", 1, "°C")],
          ["Laminado", f("film_remaining_pct", 0, "%")],
          ["Rechazos", f("units_rejected")],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : frame.state === "fault" ? "#ff3b3b" : "#ffb000",
      );
    }
  }
  update({ channels: {}, state: "idle" }, 0);

  return {
    root,
    size: { dx: W + 0.5, dy: D + 0.6, height: H + 0.2 },
    update,
    dispose: () => disposeObject(root),
  };
}
