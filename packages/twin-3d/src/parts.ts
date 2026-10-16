/**
 * Piezas industriales reutilizables. Cada función devuelve un Object3D con su origen en un
 * punto natural (base o eje) para componerlas fácilmente desde los geometry.ts de la librería.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as M from "./materials.ts";
import { hmiScreen, textTexture } from "./textures.ts";

// ------------------------------------------------------------------ utilidades básicas

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export function group(name?: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (name) g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Caja con bordes redondeados (los cantos vivos delatan un modelo "de juguete"). Origen en el centro. */
export function box(w: number, h: number, d: number, material: THREE.Material, radius = 0.015, name?: string): THREE.Mesh {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  const geo = r > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  return mesh(geo, material, name);
}

/** Caja apoyada: origen en el centro de la cara inferior. */
export function slab(w: number, h: number, d: number, material: THREE.Material, radius = 0.015, name?: string): THREE.Mesh {
  const m = box(w, h, d, material, radius, name);
  m.geometry.translate(0, h / 2, 0);
  return m;
}

/** Cilindro vertical apoyado (origen en el centro de la base). */
export function cylinder(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 40, name?: string, open = false): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open);
  geo.translate(0, h / 2, 0);
  return mesh(geo, material, name);
}

/** Cilindro a lo largo de +X, centrado en el origen. */
export function cylinderX(r: number, length: number, material: THREE.Material, segments = 32, name?: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, length, segments);
  geo.rotateZ(Math.PI / 2);
  return mesh(geo, material, name);
}

/** Cilindro a lo largo de +Z, centrado en el origen. */
export function cylinderZ(r: number, length: number, material: THREE.Material, segments = 32, name?: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, length, segments);
  geo.rotateX(Math.PI / 2);
  return mesh(geo, material, name);
}

/** Fondo/tapa toriesférica aproximada (elipse 2:1). Origen en el plano de unión, abombada hacia +Y (o -Y si down). */
export function dishedHead(radius: number, material: THREE.Material, down = false, depthRatio = 0.25, name?: string): THREE.Mesh {
  const depth = radius * 2 * depthRatio;
  const pts: THREE.Vector2[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * depth * (down ? -1 : 1)));
  }
  if (down) pts.reverse();
  const geo = new THREE.LatheGeometry(pts, 48);
  return mesh(geo, material, name);
}

/** Tronco de cono vertical apoyado: rBottom abajo, rTop arriba. */
export function frustum(rBottom: number, rTop: number, h: number, material: THREE.Material, name?: string): THREE.Mesh {
  return cylinder(rTop, rBottom, h, material, 48, name);
}

/** Anillo/brida en un plano perpendicular a Y. */
export function ring(rOuter: number, thickness: number, height: number, material: THREE.Material, name?: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rOuter - thickness, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, material, name);
}

/** Tubería por una polilínea con codos redondeados. */
export function pipe(points: THREE.Vector3[], radius: number, material: THREE.Material, bendRadius = radius * 3, name?: string): THREE.Mesh {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let current = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (!next) {
      path.add(new THREE.LineCurve3(current, p.clone()));
      break;
    }
    const inDir = p.clone().sub(current).normalize();
    const outDir = next.clone().sub(p).normalize();
    const r = Math.min(bendRadius, p.distanceTo(current) / 2, next.distanceTo(p) / 2);
    const a = p.clone().addScaledVector(inDir, -r);
    const b = p.clone().addScaledVector(outDir, r);
    path.add(new THREE.LineCurve3(current, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    current = b;
  }
  const segments = Math.max(16, points.length * 24);
  const geo = new THREE.TubeGeometry(path, segments, radius, 16, false);
  return mesh(geo, material, name);
}

/** Pernos distribuidos en círculo (detalle de bridas). */
export function boltCircle(radius: number, count: number, boltR: number, height: number, material: THREE.Material = M.darkSteel()): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(boltR, boltR, height, 6);
  geo.translate(0, height / 2, 0);
  const inst = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  return inst;
}

// ------------------------------------------------------------------ piezas electromecánicas

