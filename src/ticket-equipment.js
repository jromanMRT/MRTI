export async function bindTicketEquipment({ form, api, escapeHtml, preset, onChange }) {
  const container = form.querySelector('#ticket-equipment');
  if (!container) return;
  try {
    const context = await api('/api/auth/ticket-context');
    if (!container.isConnected) return;
    if (!context.can_select_any_equipment) { container.remove(); return; }
    const options = context.equipment_options || [];
    const initial = preset
      ? options.find((item) => item.asset_uid === preset.asset_uid)
      : options.find((item) => item.device_id && item.device_id === context.primary_device?.id);
    container.innerHTML = `<label>Buscar equipo<input type="search" id="ticket-equipment-search" placeholder="Código TI, nombre o área"></label><label>Equipo afectado<select name="affected_equipment" id="ticket-equipment-select"></select></label><small>${options.length ? 'Como administrador puedes elegir equipos de otras personas o áreas. Esto no cambia su asignación.' : 'No hay equipos disponibles. Puedes crear el ticket sin equipo o recargar para volver a consultar.'}</small><small id="ticket-equipment-empty" hidden>No hay coincidencias con la búsqueda.</small>`;
    const search = container.querySelector('input');
    const select = container.querySelector('select');
    // Un enlace antiguo a un activo fuera del catálogo conserva su ruta compatible
    // hasta que el administrador elija explícitamente otra opción.
    if (preset && !initial) select.removeAttribute('name');
    const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const render = (value) => {
      const query = normalize(search.value.trim());
      const visible = options.filter((item) => item.key === value || normalize(`${item.internal_id} ${item.name} ${item.area_name || ''}`).includes(query));
      select.innerHTML = `<option value="">Sin equipo específico</option>${visible.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml([item.internal_id, item.name, item.area_name].filter(Boolean).join(' · '))}</option>`).join('')}`;
      select.value = value;
      container.querySelector('#ticket-equipment-empty').hidden = !options.length || Boolean(visible.length);
    };
    render(initial?.key || '');
    search.addEventListener('input', () => render(select.value));
    select.addEventListener('change', () => { select.name = 'affected_equipment'; onChange(); });
    form.addEventListener('reset', () => { search.value = ''; render(''); });
  } catch {
    if (container.isConnected) container.textContent = 'No fue posible consultar los equipos. Puedes enviar el ticket sin elegir otro equipo o recargar para reintentar.';
  }
}
