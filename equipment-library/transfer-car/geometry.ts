/**
 * Geometría del carro de transferencia: dos rieles a lo largo de +X, el carro con rodillos y la pila que lleva.
 * La posición de carga está a home_offset_m del extremo -X; el carro avanza hacia +X los metros del canal car_pos_m.
 */
import {
  type AnimationFrame,
  type EquipmentModel,
  type Params,
  ch,
  disposeObject,
  materials as M,
  num,
  parts as P,
} from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "rail_length_m", 20);
  const W = num(params, "width_m", 3);
  const home = num(params, "home_offset_m", 1.5);
  const root = P.group("transfer-car");
  for (const sz of [-1, 1]) {
    const rail = P.box(L, 0.08, 0.1, M.darkSteel(), 0.005, "rail");
    rail.position.set(0, 0.04, sz * W * 0.35);
    root.add(rail);
  }
  const car = P.group("car");
  const body = P.box(2.6, 0.45, W * 0.9, M.paint("#f2b705", 0.45), 0.02, "car");
  body.position.y = 0.3;
  car.add(body);
  for (let i = 0; i < 8; i++) {
    const r = P.cylinderZ(0.05, W * 0.8, M.galvanized(), 16, "rollers");
    r.position.set(-1.1 + (2.2 * i) / 7, 0.57, 0);
    car.add(r);
  }
  const stack = P.box(1.8, 1.4, W * 0.7, M.paint("#b8895a", 0.8), 0.005, "stack");
  stack.position.y = 0.62 + 0.7;
  car.add(stack);
  root.add(car);
  const stripe = P.box(L, 0.01, 0.1, M.hazard(), 0);
  stripe.position.set(0, 0.005, W / 2);
  root.add(stripe);

  function update(frame: AnimationFrame): void {
    car.position.x = Math.min(L / 2 - 1.3, -L / 2 + home + Math.max(0, ch(frame, "car_pos_m")));
    stack.visible = ch(frame, "loaded") > 0.5;
  }
  update({ channels: { car_pos_m: 5, loaded: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: 2.1 }, update, dispose: () => disposeObject(root) };
}
