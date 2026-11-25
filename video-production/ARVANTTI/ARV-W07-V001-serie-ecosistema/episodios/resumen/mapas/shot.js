const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
for(const f of process.argv.slice(2)){p.on('console',m=>console.log(f,m.text()));p.on('pageerror',e=>console.log(f,'ERR',e.message));await p.goto('file://'+process.cwd()+'/'+f+'.html');await p.waitForTimeout(500);await p.screenshot({path:f+'.png'});}
await b.close();})();
