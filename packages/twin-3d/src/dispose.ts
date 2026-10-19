import * as THREE from "three";

/**
 * Libera las geometrías de un árbol de objetos y los materiales que NO son compartidos.
 * Los materiales de la biblioteca (materials.ts) tienen nombre y se conservan; los objetos marcados `userData.shared`
 * (modelos de personas compartidos) no se tocan.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.userData.shared) return; // modelo compartido (personas): lo usan otras escenas
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (!mat.name) mat.dispose();
    }
  });
}
