/**
 * Pasillos y rutas de la planta (secciones `aisles` y `routes` del plant.yaml): franjas en el piso y, sobre cada ruta,
 * un montacargas, un carro de canastillas o un operario que la recorre de ida y vuelta (montacargas y carro van cargados de ida y vacíos de vuelta).
 * Es un recorrido ilustrativo: el motor de planta no simula todavía el transporte.
 */
import * as THREE from "three";
import { parts } from "@twin/3d";

export interface Aisle {
  id: string;
  kind: string;
  rect: [number, number, number, number];
}
export interface Route {
  id: string;
  name: string;
  kind: "forklift" | "pedestrian" | "cart";
  from: string;
  to: string;
  path: [number, number][];
  width: number;
  load?: string;
  trips_per_h?: number;
  walkers?: number;
}
type ToScene = (x: number, y: number, z?: number) => THREE.Vector3;

const FORKLIFT_SPEED = 2.0; // m/s
const WALK_SPEED = 1.2; // m/s
const CART_SPEED = 1.0; // m/s
const PAUSE_S = 3;

/** Un carril: polilínea con su longitud acumulada. */
interface Lane {
  points: THREE.Vector3[];
  cumulative: number[];
  length: number;
}

interface Agent {
  /** Carril de ida (cargado) y de regreso: montacargas y carros circulan por la derecha, cada sentido por su carril. */
  out: Lane;
  back: Lane;
  length: number;
  speed: number;
  offset: number;
  object: THREE.Object3D;
  heading: number;
  step: (forward: boolean, moving: boolean, dt: number) => void;
}

function strip(a: THREE.Vector3, b: THREE.Vector3, width: number, mat: THREE.Material, y: number): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len + width, width), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.atan2(-(b.z - a.z), b.x - a.x);
  m.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  m.renderOrder = 2;
  return m;
}

/** Distancia de cada carril al eje de la ruta (m); a la derecha del sentido de marcha. */
const LANE_OFFSET = { forklift: 0.8, cart: 0.5 } as const;

function makeLane(points: THREE.Vector3[]): Lane {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
}

/**
 * Desplaza una polilínea `d` metros a la derecha de su sentido (visto desde arriba, x este y z sur), con esquinas en inglete.
 * Para el carril de regreso se desplaza la polilínea invertida y se vuelve a invertir, así queda del lado opuesto del eje.
 */
function offsetPath(points: THREE.Vector3[], d: number): THREE.Vector3[] {
  const normals: THREE.Vector3[] = [];
  for (let i = 1; i < points.length; i++) {
    const dir = new THREE.Vector3().subVectors(points[i], points[i - 1]).setY(0).normalize();
    normals.push(new THREE.Vector3(-dir.z, 0, dir.x));
  }
  return points.map((p, i) => {
    const before = normals[Math.max(0, i - 1)];
    const after = normals[Math.min(normals.length - 1, i)];
    const miter = before.clone().add(after);
    const len2 = miter.lengthSq();
    // inglete: el desplazamiento crece en la esquina para mantener `d` entre tramos (acotado en curvas cerradas)
    const k = len2 < 1e-6 ? 0 : Math.min(2, (2 * d) / len2);
    return p.clone().addScaledVector(miter, k);
  });
}

function locate(lane: Lane, fraction: number): { pos: THREE.Vector3; dir: THREE.Vector3 } {
  const c = lane.cumulative;
  const s = Math.min(1, Math.max(0, fraction)) * lane.length;
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const a = lane.points[i - 1];
  const b = lane.points[i];
  const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  return { pos: new THREE.Vector3().lerpVectors(a, b, Math.min(1, Math.max(0, t))), dir: new THREE.Vector3().subVectors(b, a).normalize() };
}

