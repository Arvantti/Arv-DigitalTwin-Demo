/**
 * Geometría paramétrica de la estación manual de equipaje. Mesa de rodillos de llegada en el extremo -X, mesas de
 * atención (una por operario) en el centro con el operario del lado +Z, y banda de reingreso al clasificador a lo
 * largo del borde -Z. En nivel 3 lleva detector de trazas y mampara de vidrio; en codificación, un puesto con terminal.
 *
 * Relaciones: largo = operarios × 2,4 m + 2 m (mínimo 4 m); fondo = 5 m (nivel 3) o 3 m (codificación).
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
  const role = str(params, "role", "l3");
  const ops = Math.max(1, Math.round(num(params, "operators", 3)));
  const l3 = role === "l3";
  const DX = Math.max(4, ops * 2.4 + 2);
  const DZ = l3 ? 5 : 3;
  const root = P.group("bag-handling-station");
  const steel = M.stainless();
  const tableMat = M.paint("#d5d9dd", 0.4);

  // banda de reingreso
  const zBelt = -DZ / 2 + 0.55;
  const beltL = DX - 0.4;
  const belt = P.box(beltL, 0.06, 0.9, M.rubber(), 0.01, "return_belt");
  belt.position.set(0, 0.72, zBelt);
  root.add(belt);
  for (const side of [-1, 1]) {
    const rail = P.box(beltL, 0.14, 0.04, steel, 0.005);
    rail.position.set(0, 0.78, zBelt + side * 0.47);
    root.add(rail);
    for (const lx of [-1, 1]) {
      const leg = P.box(0.05, 0.69, 0.05, steel, 0.005);
      leg.position.set(lx * (beltL / 2 - 0.2), 0.345, zBelt + side * 0.42);
      root.add(leg);
    }
  }

  // mesa de rodillos de llegada
  const arrival = P.group("arrival_table");
  const rollers = 14;
  for (let i = 0; i < rollers; i++) {
    const roll = P.cylinderZ(0.03, 0.9, M.polishedSteel(), 14);
    roll.position.set(-0.75 + i * 0.115, 0.8, 0);
    arrival.add(roll);
  }
  for (const side of [-1, 1]) {
    const rail = P.box(1.7, 0.08, 0.04, steel, 0.005);
    rail.position.set(0, 0.78, side * 0.47);
    arrival.add(rail);
  }
  for (const lx of [-1, 1]) {
    for (const lz of [-1, 1]) {
      const leg = P.box(0.05, 0.76, 0.05, steel, 0.005);
      leg.position.set(lx * 0.75, 0.38, lz * 0.42);
      arrival.add(leg);
    }
  }
  const zWork = l3 ? 0.3 : 0.4;
  arrival.position.set(-DX / 2 + 1.0, 0, zWork);
  root.add(arrival);

  // mesas de atención con su operario
  const tableX: number[] = [];
  const operators: THREE.Object3D[] = [];
  for (let i = 0; i < ops; i++) {
    const x = -DX / 2 + 2.2 + i * 2.4;
    tableX.push(x);
    const top = P.box(1.8, 0.05, 0.9, tableMat, 0.01, "inspection_tables");
    top.position.set(x, 0.86, zWork);
    root.add(top);
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        const leg = P.box(0.05, 0.84, 0.05, steel, 0.005);
        leg.position.set(x + lx * 0.82, 0.42, zWork + lz * 0.38);
        root.add(leg);
      }
    }
    const fig = P.operator(l3 ? "#1d3557" : "#2f5f8f", "#e9eef2", l3 ? { helmet: "#1d3557" } : { civilian: true });
    fig.object.position.set(x, 0, zWork + 0.95);
    fig.object.rotation.y = Math.PI;
    fig.setPose(0.7);
    fig.object.name = "operators";
    root.add(fig.object);
    operators.push(fig.object);
  }
  if (l3) {
    // detector de trazas y mampara de vidrio hacia el pasajero (+Z)
    const etd = P.cabinet(0.45, 0.5, 0.4, "#e3e6e9");
    etd.position.set(DX / 2 - 0.5, 0.88, zWork);
    etd.name = "trace_detector";
    root.add(etd);
    const glass = P.box(DX - 0.2, 0.6, 0.02, M.glass("#cfe6f5", 0.12), 0.01, "partition");
    glass.position.set(0, 1.0, DZ / 2 - 0.1);
    root.add(glass);
    const sill = P.box(DX - 0.2, 0.7, 0.08, M.paint("#2c3e50", 0.5), 0.01);
    sill.position.set(0, 0.35, DZ / 2 - 0.1);
    root.add(sill);
  }
  const term = P.box(0.5, 0.34, 0.04, M.darkSteel(), 0.01, "terminal");
  term.position.set(tableX[0] + 0.6, 1.1, zWork - 0.35);
  root.add(term);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), M.emissive("#5fb4ff", 0.6));
  glow.position.set(tableX[0] + 0.6, 1.1, zWork - 0.325);
  root.add(glow);

  const light = P.stackLight(0.4);
  light.object.position.set(DX / 2 - 0.25, 0.75, zBelt);
  root.add(light.object);

  // maletas: en la mesa de llegada, abiertas en las mesas y en la banda de reingreso
  const bags = P.bagInstances(24, 0.7);
  root.add(bags);
  const lidMat = M.paint("#2b2f33", 0.6);
  const lids: THREE.Mesh[] = tableX.map((x) => {
    const lid = P.box(0.7, 0.03, 0.45, lidMat, 0.01);
    lid.position.set(x, 1.08, zWork - 0.35);
    lid.rotation.x = -1.1;
    lid.visible = false;
    root.add(lid);
    return lid;
  });
  const m = new THREE.Matrix4();
  let time = 0;

  function update(frame: AnimationFrame, dt: number): void {
    time += dt;
    let k = 0;
    const queue = Math.min(4, Math.round(ch(frame, "queue")));
    for (let i = 0; i < queue; i++) bags.setMatrixAt(k++, m.makeTranslation(-DX / 2 + 0.6 + (i % 2) * 0.75, 0.83 + Math.floor(i / 2) * 0.25, zWork));
    const busy = Math.min(ops, Math.round(ch(frame, "in_process")));
    for (let i = 0; i < ops; i++) {
      lids[i].visible = i < busy;
      if (i < busy) bags.setMatrixAt(k++, m.makeTranslation(tableX[i], 0.885, zWork));
    }
    const travel = ch(frame, "belt_travel");
    if (travel > 0) {
      const x = -beltL / 2 + 0.4 + ((travel / 10) * (beltL - 0.8)) % (beltL - 0.8);
      bags.setMatrixAt(k++, m.makeTranslation(x, 0.75, zBelt));
    }
    bags.count = k;
    bags.instanceMatrix.needsUpdate = true;
    light.set(ch(frame, "stack_light"), time);
  }
  update({ channels: { queue: 2, in_process: Math.min(ops, 2), belt_travel: 3, stack_light: 1 }, state: "running" }, 0);

  return {
    root,
    size: { dx: DX, dy: DZ, height: 2.4 },
    update: (frame, dt) => update(frame, dt),
    dispose: () => disposeObject(root),
  };
}
