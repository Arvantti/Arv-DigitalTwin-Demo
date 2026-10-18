/**
 * Escenario de render: renderer con tono cinematográfico, entorno de reflejos, piso epóxico,
 * iluminación por presets (noche, día, atardecer), demarcación luminosa de celdas y
 * postproceso (oclusión ambiental, bloom, antialiasing).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { box, group } from "./parts.ts";
import { epoxyFloor, textTexture } from "./textures.ts";

export type LightingPreset = "night" | "day" | "golden";

export interface StageOptions {
  canvas: HTMLCanvasElement;
  lighting?: LightingPreset;
  /** Calidad: "high" activa AO y sombras de 4K; "low" para equipos modestos o capturas rápidas. */
  quality?: "high" | "low";
  preserveDrawingBuffer?: boolean;
}

interface LightRig {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fills: THREE.SpotLight[];
}

const PRESETS: Record<LightingPreset, {
  background: string;
  fog: [string, number, number];
  hemi: [string, string, number];
  key: [string, number, [number, number, number]];
  fill: [string, number];
  env: number;
  exposure: number;
  bloom: [number, number, number];
}> = {
  night: {
    background: "#05070a",
    fog: ["#05070a", 30, 110],
    hemi: ["#7fa2e0", "#06080a", 0.18],
    key: ["#dfe8ff", 0.9, [8, 14, 6]],
    fill: ["#f4f7ff", 26],
    env: 0.35,
    exposure: 0.95,
    bloom: [0.7, 0.4, 1.15],
  },
  day: {
    background: "#aeb9c4",
    fog: ["#aeb9c4", 45, 160],
    hemi: ["#ffffff", "#5d6672", 0.7],
    key: ["#fff6e8", 2.2, [10, 18, 8]],
    fill: ["#ffffff", 25],
    env: 0.8,
    exposure: 0.9,
    bloom: [0.25, 0.3, 1.2],
  },
  golden: {
    background: "#140e0b",
    fog: ["#1a120d", 30, 110],
    hemi: ["#ffb27a", "#120c0a", 0.25],
    key: ["#ffad66", 2.4, [-12, 6, 6]],
    fill: ["#ffd9b0", 22],
    env: 0.45,
    exposure: 0.95,
    bloom: [0.6, 0.45, 1.15],
  },
};