/** Motor eléctrico TEFC con aletas, ventilador y caja de bornes. Eje a lo largo de +X; origen en el centro del eje. */
export function motor(powerKw: number, color = "#2f4f6f"): THREE.Group {
  const r = 0.09 + 0.035 * Math.sqrt(powerKw);
  const len = r * 3.2;
  const g = group("motor");
  const body = cylinderX(r, len, M.paint(color, 0.35), 40);
  g.add(body);
  // aletas de enfriamiento
  const finGeo = new THREE.BoxGeometry(len * 0.82, 0.012, r * 0.18);
  const fins = new THREE.InstancedMesh(finGeo, M.paint(color, 0.35), 16);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    mtx.makeRotationX(a).setPosition(0, Math.cos(a) * r, Math.sin(a) * r);
    mtx.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
    fins.setMatrixAt(i, mtx);
  }
  fins.castShadow = true;
  g.add(fins);
  const fan = cylinderX(r * 1.05, len * 0.22, M.paint("#3a3d42", 0.5), 40);
  fan.position.x = -len * 0.6;
  g.add(fan);
  const shaft = cylinderX(r * 0.18, len * 0.3, M.polishedSteel(), 16);
  shaft.position.x = len * 0.62;
  g.add(shaft);
  const tbox = box(r * 0.9, r * 0.5, r * 0.8, M.paint(color, 0.35), 0.01);
  tbox.position.set(0, r + r * 0.25, 0);
  g.add(tbox);
  for (const s of [-1, 1]) {
    const foot = box(len * 0.25, r * 0.25, r * 1.6, M.paint(color, 0.35), 0.005);
    foot.position.set(s * len * 0.3, -r - r * 0.05, 0);
    g.add(foot);
  }
  g.userData.length = len * 1.3;
  g.userData.radius = r;
  return g;
}

/** Reductor de engranajes (caja). Origen en el centro. */
export function gearbox(size: number, color = "#2f4f6f"): THREE.Group {
  const g = group("gearbox");
  g.add(box(size, size * 0.9, size * 0.8, M.paint(color, 0.4), size * 0.08));
  const out = cylinder(size * 0.18, size * 0.18, size * 0.3, M.polishedSteel(), 24);
  out.position.y = -size * 0.75;
  g.add(out);
  return g;
}

/** Gabinete eléctrico con puerta, bisagras, manija y rejilla. Origen en el centro de la base; frente a +Z. */
export function cabinet(w: number, h: number, d: number, color = "#cfd3d6"): THREE.Group {
  const g = group("control_cabinet");
  g.add(slab(w, h, d, M.paint(color, 0.45), 0.02));
  const seam = M.paint("#7d8287", 0.6);
  const doors = Math.max(1, Math.round(w / 0.8));
  for (let i = 1; i < doors; i++) {
    const s = box(0.006, h * 0.94, 0.004, seam, 0);
    s.position.set(-w / 2 + (w / doors) * i, h / 2, d / 2 + 0.001);
    g.add(s);
  }
  for (let i = 0; i < doors; i++) {
    const cx = -w / 2 + (w / doors) * (i + 0.5);
    const handle = box(0.03, 0.14, 0.03, M.darkSteel(), 0.008);
    handle.position.set(cx + (w / doors) * 0.36, h * 0.55, d / 2 + 0.02);
    g.add(handle);
    for (let k = 0; k < 6; k++) {
      const v = box(0.18, 0.012, 0.006, M.paint("#9aa0a6", 0.6), 0.002);
      v.position.set(cx, h * 0.12 + k * 0.025, d / 2 + 0.003);
      g.add(v);
    }
  }
  const plate = nameplate(["CONTROL", "400 V · 60 Hz"], 0.2, 0.08);
  plate.position.set(-w / 2 + 0.16, h * 0.85, d / 2 + 0.004);
  g.add(plate);
  return g;
}

