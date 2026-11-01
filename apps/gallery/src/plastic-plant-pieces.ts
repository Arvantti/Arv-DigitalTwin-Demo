/**
 * Equipos de la planta de inyección de plásticos que no tienen tipo en la librería: silos, dosificadores, transporte
 * neumático, reciclaje (mesa de selección, lavado, big bag), taller de moldes (fresadora CNC, electroerosión,
 * rectificadora, estantería de moldes, carro de moldes), laboratorio (máquina de medición por coordenadas, banco de
 * caída) y servicios (secador de aire, torre de enfriamiento).
 *
 * Son piezas de la escena sin comportamiento, dimensionadas con la huella del plant.yaml ([x = ancho, y = largo,
 * z = alto]). Origen en el centro de la huella, en el piso; x del plano = x local, y del plano = z local.
 */
import * as THREE from "three";
import { materials as M, parts as P } from "@twin/3d";

type Footprint = [number, number, number];
type Builder = (footprint: Footprint, params: Record<string, unknown>) => THREE.Object3D;

const steel = () => M.stainless();
const frame = () => M.paint("#59626c", 0.55);
const yellow = () => M.paint(M.SAFETY_YELLOW, 0.5);
const dark = () => M.darkSteel();
const machine = () => M.paint("#dfe3e6", 0.4);
const accent = () => M.paint("#2f5d8a", 0.4);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Caja apoyada en y (origen en la cara inferior). */
function slab(g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0.015): THREE.Mesh {
  const m = P.slab(w, h, d, mat, r);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Cuatro postes y el marco superior de perfil cuadrado, centrados en el origen. */
function postFrame(w: number, d: number, h: number, mat: THREE.Material, s = 0.08, y0 = 0): THREE.Group {
  const g = P.group("frame");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(g, s, h, s, mat, (sx * (w - s)) / 2, y0, (sz * (d - s)) / 2, 0.004);
  const y = y0 + h - s;
  for (const sz of [-1, 1]) slab(g, w, s, s, mat, 0, y, (sz * (d - s)) / 2, 0.004);
  for (const sx of [-1, 1]) slab(g, s, s, d, mat, (sx * (w - s)) / 2, y, 0, 0.004);
  return g;
}

function lightPanel(g: THREE.Group, x: number, y: number, z: number, w = 0.28, h = 0.18, color = "#3fd0ff"): void {
  g.add(at(P.box(w, h, 0.02, M.emissive(color, 0.5), 0.004), x, y, z));
}

function stack(g: THREE.Group, x: number, y: number, z: number): void {
  g.add(at(P.stackLight(0.3).object, x, y, z));
}

/** Tolva con cargador de vacío encima (receptor de material de una máquina o dosificador). */
function loader(r: number): THREE.Group {
  const g = P.group("loader");
  g.add(P.cylinder(r, r, r * 1.6, steel(), 28));
  g.add(at(P.dishedHead(r, steel(), false, 0.18), 0, r * 1.6, 0));
  g.add(at(P.cylinder(r * 0.35, r * 0.35, r * 0.4, accent(), 16), 0, r * 1.6 + r * 0.3, 0));
  g.add(at(P.cylinderX(r * 0.18, r * 0.9, steel(), 12), r * 0.9, r * 1.2, 0));
  return g;
}

// ------------------------------------------------------------------ materia prima

/** Silo exterior de resina: cuerpo cilíndrico, cono de descarga sobre patas, techo cónico, escalera con jaula y baranda. */
const silo: Builder = ([dx, dy, h]) => {
  const g = P.group("silo");
  const r = (Math.min(dx, dy) / 2) * 0.88;
  const legH = Math.min(3.2, h * 0.22);
  const coneH = r * 1.1;
  const coneY = legH - coneH * 0.45;
  const bodyY = coneY + coneH;
  const roofH = r * 0.4;
  const bodyH = Math.max(2, h - bodyY - roofH);
  const skin = M.paint("#e7eaec", 0.35);
  g.add(at(P.cylinder(r, r, bodyH, skin, 48), 0, bodyY, 0));
  // Costuras de los anillos del cuerpo.
  for (let y = bodyY + 1.2; y < bodyY + bodyH - 0.2; y += 1.2) g.add(at(P.ring(r + 0.015, 0.03, 0.04, M.paint("#c4cad0", 0.4)), 0, y, 0));
  g.add(at(P.frustum(0.18, r, coneH, skin), 0, coneY, 0));
  g.add(at(P.frustum(r, 0.35, roofH, skin), 0, bodyY + bodyH, 0));
  g.add(at(P.cylinder(0.25, 0.25, 0.35, steel(), 20), 0, bodyY + bodyH + roofH, 0));
  // Patas con arriostres.
  const legR = r * 0.85;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.add(at(P.box(0.22, bodyY + 0.3, 0.22, frame(), 0.01), Math.cos(a) * legR, (bodyY + 0.3) / 2, Math.sin(a) * legR));
    g.add(at(P.box(0.5, 0.04, 0.5, frame(), 0.004), Math.cos(a) * legR, 0.02, Math.sin(a) * legR));
  }
  for (const sz of [-1, 1]) g.add(at(P.box(legR * 1.42, 0.12, 0.08, frame(), 0.004), 0, legH * 0.45, (sz * legR) / Math.SQRT2));
  for (const sx of [-1, 1]) g.add(at(P.box(0.08, 0.12, legR * 1.42, frame(), 0.004), (sx * legR) / Math.SQRT2, legH * 0.45, 0));
  // Descarga a la línea de transporte neumático.
  g.add(at(P.cylinder(0.12, 0.12, 0.35, dark(), 16), 0, coneY - 0.35, 0));
  g.add(P.pipe([v(0, coneY - 0.3, 0), v(0, 0.5, 0), v(r + 0.4, 0.5, 0)], 0.05, steel()));
  // Tubo de llenado desde el camión, subiendo por el costado.
  g.add(P.pipe([v(-r - 0.25, 1.0, 0.3), v(-r - 0.25, bodyY + bodyH + 0.15, 0.3), v(-r * 0.4, bodyY + bodyH + 0.15, 0.3)], 0.055, steel()));
  g.add(at(P.cylinderX(0.09, 0.2, dark(), 16), -r - 0.25, 1.0, 0.3));
  // Escalera con jaula y baranda del techo.
  const lad = P.ladder(bodyY + bodyH - 0.6, 0.45, true);
  lad.position.set(0, 0.6, r + 0.12);
  g.add(lad);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * (r - 0.12), Math.sin(a) * (r - 0.12)));
  }
  g.add(at(P.handrail(pts, 1.0), 0, bodyY + bodyH + roofH * 0.5, 0));
  // Indicador de nivel y placa.
  g.add(at(P.box(0.25, 0.35, 0.12, yellow(), 0.02), r * 0.6, bodyY + bodyH * 0.92, r * 0.78));
  g.add(at(P.box(1.2, 0.5, 0.02, M.paint("#2f5d8a", 0.4), 0.004), 0, bodyY + bodyH * 0.55, r + 0.005));
  return g;
};

