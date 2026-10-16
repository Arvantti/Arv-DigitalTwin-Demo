/**
 * Geometría de la encajadora: bastidor con guardas, almacén de cajas plegadas, caja en armado
 * con solapas que cierran, cabezal de cinta, banda de entrada con el pulmón de sachets y
 * transportador de rodillos de salida. Flujo hacia +X.
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
  const cs = num(params, "case_size_m", 0.4);
  const upc = Math.round(num(params, "units_per_case", 24));
  const color = str(params, "item_color", "#c62828");
  const L = 3.0;
  const W = 2.0;
  const H = 2.0;
  const yWork = 0.8;
  const root = P.group("case-packer");
  const alu = M.aluminum();
  const cardboard = M.paint("#b08a5a", 0.9);

  // bastidor y guardas de policarbonato
  const frameL = 1.6;
  const base = P.slab(frameL, yWork, W * 0.7, M.paint("#d9dde1", 0.45), 0.03, "frame");
  root.add(base);
  const guards = P.group("guards");
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = P.box(0.045, H - yWork, 0.045, alu, 0.006);
      post.position.set((sx * frameL) / 2, yWork + (H - yWork) / 2, (sz * W * 0.7) / 2);
      guards.add(post);
    }
  }
  for (const [x, z, w, rot] of [
    [0, (W * 0.7) / 2, frameL, 0],
    [0, -(W * 0.7) / 2, frameL, 0],
  ] as [number, number, number, number][]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, H - yWork - 0.06), M.glass("#e6f2ff", 0.14));
    pane.position.set(x, yWork + (H - yWork) / 2, z);
    pane.rotation.y = rot;
    pane.renderOrder = 2;
    guards.add(pane);
  }
  const roof = P.box(frameL, 0.04, W * 0.7, alu, 0.006);
  roof.position.y = H;
  guards.add(roof);
  root.add(guards);

  // almacén de cajas plegadas (atrás)
  const magazine = P.group("box_magazine");
  for (let i = 0; i < 18; i++) {
    const flat = P.box(cs * 1.6, 0.012, cs * 1.1, cardboard, 0.002);
    flat.position.y = yWork + 0.05 + i * 0.014;
    flat.rotation.z = 1.2;
    magazine.add(flat);
  }
  magazine.position.set(-0.2, 0.1, -(W * 0.7) / 2 + 0.2);
  root.add(magazine);

  // caja en proceso con solapas
  const ch_ = cs * 0.7;
  const caseG = P.group("case");
  const sides = [
    [0, ch_ / 2, cs * 0.4, cs, ch_, 0.008],
    [0, ch_ / 2, -cs * 0.4, cs, ch_, 0.008],
    [cs / 2, ch_ / 2, 0, 0.008, ch_, cs * 0.8],
    [-cs / 2, ch_ / 2, 0, 0.008, ch_, cs * 0.8],
    [0, 0.004, 0, cs, 0.008, cs * 0.8],
  ];
  for (const [x, y, z, w, h, d] of sides) {
    const s = P.box(w, h, d, cardboard, 0.002);
    s.position.set(x, y, z);
    caseG.add(s);
  }
  const flaps: THREE.Object3D[] = [];
  for (const sz of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0, ch_, sz * cs * 0.4);
    const flap = P.box(cs, 0.006, cs * 0.4, cardboard, 0.002, "flaps");
    flap.position.z = sz * cs * 0.2;
    hinge.add(flap);
    caseG.add(hinge);
    flaps.push(hinge);
  }
  // sachets dentro de la caja (se llenan con el avance del ciclo)
  const itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 });
  const cols = Math.ceil(Math.sqrt(upc / 2));
  const rows = Math.ceil(upc / cols);
  const inside = new THREE.InstancedMesh(new THREE.BoxGeometry((cs * 0.9) / cols, 0.03, (cs * 0.7) / rows), itemMat, upc);
  const m = new THREE.Matrix4();
  for (let i = 0; i < upc; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols) % rows;
    const layer = Math.floor(i / (cols * rows));
    inside.setMatrixAt(i, m.makeTranslation(-cs * 0.45 + ((c + 0.5) * cs * 0.9) / cols, 0.03 + layer * 0.035, -cs * 0.35 + ((r + 0.5) * cs * 0.7) / rows));
  }
  caseG.add(inside);
  caseG.position.set(0, yWork, 0);
  root.add(caseG);

  // cabezal de cinta
  const tape = P.group("tape_head");
  const body = P.box(0.25, 0.22, 0.15, M.paint("#3a3f45", 0.5), 0.02);
  tape.add(body);
  const roll = P.cylinderZ(0.09, 0.05, M.paint("#c8a46a", 0.6), 24);
  roll.position.set(0.05, 0.14, 0);
  tape.add(roll);
  tape.position.set(0, yWork + ch_ + 0.35, 0);
  root.add(tape);

  // banda de entrada con pulmón de sachets
  const infeed = P.slab(1.0, 0.04, 0.4, M.rubber(), 0.01, "infeed");
  infeed.position.set(-L / 2 + 0.5, yWork - 0.04, 0);
  root.add(infeed);
  const legsIn = P.slab(0.9, yWork - 0.04, 0.35, M.stainless(), 0.01);
  legsIn.position.set(-L / 2 + 0.5, 0, 0);
  legsIn.scale.set(1, 1, 1);
  root.add(legsIn);
  const buffer = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.09), itemMat, 30);
  for (let i = 0; i < 30; i++) buffer.setMatrixAt(i, m.makeTranslation(-L / 2 + 0.08 + (i % 10) * 0.095, yWork + 0.015 + Math.floor(i / 10) * 0.032, ((i % 3) - 1) * 0.11));
  root.add(buffer);

  // salida de rodillos con la caja terminada
  const outfeed = P.group("outfeed");
  const n = 12;
  const rgeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 12);
  rgeo.rotateX(Math.PI / 2);
  const rollers = new THREE.InstancedMesh(rgeo, M.polishedSteel(), n);
  for (let i = 0; i < n; i++) rollers.setMatrixAt(i, m.makeTranslation(L / 2 - 0.65 + i * 0.065, yWork - 0.05, 0));
  outfeed.add(rollers);
  for (const dx of [-0.6, 0.1]) {
    for (const sz of [-1, 1]) {
      const leg = P.cylinder(0.02, 0.02, yWork - 0.08, M.stainless(), 12);
      leg.position.set(L / 2 - 0.3 + dx, 0, sz * 0.25);
      outfeed.add(leg);
    }
  }
  for (const sz of [-1, 1]) {
    const rail = P.box(0.8, 0.05, 0.03, M.stainless(), 0.005);
    rail.position.set(L / 2 - 0.27, yWork - 0.05, sz * 0.29);
    outfeed.add(rail);
  }
  const done = P.group();
  const closed = P.box(cs, ch_, cs * 0.8, cardboard, 0.004);
  closed.position.y = ch_ / 2;
  done.add(closed);
  const tapeStrip = P.box(cs * 1.01, 0.002, 0.05, M.paint("#c8a46a", 0.5), 0);
  tapeStrip.position.y = ch_ + 0.001;
  done.add(tapeStrip);
  done.position.set(L / 2 - 0.3, yWork - 0.02, 0);
  outfeed.add(done);
  root.add(outfeed);

  const light = P.stackLight(0.25);
  light.object.position.set(frameL / 2 - 0.05, H, (W * 0.7) / 2 - 0.05);
  root.add(light.object);
  const plate = P.nameplate([`ENCAJADORA · ${upc} U/CAJA`], 0.45, 0.07);
  plate.position.set(0, yWork - 0.25, (W * 0.7) / 2 + 0.002);
  root.add(plate);

  function update(frame: AnimationFrame): void {
    const prog = ch(frame, "case_progress");
    const flapsV = ch(frame, "flaps");
    flaps.forEach((hinge, i) => (hinge.rotation.x = (i === 0 ? -1 : 1) * (1 - flapsV) * 1.9));
    caseG.visible = prog > 0.02;
    caseG.scale.y = Math.min(1, 0.2 + prog * 3);
    inside.count = Math.max(0, Math.min(upc, Math.round(((prog - 0.3) / 0.4) * upc)));
    tape.position.x = flapsV > 0 ? -cs / 2 + cs * flapsV : -cs / 2;
    buffer.count = Math.round(30 * ch(frame, "buffer_fill"));
    done.visible = frame.state === "blocked" || prog > 0.98;
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
  }
  update({ channels: { case_progress: 0.6, buffer_fill: 0.5 }, state: "idle" });

  return { root, size: { dx: L, dy: W, height: H + 0.4 }, update: (f) => update(f), dispose: () => disposeObject(root) };
}
