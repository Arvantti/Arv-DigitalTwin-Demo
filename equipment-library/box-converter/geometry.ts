/**
 * Geometría de la convertidora de cajas, flujo hacia +X: alimentador con la pila de láminas, unidades de impresión,
 * ranuradora o troquel rotativo, plegadora-pegadora (solo en la impresora-plegadora-pegadora) y contador-eyector.
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
  const L = num(params, "length_m", 20);
  const W = num(params, "width_m", 4.5);
  const colors = Math.round(num(params, "colors", 4));
  const die = str(params, "kind", "flexo_folder_gluer") === "rotary_die_cutter";
  const root = P.group("box-converter");
  const body = M.paint("#d9dde1", 0.45);
  const accent = M.paint("#1f5f8b", 0.45);
  let x = -L / 2;

  // alimentador y pila de láminas
  const feederL = 3;
  const feeder = P.box(feederL, 1.0, W * 0.8, accent, 0.02, "feeder");
  feeder.position.set(x + feederL / 2, 0.5, 0);
  root.add(feeder);
  const stack = P.box(1.6, 1, W * 0.55, M.paint("#b8895a", 0.8), 0.005, "stack");
  root.add(stack);
  x += feederL;

  // unidades de impresión y ranuradora o troquel: cuerpos altos con un cilindro a la vista
  const units = Math.max(1, colors) + 1;
  const unitL = 1.6;
  for (let i = 0; i < units; i++) {
    const last = i === units - 1;
    const u = P.box(unitL - 0.1, 2.2, W * 0.9, last ? accent : body, 0.03, last ? "die_or_slotter" : "print_units");
    u.position.set(x + unitL / 2, 1.1, 0);
    root.add(u);
    const cyl = P.cylinderZ(last && die ? 0.45 : 0.3, W * 0.92, M.polishedSteel(), 24);
    cyl.position.set(x + unitL / 2, 1.5, 0);
    root.add(cyl);
    x += unitL;
  }

  // plegadora-pegadora (larga y baja) o banda de salida de la troqueladora
  const restL = Math.max(2, L / 2 - x - 2.5);
  const folder = P.box(restL, die ? 0.9 : 1.3, W * (die ? 0.7 : 0.6), die ? M.galvanized() : body, 0.02, "folder");
  folder.position.set(x + restL / 2, die ? 0.45 : 0.65, 0);
  root.add(folder);
  x += restL;
  const ejector = P.box(2.4, 2.4, W * 0.7, accent, 0.03, "counter_ejector");
  ejector.position.set(x + 1.2, 1.2, 0);
  root.add(ejector);

  const hmi = P.hmiPanel(0.6);
  hmi.object.position.set(-L / 2 + feederL + 1.5, 0.6, W / 2 + 0.3);
  root.add(hmi.object);
  const light = P.stackLight(0.4);
  light.object.position.set(-L / 2 + feederL + 0.5, 2.2, -W * 0.35);
  root.add(light.object);

  function update(frame: AnimationFrame): void {
    const fill = Math.max(0.02, Math.min(1, ch(frame, "infeed_fill")));
    stack.scale.y = 1.4 * fill;
    stack.position.set(-L / 2 + feederL / 2, 1.0 + (1.4 * fill) / 2, 0);
    light.set(ch(frame, "stack_light", 1), performance.now() / 1000);
    const v = frame.variables ?? {};
    hmi.draw(frame.label ?? "CONVERTIDORA", [["Lám/min", String(Math.round(Number(v.speed_actual ?? 0)))], ["Fajos", String(v.bundles_count ?? "—")]], frame.state.toUpperCase(), "#22e06b");
  }
  update({ channels: { infeed_fill: 0.6, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W + 0.6, height: 2.6 }, update, dispose: () => disposeObject(root) };
}
