/** Rack de tela con rollos visibles y lectura de ocupación del inventario. */
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const maxRolls = num(params, "max_rolls", 120);
  const root = P.group("fabric-roll-store");
  const blue = M.paint("#355f7e", 0.4);
  const galvanized = M.galvanized();
  for (let level = 0; level < 3; level++) {
    const y = 0.75 + level * 1.12;
    const shelf = P.box(4.6, 0.09, 1.05, galvanized, 0.015); shelf.position.set(0, y, 0); root.add(shelf);
    for (const x of [-2.2, 2.2]) for (const z of [-0.45, 0.45]) {
      const post = P.box(0.07, 3.45, 0.07, blue, 0.008); post.position.set(x, 1.72, z); root.add(post);
    }
    for (let i = 0; i < 5; i++) {
      const roll = P.cylinderX(0.32, 0.72, M.paint(["#d7d2c5", "#6b8291", "#bd7f65", "#667a58", "#c7b15d"][i], 0.88), 36);
      roll.position.set(-1.75 + i * 0.87, y + 0.4, 0); root.add(roll);
      const core = P.cylinderX(0.06, 0.75, M.paint("#8c8e8f", 0.6), 16); core.position.copy(roll.position); root.add(core);
      const end = P.cylinderX(0.34, 0.025, M.paint("#dfe4e5", 0.4), 36); end.position.set(-1.75 + i * 0.87 + 0.36, y + 0.4, 0); root.add(end);
    }
    const label = P.box(0.42, 0.17, 0.025, M.paint("#e9eeee", 0.25), 0.006); label.position.set(-1.9, y + 0.2, 0.54); root.add(label);
  }
  const beacon = P.stackLight(0.24); beacon.object.position.set(2.35, 3.55, -0.42); root.add(beacon.object);
  const panel = P.hmiPanel(0.28); panel.object.position.set(2.15, 1.7, 0.62); root.add(panel.object);
  function update(frame: AnimationFrame): void {
    const stock = Number(frame.variables?.rolls_on_hand ?? 0);
    panel.draw("ALMACÉN TELA", [["Rollos", String(stock)], ["Salidas", String(frame.variables?.rolls_issued ?? 0)], ["Ocupación", `${Math.round(100 * stock / maxRolls)}%`]], frame.state.toUpperCase(), "#44c781");
    beacon.set(ch(frame, "stack_light", stock ? 1 : 2), performance.now() / 1000);
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: 5.2, dy: 1.8, height: 3.8 }, update, dispose: () => disposeObject(root) };
}
