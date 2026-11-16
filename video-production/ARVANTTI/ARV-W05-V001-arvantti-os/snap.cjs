// node snap.cjs <dir con index.html> <salida> t1 t2 ...  -> capturas para revisar cuadros sueltos
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const [dir, out, ...ts] = process.argv.slice(2);
  const b = await chromium.launch();
  const html = require("fs").readFileSync(path.join(dir, "index.html"), "utf8");
  const W = +html.match(/data-width="(\d+)"/)[1], H = +html.match(/data-height="(\d+)"/)[1];
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto("file://" + path.resolve(dir, "index.html"));
  await p.waitForTimeout(500);
  for (const t of ts) {
    await p.evaluate((t) => {
      const tl = window.__timelines.main; tl.seek(+t, false);
      document.querySelectorAll(".clip").forEach((c) => { const s = +c.dataset.start, d = +c.dataset.duration; c.style.visibility = t >= s && t < s + d ? "visible" : "hidden"; });
    }, t);
    await p.waitForTimeout(80);
    await p.screenshot({ path: `${out}-${t}.png` });
  }
  await b.close();
})();