/** Dosificador gravimétrico: tolvas de cada material (resina, molido, pigmento) con cargadores, cámara de pesaje y mezclador. */
const gravimetricBlender: Builder = ([dx, dy, h]) => {
  const g = P.group("gravimetric_blender");
  const s = Math.min(dx, dy);
  g.add(postFrame(s * 0.9, s * 0.9, h * 0.38, frame(), 0.07));
  // Mezclador y cámara de pesaje.
  slab(g, s * 0.62, h * 0.18, s * 0.62, machine(), 0, h * 0.38, 0, 0.03);
  slab(g, s * 0.5, h * 0.1, s * 0.5, M.glass("#cfe6f5", 0.3), 0, h * 0.56, 0, 0.01);
  g.add(at(P.frustum(0.08, s * 0.22, h * 0.14, steel()), 0, h * 0.24, 0));
  g.add(at(P.cylinder(0.08, 0.08, h * 0.24, steel(), 16), 0, 0, 0));
  // Cuatro tolvas con su cargador encima.
  const colors = ["#e7eaec", "#e7eaec", "#c9302c", "#2f6fb0"];
  let i = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * s * 0.2;
      const z = sz * s * 0.2;
      const hr = s * 0.17;
      g.add(at(P.frustum(hr * 0.35, hr, h * 0.1, steel()), x, h * 0.66, z));
      g.add(at(P.cylinder(hr, hr, h * 0.12, M.paint(colors[i++], 0.35), 24), x, h * 0.76, z));
      g.add(at(loader(hr * 0.7), x, h * 0.88, z));
    }
  // Controlador.
  slab(g, 0.3, 0.4, 0.12, M.paint("#cfd3d6", 0.45), s * 0.45, h * 0.4, 0, 0.02);
  lightPanel(g, s * 0.45, h * 0.52, 0.065, 0.2, 0.14);
  return g;
};

/** Central de vacío: bombas de canal lateral con su gabinete, filtro central y colector de tuberías hacia los cargadores. */
const vacuumStation: Builder = ([dx, dy, h]) => {
  const g = P.group("vacuum_conveying_station");
  slab(g, dx * 0.96, 0.12, dy * 0.9, frame(), 0, 0, 0, 0.01);
  for (let i = 0; i < 3; i++) {
    const x = -dx * 0.32 + i * dx * 0.24;
    slab(g, dx * 0.18, h * 0.42, dy * 0.6, M.paint("#2f7d6b", 0.4), x, 0.12, -dy * 0.12, 0.03);
    g.add(at(P.cylinderZ(dx * 0.07, 0.12, dark(), 24), x, 0.12 + h * 0.22, dy * 0.2));
    const motor = P.motor(7.5, "#2f5d8a");
    motor.position.set(x, 0.12 + h * 0.42 + 0.2, -dy * 0.12);
    g.add(motor);
    g.add(P.pipe([v(x, 0.12 + h * 0.42, dy * 0.12), v(x, h * 0.85, dy * 0.12), v(dx * 0.32, h * 0.85, dy * 0.12)], 0.05, steel()));
  }
  // Filtro central (ciclón y cartucho).
  const fx = dx * 0.38;
  g.add(at(P.cylinder(0.32, 0.32, h * 0.5, steel(), 32), fx, h * 0.3, -dy * 0.05));
  g.add(at(P.frustum(0.08, 0.32, h * 0.2, steel()), fx, h * 0.1, -dy * 0.05));
  g.add(at(P.dishedHead(0.32, steel(), false, 0.2), fx, h * 0.8, -dy * 0.05));
  g.add(at(P.cylinder(0.12, 0.12, 0.12, dark(), 16), fx, 0.0, -dy * 0.05));
  // Gabinete de control con pantalla.
  const cab = P.cabinet(0.8, h * 0.85, 0.35, "#cfd3d6");
  cab.position.set(-dx * 0.36, 0.12, dy * 0.3);
  g.add(cab);
  lightPanel(g, -dx * 0.36, h * 0.65, dy * 0.3 + 0.19, 0.3, 0.2);
  stack(g, -dx * 0.36 + 0.3, 0.12 + h * 0.85, dy * 0.3);
  // Colector general saliendo hacia la planta.
  g.add(P.pipe([v(-dx * 0.45, h * 0.95, -dy * 0.35), v(dx * 0.45, h * 0.95, -dy * 0.35)], 0.06, steel()));
  return g;
};

