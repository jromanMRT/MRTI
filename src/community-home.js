import './community-home.css';
const BASE='/api/portal/v1/community';
const STATES={received:'Recibido',reviewing:'En revisión',resolved:'Atendido',spam:'Spam'};
const TYPES={queja:'Queja',denuncia:'Denuncia',sugerencia:'Sugerencia'};
const e = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value ? new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString('es-MX',{day:'numeric',month:'long'}) : '';
const time = value => new Date(value).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
async function request(path,{private:auth=false,...options}={}) {
  const headers={'Content-Type':'application/json'};
  if(auth) headers.Authorization=`Bearer ${localStorage.getItem('auth_token')||''}`;
  const r=await fetch(BASE+path,{...options,headers,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(body.error||'No fue posible completar la operación.'),{status:r.status});
  return body;
}
function message(node,copy,error=false) {node.textContent=copy;node.className=`community-message${error?' is-error':''}`;node.hidden=false;}
function modal(title,content,wide=false) {
  const dialog=document.createElement('dialog');dialog.className=`community-dialog${wide?' is-wide':''}`;
  dialog.innerHTML=`<div class="community-dialog-head"><h2 id="community-dialog-title">${e(title)}</h2><button type="button" data-close aria-label="Cerrar">×</button></div><div class="community-dialog-body">${content}</div>`;
  dialog.setAttribute('aria-labelledby','community-dialog-title');document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();return dialog;
}
export function communityMarkup() {
  return `<section class="community-home" id="comunidad" aria-labelledby="community-title">
    <div class="community-heading"><div><p class="section-label">Nuestra comunidad</p><h2 id="community-title">Lo que nos une</h2><p>Celebramos juntos, nos mantenemos al día y escuchamos tu voz.</p></div><button class="secondary-button" id="community-admin" hidden>Administrar comunidad</button></div>
    <nav class="community-shortcuts" aria-label="Secciones de la comunidad"><a href="#community-birthdays">Cumpleaños</a><a href="#community-events">Próximos eventos</a><a href="#community-polls">Encuestas</a><a href="#community-channel">Canal anónimo</a></nav>
    <div class="community-grid">
      <section class="community-card" id="community-birthdays"><div class="community-card-heading"><span class="community-symbol" aria-hidden="true">✦</span><div><p class="section-label">Motivos para celebrar</p><h3>Cumpleaños</h3></div></div><div data-birthdays aria-live="polite"><p class="community-muted">Cargando celebraciones…</p></div></section>
      <section class="community-card" id="community-events"><div class="community-card-heading"><span class="community-symbol" aria-hidden="true">▦</span><div><p class="section-label">En nuestra agenda</p><h3>Próximos eventos</h3></div></div><div data-events aria-live="polite"><p class="community-muted">Cargando agenda…</p></div></section>
    </div>
    <section class="community-card community-polls" id="community-polls"><div class="community-card-heading"><span class="community-symbol" aria-hidden="true">✓</span><div><p class="section-label">Tu opinión cuenta</p><h3>Encuestas</h3></div></div><div data-polls aria-live="polite"></div></section>
    <section class="community-channel" id="community-channel"><div><span class="community-label">Siempre anónimo · Sin iniciar sesión</span><h3>Un espacio para escucharte</h3><p>Comparte una queja, denuncia o sugerencia. Sólo Recursos Humanos y administradores pueden atender tu mensaje.</p><p class="community-channel-note">No solicitamos nombre ni correo. Guarda tu folio y clave para consultar la respuesta.</p></div><div class="community-channel-actions"><button class="primary-button" id="community-report-open">Enviar un mensaje</button><button class="secondary-button" id="community-status-open">Consultar mi folio</button><span data-channel-state aria-live="polite"></span></div></section>
  </section>`;
}
export function mountCommunity() {
  const root=document.querySelector('#comunidad');if(!root)return;
  async function loadCalendar() {
    try {
      const {data}=await request('/calendar');
      const birthdays=root.querySelector('[data-birthdays]');
      const today=data.birthdays.filter(p=>p.date===data.range.from), upcoming=data.birthdays.filter(p=>p.date!==data.range.from);
      const rows=items=>items.map(p=>`<li><span class="community-avatar" aria-hidden="true">${e(p.name.split(' ').filter(Boolean).slice(0,2).map(v=>v[0]).join(''))}</span><div><strong>${e(p.name)}</strong><small>${e(p.company)}</small></div><time datetime="${e(p.date)}">${e(p.date===data.range.from?'¡Hoy!':date(p.date))}</time></li>`).join('');
      birthdays.innerHTML=`${today.length?`<p class="community-today">¡Feliz cumpleaños!</p><ul class="community-people">${rows(today)}</ul>`:'<p class="community-muted">Hoy no hay cumpleaños registrados.</p>'}${upcoming.length?`<p class="community-list-label">En los próximos 30 días</p><ul class="community-people">${rows(upcoming.slice(0,5))}</ul>${upcoming.length>5?`<details><summary>Ver ${upcoming.length-5} cumpleaños más</summary><ul class="community-people">${rows(upcoming.slice(5))}</ul></details>`:''}`:''}`;
      const events=data.events.map(v=>`<article class="community-event"><div class="community-date"><strong>${e(v.starts_at.slice(8,10))}</strong><span>${e(new Date(v.starts_at).toLocaleDateString('es-MX',{month:'short'}))}</span></div><div><h4>${e(v.title)}</h4><p>${e(date(v.starts_at))}${v.all_day?' · Todo el día':` · ${e(time(v.starts_at))}`}${v.ends_at&&v.ends_at!==v.starts_at?` — ${e(date(v.ends_at))}${v.all_day?'':` · ${e(time(v.ends_at))}`}`:''}</p>${v.location_label?`<small>${e(v.location_label)}</small>`:''}${v.description?`<p class="community-event-description">${e(v.description)}</p>`:''}${v.company?`<small>${e(v.company)}</small>`:''}</div></article>`);
      root.querySelector('[data-events]').innerHTML=events.length?events.slice(0,4).join('')+(events.length>4?`<details><summary>Ver ${events.length-4} eventos más</summary>${events.slice(4).join('')}</details>`:''):'<p class="community-empty">No hay eventos programados para los próximos 30 días. Aquí aparecerán las nuevas actividades.</p>';
    } catch(err) {for(const selector of ['[data-birthdays]','[data-events]'])root.querySelector(selector).innerHTML=`<p class="community-muted">${e(err.message)}</p><button class="secondary-button" data-calendar-retry>Reintentar</button>`;root.querySelectorAll('[data-calendar-retry]').forEach(b=>b.onclick=loadCalendar);}
  }
  async function loadPolls() {
    const host=root.querySelector('[data-polls]');
    const login=()=>{host.innerHTML='<p class="community-muted">Inicia sesión para ver las encuestas disponibles y participar una sola vez en cada una.</p><a class="primary-button community-inline" href="/login?returnTo=%2F%23community-polls">Iniciar sesión para participar</a>';};
    if(!localStorage.getItem('auth_token'))return login();
    try {
      const {data}=await request('/polls',{private:true});
      host.innerHTML=data.length?`<div class="community-poll-grid">${data.map(p=>`<form data-poll="${e(p.id)}" class="community-poll"><fieldset><legend>${e(p.question)}</legend><p class="community-muted">Cierra el ${e(date(p.closes_at))} a las ${e(time(p.closes_at))}</p>${p.options.map((option,i)=>`<label class="community-option"><input type="radio" name="option" value="${i}" ${p.my_vote!==null?'disabled':''} ${p.my_vote===i?'checked':''} required><span>${e(option)}</span></label>`).join('')}</fieldset>${p.my_vote!==null?'<p class="community-success">Tu participación quedó registrada. Gracias.</p>':'<button type="submit" class="primary-button">Enviar respuesta</button>'}<p data-message role="status" hidden></p></form>`).join('')}</div>`:'<p class="community-empty">No hay encuestas abiertas por ahora. Aquí podrás participar cuando se publique una nueva.</p>';
      host.querySelectorAll('[data-poll]').forEach(form=>form.onsubmit=async ev=>{
        ev.preventDefault();const b=form.querySelector('button');b.disabled=true;
        try {await request(`/polls/${form.dataset.poll}/vote`,{private:true,method:'POST',body:JSON.stringify({option_index:Number(new FormData(form).get('option'))})});await loadPolls();}
        catch(err){message(form.querySelector('[data-message]'),err.message,true);b.disabled=false;}
      });
    }catch(err){if(err.status===401)return login();host.innerHTML=`<p class="community-muted">${e(err.message)}</p>`;}
  }
  root.querySelector('#community-report-open').onclick=openReport;
  root.querySelector('#community-status-open').onclick=openStatus;
  void request('/channel').then(({data})=>{if(!data.enabled){root.querySelector('#community-report-open').disabled=true;root.querySelector('[data-channel-state]').textContent='El canal está pausado temporalmente. Puedes consultar tu folio.';}}).catch(()=>{});
  if(localStorage.getItem('auth_token'))void request('/admin/capabilities',{private:true}).then(({data})=>{
    const b=root.querySelector('#community-admin');b.hidden=false;b.onclick=()=>openAdmin(data.can_write,loadPolls);
  }).catch(()=>{});
  void loadCalendar();void loadPolls();
}
function openReport() {
  const d=modal('Canal anónimo',`<p class="community-muted">Tu mensaje se entrega a RH y administradores sin vincularlo con tu cuenta. Evita incluir datos que te identifiquen si deseas mantener el anonimato.</p><form id="community-report-form" class="community-form"><label>Tipo de mensaje<select name="category">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Asunto<input name="subject" required minlength="5" maxlength="160" autocomplete="off"></label><label>¿Qué ocurrió o qué propones?<textarea name="body" required minlength="20" maxlength="5000" rows="6" placeholder="Describe los hechos, fechas o lugares que ayuden a atender el mensaje. Mínimo 20 caracteres."></textarea></label><div class="community-trap" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div><div class="community-verification"><label><span data-question>Cargando verificación…</span><input name="answer" inputmode="numeric" autocomplete="off" required maxlength="2" pattern="[0-9]{1,2}"></label><button type="button" class="secondary-button" data-refresh>Otra verificación</button></div><p class="community-muted">Para evitar spam hay límites de envío por red. No guardamos tu IP en el reporte; la infraestructura puede conservar registros técnicos de conexión.</p><p data-message role="status" hidden></p><button type="submit" class="primary-button" disabled>Enviar de forma anónima</button></form>`);
  const form=d.querySelector('form'), submit=form.querySelector('[type=submit]');let token='',readyTimer;
  d.addEventListener('close',()=>clearTimeout(readyTimer));
  const challenge=async()=>{submit.disabled=true;clearTimeout(readyTimer);token='';try {const {data}=await request('/challenge');if(!d.isConnected)return;token=data.token;form.querySelector('[data-question]').textContent=data.question;form.elements.answer.value='';readyTimer=setTimeout(()=>{submit.disabled=false;},3100);}catch(err){message(form.querySelector('[data-message]'),err.message,true);}};
  form.querySelector('[data-refresh]').onclick=challenge;
  form.onsubmit=async ev=>{ev.preventDefault();submit.disabled=true;
    try {const values=Object.fromEntries(new FormData(form));const {data}=await request('/reports',{method:'POST',body:JSON.stringify({...values,challenge_token:token})});
      d.querySelector('.community-dialog-body').innerHTML=`<div class="community-receipt"><span class="community-symbol" aria-hidden="true">✓</span><h3>Tu mensaje fue recibido</h3><p>Guarda estos datos. La clave se muestra una sola vez y permite consultar la respuesta sin identificarte.</p><dl><dt>Folio</dt><dd>${e(data.folio)}</dd><dt>Clave de consulta</dt><dd>${e(data.access_code)}</dd></dl><button class="primary-button" data-download>Guardar comprobante</button><p class="community-muted">No compartas tu clave. Sin ella no podremos recuperar el acceso a tu folio.</p></div>`;
      d.querySelector('[data-download]').onclick=()=>{const u=URL.createObjectURL(new Blob([`Canal anónimo MRTI\nFolio: ${data.folio}\nClave de consulta: ${data.access_code}\nConsulta la respuesta en la portada de MRTI → Consultar mi folio.\n`],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=`${data.folio}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
    }catch(err){message(form.querySelector('[data-message]'),err.message,true);if(err.status!==409&&err.status!==429)submit.disabled=false;}
  };void challenge();
}
function openStatus() {
  const d=modal('Consultar mi folio',`<form class="community-form"><label>Folio<input name="folio" required maxlength="24" autocomplete="off" placeholder="MRT-…"></label><label>Clave de consulta<input name="access_code" type="password" required maxlength="64" autocomplete="off"></label><button class="primary-button" type="submit">Consultar respuesta</button><p data-message role="status" hidden></p></form><div data-result aria-live="polite"></div>`);
  const f=d.querySelector('form');f.onsubmit=async ev=>{ev.preventDefault();const b=f.querySelector('button');b.disabled=true;d.querySelector('[data-result]').innerHTML='';f.querySelector('[data-message]').hidden=true;
    try {const {data}=await request('/report-status',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});d.querySelector('[data-result]').innerHTML=`<article class="community-status"><span class="community-badge">${e(STATES[data.status])}</span><h3>${e(data.folio)}</h3><p class="community-preserve">${e(data.public_reply||'Todavía no hay una respuesta. Puedes volver a consultar con tu folio y clave.')}</p><small>Última actualización: ${e(date(data.updated_at))}</small></article>`;}
    catch(err){message(f.querySelector('[data-message]'),err.message,true);}finally{b.disabled=false;}
  };
}
function openAdmin(canWrite,refreshPolls) {
  const d=modal('Administrar comunidad',`<nav class="community-admin-tabs" aria-label="Administración"><button class="secondary-button" data-tab="reports">Bandeja anónima</button><button class="secondary-button" data-tab="polls">Encuestas</button><button class="secondary-button" data-tab="settings">Límites del canal</button><a class="secondary-button" href="/rh/celebraciones">Calendario en RH ↗</a></nav><div data-admin-content></div>`,true);
  const host=d.querySelector('[data-admin-content]');let tab='reports',page=1,filter='';
  const api=(path,options={})=>request(`/admin${path}`,{private:true,...options});
  const tabs=d.querySelectorAll('[data-tab]');
  tabs.forEach(b=>b.onclick=()=>{tab=b.dataset.tab;void render();});
  async function render() {
    tabs.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
    host.innerHTML='<p class="community-muted">Cargando…</p>';
    try {
      if(tab==='reports')await reports();else if(tab==='polls')await polls();else await settings();
    }catch(err){host.innerHTML=`<p class="community-message is-error" role="alert">${e(err.message)}</p>`;}
  }
  async function reports() {
    const result=await api(`/reports?page=${page}&status=${filter}`);
    host.innerHTML=`<div class="community-admin-toolbar"><label>Estado <select data-filter><option value="">Todos</option>${Object.entries(STATES).map(([k,v])=>`<option value="${k}" ${filter===k?'selected':''}>${v}</option>`).join('')}</select></label><span>${result.total} mensajes · Página ${page}</span></div><div class="community-report-list">${result.data.map(r=>`<button class="community-report-row" data-report="${e(r.id)}"><span><small>${e(r.folio)} · ${e(TYPES[r.category])} · ${e(date(r.created_at))}</small><strong>${e(r.subject)}</strong></span><span class="community-badge">${e(STATES[r.status])}</span></button>`).join('')||'<p class="community-empty">No hay mensajes en esta bandeja.</p>'}</div><div class="community-admin-toolbar"><button class="secondary-button" data-prev ${page<=1?'disabled':''}>Anterior</button><button class="secondary-button" data-next ${page*20>=result.total?'disabled':''}>Siguiente</button></div>`;
    host.querySelector('[data-filter]').onchange=ev=>{filter=ev.target.value;page=1;void render();};
    host.querySelector('[data-prev]').onclick=()=>{page--;void render();};host.querySelector('[data-next]').onclick=()=>{page++;void render();};
    host.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>detail(b.dataset.report).catch(err=>{host.innerHTML=`<p class="community-message is-error">${e(err.message)}</p>`;}));
  }
  async function detail(id) {
    const {data:r}=await api(`/reports/${id}`);
    host.innerHTML=`<button class="secondary-button" data-back>← Volver a la bandeja</button><p class="section-label">${e(r.folio)} · ${e(TYPES[r.category])}</p><h3>${e(r.subject)}</h3><p class="community-preserve">${e(r.body)}</p><form class="community-form"><fieldset ${canWrite?'':'disabled'}><label>Estado<select name="status">${Object.entries(STATES).map(([k,v])=>`<option value="${k}" ${r.status===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Respuesta visible con folio y clave<textarea name="public_reply" maxlength="3000" rows="4">${e(r.public_reply)}</textarea></label><label>Nueva nota interna (sólo RH y administradores)<textarea name="internal_note" maxlength="3000" rows="3"></textarea></label>${canWrite?'<button class="primary-button" type="submit">Guardar seguimiento</button>':''}</fieldset><p data-message role="status" hidden></p></form><h4>Historial de atención</h4>${r.history.map(h=>`<article class="community-history"><small>${e(date(h.created_at))} · ${e(STATES[h.status])}</small>${h.internal_note?`<p class="community-preserve"><strong>Nota interna:</strong> ${e(h.internal_note)}</p>`:''}${h.public_reply?`<p class="community-preserve"><strong>Respuesta:</strong> ${e(h.public_reply)}</p>`:''}</article>`).join('')||'<p class="community-muted">Sin movimientos.</p>'}`;
    host.querySelector('[data-back]').onclick=render;
    const f=host.querySelector('form');f.onsubmit=async ev=>{ev.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await api(`/reports/${id}`,{method:'PATCH',body:JSON.stringify({...Object.fromEntries(new FormData(f)),revision:r.revision})});await detail(id);message(host.querySelector('[data-message]'),'Seguimiento guardado.');}catch(err){message(f.querySelector('[data-message]'),err.message,true);b.disabled=false;}};
  }
  async function polls() {
    const {data}=await api('/polls');
    host.innerHTML=`${canWrite?`<details class="community-create"><summary>Crear una encuesta</summary><form class="community-form"><label>Pregunta<input name="question" required minlength="5" maxlength="240"></label><label>Opciones (una por línea, de 2 a 6)<textarea name="options" rows="4" required maxlength="730"></textarea></label><label>Fecha y hora de cierre<input type="datetime-local" name="closes_at" required></label><p class="community-muted">Una respuesta por cuenta. RH verá resultados agregados. Al publicar, la pregunta y las opciones quedan fijas.</p><button class="primary-button" type="submit">Publicar encuesta</button><p data-message role="status" hidden></p></form></details>`:''}<div>${data.map(p=>{const total=p.options.reduce((sum,o)=>sum+o.total,0),closed=p.closed_at||new Date(p.closes_at)<=new Date();return `<article class="community-admin-poll"><span class="community-badge">${closed?'Cerrada':'Abierta'}</span><h3>${e(p.question)}</h3><p class="community-muted">${total} respuestas · Cierre: ${e(date(p.closes_at))} ${e(time(p.closes_at))}</p>${p.options.map(o=>`<div class="community-poll-result"><span>${e(o.label)}</span><strong>${o.total}</strong><progress max="${Math.max(total,1)}" value="${o.total}" aria-label="${e(o.label)}"></progress></div>`).join('')}${!closed&&canWrite?`<button class="secondary-button" data-close-poll="${e(p.id)}">Cerrar encuesta</button>`:''}</article>`;}).join('')||'<p class="community-empty">Todavía no hay encuestas. Publica la primera para invitar a participar.</p>'}</div><p data-action-message role="status" hidden></p>`;
    const f=host.querySelector('form');if(f)f.onsubmit=async ev=>{ev.preventDefault();const b=f.querySelector('button');b.disabled=true;try{const v=Object.fromEntries(new FormData(f));await api('/polls',{method:'POST',body:JSON.stringify({...v,options:v.options.split('\n').map(s=>s.trim()).filter(Boolean),closes_at:new Date(v.closes_at).toISOString()})});await render();await refreshPolls();}catch(err){message(f.querySelector('[data-message]'),err.message,true);b.disabled=false;}};
    host.querySelectorAll('[data-close-poll]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Cerrar esta encuesta? Se conservarán todas las respuestas.'))return;b.disabled=true;try{await api(`/polls/${b.dataset.closePoll}/close`,{method:'POST'});await render();await refreshPolls();}catch(err){message(host.querySelector('[data-action-message]'),err.message,true);b.disabled=false;}});
  }
  async function settings() {
    const {data:s}=await api('/settings');
    host.innerHTML=`<p class="community-muted">Los límites se aplican en el servidor, incluso después de reiniciarlo. Las personas que comparten una red de oficina comparten el límite. Los contadores diarios se reinician a las 00:00 UTC.</p><form class="community-form"><fieldset ${canWrite?'':'disabled'}><label class="community-option"><input type="checkbox" name="reports_enabled" ${s.reports_enabled?'checked':''}> Canal abierto para recibir mensajes</label><label>Envíos por red en una hora<input type="number" name="hourly_limit" min="1" max="100" value="${s.hourly_limit}" required></label><label>Envíos por red al día<input type="number" name="daily_limit" min="1" max="500" value="${s.daily_limit}" required></label><label>Envíos totales del canal al día<input type="number" name="global_daily_limit" min="1" max="5000" value="${s.global_daily_limit}" required></label>${canWrite?'<button class="primary-button" type="submit">Guardar límites</button>':''}</fieldset><p data-message role="status" hidden></p></form>`;
    const f=host.querySelector('form');f.onsubmit=async ev=>{ev.preventDefault();const b=f.querySelector('button');b.disabled=true;try{const v=new FormData(f);await api('/settings',{method:'PUT',body:JSON.stringify({reports_enabled:v.has('reports_enabled'),hourly_limit:Number(v.get('hourly_limit')),daily_limit:Number(v.get('daily_limit')),global_daily_limit:Number(v.get('global_daily_limit')),revision:s.revision})});await settings();message(host.querySelector('[data-message]'),'Límites guardados.');document.querySelector('#community-report-open').disabled=!v.has('reports_enabled');document.querySelector('[data-channel-state]').textContent=v.has('reports_enabled')?'':'El canal está pausado temporalmente.';}catch(err){message(f.querySelector('[data-message]'),err.message,true);b.disabled=false;}};
  }
  void render();
}
