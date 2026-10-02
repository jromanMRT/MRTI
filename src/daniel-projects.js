import './daniel-projects.css';

const HOME = 'ABRIR-PROYECTOS.html';
const ENDPOINT = '/api/portal/v1/daniel-projects';

// Se ejecuta en un iframe de origen opaco: no recibe sesión, cookies ni acceso
// al DOM/almacenamiento de Core. Sólo comparte navegación y su estado propio.
function projectBridge(initial, parentOrigin, isDashboard) {
  const send = (type, value) => parent.postMessage({ source: 'daniel-project', type, value }, parentOrigin);
  for (const name of ['localStorage', 'sessionStorage']) {
    let values = Object.assign(Object.create(null), name === 'localStorage' ? initial : {});
    const changed = () => { if (name === 'localStorage') send('storage', values); };
    Object.defineProperty(window, name, { value: {
      getItem: (key) => values[String(key)] ?? null,
      setItem(key, value) { values[String(key)] = String(value); changed(); },
      removeItem(key) { delete values[String(key)]; changed(); },
      clear() { values = Object.create(null); changed(); },
      key: (index) => Object.keys(values)[index] ?? null,
      get length() { return Object.keys(values).length; },
    } });
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return;
    event.preventDefault();
    if (href.endsWith('/')) return;
    send('navigate', decodeURIComponent(href));
  }, true);
  if (isDashboard) document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.sub').textContent = 'Explora los proyectos guardados. Usa Abrir para ver una aplicación y Volver a los proyectos para regresar.';
    document.querySelector('footer').textContent = 'Proyectos de referencia independientes de MRTI. Los cambios que guarde cada prototipo permanecen en este navegador; no actualizan la plataforma. Algunas funciones requieren internet.';
    const hideFolders = () => document.querySelectorAll('a.btn.ghost').forEach((link) => {
      if (!link.getAttribute('href').endsWith('/')) return;
      const label = document.createElement('span');
      label.className = 'chip';
      label.textContent = 'Carpeta de código · sin apertura web';
      link.replaceWith(label);
    });
    hideFolders();
    new MutationObserver(hideFolders).observe(document.querySelector('#grid'), { childList: true, subtree: true });
  });
}

export async function mountDanielProjects({ container, api, userId }) {
  container.innerHTML = `<div class="daniel-toolbar"><button class="back-button" id="daniel-back" type="button" hidden>← Volver a los proyectos</button><span id="daniel-current" aria-live="polite">Cargando proyectos…</span></div><p class="notice error" id="daniel-error" role="alert" hidden></p><div id="daniel-viewer"></div>`;
  const errorBox = container.querySelector('#daniel-error');
  const viewer = container.querySelector('#daniel-viewer');
  const back = container.querySelector('#daniel-back');
  const current = container.querySelector('#daniel-current');
  let frame, activeFile, storageKey, sequence = 0;
  const showError = (error) => { errorBox.textContent = error.message; errorBox.hidden = false; };
  try {
    const { files } = await api(ENDPOINT);
    if (!container.isConnected) return;
    async function open(file) {
      if (!files.includes(file)) return;
      const request = ++sequence;
      errorBox.hidden = true;
      current.textContent = 'Cargando proyecto…';
      try {
        const { html } = await api(`${ENDPOINT}/content?file=${encodeURIComponent(file)}`);
        if (request !== sequence || !container.isConnected) return;
        activeFile = file;
        storageKey = `mrti_daniel_project:${userId}:${file}`;
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* primera apertura */ }
        const args = JSON.stringify([saved, location.origin, file === HOME]).replace(/</g, '\\u003c');
        const bridge = `<script>(${projectBridge.toString()})(...${args});<\/script>`;
        frame = document.createElement('iframe');
        frame.className = 'daniel-project-frame';
        frame.title = file === HOME ? 'Dashboard de proyectos de Daniel' : `Proyecto de Daniel: ${file.split('/').at(-1)}`;
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads allow-modals allow-popups');
        frame.referrerPolicy = 'no-referrer';
        // Inserción antes de cualquier script del prototipo.
        frame.srcdoc = /<head(?:\s[^>]*)?>/i.test(html)
          ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + bridge)
          : html.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + bridge);
        viewer.replaceChildren(frame);
        back.hidden = file === HOME;
        current.textContent = file === HOME ? 'Dashboard de proyectos de Daniel' : file.split('/').at(-1);
      } catch (error) { if (request === sequence && container.isConnected) { current.textContent = 'No se pudo abrir el proyecto'; showError(error); } }
    }
    const listener = (event) => {
      if (!container.isConnected || event.source !== frame?.contentWindow || event.data?.source !== 'daniel-project') return;
      if (event.data.type === 'navigate' && typeof event.data.value === 'string') {
        const target = new URL(event.data.value, `https://projects.invalid/${activeFile}`).pathname.slice(1);
        void open(decodeURIComponent(target));
      }
      if (event.data.type === 'storage' && event.data.value && typeof event.data.value === 'object' && !Array.isArray(event.data.value)) {
        const entries = Object.entries(event.data.value);
        if (entries.some(([, value]) => typeof value !== 'string')) return;
        try { localStorage.setItem(storageKey, JSON.stringify(event.data.value)); }
        catch { showError(new Error('El navegador no pudo guardar los cambios del prototipo.')); }
      }
    };
    window.addEventListener('message', listener);
    const observer = new MutationObserver(() => {
      if (!container.isConnected) { window.removeEventListener('message', listener); observer.disconnect(); }
    });
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
    back.addEventListener('click', () => { void open(HOME); });
    await open(HOME);
  } catch (error) { current.textContent = 'Proyectos no disponibles'; showError(error); }
}
