// Piezas comunes de la serie: la figura de tres capas (sello) y los colores de las cinco promesas.
export const PROMESAS = [
  { id: "controla", n: "Controla", c: "#f87171" },
  { id: "protege", n: "Protege", c: "#a78bfa" },
  { id: "organiza", n: "Organiza", c: "#34d399" },
  { id: "recuerda", n: "Recuerda", c: "#fbbf24" },
  { id: "rinde", n: "Rinde cuentas", c: "#22d3ee" },
];

/** Figura de tres capas: Enterprise arriba, núcleo con las cinco promesas y base que se conecta con todo. */
export function figura(id) {
  const IA = ["Claude", "ChatGPT", "Gemini", "Copilot", "Modelos privados"];
  const SIS = [["CRM", "sistema de clientes"], ["ERP", "sistema de gestión"], ["Nube", "sus servicios"], ["Archivos", "sus documentos"]];
  return `<div class="capas" id="${id}">
    <div class="capa ent" id="${id}-ent"><h3>Arvantti OS Enterprise</h3><p>Agentes, habilidades, voz y panel de dirección</p></div>
    <div class="capa nuc" id="${id}-nuc"><p class="ct">NÚCLEO · CINCO PROMESAS</p><div class="proms">${PROMESAS.map((p, i) => `<div class="prom" id="${id}-p${i}" style="--c:${p.c}">${p.n}</div>`).join("")}</div></div>
    <div class="capa base" id="${id}-base"><p class="ct">BASE · SE CONECTA CON TODO</p>
      <div class="fila">${IA.map((n, i) => `<span id="${id}-ia${i}">${n}</span>`).join("")}</div>
      <div class="fila sis">${SIS.map(([n, s], i) => `<span id="${id}-s${i}">${n}<small>${s}</small></span>`).join("")}<span class="pl" id="${id}-pl0">En el escritorio</span><span class="pl" id="${id}-pl1">En la nube</span></div></div>
  </div>`;
}

/** Enciende una promesa de la figura. */
export function promOn(c, id, i, t) {
  const p = PROMESAS[i];
  c.to(`#${id}-p${i}`, { opacity: 1, filter: "saturate(1)", boxShadow: `0 0 40px ${p.c}`, duration: 0.3 }, t);
}
