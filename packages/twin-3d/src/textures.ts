/**
 * Texturas procedurales generadas en un canvas (sin archivos externos).
 * En entornos sin DOM (pruebas en Node) devuelven null y los materiales funcionan sin mapa.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.Texture | null>();

function canvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Generador pseudoaleatorio determinista (mulberry32) para que las texturas no cambien entre cargas. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cached(key: string, make: () => THREE.Texture | null): THREE.Texture | null {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) ?? null;
}

function finish(tex: THREE.Texture, repeat = 1, color = false): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Mapa de rugosidad de acero inoxidable cepillado: rayas finas en una dirección. */
export function brushedRoughness(): THREE.Texture | null {
  return cached("brushed", () => {
    const c = canvas(512, 512);
    if (!c) return null;
    const g = c.getContext("2d")!;
    const r = rng(7);
    g.fillStyle = "rgb(110,110,110)";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const y = r() * 512;
      const v = 80 + r() * 90;
      g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`;
      g.lineWidth = 0.5 + r() * 1.2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y + (r() - 0.5) * 3);
      g.stroke();
    }
    return finish(new THREE.CanvasTexture(c), 2);
  });
}

/** Ruido suave para pintura industrial y concreto (variación de rugosidad y suciedad leve). */
export function grime(seed = 3, scale = 1): THREE.Texture | null {
  return cached(`grime-${seed}-${scale}`, () => {
    const c = canvas(512, 512);
    if (!c) return null;
    const g = c.getContext("2d")!;
    const r = rng(seed);
    g.fillStyle = "rgb(128,128,128)";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const rad = 4 + r() * 40;
      const v = 100 + r() * 70;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${v},${v},${v},0.25)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return finish(new THREE.CanvasTexture(c), scale);
  });
}

/** Chapa galvanizada: manchas cristalinas (spangle). */
export function galvanizedMap(): THREE.Texture | null {
  return cached("galvanized", () => {
    const c = canvas(512, 512);
    if (!c) return null;
    const g = c.getContext("2d")!;
    const r = rng(11);
    g.fillStyle = "rgb(175,180,184)";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const s = 5 + r() * 16;
      const v = 165 + r() * 45;
      g.fillStyle = `rgba(${v},${v + 3},${v + 6},0.35)`;
      g.beginPath();
      const n = 5 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.5;
        const rr = s * (0.6 + r() * 0.4);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    return finish(new THREE.CanvasTexture(c), 3, true);
  });
}

/** Franjas de seguridad amarillo/negro a 45°. */
export function hazardStripes(): THREE.Texture | null {
  return cached("hazard", () => {
    const c = canvas(256, 256);
    if (!c) return null;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f2b705";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#151515";
    for (let i = -256; i < 512; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 32, 0);
      g.lineTo(i + 32 + 256, 256);
      g.lineTo(i + 256, 256);
      g.closePath();
      g.fill();
    }
    return finish(new THREE.CanvasTexture(c), 1, true);
  });
}

/** Piso epóxico oscuro con juntas de losa y desgaste. */
export function epoxyFloor(): { map: THREE.Texture | null; roughness: THREE.Texture | null } {
  const map = cached("floor-map", () => {
    const c = canvas(1024, 1024);
    if (!c) return null;
    const g = c.getContext("2d")!;
    const r = rng(21);
    g.fillStyle = "#1a1d22";
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 4000; i++) {
      const v = 22 + r() * 18;
      g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.35)`;
      g.fillRect(r() * 1024, r() * 1024, 1 + r() * 3, 1 + r() * 3);
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * 1024;
      const y = r() * 1024;
      const rad = 30 + r() * 120;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, "rgba(45,48,54,0.25)");
      grad.addColorStop(1, "rgba(45,48,54,0)");
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.strokeStyle = "rgba(0,0,0,0.65)";
    g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 256) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 1024);
      g.moveTo(0, i);
      g.lineTo(1024, i);
      g.stroke();
    }
    return finish(new THREE.CanvasTexture(c), 1, true);
  });
  return { map, roughness: grime(31, 4) };
}

/** Texto en una textura (placas, rótulos de piso, pantallas). */
export function textTexture(
  lines: string[],
  opts: { width?: number; height?: number; bg?: string; fg?: string; font?: string; align?: CanvasTextAlign } = {},
): THREE.Texture | null {
  const { width = 512, height = 128, bg = "rgba(0,0,0,0)", fg = "#ffffff", font = "600 64px Inter, Arial, sans-serif", align = "center" } = opts;
  const c = canvas(width, height);
  if (!c) return null;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = align;
  g.textBaseline = "middle";
  const x = align === "center" ? width / 2 : align === "right" ? width - 16 : 16;
  const lh = height / (lines.length + 0.2);
  lines.forEach((l, i) => g.fillText(l, x, lh * (i + 0.6)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Pantalla HMI dinámica: devuelve la textura y una función para redibujar valores. */
export function hmiScreen(width = 512, height = 320): {
  texture: THREE.Texture | null;
  draw: (title: string, rows: [string, string][], status: string, statusColor: string) => void;
} {
  const c = canvas(width, height);
  if (!c) return { texture: null, draw: () => {} };
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (title: string, rows: [string, string][], status: string, statusColor: string) => {
    g.fillStyle = "#06121d";
    g.fillRect(0, 0, width, height);
    g.fillStyle = "#0e2a40";
    g.fillRect(0, 0, width, 46);
    g.fillStyle = "#cfe8ff";
    g.font = "600 24px Inter, Arial, sans-serif";
    g.textBaseline = "middle";
    g.fillText(title, 14, 23);
    g.fillStyle = statusColor;
    g.beginPath();
    g.arc(width - 24, 23, 9, 0, Math.PI * 2);
    g.fill();
    g.font = "500 20px Inter, Arial, sans-serif";
    g.fillText(status, width - 150, 23);
    g.font = "500 22px 'JetBrains Mono', monospace";
    rows.slice(0, 7).forEach(([k, v], i) => {
      const y = 76 + i * 34;
      g.fillStyle = "#7fa6c4";
      g.fillText(k, 14, y);
      g.fillStyle = "#e9f6ff";
      g.textAlign = "right";
      g.fillText(v, width - 14, y);
      g.textAlign = "left";
    });
    tex.needsUpdate = true;
  };
  return { texture: tex, draw };
}
