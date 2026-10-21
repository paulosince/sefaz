import { html, raw, esc, normalize } from '../lib/util.js';
import { fragmentsFor, subject, content } from '../data/content.js';
import { noContent } from './common.js';

function highlight(text, query) {
  if (!query) return esc(text);
  const n = normalize(text), q = normalize(query);
  let out = '', i = 0, j;
  // normalize() preserva o comprimento em texto latino comum (remove só diacríticos combinantes).
  if (n.length !== text.length) return esc(text);
  while ((j = n.indexOf(q, i)) !== -1) {
    out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + q.length)) + '</mark>';
    i = j + q.length;
  }
  return out + esc(text.slice(i));
}

export async function edital(ctx, route, root) {
  const query = route.query.get('q') || '';
  const scope = route.query.get('escopo') || 'area';
  if (!content().fragments.length) { root.innerHTML = html`<h1>Edital completo</h1>${noContent('os trechos do edital')}`; return; }
  const frags = fragmentsFor({ area: scope === 'area' ? ctx.profile.area : null, query });
  const groups = new Map();
  for (const f of frags) {
    const k = f.subjectId || '_';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const src = content().source && content().source.edital;

  root.innerHTML = html`
    <h1>Edital completo</h1>
    <p class="lead">Conteúdo programático oficial, com página de origem${src ? html` · ${src.title}` : ''}</p>
    <form id="search" class="row" role="search" style="margin-bottom:12px">
      <label for="q" class="sr-only">Buscar no edital</label>
      <input id="q" type="search" placeholder="Buscar palavra-chave" value="${query}" style="flex:1;min-width:200px">
      <button class="btn" type="submit">Buscar</button>
    </form>
    <div class="chips" style="margin-bottom:16px">
      <a class="chip" aria-pressed="${scope === 'area'}" href="#/edital?escopo=area&q=${encodeURIComponent(query)}">Só ${ctx.profile.area}</a>
      <a class="chip" aria-pressed="${scope === 'todos'}" href="#/edital?escopo=todos&q=${encodeURIComponent(query)}">Edital inteiro</a>
    </div>
    <p class="muted small" role="status">${frags.length} trecho(s)${query ? ` com “${query}”` : ''}</p>
    ${[...groups.entries()].map(([sid, list]) => html`
      <h2>${sid === '_' ? 'Disposições gerais' : subject(sid)?.name || sid}</h2>
      ${list.map(f => html`<details class="frag"${query ? ' open' : ''}>
        <summary><span>${f.title || f.text.slice(0, 90) + (f.text.length > 90 ? '…' : '')}</span><span class="muted small">p. ${f.page}</span></summary>
        <div class="body">${raw(highlight(f.text, query))}${f.note ? html`<p class="notice small">${f.note}</p>` : ''}<p class="prov">Fonte: edital, página ${f.page}${f.id ? ` · trecho ${f.id}` : ''}</p></div>
      </details>`)}`)}`;

  root.querySelector('#search').onsubmit = e => {
    e.preventDefault();
    ctx.navigate(`#/edital?escopo=${scope}&q=${encodeURIComponent(root.querySelector('#q').value.trim())}`);
  };
}
