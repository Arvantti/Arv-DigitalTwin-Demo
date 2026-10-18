/**
 * Geometría de la flota de montacargas: la zona de estacionamiento y carga de baterías. Piso de concreto con una franja
 * amarilla de borde, una casilla por montacargas con su número, un cargador de pared con luz y un letrero de ruta. Los
 * montacargas en marcha no se dibujan aquí: la escena de planta los mueve por las rutas con los canales `v*_route`,
 * `v*_pos`, `v*_loaded` y `v*_wait`. Largo sobre +X, origen en el piso, al centro.
 */
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

export default function build(params: Params): EquipmentModel {
  const n = Math.max(1, Math.min(12, Math.round(num(params, "vehicles", 4))));
  const cols = Math.min(n, 6);
  const rows = Math.ceil(n / cols);
  const L = cols * 1.4 + 1.2;
  const W = rows * 2.6 + 0.6;
  const root = P.group("forklift-fleet");

  const pad = P.slab(L, 0.02, W, M.paint("#7d8590", 0.9), 0.004);
  pad.position.y = 0.01;
  root.add(pad);
  const yellow = M.paint("#e0b420", 0.7);
  for (const [x, z, w, d] of [
    [0, W / 2 - 0.04, L, 0.08],
    [0, -W / 2 + 0.04, L, 0.08],
    [-L / 2 + 0.04, 0, 0.08, W],
    [L / 2 - 0.04, 0, 0.08, W],
  ] as [number, number, number, number][]) {
    const s = P.box(w, 0.006, d, yellow, 0);
    s.position.set(x, 0.023, z);
    root.add(s);
  }
  const bayLines = M.paint("#f2f2f2", 0.8);
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const cx = (i % cols - (cols - 1) / 2) * 1.4;
    const cz = (Math.floor(i / cols) - (rows - 1) / 2) * 2.6;
    for (const sx of [-0.62, 0.62]) {
      const ln = P.box(0.05, 0.006, 2.2, bayLines, 0);
      ln.position.set(cx + sx, 0.024, cz);
      root.add(ln);
    }
    const lamp = P.box(0.18, 0.06, 0.18, new THREE.MeshStandardMaterial({ color: "#2ecc71", emissive: "#2ecc71", emissiveIntensity: 0.6 }), 0.01);
    lamp.position.set(cx, 0.06, cz + 0.95);
    root.add(lamp);
    lamps.push(lamp);
  }
  const charger = P.box(0.5, 1.4, 0.3, M.paint("#3a4047", 0.5), 0.02);
  charger.position.set(0, 0.7, -W / 2 - 0.2);
  root.add(charger);
  const sign = P.box(1.2, 0.5, 0.05, M.paint("#1f5fa8", 0.5), 0.01);
  sign.position.set(0, 1.9, -W / 2 - 0.2);
  root.add(sign);

  function update(frame: AnimationFrame): void {
    for (let i = 0; i < lamps.length; i++) {
      const out = ch(frame, `v${i + 1}_route`) > 0;
      const mat = lamps[i].material as THREE.MeshStandardMaterial;
      mat.color.set(out ? "#ffb000" : "#2ecc71");
      mat.emissive.set(out ? "#ffb000" : "#2ecc71");
    }
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: L, dy: W, height: 2.2 }, update, dispose: () => disposeObject(root) };
}