/** Estación de selección de materiales: tablero de acoples con las líneas de cada silo arriba y mangueras a cada máquina. */
const selectionStation: Builder = ([dx, dy, h]) => {
  const g = P.group("material_selection_station");
  const z = -dy * 0.25;
  for (const sx of [-1, 1]) slab(g, 0.1, h, 0.1, frame(), (sx * (dx - 0.1)) / 2, 0, z, 0.004);
  slab(g, dx * 0.96, h * 0.7, 0.05, M.paint("#cfd3d6", 0.5), 0, h * 0.2, z, 0.01);
  const cols = Math.max(4, Math.round(dx / 0.5));
  const rows = 3;
  const hose = M.plastic("#d9e6ef", 0.35);
  for (let c = 0; c < cols; c++) {
    const x = -dx * 0.44 + (c * dx * 0.88) / (cols - 1);
    // Línea vertical de material que llega desde arriba.
    g.add(at(P.cylinder(0.035, 0.035, h * 0.35, steel(), 12), x, h * 0.9, z));
    for (let r = 0; r < rows; r++) {
      const y = h * 0.32 + r * h * 0.18;
      g.add(at(P.cylinderZ(0.045, 0.12, steel(), 14), x, y, z + 0.08));
      g.add(at(P.cylinderZ(0.055, 0.03, dark(), 14), x, y, z + 0.15));
    }
    // Manguera conectada en una de las bocas y bajando hacia el piso.
    if (c % 2 === 0) {
      const y = h * 0.32 + ((c / 2) % rows) * h * 0.18;
      g.add(P.pipe([v(x, y, z + 0.17), v(x, y, z + 0.4), v(x + 0.15, 0.4, z + 0.45), v(x + 0.15, 0.4, dy * 0.5)], 0.04, hose, 0.2));
    }
  }
  // Rótulos de cada fila de máquinas.
  for (let r = 0; r < rows; r++) g.add(at(P.box(dx * 0.9, 0.06, 0.01, yellow(), 0.003), 0, h * 0.25 + r * h * 0.18, z + 0.03));
  // Colector superior.
  g.add(P.pipe([v(-dx * 0.48, h * 1.05, z), v(dx * 0.48, h * 1.05, z)], 0.06, steel()));
  return g;
};

// ------------------------------------------------------------------ reciclaje

