/** Fila compacta de cinco puestos de costura, con contadores de salida junto a cada máquina. */
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type Params, ch, disposeObject, materials as M, num, parts as P } from "@twin/3d";

const STATIONS = [
  { name: "PLANA 1", style: "lock", spools: 3 },
  { name: "PLANA 2", style: "lock", spools: 3 },
  { name: "FILETEADORA 1", style: "overlock", spools: 4 },
  { name: "FILETEADORA 2", style: "overlock", spools: 4 },
  { name: "RECUBRIDORA", style: "cover", spools: 5 },
] as const;

export default function build(params: Params): EquipmentModel {
  const L = num(params, "row_length_m", 9);
  const D = num(params, "row_width_m", 3.6);
  const root = P.group("garment-sewing-module-row");
  const steel = M.stainless();
  const dark = M.paint("#34404a", 0.45);
  const screens: ReturnType<typeof P.hmiPanel>[] = [];
  const needles: THREE.Group[] = [];
  const operatorHandles: ReturnType<typeof P.operator>[] = [];
  const stationX = STATIONS.map((_, i) => -L * 0.4 + i * (L * 0.2));
  const tableTop = 0.79;

  // Canal de entrada y mesa de trabajo: una fila continua, no cinco islas separadas.
  const infeed = P.box(L * 0.95, 0.11, 0.47, M.paint("#78909a", 0.55), 0.025);
  infeed.position.set(0, 0.64, -0.82); root.add(infeed);
  const outfeed = P.box(L * 0.95, 0.11, 0.42, M.paint("#66808a", 0.55), 0.025);
  outfeed.position.set(0, 0.64, -0.22); root.add(outfeed);
  for (let i = 0; i < 5; i++) {
    const x = stationX[i];
    const table = P.slab(1.58, 0.055, 0.72, M.paint("#cbd2d6", 0.52), 0.012, `sewing-table-${i + 1}`);
    table.position.set(x, tableTop, 0.05); root.add(table);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = P.box(0.045, tableTop, 0.045, dark, 0.005);
      leg.position.set(x + sx * 0.69, tableTop / 2, 0.05 + sz * 0.28); root.add(leg);
    }
    const motor = P.motor(3.5, "#3d464d");
    motor.scale.set(0.24, 0.22, 0.24); motor.position.set(x - 0.42, 0.55, -0.05); root.add(motor);

    const st = STATIONS[i];
    const enamel = M.paint(st.style === "lock" ? "#456b88" : st.style === "overlock" ? "#d5dfe3" : "#3f7982", 0.3);
    // Cama, brazo, cabezal y volante proporcionados a una máquina industrial de mesa.
    const bed = P.box(0.82, 0.07, 0.3, enamel, 0.035); bed.position.set(x - 0.07, tableTop + 0.12, -0.01); root.add(bed);
    const arm = P.box(0.57, 0.12, 0.32, enamel, 0.025); arm.position.set(x + 0.02, tableTop + 0.24, -0.02); root.add(arm);
    const head = P.box(0.29, 0.26, 0.31, enamel, 0.035); head.position.set(x + 0.32, tableTop + 0.18, 0.01); root.add(head);
    const throat = P.box(0.3, 0.08, 0.33, enamel, 0.02); throat.position.set(x + 0.28, tableTop + 0.36, 0.01); root.add(throat);
    const needleGroup = P.group(`needles-${i + 1}`);
    const nNeedles = st.style === "lock" ? 1 : st.style === "overlock" ? 2 : 3;
    for (let n = 0; n < nNeedles; n++) {
      const dz = (n - (nNeedles - 1) / 2) * 0.055;
      const needle = P.box(0.016, 0.2, 0.016, steel, 0.002);
      needle.position.set(0.36, 0.0, dz); needleGroup.add(needle);
    }
    needleGroup.position.set(x, tableTop + 0.17, 0.1); root.add(needleGroup); needles.push(needleGroup);
    if (st.style === "overlock") {
      const knife = P.box(0.035, 0.16, 0.025, steel, 0.003); knife.position.set(x + 0.48, tableTop + 0.12, 0.13); root.add(knife);
      const loopers = P.box(0.16, 0.055, 0.12, M.paint("#aab6bc", 0.32), 0.01); loopers.position.set(x + 0.34, tableTop + 0.07, -0.12); root.add(loopers);
    } else if (st.style === "cover") {
      for (let n = 0; n < 2; n++) {
        const looper = P.box(0.15, 0.03, 0.035, steel, 0.003); looper.position.set(x + 0.35, tableTop + 0.065, -0.08 + n * 0.1); root.add(looper);
      }
    }
    const wheel = P.cylinderX(0.105, 0.04, dark, 24); wheel.position.set(x - 0.42, tableTop + 0.2, -0.05); root.add(wheel);
    const spoolStand = P.box(0.025, 0.32, 0.025, steel, 0.002); spoolStand.position.set(x - 0.5, tableTop + 0.28, -0.12); root.add(spoolStand);
    for (let n = 0; n < st.spools; n++) {
      const cone = P.cylinder(0.033, 0.024, 0.13, M.paint(["#dfd3ac", "#678ca5", "#d56b63", "#77946a", "#a479a1"][n], 0.55), 12);
      cone.position.set(x - 0.68 + n * 0.075, tableTop + 0.5, -0.12); root.add(cone);
    }
    const pedal = P.box(0.25, 0.026, 0.12, dark, 0.004); pedal.position.set(x, 0.1, 0.25); root.add(pedal);
    const guard = P.box(0.48, 0.06, 0.13, M.paint("#e0b442", 0.45), 0.01); guard.position.set(x, 0.12, 0.3); root.add(guard);

    // Silla regulable, respaldo y aro de apoyo; la postura es sentada y orientada hacia la aguja.
    const seat = P.slab(0.43, 0.1, 0.42, M.paint("#34495e", 0.65), 0.035); seat.position.set(x, 0.5, 0.91); root.add(seat);
    const back = P.slab(0.42, 0.52, 0.085, M.paint("#34495e", 0.65), 0.035); back.position.set(x, 0.82, 1.1); root.add(back);
    const post = P.cylinder(0.035, 0.035, 0.43, steel, 16); post.position.set(x, 0.27, 0.91); root.add(post);
    const base = P.cylinder(0.27, 0.27, 0.045, dark, 20); base.position.set(x, 0.045, 0.91); root.add(base);
    const person = P.operator("#e2aa39", "#355a75", { gender: "female", seated: true, skin: ["#c99a76", "#8d5a3b", "#e3b896", "#a8745a"][i % 4], hair: "#30231d" });
    person.object.position.set(x, 0, 1.0); person.object.rotation.y = Math.PI; person.object.scale.setScalar(0.74); root.add(person.object); operatorHandles.push(person);

    // Display físico de producción junto al puesto, actualizado solo con los contadores del comportamiento.
    const panel = P.hmiPanel(0.23);
    panel.object.position.set(x + 0.63, 1.02, 0.0); panel.object.rotation.y = -0.3; root.add(panel.object); screens.push(panel);
  }
  // Trazado de seguridad de la fila y contenedores de entrada/salida de prendas.
  for (const z of [-1.42, 1.52]) {
    const stripe = P.box(L * 0.97, 0.018, 0.035, M.paint("#edbc35", 0.42), 0.002);
    stripe.position.set(0, 0.025, z); root.add(stripe);
  }

  function update(frame: AnimationFrame): void {
    const v = frame.variables ?? {};
    for (let i = 0; i < 5; i++) {
      needles[i].position.y = 0.96 - ch(frame, `station_${i + 1}_needle`) * 0.075;
      operatorHandles[i].setPose(ch(frame, `station_${i + 1}_working`));
      const sku = Number(v[`station_${i + 1}_product`] ?? 0);
      screens[i].draw(STATIONS[i].name, [["Pzs", String(v[`station_${i + 1}_units`] ?? 0)], ["Cola", String(v[`station_${i + 1}_queue`] ?? 0)], ["Ref", sku === 1 ? "POLO" : sku === 2 ? "OVS" : "—"]], ch(frame, `station_${i + 1}_working`) ? "COSiendo" : "LISTA", "#36d08b");
    }
  }
  update({ channels: {}, state: "idle" });
  return { root, size: { dx: L + 0.3, dy: D, height: 2.1 }, update, dispose: () => disposeObject(root) };
}
