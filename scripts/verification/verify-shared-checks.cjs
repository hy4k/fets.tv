// Isolated component browser checks with explicitly fictional data. No production writes.
const fs=require('fs');const path=require('path');const http=require('http');const assert=require('assert/strict');
const {build}=require(process.env.FETS_ESBUILD_MODULE||'esbuild');
const {chromium}=require(process.env.FETS_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.cwd(),out=process.env.FETS_CHECK_PREVIEW||'/tmp/fets-shared-checks-preview';fs.mkdirSync(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SharedChecks}from'./components/console/SharedShiftChecks';createRoot(document.getElementById('root')).render(<SharedChecks date="2026-10-27" centerName="Cochin · training data"/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:true,outfile:path.join(out,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_BASE_PATH':'""'},plugins:[{name:'isolated-context',setup(b){b.onResolve({filter:/^@\/lib\/console-data$/},()=>({path:'context',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const useConsole=()=>({});'}));}}]});
 const css=fs.readdirSync('.next/static/chunks').filter(x=>x.endsWith('.css')).map(x=>fs.readFileSync('.next/static/chunks/'+x,'utf8')).join('\n');fs.writeFileSync(path.join(out,'app.css'),css);
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:#10191b;color:#e5efec;margin:0;padding:16px"><div style="font:12px sans-serif;margin-bottom:12px">TRAINING PREVIEW — fictional staff and in-memory checks</div><div id="root"></div><script src="/app.js"></script></body></html>';
 const server=http.createServer((req,res)=>{const name=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');res.end(name?fs.readFileSync(path.join(out,name)):html);}).listen(3041,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const reports=[];
 try{for(const width of [1440,393,320]){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let writes=0,fail=false,readFail=false;
  const data={connected:true,server_now:'2026-10-27T02:40:00Z',viewer_id:'staff-a',viewer_rostered:true,plan:{id:'00000000-0000-0000-0000-000000000001',day:'2026-10-27',branch:'cochin',version:1,closed:false,format:2,tracking_from:'2026-10-27T02:30:00Z'},checks:[]};
  for(let b=0;b<6;b++)for(const kind of ['walk','dvr'])for(let due=480+b*90+(kind==='walk'?10:6);due<=570+b*90;due+=(kind==='walk'?10:6))data.checks.push({block:b,kind,due,owner_id:kind==='walk'?'staff-a':'staff-b',owner_name:kind==='walk'?'Alex · sample':'Sam · sample',event:null});
  data.checks.sort((a,b)=>a.due-b.due);
  await page.route('**/api/fets-live/checks**',async route=>{
   if(route.request().method()==='POST'){
    writes++;if(fail)return route.fulfill({status:409,json:{error:'Save failed. Your note is retained.'}});
    const p=route.request().postDataJSON();const c=data.checks.find(c=>c.block===p.block&&c.kind===p.kind&&c.due===p.due);c.event={id:'sample-event',actor_id:'staff-a',actor_name:'Alex · sample',created_at:data.server_now,note:p.note};return route.fulfill({json:{event:c.event}});
   }
   return route.fulfill({status:readFail?503:200,json:readFail?{error:'Connection unavailable'}:data});
  });
  await page.goto('http://127.0.0.1:3041');await page.getByRole('button',{name:'Record completed walk'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Record completed walk'}).isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:'Record completed DVR check'}).isEnabled(),false);
  await page.locator('#note-walk').fill('Training: all stations checked');fail=true;await page.getByRole('button',{name:'Record completed walk'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('#note-walk').inputValue(),'Training: all stations checked');
  fail=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Record completed walk'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[role=alert]'));await page.getByRole('button',{name:'Record completed walk'}).click();await page.getByText(/Recorded by Alex/).waitFor();assert.equal(writes,2);
  await page.getByText('View the day’s checks').click();await page.screenshot({path:path.join(out,`shared-checks-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  readFail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Download check log'}).isEnabled(),false);
  readFail=false;data.plan=null;data.reason='Publish this day in The Shift before recording checks.';await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Publish this day in The Shift before recording checks.').waitFor();assert.equal(await page.getByRole('button',{name:'Record completed walk'}).count(),0);
  reports.push({width,errors,writes,overflow:false,failedSaveDraftRetained:true,canonicalEventVisible:true,unavailableBlocked:true,unpublishedBlocked:true});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
