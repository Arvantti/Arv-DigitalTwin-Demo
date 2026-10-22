/** Estanterías de producto terminado con paquetes etiquetados por referencia y ocupación viva. */
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const racks = Math.max(1, Math.round(num(params, "rack_count", 2)));
  const root = P.group("garment-finished-goods-store");
  const width = 2.2;
  for (let r = 0; r < racks; r++) {
    const x = (r - (racks - 1) / 2) * 2.55;
    for (const z of [-0.52, 0.52]) {
      const post = P.box(0.065, 3.4, 0.065, M.paint("#42657d", 0.4), 0.009); post.position.set(x, 1.7, z); root.add(post);
    }
    for (let level = 0; level < 4; level++) {
      const y = 0.45 + level * 0.78;
      const shelf = P.box(width, 0.07, 1.05, M.galvanized(), 0.012); shelf.position.set(x, y, 0); root.add(shelf);
      for (let box = 0; box < 3; box++) {
        const color = (box + level + r) % 2 ? "#527794" : "#a36f55";
        const carton = P.box(0.58, 0.52, 0.78, M.paint(color, 0.78), 0.035);
        carton.position.set(x - 0.65 + box * 0.65, y + 0.3, 0); root.add(carton);
        const label = P.box(0.24, 0.18, 0.02, M.paint("#ece9dd", 0.65), 0.006); label.position.set(carton.position.x, y + 0.36, 0.4); root.add(label);
      }
    }
  }
  const hmi = P.hmiPanel(0.27); hmi.object.position.set(0, 1.65, 0.82); root.add(hmi.object);
  function update(frame: AnimationFrame): void {
    const v = frame.variables ?? {};
    const fill = ch(frame, "fill");
    hmi.draw("PRODUCTO TERMINADO", [["Polo", String(v.polo_stock ?? 0)], ["Oversize", String(v.oversize_stock ?? 0)], ["Ocupación", `${Math.round(Number(v.capacity_pct ?? 0))}%`]], frame.state.toUpperCase(), "#42c984");
    // El inventario es acumulativo; la luz cambia a ámbar al aproximarse al límite.
    const lamp = root.getObjectByName("warehouse-beacon");
    if (lamp) lamp.position.y = 2.0 + fill * 0.15;
  }
  const beacon = P.stackLight(0.18); beacon.object.name = "warehouse-beacon"; beacon.object.position.set(width * racks / 2, 3.6, -0.5); root.add(beacon.object);
  function updateWithLight(frame: AnimationFrame): void {
    update(frame);
    beacon.set(ch(frame, "fill") > 0.9 ? 2 : 1, performance.now() / 1000);
  }
  updateWithLight({ channels: {}, state: "idle" });
  return { root, size: { dx: racks * 2.55 + 0.4, dy: 2.0, height: 3.8 }, update: updateWithLight, dispose: () => disposeObject(root) };
}
