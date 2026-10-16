/**
 * Prueba genérica de geometrías: cada tipo, con cada preset, se construye, se anima con los
 * extremos de sus canales y su caja envolvente coincide con la huella que declara.
 */
import yaml from "js-yaml";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { geometryBuilders, rawPresets, rawSpecs } from "../registry.ts";

interface Spec {
  params: Record<string, { default?: unknown }>;
  animation_channels: { id: string; range?: [number, number] }[];
}

const STATES = ["idle", "running", "fault", "blocked"];

for (const [type, build] of Object.entries(geometryBuilders)) {
  const spec = yaml.load(rawSpecs[type]) as Spec;
  const defaults = Object.fromEntries(Object.entries(spec.params).filter(([, p]) => p.default !== undefined).map(([k, p]) => [k, p.default]));
  const presets = Object.entries(rawPresets[type] ?? {}).map(([id, txt]) => [id, (yaml.load(txt) as { params: Record<string, unknown> }).params] as const);

  describe(type, () => {
    for (const [presetId, presetParams] of [["(defaults)", {}] as const, ...presets]) {
      it(`se construye y anima con ${presetId}`, () => {
        const model = build({ ...defaults, ...presetParams });
        expect(model.root).toBeInstanceOf(THREE.Object3D);
        for (const [i, state] of STATES.entries()) {
          const channels = Object.fromEntries(spec.animation_channels.map((c) => [c.id, (c.range ?? [0, 1])[i % 2]]));
          model.update({ channels, state }, 0.016);
        }
        const box = new THREE.Box3().setFromObject(model.root);
        const size = box.getSize(new THREE.Vector3());
        expect(Number.isFinite(size.x) && size.x > 0).toBe(true);
        expect(box.min.y).toBeGreaterThan(-0.1); // nada atraviesa el piso
        // la huella declarada coincide con el modelo (±35 %: incluye accesorios como escaleras o tuberías)
        expect(size.x).toBeGreaterThan(model.size.dx * 0.65);
        expect(size.x).toBeLessThan(model.size.dx * 1.35 + 0.8);
        expect(size.y).toBeLessThan(model.size.height * 1.35 + 0.5);
        model.dispose();
      });
    }
  });
}
