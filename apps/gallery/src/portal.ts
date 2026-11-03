/** Portada: elegir la planta. Cada tarjeta lleva a su escena 3D y a su librería de equipos filtrada. */
import "./styles.css";
import "./portal.css";
import { mountUniverse } from "./universe";

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
  /** Color de acento de la tarjeta (por familia de manufactura). */
  accent?: string;
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
    extra: { href: "/resumen-plasticos.html", label: "RESUMEN GERENCIAL" },
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
    extra: { href: "/plant.html?plant=water-network-scale-v1&workspace=plc", label: "PLC MASTER EN 3D" },
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
    image: "/portal/confecciones.jpg",
    alt: "Captura de la escena 3D de la fábrica de confecciones",
    family: "MANUFACTURA DISCRETA",
    title: "Fábrica de confecciones",
    text: "Corte y almacén de tela, tres módulos con 15 máquinas de costura, inspección y bodega de producto terminado. SAM de referencia para camisetas Polo y Oversize.",
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

const FAMILY: Record<string, { color: string; glyph: string }> = {
  "MANUFACTURA DISCRETA": { color: "#4ea7ff", glyph: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" },
  "MANUFACTURA DE PROCESOS": { color: "#2fd27a", glyph: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  OPERACIONES: { color: "#ffb000", glyph: "M3 12h4l2-5 4 10 2-5h6" },
  "LOGÍSTICA": { color: "#a77bff", glyph: "M3 12h14M13 6l6 6-6 6" },
  "MANEJO DE MATERIALES": { color: "#ff7ab8", glyph: "M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4" },
  "MOVILIDAD URBANA": { color: "#22d3ee", glyph: "M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM10 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0" },
};

const root = document.getElementById("cards") as HTMLElement;
plants.forEach((p, i) => {
  const main = p.main ?? { href: `/plant.html?plant=${p.id}`, label: "VER LA PLANTA EN 3D" };
  const fam = FAMILY[p.family] ?? { color: "#4ea7ff", glyph: "M12 3l8 4.5v9L12 21l-8-4.5v-9z" };
  const card = document.createElement("article");
  card.className = `gcard${i === 0 || i === plants.length - 1 ? " wide" : ""}`;
  card.style.setProperty("--c", fam.color);
  card.innerHTML = `
    <div class="gcard-in">
      <a class="gcard-media" href="${main.href}" tabindex="-1"><img src="${p.image}" alt="${p.alt}" loading="lazy" width="960" height="540" /><span class="gcard-scan"></span></a>
      <div class="gcard-body">
        <span class="gcard-hex" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${fam.glyph}"/></svg></span>
        <div class="label">${p.family}</div>
        <h3>${p.title}</h3>
        <p>${p.text}</p>
        <div class="portal-actions">
          <a class="btn primary" href="${main.href}">${main.label}</a>
          ${p.noLibrary ? "" : `<a class="btn" href="/equipos.html?plant=${p.id}">EQUIPOS</a>`}
          ${p.extra ? `<a class="btn" href="${p.extra.href}">${p.extra.label}</a>` : ""}
        </div>
      </div>
    </div>`;
  // Inclinación 3D y haz de luz que siguen al puntero (solo con mouse y sin movimiento reducido).
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${((0.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--rx", "0deg");
    });
  }
  root.appendChild(card);
});

mountUniverse(document.getElementById("universe") as HTMLCanvasElement);
