/**
 * Panel flotante del gemelo 3D de plásticos con el emulador 2D y el Gantt del APS en miniatura. Cada pantalla es la
 * página completa en un iframe (mismo origen, `?embed=1` oculta el encabezado), así el instante del play llega por el
 * reloj compartido de aps-store.ts igual que en una pestaña aparte. Se puede minimizar, cerrar o maximizar la
 * pantalla activa en una ventana nueva.
 */
type Kind = "emu" | "gantt";
const SCREENS: Record<Kind, { label: string; src: string; full: string; w: number; h: number; scale: number }> = {
  emu: { label: "EMULADOR 2D", src: "/emulador.html?embed=1", full: "/emulador.html", w: 720, h: 400, scale: 0.78 },
  gantt: { label: "GANTT APS", src: "/aps.html?tab=gantt&embed=1", full: "/aps.html?tab=gantt", w: 1100, h: 620, scale: 0.51 },
};

let panel: HTMLElement | null = null;
let kind: Kind = "emu";

function paint(): void {
  if (!panel) return;
  const s = SCREENS[kind];
  const body = panel.querySelector<HTMLElement>(".tm-body")!;
  // En celular el panel ocupa toda la pantalla: la miniatura se escala al ancho disponible.
  const narrow = window.matchMedia("(max-width: 700px)").matches;
  const scale = narrow ? (window.innerWidth - 18) / s.w : s.scale;
  if (!narrow) body.style.width = `${Math.round(s.w * scale)}px`;
  body.style.height = `${Math.round(s.h * scale)}px`;
  const frame = body.querySelector<HTMLIFrameElement>("iframe")!;
  frame.style.cssText = `width:${s.w}px;height:${s.h}px;transform:scale(${scale})`;
  if (!frame.src.endsWith(s.src)) frame.src = s.src;
  // Zoom del Gantt fuera del iframe: en celular la miniatura se reduce y sus botones quedarían diminutos.
  panel.querySelector<HTMLElement>(".tm-zoom")!.hidden = kind !== "gantt";
  panel.querySelectorAll<HTMLButtonElement>("[data-k]").forEach((b) => b.classList.toggle("on", b.dataset.k === kind));
}

export function closeMini(): void {
  panel?.remove();
  panel = null;
}

/** Abre o cierra el panel (el botón del panel lateral lo alterna). */
export function toggleMini(): void {
  if (panel) return closeMini();
  panel = document.createElement("section");
  panel.className = "glass twin-mini";
  panel.innerHTML = `
    <div class="tm-head">
      <button data-k="emu" class="on">${SCREENS.emu.label}</button><button data-k="gantt">${SCREENS.gantt.label}</button>
      <span class="tm-zoom" hidden><button data-z="out" title="Alejar la línea de tiempo del Gantt">−</button><button data-z="in" title="Acercar la línea de tiempo del Gantt">+</button></span>
      <span class="tm-spacer"></span>
      <button id="tm-max" title="Maximizar en una ventana nueva">⤢</button>
      <button id="tm-min" title="Minimizar">▁</button>
      <button id="tm-close" title="Cerrar">✕</button>
    </div>
    <div class="tm-body"><iframe title="Pantalla en miniatura" ></iframe></div>`;
  document.body.appendChild(panel);
  panel.querySelectorAll<HTMLButtonElement>("[data-k]").forEach((b) => (b.onclick = () => ((kind = b.dataset.k as Kind), paint())));
  panel.querySelectorAll<HTMLButtonElement>("[data-z]").forEach(
    (b) => (b.onclick = () => panel!.querySelector("iframe")?.contentDocument?.getElementById(`g-zoom-${b.dataset.z}`)?.click()),
  );
  panel.querySelector<HTMLElement>("#tm-max")!.onclick = () => window.open(SCREENS[kind].full, "_blank", "noopener");
  panel.querySelector<HTMLElement>("#tm-min")!.onclick = () => panel!.classList.toggle("min");
  panel.querySelector<HTMLElement>("#tm-close")!.onclick = closeMini;
  paint();
}
