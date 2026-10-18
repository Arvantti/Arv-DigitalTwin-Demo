/**
 * Geometría paramétrica de la banda transportadora. El flujo va hacia +X (descarga en +L/2).
 * Las unidades acumuladas se dibujan juntas contra la descarga; las que avanzan se reparten en
 * el resto del largo y se desplazan con el recorrido de la banda.
 *
 * Perfil de altura: la entrada está a height_m y la descarga a height_m + rise_m. Con crest_height_m > 0 la banda
 * sube con pendiente ramp_deg hasta esa altura, sigue a nivel y baja a la descarga (un puente sobre un pasillo);
 * si el largo no alcanza, las rampas se empinan. Sin subidas es una banda plana como siempre.
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

const MAX_ITEMS = 400;

export default function build(params: Params): EquipmentModel {
  const L = num(params, "length_m", 6);
  const W = num(params, "width_m", 0.4);
  const H = num(params, "height_m", 0.85);
  const pitch = num(params, "pitch_m", 0.25);
  const kind = str(params, "kind", "flat");
  const item = str(params, "item", "sachet");
  const size = num(params, "item_size_m", 0.18);
  const color = str(params, "item_color", "#c62828");
  const motorKw = num(params, "motor_kw", 0.75);
  const root = P.group("belt-conveyor");
  const steel = M.stainless();

  // perfil de altura: puntos [x, y] de la superficie, de la entrada a la descarga
  const hIn = H;
  const hOut = Math.max(0.2, H + num(params, "rise_m", 0));
  const crest = num(params, "crest_height_m", 0);
  const tanR = Math.tan(THREE.MathUtils.degToRad(Math.min(35, Math.max(5, num(params, "ramp_deg", 15)))));
  const prof: [number, number][] = [[-L / 2, hIn]];
  if (crest > Math.max(hIn, hOut)) {
    let up = (crest - hIn) / tanR;
    let down = (crest - hOut) / tanR;
    const k = Math.min(1, (L * 0.9) / (up + down));
    up *= k;
    down *= k;
    prof.push([-L / 2 + up, crest], [L / 2 - down, crest]);
  }
  prof.push([L / 2, hOut]);
  const yAt = (x: number): number => {
    for (let i = 1; i < prof.length; i++) {
      const [x0, y0] = prof[i - 1];
      const [x1, y1] = prof[i];
      if (x <= x1 || i === prof.length - 1) return x1 > x0 ? y0 + ((Math.min(Math.max(x, x0), x1) - x0) / (x1 - x0)) * (y1 - y0) : y1;
    }
    return hOut;
  };
  const slopeAt = (x: number): number => {
    for (let i = 1; i < prof.length; i++) {
      const [x0, y0] = prof[i - 1];
      const [x1, y1] = prof[i];
      if (x <= x1 || i === prof.length - 1) return Math.atan2(y1 - y0, x1 - x0);
    }
    return 0;
  };
  const top = Math.max(...prof.map((q) => q[1]));
  // largo acumulado sobre el recorrido en cada punto del perfil (la simulación mide ahí la posición de cada unidad)
  const cum = [0];
  for (let i = 1; i < prof.length; i++) cum.push(cum[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const xAtPath = (sPath: number): number => {
    for (let i = 1; i < prof.length; i++) {
      if (sPath <= cum[i] || i === prof.length - 1) {
        const f = cum[i] > cum[i - 1] ? Math.min(1, Math.max(0, (sPath - cum[i - 1]) / (cum[i] - cum[i - 1]))) : 1;
        return prof[i - 1][0] + f * (prof[i][0] - prof[i - 1][0]);
      }
    }
    return L / 2;
  };
  /** Agrega una pieza recta que sigue el perfil: largo en planta, centrada en z, a dy de la superficie. */
  const alongProfile = (make: (len: number) => THREE.Object3D, dy: number, z: number): void => {
    for (let i = 1; i < prof.length; i++) {
      const [x0, y0] = prof[i - 1];
      const [x1, y1] = prof[i];
      if (x1 - x0 < 1e-3) continue;
      const a = Math.atan2(y1 - y0, x1 - x0);
      const piece = make(Math.hypot(x1 - x0, y1 - y0) + (prof.length > 2 ? 0.02 : 0));
      const g = new THREE.Group();
      g.add(piece);
      piece.position.set(0, dy, z);
      g.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      g.rotation.z = a;
      root.add(g);
    }
  };

  // bastidor: canales laterales y patas
  const frameH = 0.12;
  for (const sz of [-1, 1]) alongProfile((len) => P.box(len, frameH, 0.04, steel, 0.008, "frame"), -frameH / 2, sz * (W / 2 + 0.03));
  const nLegs = Math.max(2, Math.ceil(L / 2.5) + 1);
  const tall = top > 2;
  for (let i = 0; i < nLegs; i++) {
    const x = -L / 2 + 0.15 + ((L - 0.3) * i) / (nLegs - 1);
    const legH = yAt(x) - frameH;
    for (const sz of [-1, 1]) {
      const leg = P.box(tall ? 0.08 : 0.04, legH, tall ? 0.08 : 0.04, tall ? M.galvanized() : steel, 0.006, "legs");
      leg.geometry.translate(0, legH / 2, 0);
      leg.position.set(x, 0, sz * (W / 2 + 0.03));
      root.add(leg);
      const foot = P.cylinder(0.035, 0.035, 0.02, M.rubber(), 12);
      foot.position.set(x, 0, sz * (W / 2 + 0.03));
      root.add(foot);
    }
    for (const by of legH > 2 ? [0.25, legH / 2, legH - 0.1] : [0.25]) {
      const brace = P.box(0.03, 0.03, W + 0.06, steel, 0.004);
      brace.position.set(x, by, 0);
      root.add(brace);
    }
  }

  // superficie de transporte
  if (kind === "roller") {
    const n = Math.floor(L / 0.08);
    const geo = new THREE.CylinderGeometry(0.025, 0.025, W, 16);
    geo.rotateX(Math.PI / 2);
    const rollers = new THREE.InstancedMesh(geo, M.polishedSteel(), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.04 + i * 0.08;
      rollers.setMatrixAt(i, m.makeTranslation(x, yAt(x) - 0.025, 0));
    }
    rollers.castShadow = rollers.receiveShadow = true;
    rollers.name = "rollers";
    root.add(rollers);
  } else {
    const beltMat =
      kind === "mesh"
        ? new THREE.MeshStandardMaterial({ color: "#8e979f", metalness: 0.9, roughness: 0.45, wireframe: false })
        : kind === "slat"
          ? M.plastic("#e6e8ea", 0.5)
          : M.rubber();
    alongProfile((len) => P.box(len, 0.012, W, beltMat, 0.004, "belt"), -0.006, 0);
    if (kind === "slat" || kind === "mesh") {
      const n = Math.floor(L / 0.05);
      const geo = new THREE.BoxGeometry(0.008, 0.004, W);
      const lines = new THREE.InstancedMesh(geo, M.paint("#5e666d", 0.6), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) lines.setMatrixAt(i, m.makeTranslation(-L / 2 + i * 0.05, yAt(-L / 2 + i * 0.05) + 0.001, 0));
      root.add(lines);
    }
    for (const sx of [-1, 1]) {
      const drum = P.cylinderZ(0.05, W + 0.02, M.polishedSteel(), 24);
      drum.position.set((sx * L) / 2, yAt((sx * L) / 2) - 0.05, 0);
      root.add(drum);
    }
  }
  // guías laterales para unidades sueltas
  if (item !== "box") {
    // en los tramos inclinados las maletas llevan guías más altas
    const guideH = prof.length > 2 || hOut !== hIn ? 0.12 : 0.03;
    for (const sz of [-1, 1]) {
      alongProfile((len) => P.box(len, guideH, 0.01, M.plastic("#d8dde2", 0.4), 0.003), 0.06, sz * (W / 2 - 0.01));
      const nb = Math.max(2, Math.ceil(L / 1.5));
      for (let i = 0; i < nb; i++) {
        const bx = -L / 2 + 0.2 + ((L - 0.4) * i) / (nb - 1);
        const bracket = P.box(0.02, 0.07, 0.02, steel, 0.003);
        bracket.position.set(bx, yAt(bx) + 0.035, sz * (W / 2 + 0.01));
        root.add(bracket);
      }
    }
  }
  // motorreductor en la descarga
  const drive = P.group("drive_motor");
  const mot = P.motor(motorKw, "#2f4f6f");
  mot.rotation.y = Math.PI / 2;
  drive.add(mot);
  const gb = P.gearbox(0.12 + 0.03 * Math.sqrt(motorKw));
  gb.position.z = -0.12;
  drive.add(gb);
  drive.position.set(L / 2 - 0.12, yAt(L / 2 - 0.12) - 0.12, -(W / 2 + 0.25));
  root.add(drive);

  // unidades transportadas (instanciadas)
  let itemGeo: THREE.BufferGeometry;
  let itemMat: THREE.Material;
  let itemH: number;
  if (item === "box") {
    itemGeo = new THREE.BoxGeometry(size, size * 0.7, size * 0.8);
    itemMat = M.paint(color, 0.85);
    itemH = size * 0.7;
  } else if (item === "part") {
    itemGeo = new THREE.BoxGeometry(size, size * 0.5, size * 0.8);
    itemMat = M.plastic(color, 0.3);
    itemH = size * 0.5;
  } else if (item === "bag") {
    itemGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01); // no se usa: las maletas tienen su propia pieza
    itemMat = M.rubber();
    itemH = 0;
  } else {
    itemGeo = new THREE.BoxGeometry(size * 1.5, 0.03, size);
    itemMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 });
    itemH = 0.03;
  }
  let items: THREE.InstancedMesh;
  if (item === "bag") {
    // maleta acostada con su color (origen en la base)
    items = P.bagInstances(MAX_ITEMS, size);
  } else {
    items = new THREE.InstancedMesh(itemGeo, itemMat, MAX_ITEMS);
    items.name = "items";
    items.castShadow = true;
    items.count = 0;
  }
  root.add(items);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const place = (k: number, x: number): void => {
    q.setFromAxisAngle(zAxis, slopeAt(x));
    items.setMatrixAt(k, m.compose(v.set(x, yAt(x) + itemH / 2 + 0.002, 0), q, one));
  };

  function update(frame: AnimationFrame): void {
    if (frame.items) {
      // la simulación sigue cada unidad: se dibuja donde está (con su separación, sus choques y sus resbalones)
      const n = Math.min(MAX_ITEMS, frame.items.length);
      for (let i = 0; i < n; i++) place(i, Math.min(L / 2 - size * 0.5, xAtPath(frame.items[i])));
      items.count = n;
      items.instanceMatrix.needsUpdate = true;
      return;
    }
    const capacity = Math.floor(L / pitch) + 1; // lo que cabe físicamente sobre la banda
    const total = Math.min(MAX_ITEMS, capacity, Math.round(ch(frame, "items_count")));
    const acc = Math.min(total, Math.round(ch(frame, "accumulated")));
    const travel = ch(frame, "belt_travel");
    let k = 0;
    for (let i = 0; i < acc; i++) place(k++, L / 2 - size * 0.75 - i * pitch);
    const moving = total - acc;
    const free = L - acc * pitch - size;
    if (moving > 0 && free > 0) {
      const spacing = free / moving;
      const offset = travel % spacing;
      for (let i = 0; i < moving; i++) {
        const x = -L / 2 + size * 0.75 + offset + i * spacing;
        place(k++, Math.min(x, L / 2 - size * 0.75 - acc * pitch));
      }
    }
    items.count = k;
    items.instanceMatrix.needsUpdate = true;
  }
  update({ channels: { items_count: Math.min(MAX_ITEMS, Math.floor(L / pitch / 2)) }, state: "idle" });

  return {
    root,
    size: { dx: L, dy: W + 0.6, height: top + 0.2 },
    update: (frame) => update(frame),
    dispose: () => disposeObject(root),
  };
}
