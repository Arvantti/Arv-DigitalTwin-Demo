import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type Params, disposeObject, parts as P, materials as M } from "@twin/3d";

function segment(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, name: string): THREE.Mesh {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 16), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** T con entrada vertical y dos ramales laterales. La distribución la publica behavior.py. */
export default function build(_params: Params): EquipmentModel {
  const root = P.group("drain-manifold");
  const metal = M.galvanized();
  const radius = 0.07;
  // El tronco cae verticalmente desde la cota común al centro de la T; sus extremos laterales conectan
  // directamente con las entradas superiores enfrentadas de los tanques.
  const junction = new THREE.Vector3(0, 0, 0);
  root.add(segment(new THREE.Vector3(0, 0.275, 0), junction, radius, metal, "common_trunk"));
  root.add(segment(junction, new THREE.Vector3(-0.2, 0, 0), radius, metal, "branch_1"));
  root.add(segment(junction, new THREE.Vector3(0.2, 0, 0), radius, metal, "branch_2"));
  const collar = P.cylinder(radius * 1.45, radius * 1.45, 0.12, M.darkSteel(), 20, "t_junction");
  root.add(collar);
  const size = { dx: 0.5, dy: 0.3, height: 0.45 };
  return { root, size, update(_frame: AnimationFrame, _dt: number): void {}, dispose(): void { disposeObject(root); } };
}
