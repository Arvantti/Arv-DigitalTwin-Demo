/** Máquina de costura industrial de mesa: proporciones supuestas de un puesto (mesa 1,2 × 0,65 m). */
import {
  type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P, str,
} from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 1.2);
  const W = num(params, "width_m", 0.65);
  const style = str(params, "machine_style", "lockstitch");
  const root = P.group(`${style}-sewing-machine`);
  const steel = M.stainless();
  const enamel = M.paint(style === "overlock" ? "#d6e0e4" : style === "coverstitch" ? "#3d7181" : "#4c6680", 0.32);
  const dark = M.darkSteel();
  const tableY = 0.76;
  const top = P.slab(L, 0.055, W, M.paint("#d4d8db", 0.55), 0.012, "table");
  top.position.y = tableY;
  root.add(top);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = P.box(0.045, tableY, 0.045, M.paint("#3a4249", 0.48), 0.005);
    leg.position.set(x * (L / 2 - 0.07), tableY / 2, z * (W / 2 - 0.06));
    root.add(leg);
  }
  const motor = P.motor(4, "#3d454c");
  motor.scale.set(0.28, 0.24, 0.28);
  motor.position.set(-L * 0.28, tableY - 0.18, -W * 0.2);
  root.add(motor);
  const bed = P.box(0.72, 0.045, 0.24, enamel, 0.025);
  bed.position.set(-0.08, tableY + 0.07, -0.045);
  root.add(bed);
  const arm = P.box(style === "coverstitch" ? 0.47 : 0.43, 0.11, 0.30, enamel, 0.025);
  arm.position.set(0.03, tableY + 0.19, -0.02);
  root.add(arm);
  const head = P.box(0.27, 0.22, 0.28, enamel, 0.035);
  head.position.set(0.235, tableY + 0.13, 0.015);
  root.add(head);
  const throat = P.box(0.27, 0.075, 0.31, enamel, 0.02);
  throat.position.set(0.20, tableY + 0.285, 0.015);
  root.add(throat);

  // Diferencias legibles entre plana, fileteadora y recubridora: número de agujas/hilos y cuchilla de filete.
  const needles = style === "lockstitch" ? 1 : style === "overlock" ? 2 : 3;
  const needleGroup = P.group("needle-bar");
  for (let i = 0; i < needles; i++) {
    const z = (i - (needles - 1) / 2) * 0.055;
    const bar = P.box(0.014, 0.18, 0.014, steel, 0.002);
    bar.position.set(0.32, -0.08, z);
    needleGroup.add(bar);
  }
  needleGroup.position.set(0, tableY + 0.15, 0.1);
  root.add(needleGroup);
  const presser = P.box(0.1, 0.035, style === "overlock" ? 0.15 : 0.1, dark, 0.005);
  presser.position.set(0.31, tableY + 0.065, 0.1);
  root.add(presser);
  if (style === "overlock") {
    const knife = P.box(0.035, 0.16, 0.025, steel, 0.002);
    knife.position.set(0.42, tableY + 0.13, 0.14);
    root.add(knife);
    const looper = P.box(0.11, 0.07, 0.12, M.paint("#a6b2b8", 0.3), 0.012);
    looper.position.set(0.32, tableY + 0.06, -0.12);
    root.add(looper);
  } else if (style === "coverstitch") {
    for (let i = 0; i < 2; i++) {
      const looper = P.box(0.13, 0.035, 0.035, steel, 0.004);
      looper.position.set(0.32, tableY + 0.055, -0.08 + i * 0.1);
      root.add(looper);
    }
  }
  const spoolCount = style === "lockstitch" ? 3 : style === "overlock" ? 4 : 5;
  const stand = P.box(0.025, 0.42, 0.025, steel, 0.002);
  stand.position.set(-0.32, tableY + 0.28, -0.08);
  root.add(stand);
  for (let i = 0; i < spoolCount; i++) {
    const cone = P.cylinder(0.035, 0.025, 0.12, M.paint(["#d95a55", "#e6d2a4", "#577e9b", "#86a56d", "#b07aa1"][i % 5], 0.5), 12);
    cone.position.set(-0.46 + i * 0.07, tableY + 0.52, -0.08);
    root.add(cone);
  }
  const wheel = P.cylinderX(0.105, 0.035, dark, 24);
  wheel.position.set(-0.34, tableY + 0.16, -0.01);
  root.add(wheel);
  const pedal = P.box(0.22, 0.025, 0.1, dark, 0.004);
  pedal.position.set(0, 0.09, W * 0.18);
  root.add(pedal);

  const operator = P.operator("#e8ad3b", "#375c76", { gender: "female", skin: "#bd896c", hair: "#30231d" });
  operator.object.position.set(0.05, 0, W / 2 + 0.52);
  operator.object.rotation.y = Math.PI;
  operator.object.scale.setScalar(0.82);
  root.add(operator.object);

  const hmi = P.hmiPanel(0.24);
  hmi.object.position.set(-L * 0.39, tableY + 0.36, -W * 0.4);
  hmi.object.rotation.y = -0.2;
  root.add(hmi.object);
  const beacon = P.stackLight(0.18);
  beacon.object.position.set(L * 0.4, tableY + 0.36, -W * 0.35);
  root.add(beacon.object);

  function update(frame: AnimationFrame): void {
    const needle = ch(frame, "needle");
    needleGroup.position.y = tableY + 0.15 - needle * 0.08;
    wheel.rotation.x = ch(frame, "handwheel") * Math.PI * 2;
    operator.setPose(ch(frame, "operator_working"));
    beacon.set(ch(frame, "stack_light", 0), performance.now() / 1000);
    const v = frame.variables ?? {};
    hmi.draw(frame.label ?? style.toUpperCase(), [["Piezas", String(v.units_processed ?? 0)], ["Cola", String(v.feed_queue ?? 0)]], frame.state.toUpperCase(), "#22e06b");
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: L + 0.7, dy: W + 1.05, height: 1.95 }, update, dispose: () => disposeObject(root) };
}
