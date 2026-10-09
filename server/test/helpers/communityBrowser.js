import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
export async function checkCommunityBrowser(base,output) {
 const {chromium}=await import(pathToFileURL(process.env.COMMUNITY_PLAYWRIGHT_MODULE));
 const browser=await chromium.launch({headless:true,executablePath:process.env.COMMUNITY_CHROMIUM_PATH,args:['--no-sandbox']});
 await mkdir(output,{recursive:true});const evidence=[];
 try {
  for(const width of [1440,390,320])for(const theme of ['light','dark']) {
   const context=await browser.newContext({viewport:{width,height:980}});
   await context.addInitScript(theme=>localStorage.setItem('mrti_theme',theme),theme);
   const page=await context.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes('/community/'))return route.continue();
    if(path.endsWith('/brand-appearance'))return route.fulfill({json:{data:{}}});
    if(path.endsWith('/company-home'))return route.fulfill({status:503,json:{error:'Fixture'}});
    if(path.endsWith('/company-news'))return route.fulfill({json:{data:[]}});
    if(path.endsWith('/auth/me'))return route.fulfill({json:{profile:{id:'admin',role:'administrator',full_name:'Administración QA',allowed_modules:['rh']}}});
    return route.fulfill({json:{data:[]}});
   });
   await page.goto(base);await page.getByRole('heading',{name:'Lo que nos une'}).waitFor();
   await page.getByText('Persona QA', {exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Administrar comunidad'}).count(),0);
   assert.ok(await page.getByRole('link',{name:'Iniciar sesión para participar'}).isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})))));
   await page.locator('#comunidad').screenshot({path:`${output}/community-${width}-${theme}.png`});
   await page.getByRole('button',{name:'Enviar un mensaje'}).click();
   await page.locator('[name=subject]').fill('Prueba desde navegador');await page.locator('[name=body]').fill('Mensaje anónimo de prueba sin información personal.');
   await page.getByText(/¿Cuánto es/).waitFor();
   const question=await page.locator('[data-question]').textContent(),nums=question.match(/\d+/g).map(Number);
   await page.locator('[name=answer]').fill(String(nums[0]+nums[1]));
   if(width===1440&&theme==='light') {
    const outgoing=page.waitForRequest(r=>r.url().endsWith('/community/reports')&&r.method()==='POST');
    await page.getByRole('button',{name:'Enviar de forma anónima'}).click();const sent=await outgoing;
    assert.equal(sent.headers().authorization,undefined);assert.equal(sent.headers().cookie,undefined);
    await page.getByRole('heading',{name:'Tu mensaje fue recibido'}).waitFor();
    const [folio,code]=await page.locator('.community-receipt dd').allTextContents();
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.getByRole('button',{name:'Consultar mi folio'}).click();await page.locator('[name=folio]').fill(folio);await page.locator('[name=access_code]').fill(code);
    await page.getByRole('button',{name:'Consultar respuesta',exact:true}).click();await page.locator('.community-status').getByText('Recibido',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.evaluate(()=>localStorage.setItem('auth_token','admin'));await page.reload();
    await page.getByRole('button',{name:'Administrar comunidad'}).click();await page.getByRole('button',{name:/Prueba desde navegador/}).click();
    await page.locator('[name=status]').selectOption('resolved');await page.locator('[name=public_reply]').fill('Respuesta pública QA');await page.locator('[name=internal_note]').fill('Nota reservada QA');
    await page.getByRole('button',{name:'Guardar seguimiento'}).click();await page.getByText('Seguimiento guardado.').waitFor();
    await page.getByRole('button',{name:'Encuestas',exact:true}).click();await page.getByText('Crear una encuesta',{exact:true}).click();
    await page.locator('[name=question]').fill('¿Qué actividad prefieres para la comunidad?');await page.locator('[name=options]').fill('Deporte\nConvivencia');
    await page.locator('[name=closes_at]').fill('2026-12-01T12:00');await page.getByRole('button',{name:'Publicar encuesta'}).click();await page.locator('.community-admin-poll').getByRole('heading',{name:'¿Qué actividad prefieres para la comunidad?'}).waitFor();
    await page.getByRole('button',{name:'Límites del canal'}).click();await page.locator('[name=hourly_limit]').fill('6');await page.getByRole('button',{name:'Guardar límites'}).click();await page.getByText('Límites guardados.').waitFor();
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.evaluate(()=>localStorage.setItem('auth_token','viewer2'));await page.reload();
    await page.getByLabel('Deporte',{exact:true}).check();await page.getByRole('button',{name:'Enviar respuesta',exact:true}).click();await page.getByText('Tu participación quedó registrada. Gracias.').waitFor();
    await page.reload();await page.getByText('Tu participación quedó registrada. Gracias.').waitFor();
    await page.evaluate(()=>localStorage.removeItem('auth_token'));await page.reload();await page.getByRole('button',{name:'Consultar mi folio'}).click();await page.locator('[name=folio]').fill(folio);await page.locator('[name=access_code]').fill(code);await page.getByRole('button',{name:'Consultar respuesta',exact:true}).click();await page.getByText('Respuesta pública QA',{exact:true}).waitFor();assert.equal(await page.getByText('Nota reservada QA',{exact:true}).count(),0);
   }
   assert.equal(await page.locator('dialog').evaluate(d=>d.scrollWidth>d.clientWidth),false);
   await page.screenshot({path:`${output}/dialog-${width}-${theme}.png`});await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
   assert.deepEqual(errors,[]);evidence.push({width,theme,overflow:false,jsErrors:errors.length});await context.close();
  }
 }finally{await browser.close();await writeFile(`${output}/browser-results.json`,JSON.stringify(evidence,null,2));}
}
