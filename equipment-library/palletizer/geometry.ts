/**
 * Geometría del paletizador, flujo hacia +X: mesa de entrada con fajos, pórtico con cabezal y estiba que se carga
 * por capas, dentro de una cerca de seguridad.
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
  const L = num(params, "length_m", 8);
  const W = num(params, "width_m", 4);
  const root = P.group("palletizer");
  const yellow = M.paint("#f2b705", 0.45);

  const table = P.box(L * 0.4, 0.8, 1.4, M.galvanized(), 0.01, "infeed_table");
  table.position.set(-L / 2 + L * 0.2, 0.4, 0);
  root.add(table);
  const queue = P.box(L * 0.38, 0.3, 1.2, M.paint("#b8895a", 0.8), 0.005);
  root.add(queue);

  const px = L / 4;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const post = P.box(0.16, 3.2, 0.16, yellow, 0.01, "gantry");
      post.position.set(px + sx * 1.4, 1.6, sz * 1.4);
      root.add(post);
    }
    const beam = P.box(3.0, 0.18, 0.16, yellow, 0.01, "gantry");
    beam.position.set(px, 3.2, sz * 1.4);
    root.add(beam);
  }
  const head = P.box(0.8, 0.5, 0.8, M.darkSteel(), 0.02, "head");
  root.add(head);
  const pallet = P.box(1.2, 0.15, 1.0, M.paint("#9a7b55", 0.9), 0.005, "pallet");
  pallet.position.set(px, 0.075, 0);
  root.add(pallet);
  const load = P.box(1.2, 1, 1.0, M.paint("#b8895a", 0.8), 0.005, "load");
  root.add(load);
  const fence = P.safetyFence(3.4, W * 0.9, 2.0, 1.2);
  fence.position.set(px, 0, 0);
  root.add(fence);
  const light = P.stackLight(0.4);
  light.object.position.set(px + 1.4, 3.3, 1.4);
  root.add(light.object);

  let t = 0;
  function update(frame: AnimationFrame, dt = 0): void {
    t += dt;
    const fill = Math.max(0.02, Math.min(1, ch(frame, "pallet_fill")));
    load.scale.y = 1.5 * fill;
    load.position.set(px, 0.15 + (1.5 * fill) / 2, 0);
    const q = Math.max(0.02, Math.min(1, ch(frame, "infeed_fill")));
    queue.scale.x = q;
    queue.position.set(-L / 2 + 0.1 + (L * 0.38 * q) / 2, 0.95, 0);
    const swing = ch(frame, "working") > 0.5 ? Math.sin(t * 2) : 0;
    head.position.set(px - 0.6 * swing, 2.6, 0);
    light.set(ch(frame, "stack_light", 1), performance.now() / 1000);
  }
  update({ channels: { pallet_fill: 0.5, infeed_fill: 0.5, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: 3.6 }, update, dispose: () => disposeObject(root) };
}
