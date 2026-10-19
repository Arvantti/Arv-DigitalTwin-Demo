/**
 * Tablero del PLC de las bandas: una fila por banda simulada (`belt-conveyor`) con sus señales y sus mandos.
 *
 * Señales (del snapshot de la simulación): selector del operador (`run_enable`), salida de marcha al motor
 * (`run_signal`), fotoceldas de entrada y de descarga (`entry_eye`, `photo_eye`), zona de cabeza retenida
 * (`zone_stopped`), falla, velocidad real, corriente y maletas sobre la banda. Mandos (comandos del contrato):
 * START / STOP (`start`, `stop`) y consigna de velocidad (`set_speed`). Con control por zonas el PLC arranca y para
 * cada banda según sus fotoceldas; el selector del operador manda sobre eso.
 *
 * En el sitio publicado no hay API: el tablero muestra la grabación y los mandos quedan deshabilitados.
 */

export interface BeltRow {
  id: string;
  zone: string;
  speed: number;
}
type Snap = { state?: string; variables?: Record<string, number | string | null> };
export interface BeltPlcOptions {
  /** Manda un comando a un equipo; devuelve false si no hay simulación en vivo (grabación o desconectada). */
  send: (equipment: string, command: string, args: Record<string, unknown>) => boolean;
  /** Al hacer clic en el nombre de una banda (para seleccionarla en la escena). */
  select?: (id: string) => void;
}

const MIN_SPEED = 0.1;
const MAX_SPEED = 2.0;

export function createBeltPlc(root: HTMLElement, belts: BeltRow[], opts: BeltPlcOptions) {
  const setpoints = new Map(belts.map((b) => [b.id, b.speed]));
  root.innerHTML = `
    <div class="plc-head">
      <h3>PLC · CONTROL DE BANDAS</h3>
      <button class="plc-close" title="Cerrar">✕</button>
    </div>
    <div class="plc-note dim" data-note></div>
    <div class="plc-all">
      <button data-all="start">▶ START TODAS</button>
      <button data-all="stop">■ STOP TODAS</button>
    </div>
    <div class="plc-legend dim">
      <span><i class="led on"></i>MARCHA</span><span><i class="led en"></i>HABILITADA</span>
      <span><i class="led eye"></i>FC ENTRADA / DESCARGA</span><span><i class="led hold"></i>ZONA RETENIDA</span><span><i class="led bad"></i>FALLA</span>
    </div>
    <div class="plc-rows">${belts
      .map(
        (b) => `
      <div class="plc-row" data-id="${b.id}">
        <div class="plc-name"><a href="#" data-sel>${b.id.toUpperCase()}</a><span class="dim">${b.zone}</span></div>
        <div class="plc-leds">
          <i class="led" data-led="run" title="Marcha (salida al motor)"></i>
          <i class="led" data-led="enable" title="Habilitada por el operador"></i>
          <i class="led" data-led="entry" title="Fotocelda de entrada"></i>
          <i class="led" data-led="eye" title="Fotocelda de descarga"></i>
          <i class="led" data-led="hold" title="Zona de cabeza retenida (la siguiente banda no recibe)"></i>
          <i class="led" data-led="fault" title="Falla"></i>
        </div>
        <div class="plc-btns"><button data-cmd="start">START</button><button data-cmd="stop">STOP</button></div>
        <label class="plc-speed">
          <input type="range" min="${MIN_SPEED}" max="${MAX_SPEED}" step="0.05" value="${b.speed}" />
          <span data-sp>${b.speed.toFixed(2)}</span> m/s
        </label>
        <div class="plc-read dim"><span data-v="speed">—</span> m/s · <span data-v="amps">—</span> A · <span data-v="bags">—</span> mal.</div>
      </div>`,
      )
      .join("")}</div>`;

  const note = root.querySelector<HTMLElement>("[data-note]")!;
  const setNote = (text: string) => (note.textContent = text);
  setNote("Conecta ▶ SIMULAR para mandar las bandas. Consigna en m/s; las fotoceldas arrancan y paran cada banda.");
  root.querySelector<HTMLButtonElement>(".plc-close")!.onclick = () => root.classList.add("hidden");
  const command = (id: string, cmd: string, args: Record<string, unknown> = {}) => {
    if (!opts.send(id, cmd, args)) setNote("Sin simulación en vivo (grabación o desconectada): los mandos necesitan la API.");
  };
  for (const btn of root.querySelectorAll<HTMLButtonElement>("[data-all]"))
    btn.onclick = () => belts.forEach((b) => command(b.id, btn.dataset.all!));
  for (const row of root.querySelectorAll<HTMLElement>(".plc-row")) {
    const id = row.dataset.id!;
    row.querySelector<HTMLAnchorElement>("[data-sel]")!.onclick = (e) => {
      e.preventDefault();
      opts.select?.(id);
    };
    for (const btn of row.querySelectorAll<HTMLButtonElement>("[data-cmd]")) btn.onclick = () => command(id, btn.dataset.cmd!);
    const range = row.querySelector<HTMLInputElement>("input[type=range]")!;
    const label = row.querySelector<HTMLElement>("[data-sp]")!;
    range.oninput = () => (label.textContent = Number(range.value).toFixed(2));
    range.onchange = () => {
      const v = Number(range.value);
      setpoints.set(id, v);
      command(id, "set_speed", { m_s: v });
    };
  }

  const num = (v: unknown) => (typeof v === "number" ? v : null);
  function update(snaps: Record<string, Snap>): void {
    for (const row of root.querySelectorAll<HTMLElement>(".plc-row")) {
      const s = snaps[row.dataset.id!];
      const v = s?.variables ?? {};
      const led = (name: string, on: boolean, cls: string) => row.querySelector(`[data-led=${name}]`)?.classList.toggle(cls, on);
      led("run", num(v.run_signal) === 1, "on");
      led("enable", num(v.run_enable) !== 0 && s !== undefined, "en");
      led("entry", num(v.entry_eye) === 1, "eye");
      led("eye", num(v.photo_eye) === 1, "eye");
      led("hold", num(v.zone_stopped) === 1, "hold");
      led("fault", s?.state === "fault", "bad");
      row.classList.toggle("stopped", num(v.run_enable) === 0);
      const put = (k: string, x: number | null, d: number) => {
        const el = row.querySelector(`[data-v=${k}]`);
        if (el) el.textContent = x === null ? "—" : x.toFixed(d);
      };
      put("speed", num(v.speed_actual_m_s), 2);
      put("amps", num(v.motor_current_a), 1);
      put("bags", num(v.items_on_belt), 0);
    }
  }
  return { update, setNote, show: () => root.classList.remove("hidden"), toggle: () => root.classList.toggle("hidden") };
}
