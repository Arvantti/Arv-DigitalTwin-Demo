/**
 * Movimiento al ritmo del play (docs/plant-scene.md): con el play corriendo, operarios, carros y montacargas se mueven
 * más rápido según la velocidad elegida, y a partir de cierta velocidad dejan una estela de rastro.
 *
 * La escala no es literal: a 1 h/s un operario recorrería 4 km por segundo y saltaría de punta a punta de la nave
 * varias veces por cuadro. Se usa la raíz cuadrada de la tasa del play, que crece con cada velocidad y se mantiene visible:
 * 15 min/s ≈ ×9, 1 h/s ≈ ×19, 4 h/s ≈ ×38, 12 h/s ≈ ×60 (tope).
 */
import * as THREE from "three";

export const MAX_SCALE = 60;
/** Desde esta escala los agentes dejan estela. */
export const TRAIL_FROM = 8;

/** Multiplicador de velocidad de la escena para una tasa del play (segundos de planta por segundo real; 1 = en vivo). */
export function visualScale(rate: number): number {
  return rate <= 1 ? 1 : Math.min(MAX_SCALE, Math.max(1, Math.sqrt(rate / 10)));
}

const SAMPLES = 48;
const LIFE_S = 0.9; // vida de cada punto de la estela, en segundos reales
const MIN_KEEP = 6; // en un equipo lento (pocos cuadros por segundo) se conservan al menos los últimos puntos
const JUMP_M = 80; // un salto mayor en un cuadro es un reinicio: la estela se corta (también con `userData.trailCut`)

/** Estela de un objeto: cinta en el piso que se desvanece con la edad de cada punto. */
class Trail {
  readonly mesh: THREE.Mesh;
  private pts: { x: number; z: number; t: number }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  constructor(
    readonly target: THREE.Object3D,
    private color: THREE.Color,
    private width: number,
    private height: number,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(SAMPLES * 2 * 3);
    this.col = new Float32Array(SAMPLES * 2 * 3);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(index);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  clear(): void {
    this.pts.length = 0;
    this.mesh.visible = false;
  }

  update(now: number, on: boolean): void {
    const p = new THREE.Vector3();
    this.target.getWorldPosition(p);
    const last = this.pts[0];
    const cut = this.target.userData.trailCut === true;
    this.target.userData.trailCut = false;
    if (cut || !on || !this.target.visible || (last && Math.hypot(p.x - last.x, p.z - last.z) > JUMP_M)) this.pts.length = 0;
    if (on && this.target.visible && (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.05)) this.pts.unshift({ x: p.x, z: p.z, t: now });
    while (this.pts.length > SAMPLES || (this.pts.length > MIN_KEEP && now - this.pts.at(-1)!.t > LIFE_S)) this.pts.pop();
    const n = this.pts.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    for (let i = 0; i < SAMPLES; i++) {
      const k = Math.min(i, n - 1);
      const a = this.pts[Math.max(0, k - 1)];
      const b = this.pts[Math.min(n - 1, k + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const life = i < n ? Math.max(0, 1 - (now - this.pts[k].t) / LIFE_S, 1 - i / MIN_KEEP) : 0;
      const w = (this.width / 2) * (0.25 + 0.75 * life);
      const q = this.pts[k];
      // dos vértices a cada lado de la marcha
      this.pos.set([q.x - dz * w, this.height, q.z + dx * w, q.x + dz * w, this.height, q.z - dx * w], i * 6);
      const f = life * life;
      const c = [this.color.r * f, this.color.g * f, this.color.b * f];
      this.col.set([...c, ...c], i * 6);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

export interface Trails {
  /** `scale` es el multiplicador del play; `now`, el reloj real en segundos. */
  update: (scale: number, now: number) => void;
}

/**
 * Estelas de los agentes de la escena: todo objeto con `userData.trail` (color) la tiene; `userData.trailWidth` da el ancho.
 * Los agentes se buscan la primera vez que hace falta una estela.
 */
export function buildTrails(root: THREE.Object3D, parent: THREE.Object3D): Trails {
  let trails: Trail[] | null = null;
  let shown = false;
  return {
    update(scale, now) {
      const on = scale >= TRAIL_FROM;
      if (!on && !shown) return;
      if (!trails) {
        trails = [];
        root.traverse((o) => {
          if (typeof o.userData.trail !== "string") return;
          const t = new Trail(o, new THREE.Color(o.userData.trail), o.userData.trailWidth ?? 1.0, 0.06);
          parent.add(t.mesh);
          trails!.push(t);
        });
      }
      let any = false;
      for (const t of trails) {
        t.update(now, on);
        any ||= t.mesh.visible;
      }
      shown = any;
    },
  };
}
