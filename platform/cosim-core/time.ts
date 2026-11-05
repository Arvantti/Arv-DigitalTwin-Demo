/**
 * Reloj y calendario del cosimulador (plataforma, común a todas las plantas).
 *
 * Los tiempos se manejan en minutos de hora local de la planta contados desde 1970-01-01 00:00 (sin zona). Así un
 * turno de 06:00 a 14:00 es siempre el mismo número de minutos dentro del día y no hay que pensar en husos al
 * calcular. La zona solo aparece al escribir las fechas ISO del contrato ("2026-11-04T06:00-05:00").
 */

export const DAY_MIN = 1440;

export interface Shift {
  name: string;
  start: string;
  end: string;
}

/** "06:30" → 390. */
export const hm = (text: string): number => {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "2026-11-04" o "2026-11-04T06:30" (sin zona; si trae zona se ignora) → minutos locales. */
export function parseLocal(text: string): number {
  const date = text.slice(0, 10);
  const time = text.length > 10 ? text.slice(11, 16) : "00:00";
  return Date.parse(`${date}T${time}:00Z`) / 60000;
}

/** Minutos locales → "2026-11-04T06:30-05:00". */
export function iso(t: number, tz: string): string {
  return `${new Date(Math.round(t) * 60000).toISOString().slice(0, 16)}${tz}`;
}

/** Minutos locales → "2026-11-04". */
export const dateOf = (t: number): string => new Date(Math.floor(t / DAY_MIN) * DAY_MIN * 60000).toISOString().slice(0, 10);

/** Día ISO de la semana (lunes = 1 … domingo = 7) de unos minutos locales. */
export const weekday = (t: number): number => ((Math.floor(t / DAY_MIN) + 3) % 7) + 1;

/** Turnos de trabajo de la planta: días laborables y franjas. */
export class Calendar {
  readonly spans: [number, number][];
  readonly workdays: number[];
  readonly shifts: Shift[];
  constructor(workdays: number[], shifts: Shift[]) {
    this.workdays = workdays;
    this.shifts = shifts;
    this.spans = shifts.map((s) => [hm(s.start), hm(s.end)]);
  }

  isWorkday(t: number): boolean {
    return this.workdays.includes(weekday(t));
  }

  /** Turnos (inicio, fin, nombre) que empiezan entre a y b. */
  shiftsBetween(a: number, b: number): { start: number; end: number; name: string }[] {
    const out: { start: number; end: number; name: string }[] = [];
    for (let d = Math.floor(a / DAY_MIN) * DAY_MIN; d < b; d += DAY_MIN) {
      if (!this.isWorkday(d)) continue;
      this.spans.forEach(([s, e], i) => {
        if (d + s >= a && d + s < b) out.push({ start: d + s, end: d + e, name: this.shifts[i].name });
      });
    }
    return out;
  }

  /** Minutos de trabajo entre a y b. */
  workBetween(a: number, b: number): number {
    let total = 0;
    for (let d = Math.floor(a / DAY_MIN) * DAY_MIN; d < b; d += DAY_MIN) {
      if (!this.isWorkday(d)) continue;
      for (const [s, e] of this.spans) total += Math.max(0, Math.min(b, d + e) - Math.max(a, d + s));
    }
    return total;
  }

  /** Primer instante de trabajo en o después de t. */
  nextWork(t: number): number {
    for (let d = Math.floor(t / DAY_MIN) * DAY_MIN; d < t + 30 * DAY_MIN; d += DAY_MIN) {
      if (!this.isWorkday(d)) continue;
      for (const [s, e] of this.spans) if (d + e > t) return Math.max(t, d + s);
    }
    return t;
  }

  /** Instante en que se completan `work` minutos de trabajo contando desde t, saltando lo que esté en `blocked`. */
  advance(t: number, work: number, blocked: [number, number][] = []): number {
    let cur = t;
    let left = work;
    for (let guard = 0; guard < 10000; guard++) {
      cur = this.nextWork(cur);
      const stop = blocked.find(([a, b]) => cur >= a && cur < b);
      if (stop) {
        cur = stop[1];
        continue;
      }
      const d = Math.floor(cur / DAY_MIN) * DAY_MIN;
      const span = this.spans.find(([s, e]) => cur >= d + s && cur < d + e)!;
      let end = d + span[1];
      const next = blocked.filter(([a]) => a > cur).reduce((m, [a]) => Math.min(m, a), Infinity);
      end = Math.min(end, next);
      if (left <= end - cur) return cur + left;
      left -= end - cur;
      cur = end;
    }
    return cur + left;
  }
}

/** Semilla reproducible a partir de un texto (FNV-1a) y generador mulberry32. */
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
