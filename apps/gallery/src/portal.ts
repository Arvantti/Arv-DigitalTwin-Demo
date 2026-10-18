/** Portada: elegir la planta. Cada tarjeta lleva a su escena 3D y a su librería de equipos filtrada. */
import "./styles.css";

interface PlantCard {
  id: string;
  family: string;
  title: string;
  text: string;
  extra?: { href: string; label: string };
}

const plants: PlantCard[] = [
  {
    id: "plastic-injection-plant-v1",
    family: "MANUFACTURA DISCRETA",
    title: "Planta de plásticos",
    text: "Inyectoras, moldes, secado, reciclaje y ensamble: piezas contables que avanzan por celdas y rutas.",
  },
  {
    id: "sauce-plant-v1",
    family: "MANUFACTURA DE PROCESOS",
    title: "Planta de salsas",
    text: "Cocción, emulsión, pasteurización, llenado, empaque y bodega: flujo continuo y por lotes con servicios de planta.",
  },
  {
    id: "water-network-scale-v1",
    family: "OPERACIONES",
    title: "Planta de acueducto",
    text: "Bombeo, estación reguladora y rejilla de distribución por pisos, con la presión de cada casa y el panel del PLC.",
    extra: { href: "/acueducto.html", label: "PANEL DEL PLC" },
  },
  {
    id: "airport-baggage-v1",
    family: "LOGÍSTICA",
    title: "Equipaje de aeropuerto",
    text: "Check-in, inspección CT por niveles, clasificador de bandejas y carruseles de armado y de reclamo: cada maleta seguida hasta el avión.",
  },
];

const root = document.getElementById("cards") as HTMLElement;
for (const p of plants) {
  const card = document.createElement("article");
  card.className = "portal-card glass";
  card.innerHTML = `
    <div class="label">${p.family}</div>
    <h2>${p.title}</h2>
    <p>${p.text}</p>
    <div class="portal-actions">
      <a class="btn primary" href="/plant.html?plant=${p.id}">VER LA PLANTA EN 3D</a>
      <a class="btn" href="/equipos.html?plant=${p.id}">EQUIPOS</a>
      ${p.extra ? `<a class="btn" href="${p.extra.href}">${p.extra.label}</a>` : ""}
    </div>`;
  root.appendChild(card);
}
