import { html } from '../lib/util.js';
import { subjectsFor, mindmapFor, subject, hasContent } from '../data/content.js';
import { noContent } from './common.js';

export async function mapas(ctx, route, root) {
  if (!hasContent()) { root.innerHTML = html`<h1>Mapas mentais</h1>${noContent('as disciplinas')}`; return; }
  const sid = route.args[0];
  if (!sid) {
    root.innerHTML = html`<h1>Mapas mentais</h1><p class="lead">Escolha a matéria e abra os ramos aos poucos.</p>
      <div class="grid three">${subjectsFor(ctx.profile.area).map(s => html`<a class="card" style="text-decoration:none;color:inherit" href="#/mapas/${encodeURIComponent(s.id)}"><span class="tag">${s.prova}</span><h3>${s.name}</h3></a>`)}</div>`;
    return;
  }
  const s = subject(sid);
  const mm = mindmapFor(sid);
  if (!s || !mm) { root.innerHTML = html`<h1>Mapa não encontrado</h1><a href="#/mapas">Voltar</a>`; return; }
  ctx.setResume(`#/mapas/${encodeURIComponent(sid)}`, `Mapa mental: ${s.name}`);

  let n = 0;
  const node = (item, depth) => {
    const id = `mm${n++}`;
    const kids = item.children || [];
    const link = item.topicId ? html` <a class="small" href="#/materias/${encodeURIComponent(sid)}/${encodeURIComponent(item.topicId)}">estudar</a>` : '';
    if (!kids.length) return html`<li><button class="node" type="button" disabled>${item.label}</button>${link}${item.note ? html`<div class="muted small">${item.note}</div>` : ''}</li>`;
    return html`<li><button class="node${depth === 0 ? ' root' : ''}" type="button" aria-expanded="${depth === 0}" aria-controls="${id}">${item.label}</button>${link}
      <ul id="${id}"${depth === 0 ? '' : ' hidden'}>${kids.map(k => node(k, depth + 1))}</ul></li>`;
  };

  root.innerHTML = html`
    <p><a href="#/mapas">← Mapas mentais</a></p>
    <h1>${s.name}</h1>
    <p class="lead">${mm.derived ? 'Mapa gerado a partir da estrutura do edital (sem material complementar publicado).' : 'Mapa mental publicado.'}</p>
    <div class="row" style="margin-bottom:10px"><button class="btn small ghost" id="expand">Abrir tudo</button><button class="btn small ghost" id="collapse">Fechar tudo</button></div>
    <div class="mm"><ul>${node(mm.root, 0)}</ul></div>`;

  const toggle = (btn, open) => {
    btn.setAttribute('aria-expanded', String(open));
    document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  };
  root.querySelectorAll('button.node[aria-controls]').forEach(b => b.onclick = () => toggle(b, b.getAttribute('aria-expanded') !== 'true'));
  root.querySelector('#expand').onclick = () => root.querySelectorAll('button.node[aria-controls]').forEach(b => toggle(b, true));
  root.querySelector('#collapse').onclick = () => root.querySelectorAll('button.node[aria-controls]').forEach((b, i) => toggle(b, i === 0));
}