/** Mesa de selección de material recuperado: cubierta de acero, canecas por color debajo y una tolva al molino. */
const sortingTable: Builder = ([dx, dy, h]) => {
  const g = P.group("sorting_table");
  const top = Math.max(0.85, h * 0.9);
  slab(g, dx * 0.9, 0.05, dy * 0.6, steel(), 0, top - 0.05, -dy * 0.1, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(g, 0.06, top - 0.05, 0.06, frame(), sx * dx * 0.42, 0, -dy * 0.1 + sz * dy * 0.27, 0.004);
  slab(g, dx * 0.9, 0.12, 0.04, steel(), 0, top, -dy * 0.39, 0.004);
  // Piezas por clasificar sobre la mesa.
  const colors = ["#c9302c", "#2f6fb0", "#f2b705", "#2f8a4c", "#e9ecef", "#3a3a3a"];
  for (let i = 0; i < 14; i++) {
    const c = colors[i % colors.length];
    const x = -dx * 0.38 + ((i * 0.27) % (dx * 0.76));
    const zz = -dy * 0.25 + ((i * 0.37) % (dy * 0.35));
    g.add(at(P.cylinder(0.11, 0.09, 0.14, M.plastic(c), 16), x, top, zz));
  }
  // Canecas por color al frente.
  for (let i = 0; i < 5; i++) {
    const x = -dx * 0.36 + i * dx * 0.18;
    slab(g, dx * 0.15, 0.55, 0.5, M.plastic(colors[i], 0.5), x, 0, dy * 0.3, 0.03);
  }
  return g;
};

/** Línea de lavado: tolva con tornillo, lavadora por fricción, tanque de flotación, centrífuga y ciclón de secado. */
const washingLine: Builder = ([dx, dy, h]) => {
  const g = P.group("washing_line");
  const x0 = -dx / 2;
  const blueM = M.paint("#2f5d8a", 0.4);
  // Tolva de carga con tornillo inclinado.
  g.add(at(postFrame(1.4, 1.4, h * 0.45, frame(), 0.07), x0 + 0.8, 0, 0));
  g.add(at(P.frustum(0.25, 0.75, h * 0.35, steel()), x0 + 0.8, h * 0.45, 0));
  const screw = P.cylinderX(0.18, 2.6, steel(), 20);
  screw.position.set(x0 + 2.2, h * 0.5, 0);
  screw.rotation.z = 0.35;
  g.add(screw);
  // Lavadora por fricción (rotor inclinado).
  const fr = P.cylinderX(0.32, 2.8, steel(), 28);
  fr.position.set(x0 + 4.4, h * 0.55, 0);
  fr.rotation.z = 0.28;
  g.add(fr);
  const m1 = P.motor(15, "#2f5d8a");
  m1.position.set(x0 + 5.7, h * 0.85, 0);
  g.add(m1);
  g.add(at(postFrame(2.4, 0.8, h * 0.45, frame(), 0.06), x0 + 4.4, 0, 0));
  // Tanque de flotación largo con paletas.
  slab(g, dx * 0.32, h * 0.38, dy * 0.7, blueM, x0 + dx * 0.56, 0, 0, 0.03);
  slab(g, dx * 0.31, 0.02, dy * 0.66, M.liquid("#6aa9c9"), x0 + dx * 0.56, h * 0.36, 0, 0.004);
  const shaft = P.cylinderX(0.05, dx * 0.3, dark(), 12);
  shaft.position.set(x0 + dx * 0.56, h * 0.48, 0);
  g.add(shaft);
  for (let i = 0; i < 6; i++) g.add(at(P.box(0.06, 0.5, dy * 0.5, M.paint("#3a3d42", 0.5), 0.004), x0 + dx * 0.43 + i * dx * 0.05, h * 0.48, 0));
  g.add(P.handrail([new THREE.Vector2(x0 + dx * 0.4, dy * 0.38), new THREE.Vector2(x0 + dx * 0.72, dy * 0.38)], 1.0));
  // Centrífuga de secado (vertical) y ciclón.
  g.add(at(P.cylinder(0.45, 0.45, h * 0.55, steel(), 32), x0 + dx * 0.8, 0.3, 0));
  g.add(at(P.dishedHead(0.45, steel(), false, 0.15), x0 + dx * 0.8, 0.3 + h * 0.55, 0));
  g.add(at(P.legs(4, 0.38, 0.3, 0.04, frame()), x0 + dx * 0.8, 0, 0));
  const m2 = P.motor(11, "#2f5d8a");
  m2.position.set(x0 + dx * 0.8, 0.3 + h * 0.55 + 0.35, 0);
  g.add(m2);
  g.add(at(P.cylinder(0.35, 0.35, h * 0.3, steel(), 28), x0 + dx * 0.94, h * 0.55, -dy * 0.15));
  g.add(at(P.frustum(0.08, 0.35, h * 0.3, steel()), x0 + dx * 0.94, h * 0.25, -dy * 0.15));
  g.add(at(P.legs(3, 0.3, h * 0.25, 0.03, frame()), x0 + dx * 0.94, 0, -dy * 0.15));
  g.add(P.pipe([v(x0 + dx * 0.8, 0.3 + h * 0.5, 0.4), v(x0 + dx * 0.87, h * 0.95, 0.4), v(x0 + dx * 0.94, h * 0.95, -dy * 0.15)], 0.07, steel()));
  // Tablero de la línea.
  const cab = P.cabinet(1.2, 1.9, 0.4, "#cfd3d6");
  cab.position.set(x0 + dx * 0.3, 0, dy * 0.38);
  g.add(cab);
  stack(g, x0 + dx * 0.3 + 0.5, 1.9, dy * 0.38);
  return g;
};

/** Estación de llenado de big bag: marco con polipasto, bolsa colgada de las orejas, tolva de llenado y estiba. */
const bigbagStation: Builder = ([dx, dy, h]) => {
  const g = P.group("bigbag_station");
  g.add(postFrame(dx * 0.95, dy * 0.95, h, yellow(), 0.1));
  slab(g, dx * 0.95, 0.14, 0.12, yellow(), 0, h * 0.7, 0, 0.004);
  // Tolva de llenado y válvula.
  g.add(at(P.frustum(0.15, 0.45, h * 0.18, steel()), 0, h * 0.72, 0));
  g.add(at(P.cylinder(0.15, 0.15, 0.25, dark(), 16), 0, h * 0.62, 0));
  g.add(P.pipe([v(0, h * 0.9, 0), v(0, h + 0.4, 0), v(dx * 0.7, h + 0.4, 0)], 0.06, steel()));
  // Estiba y bolsa.
  const pallet = P.palletLoad(0);
  pallet.position.y = 0;
  g.add(pallet);
  const bag = P.box(0.95, Math.min(1.3, h * 0.42), 0.95, M.paint("#eef0e8", 0.9), 0.12);
  bag.position.set(0, 0.16 + Math.min(1.3, h * 0.42) / 2, 0);
  g.add(bag);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(P.pipe([v(sx * 0.42, 0.16 + Math.min(1.3, h * 0.42), sz * 0.42), v(sx * 0.3, h * 0.62, sz * 0.3)], 0.025, M.paint("#2f5d8a", 0.6), 0.05));
  // Báscula bajo la estiba.
  slab(g, 1.3, 0.08, 1.3, dark(), 0, -0.02, 0, 0.01);
  slab(g, 0.3, 0.4, 0.12, M.paint("#cfd3d6", 0.45), dx * 0.45, 1.0, dy * 0.45, 0.02);
  lightPanel(g, dx * 0.45, 1.25, dy * 0.45 + 0.065, 0.2, 0.12);
  return g;
};

// ------------------------------------------------------------------ taller de moldes

/** Encerramiento de máquina herramienta: base, cabina con puertas de vidrio, techo y panel de control. */
function enclosure(g: THREE.Group, w: number, h: number, d: number, color = "#dfe3e6"): void {
  const body = M.paint(color, 0.4);
  slab(g, w, 0.35, d, M.paint("#3a3d42", 0.5), 0, 0, 0, 0.02);
  slab(g, w, h - 0.35, 0.06, body, 0, 0.35, -d / 2 + 0.03, 0.01);
  for (const sx of [-1, 1]) slab(g, 0.06, h - 0.35, d, body, (sx * (w - 0.06)) / 2, 0.35, 0, 0.01);
  slab(g, w, 0.1, d, body, 0, h - 0.1, 0, 0.01);
  // Frente: marcos y dos puertas correderas de vidrio.
  slab(g, w, 0.45, 0.06, body, 0, 0.35, d / 2 - 0.03, 0.01);
  slab(g, w, 0.3, 0.06, body, 0, h - 0.4, d / 2 - 0.03, 0.01);
  for (const sx of [-1, 1]) {
    slab(g, w * 0.44, h - 1.2, 0.04, body, sx * w * 0.22, 0.8, d / 2, 0.01);
    slab(g, w * 0.3, (h - 1.2) * 0.6, 0.02, M.glass("#2c4a5c", 0.8), sx * w * 0.22, 0.8 + (h - 1.2) * 0.25, d / 2 + 0.025, 0.004);
    g.add(at(P.box(0.04, 0.4, 0.05, dark(), 0.01), sx * w * 0.04, 0.8 + (h - 1.2) * 0.5, d / 2 + 0.05));
  }
  slab(g, w * 0.98, 0.05, 0.03, yellow(), 0, 0.75, d / 2 + 0.02, 0.003);
  slab(g, w * 1.002, 0.12, d * 1.002, accent(), 0, h - 0.5, 0, 0.004);
}

/** Centro de mecanizado CNC para cavidades y electrodos: cabina, husillo a la vista, panel, cambiador de herramientas y transportador de viruta. */
const cncMill: Builder = ([dx, dy, h]) => {
  const g = P.group("cnc_mill");
  const w = dx * 0.75;
  const d = dy * 0.8;
  enclosure(g, w, h * 0.92, d);
  // Mesa, pieza y husillo dentro de la cabina.
  slab(g, w * 0.6, 0.12, d * 0.45, dark(), 0, 0.95, 0, 0.01);
  slab(g, w * 0.25, 0.3, d * 0.25, M.toolSteel(), 0, 1.07, 0, 0.01);
  slab(g, w * 0.2, h * 0.5, d * 0.2, accent(), 0, h * 0.42, -d * 0.18, 0.02);
  g.add(at(P.cylinder(0.09, 0.09, 0.35, steel(), 20), 0, h * 0.42 - 0.3, -d * 0.05));
  g.add(at(P.cylinder(0.02, 0.02, 0.12, M.chrome(), 10), 0, h * 0.42 - 0.42, -d * 0.05));
  // Cambiador de herramientas (carrusel) al costado.
  g.add(at(P.cylinderX(0.45, 0.2, accent(), 32), -w / 2 - 0.1, h * 0.62, -d * 0.1));
  // Panel de control giratorio.
  slab(g, 0.5, 0.7, 0.12, M.paint("#3a3d42", 0.5), w / 2 + 0.2, h * 0.38, d / 2 - 0.1, 0.02);
  lightPanel(g, w / 2 + 0.2, h * 0.38 + 0.45, d / 2 - 0.035, 0.36, 0.24);
  // Transportador de viruta y tanque de refrigerante atrás.
  const conv = P.box(0.45, 0.12, 1.4, dark(), 0.01);
  conv.position.set(w * 0.3, 0.6, -d / 2 - 0.5);
  conv.rotation.x = -0.45;
  g.add(conv);
  slab(g, 0.5, 0.55, 0.5, M.paint("#2f7d6b", 0.4), w * 0.3, 0, -d / 2 - 1.0, 0.02);
  slab(g, w * 0.5, 0.45, 0.4, M.paint("#2f7d6b", 0.4), -w * 0.15, 0, -d / 2 - 0.25, 0.02);
  stack(g, w / 2 - 0.15, h * 0.92, -d / 2 + 0.15);
  return g;
};

/** Electroerosión por penetración: tanque de trabajo, columna con cabezal, generador y unidad de dieléctrico. */
const edm: Builder = ([dx, dy, h]) => {
  const g = P.group("edm");
  const w = dx * 0.55;
  const blueM = M.paint("#2f5d8a", 0.4);
  slab(g, w, 0.8, dy * 0.6, M.paint("#dfe3e6", 0.4), -dx * 0.15, 0, 0, 0.03);
  // Tanque de trabajo con dieléctrico y puerta abatible.
  slab(g, w * 0.9, 0.5, dy * 0.5, steel(), -dx * 0.15, 0.8, 0.05, 0.01);
  slab(g, w * 0.86, 0.02, dy * 0.46, M.liquid("#c9b26a"), -dx * 0.15, 1.2, 0.05, 0.004);
  // Columna y cabezal con el electrodo de cobre.
  slab(g, w * 0.35, h * 0.95, 0.4, blueM, -dx * 0.15, 0.8, -dy * 0.25, 0.02);
  slab(g, 0.3, 0.6, 0.6, blueM, -dx * 0.15, h * 0.62, -dy * 0.05, 0.02);
  g.add(at(P.cylinder(0.05, 0.05, 0.35, M.chrome(), 14), -dx * 0.15, h * 0.62 - 0.35, 0.1));
  slab(g, 0.12, 0.08, 0.12, M.paint("#b87333", 0.3), -dx * 0.15, h * 0.62 - 0.43, 0.1, 0.004);
  // Generador y unidad de dieléctrico con filtros.
  const gen = P.cabinet(dx * 0.25, h * 0.75, dy * 0.5, "#dfe3e6");
  gen.position.set(dx * 0.33, 0, -dy * 0.1);
  g.add(gen);
  lightPanel(g, dx * 0.33, h * 0.6, -dy * 0.1 + dy * 0.25 + 0.015, 0.34, 0.24);
  for (let i = 0; i < 2; i++) g.add(at(P.cylinder(0.12, 0.12, 0.6, M.paint("#e9ecef", 0.4), 20), -dx * 0.43 + i * 0.3, 0, dy * 0.32));
  return g;
};

/** Rectificadora plana: base, mesa con plato magnético, columna y cabezal con la muela y su guarda. */
const surfaceGrinder: Builder = ([dx, dy, h]) => {
  const g = P.group("surface_grinder");
  const body = M.paint("#7aa37a", 0.45);
  slab(g, dx * 0.6, 0.85, dy * 0.45, body, 0, 0, 0.1, 0.03);
  slab(g, dx * 0.75, 0.12, dy * 0.32, dark(), 0, 0.85, 0.1, 0.01);
  slab(g, dx * 0.5, 0.06, dy * 0.26, M.toolSteel(), 0, 0.97, 0.1, 0.005);
  for (const sx of [-1, 1]) slab(g, 0.04, 0.18, dy * 0.3, M.glass("#bfe0f0", 0.35), sx * dx * 0.36, 0.97, 0.1, 0.004);
  // Columna y cabezal.
  slab(g, dx * 0.25, h * 0.95, dy * 0.3, body, 0, 0, -dy * 0.32, 0.03);
  slab(g, dx * 0.2, 0.4, dy * 0.5, body, 0, h * 0.65, -dy * 0.12, 0.02);
  const wheel = P.cylinderZ(0.2, 0.06, M.paint("#bfb8a8", 0.9), 32);
  wheel.position.set(0, h * 0.65 - 0.1, dy * 0.08);
  g.add(wheel);
  const guard = P.cylinderZ(0.24, 0.1, M.paint("#7aa37a", 0.45), 32);
  guard.position.set(0, h * 0.65 + 0.02, dy * 0.08);
  guard.scale.set(1, 0.6, 1);
  g.add(guard);
  // Volantes y panel.
  g.add(at(P.cylinderZ(0.14, 0.04, M.chrome(), 24), dx * 0.18, 0.6, dy * 0.34));
  g.add(at(P.box(0.3, 0.4, 0.1, M.paint("#3a3d42", 0.5), 0.02), dx * 0.38, h * 0.55, dy * 0.0));
  lightPanel(g, dx * 0.38, h * 0.55 + 0.05, 0.055, 0.2, 0.14);
  return g;
};

/** Estantería pesada de moldes: marcos cada 3 m, vigas en tres niveles y moldes (placas de acero) en cada nivel. */
const moldRack: Builder = ([dx, dy, h]) => {
  const g = P.group("mold_rack");
  const bays = Math.max(1, Math.round(dx / 3));
  const bw = dx / bays;
  const levels = 3;
  const lh = (h - 0.2) / levels;
  const blueM = M.paint("#2f5d8a", 0.45);
  const orange = M.paint("#e0782e", 0.45);
  for (let b = 0; b <= bays; b++) {
    const x = -dx / 2 + b * bw;
    for (const sz of [-1, 1]) slab(g, 0.1, h, 0.1, blueM, x, 0, (sz * dy * 0.9) / 2, 0.004);
    for (let k = 1; k < 6; k++) g.add(at(P.box(0.04, 0.04, dy * 0.9, blueM, 0.002), x, (k * h) / 6, 0));
  }
  const tones = ["#6e7781", "#8a939c", "#5a636b", "#7b858f"];
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * lh;
    for (const sz of [-1, 1]) slab(g, dx, 0.14, 0.06, orange, 0, y, (sz * dy * 0.86) / 2, 0.004);
    slab(g, dx, 0.03, dy * 0.86, M.galvanized(), 0, y + 0.14, 0, 0.002);
    for (let b = 0; b < bays; b++) {
      // Dos moldes por vano y nivel, de tamaños distintos, con sus placas y argollas.
      for (let k = 0; k < 2; k++) {
        if ((b * 7 + l * 3 + k) % 5 === 4) continue;
        const mw = bw * (0.3 + ((b + l + k) % 3) * 0.05);
        const mh = Math.min(lh - 0.35, 0.55 + ((b + k * 2 + l) % 3) * 0.15);
        const md = dy * 0.6;
        const x = -dx / 2 + b * bw + bw * (k === 0 ? 0.28 : 0.72);
        const yy = y + 0.17;
        const tone = M.paint(tones[(b + l + k) % tones.length], 0.4);
        slab(g, mw, mh * 0.42, md, tone, x, yy, 0, 0.01);
        slab(g, mw, mh * 0.42, md, tone, x, yy + mh * 0.46, 0, 0.01);
        slab(g, mw * 1.05, mh * 0.08, md * 1.02, M.paint("#3a3d42", 0.5), x, yy + mh * 0.42, 0, 0.004);
        g.add(at(P.ring(0.06, 0.015, 0.03, yellow()), x, yy + mh * 0.88, 0));
        g.add(at(P.box(0.18, 0.08, 0.01, M.paint("#f2f2f2", 0.5), 0.002), x, yy + mh * 0.6, md / 2 + 0.01));
      }
    }
  }
  return g;
};

