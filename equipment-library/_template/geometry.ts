/**
 * PLANTILLA de geometría. Reglas de la librería:
 *  - Metros; +Y arriba; origen en el piso en el centro de la huella; eje largo en +X; operador en +Z.
 *  - Construir solo con piezas de @twin/3d (parts) y materiales compartidos (materials).
 *  - update() solo lee el AnimationFrame: el modelo nunca es fuente de verdad.
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
  str,
} from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 2.5);
  const W = num(params, "width_m", 1.4);
  const H = num(params, "height_m", 1.8);
  const root = P.group("template-machine");

  const base = P.slab(L, 0.15, W, M.darkSteel(), 0.02);
  root.add(base);
  const body = P.slab(L * 0.96, H - 0.15, W * 0.9, M.paint(str(params, "body_color", "#3a6ea5"), 0.4), 0.04, "body");
  body.position.y = 0.15;
  root.add(body);
  const stripe = P.box(L * 0.96, 0.06, 0.004, M.hazard(), 0);
  stripe.position.set(0, 0.45, (W * 0.9) / 2 + 0.003);
  root.add(stripe);

  const cab = P.cabinet(Math.min(1.2, L * 0.4), H * 0.9, 0.4);
  cab.position.set(-L / 2 + Math.min(1.2, L * 0.4) / 2, 0, -W / 2 - 0.2);
  cab.rotation.y = Math.PI;
  root.add(cab);

  const hmi = P.hmiPanel(0.6);
  hmi.object.position.set(L * 0.3, 0.6, W / 2 + 0.1);
  root.add(hmi.object);

  const light = P.stackLight(0.3);
  light.object.position.set(L / 2 - 0.2, H, -W * 0.3);
  root.add(light.object);

  // indicador de avance del ciclo: barra luminosa sobre el frente
  const barMat = M.emissive("#3fd0ff", 2);
  const bar = P.box(1, 0.03, 0.01, barMat, 0);
  bar.position.set(0, H * 0.8, (W * 0.9) / 2 + 0.006);
  root.add(bar);

  function update(frame: AnimationFrame): void {
    const p = Math.max(0.001, ch(frame, "progress"));
    bar.scale.x = L * 0.9 * p;
    bar.position.x = -L * 0.45 + (L * 0.9 * p) / 2;
    light.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const v = frame.variables ?? {};
    hmi.draw(frame.label ?? "MÁQUINA", [["Ciclos", String(v.cycle_count ?? "—")], ["Buenas", String(v.units_good ?? "—")]], frame.state.toUpperCase(), "#22e06b");
  }
  update({ channels: {}, state: "idle" });

  return { root, size: { dx: L, dy: W + 0.4, height: H + 0.6 }, update, dispose: () => disposeObject(root) };
}
