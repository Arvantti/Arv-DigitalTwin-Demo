/**
 * Geometría paramétrica de la marmita con chaqueta de vapor.
 * Dimensiones con la misma regla que kettle_dimensions() en behavior.py (H/D = 1,2).
 * La media tapa del lado del operador se abre al cargar, y deja ver el producto y el ancla.
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
} from "@twin/3d";

export function kettleDimensions(volumeL: number): { d: number; h: number } {
  const v = volumeL / 1000;
  const d = Math.cbrt((4 * v) / (Math.PI * 1.2));
  return { d, h: 1.2 * d };
}

const COLD_SAUCE = new THREE.Color("#8f1d16");
const HOT_SAUCE = new THREE.Color("#c4321f");
const WATER = new THREE.Color("#7fa6b8");

function steamSprite(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function build(params: Params): EquipmentModel {
  const volume = num(params, "volume_l", 2500);
  const coverage = num(params, "jacket_coverage", 0.7);
  const legCount = Math.round(num(params, "legs", 4));
  const agitatorKw = num(params, "agitator_kw", 7.5);
  const scrapers = bool(params, "scrapers", true);
  const { d, h } = kettleDimensions(volume);
  const r = d / 2;
  const headDepth = r * 0.4;
  const legH = 0.55 + d * 0.08;
  const yB = legH + headDepth; // unión fondo-cuerpo
  const yTop = yB + h;

  const root = P.group("jacketed-kettle");
  const steel = M.stainless();

  // cuerpo, fondo y chaqueta
  const bottom = P.dishedHead(r, steel, true, 0.2, "bottom_head");
  bottom.position.y = yB;
  root.add(bottom);
  const shellGeo = new THREE.CylinderGeometry(r, r, h, 64, 1, true);
  shellGeo.translate(0, h / 2, 0);
  const shell = P.mesh(shellGeo, M.stainless(), "shell");
  (shell.material as THREE.Material).side = THREE.DoubleSide;
  shell.position.y = yB;
  root.add(shell);
  const jacketH = h * coverage;
  const jacket = P.cylinder(r + 0.07, r + 0.07, jacketH, steel, 64, "jacket");
  jacket.position.y = yB - 0.02;
  root.add(jacket);
  const jacketBottom = P.dishedHead(r + 0.07, steel, true, 0.2);
  jacketBottom.position.y = yB - 0.02;
  root.add(jacketBottom);
  for (const y of [yB - 0.02, yB - 0.02 + jacketH, yTop]) {
    const weld = P.ring(r + 0.085, 0.02, 0.025, M.polishedSteel());
    weld.position.y = y - 0.012;
    root.add(weld);
  }
  // borde superior (labio) del cuerpo
  const lip = P.ring(r + 0.03, 0.05, 0.04, M.polishedSteel());
  lip.position.y = yTop;
  root.add(lip);

  // tapa: media tapa fija atrás (-Z) con el puente del agitador, media tapa abatible al frente (+Z)
  const lidFixedGeo = new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.025, 64, 1, false, Math.PI / 2, Math.PI);
  lidFixedGeo.translate(0, 0.0125, 0);
  const lidFixed = P.mesh(lidFixedGeo, M.polishedSteel(), "lid");
  lidFixed.position.y = yTop + 0.04;
  root.add(lidFixed);
  const lidHinge = P.group("manhole");
  lidHinge.position.set(0, yTop + 0.065, 0);
  const lidGeo = new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.02, 64, 1, false, -Math.PI / 2, Math.PI);
  lidGeo.translate(0, 0.01, 0);
  const lidMov = P.mesh(lidGeo, M.polishedSteel());
  lidHinge.add(lidMov);
  const lidHandle = P.box(0.28, 0.05, 0.05, M.polishedSteel(), 0.015);
  lidHandle.position.set(0, 0.05, r * 0.85);
  lidHinge.add(lidHandle);
  root.add(lidHinge);

  // accionamiento del agitador sobre puente
  const bridge = P.box(d + 0.1, 0.12, 0.22, M.paint("#9aa3ab", 0.45), 0.02, "agitator_drive");
  bridge.position.set(0, yTop + 0.15, -0.05);
  root.add(bridge);
  const gb = P.gearbox(0.22 + 0.025 * agitatorKw);
  gb.position.set(0, yTop + 0.33 + 0.012 * agitatorKw, 0);
  root.add(gb);
  const mot = P.motor(agitatorKw, "#2f4f6f");
  mot.rotation.z = Math.PI / 2;
  mot.position.set(0, yTop + 0.55 + 0.03 * agitatorKw + (mot.userData.length as number) * 0.35, 0);
  root.add(mot);

  // eje y ancla (giran)
  const agitator = P.group("anchor");
  const shaft = P.cylinder(0.04, 0.04, h + headDepth * 0.6, M.polishedSteel(), 20, "agitator_shaft");
  shaft.position.y = -h - headDepth * 0.6 + 0.1;
  agitator.add(shaft);
  const anchorPts = [
    new THREE.Vector3(-r * 0.86, -h * 0.25, 0),
    new THREE.Vector3(-r * 0.86, -h * 0.95, 0),
    new THREE.Vector3(-r * 0.5, -h - headDepth * 0.75, 0),
    new THREE.Vector3(0, -h - headDepth * 0.85, 0),
    new THREE.Vector3(r * 0.5, -h - headDepth * 0.75, 0),
    new THREE.Vector3(r * 0.86, -h * 0.95, 0),
    new THREE.Vector3(r * 0.86, -h * 0.25, 0),
  ];
  agitator.add(P.pipe(anchorPts, 0.03, M.polishedSteel(), 0.18));
  if (scrapers) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const blade = P.box(0.025, h * 0.18, 0.1, M.plastic("#f4f4f0", 0.5), 0.006, "scrapers");
        blade.position.set(s * r * 0.92, -h * (0.4 + i * 0.2), 0.04 * s);
        agitator.add(blade);
      }
    }
  }
  agitator.position.y = yTop + 0.05;
  root.add(agitator);

  // producto: superficie y "volumen" visible por la tapa abierta
  const productMat = M.liquid("#8f1d16");
  const surface = P.mesh(new THREE.CircleGeometry(r - 0.01, 64).rotateX(-Math.PI / 2), productMat);
  surface.castShadow = false;
  root.add(surface);

  // patas y estructura
  root.add(P.legs(legCount, r * 0.95, legH + headDepth * 0.35, 0.05, steel));

  // válvula de fondo y salida
  const yOut = legH * 0.55;
  root.add(P.pipe([new THREE.Vector3(0, yB - headDepth, 0), new THREE.Vector3(0, yOut, 0), new THREE.Vector3(r + 0.45, yOut, 0)], 0.045, M.polishedSteel(), 0.12));
  const valve = P.butterflyValve(0.045);
  valve.position.set(0, (yB - headDepth + yOut) / 2 + 0.05, 0);
  root.add(valve);

  // línea de vapor aislada con válvula de control y manómetro; trampa de condensado
  const steamPts = [
    new THREE.Vector3(r + 0.07, yB + jacketH * 0.85, -r * 0.3),
    new THREE.Vector3(r + 0.4, yB + jacketH * 0.85, -r * 0.3),
    new THREE.Vector3(r + 0.4, yTop + 0.8, -r * 0.3),
  ];
  root.add(P.pipe(steamPts, 0.05, M.insulationCladding(), 0.15));
  const actuator = P.group("steam_inlet");
  actuator.add(P.box(0.14, 0.14, 0.14, M.paint("#3a3f45", 0.5), 0.02));
  const diaphragm = P.cylinder(0.14, 0.14, 0.09, M.paint("#1e5aa8", 0.4), 32);
  diaphragm.position.y = 0.12;
  actuator.add(diaphragm);
  actuator.position.set(r + 0.4, yB + jacketH * 0.85 + 0.35, -r * 0.3);
  root.add(actuator);
  const gauge = P.cylinderZ(0.06, 0.03, M.paint("#e8e8e8", 0.3), 24);
  gauge.position.set(r + 0.4, yB + jacketH * 0.85 + 0.12, -r * 0.3 + 0.08);
  root.add(gauge);
  root.add(P.pipe([new THREE.Vector3(r + 0.07, yB + 0.05, r * 0.3), new THREE.Vector3(r + 0.3, yB + 0.05, r * 0.3), new THREE.Vector3(r + 0.3, 0.2, r * 0.3)], 0.025, M.polishedSteel(), 0.08));
  const trap = P.box(0.12, 0.1, 0.1, M.darkSteel(), 0.02, "condensate_trap");
  trap.position.set(r + 0.3, 0.32, r * 0.3);
  root.add(trap);

  // termopozo con cabezal transmisor
  const tw = P.cylinderX(0.02, 0.18, M.polishedSteel(), 12, "thermowell");
  tw.position.set(-r - 0.09, yB + h * 0.25, 0);
  root.add(tw);
  const head = P.cylinder(0.05, 0.05, 0.08, M.paint("#1e5aa8", 0.4), 20);
  head.position.set(-r - 0.2, yB + h * 0.25 - 0.04, 0);
  root.add(head);

  // caja de control con baliza
  const cbox = P.cabinet(0.45, 0.55, 0.22, "#d4d8dc");
  cbox.position.set(-r * 0.7, 0.5, r + 0.25);
  root.add(cbox);
  const post = P.cylinder(0.03, 0.03, 0.5, M.polishedSteel(), 12);
  post.position.set(-r * 0.7, 0, r + 0.25);
  root.add(post);
  const light = P.stackLight(0.2);
  light.object.position.set(-r * 0.7, 1.05, r + 0.25);
  root.add(light.object);

  const plate = P.nameplate([`MARMITA ${Math.round(volume).toLocaleString("es-CO")} L`, "VAPOR 3 bar · AISI 304"], 0.45, 0.14);
  plate.position.set(0, yB + jacketH * 0.4, r + 0.071);
  root.add(plate);

  // vapor superficial (partículas)
  const steamCount = 90;
  const steamGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(steamCount * 3);
  const seeds = new Float32Array(steamCount);
  for (let i = 0; i < steamCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * r * 0.85;
    pos.set([Math.cos(a) * rr, 0, Math.abs(Math.sin(a) * rr)], i * 3);
    seeds[i] = Math.random();
  }
  steamGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const sprite = steamSprite();
  const steamMat = new THREE.PointsMaterial({
    size: 0.35,
    map: sprite ?? undefined,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    color: "#e8eef2",
  });
  const steam = new THREE.Points(steamGeo, steamMat);
  root.add(steam);

  let angle = 0;
  let lid = 0;
  const color = new THREE.Color();

  function update(frame: AnimationFrame, dt: number): void {
    const level = Math.max(0, Math.min(1, ch(frame, "level")));
    const fillH = level * (h + headDepth * 0.4);
    surface.visible = level > 0.005;
    surface.position.y = yB - headDepth * 0.4 + fillH;
    const heat = ch(frame, "product_heat");
    const v = frame.variables ?? {};
    const isWater = typeof v.brix === "number" ? (v.brix as number) < 3 : false;
    color.copy(isWater ? WATER : COLD_SAUCE).lerp(isWater ? WATER : HOT_SAUCE, heat);
    productMat.color.copy(color);
    productMat.emissive.copy(color).multiplyScalar(0.18); // el interior queda en sombra: que el producto se lea

    angle += (ch(frame, "agitator_rpm") / 60) * Math.PI * 2 * dt;
    agitator.rotation.y = angle;

    const target = ch(frame, "charging") > 0.5 ? 1 : 0;
    lid += (target - lid) * Math.min(1, dt * 2.5);
    lidHinge.rotation.x = -lid * 1.75; // bisagra en el centro; abre hacia atrás
    diaphragm.scale.y = 1 + 0.25 * ch(frame, "steam");

    // vapor: sube desde la superficie si el producto está caliente y la tapa abierta
    const intensity = Math.max(0, heat - 0.6) / 0.4;
    steamMat.opacity = 0.35 * intensity * (0.4 + 0.6 * Math.max(lid, 0.3));
    const p = steamGeo.attributes.position as THREE.BufferAttribute;
    const now = performance.now() / 1000;
    for (let i = 0; i < steamCount; i++) {
      const life = (now * 0.35 + seeds[i]) % 1;
      p.setY(i, surface.position.y + life * 1.4);
    }
    p.needsUpdate = true;
    light.set(ch(frame, "alarm_light", 1), now);
  }
  update({ channels: { level: 0.6 }, state: "idle" }, 0);

  return {
    root,
    size: { dx: d + 1.0, dy: d + 0.6, height: (mot.position.y as number) + 0.4 },
    update,
    dispose: () => disposeObject(root),
  };
}
