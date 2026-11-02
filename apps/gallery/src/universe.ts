/**
 * Universo del gemelo: seis plataformas ovales en las esquinas de un hexágono, el gemelo 3D al centro,
 * unidas por tuberías con fluido y sobre un universo de grafos. Al tocar una plataforma se abre un
 * holograma con su ilustración, su contenido y el enlace a su pantalla real. Se dibuja en un canvas 2D con
 * proyección 3D propia (sin librerías). Port del prototipo aprobado por Andy; el tipado fino queda pendiente.
 */
// @ts-nocheck
export function mountUniverse(cv: HTMLCanvasElement): void {

var ctx=cv.getContext('2d') as CanvasRenderingContext2D;
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var C={live:'#4aa3ff',plan:'#f5a524',calc:'#2fd27a',fut:'#a77bff',twin:'#dce8ff',user:'#ff7ab8'};
var P=[
 {id:'planta',n:'Planta',s:'emulada en 2D',x:-500,y:70,z:40,r:112,c:'live',d:'Contiene un PLC por máquina. Envía todas sus señales al centro de control y recibe de él las órdenes.'},
 {id:'centro',n:'Centro de control',s:'señales de todos los PLC',x:-170,y:180,z:-70,r:122,c:'live',d:'Recibe ciclo, unidades y OEE de cada PLC. Alimenta al gemelo y envía la programación a la planta.'},
 {id:'gemelo',n:'Gemelo 3D',s:'pasado · presente · futuro',x:140,y:-5,z:70,r:158,c:'twin',d:'La planta en 3D con lo que reportan los PLC y el plan. Se mueve por el tiempo: atrás, ahora y adelante.'},
 {id:'aps',n:'APS',s:'pedidos y programación',x:500,y:140,z:-40,r:112,c:'plan',d:'Pedidos y programación, incluida la manual. Entrega la programación al gemelo y al centro de control.'},
 {id:'cosim',n:'Cosimulador',s:'cálculo',x:-330,y:-180,z:170,r:118,c:'calc',d:'Calcula la secuencia que cumple las entregas. Se comunica con el gemelo y con el centro de control.'},
 {id:'fractal',n:'Fractal',s:'optimizador',x:60,y:-290,z:-130,r:122,c:'fut',d:'Lee el gemelo, el cosimulador y el centro de control, y genera escenarios para que el usuario elija.'},
 {id:'usuario',n:'Usuario',s:'elige el escenario',x:0,y:0,z:0,r:84,c:'user',d:'Compara los escenarios que genera Fractal y decide cuál aplicar en el gemelo y en el centro de control.'}
];
var byId={};P.forEach(function(p){byId[p.id]=p});
var INFO={
 planta:{h:'/emulador.html',i:['PLC de cada máquina (12 inyectoras)','Buffers y montacargas','Almacén de semielaborados','Ensamble y almacén de terminado','Lógica de restricciones']},
 centro:{h:'/control.html',i:['Ciclo por máquina','Unidades producidas','OEE por máquina','Señales de todos los PLC']},
 gemelo:{h:'/plant.html?plant=plastic-injection-plant-v1',i:['Pasado · play','Presente · vivo','Futuro · escenarios','Panel de órdenes']},
 aps:{h:'/aps.html',i:['Pedidos','Tabla y Gantt','Programación manual','Objetivo al calcular']},
 cosim:{h:'/aps.html?tab=gantt',i:['Optimización con un solo objetivo','Siempre respeta las entregas','Ejecuta la secuencia del APS']},
 fractal:{h:'/aps.html?tab=fractal',i:['Genera escenarios','Lee gemelo, cosimulador y centro de control','Multiobjetivo (futuro)']},
 usuario:{h:null,i:['Compara los escenarios','Decide cuál aplicar']}
};

// hexágono: esquinas = 6 plataformas, gemelo al centro
var HEX=['planta','centro','aps','usuario','fractal','cosim'],HR=480;
HEX.forEach(function(id,i){var a=(i*60-120)*Math.PI/180,p=byId[id];p.x=Math.cos(a)*HR;p.z=Math.sin(a)*HR;p.y=0;p.r=112});
byId.gemelo.x=0;byId.gemelo.y=0;byId.gemelo.z=0;byId.gemelo.r=112;
var E=[
 ['planta','centro','live','señales'],['centro','planta','plan','órdenes'],['centro','gemelo','live','estado de la planta'],
 ['aps','centro','plan','programación'],['aps','gemelo','plan','programación'],
 ['cosim','gemelo','calc',''],['gemelo','cosim','calc','',1],['cosim','centro','calc','señales y ritmos'],['centro','cosim','calc','',1],
 ['gemelo','fractal','fut','estado actual'],['fractal','usuario','fut','escenarios'],['usuario','gemelo','fut','elige y aplica'],['cosim','fractal','fut','lee el cálculo'],['centro','fractal','fut','lee las señales']
];
// grafo de fondo
var rnd=(function(s){return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}})(7);
var N=[],L=[],i,j;
for(i=0;i<170;i++)N.push({x:(rnd()-.5)*2200,y:(rnd()-.5)*1300,z:(rnd()-.5)*1500,h:rnd()});
for(i=0;i<N.length;i++)for(j=i+1;j<N.length;j++){var dx=N[i].x-N[j].x,dy=N[i].y-N[j].y,dz=N[i].z-N[j].z;if(dx*dx+dy*dy+dz*dz<260*260&&L.length<420)L.push([i,j])}
var hov=null,holo=null,sh=0,selT=0,W,H,dpr,yaw=0,pitch=.62,vy=0,vp=0,zoom=1,sel=null,t=0,drag=null,hits=[];
function size(){dpr=Math.min(2,window.devicePixelRatio||1);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
var ro=new ResizeObserver(size);ro.observe(cv);size();var visible=true;new IntersectionObserver(function(en){visible=en[0].isIntersecting}).observe(cv);
function pr(x,y,z){
  var cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  var x1=x*cy+z*sy,z1=-x*sy+z*cy;
  var y2=y*cp-z1*sp,z2=y*sp+z1*cp;
  var f=Math.min(W,H*1.5)*1.05*zoom*3.1, d=4650, k=f/(d+z2+0.001)*1.0;
  return {x:W/2-sh+x1*k*(W<600?.78:.9),y:H*.46-y2*k*(W<600?.78:.9),k:k,z:z2};
}
function rgba(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16)+','+((n>>8)&255)+','+(n&255)+','+a+')'}
function ring(p,y,r,k){var a=[],s;for(s=0;s<=56;s++){var q=pr(p.x+Math.cos(s/56*6.2832)*r,y,p.z+Math.sin(s/56*6.2832)*r);a.push(q)}return a}
function path(a){ctx.beginPath();a.forEach(function(q,i){i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath()}
function curve(a,b){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2+60,z:(a.z+b.z)/2};return m}
function bez(a,b,u){var m=curve(a,b),v=1-u;return [v*v*a.x+2*v*u*m.x+u*u*b.x,v*v*a.y+2*v*u*m.y+u*u*b.y,v*v*a.z+2*v*u*m.z+u*u*b.z]}
function draw(){
  ctx.clearRect(0,0,W,H);
  var g=ctx.createRadialGradient(W/2,H*.45,0,W/2,H*.45,Math.max(W,H)*.7);g.addColorStop(0,'#0d1430');g.addColorStop(1,'#05070f');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  var q=N.map(function(n){return pr(n.x,n.y,n.z)});
  ctx.lineWidth=1;
  L.forEach(function(l){var a=q[l[0]],b=q[l[1]],al=Math.max(0,Math.min(.22,.2-(a.z+b.z)/9000));ctx.strokeStyle='rgba(120,150,255,'+al+')';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()});
  N.forEach(function(n,i){var a=q[i],al=Math.max(.05,Math.min(.9,.8-a.z/2200));ctx.fillStyle=rgba(n.h>.7?'#a77bff':n.h>.4?'#4aa3ff':'#8fb4ff',al);ctx.beginPath();ctx.arc(a.x,a.y,Math.max(.8,a.k*3.2),0,6.283);ctx.fill()});
  // piso hexagonal
  (function(){var h=HEX.map(function(id){var p=byId[id];return pr(p.x,-34,p.z)});ctx.beginPath();h.forEach(function(q,i){i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();ctx.strokeStyle='rgba(120,150,255,.4)';ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle='rgba(120,150,255,.025)';ctx.fill();
    var c=pr(0,-34,0);h.forEach(function(q){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle='rgba(120,150,255,.08)';ctx.stroke()})})();
  // tuberías
  E.forEach(function(e,ei){
    var a=byId[e[0]],b=byId[e[1]],col=C[e[2]],rev=e[4]?1:0;
    var ox=(rev?16:0),oz=(rev?16:0);
    var lane=46+(ei%4)*13;
    var ax=a.x+ox,az=a.z+oz,bx=b.x+ox,bz=b.z+oz;
    var w=[[ax,a.y+6,az],[ax,lane,az],[bx,lane,bz],[bx,b.y+6,bz]];
    var pts=w.map(function(v){return pr(v[0],v[1],v[2])});
    var hot=sel&&(sel.id===a.id||sel.id===b.id),kk=(pts[1].k+pts[2].k)/2,tw=Math.max(1.6,kk*(hot?4.6:3.4));
    function trace(){ctx.beginPath();pts.forEach(function(q,i){i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)})}
    ctx.lineJoin='round';ctx.lineCap='round';
    trace();ctx.strokeStyle='rgba(8,12,28,.9)';ctx.lineWidth=tw+2;ctx.stroke();           // pared
    trace();ctx.strokeStyle=rgba(col,hot?.55:.30);ctx.lineWidth=tw;ctx.stroke();           // tubo
    trace();ctx.strokeStyle='rgba(255,255,255,'+(hot?.22:.10)+')';ctx.lineWidth=Math.max(1,tw*.28);ctx.stroke(); // brillo
    // codos y bridas
    pts.forEach(function(q,i){var end=i===0||i===pts.length-1;ctx.fillStyle=end?rgba(col,.95):'rgba(14,20,44,.95)';ctx.strokeStyle=rgba(col,.8);ctx.lineWidth=1.2;ctx.shadowColor=col;ctx.shadowBlur=hot?10:4;ctx.beginPath();ctx.arc(q.x,q.y,Math.max(1.8,tw*(end?1.2:.8)),0,6.283);ctx.fill();ctx.stroke();ctx.shadowBlur=0});
    // fluido: pulsos a lo largo de la polilínea
    var seg=[],tot=0;for(var m=1;m<pts.length;m++){var d=Math.hypot(pts[m].x-pts[m-1].x,pts[m].y-pts[m-1].y);seg.push(d);tot+=d}
    for(var s=0;s<3;s++){var u=((t*.00018+ei*.11+s/3)%1);if(reduce)u=.2+s*.3;var dd=u*tot,m2=0;while(m2<seg.length-1&&dd>seg[m2]){dd-=seg[m2];m2++}
      var f=seg[m2]?dd/seg[m2]:0,px=pts[m2].x+(pts[m2+1].x-pts[m2].x)*f,py=pts[m2].y+(pts[m2+1].y-pts[m2].y)*f;
      ctx.fillStyle=rgba(col,hot?1:.8);ctx.shadowColor=col;ctx.shadowBlur=14;ctx.beginPath();ctx.ellipse(px,py,tw*1.1,tw*.8,0,0,6.283);ctx.fill();ctx.shadowBlur=0}
    // etiqueta sobre el tramo superior
    if(e[3]&&hot){var mx=(pts[1].x+pts[2].x)/2,my=(pts[1].y+pts[2].y)/2-tw-4;ctx.textAlign='center';ctx.font='500 11px Inter,sans-serif';ctx.fillStyle=rgba(col,1);ctx.fillText(e[3],mx,my)}
  });
  // plataformas, de lejos a cerca
  var ord=P.map(function(p){return {p:p,z:pr(p.x,p.y,p.z).z}}).sort(function(a,b){return b.z-a.z});
  hits=[];
  ord.forEach(function(o){
    var p=o.p,col=C[p.c],on=sel===p||hov===p;p.lift=(p.lift||0)+(((on?22:0)-(p.lift||0))*(reduce?1:.14));var bob=reduce?0:Math.sin(t*.0012+p.x)*7,y=p.y+bob+p.lift;
    var c0=pr(p.x,y,p.z);
    // línea de caída
    var f0=pr(p.x,y-300,p.z);ctx.strokeStyle=rgba(col,.12);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(c0.x,c0.y);ctx.lineTo(f0.x,f0.y);ctx.stroke();
    // sombra/resplandor inferior
    var low=ring(p,y-26,p.r*.92);path(low);ctx.fillStyle=rgba(col,.10);ctx.fill();
    // canto
    var top=ring(p,y,p.r),bot=ring(p,y-16,p.r);
    ctx.fillStyle=rgba(col,.22);ctx.beginPath();top.forEach(function(q,i){i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});for(var s=bot.length-1;s>=0;s--)ctx.lineTo(bot[s].x,bot[s].y);ctx.closePath();ctx.fill();
    path(bot);ctx.strokeStyle=rgba(col,.45);ctx.lineWidth=1;ctx.stroke();
    // cara superior
    path(top);var gr=ctx.createRadialGradient(c0.x,c0.y,2,c0.x,c0.y,p.r*c0.k*1.1);gr.addColorStop(0,rgba(col,on?.55:.34));gr.addColorStop(1,rgba(col,.08));
    ctx.fillStyle=gr;ctx.fill();ctx.shadowColor=col;ctx.shadowBlur=on?26:12;ctx.strokeStyle=rgba(col,on?1:.8);ctx.lineWidth=on?2.4:1.6;ctx.stroke();ctx.shadowBlur=0;
    // anillos interiores
    [.62,.3].forEach(function(r){path(ring(p,y,p.r*r));ctx.strokeStyle=rgba(col,.35);ctx.lineWidth=1;ctx.stroke()});
    if(on){var ra=ring(p,y+2,p.r*1.2);ctx.save();ctx.setLineDash([10,8]);ctx.lineDashOffset=reduce?0:-t*.03;path(ra);ctx.strokeStyle=rgba(col,.85);ctx.lineWidth=1.6;ctx.shadowColor=col;ctx.shadowBlur=10;ctx.stroke();ctx.restore();
      var rb=ring(p,y+2,p.r*.46);ctx.save();ctx.setLineDash([4,6]);ctx.lineDashOffset=reduce?0:t*.04;path(rb);ctx.strokeStyle=rgba(col,.9);ctx.lineWidth=1.2;ctx.stroke();ctx.restore()}
    // núcleo
    ctx.fillStyle=rgba(col,.95);ctx.shadowColor=col;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(c0.x,c0.y,Math.max(3,c0.k*7),0,6.283);ctx.fill();ctx.shadowBlur=0;
    // etiqueta
    var lb=pr(p.x,y+62,p.z),fs=Math.max(11,Math.min(17,lb.k*16));
    ctx.textAlign='center';ctx.fillStyle='#eef3ff';ctx.font='600 '+fs+'px Orbitron,sans-serif';ctx.fillText(p.n.toUpperCase(),lb.x,lb.y);
    ctx.fillStyle=rgba(col,.95);ctx.font='400 '+(fs*.72)+'px Inter,sans-serif';ctx.fillText(p.s,lb.x,lb.y+fs*.95);
    var rx=0;top.forEach(function(q){rx=Math.max(rx,Math.abs(q.x-c0.x))});
    hits.push({p:p,x:c0.x,y:c0.y,rx:rx,ry:rx*Math.abs(Math.sin(pitch))+10});
  });
  holo=null;
  if(sel&&INFO[sel.id]){
    var inf=INFO[sel.id],cc=C[sel.c],u=Math.min(1,(t-selT)/520),ease=reduce?1:1-Math.pow(1-u,3);
    var CW=330,pad=18,iw=CW-pad*2,desc=wrap(sel.d,iw,'400 13px Inter,sans-serif');
    var lk=[];E.forEach(function(e){if(e[0]===sel.id)lk.push(byId[e[1]].n);else if(e[1]===sel.id)lk.push(byId[e[0]].n)});
    var cn=wrap('Conectada con: '+Array.from(new Set(lk)).join(' · '),iw,'400 12px Inter,sans-serif');
    var CH=pad+26+18+10+IH+12+desc.length*18+8+inf.i.length*21+12+(inf.h?30:0)+cn.length*16+pad;
    var top0=pr(sel.x,sel.y+10,sel.z),k0=top0.k,sc=Math.max(.7,Math.min(.95,k0*1.25));
    var ax=top0.x,ay=top0.y-sel.r*k0*.55-64,bw=CW*sc,bh=CH*sc;
    var px=Math.max(8,Math.min(W-bw-8,ax-bw/2)),py=Math.max(W<700?118:56,ay-bh*ease);
    // haz de luz
    var rg=ring(sel,sel.y+2,sel.r*.7);
    ctx.beginPath();ctx.moveTo(px+bw*.2,py+bh*ease);ctx.lineTo(px+bw*.8,py+bh*ease);ctx.lineTo(rg[14].x,rg[14].y);ctx.lineTo(rg[42].x,rg[42].y);ctx.closePath();
    var bg=ctx.createLinearGradient(0,py+bh*ease,0,top0.y);bg.addColorStop(0,rgba(cc,.0));bg.addColorStop(1,rgba(cc,.0));
    var bg2=ctx.createLinearGradient(0,top0.y,0,py+bh*ease);bg2.addColorStop(0,rgba(cc,.16));bg2.addColorStop(1,rgba(cc,.02));ctx.fillStyle=bg2;ctx.fill();
    // tarjeta holográfica
    var fl=reduce?0:Math.sin(t*.03)*.03+(Math.sin(t*.0017)>.995?-.1:0);
    ctx.save();ctx.translate(px,py+bh*(1-ease));ctx.scale(sc,sc*ease);
    ctx.globalAlpha=.94+fl;ctx.shadowColor=cc;ctx.shadowBlur=7;
    ctx.fillStyle='rgba(6,10,24,.9)';ctx.strokeStyle=rgba(cc,.6);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(CW-14,0);ctx.lineTo(CW,14);ctx.lineTo(CW,CH);ctx.lineTo(14,CH);ctx.lineTo(0,CH-14);ctx.closePath();ctx.fill();ctx.fillStyle=rgba(cc,.06);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    // líneas de barrido
    ctx.save();ctx.clip();ctx.fillStyle='rgba(180,220,255,.05)';for(var yy=(reduce?0:(t*.03)%4);yy<CH;yy+=4)ctx.fillRect(0,yy,CW,1);
    var sw=reduce?-40:((t*.08)%(CH+80))-40;var sg=ctx.createLinearGradient(0,sw-30,0,sw+30);sg.addColorStop(0,rgba(cc,0));sg.addColorStop(.5,rgba(cc,.09));sg.addColorStop(1,rgba(cc,0));ctx.fillStyle=sg;ctx.fillRect(0,sw-30,CW,60);ctx.restore();
    var y0=pad;ctx.textAlign='left';
    ctx.fillStyle=rgba(cc,1);ctx.font='600 17px Orbitron,sans-serif';ctx.fillText(sel.n.toUpperCase(),pad,y0+16);
    ctx.fillStyle='#8b97bd';ctx.font='400 12px Inter,sans-serif';ctx.fillText(sel.s,pad,y0+34);
    y0+=26+18+10;ctx.save();ctx.translate(pad,y0);ctx.beginPath();ctx.rect(0,0,IW,IH);ctx.clip();ctx.fillStyle='rgba(3,6,16,.7)';ctx.fillRect(0,0,IW,IH);ctx.textAlign='left';if(ILL[sel.id])ILL[sel.id](cc,t);ctx.restore();ctx.strokeStyle=rgba(cc,.3);ctx.lineWidth=1;ctx.strokeRect(pad+.5,y0+.5,IW-1,IH-1);y0+=IH+12;ctx.fillStyle='#d5defa';ctx.font='400 13px Inter,sans-serif';desc.forEach(function(l,i){ctx.fillText(l,pad,y0+13+i*18)});y0+=desc.length*18+8;
    inf.i.forEach(function(x,i){ctx.fillStyle=rgba(cc,1);ctx.fillRect(pad,y0+i*21+6,5,5);ctx.fillStyle='#eef3ff';ctx.font='500 13px Inter,sans-serif';ctx.fillText(x,pad+14,y0+i*21+13)});y0+=inf.i.length*21+12;
    var lkr=null;if(inf.h){ctx.fillStyle=rgba(cc,1);ctx.font='600 12px Orbitron,sans-serif';ctx.fillText('ABRIR ESTA PANTALLA →',pad,y0+14);lkr={x:px+pad*sc,y:py+(y0)*sc,w:200*sc,h:22*sc};y0+=30}
    ctx.fillStyle='#8b97bd';ctx.font='400 12px Inter,sans-serif';cn.forEach(function(l,i){ctx.fillText(l,pad,y0+12+i*16)});
    ctx.fillStyle=rgba(cc,.9);ctx.font='400 18px sans-serif';ctx.textAlign='right';ctx.fillText('×',CW-12,22);
    ctx.restore();
    if(u>=1)holo={x:px,y:py,w:bw,h:bh,link:lkr,href:inf.h,close:{x:px+bw-34*sc,y:py,w:34*sc,h:34*sc}};
  }
}

// ilustraciones de los hologramas
var IW=294,IH=116,ILS=1;
function m3(x,y,z,tt){var a=reduce?.7:tt*.0005,ca=Math.cos(a),sa=Math.sin(a),cp=Math.cos(.55),sp=Math.sin(.55),X=x*ca+z*sa,Z=-x*sa+z*ca;return {x:IW/2+X*ILS,y:IH*.8-(y*cp-Z*sp)*ILS,d:y*sp+Z*cp}}
function mbox(cx,cy,cz,sx,sy,sz,col,al,tt){var h=[sx/2,sy/2,sz/2],vs=[],i;for(i=0;i<8;i++)vs.push(m3(cx+(i&1?h[0]:-h[0]),cy+(i&2?h[1]:-h[1]),cz+(i&4?h[2]:-h[2]),tt));
  var F=[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]].map(function(f){return {f:f,d:(vs[f[0]].d+vs[f[1]].d+vs[f[2]].d+vs[f[3]].d)/4}}).sort(function(a,b){return b.d-a.d});
  F.forEach(function(o,k){ctx.beginPath();o.f.forEach(function(v,j){j?ctx.lineTo(vs[v].x,vs[v].y):ctx.moveTo(vs[v].x,vs[v].y)});ctx.closePath();ctx.fillStyle=rgba(col,al*(.55+.12*k));ctx.fill();ctx.strokeStyle=rgba(col,.55);ctx.lineWidth=.8;ctx.stroke()})}
var ILL={
 gemelo:function(c,tt){ILS=1.0;mbox(0,4,0,118,8,40,c,.5,tt);mbox(-50,22,0,18,22,22,c,.7,tt);mbox(-22,24,0,44,9,9,c,.8,tt);mbox(-34,36,0,12,12,12,c,.6,tt);
   [28,44,60].forEach(function(x){mbox(x,24,0,6,32,30,c,.7,tt)});mbox(44,10,0,40,5,5,c,.4,tt);},
 planta:function(c,tt){ILS=.85;mbox(0,1,0,230,2,100,c,.25,tt);mbox(0,13,0,230,22,100,c,.06,tt);
   [-80,0,80].forEach(function(x){[-26,26].forEach(function(z){mbox(x,8,z,52,14,22,c,.7,tt)})});mbox(0,4,0,200,2,6,c,.5,tt);},
 centro:function(c,tt){[0,1,2].forEach(function(i){var x=10+i*94,y=14;ctx.fillStyle='rgba(4,8,20,.9)';ctx.strokeStyle=rgba(c,.6);ctx.lineWidth=1;ctx.fillRect(x,y,84,70);ctx.strokeRect(x,y,84,70);
     for(var b=0;b<6;b++){var hh=10+Math.abs(Math.sin(tt*.0013+b*.9+i*1.7))*38;ctx.fillStyle=rgba(c,.75);ctx.fillRect(x+8+b*12,y+62-hh,8,hh)}
     ctx.fillStyle=rgba(c,.5);ctx.fillRect(x+30,y+84,24,4);ctx.fillRect(x+20,y+88,44,3)});},
 aps:function(c,tt){var rows=[[0,.35,.2,.4],[.3,.3,.45,.2],[.1,.5,.2,.5],[.55,.25,.4,.35]],cols=[C.live,C.plan,C.calc,C.fut];
   for(var r=0;r<4;r++){ctx.fillStyle='rgba(140,160,255,.35)';ctx.fillRect(4,16+r*22,28,6);var x0=40;
     rows[r].forEach(function(v,j){if(j%2)return;var w=(rows[r][j+1]||.2)*IW*.5,x=x0+v*IW*.45;ctx.fillStyle=rgba(cols[(r+j)%4],.8);ctx.fillRect(x,14+r*22,w,12)})}
   var cx=40+((reduce?.4:(tt*.00006)%1))*(IW-50);ctx.strokeStyle=rgba(c,.9);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(cx,6);ctx.lineTo(cx,IH-4);ctx.stroke();},
 cosim:function(c,tt){ctx.strokeStyle='rgba(140,160,255,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(12,IH-14);ctx.lineTo(IW-6,IH-14);ctx.moveTo(12,8);ctx.lineTo(12,IH-14);ctx.stroke();
   [0,1,2].forEach(function(k){ctx.strokeStyle=rgba(c,k===0?.95:.3);ctx.lineWidth=k===0?1.8:1;ctx.beginPath();for(var x=0;x<=1;x+=.02){var y=(1-x)*(k===0?.9:.6)*Math.exp(-x*(k+2))+.1+(k?Math.sin(x*14+k+(reduce?0:tt*.002))*.08*(1-x):0);var px=12+x*(IW-20),py=IH-14-y*(IH-30)*1.1;x?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke()});
   var u=reduce?.6:(tt*.0003)%1,y=(1-u)*.9*Math.exp(-u*2)+.1;ctx.fillStyle=rgba(c,1);ctx.beginPath();ctx.arc(12+u*(IW-20),IH-14-y*(IH-30)*1.1,3.5,0,6.283);ctx.fill();
   ctx.fillStyle=rgba(c,.6);ctx.font='13px Inter,sans-serif';ctx.textAlign='left';ctx.fillText('Σ  ∫  ≤  min',IW-100,18)},
 fractal:function(c,tt){var hi=reduce?1:Math.floor(tt*.0007)%6;for(var k=0;k<6;k++){var ang=(k-2.5)*.28,on=k===hi;ctx.strokeStyle=rgba(c,on?1:.35);ctx.lineWidth=on?2:1;ctx.beginPath();ctx.moveTo(14,IH/2);
     ctx.bezierCurveTo(90,IH/2,120,IH/2+ang*120,IW-40,IH/2+ang*150);ctx.stroke();ctx.fillStyle=rgba(c,on?1:.5);ctx.beginPath();ctx.arc(IW-40,IH/2+ang*150,on?5:3,0,6.283);ctx.fill();
     for(var b=0;b<2;b++){var q=.45+b*.2;var bx=14+(IW-54)*q,by=IH/2+ang*150*q*q;ctx.strokeStyle=rgba(c,.2);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+26,by+ang*24*(b?1:-1));ctx.stroke()}}
   ctx.fillStyle=rgba(c,1);ctx.beginPath();ctx.arc(14,IH/2,4,0,6.283);ctx.fill()},
 usuario:function(c,tt){var sw=reduce?0:Math.sin(tt*.001)*4;ctx.fillStyle=rgba(c,.8);ctx.beginPath();ctx.arc(IW/2,86,9,0,6.283);ctx.fill();
   ctx.beginPath();ctx.moveTo(IW/2-26,IH);ctx.quadraticCurveTo(IW/2-26,98,IW/2,98);ctx.quadraticCurveTo(IW/2+26,98,IW/2+26,IH);ctx.closePath();ctx.fillStyle=rgba(c,.5);ctx.fill();
   [[-96,8,-.18],[-30,2,0],[36,8,.18]].forEach(function(p,i){var x=IW/2+p[0]+sw*(i-1),y=p[1];ctx.save();ctx.translate(x+30,y+30);ctx.transform(1,p[2],0,1,0,0);ctx.fillStyle='rgba(4,8,20,.9)';ctx.strokeStyle=rgba(c,.7);ctx.lineWidth=1;ctx.fillRect(-30,-30,60,54);ctx.strokeRect(-30,-30,60,54);
     for(var b=0;b<4;b++){var hh=8+Math.abs(Math.sin(tt*.0012+b+i*2))*26;ctx.fillStyle=rgba(i===1?C.live:C.fut,.8);ctx.fillRect(-22+b*12,18-hh,8,hh)}ctx.restore()})}
};
function showPanel(){selT=t}
function wrap(txt,w,font){ctx.font=font;var ws=txt.split(' '),ln=[],cur='';ws.forEach(function(x){var tt=cur?cur+' '+x:x;if(ctx.measureText(tt).width>w&&cur){ln.push(cur);cur=x}else cur=tt});if(cur)ln.push(cur);return ln}
function inR(r,x,y){return r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h}
function pick(x,y){var best=null,bz=1e9;hits.forEach(function(h){var dx=(x-h.x)/h.rx,dy=(y-h.y)/h.ry;if(dx*dx+dy*dy<=1.1){var z=pr(h.p.x,h.p.y,h.p.z).z;if(z<bz){bz=z;best=h.p}}});return best}
cv.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY,m:0};cv.classList.add('drag');cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',function(e){if(!drag){if(e.pointerType==='mouse'){var rr=cv.getBoundingClientRect(),hp=pick(e.clientX-rr.left,e.clientY-rr.top),ov=holo&&e.clientX-rr.left>=holo.x&&e.clientX-rr.left<=holo.x+holo.w&&e.clientY-rr.top>=holo.y&&e.clientY-rr.top<=holo.y+holo.h;hov=ov?null:hp;cv.style.cursor=(hov||ov)?'pointer':''}return}var dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.m+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;yaw+=dx*.005;if(e.pointerType==='mouse')pitch=Math.max(.12,Math.min(1.1,pitch+dy*.004))});
cv.addEventListener('pointerup',function(e){cv.classList.remove('drag');if(drag&&drag.m<6){var r=cv.getBoundingClientRect(),p=pick(e.clientX-r.left,e.clientY-r.top);var cx=e.clientX-r.left,cy=e.clientY-r.top;if(holo&&inR(holo.close,cx,cy)){sel=null}else if(holo&&holo.link&&inR(holo.link,cx,cy)){var an=document.createElement('a');an.href=holo.href;an.target='_self';an.rel='noopener';document.body.appendChild(an);an.click();an.remove()}else if(holo&&inR(holo,cx,cy)){}else if(p){sel=p;showPanel()}else if(sel){sel=null}}drag=null});
cv.addEventListener('pointerleave',function(){hov=null;cv.style.cursor=''});
cv.addEventListener('pointercancel',function(){drag=null;cv.classList.remove('drag')});
function loop(ts){t=ts;if(visible&&!document.hidden)draw();requestAnimationFrame(loop)}
showPanel();requestAnimationFrame(loop);

}