/** Carro de moldes para el cambio rápido: plataforma baja con ruedas, rodillos y un molde listo para montar. */
const moldStaging: Builder = ([dx, dy, h]) => {
  const g = P.group("mold_staging");
  const top = Math.max(0.6, h * 0.8);
  slab(g, dx * 0.85, 0.1, dy * 0.7, yellow(), 0, top - 0.1, 0, 0.01);
  slab(g, dx * 0.85, top - 0.25, dy * 0.6, frame(), 0, 0.15, 0, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(P.cylinderZ(0.1, 0.06, M.rubber(), 18), sx * dx * 0.36, 0.1, sz * dy * 0.3));
  for (let i = 0; i < 9; i++) g.add(at(P.cylinderZ(0.035, dy * 0.6, M.chrome(), 12), -dx * 0.38 + i * dx * 0.095, top + 0.035, 0));
  // Molde sobre el carro y empujador.
  const mw = dx * 0.4;
  slab(g, mw, 0.45, dy * 0.45, M.paint("#6e7781", 0.4), -dx * 0.1, top + 0.07, 0, 0.01);
  slab(g, mw, 0.45, dy * 0.45, M.paint("#8a939c", 0.4), -dx * 0.1, top + 0.55, 0, 0.01);
  slab(g, mw * 1.04, 0.05, dy * 0.47, M.paint("#3a3d42", 0.5), -dx * 0.1, top + 0.52, 0, 0.004);
  g.add(P.pipe([v(-dx * 0.25, top + 1.0, 0), v(-dx * 0.1, top + 1.3, 0), v(dx * 0.05, top + 1.0, 0)], 0.025, yellow(), 0.05));
  g.add(P.pipe([v(dx * 0.42, top, -dy * 0.3), v(dx * 0.42, top + 0.9, -dy * 0.3), v(dx * 0.42, top + 0.9, dy * 0.3), v(dx * 0.42, top, dy * 0.3)], 0.025, frame(), 0.08));
  return g;
};

