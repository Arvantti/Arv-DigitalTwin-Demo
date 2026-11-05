/**
 * Tiempos de cambio entre referencias, leídos de una tabla de datos (catalog/changeovers.yaml de cada planta).
 *
 * Una tabla dice cuánto toma pasar de una clase a otra (color → color, resina → resina, receta → receta, grupo de
 * alérgeno → grupo de alérgeno). Un cambio real puede tener varias partes: unas se hacen una tras otra (montar el
 * molde y después purgar; vaciar la marmita y después hacer CIP) y otras se cubren entre sí (la purga de resina ya
 * arrastra el color viejo). Qué partes van en serie y cuáles se cubren lo decide el modelo de cada planta.
 */
import type { ChangeoverKind } from "./contracts.ts";

export interface PairTable {
  /** Minutos para un par que no está en la tabla. */
  default_min: number;
  /** De → a → minutos. La misma clase no cambia (0 min) salvo que la tabla diga otra cosa. */
  pairs?: Record<string, Record<string, number>>;
}

/** Minutos para pasar de `from` a `to`. Sin clase anterior (máquina limpia) no hay cambio. */
export function pairMin(table: PairTable, from: string | null | undefined, to: string): number {
  if (from == null) return 0;
  const listed = table.pairs?.[from]?.[to];
  if (listed !== undefined) return listed;
  return from === to ? 0 : table.default_min;
}

export interface ChangeoverPart {
  kind: ChangeoverKind;
  min: number;
}

export interface Changeover {
  min: number;
  /** La parte más larga, la que "manda" en el cambio; sin cambio, undefined. */
  kind?: ChangeoverKind;
}

/** Suma las partes en serie y toma la más larga de las que se cubren entre sí. */
export function combine(serial: ChangeoverPart[], overlapping: ChangeoverPart[] = []): Changeover {
  const cover = overlapping.reduce<ChangeoverPart | null>((a, b) => (b.min > (a?.min ?? 0) ? b : a), null);
  const parts = [...serial, ...(cover ? [cover] : [])].filter((p) => p.min > 0);
  if (!parts.length) return { min: 0 };
  const lead = parts.reduce((a, b) => (b.min > a.min ? b : a));
  return { min: parts.reduce((s, p) => s + p.min, 0), kind: lead.kind };
}

/**
 * Tiempo de espera: un producto intermedio (una salsa en el pulmón) solo se puede usar durante `holdMin` minutos
 * desde que se terminó. Devuelve cuántos minutos le quedan en `at` (negativo: vencido).
 */
export const holdLeft = (madeAt: number, holdMin: number, at: number): number => madeAt + holdMin - at;
