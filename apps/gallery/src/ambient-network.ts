import "./ambient-network.css";

/** Fondo ambiental común: red de nodos azul/naranja, adaptada del home de arvantti.tech. */
if (typeof window !== "undefined" && typeof document !== "undefined" && !document.getElementById("ambient-network-canvas")) {
  const canvas = document.createElement("canvas");
  canvas.id = "ambient-network-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.remove();
  } else {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0.5, y: 0.5, active: false };
    const nodes: { x: number; y: number; homeX: number; homeY: number; vx: number; vy: number }[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = 0;
    let recovery = 0;
    let running = false;
    let idleReleaseTimer = 0;

    const createNodes = () => {
      const baseCount = Math.min(112, Math.max(52, Math.round((width * height) / 14_000)));
      const count = Math.round(baseCount * 4);
      canvas.dataset.nodeCount = String(count);
      nodes.length = 0;
      for (let index = 0; index < count; index += 1) {
        const x = Math.random();
        const y = Math.random();
        nodes.push({ x, y, homeX: x, homeY: y, vx: (Math.random() - 0.5) * 0.0015, vy: (Math.random() - 0.5) * 0.0015 });
      }
    };

    const drawNetwork = () => {
      if (pointer.active && !reduceMotion.matches) {
        const x = pointer.x * width;
        const y = pointer.y * height;
        const glow = context.createRadialGradient(x, y, 0, x, y, Math.min(width * 0.23, 300));
        glow.addColorStop(0, "rgba(45,127,249,.075)");
        glow.addColorStop(1, "rgba(45,127,249,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      }

      const reach = Math.max(118, Math.min(174, width * 0.135));
      context.lineWidth = 1;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (a.x - b.x) * width;
          const dy = (a.y - b.y) * height;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < reach) {
            context.strokeStyle = `rgba(45,127,249,${0.2 * (1 - distance / reach)})`;
            context.beginPath();
            context.moveTo(a.x * width, a.y * height);
            context.lineTo(b.x * width, b.y * height);
            context.stroke();
          }
        }
      }

      nodes.forEach((node, index) => {
        const isAccentNode = index % 6 === 0;
        context.fillStyle = isAccentNode ? "rgba(240,90,40,.84)" : "rgba(45,127,249,.5)";
        context.beginPath();
        context.arc(node.x * width, node.y * height, isAccentNode ? 3 : 1.8, 0, Math.PI * 2);
        context.fill();
      });
    };

    const draw = (timestamp = 0) => {
      if (reduceMotion.matches) {
        context.clearRect(0, 0, width, height);
        drawNetwork();
        return;
      }

      const delta = (lastFrame ? Math.min((timestamp - lastFrame) / 16.67, 2) : 1) * 0.75;
      lastFrame = timestamp;
      context.clearRect(0, 0, width, height);

      nodes.forEach((node) => {
        if (pointer.active) {
          const dx = pointer.x - node.x;
          const dy = pointer.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const radius = 0.27;
          if (distance < radius) {
            const influence = (1 - distance / radius) ** 2;
            const pull = influence * 0.00038 * delta;
            node.vx += (dx / distance) * pull;
            node.vy += (dy / distance) * pull;
          }
        }
        const homeStrength = pointer.active ? 0.00012 : 0.005 + recovery * 0.008;
        node.vx += (node.homeX - node.x) * homeStrength * delta;
        node.vy += (node.homeY - node.y) * homeStrength * delta;
        node.x += node.vx * delta;
        node.y += node.vy * delta;
        const damping = pointer.active ? 0.99 : 0.83;
        node.vx *= damping;
        node.vy *= damping;
        if (node.x < 0 || node.x > 1) { node.x = Math.min(1, Math.max(0, node.x)); node.vx *= -0.55; }
        if (node.y < 0 || node.y > 1) { node.y = Math.min(1, Math.max(0, node.y)); node.vy *= -0.55; }
      });
      recovery *= 0.92;
      drawNetwork();
    };

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      createNodes();
      draw();
    };
    const tick = (timestamp: number) => {
      if (!running) return;
      if (timestamp - lastFrame >= 30) draw(timestamp);
      frame = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || reduceMotion.matches || document.hidden) return;
      running = true;
      lastFrame = 0;
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
    const releasePointerInfluence = () => {
      idleReleaseTimer = 0;
      pointer.active = false;
      recovery = 1;
      canvas.dataset.pointerState = "released";
      if (!running && !reduceMotion.matches) start();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reduceMotion.matches) return;
      pointer.x = Math.max(0, Math.min(1, event.clientX / width));
      pointer.y = Math.max(0, Math.min(1, event.clientY / height));
      pointer.active = true;
      recovery = 0;
      canvas.dataset.pointerState = "active";
      window.clearTimeout(idleReleaseTimer);
      idleReleaseTimer = window.setTimeout(releasePointerInfluence, 2_000);
      if (!running) { draw(); start(); }
    };
    const onPointerLeave = () => {
      window.clearTimeout(idleReleaseTimer);
      idleReleaseTimer = 0;
      pointer.active = false;
      recovery = 1;
      canvas.dataset.pointerState = "released";
    };
    const onMotionChange = () => {
      if (reduceMotion.matches) {
        window.clearTimeout(idleReleaseTimer);
        idleReleaseTimer = 0;
        stop();
        pointer.active = false;
        canvas.dataset.pointerState = "reduced-motion";
        draw();
      } else start();
    };
    const onVisibilityChange = () => document.hidden ? stop() : start();

    resize();
    start();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    reduceMotion.addEventListener?.("change", onMotionChange);
    window.addEventListener("blur", onPointerLeave);
  }
}