// ------------------------------------------------------------------ laboratorio

/** Máquina de medición por coordenadas: mesa de granito, pórtico móvil, columna Z con palpador y puesto de PC. */
const cmm: Builder = ([dx, dy, h]) => {
  const g = P.group("cmm");
  const granite = M.paint("#3a3d42", 0.75);
  const s = Math.min(dx, dy);
  slab(g, s * 0.7, 0.7, s * 0.7, M.paint("#59626c", 0.5), -s * 0.07, 0, 0, 0.02);
  slab(g, s * 0.76, 0.22, s * 0.75, granite, -s * 0.07, 0.7, 0, 0.02);
  const al = M.aluminum();
  const gy = 0.92;
  for (const sx of [-1, 1]) slab(g, 0.1, h * 0.6, 0.18, al, -s * 0.05 + (sx * s * 0.35), gy, -s * 0.05, 0.01);
  slab(g, s * 0.8, 0.16, 0.22, al, -s * 0.05, gy + h * 0.6, -s * 0.05, 0.01);
  slab(g, 0.2, 0.25, 0.25, al, s * 0.05, gy + h * 0.6 - 0.05, -s * 0.05, 0.01);
  g.add(at(P.box(0.08, h * 0.5, 0.08, M.chrome(), 0.004), s * 0.05, gy + h * 0.32, -s * 0.05));
  g.add(at(P.cylinder(0.02, 0.02, 0.08, dark(), 10), s * 0.05, gy + h * 0.07 - 0.02, -s * 0.05));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), M.paint("#c9302c", 0.3)), s * 0.05, gy + h * 0.06 - 0.03, -s * 0.05));
  // Pieza medida sobre la mesa.
  g.add(at(P.cylinder(0.14, 0.11, 0.2, M.plastic("#2f6fb0"), 24), -s * 0.15, gy, s * 0.12));
  // Puesto de PC al costado.
  slab(g, 0.32, 0.75, 0.5, M.paint("#cfd3d6", 0.5), s * 0.45, 0, s * 0.25, 0.01);
  const screen = P.box(0.03, 0.26, 0.4, M.emissive("#3fd0ff", 0.5), 0.004);
  screen.position.set(s * 0.45 + 0.08, 0.92, s * 0.25);
  g.add(screen);
  return g;
};

