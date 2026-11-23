<!doctype html>
<html lang="es" data-resolution="{{RES}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width={{W}}, height={{H}}">
<title>Arvantti · la IA en cada módulo</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
:root{--blue:#2d7ff9;--electric:#4ea7ff;--deep:#0b3d91;--ti:#d8dadf;--ti2:#a7abb3;--dti:#7a7e86;--black:#05070c;--white:#f8fafc;--alert:#ff4b00}
*{box-sizing:border-box}
html,body{width:{{W}}px;height:{{H}}px;margin:0;overflow:hidden;background:var(--black);font-family:Inter,Arial,sans-serif;color:var(--white)}
#root{position:relative;width:{{W}}px;height:{{H}}px;overflow:hidden;background:var(--black)}
.clip{position:absolute;inset:0}
.scene{overflow:hidden}
.w{display:inline-block;white-space:pre}
.dot{display:inline-block;width:18px;height:18px;border-radius:50%;background:var(--electric);box-shadow:0 0 0 4px #4ea7ff33,0 0 18px #4ea7ff;vertical-align:middle;margin-right:12px}
.fondo .glow{position:absolute;inset:-20%;background:radial-gradient(60% 50% at 50% 45%,#12305e55 0%,#05070c00 70%)}
.bleed{position:absolute;inset:0;overflow:hidden}
.bleed img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bleedv{width:{{W}}px;height:{{H}}px;object-fit:cover}
.scene .bleed img{filter:brightness(.42) saturate(.85) blur(2px)}
#e-cierre .bleed img{filter:brightness(.35) blur(3px)}
.shade{position:absolute;inset:0;background:linear-gradient(#05070cd0 0%,#05070c55 30%,#05070c66 70%,#05070cee 100%)}
.shade.fuerte{background:#05070cb0}
.hud{position:absolute;inset:40px 30px}
.hud .c{position:absolute;width:70px;height:70px;border:3px solid #4ea7ffcc}
.hud .tl{left:0;top:0;border-right:0;border-bottom:0}.hud .tr{right:0;top:0;border-left:0;border-bottom:0}
.hud .bl{left:0;bottom:0;border-right:0;border-top:0}.hud .br{right:0;bottom:0;border-left:0;border-top:0}
.tag3d{position:absolute;padding:14px 26px;border:2px solid var(--electric);background:#0b1a33cc;font:700 30px "JetBrains Mono",monospace;letter-spacing:4px;color:#fff;box-shadow:0 0 40px #2d7ff988;opacity:0}
.tag3d i{display:inline-block;width:14px;height:14px;margin-right:14px;border-radius:50%;background:var(--electric);box-shadow:0 0 12px var(--electric);vertical-align:middle}
.hook{position:absolute;margin:0;font-weight:800;line-height:1.05;letter-spacing:-2.5px;text-shadow:0 6px 50px #000c}
.hook .l1,.hook .l2{display:block}.hook .l2{color:var(--electric);margin-top:24px}
.hook .w{opacity:0}

/* Cabecera de módulo */
.kicker{margin:0 0 18px;font:600 26px "JetBrains Mono",monospace;letter-spacing:6px;color:var(--electric)}
.kicker b{display:inline-block;padding:6px 14px;border:2px solid var(--blue);color:#fff;font-weight:700;letter-spacing:4px}
.mname{margin:0;font-weight:800;line-height:1.02;letter-spacing:-2px;text-shadow:0 6px 40px #000c}
.iab{margin:26px 0 0;display:inline-flex;align-items:center;padding:14px 24px 14px 18px;border-radius:40px;background:#0b1a33e0;border:2px solid #4ea7ff88;font:600 34px Inter,sans-serif;color:#fff;box-shadow:0 0 40px #2d7ff944}
.iab em{font-style:normal;font-weight:800;color:var(--electric);margin-right:14px;font-family:"JetBrains Mono",monospace}
.stage{opacity:0}
.stage>*{position:absolute}

/* Núcleo */
.doc{top:10px;width:270px;height:200px;padding:12px;border-radius:14px;background:#f2f4f8;color:#1d2433;box-shadow:0 24px 60px #000b;opacity:0}
#n-d0{left:10px}#n-d1{left:315px}#n-d2{left:620px}
.doc p{margin:0 0 8px;font:700 18px "JetBrains Mono",monospace;letter-spacing:3px;color:var(--deep)}
.doc svg{width:246px;height:140px}.doc svg *{fill:none;stroke:#2d7ff9;stroke-width:3}
.doc img{width:246px;height:142px;object-fit:cover;border-radius:6px}
.spec i{display:block;height:16px;margin:10px 0;background:#d4dbe7;border-radius:4px}.spec i:nth-child(odd){width:70%}.spec i:first-child{background:#2d7ff9;width:45%}
.panel{left:0;top:60px;width:900px;height:506px;border-radius:18px;overflow:hidden;border:2px solid #4ea7ff88;box-shadow:0 30px 80px #000c;opacity:0}
.panel img{width:100%;height:100%;object-fit:cover}
.scan{position:absolute;left:0;right:0;top:0;height:10%;background:linear-gradient(#4ea7ff00,#4ea7ff55,#4ea7ff00);border-bottom:2px solid #4ea7ff}
.graph{left:0;top:0;width:900px;height:640px}
.graph .e1{stroke:#4ea7ff;stroke-width:4;stroke-dasharray:1;stroke-dashoffset:1}
.graph .e2{stroke:#a7abb355;stroke-width:2;opacity:0}
.graph .n2{fill:#a7abb3;opacity:0}
.gcore{left:330px;top:255px;width:240px;height:140px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:70px;background:radial-gradient(circle,#173a72,#0b1a33);border:3px solid var(--electric);font:800 32px/1.1 Inter,sans-serif;box-shadow:0 0 60px #2d7ff9aa;opacity:0}
.gcore .dot{position:absolute;top:-10px;right:20px;margin:0}
.gnode{width:190px;height:68px;display:flex;align-items:center;justify-content:center;border-radius:34px;background:#0d1a30;border:2px solid #4ea7ff;font:700 30px Inter,sans-serif;opacity:0}

/* Integrator */
.sys{left:0;width:240px;height:120px;padding:18px 20px;border-radius:16px;background:#0d1a30;border:2px solid #4ea7ff99;opacity:0}
.sys b{display:block;font:800 40px "JetBrains Mono",monospace}.sys small{font:500 20px Inter,sans-serif;color:var(--ti2)}
.flow{left:0;top:0;width:900px;height:640px}.flow path{fill:none;stroke:#4ea7ff;stroke-width:3;stroke-dasharray:1;stroke-dashoffset:1}
.tabla{left:330px;top:20px;width:570px;padding:16px;border-radius:16px;background:#070d18ee;border:2px solid #4ea7ff66;overflow:hidden;opacity:0}
.th,.tr{display:grid;grid-template-columns:1.2fr 1fr 1fr .8fr;gap:8px;padding:12px 12px;font:600 22px "JetBrains Mono",monospace}
.th{color:var(--electric);font-size:18px;letter-spacing:2px;text-transform:uppercase}
.tr{position:relative;margin-top:8px;border:2px solid #ffffff14;border-radius:10px;color:#e6ebf2;height:76px;align-items:start}
.tr em{position:absolute;left:12px;bottom:6px;font:700 17px Inter,sans-serif;font-style:normal;color:var(--alert);opacity:0}
.tabla .scan{height:60px;opacity:0}

/* APS */
.gantt{left:0;top:0;width:900px;height:640px;border-radius:18px;background:#070d18ee;border:2px solid #4ea7ff66}
.gx span{position:absolute;top:40px;font:600 15px "JetBrains Mono",monospace;color:var(--ti2)}
.glin{position:absolute;left:0;right:0;height:100px;border-top:1px solid #ffffff14}
.glin b{position:absolute;left:18px;top:36px;font:700 21px Inter,sans-serif;color:var(--ti)}
.lote{position:absolute;height:64px;border-radius:10px;background:#2d7ff9;opacity:0}
.lote:nth-of-type(odd){background:#4ea7ff}
.lote.mano{background:#d8dadf}
.choque{position:absolute;left:300px;top:200px;padding:12px 20px;border-radius:10px;background:var(--alert);font:700 26px Inter,sans-serif;opacity:0}
.cursor{position:absolute;width:34px;height:34px;opacity:0;background:no-repeat center/contain url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M4 2l15 9-7 1.5L8.5 20z' fill='white' stroke='black' stroke-width='1.5'/></svg>")}
.ok{position:absolute;left:40px;bottom:30px;padding:14px 22px;border-radius:30px;background:#0b1a33;border:2px solid var(--electric);font:700 28px Inter,sans-serif;opacity:0}
.metodo{position:absolute;right:20px;top:-58px;padding:8px 16px;border-radius:8px;border:2px solid #c4b5fd;color:#e9e3ff;font:700 22px "JetBrains Mono",monospace;opacity:0}

/* Gráficas */
.chart{left:0;top:0;width:900px;height:640px;opacity:0}
.chart .ax{stroke:#a7abb3;stroke-width:2}
.chart .now{stroke:#ffffff55;stroke-width:2;stroke-dasharray:8 8}
.chart .lbl{font:600 22px Inter,sans-serif;fill:var(--ti)}.chart .lbl.e{fill:var(--electric)}.chart .lbl.o{fill:var(--alert)}
.chart .real{fill:none;stroke:#ffffff;stroke-width:5;stroke-dasharray:1;stroke-dashoffset:1}
.chart .sim{fill:none;stroke:var(--electric);stroke-width:5}
.chart .lejos{stroke-dasharray:1;stroke-dashoffset:1;stroke:#4ea7ffaa}
.chart .proy{stroke-dasharray:1;stroke-dashoffset:1}
.chart .band{fill:#4ea7ff26}
.chart .thr{stroke:var(--alert);stroke-width:3;stroke-dasharray:12 8}
.chart .hit{fill:var(--alert);opacity:0}
.reglas{left:0;top:0;width:430px;padding:20px 26px;border-radius:16px;background:#0b1a33f0;border:2px solid #c4b5fd;transform-origin:0 0;opacity:0;z-index:3}
.reglas p{margin:0 0 10px;font:800 30px Inter,sans-serif;color:#e9e3ff}
.reglas ul{margin:0;padding-left:28px;font:500 25px/1.5 Inter,sans-serif;color:var(--ti)}
.chip{left:0;top:0;padding:12px 20px;border-radius:30px;background:#0b1a33f0;border:2px solid #c4b5fd;font:700 26px Inter,sans-serif;opacity:0;z-index:3}
.chip .ok{position:static;display:inline;padding:0;border:0;background:none;color:#c4b5fd;margin-right:10px;opacity:1;font:inherit}
.chart .pl{fill:#a7abb3}
.chart .best circle{fill:var(--electric);stroke:#fff;stroke-width:3}
.chart .wh{stroke:#c4b5fd;stroke-width:3}
.gen{right:20px;top:120px;font:700 26px "JetBrains Mono",monospace;color:var(--ti2)}.gen b{color:#fff}
.obj{right:10px;top:70px;display:flex;gap:10px;opacity:0}.obj span{padding:10px 16px;border-radius:24px;background:#12305a;border:2px solid var(--electric);font:700 22px Inter,sans-serif}
.mc{left:0;top:62px;padding:10px 18px;border-radius:10px;border:2px solid #c4b5fd;background:#0b1a33f0;font:700 24px Inter,sans-serif;color:#e9e3ff;opacity:0}

/* Control Center */
.alarmas{left:0;top:0;width:900px;padding:20px;border-radius:18px;background:#070d18ee;border:2px solid #4ea7ff66}
.alarmas .tt{margin:0 0 6px;font:700 20px "JetBrains Mono",monospace;letter-spacing:4px;color:var(--electric)}
.al{display:grid;grid-template-columns:30px 100px 170px 1fr;align-items:center;gap:10px;margin-top:10px;padding:14px 16px;border-radius:10px;border:2px solid #ffffff14;font:600 25px Inter,sans-serif;opacity:0}
.al i{width:16px;height:16px;border-radius:50%;background:var(--alert);box-shadow:0 0 10px var(--alert)}
.al span:first-of-type{font-family:"JetBrains Mono",monospace;color:var(--ti2)}
.patron{right:20px;top:12px;padding:10px 18px;border-radius:10px;background:var(--electric);color:#05070c;font:800 24px Inter,sans-serif;opacity:0}
.sug{left:120px;top:340px;width:660px;padding:24px 30px;border-radius:18px;background:#0b1a33fa;border:3px solid var(--electric);box-shadow:0 30px 90px #000e,0 0 50px #2d7ff966;opacity:0}
.sug p{margin:0;font:700 22px "JetBrains Mono",monospace;letter-spacing:3px;color:var(--electric)}
.sug h4{margin:12px 0 18px;font:800 38px/1.15 Inter,sans-serif}
.bt{display:flex;gap:14px}.bt span{padding:12px 26px;border-radius:10px;border:2px solid #a7abb3;font:700 24px Inter,sans-serif}.bt .si{background:var(--blue);border-color:var(--blue)}

/* Dendro */
.chipd{left:20px;top:160px;width:220px;height:200px;border-radius:16px;background:#0d1a30;border:3px solid #4ea7ff99;opacity:0}
.chipd .die{position:absolute;inset:30px;border-radius:10px;background:linear-gradient(135deg,#12305a,#0b1a33);border:2px solid var(--electric);display:flex;align-items:center;justify-content:center;text-align:center;font:800 24px/1.15 "JetBrains Mono",monospace;color:#bfe0ff}
.chipd>i{position:absolute;width:18px;height:8px;background:#a7abb3;border-radius:2px}
.falla{right:10px;top:150px;padding:10px 18px;border-radius:10px;background:var(--alert);font:800 26px Inter,sans-serif;opacity:0}
.aprob{left:250px;top:110px;width:620px;padding:24px 30px;border-radius:18px;background:#0b1a33fa;border:3px solid var(--electric);box-shadow:0 30px 90px #000e;opacity:0}
.aprob p{margin:0;font:700 22px "JetBrains Mono",monospace;letter-spacing:3px;color:var(--electric)}
.aprob h4{margin:12px 0 20px;font:800 36px/1.15 Inter,sans-serif}
.btn{display:inline-block;padding:14px 30px;border-radius:10px;border:2px solid var(--electric);font:800 28px Inter,sans-serif}
.aprob .cursor{position:absolute;position:absolute}

/* Asistente */
.chat{left:0;top:0;width:900px;height:500px;padding:22px;border-radius:20px;background:#070d18f2;border:2px solid #4ea7ff66;opacity:0}
.ct{font:700 22px "JetBrains Mono",monospace;letter-spacing:3px;color:var(--electric)}
.bq{position:absolute;right:22px;top:72px;max-width:560px;padding:16px 22px;border-radius:20px 20px 4px 20px;background:var(--blue);font:700 30px Inter,sans-serif;opacity:0}
.ba{position:absolute;left:22px;top:160px;width:820px;padding:20px 24px;border-radius:20px 20px 20px 4px;background:#13203a;border:2px solid #ffffff1a;opacity:0}
.ba p{margin:0;font:500 28px/1.35 Inter,sans-serif}.ba b{color:var(--electric)}
.bars{display:flex;align-items:flex-end;gap:12px;height:90px;margin:16px 0 12px}.bars i{flex:0 0 52px;background:linear-gradient(#4ea7ff,#2d7ff9);border-radius:6px 6px 0 0}.bars i:last-child{background:linear-gradient(#ff4b00,#c43a00)}
.src{display:flex;flex-wrap:wrap;gap:10px}.src span{padding:6px 14px;border-radius:16px;border:2px solid #4ea7ff88;font:600 19px Inter,sans-serif;color:#cfe5ff}
.pills{left:0;top:545px;display:flex;gap:12px;flex-wrap:wrap;width:900px}
.pill{padding:12px 22px;border-radius:30px;border:2px solid var(--electric);background:#0b1a33f0;font:800 26px Inter,sans-serif}
.pill.os{background:var(--blue);border-color:var(--blue)}.pill.otros{border-color:#a7abb3;color:var(--ti)}

/* Heptágono pequeño */
.mini{position:absolute;opacity:0}
.mini svg{width:100%;height:auto;overflow:visible}
.mini polygon{fill:#2d7ff910;stroke:#4ea7ff88;stroke-width:2}
.mini line{stroke:#ffffff22;stroke-width:2}
.mini .mn{fill:#0d1a30;stroke:#4ea7ff88;stroke-width:2}
.mini .mt{font:700 17px "JetBrains Mono",monospace;fill:#fff;text-anchor:middle}
.mini p{white-space:nowrap;margin:6px -60px 0;text-align:center;font:600 20px "JetBrains Mono",monospace;letter-spacing:2px;color:var(--ti2)}

/* Cierre */
.hepta{position:absolute;inset:0;width:100%;height:100%}
.hepta polygon{fill:#2d7ff90d;stroke:var(--electric);stroke-width:3;stroke-dasharray:1;stroke-dashoffset:1}
.hepta line{stroke:#4ea7ff66;stroke-width:2.5;stroke-dasharray:1;stroke-dashoffset:1}
.hcore{position:absolute;width:260px;height:260px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle,#173a72,#0a1426 70%);box-shadow:0 0 0 3px var(--electric),0 0 80px #2d7ff988;opacity:0}
.hcore .dot{margin:0 0 12px}
.hcore b{font:800 36px Inter,sans-serif}.hcore small{margin-top:6px;font:600 19px "JetBrains Mono",monospace;color:#9fb3cf}
.hm{position:absolute;width:340px;height:80px;display:flex;align-items:center;justify-content:center;padding:0 14px;border-radius:40px;background:#0d1a30;border:2px solid var(--electric);font-weight:700;white-space:nowrap;opacity:0}
.lema{position:absolute;margin:0;text-align:center;font-weight:700;line-height:1.3;opacity:0}
.lema b{font-weight:800}
.fin{position:absolute;left:0;right:0;text-align:center}
.fin .marca{display:block;margin:0 auto 20px;width:240px;filter:drop-shadow(0 0 40px #2d7ff9aa);opacity:0}
.fin h1{margin:10px 0 0;font-weight:800;line-height:1.04;background:linear-gradient(100deg,#d8dadf,#ffffff,#d8dadf);-webkit-background-clip:text;background-clip:text;color:transparent;opacity:0}
.fin h1 span{display:block}
.fin .firma{margin:28px 0 0;font:600 52px Inter,sans-serif;opacity:0}
.fin .url{margin:30px 0 0;font:500 30px "JetBrains Mono",monospace;letter-spacing:4px;color:#7a9cc6;opacity:0}

/* v002 */
.rev{position:absolute;right:16px;bottom:16px;padding:10px 18px;border-radius:24px;background:#0b1a33ee;border:2px solid var(--electric);font:700 24px Inter,sans-serif;opacity:0}
.vision{left:150px;top:200px;width:600px;padding:26px 30px;border-radius:18px;background:#0b1a33fa;border:3px solid var(--electric);box-shadow:0 0 60px #2d7ff966;font:800 38px/1.15 Inter,sans-serif;opacity:0}
.vision small{display:block;margin-top:12px;font:500 24px/1.3 Inter,sans-serif;color:var(--ti)}
.ok i{font-style:normal;margin-left:10px;padding:4px 12px;border-radius:14px;background:#12305a;font-size:22px}
.chart .alt{stroke:#c4b5fd}
.tec{left:0;top:56px;width:900px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;opacity:0;z-index:3}
.tec span{padding:8px 14px;border-radius:10px;background:#0b1a33f0;border:2px solid var(--electric);font:700 21px Inter,sans-serif;opacity:0}
.tec span:first-child{border-color:#c4b5fd;color:#e9e3ff}
.tec b{font:800 24px Inter,sans-serif;color:var(--ti2)}
.chart .lbl.t{fill:#e9e3ff;font-weight:700}.chart .lbl.n{font-size:26px;font-weight:800;fill:#fff}
.chart .esc{fill:#a7abb3}
.chart .rango{fill:#ffffff10;stroke:#a7abb3;stroke-width:2;opacity:0}
.chart .med{stroke:#fff;stroke-width:4;opacity:0}
.robusto{right:0;top:415px;padding:10px 18px;border-radius:10px;background:var(--electric);color:#05070c;font:800 26px Inter,sans-serif;opacity:0}
.pasos{left:0;top:580px;width:900px;display:flex;gap:10px;opacity:0}
.pasos span{flex:1;text-align:center;padding:12px 8px;border-radius:10px;border:2px solid #ffffff22;background:#070d18e0;font:700 22px Inter,sans-serif;color:var(--ti2)}
.pasos span:last-child{flex:1.6}

/* Subtítulos */
.sub{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center}
.sub p{margin:0;padding:12px 24px;border-radius:14px;background:#05070cc0;font-weight:800;line-height:1.18;letter-spacing:-.5px;color:#fff;text-shadow:0 2px 10px #000}
{{CSS}}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{{TOTAL}}" data-width="{{W}}" data-height="{{H}}" data-fps="25">
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
