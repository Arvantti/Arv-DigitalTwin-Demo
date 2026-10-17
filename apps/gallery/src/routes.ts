/**
 * Pasillos y rutas de la planta (secciones `aisles` y `routes` del plant.yaml): franjas en el piso y, sobre cada ruta,
 * un montacargas o un operario que la recorre de ida y vuelta (el montacargas va cargado de ida y vacío de vuelta).
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
  kind: "forklift" | "pedestrian";
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
const PAUSE_S = 3;

interface Agent {
  points: THREE.Vector3[];
  cumulative: number[];
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

function locate(agent: Agent, s: number): { pos: THREE.Vector3; dir: THREE.Vector3 } {
  const c = agent.cumulative;
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const a = agent.points[i - 1];
  const b = agent.points[i];
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
  };
  const agents: Agent[] = [];
  routes.forEach((r, idx) => {
    const points = r.path.map(([x, y]) => toScene(x, y));
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
    const width = r.kind === "forklift" ? 0.35 : 0.22;
    for (let i = 1; i < points.length; i++) group.add(strip(points[i - 1], points[i], width, lineMats[r.kind], 0.03));

    const length = cumulative[cumulative.length - 1];
    let agent: Agent;
    if (r.kind === "forklift") {
      const fk = parts.forklift(idx % 2 ? "#f2b705" : "#e8731a");
      agent = {
        points, cumulative, length, speed: FORKLIFT_SPEED, offset: idx * 11, object: fk.object, heading: 0,
        step: (forward) => fk.setLoaded(forward),
      };
    } else {
      const op = parts.operator(idx % 2 ? "#f2b705" : "#f26b1d", idx % 2 ? "#4a6b3a" : "#2f5f8f");
      let phase = 0;
      agent = {
        points, cumulative, length, speed: WALK_SPEED, offset: idx * 13, object: op.object, heading: 0,
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
      const { pos, dir } = locate(a, s);
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
