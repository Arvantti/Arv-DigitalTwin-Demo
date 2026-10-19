/** Portada: elegir la planta. Cada tarjeta lleva a su escena 3D y a su librería de equipos filtrada. */
import "./styles.css";

interface PlantCard {
  id: string;
  family: string;
  title: string;
  /** Captura de la escena 3D en public/portal/. */
  image: string;
  alt: string;
  text: string;
  extra?: { href: string; label: string };
  /** Sin tipos de librería simulados todavía: no se ofrece la librería filtrada. */
  noLibrary?: boolean;
}

const plants: PlantCard[] = [
  {
    id: "plastic-injection-plant-v1",
    image: "/portal/plasticos.jpg",
    alt: "Escena 3D de la planta de plásticos con inyectoras y celdas de ensamble",
    family: "MANUFACTURA DISCRETA",
    title: "Planta de plásticos",
    text: "Inyectoras, moldes, secado, reciclaje y ensamble: piezas contables que avanzan por celdas y rutas.",
  },
  {
    id: "sauce-plant-v1",
    image: "/portal/salsas.jpg",
    alt: "Escena 3D de la planta de salsas con tanques, llenado y empaque",
    family: "MANUFACTURA DE PROCESOS",
    title: "Planta de salsas",
    text: "Cocción, emulsión, pasteurización, llenado, empaque y bodega: flujo continuo y por lotes con servicios de planta.",
  },
  {
    id: "water-network-scale-v1",
    image: "/portal/acueducto.jpg",
    alt: "Escena 3D del acueducto a escala con bombeo y rejilla por pisos",
    family: "OPERACIONES",
    title: "Planta de acueducto",
    text: "Bombeo, estación reguladora y rejilla de distribución por pisos, con la presión de cada casa y el panel del PLC.",
    extra: { href: "/acueducto.html", label: "PANEL DEL PLC" },
  },
  {
    id: "airport-baggage-v1",
    image: "/portal/aeropuerto.jpg",
    alt: "Escena 3D del sistema de equipaje del aeropuerto con bandas y clasificador",
    family: "LOGÍSTICA",
    title: "Equipaje de aeropuerto",
    text: "Check-in, inspección CT por niveles, clasificador de bandejas y carruseles de armado y de reclamo: cada maleta seguida hasta el avión.",
  },
  {
    id: "corrugated-box-plant-v1",
    image: "/portal/cajas.jpg",
    alt: "Escena 3D de la fábrica de cajas con corrugadora y transporte de pilas",
    family: "MANEJO DE MATERIALES",
    title: "Fábrica de cajas",
    text: "Corrugadora, transporte de pilas con carro de transferencia y pulmón, conversión, paletizado y bodega de cartón corrugado.",
  },
];

const root = document.getElementById("cards") as HTMLElement;
for (const p of plants) {
  const card = document.createElement("article");
  card.className = "portal-card glass";
  card.innerHTML = `
    <a class="portal-media" href="/plant.html?plant=${p.id}" tabindex="-1"><img src="${p.image}" alt="${p.alt}" loading="lazy" width="960" height="540" /></a>
    <div class="label">${p.family}</div>
    <h2>${p.title}</h2>
    <p>${p.text}</p>
    <div class="portal-actions">
      <a class="btn primary" href="/plant.html?plant=${p.id}">VER LA PLANTA EN 3D</a>
      ${p.noLibrary ? "" : `<a class="btn" href="/equipos.html?plant=${p.id}">EQUIPOS</a>`}
      ${p.extra ? `<a class="btn" href="${p.extra.href}">${p.extra.label}</a>` : ""}
    </div>`;
  root.appendChild(card);
}