/** Banco de pruebas de caída: torre de cuatro postes, mecanismo de liberación, placa de impacto y guarda transparente. */
const testRig: Builder = ([dx, dy, h]) => {
  const g = P.group("test_rig");
  const s = Math.min(dx, dy) * 0.8;
  slab(g, s, 0.1, s, M.toolSteel(), 0, 0, 0, 0.01);
  g.add(postFrame(s, s, h - 0.1, M.paint("#59626c", 0.5), 0.07, 0.1));
  for (const sz of [-1, 1]) slab(g, 0.04, h * 0.95, 0.04, M.chrome(), 0, 0.1, sz * s * 0.25, 0.004);
  // Carro con pinzas sosteniendo un balde.
  slab(g, s * 0.5, 0.12, s * 0.6, yellow(), 0, h * 0.62, 0, 0.01);
  g.add(at(P.cylinder(0.04, 0.04, h * 0.3, M.chrome(), 12), 0, h * 0.62 + 0.12, 0));
  slab(g, 0.4, 0.2, 0.3, accent(), 0, h - 0.15, 0, 0.02);
  g.add(at(P.cylinder(0.16, 0.13, 0.32, M.plastic("#c9302c"), 24), 0, h * 0.62 - 0.36, 0));
  // Guardas de policarbonato en tres caras.
  for (const sx of [-1, 1]) slab(g, 0.02, h * 0.6, s * 0.9, M.glass("#d8eef8", 0.25), (sx * s) / 2, 0.15, 0, 0.003);
  slab(g, s * 0.9, h * 0.6, 0.02, M.glass("#d8eef8", 0.25), 0, 0.15, -s / 2, 0.003);
  slab(g, 0.3, 0.45, 0.12, M.paint("#cfd3d6", 0.45), s * 0.6, 0.9, s * 0.4, 0.02);
  lightPanel(g, s * 0.6, 1.2, s * 0.4 + 0.065, 0.2, 0.14);
  return g;
};

// ------------------------------------------------------------------ servicios

/** Secador de aire refrigerado: gabinete con rejillas, pantalla, filtros coalescentes y tubería de entrada y salida. */
const airDryer: Builder = ([dx, dy, h]) => {
  const g = P.group("air_dryer");
  const w = dx * 0.6;
  const d = dy * 0.75;
  slab(g, w, h * 0.85, d, M.paint("#2f7d6b", 0.4), -dx * 0.12, 0, 0, 0.03);
  for (let i = 0; i < 8; i++) slab(g, w * 0.8, 0.03, 0.02, M.paint("#24584b", 0.5), -dx * 0.12, 0.2 + i * 0.08, d / 2, 0.003);
  lightPanel(g, -dx * 0.12, h * 0.7, d / 2 + 0.01, 0.22, 0.14);
  // Filtros a la salida.
  for (let i = 0; i < 2; i++) {
    const z = -d * 0.25 + i * d * 0.5;
    g.add(at(P.cylinder(0.07, 0.07, 0.45, M.paint("#cfd3d6", 0.4), 18), dx * 0.32, h * 0.35, z));
    g.add(at(P.box(0.16, 0.12, 0.16, accent(), 0.02), dx * 0.32, h * 0.35 + 0.5, z));
  }
  g.add(P.pipe([v(-dx * 0.45, h * 0.95, -d * 0.25), v(-dx * 0.12, h * 0.95, -d * 0.25), v(dx * 0.32, h * 0.95, -d * 0.25), v(dx * 0.32, h * 0.35 + 0.56, -d * 0.25)], 0.035, steel()));
  g.add(P.pipe([v(dx * 0.32, h * 0.35 + 0.56, d * 0.25), v(dx * 0.32, h * 0.95, d * 0.25), v(dx * 0.48, h * 0.95, d * 0.25)], 0.035, steel()));
  return g;
};

