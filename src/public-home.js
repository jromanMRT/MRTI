import { mountPublicSession } from './public-session.js';
import './public-home.css';

// Página pública: no consulta ni modifica la sesión del visitante.
export function renderPublicHome({ app, brandMarkup, escapeHtml, shortDate, readableFileSize }) {
function newsCardMarkup(item, canManage = false) {
  return `<article class="personal-card news-card">
      <div class="news-card-head"><div><p>${escapeHtml(item.author_name)}</p><h3>${escapeHtml(item.title)}</h3></div>
        ${canManage ? `<button class="asset-remove" type="button" data-news-delete="${item.id}">Quitar</button>` : ''}
      </div>
      <p class="news-date">${escapeHtml(shortDate(item.published_at))}</p>
      <p class="news-body">${escapeHtml(item.body)}</p>
      ${item.attachment ? `<a class="asset-download" href="${item.attachment.content_url}" download="${escapeHtml(item.attachment.original_filename)}">Descargar · ${escapeHtml(item.attachment.original_filename)} (${readableFileSize(item.attachment.file_size)})</a>` : ''}
    </article>`;
}

async function loadPublicNews() {
  const container = document.querySelector('#home-news-list');
  if (!container) return;
  try {
    const response = await fetch('/api/portal/v1/company-news', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const { data: news } = await response.json();
    container.className = 'personal-grid news-grid';
    container.innerHTML = news.length
      ? news.map((item) => newsCardMarkup(item, false)).join('')
      : '<article class="personal-card"><p class="personal-empty">Aún no hay noticias publicadas.</p></article>';
  } catch {
    container.className = 'notice error';
    container.textContent = 'No fue posible cargar las noticias en este momento.';
  }
}

function renderHome() {
  document.title = 'MRTI | Información de la empresa';
  app.innerHTML = `<main class="core-home">
    <header class="home-public-header">${brandMarkup('/')}<a class="primary-button" id="home-login-button" href="/login">Iniciar sesión</a></header>
    <section class="home-public-hero"><p class="login-eyebrow">Portal informativo</p><h1>Noticias e información de Minera Río Tinto.</h1><p>Consulta los avisos importantes de la empresa. Inicia sesión para entrar a tus aplicaciones según tu nivel de acceso.</p></section>
    <section class="home-news-section"><div class="section-heading"><div><p class="section-label">Últimos avisos</p><h2>Noticias de la empresa</h2></div></div>
      <div id="home-news-list" class="personal-loading">Cargando noticias…</div>
    </section>
  </main>`;
  mountPublicSession();
  void loadPublicNews();
}

  renderHome();
}
