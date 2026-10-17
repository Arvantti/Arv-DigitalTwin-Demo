/**
 * Sala de control del PLC en la escena de planta: gabinete del PLC, puesto del operador y panel de gráficos.
 *
 * Son piezas de la escena, no equipos de la librería: no tienen comportamiento propio. El panel solo dibuja
 * variables que ya publica la simulación (`snapshot.equipment[id].variables`); cada espacio del panel se
 * configura en el plant.yaml (`panel.slots`) y los que quedan con `equipment: null` se muestran libres.
 */
import * as THREE from "three";

export interface PanelSlot {
  title: string;
  equipment: string | null;
  variable: string | null;
  unit?: string;
}
export interface PanelConfig {
  title?: string;
  slots: PanelSlot[];
}
type Variables = Record<string, number | string | null>;
export type SnapshotLike = Record<string, { variables?: Variables }>;

export interface ControlPiece {
  root: THREE.Object3D;
  /** Solo el panel: recibe cada muestra de la simulación. */
  feed?: (equipment: SnapshotLike, t: number) => void;
  /** Solo el panel: redibuja si hay muestras nuevas. */
  redraw?: () => void;
}

const steel = (color: string, metalness = 0.5, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Gabinete del PLC: puertas con persiana de ventilación, luces de estado y ranuras de módulos tras la ventana. */
export function plcCabinet([dx, dy, dz]: [number, number, number]): ControlPiece {
  const g = new THREE.Group();
  const body = steel("#c9ced4", 0.35, 0.55);
  const dark = steel("#2b3138", 0.6, 0.45);
  g.add(box(dx, dz, dy, body, 0, dz / 2, 0));
  const doors = 3;
  const w = dx / doors;
  const front = dy / 2 + 0.01; // la cara frontal mira al sur del plano (z de escena positiva)
  for (let i = 0; i < doors; i++) {
    const cx = -dx / 2 + w * (i + 0.5);
    g.add(box(0.03, dz - 0.1, 0.02, dark, cx - w / 2 + 0.02, dz / 2, front));
    // ventana de módulos
    g.add(box(w - 0.18, 0.7, 0.02, steel("#161b20", 0.2, 0.3), cx, dz * 0.68, front + 0.005));
    for (let m = 0; m < 4; m++) g.add(box(0.1, 0.55, 0.02, steel("#3d4650", 0.5, 0.4), cx - 0.2 + m * 0.13, dz * 0.68, front + 0.015));
    // persiana
    for (let s = 0; s < 6; s++) g.add(box(w - 0.3, 0.02, 0.02, dark, cx, 0.25 + s * 0.06, front + 0.005));
    // luces de estado
    const led = new THREE.MeshStandardMaterial({ color: "#000", emissive: ["#2ee06a", "#2ee06a", "#ffb21e"][i], emissiveIntensity: 2 });
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), led);
      l.position.set(cx - 0.1 + k * 0.1, dz * 0.4, front + 0.02);
      g.add(l);
    }
  }
  g.add(box(dx + 0.04, 0.06, dy + 0.04, dark, 0, dz + 0.03, 0));
  g.add(box(dx + 0.04, 0.1, dy + 0.04, dark, 0, 0.05, 0));
  return { root: g };
}

/** Puesto del operador: escritorio, dos monitores con la pantalla encendida y silla. */
export function operatorDesk([dx, dy]: [number, number, number]): ControlPiece {
  const g = new THREE.Group();
  const wood = steel("#8d6e4b", 0.05, 0.7);
  const dark = steel("#252a30", 0.6, 0.4);
  g.add(box(dx, 0.05, dy, wood, 0, 0.74, 0));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.72, dy - 0.1, dark, sx * (dx / 2 - 0.1), 0.36, 0));
  g.add(box(dx - 0.3, 0.45, 0.03, dark, 0, 0.5, -dy / 2 + 0.1));
  const glow = new THREE.MeshStandardMaterial({ color: "#04121a", emissive: "#2aa6d6", emissiveIntensity: 0.9 });
  for (const sx of [-0.7, 0.7]) {
    g.add(box(0.62, 0.38, 0.03, dark, sx, 1.1, -0.2));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), glow);
    screen.position.set(sx, 1.1, -0.183);
    screen.rotation.y = 0; // pantalla hacia +z de escena (sur): el operador se sienta de ese lado
    g.add(screen);
    g.add(box(0.05, 0.3, 0.05, dark, sx, 0.9, -0.22));
  }
  g.add(box(0.5, 0.02, 0.18, dark, 0, 0.77, 0.2));
  // silla
  const chair = steel("#2f3a46", 0.2, 0.8);
  g.add(box(0.5, 0.08, 0.5, chair, 0, 0.5, dy / 2 + 0.55));
  g.add(box(0.5, 0.55, 0.07, chair, 0, 0.82, dy / 2 + 0.8));
  g.add(box(0.06, 0.45, 0.06, dark, 0, 0.25, dy / 2 + 0.55));
  g.add(box(0.5, 0.05, 0.5, dark, 0, 0.03, dy / 2 + 0.55));
  g.traverse((o) => (o.castShadow = true));
  return { root: g };
}

// ---------------------------------------------------------------- panel de gráficos
const HISTORY = 160;
const COLS = 4;

