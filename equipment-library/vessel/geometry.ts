/**
 * Geometría paramétrica de recipientes: silo galvanizado con fondo cónico y estructura,
 * o tanque vertical con fondos toriesféricos, patas, mirilla de nivel, chaqueta y agitador.
 * Las dimensiones siguen la misma regla que vessel_dimensions() en behavior.py.
 */
import * as THREE from "three";
import {
  type AnimationFrame,
  type EquipmentModel,
  type Params,
  bool,
  ch,
  disposeObject,
  materials as M,
  num,
  parts as P,
  str,
} from "@twin/3d";

export function vesselDimensions(volumeL: number, form: string, diameterM = 0): { d: number; h: number } {
  const v = volumeL / 1000;
  const ratio = form === "silo" ? 2.5 : 1.5;
  const d = diameterM > 0 ? diameterM : Math.cbrt((4 * v) / (Math.PI * ratio));
  const h = (4 * v) / (Math.PI * d * d);
  return { d, h };
}

function shellMaterial(finish: string, color: string): THREE.Material {
  if (finish === "galvanized") return M.galvanized();
  if (finish === "painted") return M.paint(color, 0.4);
  return M.stainless();
}

export default function build(params: Params): EquipmentModel {
  const form = str(params, "form", "vertical_tank");
  const volume = num(params, "volume_l", 3000);
  const { d, h } = vesselDimensions(volume, form, num(params, "diameter_m", 0));
  const r = d / 2;
  const finish = str(params, "finish", form === "silo" ? "galvanized" : "stainless");
  const content = str(params, "content", "producto");
  const waterTank = form === "vertical_tank" && /agua/i.test(content);
  // Para agua, la carcasa es una envolvente translúcida; el nivel visible sigue exclusivamente el canal `level`.
  const shell: THREE.Material = waterTank
    ? new THREE.MeshPhysicalMaterial({ color: "#8fc8ef", roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.26, depthWrite: false })
    : shellMaterial(finish, str(params, "color", "#d9dde1"));
  const jacketed = bool(params, "jacketed", false);
  const agitator = bool(params, "agitator", false);

  const root = P.group("vessel");
  let yBottom: number; // altura del fondo del cuerpo cilíndrico
  let totalH: number;
  const levelMat = M.emissive("#3fd0ff", 1.5);
  let levelBar: THREE.Mesh | null = null;
  let liquid: THREE.Mesh | null = null;
  let levelSpan = 0;
  const agitatorParts: THREE.Object3D[] = [];

  if (form === "silo") {
    const clearance = 0.9;
    const coneH = r * Math.tan((60 * Math.PI) / 180);
    yBottom = clearance + coneH;
    const roofH = r * Math.tan((15 * Math.PI) / 180);
    totalH = yBottom + h + roofH;

    const cone = P.frustum(0.18, r, coneH, shell, "cone");
    cone.position.y = clearance;
    root.add(cone);
    const body = P.cylinder(r, r, h, shell, 64, "shell");
    body.position.y = yBottom;
    root.add(body);
    // anillos de refuerzo / juntas de virolas
    const courses = Math.max(2, Math.round(h / 1.2));
    for (let i = 0; i <= courses; i++) {
      const ringM = P.ring(r + 0.02, 0.03, 0.05, M.galvanized());
      ringM.position.y = yBottom + (h * i) / courses - 0.025;
      root.add(ringM);
    }
    const roof = P.frustum(r + 0.03, 0.25, roofH, shell, "top_head");
    roof.position.y = yBottom + h;
    root.add(roof);
    const vent = P.cylinder(0.2, 0.2, 0.35, M.galvanized(), 24);
    vent.position.y = yBottom + h + roofH;
    root.add(vent);
    // estructura de soporte: 4 columnas H con arriostramiento en X
    const colPos = r * 0.82;
    const colMat = M.paint("#7d858c", 0.5);
    const cols: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = P.slab(0.2, yBottom + 0.3, 0.2, colMat, 0.01);
        col.position.set(sx * colPos * 0.72, 0, sz * colPos * 0.72);
        root.add(col);
        cols.push(new THREE.Vector3(sx * colPos * 0.72, 0, sz * colPos * 0.72));
        const base = P.slab(0.45, 0.04, 0.45, M.darkSteel(), 0.005);
        base.position.copy(col.position);
        root.add(base);
      }
    }
    const order = [0, 1, 3, 2, 0];
    for (let i = 0; i < 4; i++) {
      const a = cols[order[i]];
      const b = cols[order[i + 1]];
      for (const [y0, y1] of [[0.3, yBottom * 0.55], [yBottom * 0.55, 0.3]]) {
        const brace = P.pipe([new THREE.Vector3(a.x, y0, a.z), new THREE.Vector3(b.x, y1, b.z)], 0.03, colMat);
        root.add(brace);
      }
      const beam = P.box(a.distanceTo(b), 0.18, 0.12, colMat, 0.01);
      beam.position.set((a.x + b.x) / 2, yBottom * 0.98, (a.z + b.z) / 2);
      beam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      root.add(beam);
    }
    // descarga: compuerta y tubo de transporte
    const gate = P.box(0.32, 0.18, 0.32, M.paint("#3b4650", 0.5), 0.02);
    gate.position.y = clearance - 0.1;
    root.add(gate);
    root.add(P.pipe([new THREE.Vector3(0, clearance - 0.2, 0), new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(r * 1.2, 0.45, 0)], 0.05, M.polishedSteel(), 0.25));
    // tubo de llenado neumático por el costado hasta el techo
    root.add(
      P.pipe(
        [
          new THREE.Vector3(-r - 0.25, 1.0, 0),
          new THREE.Vector3(-r - 0.25, yBottom + h + 0.3, 0),
          new THREE.Vector3(-r * 0.4, yBottom + h + roofH * 0.7, 0),
        ],
        0.05,
        M.galvanized(),
        0.4,
      ),
    );
    const coupling = P.box(0.18, 0.18, 0.18, M.paint("#c62828", 0.5), 0.02);
    coupling.position.set(-r - 0.25, 1.0, 0);
    root.add(coupling);
    // escalera con jaula y baranda en el techo
    const ladder = P.ladder(yBottom + h - 0.2, 0.45, true);
    ladder.position.set(0, 0.2, r + 0.22);
    root.add(ladder);
    const railPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * 0.15 + (i / 24) * Math.PI * 0.7;
      railPts.push(new THREE.Vector2(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95));
    }
    const rail = P.handrail(railPts, 1.0);
    rail.position.y = yBottom + h + roofH * 0.15;
    root.add(rail);
    // indicador de nivel por cable (barra luminosa vertical)
    levelSpan = h;
  } else {
    // tanque vertical: patas si es pequeño, faldón si es grande
    const headDepth = d * 0.25; // fondo 2:1 (profundidad = D/4)
    const onLegs = volume <= 15000;
    const legH = onLegs ? Math.max(0.45, 0.35 + d * 0.15) : 0;
    yBottom = legH + headDepth + (onLegs ? 0 : 0.35);
    totalH = yBottom + h + headDepth;

    const bottom = P.dishedHead(r, shell, true, 0.25, "bottom_head");
    bottom.position.y = yBottom;
    root.add(bottom);
    const body = P.cylinder(r, r, h, shell, 64, "shell");
    body.position.y = yBottom;
    root.add(body);
    if (waterTank) {
      const liquidMaterial = new THREE.MeshPhysicalMaterial({
        color: "#1677c8", emissive: "#0b3d91", emissiveIntensity: 0.22, roughness: 0.18, metalness: 0.05,
        transparent: true, opacity: 0.68, depthWrite: false,
      });
      liquid = P.cylinder(r * 0.94, r * 0.94, h, liquidMaterial, 64, "water_level");
      liquid.position.y = yBottom;
      liquid.renderOrder = 1;
      root.add(liquid);
    }
    const top = P.dishedHead(r, shell, false, 0.25, "top_head");
    top.position.y = yBottom + h;
    root.add(top);
    // costura de soldadura circunferencial
    for (const y of [yBottom, yBottom + h]) {
      const weld = P.ring(r + 0.004, 0.01, 0.012, M.polishedSteel());
      weld.position.y = y - 0.006;
      root.add(weld);
    }
    if (onLegs) {
      root.add(P.legs(d > 2 ? 4 : 3, r * 0.92, yBottom - headDepth * 0.5, 0.045 + d * 0.012, M.stainless()));
    } else {
      const skirt = P.cylinder(r * 0.98, r * 0.98, yBottom, M.paint("#8a9299", 0.5), 64, "skirt");
      root.add(skirt);
      const pad = P.cylinder(r * 1.15, r * 1.15, 0.12, M.paint("#9c9a94", 0.85), 64);
      root.add(pad);
    }
    if (jacketed) {
      const jh = h * 0.75;
      const jacket = P.cylinder(r + 0.05, r + 0.05, jh, M.insulationCladding(), 64, "jacket");
      jacket.position.y = yBottom + 0.05;
      root.add(jacket);
      for (let i = 0; i <= 3; i++) {
        const band = P.ring(r + 0.065, 0.015, 0.03, M.polishedSteel());
        band.position.y = yBottom + 0.05 + (jh * i) / 3 - 0.015;
        root.add(band);
      }
      // entrada de vapor/agua caliente y salida de condensado
      root.add(P.pipe([new THREE.Vector3(r + 0.05, yBottom + jh, 0), new THREE.Vector3(r + 0.35, yBottom + jh, 0), new THREE.Vector3(r + 0.35, totalH + 0.2, 0)], 0.035, M.insulationCladding(), 0.12));
      root.add(P.pipe([new THREE.Vector3(r + 0.05, yBottom + 0.15, 0.2), new THREE.Vector3(r + 0.3, yBottom + 0.15, 0.2), new THREE.Vector3(r + 0.3, 0.15, 0.2)], 0.02, M.polishedSteel(), 0.08));
    }
    // boca de hombre y boquillas en la tapa
    const manway = P.cylinder(0.24, 0.24, 0.12, M.polishedSteel(), 32, "manhole");
    manway.position.set(r * 0.4, yBottom + h + headDepth * 0.7, 0);
    root.add(manway);
    const bolts = P.boltCircle(0.22, 12, 0.012, 0.04);
    bolts.position.set(r * 0.4, yBottom + h + headDepth * 0.7 + 0.12, 0);
    root.add(bolts);
    const inlet = P.pipe([new THREE.Vector3(-r * 0.45, yBottom + h + headDepth * 0.6, 0), new THREE.Vector3(-r * 0.45, totalH + 0.35, 0), new THREE.Vector3(-r - 0.4, totalH + 0.35, 0)], 0.04, M.polishedSteel(), 0.12);
    root.add(inlet);
    // salida inferior con válvula
    const outlet = P.pipe([new THREE.Vector3(0, yBottom - headDepth, 0), new THREE.Vector3(0, Math.max(0.25, yBottom - headDepth - 0.3), 0), new THREE.Vector3(r + 0.3, Math.max(0.25, yBottom - headDepth - 0.3), 0)], 0.04, M.polishedSteel(), 0.1);
    root.add(outlet);
    const valve = P.butterflyValve(0.04);
    valve.position.set(r * 0.6, Math.max(0.25, yBottom - headDepth - 0.3), 0);
    valve.rotation.z = Math.PI / 2;
    root.add(valve);
    if (bool(params, "outlet_check_valve", false)) {
      const check = P.checkValve(0.04);
      check.position.set(r + 0.13, Math.max(0.25, yBottom - headDepth - 0.3), 0);
      root.add(check); // después de la válvula de fondo, antes de la succión
    }
    if (agitator) {
      const drive = P.group("agitator_motor");
      const gb = P.gearbox(0.28);
      gb.position.y = 0.16;
      drive.add(gb);
      const mot = P.motor(3, "#2f4f6f");
      mot.rotation.z = Math.PI / 2;
      mot.position.y = 0.55;
      drive.add(mot);
      drive.position.y = yBottom + h + headDepth;
      root.add(drive);
      const coupling = P.cylinder(0.06, 0.06, 0.05, M.paint(M.SAFETY_YELLOW, 0.4), 6);
      coupling.position.y = yBottom + h + headDepth - 0.02;
      root.add(coupling);
      agitatorParts.push(coupling);
    }
    if (totalH > 3.2) {
      const ladder = P.ladder(totalH - 0.3, 0.45, totalH > 5);
      ladder.position.set(0, 0, r + 0.25);
      root.add(ladder);
    }
    levelSpan = h;
  }

  // mirilla / indicador de nivel: tubo de vidrio con barra luminosa
  const gaugeX = -r - 0.07;
  const tube = P.cylinder(0.025, 0.025, levelSpan, M.glass("#ffffff", 0.3), 16, "level_gauge");
  tube.position.set(gaugeX, yBottom, r * 0.3);
  root.add(tube);
  levelBar = P.cylinder(0.016, 0.016, 1, levelMat, 12);
  levelBar.position.set(gaugeX, yBottom, r * 0.3);
  levelBar.castShadow = false;
  root.add(levelBar);

  const light = P.stackLight(0.25);
  light.object.position.set(form === "silo" ? 0.3 : -r * 0.3, totalH, form === "silo" ? 0 : -r * 0.3);
  root.add(light.object);

  const plate = P.nameplate([content.toUpperCase(), `${Math.round(volume).toLocaleString("es-CO")} L`], 0.5, 0.2);
  plate.position.set(0, yBottom + h * 0.35, r + 0.005);
  root.add(plate);

  let angle = 0;
  function update(frame: AnimationFrame, dt: number): void {
    const level = Math.max(0.001, Math.min(1, ch(frame, "level", 0.5)));
    if (levelBar) levelBar.scale.y = levelSpan * level;
    if (liquid) liquid.scale.y = level;
    levelMat.emissive.set(level < 0.1 ? "#ff3b3b" : level > 0.9 ? "#ffb000" : "#3fd0ff");
    angle += (ch(frame, "agitator_rpm") / 60) * Math.PI * 2 * dt;
    agitatorParts.forEach((p) => (p.rotation.y = angle));
    light.set(ch(frame, "alarm_light", 1), performance.now() / 1000);
  }
  update({ channels: {}, state: "idle" }, 0);

  return {
    root,
    size: { dx: d + 0.6, dy: d + 0.6, height: totalH },
    update,
    dispose: () => disposeObject(root),
  };
}