/** Atenuación común de los tres modos: la escena se veía demasiado brillante (pedido del autor, 2026-10-18). */
const SOFTEN = { key: 0.8, fill: 0.7, exposure: 0.9, bloom: 0.5 };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly content = new THREE.Group();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private ao: GTAOPass | null = null;
  private rig: LightRig;
  private cells = new THREE.Group();
  private floor: THREE.Mesh;
  private clock = new THREE.Clock();
  private pulseMats: THREE.MeshStandardMaterial[] = [];
  lighting: LightingPreset;

  constructor(opts: StageOptions) {
    const quality = opts.quality ?? "high";
    this.lighting = opts.lighting ?? "night";
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.camera.position.set(9, 6, 11);
    this.controls = new OrbitControls(this.camera, opts.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 120;

    const { map, roughness } = epoxyFloor();
    const floorMat = new THREE.MeshStandardMaterial({
      color: map ? "#ffffff" : "#1a1d22",
      map: map ?? undefined,
      roughnessMap: roughness ?? undefined,
      roughness: 0.55,
      metalness: 0.1,
    });
    if (floorMat.map) floorMat.map.repeat.set(30, 30);
    if (floorMat.roughnessMap) floorMat.roughnessMap.repeat.set(30, 30);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.name = "floor";
    this.scene.add(this.floor);

    const grid = new THREE.GridHelper(240, 120, "#1f4a63", "#132530");
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.002;
    this.scene.add(grid);

    this.rig = this.buildLights(quality);
    this.scene.add(this.content, this.cells);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (quality === "high") {
      this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.ao.blendIntensity = 0.9;
      this.composer.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());

    this.setLighting(this.lighting);
    this.resize();
  }

  private buildLights(quality: "high" | "low"): LightRig {
    const hemi = new THREE.HemisphereLight("#ffffff", "#111111", 0.5);
    const key = new THREE.DirectionalLight("#ffffff", 2);
    key.castShadow = true;
    const size = quality === "high" ? 4096 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -18;
    cam.right = cam.top = 18;
    cam.near = 1;
    cam.far = 80;
    // Luminarias de nave (high bay) como focos cenitales.
    const fills: THREE.SpotLight[] = [];
    for (const [x, z] of [[-5, -4], [5, -4], [-5, 5], [5, 5]]) {
      const s = new THREE.SpotLight("#ffffff", 100, 30, Math.PI / 4.2, 0.6, 1.6);
      s.position.set(x, 11, z);
      s.target.position.set(x * 0.6, 0, z * 0.6);
      this.scene.add(s.target);
      fills.push(s);
    }
    this.scene.add(hemi, key, ...fills);
    return { hemi, key, fills };
  }

  setLighting(preset: LightingPreset): void {
    const p = PRESETS[preset];
    this.lighting = preset;
    this.scene.background = new THREE.Color(p.background);
    this.scene.fog = new THREE.Fog(p.fog[0], p.fog[1], p.fog[2]);
    this.rig.hemi.color.set(p.hemi[0]);
    this.rig.hemi.groundColor.set(p.hemi[1]);
    this.rig.hemi.intensity = p.hemi[2];
    this.rig.key.color.set(p.key[0]);
    this.rig.key.intensity = p.key[1] * SOFTEN.key;
    this.rig.key.position.set(...p.key[2]);
    this.rig.fills.forEach((f) => {
      f.color.set(p.fill[0]);
      f.intensity = p.fill[1] * SOFTEN.fill;
    });
    this.scene.environmentIntensity = p.env;
    this.renderer.toneMappingExposure = p.exposure * SOFTEN.exposure;
    this.bloom.strength = p.bloom[0] * SOFTEN.bloom;
    this.bloom.radius = p.bloom[1];
    this.bloom.threshold = p.bloom[2];
  }

  /**
   * Demarcación de celda en el piso: líneas luminosas, esquineros, franja de seguridad y rótulo,
   * como en un tablero de control de planta.
   */
  addCellMarker(w: number, d: number, label: string, sublabel = "", color = "#3fd0ff"): THREE.Group {
    const g = group(`cell-${label}`);
    const glow = new THREE.MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 2.2 });
    this.pulseMats.push(glow);
    const t = 0.06;
    const lines: [number, number, number, number][] = [
      [0, -d / 2, w, t],
      [0, d / 2, w, t],
      [-w / 2, 0, t, d],
      [w / 2, 0, t, d],
    ];
    for (const [x, z, lw, ld] of lines) {
      const line = box(lw, 0.004, ld, glow, 0);
      line.position.set(x, 0.004, z);
      line.castShadow = false;
      g.add(line);
    }
    const bracket = new THREE.MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: 4 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const [lw, ld, ox, oz] of [[0.9, 0.12, 0.45, 0], [0.12, 0.9, 0, 0.45]]) {
          const b = box(lw, 0.006, ld, bracket, 0);
          b.position.set(sx * (w / 2 - ox), 0.006, sz * (d / 2 - oz));
          b.castShadow = false;
          g.add(b);
        }
      }
    }
    const tex = textTexture([label], { width: 1024, height: 256, fg: color, font: "800 170px 'Rajdhani', 'Arial Narrow', Arial, sans-serif" });
    if (tex) {
      const lw = Math.min(w * 0.6, 5);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: color, emissiveMap: tex, emissiveIntensity: 1.6, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw / 4), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(-w / 2 + lw / 2 + 0.3, 0.008, d / 2 + lw / 8 + 0.15);
      g.add(plane);
    }
    if (sublabel) {
      const st = textTexture([sublabel.toUpperCase()], { width: 2048, height: 128, fg: "#9fb7c9", font: "600 60px 'Rajdhani', Arial, sans-serif", align: "left" });
      if (st) {
        const mat = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false });
        const sw = Math.min(w, 9);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 16), mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(-w / 2 + sw / 2 + 0.3, 0.008, d / 2 + Math.min(w * 0.6, 5) / 4 + 0.35 + sw / 32);
        g.add(plane);
      }
    }
    this.cells.add(g);
    return g;
  }

  clearCells(): void {
    this.cells.clear();
    this.pulseMats = [];
  }

  /** Encuadra la cámara para ver un objeto completo desde una vista 3/4 elevada. */
  frame(object: THREE.Object3D, distanceFactor = 1.35): void {
    const bbox = new THREE.Box3().setFromObject(object);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 + 0.5;
    // distancia para que la esfera envolvente quepa en el campo vertical (y horizontal si la pantalla es angosta)
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * distanceFactor * 0.78;
    const dir = new THREE.Vector3(0.95, 0.62, 1.15).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.update();
    const key = this.rig.key;
    const cam = key.shadow.camera;
    const extent = Math.max(6, radius * 1.6);
    cam.left = cam.bottom = -extent;
    cam.right = cam.top = extent;
    cam.updateProjectionMatrix();
    key.target.position.copy(center);
    this.scene.add(key.target);
    key.position.copy(center).add(new THREE.Vector3(...PRESETS[this.lighting].key[2]));
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Dibuja un cuadro. Devuelve dt real en segundos. */
  render(): number {
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== window.innerWidth || size.y !== window.innerHeight) this.resize();
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.pulseMats.forEach((m, i) => (m.emissiveIntensity = 1.8 + 0.5 * Math.sin(t * 1.6 + i)));
    this.controls.update();
    this.composer.render(dt);
    return dt;
  }

  get time(): number {
    return this.clock.elapsedTime;
  }
}
