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
  /** Página propia en lugar de la escena 3D (gemelos sin vista 3D todavía). */
  main?: { href: string; label: string };
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
    extra: { href: "/plc.html?plant=water-network-scale-v1&screen=day", label: "PLC MASTER" },
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
  {
    id: "garment-factory-v1",
    image: "/portal/confecciones.svg",
    alt: "Vista esquemática del gemelo digital de confecciones",
    family: "MANUFACTURA DISCRETA",
    title: "Fábrica de confecciones",
    text: "Corte y almacén de tela, tres módulos con 15 máquinas de costura, inspección y bodega de producto terminado. SAM de referencia para camisetas Polo y Oversize.",
    noLibrary: true,
  },
  {
    id: "centro-medellin-v1",
    image: "/portal/ciudad.jpg",
    alt: "Plano de la red vial del centro de Medellín con carreras, calles y semáforos",
    family: "MOVILIDAD URBANA",
    title: "Gemelo de ciudad",
    text: "Centro de Medellín con 35 cruces y 20 semáforos: un día completo de tráfico en SUMO, con motos entre carriles, afán según la hora y ruta crítica.",
    main: { href: "/ciudad.html", label: "VER EL PLANO Y LOS INDICADORES" },
    noLibrary: true,
  },
];

const root = document.getElementById("cards") as HTMLElement;
for (const p of plants) {
  const main = p.main ?? { href: `/plant.html?plant=${p.id}`, label: "VER LA PLANTA EN 3D" };
  const card = document.createElement("article");
  card.className = "portal-card glass";
  card.innerHTML = `
    <a class="portal-media" href="${main.href}" tabindex="-1"><img src="${p.image}" alt="${p.alt}" loading="lazy" width="960" height="540" /></a>
    <div class="label">${p.family}</div>
    <h2>${p.title}</h2>
    <p>${p.text}</p>
    <div class="portal-actions">
      <a class="btn primary" href="${main.href}">${main.label}</a>
      ${p.noLibrary ? "" : `<a class="btn" href="/equipos.html?plant=${p.id}">EQUIPOS</a>`}
      ${p.extra ? `<a class="btn" href="${p.extra.href}">${p.extra.label}</a>` : ""}
    </div>`;
  root.appendChild(card);
}
