/**
 * Geometría de la estación en línea, flujo hacia +X: cola de entrada (−X), puesto de trabajo en el centro y salida (+X)
 * sobre una cama de rodillos. El puesto cambia con `role`: mesa giratoria (disco que gira con la operación), amarradora
 * o encintadora (arco sobre la banda) o mesa manual (mesas laterales con un operario por puesto). Tres fotoceldas cruzan
 * la banda (acumulación, posición y salida) y su haz se pone rojo cuando ven una unidad; a un lado van el pulsador de
 * paro y la baliza.
 */
import * as THREE from "three";
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

const TOP = 0.6;

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 4);
  const W = num(params, "width_m", 3);
  const role = str(params, "role", "strapper");
  const manual = str(params, "mode", "automatic") === "manual";
  const size = num(params, "unit_size_m", 0.8);
  const color = str(params, "unit_color", "#b8895a");
  const qCap = Math.max(1, Math.round(num(params, "queue_capacity", 2)));
  const ops = manual ? Math.max(0, Math.round(num(params, "operators", 1))) : 0;
  const bedW = Math.min(W * 0.6, Math.max(size * 1.3, 1.0));
  const root = P.group("inline-station");

  // bastidor y rodillos
  const frame = P.box(L, 0.12, bedW, M.paint(M.MACHINE_GREY, 0.5), 0.01, "frame");
  frame.position.set(0, TOP - 0.1, 0);
  root.add(frame);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = P.box(0.08, TOP - 0.16, 0.08, M.darkSteel(), 0.005, "legs");
      leg.position.set(sx * (L / 2 - 0.1), (TOP - 0.16) / 2, sz * (bedW / 2 - 0.06));
      root.add(leg);
    }
  const rollers = P.group("rollers");
  const n = Math.max(4, Math.floor(L / 0.25));
  for (let i = 0; i < n; i++) {
    const r = P.cylinderZ(0.035, bedW - 0.05, M.galvanized(), 16);
    r.position.set(-L / 2 + (i + 0.5) * (L / n), TOP - 0.01, 0);
    rollers.add(r);
  }
  root.add(rollers);

  // zonas: cola de entrada, puesto y salida
  const xWork = 0;
  const xExit = L / 2 - Math.min(size, L / 6) / 2 - 0.05;
  const queueLen = L / 2 - size / 2 - 0.1;
  const qStep = Math.min(size * 1.05, queueLen / qCap);

  // puesto de trabajo según el rol
  const work = P.group("work_unit");
  let spinner: THREE.Object3D | null = null;
  let head: THREE.Object3D | null = null;
  const yellow = M.paint(M.SAFETY_YELLOW, 0.45);
  if (role === "turntable") {
    const disc = P.cylinder(size * 0.8, size * 0.8, 0.08, M.paint("#3b4752", 0.5), 48);
    disc.position.set(xWork, TOP + 0.03, 0);
    work.add(disc);
    spinner = disc;
  } else if (role === "strapper" || role === "taper") {
    const archH = size + 0.9;
    const archW = bedW + 0.4;
    const mat = role === "strapper" ? M.paint("#2f5f8f", 0.45) : yellow;
    for (const sz of [-1, 1]) {
      const post = P.box(0.25, archH, 0.25, mat, 0.01);
      post.position.set(xWork, archH / 2, sz * (archW / 2));
      work.add(post);
    }
    const beam = P.box(0.3, 0.25, archW + 0.25, mat, 0.01);
    beam.position.set(xWork, archH, 0);
    work.add(beam);
    const press = P.box(size * 0.7, 0.08, size * 0.6, M.darkSteel(), 0.01);
    work.add(press);
    head = press;
    if (role === "taper") {
      const roll = P.cylinder(0.12, 0.12, 0.06, M.paint("#c9a227", 0.5), 24);
      roll.rotation.x = Math.PI / 2;
      roll.position.set(xWork + 0.2, archH - 0.15, archW / 2 + 0.15);
      work.add(roll);
    }
  } else {
    // mesa manual: una mesa a cada lado de la banda
    for (const sz of [-1, 1]) {
      const table = P.box(Math.min(L * 0.5, 2), 0.06, 0.6, M.paint("#9a7b55", 0.7), 0.01);
      table.position.set(xWork, 0.85, sz * (bedW / 2 + 0.35));
      work.add(table);
      const tLeg = P.box(0.06, 0.82, 0.5, M.darkSteel(), 0.005);
      tLeg.position.set(xWork, 0.41, sz * (bedW / 2 + 0.35));
      work.add(tLeg);
    }
  }
  root.add(work);

  // operarios (estación manual): uno por puesto, alternando lados de la banda
  const operators = P.group("operators");
  const figs: ReturnType<typeof P.operator>[] = [];
  for (let i = 0; i < ops; i++) {
    const fig = P.operator(i % 2 ? "#2f5f8f" : "#f26b1d", "#e9eef2");
    const side = i % 2 ? 1 : -1;
    const along = (Math.floor(i / 2) - (Math.ceil(ops / 2) - 1) / 2) * 0.9;
    fig.object.position.set(xWork + along, 0, side * (bedW / 2 + 0.95));
    fig.object.rotation.y = side > 0 ? Math.PI : 0;
    operators.add(fig.object);
    figs.push(fig);
  }
  root.add(operators);

  // unidades
  const units = P.group("units");
  const unitMat = M.paint(color, 0.8);
  const unitH = role === "turntable" ? 1.4 : size * 0.6;
  const mk = (): THREE.Mesh => {
    const m = P.box(size, unitH, size * 0.85, unitMat, 0.01);
    m.visible = false;
    units.add(m);
    return m;
  };
  const queueUnits = Array.from({ length: qCap }, mk);
  queueUnits.forEach((u, i) => u.position.set(-L / 2 + 0.05 + size / 2 + i * qStep, TOP + 0.04 + unitH / 2, 0));
  // la cola se llena desde el puesto hacia la entrada
  queueUnits.reverse();
  const workUnit = mk();
  workUnit.position.set(xWork, TOP + 0.08 + unitH / 2, 0);
  const exitUnit = mk();
  exitUnit.position.set(xExit, TOP + 0.04 + unitH / 2, 0);
  root.add(units);

  // fotoceldas: acumulación (al fondo de la cola), posición (puesto) y salida
  const eyes = P.group("photo_eyes");
  const beams: THREE.MeshStandardMaterial[] = [];
  const eyeX = [-L / 2 + 0.15, xWork - size / 2 - 0.05, L / 2 - 0.15];
  for (const ex of eyeX) {
    for (const sz of [-1, 1]) {
      const post = P.box(0.04, 0.45, 0.04, M.paint("#2c3e50", 0.4), 0.004);
      post.position.set(ex, TOP + 0.2, sz * (bedW / 2 + 0.06));
      eyes.add(post);
      const eyeHead = P.box(0.07, 0.07, 0.05, M.paint(sz < 0 ? "#f2b705" : "#1d2a3a", 0.4), 0.006);
      eyeHead.position.set(ex, TOP + 0.35, sz * (bedW / 2 + 0.06));
      eyes.add(eyeHead);
    }
    const mat = M.emissive("#22e06b", 1.2);
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, bedW + 0.1), mat);
    ray.position.set(ex, TOP + 0.35, 0);
    eyes.add(ray);
    beams.push(mat);
  }
  root.add(eyes);

  // pulsador de paro (hongo rojo sobre caja amarilla) y baliza
  const stop = P.group("stop_button");
  const pole = P.box(0.06, 1.0, 0.06, M.darkSteel(), 0.005);
  pole.position.set(0, 0.5, 0);
  stop.add(pole);
  const boxBtn = P.box(0.14, 0.14, 0.1, yellow, 0.01);
  boxBtn.position.set(0, 1.05, 0);
  stop.add(boxBtn);
  const mush = P.cylinder(0.05, 0.05, 0.04, M.paint("#d62828", 0.4), 20);
  mush.rotation.x = Math.PI / 2;
  mush.position.set(0, 1.05, 0.07);
  stop.add(mush);
  stop.position.set(-L / 2 + 0.3, 0, -(bedW / 2 + 0.3));
  root.add(stop);
  const light = P.stackLight(0.5);
  light.object.position.set(L / 2 - 0.3, TOP, -(bedW / 2 + 0.2));
  root.add(light.object);

  let t = 0;
  function update(frame: AnimationFrame, dt = 0): void {
    t += dt;
    const q = Math.round(ch(frame, "queue"));
    queueUnits.forEach((u, i) => (u.visible = i < q));
    const busy = ch(frame, "in_process") > 0.5;
    const progress = Math.max(0, Math.min(1, ch(frame, "progress")));
    workUnit.visible = busy;
    exitUnit.visible = ch(frame, "at_exit") > 0.5;
    const stopped = frame.state === "fault" || frame.state === "off";
    if (spinner) {
      const angle = (progress * Math.PI) / 2;
      spinner.rotation.y = angle;
      workUnit.rotation.y = angle;
    }
    if (head) {
      const down = busy && progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) : 0;
      head.position.set(xWork, TOP + 0.08 + unitH + 0.1 + (1 - down) * 0.4, 0);
    }
    const working = busy && !stopped && progress > 0 && progress < 1;
    figs.forEach((f, i) => f.setPose(working ? 0.5 + 0.5 * Math.sin(t * 3 + i) : 0));
    const eyeOn = [ch(frame, "eye_queue"), ch(frame, "eye_position"), ch(frame, "eye_exit")];
    beams.forEach((b, i) => b.emissive.set(eyeOn[i] > 0.5 ? "#ff3030" : "#22e06b"));
    light.set(ch(frame, "stack_light", 1), performance.now() / 1000);
  }
  update({ channels: { queue: 1, in_process: 1, progress: 0.5, stack_light: 1 }, state: "running" });

  return { root, size: { dx: L, dy: W, height: role === "turntable" ? 2.2 : 2.4 }, update, dispose: () => disposeObject(root) };
}
