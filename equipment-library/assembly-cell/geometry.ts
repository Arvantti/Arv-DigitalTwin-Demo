/**
 * Geometría de la celda de ensamble manual: mesa de trabajo de acero con dos cubetas inclinadas de componentes
 * (A a la izquierda, B a la derecha; se llenan según las cubetas), dispositivo de sujeción con la unidad en curso
 * (el componente A baja sobre el B según el avance del ciclo), bandeja de salida, operarios de pie del lado +Z
 * (se inclinan y mueven los brazos mientras arman), tapete con franja de seguridad, pantalla y baliza.
 * Mesa sobre +X; los operarios miran a -Z hacia la mesa.
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

const MAX_BIN_PARTS = 48;

export default function build(params: Params): EquipmentModel {
  const operators = Math.max(1, Math.min(4, Math.round(num(params, "operators", 1))));
  const colorA = str(params, "color_a", "#1e6fd9");
  const colorB = str(params, "color_b", "#d9531e");
  const operation = str(params, "operation", "ENSAMBLE");
  const L = 1.6 + 0.9 * operators + 1.0;
  const tableL = L - 1.0;
  const yTop = 0.9;
  const root = P.group("assembly-cell");
  const steel = M.stainless();
  const dark = M.paint("#3a4047", 0.5);
  const matA = M.plastic(colorA);
  const matB = M.plastic(colorB);

  // mesa de trabajo con estante inferior y tablero posterior
  const top = P.slab(tableL, 0.05, 0.85, steel, 0.01, "table");
  top.position.set(0, yTop - 0.025, 0);
  root.add(top);
  const shelf = P.slab(tableL - 0.1, 0.03, 0.75, steel, 0.008);
  shelf.position.set(0, 0.25, 0);
  root.add(shelf);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = P.box(0.06, yTop - 0.05, 0.06, dark, 0.008);
      leg.position.set(sx * (tableL / 2 - 0.08), (yTop - 0.05) / 2, sz * 0.36);
      root.add(leg);
    }
  }
  const board = P.slab(tableL, 0.7, 0.04, M.paint("#9aa3ab", 0.6), 0.008);
  board.position.set(0, yTop + 0.35, -0.42);
  root.add(board);
  // herramientas colgadas del tablero
  for (let i = 0; i < 4; i++) {
    const tool = P.cylinder(0.012, 0.012, 0.28, M.paint(i % 2 ? "#f2b705" : "#c0392b", 0.5), 10);
    tool.position.set(-tableL / 2 + 0.5 + i * 0.22, yTop + 0.5, -0.38);
    tool.rotation.z = 0.1 * (i - 1.5);
    root.add(tool);
  }

  // cubetas inclinadas de componentes
  function makeBin(name: string, mat: THREE.Material, x: number): { group: THREE.Group; fill: THREE.InstancedMesh } {
    const bin = P.group(name);
    const shell = M.paint("#d8b13a", 0.6);
    const tray = P.slab(0.6, 0.04, 0.4, shell, 0.01);
    bin.add(tray);
    for (const [px, pz, w, d] of [
      [0, 0.2, 0.6, 0.02],
      [-0.3, 0, 0.02, 0.4],
      [0.3, 0, 0.02, 0.4],
    ] as [number, number, number, number][]) {
      const wall = P.box(w, 0.14, d, shell, 0.006);
      wall.position.set(px, 0.09, pz);
      bin.add(wall);
    }
    const low = P.box(0.6, 0.06, 0.02, shell, 0.006);
    low.position.set(0, 0.05, -0.2);
    bin.add(low);
    const pieces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.045, 0.06), mat, MAX_BIN_PARTS);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < MAX_BIN_PARTS; i++) {
      const c = i % 6;
      const r = Math.floor(i / 6) % 4;
      const layer = Math.floor(i / 24);
      q.setFromEuler(new THREE.Euler(0, ((i * 29) % 13) * 0.07 - 0.4, 0));
      m.compose(new THREE.Vector3(-0.23 + c * 0.092, 0.055 + layer * 0.045, -0.13 + r * 0.085), q, new THREE.Vector3(1, 1, 1));
      pieces.setMatrixAt(i, m);
    }
    pieces.castShadow = true;
    bin.add(pieces);
    bin.rotation.x = 0.12;
    bin.position.set(x, yTop + 0.07, 0.02);
    root.add(bin);
    return { group: bin, fill: pieces };
  }
  const binA = makeBin("bin_a", matA, -tableL / 2 + 0.45);
  const binB = makeBin("bin_b", matB, tableL / 2 - 0.45);

  // dispositivo de sujeción con la unidad en curso
  const fixture = P.group("fixture");
  fixture.add(P.slab(0.5, 0.05, 0.4, dark, 0.01));
  for (const sx of [-1, 1]) {
    const jaw = P.box(0.04, 0.1, 0.3, M.paint("#f2b705", 0.5), 0.005);
    jaw.position.set(sx * 0.2, 0.07, 0);
    fixture.add(jaw);
  }
  fixture.position.set(0, yTop, 0.05);
  root.add(fixture);
  const unit = P.group("unit_in_progress");
  const base = P.box(0.3, 0.1, 0.22, matB, 0.015);
  base.position.y = 0.1;
  unit.add(base);
  const insert = P.box(0.12, 0.06, 0.16, matA, 0.012, "insert");
  unit.add(insert);
  unit.position.set(0, yTop + 0.03, 0.05);
  root.add(unit);

  // bandeja de salida con las unidades terminadas
  const tray = P.group("output_tray");
  tray.add(P.slab(0.55, 0.03, 0.4, M.paint("#9aa3ab", 0.5), 0.01));
  const doneUnits = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const done = P.box(0.28, 0.1, 0.18, matB, 0.012);
    done.position.set(0, 0.07 + i * 0.105, 0);
    const donePart = P.box(0.11, 0.05, 0.14, matA, 0.01);
    donePart.position.set(0, 0.07 + i * 0.105 + 0.07, 0);
    doneUnits.add(done, donePart);
  }
  doneUnits.visible = false;
  tray.add(doneUnits);
  tray.position.set(tableL / 2 - 0.35, 0.0, 0.55);
  root.add(tray);
  const trayStand = P.slab(0.5, 0.55, 0.36, dark, 0.01);
  trayStand.position.set(tableL / 2 - 0.35, 0.275, 0.55);
  root.add(trayStand);
  tray.position.y = 0.56;

  // operarios
  const figures: ReturnType<typeof P.operator>[] = [];
  for (let i = 0; i < operators; i++) {
    const fig = P.operator(i % 2 ? "#f2b705" : "#f26b1d", i % 2 ? "#4a6b3a" : "#2f5f8f");
    fig.object.rotation.y = Math.PI;
    fig.object.position.set((i - (operators - 1) / 2) * 0.85, 0.015, 0.72);
    root.add(fig.object);
    figures.push(fig);
  }

  // tapete antifatiga y franja de seguridad
  const W = 1.9;
  const mat = P.slab(tableL - 0.4, 0.015, 0.62, M.rubber(), 0.004);
  mat.position.set(0, 0, 0.75);
  root.add(mat);
  for (const [x, z, w, d] of [
    [0, 0.42, tableL - 0.2, 0.05],
    [0, 1.1, tableL - 0.2, 0.05],
    [-(tableL - 0.2) / 2, 0.76, 0.05, 0.73],
    [(tableL - 0.2) / 2, 0.76, 0.05, 0.73],
  ] as [number, number, number, number][]) {
    const tape = P.box(w, 0.004, d, M.hazard(), 0);
    tape.position.set(x, 0.01, z);
    root.add(tape);
  }

  const hmi = P.hmiPanel(0.35);
  hmi.object.position.set(-tableL / 2 + 0.2, yTop, -0.1);
  hmi.object.scale.setScalar(0.8);
  root.add(hmi.object);
  const light = P.stackLight(0.4);
  light.object.position.set(tableL / 2 - 0.1, yTop + 0.7, -0.42);
  root.add(light.object);

  let lastKey = "";
  function update(frame: AnimationFrame, dt = 0.016): void {
    const fa = Math.max(0, Math.min(1, ch(frame, "bin_a_fill")));
    const fb = Math.max(0, Math.min(1, ch(frame, "bin_b_fill")));
    binA.fill.count = Math.round(MAX_BIN_PARTS * fa);
    binB.fill.count = Math.round(MAX_BIN_PARTS * fb);
    const cycle = Math.max(0, Math.min(1, ch(frame, "cycle")));
    const working = ch(frame, "working") > 0.5;
    // el componente A baja sobre la base según el avance del ciclo
    unit.visible = cycle > 0 || working;
    insert.position.y = 0.2 + 0.3 * (1 - cycle) * (cycle > 0 ? 1 : 0);
    const t = performance.now() / 1000;
    for (const [i, fig] of figures.entries()) {
      fig.setPose(working ? 0.7 + 0.3 * Math.sin(t * 3 + i) : 0);
    }
    doneUnits.visible = ch(frame, "output_fill") > 0.5;
    light.set(ch(frame, "stack_light", 0), t);
    const v = frame.variables ?? {};
    const key = `${frame.state}|${v.units_assembled ?? ""}|${v.bin_a_units ?? ""}|${v.bin_b_units ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      hmi.draw(
        frame.label ?? operation.toUpperCase().slice(0, 18),
        [
          ["Unidades", String(v.units_assembled ?? "—")],
          ["Cubeta A", String(v.bin_a_units ?? "—")],
          ["Cubeta B", String(v.bin_b_units ?? "—")],
        ],
        frame.state.toUpperCase(),
        frame.state === "running" ? "#22e06b" : "#ffb000",
      );
    }
    void dt;
  }
  update({ channels: { bin_a_fill: 0.6, bin_b_fill: 0.5, cycle: 0.5, working: 1, output_fill: 1, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: 2.1 }, update: (f) => update(f), dispose: () => disposeObject(root) };
}
