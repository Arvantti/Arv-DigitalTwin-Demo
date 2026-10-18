/**
 * Pantalla de carga de la escena de planta: una barra que avanza por las etapas reales del arranque (plano, zonas,
 * equipos, tuberías, luces, primer cuadro), para que la espera inicial no parezca un error.
 */
const el = () => document.getElementById("boot");

/** Cede el hilo para que el navegador pinte la etapa antes de que empiece el trabajo pesado y síncrono. */
export function tick(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export async function bootStage(percent: number, text: string): Promise<void> {
  const root = el();
  if (!root) return;
  const bar = root.querySelector<HTMLElement>(".boot-fill");
  const label = root.querySelector<HTMLElement>(".boot-stage");
  const value = root.querySelector<HTMLElement>(".boot-pct");
  if (bar) bar.style.width = `${percent}%`;
  if (label) label.textContent = text;
  if (value) value.textContent = `${Math.round(percent)} %`;
  await tick();
}

export function bootError(text: string): void {
  const root = el();
  if (!root) return;
  root.classList.add("error");
  const label = root.querySelector<HTMLElement>(".boot-stage");
  if (label) label.textContent = text;
}

export function bootDone(): void {
  const root = el();
  if (!root) return;
  void bootStage(100, "Listo");
  root.classList.add("done");
  setTimeout(() => root.remove(), 600);
}
