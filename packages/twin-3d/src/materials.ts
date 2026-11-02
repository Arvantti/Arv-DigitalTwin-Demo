/**
 * Biblioteca de materiales PBR industriales. Los materiales se comparten (caché por clave)
 * para que una planta con cientos de equipos no multiplique la memoria de GPU.
 */
import * as THREE from "three";
import { brushedRoughness, galvanizedMap, grime, hazardStripes } from "./textures.ts";

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    cache.set(key, m);
  }
  return m;
}

export const SAFETY_YELLOW = "#f2b705";
export const MACHINE_GREY = "#d7dadd";
export const DARK_STEEL = "#2a2d31";

/**
 * Pintura industrial metalizada: esmalte sobre chapa de acero con pigmento metálico.
 * Tono ligeramente desaturado (el color puro se ve de caricatura), metalness medio para que
 * refleje el entorno, rugosidad con grano sutil y una capa de barniz fina (2026-11-02, pedido de Andy).
 */
export function paint(color: string, roughness = 0.42): THREE.MeshPhysicalMaterial {
  return shared(`paint-${color}-${roughness}`, () => {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // desatura y baja un poco el brillo de los colores claros (blancos de plástico -> gris metálico)
    c.setHSL(hsl.h, hsl.s * 0.72, hsl.l > 0.8 ? hsl.l * 0.9 : hsl.l * 0.94);
    const m = new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: Math.max(0.28, roughness * 0.85),
      metalness: 0.6,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.15,
    });
    const g = grime(5, 2);
    if (g) m.roughnessMap = g;
    return m;
  });
}

/** Acero inoxidable cepillado (AISI 304), usado en equipos de alimentos. */
export function stainless(): THREE.MeshPhysicalMaterial {
  return shared("stainless", () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: "#c3c8cd",
      metalness: 1.0,
      roughness: 0.36,
      clearcoat: 0.0,
      envMapIntensity: 1.0,
    });
    const r = brushedRoughness();
    if (r) m.roughnessMap = r;
    return m;
  });
}

/** Inoxidable pulido espejo (tapas, ejes, bridas sanitarias). */
export function polishedSteel(): THREE.MeshStandardMaterial {
  return shared("polished", () => new THREE.MeshStandardMaterial({ color: "#e4e7ea", metalness: 1, roughness: 0.08 }));
}

/** Acero cromado (columnas/barras de la unidad de cierre). */
export function chrome(): THREE.MeshStandardMaterial {
  return shared("chrome", () => new THREE.MeshStandardMaterial({ color: "#f2f4f6", metalness: 1, roughness: 0.05 }));
}

/** Acero galvanizado (silos, estructuras exteriores). */
export function galvanized(): THREE.MeshStandardMaterial {
  return shared("galvanized", () => {
    const m = new THREE.MeshStandardMaterial({ color: "#b8bec4", metalness: 0.85, roughness: 0.42 });
    const t = galvanizedMap();
    if (t) m.map = t;
    return m;
  });
}

/** Acero negro / pavonado (moldes, bancadas, herrajes). */
export function darkSteel(): THREE.MeshStandardMaterial {
  return shared("dark-steel", () => {
    const m = new THREE.MeshStandardMaterial({ color: DARK_STEEL, metalness: 0.75, roughness: 0.38 });
    const g = grime(9, 2);
    if (g) m.roughnessMap = g;
    return m;
  });
}

/** Acero de molde (P20 mecanizado). */
export function toolSteel(): THREE.MeshStandardMaterial {
  return shared("tool-steel", () => new THREE.MeshStandardMaterial({ color: "#8d949b", metalness: 1, roughness: 0.22 }));
}

/** Perfil de aluminio anodizado (guardas, marcos de robot). */
export function aluminum(): THREE.MeshStandardMaterial {
  return shared("aluminum", () => new THREE.MeshStandardMaterial({ color: "#bfc5cb", metalness: 0.9, roughness: 0.3 }));
}

export function rubber(): THREE.MeshStandardMaterial {
  return shared("rubber", () => new THREE.MeshStandardMaterial({ color: "#111214", metalness: 0, roughness: 0.85 }));
}

/** Policarbonato/vidrio de guardas de seguridad. */
export function glass(tint = "#cfe6f5", opacity = 0.18): THREE.MeshPhysicalMaterial {
  return shared(`glass-${tint}-${opacity}`, () =>
    new THREE.MeshPhysicalMaterial({
      color: tint,
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity,
      transmission: 0,
      reflectivity: 0.15,
      specularIntensity: 0.25,
      envMapIntensity: 0.35,
      clearcoat: 0.2,
      clearcoatRoughness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

export function hazard(): THREE.MeshStandardMaterial {
  return shared("hazard", () => {
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, metalness: 0.1 });
    const t = hazardStripes();
    if (t) m.map = t;
    else m.color.set(SAFETY_YELLOW);
    return m;
  });
}

/** Plástico de pieza moldeada o de carcasa. */
export function plastic(color: string, roughness = 0.35): THREE.MeshPhysicalMaterial {
  return shared(`plastic-${color}-${roughness}`, () =>
    new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  );
}

/** Aislamiento con forro de aluminio (tuberías de vapor). */
export function insulationCladding(): THREE.MeshStandardMaterial {
  return shared("cladding", () => new THREE.MeshStandardMaterial({ color: "#b9bfc4", metalness: 0.75, roughness: 0.55 }));
}

/**
 * Material emisivo propio (no compartido) para luces que cambian en tiempo real:
 * balizas, resistencias calientes, pantallas, LEDs.
 */
export function emissive(color: string, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#1a1a1a",
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
  });
}

/** Producto líquido (salsa, aceite…): propio para poder cambiar color según temperatura. */
export function liquid(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
}

export function disposeSharedMaterials(): void {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