export function buildRoutes(aisles: Aisle[], routes: Route[], parent: THREE.Object3D, toScene: ToScene): (time: number, dt: number) => void {
  const group = new THREE.Group();
  group.name = "routes";
  parent.add(group);

  const aisleMat = new THREE.MeshBasicMaterial({ color: "#f2b705", transparent: true, opacity: 0.16, depthWrite: false });
  for (const a of aisles) {
    if (a.kind !== "forklift") continue;
    const [x0, y0, w, l] = a.rect;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, l), aisleMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.copy(toScene(x0 + w / 2, y0 + l / 2)).setY(0.024);
    plane.renderOrder = 1;
    group.add(plane);
  }

  const lineMats = {
    forklift: new THREE.MeshBasicMaterial({ color: "#ff7a1a", transparent: true, opacity: 0.55, depthWrite: false }),
    pedestrian: new THREE.MeshBasicMaterial({ color: "#2ecc71", transparent: true, opacity: 0.6, depthWrite: false }),
    cart: new THREE.MeshBasicMaterial({ color: "#3fa7ff", transparent: true, opacity: 0.5, depthWrite: false }),
  };
  const agents: Agent[] = [];
  routes.forEach((r, idx) => {
    const points = r.path.map(([x, y]) => toScene(x, y));
    const width = r.kind === "forklift" ? 0.35 : r.kind === "cart" ? 0.28 : 0.22;
    // montacargas y carros: dos carriles (ida y regreso); los operarios caminan por el eje
    const laneOffset = r.kind === "pedestrian" ? 0 : LANE_OFFSET[r.kind];
    const out = makeLane(laneOffset ? offsetPath(points, laneOffset) : points);
    const back = makeLane(laneOffset ? offsetPath([...points].reverse(), laneOffset).reverse() : points);
    for (const lane of laneOffset ? [out, back] : [out]) {
      for (let i = 1; i < lane.points.length; i++) group.add(strip(lane.points[i - 1], lane.points[i], width, lineMats[r.kind], 0.03));
    }
    const length = makeLane(points).length;
    let agent: Agent;
    if (r.kind === "forklift") {
      const fk = parts.forklift(idx % 2 ? "#f2b705" : "#e8731a");
      agent = {
        out, back, length, speed: FORKLIFT_SPEED, offset: idx * 11, object: fk.object, heading: 0,
        step: (forward) => fk.setLoaded(forward),
      };
    } else if (r.kind === "cart") {
      const ct = parts.cart(idx % 2 ? "#2f6fb0" : "#3b8f6a");
      agent = {
        out, back, length, speed: CART_SPEED, offset: idx * 7, object: ct.object, heading: 0,
        step: (forward) => ct.setLoaded(forward),
      };
    } else {
      const looks: parts.OperatorLook[] = [
        { skin: "#c99a76", hair: "#2a1d16" },
        { skin: "#8d5a3b", hair: "#15100d" },
        { skin: "#e3b896", hair: "#6b4a2b" },
        { skin: "#a8745a", hair: "#1c1410" },
      ];
      const op = parts.operator(idx % 2 ? "#f2b705" : "#f26b1d", idx % 2 ? "#4a6b3a" : "#2f5f8f", looks[idx % looks.length]);
      let phase = 0;
      agent = {
        out, back, length, speed: WALK_SPEED, offset: idx * 13, object: op.object, heading: 0,
        step: (_f, moving, dt) => {
          if (moving) {
            phase += dt * WALK_SPEED * 5;
            op.setWalk(phase);
          } else op.setWalk(0);
        },
      };
    }
    agent.object.name = `agent-${r.id}`;
    group.add(agent.object);
    agents.push(agent);
  });

  return (time, dt) => {
    for (const a of agents) {
      const run = a.length / a.speed;
      const cycle = 2 * (run + PAUSE_S);
      const t = (time + a.offset) % cycle;
      let s: number;
      let forward: boolean;
      let moving = true;
      if (t < run) {
        s = t * a.speed;
        forward = true;
      } else if (t < run + PAUSE_S) {
        s = a.length;
        forward = true;
        moving = false;
      } else if (t < 2 * run + PAUSE_S) {
        s = a.length - (t - run - PAUSE_S) * a.speed;
        forward = false;
      } else {
        s = 0;
        forward = false;
        moving = false;
      }
      const { pos, dir } = locate(forward ? a.out : a.back, s / a.length);
      if (!forward) dir.negate();
      a.object.position.copy(pos);
      const target = Math.atan2(dir.x, dir.z);
      let diff = target - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * Math.min(1, dt * 6);
      a.object.rotation.y = a.heading;
      a.step(forward, moving, dt);
    }
  };
}
