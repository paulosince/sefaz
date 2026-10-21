import * as store from './data/store.js';
import { loadContent } from './data/content.js';
import { syncProfile, onSyncState } from './data/sync.js';
import { AREAS } from './config.js';
import { esc } from './lib/util.js';
import { routes } from './views/index.js';

const NAV = [
  ['inicio', 'Início'],
  ['plano', 'Plano de hoje'],
  ['materias', 'Matérias'],
  ['edital', 'Edital completo'],
  ['flashcards', 'Flashcards'],
  ['mapas', 'Mapas mentais'],
  ['simulados', 'Simulados'],
  ['discursiva', 'Discursiva (P3)'],
  ['progresso', 'Progresso'],
  ['prioridades', 'Prioridades'],
  null,
  ['concurso', 'Informações do concurso'],
  ['perfis', 'Perfil, conta e dados'],
];

const ICONS = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plano: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
  materias: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  progresso: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

// ---------- estado compartilhado pelas telas ----------

const ctx = {
  profile: null,
  profiles: [],
  syncState: { state: 'idle' },
  cache: null,
  /** Respostas, revisões e simulados do perfil ativo (memorizados até a próxima gravação). */
  async data() {
    if (!ctx.profile) return { answers: [], reviews: [], simulados: [] };
    if (!ctx.cache) {
      const id = ctx.profile.id;
      const [answers, reviews, simulados] = await Promise.all([store.listAnswers(id), store.listReviews(id), store.listSimulados(id)]);
      ctx.cache = { answers, reviews, simulados };
    }
    return ctx.cache;
  },
  invalidate() { ctx.cache = null; },
  async addAnswer(a) { const r = await store.addAnswer(ctx.profile.id, a); ctx.invalidate(); scheduleSync(); return r; },
  async addReview(r) { const x = await store.addReview(ctx.profile.id, r); ctx.invalidate(); scheduleSync(); return x; },
  async saveSimulado(s) { const x = await store.saveSimulado(ctx.profile.id, s); ctx.invalidate(); scheduleSync(); return x; },
  getKV: (k, f) => store.getKV(ctx.profile.id, k, f),
  async setKV(k, v) { await store.setKV(ctx.profile.id, k, v); scheduleSync(); },
  /** Registra o ponto de retomada exibido em "Continue de onde parou". */
  setResume(route, label) { return ctx.setKV('resume', { route, label, at: new Date().toISOString() }); },
  async switchProfile(id) {
    await store.setActiveProfileId(id);
    ctx.profiles = await store.listProfiles();
    ctx.profile = ctx.profiles.find(p => p.id === id) || null;
    ctx.invalidate();
    renderNav();
    scheduleSync(0);
  },
  async reloadProfiles() {
    ctx.profiles = await store.listProfiles();
    const active = await store.getActiveProfileId();
    ctx.profile = ctx.profiles.find(p => p.id === active) || null;
    renderNav();
  },
  navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  announce(msg) { const el = document.getElementById('live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); },
  rerender: () => render(),
};

// ---------- sincronização ----------

let syncTimer = null;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!ctx.profile) return;
    const r = await syncProfile(ctx.profile);
    if (r && r.pulled) { ctx.invalidate(); render(); }
  }, delay);
}
onSyncState(s => { ctx.syncState = s; renderNav(); });
window.addEventListener('online', () => scheduleSync(0));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(0); });

// ---------- navegação ----------

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'inicio';
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'inicio', args: parts.slice(1).map(decodeURIComponent), query: new URLSearchParams(query) };
}

function renderNav() {
  const { name } = currentRoute();
  const nav = document.getElementById('nav');
  const p = ctx.profile;
  const dot = ctx.syncState.state === 'error' ? 'err' : (p && p.userId ? 'on' : '');
  nav.innerHTML = `<div class="brand">RUMO À SEFAZ · 2026</div>` +
    NAV.map(item => item ? `<a href="#/${item[0]}"${item[0] === name ? ' aria-current="page"' : ''}>${esc(item[1])}</a>` : '<div class="sep" role="separator"></div>').join('') +
    (p ? `<div class="who"><strong>${esc(p.name)} · ${esc(p.area)}</strong>${esc(AREAS[p.area]?.name || '')}<br>
      <span class="syncdot ${dot}" aria-hidden="true"></span> ${p.userId ? (ctx.syncState.state === 'syncing' ? 'Sincronizando…' : ctx.syncState.state === 'error' ? 'Erro de sincronização' : 'Conta conectada') : 'Somente neste aparelho'}</div>` : '');
  const tab = document.getElementById('tabbar');
  tab.innerHTML = [['inicio', 'Início'], ['plano', 'Plano'], ['materias', 'Matérias'], ['progresso', 'Progresso']]
    .map(([k, l]) => `<a href="#/${k}"${k === name ? ' aria-current="page"' : ''}>${icon(k)}<span>${l}</span></a>`).join('') +
    `<button type="button" id="menuBtn" aria-controls="nav" aria-expanded="false">${icon('menu')}<span>Menu</span></button>`;
  document.getElementById('menuBtn').onclick = () => {
    const open = nav.classList.toggle('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('a')?.focus();
  };
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const route = currentRoute();
  document.getElementById('nav').classList.remove('open');
  const main = document.getElementById('main');
  if (main._cleanup) { main._cleanup(); main._cleanup = null; }
  if (!ctx.profile && route.name !== 'perfis') { location.replace('#/perfis'); return; }
  const view = routes[route.name] || routes.inicio;
  renderNav();
  try {
    await view(ctx, route, main, () => seq === renderSeq);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card"><h1>Algo deu errado</h1><p class="muted">${esc(err.message)}</p><p><a class="btn" href="#/inicio">Voltar ao início</a></p></div>`;
  }
  if (seq === renderSeq) {
    const title = main.querySelector('h1');
    document.title = title ? `${title.textContent} · Rumo à SEFAZ` : 'Rumo à SEFAZ';
  }
}

window.addEventListener('hashchange', () => { render(); document.getElementById('main').focus({ preventScroll: true }); window.scrollTo(0, 0); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('nav').classList.remove('open'); });

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW não registrado:', err));
  }
  await Promise.all([loadContent(), store.ensureDefaultProfiles()]);
  await ctx.reloadProfiles();
  await render();
  scheduleSync(0);
}

window.__rumo = ctx; // depuração e testes
boot();
