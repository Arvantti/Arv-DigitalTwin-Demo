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
  /** Flota de montacargas del motor que recorre esta ruta y los índices de ruta de la flota que la usan (`forklift-fleet`). */
  fleet?: string;
  fleet_route?: number | number[];
}

/** Lo que la escena le pide a una flota del motor: sus canales (`v*_route`, `v*_pos`…) y dónde estaciona. */
export interface FleetSource {
  channels: (id: string) => Record<string, number> | undefined;
  bay: (id: string) => { center: THREE.Vector3; vehicles: number } | undefined;
}
type ToScene = (x: number, y: number, z?: number) => THREE.Vector3;

const FORKLIFT_SPEED = 2.0; // m/s
const WALK_SPEED = 1.2; // m/s
const CART_SPEED = 1.0; // m/s
const PAUSE_S = 3;
/** Un montacargas de la escena que no es de la flota espera si otro vehículo está a menos de esta distancia (m). */
const YIELD_M = 7;

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
  /** Reloj propio: se detiene mientras el agente cede el paso. */
  clock: number;
  yields: boolean;
}

/** Montacargas que mueve el motor: su posición sale de los canales de la flota, no de un reloj. */
interface FleetVehicle {
  fleet: string;
  index: number;
  object: THREE.Object3D;
  setLoaded: (v: boolean) => void;
  heading: number;
  onRoute: boolean;
}
interface FleetLane {
  out: Lane;
  back: Lane;
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

export function buildRoutes(aisles: Aisle[], routes: Route[], parent: THREE.Object3D, toScene: ToScene, fleets?: FleetSource): (time: number, dt: number) => void {
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
  const fleetLanes = new Map<string, Map<number, FleetLane>>();
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
    if (r.kind === "forklift" && r.fleet && fleets?.bay(r.fleet)) {
      // el motor mueve el montacargas de esta ruta: aquí solo se guardan sus carriles
      const lanes = fleetLanes.get(r.fleet) ?? new Map<number, FleetLane>();
      fleetLanes.set(r.fleet, lanes);
      for (const n of [r.fleet_route ?? []].flat()) lanes.set(n, { out, back });
      return;
    }
    let agent: Agent;
    if (r.kind === "forklift") {
      const fk = parts.forklift(idx % 2 ? "#f2b705" : "#e8731a");
      agent = {
        out, back, length, speed: FORKLIFT_SPEED, offset: idx * 11, object: fk.object, heading: 0, clock: 0, yields: true,
        step: (forward) => fk.setLoaded(forward),
      };
    } else if (r.kind === "cart") {
      const ct = parts.cart(idx % 2 ? "#2f6fb0" : "#3b8f6a");
      agent = {
        out, back, length, speed: CART_SPEED, offset: idx * 7, object: ct.object, heading: 0, clock: 0, yields: false,
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
        out, back, length, speed: WALK_SPEED, offset: idx * 13, object: op.object, heading: 0, clock: 0, yields: false,
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

  const vehicles: FleetVehicle[] = [];
  const bays = new Map<string, { center: THREE.Vector3; vehicles: number }>();
  for (const id of fleetLanes.keys()) {
    const bay = fleets?.bay(id);
    if (!bay) continue;
    bays.set(id, bay);
    for (let k = 0; k < bay.vehicles; k++) {
      const fk = parts.forklift(k % 2 ? "#f2b705" : "#e8731a");
      fk.object.name = `fleet-${id}-${k + 1}`;
      group.add(fk.object);
      vehicles.push({ fleet: id, index: k + 1, object: fk.object, setLoaded: fk.setLoaded, heading: 0, onRoute: false });
    }
  }
  const parked = (bay: { center: THREE.Vector3; vehicles: number }, k: number): THREE.Vector3 => {
    const cols = Math.min(bay.vehicles, 6);
    const rows = Math.ceil(bay.vehicles / cols);
    const i = k - 1;
    return bay.center.clone().add(new THREE.Vector3(((i % cols) - (cols - 1) / 2) * 1.4, 0, (Math.floor(i / cols) - (rows - 1) / 2) * 2.6));
  };
  const turn = (obj: THREE.Object3D, heading: number, dir: THREE.Vector3, dt: number): number => {
    const target = Math.atan2(dir.x, dir.z);
    let diff = target - heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const h = heading + diff * Math.min(1, dt * 6);
    obj.rotation.y = h;
    return h;
  };

  return (time, dt) => {
    for (const v of vehicles) {
      const ch = fleets?.channels(v.fleet);
      const bay = bays.get(v.fleet);
      if (!ch || !bay) continue;
      const route = Math.round(ch[`v${v.index}_route`] ?? 0);
      const lane = fleetLanes.get(v.fleet)?.get(route);
      if (route <= 0 || !lane) {
        v.object.position.copy(parked(bay, v.index));
        v.object.rotation.y = v.heading = Math.PI;
        v.setLoaded(false);
        v.onRoute = false;
        continue;
      }
      const pos = ch[`v${v.index}_pos`] ?? 0;
      const outbound = pos < 0.5 || (ch[`v${v.index}_loaded`] ?? 0) > 0.5;
      const fraction = outbound ? Math.min(1, pos * 2) : Math.max(0, 2 - pos * 2);
      const located = locate(outbound ? lane.out : lane.back, fraction);
      if (!outbound) located.dir.negate();
      v.object.position.copy(located.pos);
      v.heading = turn(v.object, v.heading, located.dir, dt);
      v.setLoaded((ch[`v${v.index}_loaded`] ?? 0) > 0.5);
      v.onRoute = true;
    }
    for (const a of agents) {
      const run = a.length / a.speed;
      const cycle = 2 * (run + PAUSE_S);
      const t = (a.clock + a.offset) % cycle;
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
      // un montacargas de la escena cede el paso a cualquier vehículo de la flota que esté cerca: nunca se traspasan
      const blocked = a.yields && moving && vehicles.some((v) => v.onRoute && v.object.position.distanceTo(pos) < YIELD_M);
      if (!blocked) a.clock += dt;
      else moving = false;
      a.object.position.copy(blocked ? a.object.position : pos);
      a.heading = turn(a.object, a.heading, dir, dt);
      a.step(forward, moving, dt);
    }
    void time;
  };
}
