/**
 * Registro de geometrías de la librería. Descubre automáticamente cada <tipo>/geometry.ts:
 * agregar una carpeta nueva con su geometry.ts basta para que aparezca en la galería y en las plantas.
 */
import type { GeometryBuilder } from "@twin/3d";

const modules = import.meta.glob<{ default: GeometryBuilder }>("./*/geometry.ts", { eager: true });
const specs = import.meta.glob<string>("./*/equipment.yaml", { eager: true, query: "?raw", import: "default" });
const presets = import.meta.glob<string>("./*/presets/*.yaml", { eager: true, query: "?raw", import: "default" });
const scenarios = import.meta.glob<string>("./*/scenarios.yaml", { eager: true, query: "?raw", import: "default" });

function typeOf(path: string): string {
  return path.split("/")[1];
}

/** Las carpetas que empiezan con "_" (plantilla, esquemas) no son tipos de equipo. */
function isType(path: string): boolean {
  return !typeOf(path).startsWith("_");
}

export const geometryBuilders: Record<string, GeometryBuilder> = Object.fromEntries(
  Object.entries(modules)
    .filter(([path]) => isType(path))
    .map(([path, mod]) => [typeOf(path), mod.default]),
);

/** Textos YAML crudos (la galería los interpreta; la validación vive en el runtime de Python). */
export const rawSpecs: Record<string, string> = Object.fromEntries(
  Object.entries(specs)
    .filter(([p]) => isType(p))
    .map(([p, s]) => [typeOf(p), s]),
);

export const rawPresets: Record<string, Record<string, string>> = {};
for (const [path, text] of Object.entries(presets)) {
  if (!isType(path)) continue;
  const type = typeOf(path);
  const id = path.split("/").pop()!.replace(/\.yaml$/, "");
  (rawPresets[type] ??= {})[id] = text;
}

export const rawScenarios: Record<string, string> = Object.fromEntries(
  Object.entries(scenarios)
    .filter(([p]) => isType(p))
    .map(([p, s]) => [typeOf(p), s]),
);
