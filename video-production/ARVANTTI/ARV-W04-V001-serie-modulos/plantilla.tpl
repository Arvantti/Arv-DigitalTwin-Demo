<!doctype html>
<html lang="es" data-resolution="portrait">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, height=1920">
<title>Arvantti · serie de módulos</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
:root{--blue:#2d7ff9;--electric:#4ea7ff;--ti:#d8dadf;--dti:#7a7e86;--black:#05070c;--white:#f8fafc;--red:#ff5a5f}
*{box-sizing:border-box}
html,body{width:1080px;height:1920px;margin:0;overflow:hidden;background:var(--black);font-family:Inter,"Inter Display",Arial,sans-serif;color:var(--white)}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:var(--black)}
.clip{position:absolute;inset:0}
.scene{overflow:hidden}
.w{display:inline-block;white-space:pre}

/* Fondo */
.fondo .glow{position:absolute;inset:-20%;background:radial-gradient(700px 900px at 50% 45%,#12305e55 0%,#05070c00 70%),radial-gradient(500px 600px at 80% 90%,#2d7ff922 0%,#05070c00 70%)}
.fondo .floor{position:absolute;left:-50%;right:-50%;bottom:-10%;height:40%;perspective:900px;opacity:.5;-webkit-mask-image:linear-gradient(#0000,#000 55%);mask-image:linear-gradient(#0000,#000 55%)}
.fondo .floorgrid{position:absolute;inset:0;transform:rotateX(68deg);transform-origin:50% 100%;background-image:linear-gradient(#4ea7ff33 2px,transparent 2px),linear-gradient(90deg,#4ea7ff33 2px,transparent 2px);background-size:120px 120px}

/* Imagen o video a sangre */
.bleed{position:absolute;inset:0;overflow:hidden}
.bleed img,.bleed video{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;transform-origin:50% 50%}
.bleed.dim img{filter:blur(8px) brightness(.28) saturate(.7)}
.shade{position:absolute;inset:0;background:linear-gradient(#05070ccc 0%,#05070c33 28%,#05070c00 45%,#05070c55 68%,#05070cf2 86%)}
.shade.fuerte{background:linear-gradient(#05070cdd 0%,#05070c88 35%,#05070c88 65%,#05070cf2 86%)}

/* Textos */
.kicker{margin:0;font:600 26px "JetBrains Mono",monospace;letter-spacing:6px;color:var(--electric)}
.kicker b{display:inline-block;padding:4px 12px;margin-right:12px;border:2px solid var(--blue);color:#fff;font-weight:700;letter-spacing:2px}
.top{position:absolute;left:70px;right:70px;top:250px}
.hook{position:absolute;left:60px;right:60px;top:330px;margin:0;font:800 104px/1.04 "Inter Display",Inter,sans-serif;letter-spacing:-2.5px;text-shadow:0 6px 50px #000c}
.tag3d{position:absolute;left:70px;top:1040px;padding:16px 28px;border:2px solid var(--electric);background:#0b1a33cc;font:700 34px "JetBrains Mono",monospace;letter-spacing:4px;color:#fff;box-shadow:0 0 40px #2d7ff988;opacity:0}
.tag3d i{display:inline-block;width:14px;height:14px;margin-right:14px;border-radius:50%;background:#37e38b;box-shadow:0 0 12px #37e38b;vertical-align:middle}

/* HUD del gemelo */
.hud{position:absolute;inset:40px 30px;pointer-events:none}
.hud .c{position:absolute;width:70px;height:70px;border:3px solid #4ea7ffcc}
.hud .tl{left:0;top:0;border-right:0;border-bottom:0}.hud .tr{right:0;top:0;border-left:0;border-bottom:0}
.hud .bl{left:0;bottom:0;border-right:0;border-top:0}.hud .br{right:0;bottom:0;border-left:0;border-top:0}
.hud .live{position:absolute;right:20px;top:24px;margin:0;font:600 18px "JetBrains Mono",monospace;letter-spacing:3px;color:#9fd0ff}

/* Ventanas del gancho (Integrator) */
.win{position:absolute;width:400px;height:250px;border-radius:14px;background:#f4f6fa;color:#1d2433;box-shadow:0 30px 80px #000c,0 0 0 1px #ffffff55;overflow:hidden;opacity:0}
.win .wb{height:44px;display:flex;align-items:center;gap:8px;padding:0 14px;font:700 22px Inter,sans-serif;color:#fff}
.win .wb i{width:12px;height:12px;border-radius:50%;background:#ffffff88}
.win .wc{padding:14px 16px;font:500 19px/1.45 Inter,sans-serif}
.win .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}
.win .grid span{height:24px;background:#dfe6f1}
.win .grid span:nth-child(3n){background:#c8e6c9}
.flash{position:absolute;left:540px;top:900px;width:20px;height:20px;margin:-10px;border-radius:50%;background:#fff;box-shadow:0 0 80px 40px #4ea7ff;opacity:0}

/* Dolor: tarjetas por industria */
.ind .bleed img{filter:brightness(.55) saturate(.9)}
.ind .lab{position:absolute;left:70px;top:250px}
.ind .lab .n{font:700 26px "JetBrains Mono",monospace;color:#9fd0ff;letter-spacing:4px}
.ind .lab h3{margin:12px 0 0;font:800 76px "Inter Display",Inter,sans-serif;letter-spacing:-1.5px}
.ind blockquote{position:absolute;left:70px;right:70px;top:560px;margin:0;padding:40px 44px;border-left:8px solid var(--electric);background:#05070cb8;font:700 58px/1.22 "Inter Display",Inter,sans-serif;letter-spacing:-.5px;box-shadow:0 30px 80px #000a}
.remate{position:absolute;left:70px;right:70px;top:1130px;text-align:center;font:800 70px "Inter Display",Inter,sans-serif;color:var(--red);text-shadow:0 0 40px #000;opacity:0}
.repetir{position:absolute;left:0;right:0;top:520px;text-align:center}
.repetir p{margin:0 0 30px;font:800 120px/1 "Inter Display",Inter,sans-serif;letter-spacing:-3px;opacity:0}
.repetir p:nth-child(3){color:var(--electric)}

/* Solución: gemelo */
.label{position:absolute;left:70px;top:1120px;margin:0;font:800 100px "Inter Display",Inter,sans-serif;letter-spacing:-1px;text-shadow:0 4px 40px #000;opacity:0}
.titular{position:absolute;left:70px;right:70px;top:340px;margin:0;font:800 96px/1.02 "Inter Display",Inter,sans-serif;letter-spacing:-2px;text-shadow:0 6px 50px #000c}
.play{position:absolute;left:440px;top:760px;width:200px;height:200px;opacity:0}
.play svg{width:200px;height:200px}
.play circle{fill:#05070c88;stroke:#4ea7ff;stroke-width:3}
.play path{fill:#fff}
.scrub{position:absolute;left:90px;right:90px;top:1300px;height:6px;background:#ffffff22;opacity:0}
.scrub i{position:absolute;inset:0;background:linear-gradient(90deg,#2d7ff9,#4ea7ff);transform-origin:left;box-shadow:0 0 14px #4ea7ff}
.cut{opacity:0}

/* Solución: Integrator */
.net{position:absolute;inset:0;width:1080px;height:1920px}
.net line{stroke:#ff5a5f;stroke-width:4;stroke-dasharray:14 12;opacity:0}
.net line.ok{stroke:#4ea7ff;stroke-dasharray:1;stroke-dashoffset:1;opacity:1;filter:drop-shadow(0 0 8px #4ea7ff)}
.net .pk{fill:#fff;filter:drop-shadow(0 0 8px #4ea7ff);opacity:0}
.sys{position:absolute;width:420px;padding:22px 26px;border-radius:16px;background:#0d1a30ee;border:2px solid #4ea7ff88;box-shadow:0 0 30px #2d7ff933;opacity:0}
.sys b{display:block;font:800 60px "Inter Display",Inter,sans-serif}
.sys small{display:block;margin-top:6px;font:500 26px/1.3 Inter,sans-serif;color:#b9c8dd}
.cross{position:absolute;font:800 90px Inter,sans-serif;color:var(--red);opacity:0;text-shadow:0 0 30px #ff5a5f88}
.core{position:absolute;left:390px;top:1010px;width:300px;height:300px;border-radius:50%;background:radial-gradient(#13284d,#0a1222);border:3px solid var(--electric);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:0 0 80px #2d7ff966,inset 0 0 60px #2d7ff944;opacity:0}
.core img{width:120px;height:auto}
.core span{font:700 30px Inter,sans-serif}
.stamp{position:absolute;left:60px;right:60px;top:1060px;text-align:center;font:800 92px/1.05 "Inter Display",Inter,sans-serif;letter-spacing:-2px;text-shadow:0 0 50px #000;opacity:0}

/* Dispositivo (pantallas de la interfaz) */
.stage3d{position:absolute;left:40px;top:470px;width:1000px;height:600px;perspective:2200px;opacity:0}
.device{position:absolute;inset:0;border-radius:18px;overflow:hidden;background:#0b1224;transform-style:preserve-3d;box-shadow:0 0 0 1.5px #4ea7ff66,0 40px 120px #000c,0 0 90px #2d7ff933}
.device .shot{position:absolute;inset:0;overflow:hidden;background:#0b1224}
.device .shot img{position:absolute;left:0;top:0;width:1000px;height:563px;object-fit:cover;object-position:top left;transform-origin:30% 30%}
.device .edge{position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 18px #4ea7ff,0 0 50px #2d7ff9;opacity:0;z-index:5}

/* Heptágono */
.hx{position:absolute;left:0;right:0;top:190px;padding:0 40px;margin:0;text-align:center;font:800 70px/1.05 "Inter Display",Inter,sans-serif;letter-spacing:-1px}
.hx2{position:absolute;left:0;right:0;top:290px;padding:0 60px;margin:0;text-align:center;font:600 40px Inter,sans-serif;color:var(--electric);opacity:0}
.hepta{position:absolute;inset:0;width:1080px;height:1920px}
.hepta polygon{fill:#2d7ff90d;stroke:#4ea7ff;stroke-width:3;stroke-dasharray:1;stroke-dashoffset:1;filter:drop-shadow(0 0 10px #2d7ff9)}
.hepta line{stroke:#4ea7ff88;stroke-width:2.5;stroke-dasharray:1;stroke-dashoffset:1}
.hcore{position:absolute;width:290px;height:290px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle,#123063,#0a1426 70%);box-shadow:0 0 0 2px #4ea7ff99,0 0 80px #2d7ff966;opacity:0;z-index:2}
.hcore img{width:86px;margin-bottom:6px}
.hcore b{font:800 38px "Inter Display",Inter,sans-serif;line-height:1}
.hcore span{font:600 28px Inter,sans-serif;color:var(--electric)}
.hcore small{margin-top:8px;font:500 18px "JetBrains Mono",monospace;color:#9fb3cf;letter-spacing:1px}
.mod{position:absolute;width:310px;height:104px;padding:14px 14px 0 66px;border:2px solid #4ea7ff55;border-radius:18px;background:#0d1a30;opacity:0;z-index:2}
.mod i{position:absolute;left:12px;top:26px;width:44px;height:44px;border-radius:50%;border:2px solid var(--blue);font:700 24px/40px "JetBrains Mono",monospace;font-style:normal;text-align:center;color:#fff}
.mod p{margin:0;font:700 30px Inter,sans-serif;color:#fff;white-space:nowrap}
.mod small{display:block;margin-top:2px;font:500 18px Inter,sans-serif;color:#9fb3cf;white-space:nowrap}

/* Cierre */
.cta{position:absolute;left:70px;right:70px;top:300px;padding:34px 40px;border:2px solid var(--electric);border-radius:18px;background:#0b1a33dd;text-align:center;font:600 50px/1.25 Inter,sans-serif;box-shadow:0 0 60px #2d7ff955;opacity:0}
.cta b{color:var(--electric)}
.fin{position:absolute;left:0;right:0;top:640px;text-align:center}
.fin .marca{display:block;margin:0 auto 20px;width:240px;height:auto;filter:drop-shadow(0 0 40px #2d7ff9aa)}
.fin h1{margin:10px 0 0;font:800 116px/1.04 "Inter Display",Inter,sans-serif;background:linear-gradient(100deg,#d8dadf 0%,#d8dadf 40%,#ffffff 50%,#d8dadf 60%,#d8dadf 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.fin h1 span{display:block}
.fin .firma{margin:28px 0 0;font:600 56px Inter,sans-serif;color:#fff}
.fin .url{margin:36px 0 0;font:500 30px "JetBrains Mono",monospace;letter-spacing:4px;color:#7a9cc6}
.fin .sigue{margin:44px auto 0;display:inline-block;padding:14px 30px;border:2px solid var(--electric);border-radius:40px;font:600 36px Inter,sans-serif;color:#fff;background:#0b1a33cc;opacity:0}

/* Subtítulos quemados: zona segura (250 px libres arriba y 350 abajo) */
.parte{position:absolute;right:60px;top:200px;padding:10px 22px;border:2px solid var(--electric);border-radius:40px;background:#0b1a33cc;font:700 28px "JetBrains Mono",monospace;letter-spacing:4px;color:#fff;opacity:0}
.win.xl{left:190px;top:930px;width:700px;height:400px;transform-origin:50% 50%}
.win.xl .grid{grid-template-columns:repeat(8,1fr);gap:4px}
.win.xl .grid span{height:34px;background:#dfe6f1}
.win.xl .grid span.r{background:#f4b6b0}.win.xl .grid span.g{background:#c8e6c9}.win.xl .grid span.y{background:#fde9a6}.win.xl .grid span.b{background:#b9d3f5}
.win.xl.tj{height:auto}
.win.xl.tj .wc{padding:26px 30px;font:600 40px/1.35 Inter,sans-serif}
.win.xl.tj .wc b{color:#c4473b}
.apsT{position:absolute;left:70px;right:70px;top:560px;text-align:center}
.apsT h2{margin:0;font:800 260px/1 "Inter Display",Inter,sans-serif;letter-spacing:-6px;color:var(--electric);text-shadow:0 0 80px #2d7ff988}
.apsT p{margin:20px 0 0;font:800 70px/1.1 "Inter Display",Inter,sans-serif;letter-spacing:-1px;color:#fff}
.apsT small{display:block;margin-top:34px;font:600 44px/1.25 Inter,sans-serif;color:#b9c7dd}
.pframe{position:absolute;left:40px;width:1000px;border-radius:18px;background:#0b1224;box-shadow:0 0 0 1.5px #4ea7ff88,0 40px 120px #000c,0 0 90px #2d7ff944;opacity:0}
.pvid{position:absolute;border-radius:18px;object-fit:cover}
.tapa{position:absolute;background:#0b1430;display:flex;align-items:center;padding:0 16px;font:600 25px Inter,sans-serif;color:#cfd8ea;border-radius:6px}
.tapa.t-err{border:2px solid #f0a020;color:#ff6b5b;background:#0d1530}
.marcaN{position:absolute;left:0;right:0;margin:0 auto;width:max-content;padding:10px 26px;border-radius:10px;background:#f5a623;color:#111;font:800 40px Inter,sans-serif;opacity:0}
.clab{position:absolute;left:60px;right:60px;margin:0;text-align:center;font:800 56px/1.12 "Inter Display",Inter,sans-serif;letter-spacing:-1px;color:#fff;text-shadow:0 4px 30px #000;opacity:0}
.clab b{color:var(--electric)}
.sub{position:absolute;left:60px;right:60px;top:1395px;height:180px;display:flex;align-items:center;justify-content:center;text-align:center}
.sub p{margin:0;padding:14px 26px;border-radius:14px;background:#05070cb0;font:800 58px/1.18 Inter,sans-serif;letter-spacing:-.5px;color:#fff;text-shadow:0 2px 10px #000}
.sub .w{color:#fff}

.sweep{background:linear-gradient(100deg,#0000 35%,#4ea7ff18 45%,#ffffff40 50%,#4ea7ff18 55%,#0000 65%);mix-blend-mode:screen;pointer-events:none}
#temp{left:auto;top:auto;right:20px;bottom:16px;font:700 15px "JetBrains Mono",monospace;color:#ff6b35;letter-spacing:2px}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{{TOTAL}}" data-width="1080" data-height="1920" data-fps="25">
{{CLIPS}}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
{{TIMELINE}}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
