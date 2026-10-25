/* global window, document */
import { webkit } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await webkit.launch();
const page = await browser.newPage({viewport:{width:2000,height:1100},deviceScaleFactor:2});
const errors=[];
const results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  for (const sheet of ['turnaround','variants','details']) {
    await page.goto('http://127.0.0.1:5173/houses.html?sheet='+sheet);
    await page.waitForFunction(()=>window.__ready===true);
    await page.locator('#sheet').screenshot({path:'docs/visual/named-houses/'+sheet+'.png'});
    const metrics = await page.evaluate(()=>window.__review);
    results.push({sheet,...metrics});
    console.log(sheet,metrics);
  }
  const map = JSON.parse(await readFile('packages/shared/src/map/town.json', 'utf8'));
  const houses = JSON.parse(await readFile('packages/shared/src/map/houses.json', 'utf8'));
  await page.setContent('<body style="margin:0;background:#fbf5e9"><canvas id="map" width="1120" height="900"></canvas></body>');
  await page.evaluate(({ map, houses }) => {
    const canvas = document.getElementById('map');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fbf5e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#513821';
    ctx.fillText('15 Houses · Location plan', 24, 35);
    ctx.font = '14px sans-serif'; ctx.fillText('Minimum pairwise distance: 11.31 tiles (exact optimum)', 24, 60);
    const colors = { '~':'#bad5da', '.':'#dce6bc', ',':'#eadfbf', '^':'#a6b696', '=':'#f1e3c8', '*':'#cee0ac', B:'#d6b58b', '#':'#dce6bc' };
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      ctx.fillStyle=colors[map.grid[y][x]];ctx.fillRect(24+x*5,82+y*5,5,5);
    }
    for(const p of houses.selection.originalPlots){
      if(houses.houses.some(h=>h.x===p.x&&h.y===p.y))continue;
      ctx.strokeStyle='#b87c76';ctx.lineWidth=2;
      ctx.strokeRect(24+p.x*5,82+p.y*5,20,20);
    }
    houses.houses.forEach((h,i)=>{
      const x=24+(h.x+2)*5,y=82+(h.y+2)*5;
      ctx.fillStyle='#547b48';ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fffdf2';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(String(i+1),x,y);
      ctx.textAlign='left';ctx.fillStyle='#513821';ctx.font='17px sans-serif';
      ctx.fillText((i+1)+'. '+h.name,740,115+i*39);
    });
    ctx.fillStyle='#547b48';ctx.fillRect(740,745,15,15);
    ctx.fillStyle='#513821';ctx.font='15px sans-serif';ctx.fillText('Retained house',765,753);
    ctx.strokeStyle='#b87c76';ctx.strokeRect(740,785,15,15);
    ctx.fillStyle='#513821';ctx.fillText('Removed / restored to grass',765,793);
  }, { map, houses });
  await page.locator('#map').screenshot({path:'docs/visual/named-houses/locations.png'});
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile('docs/visual/named-houses/model-metrics.json',JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); }
