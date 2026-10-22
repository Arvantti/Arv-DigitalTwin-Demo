/** Mesa de inspección de confecciones con prendas plegadas, herramientas de limpieza y panel de calidad. */
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 5), W = num(params, "width_m", 2);
  const root = P.group("garment-inspection-table");
  const top = P.slab(L, 0.08, W, M.paint("#d7dcdf", 0.45), 0.02); top.position.y = 0.84; root.add(top);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = P.box(0.06, 0.82, 0.06, M.paint("#47545d", 0.45), 0.007); leg.position.set(x * (L / 2 - 0.16), 0.41, z * (W / 2 - 0.14)); root.add(leg);
  }
  const folded = M.paint("#315c85", 0.88);
  for (let i = 0; i < 5; i++) {
    const garment = P.box(0.72, 0.075, 0.6, folded, 0.035); garment.position.set(-L * 0.31 + i * 0.42, 0.93 + (i % 2) * 0.08, -0.25); root.add(garment);
    const seam = P.box(0.5, 0.008, 0.012, M.paint("#e2d8bc", 0.55), 0.003); seam.position.set(garment.position.x, garment.position.y + 0.041, -0.24); root.add(seam);
  }
  const scissors = P.box(0.26, 0.025, 0.12, M.paint("#4e5e66", 0.3), 0.025); scissors.position.set(L * 0.28, 0.91, 0.32); root.add(scissors);
  const lintTool = P.cylinder(0.045, 0.045, 0.2, M.paint("#d0b05a", 0.45), 14); lintTool.rotation.x = Math.PI / 2; lintTool.position.set(L * 0.34, 0.96, 0.3); root.add(lintTool);
  const lamp = P.box(0.045, 0.68, 0.045, M.paint("#424b52", 0.4), 0.006); lamp.position.set(0, 1.2, -W * 0.42); root.add(lamp);
  const light = P.box(0.68, 0.045, 0.08, M.emissive("#f4f0d7", 1.1), 0.018); light.position.set(0, 1.53, -W * 0.42); root.add(light);
  const inspector = P.operator("#bd9b42", "#526b77", { gender: "female", skin: "#b47d5d", hair: "#30231d" }); inspector.object.position.set(0, 0, W / 2 + 0.45); inspector.object.scale.setScalar(0.72); root.add(inspector.object);
  const panel = P.hmiPanel(0.28); panel.object.position.set(L * 0.38, 1.1, -W * 0.38); root.add(panel.object);
  function update(frame: AnimationFrame): void {
    inspector.setPose(ch(frame, "working"));
    panel.draw("INSPECCIÓN FINAL", [["Polo", String(frame.variables?.polo_good ?? 0)], ["Oversize", String(frame.variables?.oversize_good ?? 0)]], frame.state.toUpperCase(), "#43ca85");
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: L + 0.8, dy: W + 1.0, height: 1.8 }, update, dispose: () => disposeObject(root) };
}
