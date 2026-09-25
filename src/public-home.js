import { mountPublicSession } from './public-session.js';
import './public-home.css';

const DEFAULT_HOME_SETTINGS = {
  hero_eyebrow: 'Portal informativo',
  hero_title: 'Minera Río Tinto.',
  hero_subtitle: 'Desarrollo responsable de recursos minerales.',
  hero_body: 'Integramos experiencia operativa y disciplina técnica en Chihuahua. Consulta los avisos internos y, si tienes cuenta, inicia sesión para entrar a tus aplicaciones según tu nivel de acceso.',
  facts: [
    { label: 'Fundación', value: '1994' },
    { label: 'Sede', value: 'Chihuahua, México' },
    { label: 'Operaciones', value: 'Urique, Guazapares, Villa Matamoros y Namiquipa' },
    { label: 'Minerales', value: 'Au, Ag, Cu, Zn y Pb' },
  ],
  news_section_eyebrow: 'Últimos avisos',
  news_section_title: 'Noticias de la empresa',
  footer_tagline: 'La puerta de entrada digital de Minera Río Tinto',
};

const CAROUSEL_SIZE = 5;
const CAROUSEL_INTERVAL_MS = 6500;

function excerpt(text, max = 140) {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function bindPublicHeader() {
  mountPublicSession();
}

function headerMarkup(brandMarkup, navigationMarkup) {
  return `<header class="home-public-header">${brandMarkup('/', false)}${navigationMarkup || '<a class="primary-button" id="home-login-button" href="/login">Iniciar sesión</a>'}</header>`;
}

function footerMarkup(tagline) {
  return `<footer><span>MRTI</span><span class="footer-separator"></span><span id="public-home-footer-tagline">${tagline}</span><span class="copyright">© ${new Date().getFullYear()} MRTI</span></footer>`;
}

// Página pública: no consulta ni modifica la sesión del visitante.
export function renderPublicHome({ app, brandMarkup, escapeHtml, shortDate, readableFileSize, navigationMarkup = '' }) {
  // Portada pública: nunca muestra quién escribió o editó el aviso — eso
  // sólo se ve en Core/RH → "Portada y noticias". Si el adjunto es una
  // imagen, se usa como portada de la tarjeta en vez de enlace de descarga.
  // Toda la tarjeta lleva a la página propia de la noticia.
  function newsCardMarkup(item) {
    const isImage = Boolean(item.attachment && /^image\//.test(item.attachment.mime_type));
    const datePill = `<span class="news-date-pill">${escapeHtml(shortDate(item.published_at))}</span>`;
    return `<a class="personal-card news-card${isImage ? ' has-cover' : ''}" href="/noticias/${item.id}">
      ${isImage ? `<div class="news-card-cover"><img src="${item.attachment.content_url}" alt="" loading="lazy">${datePill}</div>` : ''}
      <div class="news-card-body-content">
        ${isImage ? '' : datePill}
        <div class="news-card-head"><h3>${escapeHtml(item.title)}</h3></div>
        <p class="news-body">${escapeHtml(excerpt(item.body))}</p>
        <span class="news-read-more">Leer más →</span>
      </div>
    </a>`;
  }

  function carouselSlideMarkup(item, index) {
    const isImage = Boolean(item.attachment && /^image\//.test(item.attachment.mime_type));
    return `<a class="public-carousel-slide${isImage ? ' has-image' : ''}" href="/noticias/${item.id}" role="group" aria-roledescription="diapositiva" aria-label="${index + 1}" ${isImage ? `style="--public-carousel-image: url('${item.attachment.content_url}')"` : ''}>
      <div class="public-carousel-copy">
        <span class="news-date-pill">${escapeHtml(shortDate(item.published_at))}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(excerpt(item.body, 160))}</p>
        <span class="public-carousel-cta">Leer más →</span>
      </div>
    </a>`;
  }

  function carouselMarkup(items) {
    if (!items.length) return '';
    return `<section class="public-carousel" aria-label="Noticias destacadas" id="public-carousel">
      <div class="public-carousel-track" id="public-carousel-track">${items.map(carouselSlideMarkup).join('')}</div>
      ${items.length > 1 ? `
        <button class="public-carousel-nav prev" type="button" id="public-carousel-prev" aria-label="Noticia anterior">‹</button>
        <button class="public-carousel-nav next" type="button" id="public-carousel-next" aria-label="Noticia siguiente">›</button>
        <div class="public-carousel-dots" id="public-carousel-dots">${items.map((_, index) => `<button type="button" class="public-carousel-dot${index === 0 ? ' active' : ''}" data-carousel-dot="${index}" aria-label="Ir a la noticia ${index + 1}"></button>`).join('')}</div>
      ` : ''}
    </section>`;
  }

  function bindCarousel() {
    const track = document.querySelector('#public-carousel-track');
    if (!track) return;
    const slides = [...track.children];
    if (slides.length < 2) return;
    const dots = [...document.querySelectorAll('[data-carousel-dot]')];
    let index = 0;
    let timer = null;

    function goTo(nextIndex) {
      index = (nextIndex + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
    }
    function restartAutoplay() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      clearInterval(timer);
      timer = setInterval(() => goTo(index + 1), CAROUSEL_INTERVAL_MS);
    }

    document.querySelector('#public-carousel-prev')?.addEventListener('click', () => { goTo(index - 1); restartAutoplay(); });
    document.querySelector('#public-carousel-next')?.addEventListener('click', () => { goTo(index + 1); restartAutoplay(); });
    dots.forEach((dot) => dot.addEventListener('click', () => { goTo(Number(dot.dataset.carouselDot)); restartAutoplay(); }));
    const carousel = document.querySelector('#public-carousel');
    carousel.addEventListener('mouseenter', () => clearInterval(timer));
    carousel.addEventListener('mouseleave', restartAutoplay);
    restartAutoplay();
  }

  function heroBannerMarkup(settings) {
    return `<div class="public-hero-copy">
      <div class="eyebrow public-hero-eyebrow"><span></span> ${escapeHtml(settings.hero_eyebrow)}</div>
      <h1>${escapeHtml(settings.hero_title)}${settings.hero_subtitle ? `<br><em>${escapeHtml(settings.hero_subtitle)}</em>` : ''}</h1>
      <p>${escapeHtml(settings.hero_body)}</p>
    </div>`;
  }

  function factsStripMarkup(facts) {
    const items = facts.length ? facts : DEFAULT_HOME_SETTINGS.facts;
    return items.map((fact) => `<article class="public-fact-tile"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></article>`).join('');
  }

  async function loadHeroSettings() {
    const banner = document.querySelector('#public-home-hero');
    const facts = document.querySelector('#public-home-facts');
    if (!banner || !facts) return;
    try {
      const response = await fetch('/api/portal/v1/company-home', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const { data } = await response.json();
      banner.innerHTML = heroBannerMarkup(data);
      facts.innerHTML = factsStripMarkup(data.facts);
      const newsEyebrow = document.querySelector('#public-home-news-eyebrow');
      const newsTitle = document.querySelector('#public-home-news-title');
      const footerTagline = document.querySelector('#public-home-footer-tagline');
      if (newsEyebrow) newsEyebrow.textContent = data.news_section_eyebrow;
      if (newsTitle) newsTitle.textContent = data.news_section_title;
      if (footerTagline) footerTagline.textContent = data.footer_tagline;
    } catch {
      // Ya se muestra el contenido por defecto; el hero simplemente no se actualiza.
    }
  }

  // Imagen configurable desde Core/RH (Recursos de marca → "Fondo del home
  // público") para que el hero muestre una foto real de operación en vez del
  // degradado con el logo como marca de agua.
  async function loadHeroBackground() {
    const banner = document.querySelector('#public-home-hero');
    if (!banner) return;
    try {
      const response = await fetch('/api/portal/v1/brand-appearance', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const { data } = await response.json();
      const backgroundUrl = data?.home_hero_background?.content_url;
      if (!backgroundUrl) return;
      banner.classList.add('has-custom-background');
      banner.style.setProperty('--public-hero-background-image', `url('${backgroundUrl}')`);
    } catch {
      // Sin foto configurada o sin red: se queda el degradado con el logo de marca de agua.
    }
  }

  // Las noticias más recientes (según el orden que ya administra Core/RH) se
  // reparten entre el carrusel destacado y la cuadrícula del resto.
  async function loadPublicNews() {
    const carouselContainer = document.querySelector('#public-carousel-container');
    const container = document.querySelector('#home-news-list');
    if (!container) return;
    try {
      const response = await fetch('/api/portal/v1/company-news', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const { data: news } = await response.json();
      const featured = news.slice(0, CAROUSEL_SIZE);
      const rest = news.slice(CAROUSEL_SIZE);
      if (carouselContainer) {
        carouselContainer.innerHTML = carouselMarkup(featured);
        bindCarousel();
      }
      const restLabel = featured.length ? '' : '<p class="personal-empty">Aún no hay noticias publicadas.</p>';
      container.className = rest.length || !featured.length ? 'personal-grid news-grid' : '';
      container.innerHTML = rest.length ? rest.map((item) => newsCardMarkup(item)).join('') : restLabel;
      const newsSection = document.querySelector('#home-news-section');
      if (newsSection) newsSection.hidden = !rest.length && Boolean(featured.length);
    } catch {
      container.className = 'notice error';
      container.textContent = 'No fue posible cargar las noticias en este momento.';
    }
  }

  function renderHome() {
    document.title = 'MRTI | Información de la empresa';
    app.innerHTML = `<main class="core-home">
      ${headerMarkup(brandMarkup, navigationMarkup)}
      <section class="public-hero-banner" id="public-home-hero">${heroBannerMarkup(DEFAULT_HOME_SETTINGS)}</section>
      <div class="public-facts-strip" id="public-home-facts" aria-label="Datos de la empresa">${factsStripMarkup(DEFAULT_HOME_SETTINGS.facts)}</div>
      <div id="public-carousel-container"></div>
      <section class="home-news-section" id="home-news-section"><div class="section-heading"><div><p class="section-label" id="public-home-news-eyebrow">${escapeHtml(DEFAULT_HOME_SETTINGS.news_section_eyebrow)}</p><h2 id="public-home-news-title">${escapeHtml(DEFAULT_HOME_SETTINGS.news_section_title)}</h2></div></div>
        <div id="home-news-list" class="personal-loading">Cargando noticias…</div>
      </section>
      ${footerMarkup(escapeHtml(DEFAULT_HOME_SETTINGS.footer_tagline))}
    </main>`;
    bindPublicHeader();
    void loadHeroSettings();
    void loadHeroBackground();
    void loadPublicNews();
  }

  renderHome();
}

// Página pública de una sola noticia: mismo espíritu que el home, sin sesión.
export function renderNewsDetail({ app, brandMarkup, escapeHtml, shortDate, readableFileSize, navigationMarkup = '' }, newsId) {
  function attachmentMarkup(item) {
    if (!item.attachment) return '';
    const isImage = /^image\//.test(item.attachment.mime_type);
    if (isImage) return `<div class="news-detail-image"><img src="${item.attachment.content_url}" alt=""></div>`;
    return `<a class="asset-download" href="${item.attachment.content_url}" download="${escapeHtml(item.attachment.original_filename)}">⬇ ${escapeHtml(item.attachment.original_filename)} · ${readableFileSize(item.attachment.file_size)}</a>`;
  }

  async function load() {
    const root = document.querySelector('#news-detail-root');
    if (!root) return;
    try {
      const response = await fetch(`/api/portal/v1/company-news/${encodeURIComponent(newsId)}`, { cache: 'no-store' });
      if (response.status === 404) {
        root.innerHTML = `<div class="workspace-panel narrow-panel"><p class="section-label">Noticia</p><h1>No encontramos este aviso</h1><p class="panel-copy">Puede que ya no esté disponible. Vuelve a la portada para ver los avisos vigentes.</p><a class="primary-button public-home-link" href="/">← Volver a la portada</a></div>`;
        return;
      }
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const { data: item } = await response.json();
      document.title = `MRTI | ${item.title}`;
      root.innerHTML = `<article class="workspace-panel narrow-panel news-detail">
        <a class="back-button public-home-link" href="/">← Volver a la portada</a>
        <span class="news-date-pill">${escapeHtml(shortDate(item.published_at))}</span>
        <h1>${escapeHtml(item.title)}</h1>
        ${attachmentMarkup(item)}
        <p class="news-detail-body">${escapeHtml(item.body)}</p>
      </article>`;
    } catch {
      root.innerHTML = `<div class="workspace-panel narrow-panel"><p class="section-label">Noticia</p><h1>No fue posible cargar este aviso</h1><p class="panel-copy">Intenta de nuevo en un momento.</p><a class="primary-button public-home-link" href="/">← Volver a la portada</a></div>`;
    }
  }

  document.title = 'MRTI | Noticia';
  app.innerHTML = `<main class="core-home">
    ${headerMarkup(brandMarkup, navigationMarkup)}
    <div id="news-detail-root" class="public-detail-wrap"><p class="personal-loading">Cargando…</p></div>
    ${footerMarkup(escapeHtml('La puerta de entrada digital de Minera Río Tinto'))}
  </main>`;
  bindPublicHeader();
  void load();
}
