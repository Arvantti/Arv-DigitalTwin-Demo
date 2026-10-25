/** Mesa de tendido/corte: mesa larga, capas textiles, marcador, pórtico móvil y cabezal de corte. */
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 13.5);
  const W = num(params, "width_m", 2.5);
  const root = P.group("garment-cutting-line");
  const frame = M.paint("#48545d", 0.42);
  const tabletop = P.box(L, 0.16, W, M.paint("#91a6aa", 0.62), 0.025); tabletop.position.y = 0.82; root.add(tabletop);
  for (let s of [-1, 1]) for (const x of [-L * 0.47, 0, L * 0.47]) {
    const leg = P.box(0.08, 0.8, 0.08, frame, 0.008); leg.position.set(x, 0.4, s * (W * 0.43)); root.add(leg);
  }
  const underrail = P.box(L * 0.94, 0.08, 0.1, M.galvanized(), 0.012); underrail.position.set(0, 0.22, 0); root.add(underrail);
  // Paquetes de capas de tejido extendidos a lo largo del marcador.
  for (let layer = 0; layer < 5; layer++) {
    const fabric = P.box(L * 0.91, 0.035, W * 0.78, M.paint(["#4a6786", "#697f94", "#526b86", "#7890a1", "#5c7890"][layer], 0.85), 0.008);
    fabric.position.set(0, 0.91 + layer * 0.035, 0); root.add(fabric);
  }
  const paper = P.box(L * 0.88, 0.008, W * 0.73, M.paint("#ded9c6", 0.8), 0.001); paper.position.set(0, 1.095, 0); root.add(paper);
  // Líneas de tizado/piezas de patrón visibles sobre el papel.
  for (let i = 0; i < 14; i++) {
    const piece = P.box(0.36 + (i % 3) * 0.08, 0.01, 0.58, M.paint(i % 2 ? "#425a73" : "#a64d48", 0.7), 0.015);
    piece.position.set(-L * 0.4 + i * (L * 0.8 / 13), 1.105, (i % 2 ? 0.42 : -0.4)); piece.rotation.y = (i % 2 ? 0.13 : -0.11); root.add(piece);
  }
  // Pórtico que recorre el tendido, guías longitudinales, carro y cabezal protegido.
  for (const z of [-W * 0.49, W * 0.49]) {
    const rail = P.box(L * 0.98, 0.13, 0.12, M.galvanized(), 0.02); rail.position.set(0, 1.2, z); root.add(rail);
  }
  const gantry = P.box(0.16, 0.55, W * 1.05, frame, 0.025); gantry.position.set(-L * 0.35, 1.45, 0); root.add(gantry);
  const carriage = P.box(0.52, 0.2, 0.48, M.paint("#e5b63c", 0.42), 0.025); carriage.position.set(-L * 0.35, 1.62, 0); root.add(carriage);
  const cutter = P.box(0.28, 0.34, 0.25, M.paint("#d8e0e4", 0.35), 0.035); cutter.position.set(-L * 0.35, 1.38, 0.08); root.add(cutter);
  const head = P.cylinder(0.07, 0.07, 0.34, M.darkSteel(), 20); head.position.set(-L * 0.35, 1.11, 0.08); root.add(head);
  const markerRoll = P.cylinderX(0.12, W * 0.8, M.paint("#ede8d6", 0.75), 24); markerRoll.position.set(-L * 0.47, 1.43, 0); root.add(markerRoll);
  const beacon = P.stackLight(0.22); beacon.object.position.set(L * 0.46, 1.62, -W * 0.4); root.add(beacon.object);
  const operator = P.operator("#e5b63c", "#385c78", { gender: "female", skin: "#b8856a" });
  operator.object.position.set(-L * 0.44, 0, W * 0.72); operator.object.scale.setScalar(0.68); root.add(operator.object);
  const hmi = P.hmiPanel(0.3); hmi.object.position.set(L * 0.42, 1.05, W * 0.6); root.add(hmi.object);
  function update(frame: AnimationFrame): void {
    const progress = ch(frame, "progress");
    gantry.position.x = -L * 0.35 + L * 0.7 * progress;
    carriage.position.x = gantry.position.x;
    cutter.position.x = gantry.position.x;
    head.position.x = gantry.position.x;
    const v = frame.variables ?? {};
    hmi.draw("CORTE · TENDIDO", [["Rollos", String(v.rolls_queue ?? 0)], ["Polo", String(v.polo_cut ?? 0)], ["Oversize", String(v.oversize_cut ?? 0)]], frame.state.toUpperCase(), "#41d37d");
    operator.setPose(ch(frame, "cutting"));
    beacon.set(ch(frame, "stack_light", 0), performance.now() / 1000);
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: L, dy: W + 0.55, height: 2.0 }, update, dispose: () => disposeObject(root) };
}
