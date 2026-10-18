/**
 * Barra inferior para pantallas angostas: los paneles (menú, activo seleccionado, eventos) no caben juntos sobre la
 * escena, así que en móvil se ven de a uno, como una hoja sobre la barra. En escritorio no hace nada.
 */
const narrow = window.matchMedia("(max-width: 700px)");

function setup(): void {
  const panels: [string, string | null][] = [
    ["MENÚ", "sidebar"],
    ["ACTIVO", document.getElementById("right-col") ? "right-col" : document.getElementById("hud") ? "hud" : null],
    ["EVENTOS", "events-panel"],
  ];
  const available = panels.filter(([, id]) => id && document.getElementById(id)) as [string, string][];
  if (!available.length) return;
  document.body.classList.add("has-dock");
  const dock = document.createElement("nav");
  dock.className = "dock glass";
  const buttons = new Map<string, HTMLButtonElement>();
  const open = (id: string | null): void => {
    document.body.dataset.panel = id ?? "";
    for (const [pid, b] of buttons) b.classList.toggle("active", pid === id);
  };
  for (const [label, id] of available) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => open(document.body.dataset.panel === id ? null : id));
    buttons.set(id, b);
    dock.appendChild(b);
  }
  document.body.appendChild(dock);
  open(null);
  // al elegir un equipo en la escena se abre su ficha
  const name = document.getElementById("asset-name");
  const hud = available.find(([label]) => label === "ACTIVO");
  if (name && hud) new MutationObserver(() => narrow.matches && !/^haz clic/i.test(name.textContent ?? "") && open(hud[1])).observe(name, { childList: true, characterData: true, subtree: true });
}

setup();
