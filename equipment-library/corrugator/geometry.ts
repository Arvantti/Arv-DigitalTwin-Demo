/**
 * Geometría de la corrugadora vista desde el transporte: el apilador del extremo seco (banda de entrada inclinada,
 * mesa de apilado con la pila que crece) y la salida de rodillos con las pilas que esperan. El flujo va hacia +X.
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

const KRAFT = "#b8895a";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 12);
  const W = num(params, "width_m", 3.6);
  const Hs = num(params, "stack_height_m", 1.4);
  const slots = Math.max(1, Math.round(num(params, "outfeed_stacks", 2)));
  const root = P.group("corrugator");
  const frameMat = M.paint("#2f6f9f", 0.45);
  const steel = M.darkSteel();

  // banda de entrada inclinada (primera mitad) que sube las láminas a la mesa de apilado
  const beltL = L * 0.45;
  const belt = P.box(beltL, 0.08, W * 0.8, M.rubber(), 0.01, "infeed_belt");
  belt.position.set(-L / 2 + beltL / 2, 1.3, 0);
  belt.rotation.z = 0.12;
  root.add(belt);
  for (const sz of [-1, 1]) {
    const side = P.box(beltL, 0.5, 0.08, frameMat, 0.01, "frame");
    side.position.set(-L / 2 + beltL / 2, 1.3, sz * (W * 0.42));
    side.rotation.z = 0.12;
    root.add(side);
  }
  // pórtico del apilador
  const towerX = -L / 2 + beltL + 1.2;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const post = P.box(0.18, Hs + 1.6, 0.18, frameMat, 0.01, "frame");
      post.position.set(towerX + sx * 1.1, (Hs + 1.6) / 2, sz * (W / 2 - 0.1));
      root.add(post);
    }
    const beam = P.box(2.4, 0.2, 0.18, frameMat, 0.01, "frame");
    beam.position.set(towerX, Hs + 1.6, sz * (W / 2 - 0.1));
    root.add(beam);
  }
  const table = P.box(2.0, 0.3, W * 0.8, steel, 0.01);
  table.position.set(towerX, 0.15, 0);
  root.add(table);
  const stack = P.box(1.8, 1, W * 0.7, M.paint(KRAFT, 0.8), 0.005, "stack");
  root.add(stack);

  // salida de rodillos con las pilas que esperan
  const outL = L / 2 - (towerX + 1.2);
  const rollers = P.box(outL, 0.5, W * 0.8, M.galvanized(), 0.01, "outfeed_rollers");
  rollers.position.set(towerX + 1.2 + outL / 2, 0.25, 0);
  root.add(rollers);
  const waiting: THREE_Mesh[] = [];
  for (let i = 0; i < slots; i++) {
    const s = P.box(1.8, Hs, W * 0.7, M.paint(KRAFT, 0.8), 0.005, "stack");
    s.position.set(L / 2 - 1.1 - i * 2.2, 0.5 + Hs / 2, 0);
    root.add(s);
    waiting.push(s);
  }

  const cab = P.cabinet(1.2, 2.0, 0.5);
  cab.position.set(-L / 2 + 1, 0, -W / 2 - 0.4);
  cab.rotation.y = Math.PI;
  root.add(cab);
  const hmi = P.hmiPanel(0.6);
  hmi.object.position.set(towerX, 0.6, W / 2 + 0.3);
  root.add(hmi.object);
  const light = P.stackLight(0.4);
  light.object.position.set(towerX + 1.1, Hs + 1.7, W / 2 - 0.1);
  root.add(light.object);

  function update(frame: AnimationFrame): void {
    const fill = Math.max(0.02, Math.min(1, ch(frame, "stack_fill")));
    stack.scale.y = Hs * fill;
    stack.position.set(towerX, 0.3 + (Hs * fill) / 2, 0);
    const n = Math.round(ch(frame, "outfeed_count"));
    waiting.forEach((s, i) => (s.visible = i < n));
    light.set(ch(frame, "stack_light", 1), performance.now() / 1000);
    const v = frame.variables ?? {};
    hmi.draw(frame.label ?? "CORRUGADORA", [["m/min", String(Math.round(Number(v.speed_m_min ?? 0)))], ["Pilas", String(v.stacks_delivered ?? "—")]], frame.state.toUpperCase(), "#22e06b");
  }
  update({ channels: { stack_fill: 0.5, outfeed_count: 1, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W + 1, height: Hs + 2 }, update, dispose: () => disposeObject(root) };
}

type THREE_Mesh = ReturnType<typeof P.box>;