/** Torre de enfriamiento de tiro inducido: cuerpo con paneles, persianas de entrada, piscina, ventilador en chimenea, baranda y escalera. */
const coolingTower: Builder = ([dx, dy, h]) => {
  const g = P.group("cooling_tower");
  const body = M.paint("#d9dee2", 0.45);
  const w = dx * 0.9;
  const d = dy * 0.9;
  const basinH = 0.5;
  const louverH = h * 0.25;
  const deckY = h * 0.78;
  slab(g, w + 0.1, basinH, d + 0.1, M.paint("#9aa3ab", 0.6), 0, 0, 0, 0.02);
  // Persianas de entrada de aire en los cuatro costados.
  const louver = M.paint("#7d868f", 0.5);
  for (let i = 0; i < 6; i++) {
    const y = basinH + 0.1 + (i * louverH) / 6;
    for (const sz of [-1, 1]) {
      const l = P.box(w * 0.96, 0.03, 0.18, louver, 0.003);
      l.position.set(0, y, (sz * d) / 2);
      l.rotation.x = sz * 0.6;
      g.add(l);
    }
    for (const sx of [-1, 1]) {
      const l = P.box(0.18, 0.03, d * 0.96, louver, 0.003);
      l.position.set((sx * w) / 2, y, 0);
      l.rotation.z = -sx * 0.6;
      g.add(l);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slab(g, 0.1, deckY - basinH, 0.1, body, (sx * (w - 0.1)) / 2, basinH, (sz * (d - 0.1)) / 2, 0.004);
  // Cuerpo con paneles corrugados.
  const y0 = basinH + louverH + 0.1;
  slab(g, w, deckY - y0, d, body, 0, y0, 0, 0.02);
  for (let i = 1; i < 10; i++) {
    for (const sz of [-1, 1]) slab(g, 0.04, deckY - y0, 0.04, M.paint("#c4cad0", 0.45), -w / 2 + (i * w) / 10, y0, (sz * d) / 2, 0.003);
    for (const sx of [-1, 1]) slab(g, 0.04, deckY - y0, 0.04, M.paint("#c4cad0", 0.45), (sx * w) / 2, y0, -d / 2 + (i * d) / 10, 0.003);
  }
  slab(g, w + 0.06, 0.06, d + 0.06, frame(), 0, deckY, 0, 0.004);
  // Chimenea del ventilador con las aspas.
  const fr = Math.min(w, d) * 0.38;
  const stackH = h - deckY - 0.1;
  g.add(at(P.ring(fr, 0.05, stackH, M.paint("#2f5d8a", 0.4)), 0, deckY + 0.06, 0));
  const fan = P.group("fan");
  for (let k = 0; k < 6; k++) {
    const arm = P.group();
    const blade = P.box(fr * 0.85, 0.02, 0.2, M.paint("#2b3036", 0.5), 0.004);
    blade.position.x = fr * 0.45;
    blade.rotation.x = 0.25;
    arm.add(blade);
    arm.rotation.y = (k / 6) * Math.PI * 2;
    fan.add(arm);
  }
  fan.add(P.cylinder(0.15, 0.15, 0.25, dark(), 16));
  fan.position.y = deckY + stackH * 0.55;
  g.add(fan);
  g.add(at(P.box(fr * 2, 0.06, 0.08, frame(), 0.004), 0, deckY + stackH * 0.5, 0));
  // Baranda del techo y escalera.
  const e = 0.05;
  g.add(at(P.handrail([new THREE.Vector2(-w / 2 + e, -d / 2 + e), new THREE.Vector2(w / 2 - e, -d / 2 + e), new THREE.Vector2(w / 2 - e, d / 2 - e), new THREE.Vector2(-w / 2 + e, d / 2 - e), new THREE.Vector2(-w / 2 + e, -d / 2 + e)], 1.0), 0, deckY + 0.06, 0));
  const lad = P.ladder(deckY, 0.45, true);
  lad.position.set(w * 0.3, 0, d / 2 + 0.1);
  g.add(lad);
  // Tuberías de agua caliente (arriba) y fría (piscina).
  g.add(P.pipe([v(-w / 2 - 0.4, 0.3, -d * 0.2), v(-w / 2 - 0.4, deckY - 0.3, -d * 0.2), v(-w / 2, deckY - 0.3, -d * 0.2)], 0.09, M.paint("#c0392b", 0.4)));
  g.add(P.pipe([v(-w / 2, 0.3, d * 0.2), v(-w / 2 - 0.6, 0.3, d * 0.2)], 0.1, M.paint("#2f5d8a", 0.4)));
  return g;
};

export const plasticPlantBuilders: Record<string, Builder> = {
  silo,
  gravimetric_blender: gravimetricBlender,
  vacuum_conveying_station: vacuumStation,
  material_selection_station: selectionStation,
  sorting_table: sortingTable,
  washing_line: washingLine,
  bigbag_station: bigbagStation,
  cnc_mill: cncMill,
  edm,
  surface_grinder: surfaceGrinder,
  mold_rack: moldRack,
  mold_staging: moldStaging,
  cmm,
  test_rig: testRig,
  air_dryer: airDryer,
  cooling_tower: coolingTower,
};
