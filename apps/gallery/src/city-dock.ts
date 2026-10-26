/**
 * Barra inferior del gemelo de ciudad en pantallas angostas: el panel de información y el de reproducción no caben
 * sobre el mapa, así que se abren de a uno desde la barra (como en las plantas). En escritorio la barra no se ve.
 */
const panels: [string, string][] = [
  ["INFORMACIÓN", "info"],
  ["SIMULACIÓN", "sim"],
];
const dock = document.createElement("nav");
dock.className = "city-dock glass";
dock.setAttribute("aria-label", "Paneles del mapa");
const buttons = new Map<string, HTMLButtonElement>();
const openPanel = (id: string | null): void => {
  document.body.dataset.panel = id ?? "";
  for (const [pid, b] of buttons) {
    b.classList.toggle("active", pid === id);
    b.setAttribute("aria-pressed", String(pid === id));
  }
};
for (const [label, id] of panels) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => openPanel(document.body.dataset.panel === id ? null : id));
  buttons.set(id, b);
  dock.appendChild(b);
}
document.body.appendChild(dock);
openPanel(null);
export {};
