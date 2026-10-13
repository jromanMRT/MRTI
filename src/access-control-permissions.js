import './access-control-permissions.css';
let labels = { administrator: 'Administrador', supervisor: 'Supervisor', technician: 'Técnico', viewer: 'Consulta' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function mountPermissionControl(root, { api, users }) {
  let state, subjectType = 'role', subjectId = 'viewer', dirty = false, generation = 0;
  root.innerHTML = '<p role="status">Cargando roles y permisos…</p>';
  try { state = await api('/api/auth/permissions/admin'); }
  catch (error) { root.innerHTML = `<p class="notice error">${esc(error.message)}</p>`; return; }
  labels = { ...labels, ...(state.role_labels || {}) };
  const option = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
  const levelOptions = (current = '') => option('', 'Heredar', current) + Object.entries(state.levels).map(([v, label]) => option(v, label, current)).join('');
  const subject = () => state.policies.find((p) => p.subject_type === subjectType && p.subject_id === subjectId);
  const user = () => users.find((u) => u.id === subjectId);
  function render() {
    const existing = subject(), policy = existing?.policy || {}, selectedUser = user();
    const locked = subjectType === 'role' ? subjectId === 'administrator' : selectedUser?.role === 'administrator';
    const affected = subjectType === 'role' ? users.filter((u) => u.role === subjectId).length : 1;
    root.innerHTML = `<div class="permission-intro"><div><h2>Roles y permisos</h2><p>Define el acceso por módulo y sección. Las excepciones de una persona prevalecen sobre su rol; «Heredar» conserva la configuración superior.</p></div><span class="permission-count">${state.catalog.length} módulos</span></div>
      <div class="permission-selectors"><label>Configurar<select id="permission-type">${option('role','Un rol',subjectType)}${option('user','Una persona',subjectType)}</select></label>
      <label>${subjectType === 'role' ? 'Rol' : 'Usuario'}<select id="permission-subject">${subjectType === 'role' ? state.roles.map((role) => option(role,labels[role],subjectId)).join('') : users.map((u) => option(u.id,`${u.full_name} · ${u.email}${u.is_active ? '' : ' (inactivo)'}`,subjectId)).join('')}</select></label></div>
      <div class="notice">${locked ? 'El administrador global tiene acceso total protegido. Para limitar una cuenta, cambia primero su rol en Usuarios.' : `${affected} ${affected === 1 ? 'cuenta' : 'cuentas'} ${subjectType === 'role' ? 'heredan este rol' : 'seleccionada'}. Sin una regla explícita se conservan los accesos actuales del área y del módulo.`}</div>
      <p class="field-help">Consulta permite leer; editar permite además crear y actualizar; gestión completa incluye eliminar cuando la función lo admite. Se conservan las reglas de confidencialidad, equipo, empresa y las operaciones reservadas a administradores. Para habilitar sólo algunas secciones, permite el módulo, elige «Sin acceso» como nivel general y habilita las secciones necesarias.</p>
      <form id="permission-form"><fieldset ${locked ? 'disabled' : ''}>
      <div class="permission-modules">${state.catalog.map((m) => {
        const rule = policy[m.code] || {};
        return `<details class="permission-module" data-module="${m.code}"><summary><strong>${esc(m.name)}</strong><span>${m.sections.length} secciones · ${rule.access === false ? 'Bloqueado' : rule.access === true ? 'Permitido' : 'Heredado'}</span></summary><div class="permission-module-body"><div class="permission-selectors"><label>Acceso al módulo<select data-access>${option('','Heredar',rule.access === undefined ? '' : String(rule.access))}${option('true','Permitir',String(rule.access))}${option('false','Bloquear',String(rule.access))}</select></label><label>Nivel general<select data-level>${levelOptions(rule.level)}</select></label></div><div class="permission-sections">${m.sections.map((s) => `<label><span>${esc(s.name)}</span><select data-section="${s.id}" aria-label="${esc(m.name)}: ${esc(s.name)}">${levelOptions(rule.sections?.[s.id])}</select></label>`).join('')}</div></div></details>`;
      }).join('')}</div>
      <div class="permission-save"><label>Motivo del cambio<input name="reason" required minlength="5" maxlength="500" placeholder="Por ejemplo: acceso de consulta al directorio de RH"></label><div><button class="secondary-button" type="button" id="permission-inherit">Restablecer herencia</button><button class="primary-button" type="submit">Guardar permisos</button></div><p class="form-message" role="status" id="permission-message"></p></div></fieldset></form>
      ${subjectType === 'user' ? '<section class="permission-effective"><h3>Acceso efectivo de esta persona</h3><p class="field-help">Configuración guardada. Los cambios pendientes no se aplican hasta guardar.</p><div id="permission-effective" role="status">Consultando…</div></section>' : ''}
      <details class="permission-history"><summary>Últimos cambios de permisos</summary><div class="personal-table-scroll"><table><thead><tr><th>Fecha</th><th>Rol o persona</th><th>Administrador</th><th>Motivo</th></tr></thead><tbody>${state.events.map((e) => `<tr><td>${esc(new Date(e.created_at).toLocaleString('es-MX'))}</td><td>${esc(e.subject_type === 'role' ? labels[e.subject_id] : users.find((u) => u.id === e.subject_id)?.full_name || e.subject_id)}</td><td>${esc(users.find((u) => u.id === e.actor_id)?.full_name || e.actor_id)}</td><td>${esc(e.reason)}</td></tr>`).join('') || '<tr><td colspan="4">Sin cambios de permisos todavía.</td></tr>'}</tbody></table></div></details>`;
    root.querySelector('#permission-type').onchange = (event) => {
      if (dirty && !confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) { event.target.value = subjectType; return; }
      subjectType = event.target.value; subjectId = subjectType === 'role' ? 'viewer' : users.find((u) => u.role !== 'administrator')?.id || users[0]?.id; dirty = false; render();
    };
    root.querySelector('#permission-subject').onchange = (event) => {
      if (dirty && !confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) { event.target.value = subjectId; return; }
      subjectId = event.target.value; dirty = false; render();
    };
    const form = root.querySelector('form');
    form.oninput = () => { dirty = true; };
    root.querySelector('#permission-inherit').onclick = () => { form.querySelectorAll('select').forEach((s) => { s.value = ''; }); dirty = true; };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const policy = {};
      form.querySelectorAll('[data-module]').forEach((node) => {
        const config = {}, access = node.querySelector('[data-access]').value, level = node.querySelector('[data-level]').value;
        if (access !== '') config.access = access === 'true';
        if (level) config.level = level;
        const sections = Object.fromEntries([...node.querySelectorAll('[data-section]')].filter((s) => s.value).map((s) => [s.dataset.section,s.value]));
        if (Object.keys(sections).length) config.sections = sections;
        if (Object.keys(config).length) policy[node.dataset.module] = config;
      });
      if (!confirm(`Se actualizarán los permisos de ${subjectType === 'role' ? `todas las cuentas con el rol ${labels[subjectId]}` : selectedUser?.full_name}. ¿Guardar los cambios?`)) return;
      const message = root.querySelector('#permission-message'), button = form.querySelector('[type="submit"]');
      button.disabled = true; message.textContent = 'Guardando…';
      try {
        await api(`/api/auth/permissions/admin/${subjectType}/${encodeURIComponent(subjectId)}`, { method:'PUT', body: JSON.stringify({ policy, revision: existing?.revision || 0, reason: form.elements.reason.value.trim() }) });
        state = await api('/api/auth/permissions/admin'); dirty = false; render();
        root.querySelector('#permission-message').textContent = 'Permisos guardados. Se aplican en las siguientes solicitudes.';
      } catch (error) { message.className = 'form-message error'; message.textContent = error.message; button.disabled = false; }
    };
    if (subjectType === 'user') void renderEffective(++generation);
    else generation++;
  }
  async function renderEffective(current) {
    try {
      const result = await api(`/api/auth/permissions/admin/users/${encodeURIComponent(subjectId)}`);
      if (current !== generation || !root.isConnected) return;
      root.querySelector('#permission-effective').innerHTML = result.effective.map((module) => `<details class="permission-module"><summary><strong>${esc(state.catalog.find((m) => m.code === module.code)?.name)}</strong><span>${module.allowed ? 'Permitido' : 'Sin acceso'}</span></summary>${module.allowed ? `<div class="permission-sections">${module.sections.map((s) => `<div><span>${esc(state.catalog.find((m) => m.code === module.code).sections.find((item) => item.id === s.id)?.name)}</span><strong>${esc(state.levels[s.level] || 'Permiso vigente del módulo')}</strong></div>`).join('')}</div>` : ''}</details>`).join('');
    } catch (error) { if (current === generation) root.querySelector('#permission-effective').textContent = error.message; }
  }
  render();
}