/**
 * Panel de pared con un mosaico de gráficos de tendencia. Cada espacio guarda las últimas muestras de su variable
 * (una por mensaje de la simulación) y se dibuja en un canvas que sirve de textura de la pantalla.
 */
export function controlPanel([dx, dy, dz]: [number, number, number], config: PanelConfig): ControlPiece {
  const g = new THREE.Group();
  const frame = steel("#20262d", 0.6, 0.4);
  g.add(box(dx + 0.2, dz + 0.2, dy, frame, 0, dz / 2 + 0.9, 0));

  const W = 2048;
  const H = Math.round((W * dz) / dx);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(dx, dz), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.set(0, dz / 2 + 0.9, dy / 2 + 0.005);
  g.add(screen);
  // patas del panel
  for (const sx of [-1, 1]) g.add(box(0.12, 0.9, dy, frame, sx * (dx / 2 - 0.3), 0.45, 0));

  const slots = config.slots;
  const history: { t: number; v: number }[][] = slots.map(() => []);
  let lastT = 0;
  let dirty = true;

  const feed = (equipment: SnapshotLike, t: number): void => {
    if (t < lastT) history.forEach((h) => (h.length = 0)); // la simulación reinició
    lastT = t;
    slots.forEach((s, i) => {
      if (!s.equipment || !s.variable) return;
      const v = equipment[s.equipment]?.variables?.[s.variable];
      if (typeof v !== "number" || !Number.isFinite(v)) return;
      const h = history[i];
      h.push({ t, v });
      if (h.length > HISTORY) h.shift();
    });
    dirty = true;
  };

  const draw = (): void => {
    ctx.fillStyle = "#0b1218";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "700 44px Rajdhani, Arial, sans-serif";
    ctx.fillStyle = "#9fd4f5";
    ctx.textBaseline = "middle";
    ctx.fillText((config.title ?? "PANEL DE PLANTA").toUpperCase(), 36, 42);
    ctx.fillStyle = "#5d7285";
    ctx.textAlign = "right";
    ctx.font = "500 32px Rajdhani, Arial, sans-serif";
    ctx.fillText(lastT > 0 ? `SIM ${(lastT / 3600).toFixed(2)} h` : "SIN DATOS · conecta la simulación", W - 36, 42);
    ctx.textAlign = "left";
    const rows = Math.ceil(slots.length / COLS);
    const top = 84;
    const gap = 16;
    const tw = (W - 36 * 2 - gap * (COLS - 1)) / COLS;
    const th = (H - top - 24 - gap * (rows - 1)) / rows;
    slots.forEach((s, i) => {
      const x = 36 + (i % COLS) * (tw + gap);
      const y = top + Math.floor(i / COLS) * (th + gap);
      ctx.fillStyle = "#121c25";
      ctx.fillRect(x, y, tw, th);
      ctx.strokeStyle = "#24384a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, tw, th);
      ctx.font = "600 34px Rajdhani, Arial, sans-serif";
      ctx.fillStyle = "#c8d6e2";
      ctx.fillText(s.title.toUpperCase(), x + 16, y + 30);
      const h = history[i];
      const bound = !!(s.equipment && s.variable);
      if (!h.length) {
        ctx.font = "500 30px Rajdhani, Arial, sans-serif";
        ctx.fillStyle = "#4a5d6e";
        ctx.fillText(bound ? `${s.equipment} · ${s.variable}` : "SIN ASIGNAR", x + 16, y + th / 2 + 6);
        return;
      }
      const last = h[h.length - 1].v;
      ctx.font = "700 64px Rajdhani, Arial, sans-serif";
      ctx.fillStyle = "#4de0ff";
      const label = Math.abs(last) >= 100 ? last.toFixed(0) : last.toFixed(1);
      ctx.fillText(label, x + 16, y + 92);
      const lw = ctx.measureText(label).width;
      ctx.font = "500 32px Rajdhani, Arial, sans-serif";
      ctx.fillStyle = "#7f93a6";
      ctx.fillText(s.unit ?? "", x + 24 + lw, y + 98);
      // tendencia
      const gx = x + 16;
      const gy = y + 120;
      const gw = tw - 32;
      const gh = th - 120 - 16;
      let lo = Math.min(...h.map((p) => p.v));
      let hi = Math.max(...h.map((p) => p.v));
      if (hi - lo < 1e-6) {
        lo -= 0.5;
        hi += 0.5;
      }
      const pad = (hi - lo) * 0.1;
      lo -= pad;
      hi += pad;
      ctx.strokeStyle = "#1f2f3d";
      ctx.lineWidth = 1;
      for (let k = 0; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(gx, gy + (gh * k) / 3);
        ctx.lineTo(gx + gw, gy + (gh * k) / 3);
        ctx.stroke();
      }
      ctx.strokeStyle = "#4de0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      h.forEach((p, k) => {
        const px = gx + (gw * k) / (HISTORY - 1);
        const py = gy + gh - ((p.v - lo) / (hi - lo)) * gh;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.font = "500 24px JetBrains Mono, monospace";
      ctx.fillStyle = "#5d7285";
      ctx.fillText(hi.toFixed(1), gx + gw - 70, gy + 12);
      ctx.fillText(lo.toFixed(1), gx + gw - 70, gy + gh - 8);
    });
    texture.needsUpdate = true;
  };

  const redraw = (): void => {
    if (!dirty) return;
    dirty = false;
    draw();
  };
  draw();
  return { root: g, feed, redraw };
}
