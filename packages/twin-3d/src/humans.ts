/**
 * Personas reales para las escenas: modelos 3D con piel, ropa, esqueleto y animaciones (reposo, caminar y trabajar),
 * tomados de la biblioteca Microsoft Rocketbox (licencia MIT, ver apps/gallery/public/humans/LICENSE-rocketbox.md).
 *
 * Cada modelo se descarga una sola vez y todas las personas de la escena lo comparten (geometría, texturas y
 * animaciones); cada persona solo agrega su esqueleto. Mientras el modelo llega, o donde no hay navegador (pruebas),
 * se ve la figura de formas orgánicas de `parts.operator`, que sigue siendo la base de posición y tamaño.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Operario u operaria con dotación (casco y chaleco) y hombre o mujer de ropa común (pasajeros, agentes). */
export type HumanKind = "worker_m" | "worker_f" | "civil_m" | "civil_f";

const FILES: Record<HumanKind, string> = {
  worker_m: "worker-m.glb",
  worker_f: "worker-f.glb",
  civil_m: "civil-m.glb",
  civil_f: "civil-f.glb",
};

let base = "/humans/";
let enabled = typeof window !== "undefined" && typeof document !== "undefined";
const cache = new Map<HumanKind, Promise<GLTF | null>>();
let pending = 0;

/** Cambia la carpeta de los modelos o los apaga (por ejemplo, para comparar con la figura simple). */
export function configureHumans(opts: { base?: string; enabled?: boolean }): void {
  if (opts.base !== undefined) base = opts.base.endsWith("/") ? opts.base : opts.base + "/";
  if (opts.enabled !== undefined) enabled = opts.enabled;
}

/** Modelos pedidos que aún no terminan de cargar (las capturas esperan a que llegue a 0). */
export function humansPending(): number {
  return pending;
}

function load(kind: HumanKind): Promise<GLTF | null> {
  let p = cache.get(kind);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    pending++;
    p = loader
      .loadAsync(base + FILES[kind])
      .catch(() => null)
      .finally(() => pending--);
    cache.set(kind, p);
  }
  return p;
}

/** Estado que escriben `setPose` y `setWalk`: trabajo 0..1, o fase de caminata en radianes (2π = un ciclo). */
export interface HumanState {
  work: number;
  walk: number | null;
}

/**
 * Cuando el modelo está listo, lo agrega a `host` y oculta `fallback`. La animación avanza sola mientras la persona
 * se dibuja (si está fuera de cámara no cuesta nada) y mezcla reposo y trabajo según `state.work`; al caminar, la fase
 * que da la escena manda el paso para que los pies acompañen el avance.
 */
export function attachHuman(host: THREE.Object3D, fallback: THREE.Object3D, kind: HumanKind, state: HumanState, seed: number): void {
  if (!enabled) return;
  void load(kind).then((gltf) => {
    if (!gltf) return;
    const clip = (n: string): THREE.AnimationClip | undefined => gltf.animations.find((a) => a.name === n);
    const idleClip = clip("idle");
    const walkClip = clip("walk");
    const workClip = clip("work");
    if (!idleClip || !walkClip || !workClip) return;
    const avatar = cloneSkinned(gltf.scene);
    avatar.name = "human";
    const mixer = new THREE.AnimationMixer(avatar);
    const idle = mixer.clipAction(idleClip);
    const walk = mixer.clipAction(walkClip);
    const work = mixer.clipAction(workClip);
    for (const a of [idle, walk, work]) a.play();
    // cada persona arranca en un punto distinto de su animación para que no se muevan al unísono
    idle.time = (seed * 0.618 % 1) * idleClip.duration;
    work.time = (seed * 0.382 % 1) * workClip.duration;

    let last = -1;
    const apply = (dt: number): void => {
      const walking = state.walk !== null;
      const w = Math.max(0, Math.min(1, state.work));
      walk.setEffectiveWeight(walking ? 1 : 0);
      work.setEffectiveWeight(walking ? 0 : w);
      idle.setEffectiveWeight(walking ? 0 : 1 - w);
      if (walking) {
        const cycle = (state.walk as number) / (2 * Math.PI);
        walk.time = (cycle - Math.floor(cycle)) * walkClip.duration;
        idle.timeScale = work.timeScale = 0;
        mixer.update(0);
        idle.timeScale = work.timeScale = 1;
      } else {
        walk.timeScale = 0;
        mixer.update(dt);
        walk.timeScale = 1;
      }
    };
    const tick = (): void => {
      const now = performance.now();
      if (last >= 0 && now - last < 4) return; // la misma persona se dibuja varias veces por cuadro (sombras)
      const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      apply(dt);
    };
    avatar.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      // geometría y materiales son del modelo compartido: disposeObject no los libera
      m.userData.shared = true;
      m.onBeforeRender = tick;
    });
    apply(0);
    host.add(avatar);
    fallback.visible = false;
  });
}

/** Elige el modelo: dotación o ropa común, y alterna hombres y mujeres (una de cada tres personas es mujer). */
let counter = 0;
export function pickHuman(civilian: boolean, gender?: "female" | "male"): { kind: HumanKind; seed: number } {
  const n = counter++;
  const female = gender ? gender === "female" : n % 3 === 2;
  return { kind: civilian ? (female ? "civil_f" : "civil_m") : female ? "worker_f" : "worker_m", seed: n + 1 };
}