/** Placa de datos (texto). Plano orientado a +Z. */
export function nameplate(lines: string[], w = 0.25, h = 0.1, bg = "#d9dde1", fg = "#1b1e22"): THREE.Mesh {
  const tex = textTexture(lines, { width: 512, height: Math.round((512 * h) / w), bg, fg, font: "700 44px Inter, Arial, sans-serif" });
  const mat = new THREE.MeshStandardMaterial({ color: tex ? "#ffffff" : bg, map: tex ?? undefined, roughness: 0.4, metalness: 0.3 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.name = "nameplate";
  return m;
}

export interface HmiHandle {
  object: THREE.Group;
  draw: (title: string, rows: [string, string][], status: string, statusColor: string) => void;
}

/** Panel HMI con pantalla táctil emisiva sobre brazo. Origen en la base del brazo; pantalla mirando a +Z. */
export function hmiPanel(armHeight = 0.5): HmiHandle {
  const g = group("hmi_panel");
  const arm = cylinder(0.03, 0.03, armHeight, M.aluminum(), 16);
  g.add(arm);
  const head = group("hmi_head");
  head.position.y = armHeight + 0.2;
  head.rotation.x = -0.18;
  head.add(box(0.5, 0.36, 0.06, M.paint("#2b2f35", 0.5), 0.015));
  const { texture, draw } = hmiScreen();
  const screenMat = new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: "#ffffff",
    emissiveMap: texture ?? undefined,
    emissiveIntensity: texture ? 1.2 : 0.2,
    roughness: 0.15,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.275), screenMat);
  screen.position.z = 0.031;
  screen.name = "hmi_screen";
  head.add(screen);
  g.add(head);
  return { object: g, draw };
}

export interface StackLightHandle {
  object: THREE.Group;
  /** 0 apagada, 1 verde, 2 amarilla, 3 roja. */
  set(level: number, time: number): void;
}

/** Baliza de 3 colores (andon). Origen en la base. */
export function stackLight(poleHeight = 0.35): StackLightHandle {
  const g = group("stack_light");
  g.add(cylinder(0.012, 0.012, poleHeight, M.aluminum(), 12));
  const colors = ["#22e06b", "#ffb000", "#ff2a2a"];
  const mats = colors.map((c) => M.emissive(c, 0.05));
  mats.forEach((mat, i) => {
    const seg = cylinder(0.035, 0.035, 0.07, mat, 24);
    seg.position.y = poleHeight + i * 0.075;
    g.add(seg);
  });
  const cap = cylinder(0.03, 0.035, 0.02, M.paint("#222", 0.5), 24);
  cap.position.y = poleHeight + 3 * 0.075;
  g.add(cap);
  return {
    object: g,
    set(level, time) {
      mats.forEach((mat, i) => {
        const on = Math.round(level) === i + 1;
        const blink = i === 2 ? 0.55 + 0.45 * Math.sin(time * 8) : 1;
        mat.emissiveIntensity = on ? 6 * blink : 0.04;
      });
    },
  };
}

/** Escalera de gato con jaula opcional. Origen en el pie; sube por +Y; peldaños a lo largo de X. */
export function ladder(height: number, width = 0.45, cage = true, material: THREE.Material = M.paint(M.SAFETY_YELLOW, 0.5)): THREE.Group {
  const g = group("ladder");
  for (const s of [-1, 1]) {
    const rail = cylinder(0.02, 0.02, height, material, 10);
    rail.position.x = (s * width) / 2;
    g.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.012, 0.012, width, 8);
  rungGeo.rotateZ(Math.PI / 2);
  const n = Math.floor(height / 0.3);
  const rungs = new THREE.InstancedMesh(rungGeo, material, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) rungs.setMatrixAt(i, m.makeTranslation(0, 0.3 * (i + 1), 0));
  rungs.castShadow = true;
  g.add(rungs);
  if (cage && height > 3) {
    const hoopGeo = new THREE.TorusGeometry(0.38, 0.012, 6, 24, Math.PI * 1.4);
    hoopGeo.rotateX(Math.PI / 2);
    hoopGeo.rotateY(-Math.PI * 0.2);
    for (let y = 2.2; y < height; y += 0.9) {
      const hoop = mesh(hoopGeo, material);
      hoop.position.set(0, y, 0.38);
      g.add(hoop);
    }
  }
  return g;
}

