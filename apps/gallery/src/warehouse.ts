/**
 * Bodega de producto terminado y despacho en la escena de planta: estanterías con tarimas, paso directo desde
 * empaque, muelle de carga y camión.
 *
 * Son piezas de la escena, no equipos de la librería: no tienen comportamiento propio ni publican canales. Se
 * dimensionan con la huella del plant.yaml (`footprint`: x = ancho, y = largo, z = alto) y no calculan nada.
 * Origen en el centro de la huella, en el piso; x del plano = x local, y del plano = −z local.
 */
import * as THREE from "three";

const steel = (color: string, metalness = 0.5, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Ruido determinista en [0, 1) para llenar las estanterías igual en cada carga. */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const BAY_M = 2.7;
const LEVELS = 4;
const FILL = 0.85;
const CARTONS = ["#b08a5a", "#a67c4e", "#bf9965", "#9c7447"];
/** Semielaborado: piezas inyectadas en cajas plásticas azules (el producto terminado va en cajas de cartón). */
const BINS = ["#2f6fb0", "#3a7bbf", "#285f99", "#3f86c9"];

/**
 * Estantería de estibas: marcos y largueros (azul y naranja), 4 niveles, 2 tarimas por vano y por fila de fondo.
 * Con ancho ≥ 2,2 m es de doble fondo; el largo es el lado mayor de la huella. Las tarimas son instancias: el 85 % de las posiciones está ocupado.
 */
export function palletRack(footprint: [number, number, number], stage?: string): THREE.Object3D {
  const [fx, fy, dz] = footprint;
  // el largo es el lado mayor de la huella; si va a lo largo de x se gira el conjunto
  const alongX = fx > fy;
  const dx = alongX ? fy : fx;
  const dy = alongX ? fx : fy;
  const g = new THREE.Group();
  const upright = steel("#1f5fa8", 0.4, 0.5);
  const beam = steel("#ee7d1a", 0.4, 0.5);
  const bays = Math.max(1, Math.round(dy / BAY_M));
  const bay = dy / bays;
  const depths = dx >= 2.2 ? 2 : 1;
  const depth = dx / depths;
  const beamY = Array.from({ length: LEVELS }, (_, i) => 0.15 + ((dz - 1.9) / (LEVELS - 1)) * i);

  // marcos: dos postes por cara de cada fila de fondo
  for (let b = 0; b <= bays; b++) {
    const z = -dy / 2 + b * bay;
    for (const x of [-dx / 2 + 0.04, dx / 2 - 0.04, ...(depths === 2 ? [0] : [])]) g.add(box(0.08, dz, 0.1, upright, x, dz / 2, z));
  }
  // largueros por vano, nivel y fila de fondo
  for (let d = 0; d < depths; d++) {
    const cx = -dx / 2 + depth * (d + 0.5);
    for (let b = 0; b < bays; b++) {
      const z = -dy / 2 + (b + 0.5) * bay;
      for (const y of beamY) {
        for (const sx of [-1, 1]) g.add(box(0.06, 0.12, bay - 0.1, beam, cx + (sx * (depth - 0.1)) / 2, y + 0.06, z));
      }
    }
  }
  // tarimas: base de madera y bulto de cajas
  const slots: { x: number; y: number; z: number; seed: number }[] = [];
  for (let d = 0; d < depths; d++) {
    const cx = -dx / 2 + depth * (d + 0.5);
    for (let b = 0; b < bays; b++) {
      for (let p = 0; p < 2; p++) {
        const z = -dy / 2 + b * bay + bay * (0.28 + 0.44 * p) + 0.05;
        for (let l = 0; l < LEVELS; l++) {
          const seed = d * 1000 + b * 20 + p * 5 + l + dy;
          if (hash(seed) < FILL) slots.push({ x: cx, y: beamY[l] + 0.12, z, seed });
        }
      }
    }
  }
  const palletW = Math.min(1.1, depth - 0.1);
  const palletD = bay * 0.42 - 0.08;
  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(palletW, 0.14, palletD), steel("#8a6a43", 0.05, 0.9), slots.length);
  const load = new THREE.InstancedMesh(new THREE.BoxGeometry(palletW - 0.06, 1.25, palletD - 0.04), steel("#ffffff", 0.05, 0.85), slots.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  slots.forEach((s, i) => {
    m.makeTranslation(s.x, s.y + 0.07, s.z);
    base.setMatrixAt(i, m);
    const h = 0.85 + hash(s.seed + 0.5) * 0.15;
    m.makeScale(1, h, 1).setPosition(s.x, s.y + 0.14 + (1.25 * h) / 2, s.z);
    load.setMatrixAt(i, m);
    const palette = stage === "semielaborado" ? BINS : CARTONS;
    load.setColorAt(i, c.set(palette[Math.floor(hash(s.seed + 0.9) * palette.length)]));
  });
  for (const im of [base, load]) {
    im.castShadow = im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  if (!alongX) return g;
  const rotated = new THREE.Group();
  g.rotation.y = Math.PI / 2;
  rotated.add(g);
  return rotated;
}

/** Paso directo de la pared entre empaque y bodega: marco amarillo con cortina enrollada. Abre hacia x. */
export function passThroughDoor([dx, dy, dz]: [number, number, number]): THREE.Object3D {
  const g = new THREE.Group();
  const yellow = steel("#e0b420", 0.3, 0.5);
  const dark = steel("#2b3138", 0.6, 0.45);
  for (const s of [-1, 1]) g.add(box(dx, dz, 0.25, yellow, 0, dz / 2, (s * (dy - 0.25)) / 2));
  g.add(box(dx, 0.4, dy, yellow, 0, dz - 0.2, 0));
  g.add(box(dx * 0.6, 0.3, dy - 0.5, dark, 0, dz - 0.55, 0)); // cortina enrollada
  for (let i = 0; i < 6; i++) g.add(box(dx + 0.02, 0.22, 0.3, dark, 0, 0.3 + i * 0.45, ((i % 2 ? 1 : -1) * (dy - 0.25)) / 2)); // franjas de seguridad
  return g;
}

/**
 * Muelle de despacho: puerta enrollable, nivelador de muelle (placa de acero con faldones amarillos), topes de
 * caucho en el borde y semáforo de muelle. El borde del camión queda en +x.
 */
export function dockLeveler([dx, dy, dz]: [number, number, number]): THREE.Object3D {
  const g = new THREE.Group();
  const concrete = steel("#9aa0a6", 0.05, 0.9);
  const plate = steel("#7a838c", 0.7, 0.4);
  const yellow = steel("#e0b420", 0.3, 0.5);
  const rubber = steel("#15181b", 0.1, 0.9);
  g.add(box(dx * 0.35, dz - 0.05, dy, concrete, -dx * 0.325, (dz - 0.05) / 2, 0)); // andén de concreto
  const ramp = box(dx * 0.65, 0.08, dy - 1.2, plate, dx * 0.175, dz - 0.04, 0);
  ramp.rotation.z = -0.03;
  g.add(ramp);
  for (const s of [-1, 1]) g.add(box(dx * 0.65, 0.1, 0.1, yellow, dx * 0.175, dz, (s * (dy - 1.2)) / 2));
  for (const s of [-1, 1]) g.add(box(0.3, 0.3, 0.12, rubber, dx / 2 - 0.15, dz - 0.15, (s * (dy - 0.6)) / 2));
  // semáforo de muelle
  const post = box(0.06, 1.1, 0.06, steel("#2b3138", 0.6, 0.4), -dx / 2 + 0.1, dz + 0.55, dy / 2 + 0.2);
  g.add(post);
  const red = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#e23b2e", emissiveIntensity: 1.6 });
  const green = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#2ee06a", emissiveIntensity: 1.6 });
  for (const [mat, y] of [[red, 1.05], [green, 0.9]] as [THREE.Material, number][]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat);
    l.position.set(-dx / 2 + 0.1, dz + y, dy / 2 + 0.2);
    g.add(l);
  }
  return g;
}

/**
 * Camión sencillo de caja seca (≈ 8,4 m). La cabina mira a +x y la caja se carga por atrás (−x), junto al muelle.
 * `loading` abre las puertas traseras y muestra las tarimas cargadas; en espera la caja va cerrada.
 */
export function deliveryTruck([dx, dy, dz]: [number, number, number], state: string | undefined): THREE.Object3D {
  const g = new THREE.Group();
  const cab = steel("#3c6a96", 0.35, 0.45);
  const body = steel("#b9c1c8", 0.05, 0.85);
  const dark = steel("#20252b", 0.6, 0.45);
  const glass = steel("#10202c", 0.9, 0.15);
  const cabLen = 2.0;
  const boxLen = dx - cabLen - 0.1;
  const bed = 1.2; // altura del piso de la caja: igual a la del muelle
  const boxH = dz - bed;
  const x0 = -dx / 2;
  g.add(box(dx - 0.1, 0.3, dy - 0.5, dark, 0, 0.85, 0)); // chasis
  // caja: piso, techo, laterales y frente; el fondo (puertas) queda abierto o cerrado según el estado
  const bx = x0 + boxLen / 2;
  g.add(box(boxLen, 0.08, dy, steel("#7a6a55", 0.05, 0.9), bx, bed, 0));
  g.add(box(boxLen, 0.08, dy, body, bx, dz - 0.04, 0));
  for (const s of [-1, 1]) g.add(box(boxLen, boxH, 0.06, body, bx, bed + boxH / 2, (s * (dy - 0.06)) / 2));
  g.add(box(0.06, boxH, dy, body, x0 + boxLen - 0.03, bed + boxH / 2, 0));
  const loading = state === "loading";
  if (loading) {
    for (const s of [-1, 1]) {
      const door = box(0.05, boxH, dy / 2 - 0.02, body, 0, 0, 0);
      const pivot = new THREE.Group();
      pivot.position.set(x0, bed + boxH / 2, (s * dy) / 2);
      pivot.rotation.y = s * 1.75;
      door.position.set(0, 0, (-s * (dy / 2 - 0.02)) / 2);
      pivot.add(door);
      g.add(pivot);
    }
    // tarimas ya cargadas al fondo de la caja
    const wood = steel("#8a6a43", 0.05, 0.9);
    const carton = steel("#b08a5a", 0.05, 0.85);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const px = x0 + 0.8 + i * 1.15;
        g.add(box(1.0, 0.14, 1.1, wood, px, bed + 0.11, s * 0.6));
        g.add(box(0.96, 1.2, 1.04, carton, px, bed + 0.78, s * 0.6));
      }
    }
  } else {
    g.add(box(0.06, boxH, dy, body, x0 + 0.03, bed + boxH / 2, 0));
    g.add(box(0.07, boxH - 0.2, 0.04, dark, x0, bed + boxH / 2, 0)); // junta de las puertas
  }
  // cabina
  const cx = dx / 2 - cabLen / 2;
  const cabH = 2.4;
  g.add(box(cabLen, cabH - bed + 0.35, dy - 0.1, cab, cx, (cabH + bed - 0.35) / 2, 0));
  g.add(box(0.04, 0.8, dy - 0.5, glass, dx / 2 + 0.01, bed + 0.95, 0)); // parabrisas
  for (const s of [-1, 1]) g.add(box(0.9, 0.7, 0.04, glass, cx + 0.2, bed + 0.95, (s * (dy - 0.1)) / 2));
  g.add(box(0.2, 0.4, dy - 0.2, dark, dx / 2 - 0.05, 0.55, 0)); // defensa delantera
  // ruedas
  const tyre = steel("#15181b", 0.1, 0.9);
  for (const wx of [x0 + boxLen - 1.2, x0 + boxLen - 2.4, dx / 2 - 0.9]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20), tyre);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.5, (s * (dy - 0.3)) / 2);
      w.castShadow = true;
      g.add(w);
    }
  }
  return g;
}
