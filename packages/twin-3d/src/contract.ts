import type * as THREE from "three";

/** Parámetros resueltos de un equipo (los mismos que usa su behavior.py). */
export type Params = Record<string, unknown>;

/** Lo que el comportamiento publica en cada muestra y la geometría lee para animarse. */
export interface AnimationFrame {
  /** Canales declarados en animation_channels del equipment.yaml. */
  channels: Record<string, number>;
  /** Estado operativo (running, idle, fault…). */
  state: string;
  /** Fase interna, si la hay. */
  phase?: string | null;
  /** Variables del contrato (para pantallas HMI y etiquetas). Opcional. */
  variables?: Record<string, number | string | null>;
  /** Identificador visible del equipo (p. ej. IMM-03). */
  label?: string;
}

/**
 * Modelo 3D de un equipo construido a partir de sus parámetros.
 *
 * Convenciones (iguales para toda la librería):
 *  - Unidades en metros. +Y hacia arriba.
 *  - El origen está en el piso, en el centro de la huella del equipo.
 *  - El eje largo del equipo va sobre +X (footprint dx); el lado del operador mira a +Z.
 *  - El modelo NUNCA es fuente de verdad: solo refleja lo que llega en AnimationFrame.
 */
export interface EquipmentModel {
  root: THREE.Group;
  /** Huella que ocupa en planta y altura total, en metros. */
  size: { dx: number; dy: number; height: number };
  /** Aplica un frame de simulación. dt en segundos de reloj real (para giros continuos). */
  update(frame: AnimationFrame, dt: number): void;
  /** Libera geometrías y materiales propios. */
  dispose(): void;
}

export type GeometryBuilder = (params: Params) => EquipmentModel;

/** Lee un parámetro numérico con valor por defecto. */
export function num(params: Params, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function str(params: Params, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

export function bool(params: Params, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

/** Canal de animación con valor por defecto (si la simulación no está conectada). */
export function ch(frame: AnimationFrame, key: string, fallback = 0): number {
  const v = frame.channels[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