/** Baranda tubular (pasamanos, rodapié) por una polilínea en el plano XZ. Origen en el nivel del piso. */
export function handrail(points: THREE.Vector2[], height = 1.1, material: THREE.Material = M.paint(M.SAFETY_YELLOW, 0.45)): THREE.Group {
  const g = group("handrail");
  const top = points.map((p) => new THREE.Vector3(p.x, height, p.y));
  const mid = points.map((p) => new THREE.Vector3(p.x, height * 0.5, p.y));
  g.add(pipe(top, 0.024, material, 0.1));
  g.add(pipe(mid, 0.018, material, 0.1));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const p = a.clone().lerp(b, k / n);
      const post = cylinder(0.022, 0.022, height, material, 10);
      post.position.set(p.x, 0, p.y);
      g.add(post);
    }
  }
  return g;
}

/** Guarda perimetral de seguridad: postes de aluminio + paneles de vidrio. Rectángulo w×d centrado. */
export function safetyFence(w: number, d: number, h = 2.0, openFront = 0): THREE.Group {
  const g = group("safety_fence");
  const post = M.aluminum();
  const corners = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  const sides: [number[], number[], boolean][] = [
    [corners[0], corners[1], false],
    [corners[1], corners[2], false],
    [corners[2], corners[3], true],
    [corners[3], corners[0], false],
  ];
  for (const [a, b, front] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.4));
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const cx = a[0] + (b[0] - a[0]) * (t0 + t1) / 2;
      const cz = a[1] + (b[1] - a[1]) * (t0 + t1) / 2;
      const segLen = len / n;
      if (front && openFront > 0 && Math.abs(cx) < openFront / 2) continue; // acceso del operador
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(segLen - 0.06, h - 0.25), M.glass());
      panel.position.set(cx, h / 2 + 0.08, cz);
      panel.rotation.y = -angle;
      panel.renderOrder = 2;
      g.add(panel);
      const rail = box(segLen, 0.04, 0.04, post, 0.006);
      rail.position.set(cx, h, cz);
      rail.rotation.y = -angle;
      g.add(rail);
      const kick = box(segLen, 0.1, 0.03, M.paint(M.SAFETY_YELLOW, 0.5), 0.005);
      kick.position.set(cx, 0.05, cz);
      kick.rotation.y = -angle;
      g.add(kick);
    }
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = box(0.05, h, 0.05, post, 0.008);
      p.position.set(a[0] + (b[0] - a[0]) * t, h / 2, a[1] + (b[1] - a[1]) * t);
      g.add(p);
    }
  }
  return g;
}

/** Patas redondas con base para recipientes. Origen en el piso; patas sobre un círculo de radio r. */
export function legs(count: number, circleR: number, height: number, legR: number, material: THREE.Material): THREE.Group {
  const g = group("legs");
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    const x = Math.cos(a) * circleR;
    const z = Math.sin(a) * circleR;
    const leg = cylinder(legR, legR, height, material, 20);
    leg.position.set(x, 0, z);
    g.add(leg);
    const foot = cylinder(legR * 1.9, legR * 2.2, 0.04, material, 20);
    foot.position.set(x, 0, z);
    g.add(foot);
    const pad = box(legR * 3, 0.015, legR * 3, material, 0.003);
    pad.position.set(x, height - 0.02, z);
    g.add(pad);
  }
  return g;
}

/** Válvula mariposa con manija, en línea a lo largo de Y. Origen en el centro. */
export function butterflyValve(pipeR: number, material: THREE.Material = M.stainless()): THREE.Group {
  const g = group("valve");
  const bodyGeo = new THREE.CylinderGeometry(pipeR * 1.8, pipeR * 1.8, pipeR * 1.2, 32);
  g.add(mesh(bodyGeo, material));
  const neck = cylinderX(pipeR * 0.35, pipeR * 2.2, material, 12);
  neck.position.x = pipeR * 2.4;
  g.add(neck);
  const handle = box(pipeR * 5, pipeR * 0.4, pipeR * 0.8, M.paint("#c62828", 0.5), pipeR * 0.15);
  handle.position.set(pipeR * 3.6, 0, pipeR * 1.6);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}
