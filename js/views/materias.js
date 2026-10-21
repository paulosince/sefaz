import { html, md } from '../lib/util.js';
import { subjectsFor, topicsOf, subject, questionsFor, lessonsFor, fragment, hasContent } from '../data/content.js';
import { masteryLabel } from '../logic/stats.js';
import { noContent, masteryMaps, bar, editalRef, provenance } from './common.js';

export async function materias(ctx, route, root) {
  if (route.args[0]) return materia(ctx, route, root);
  const area = ctx.profile.area;
  if (!hasContent()) { root.innerHTML = html`<h1>Matérias</h1>${noContent('as disciplinas do edital')}`; return; }
  const filter = route.query.get('prova') || '';
  const provas = [...new Set(subjectsFor(area).map(s => s.prova))].sort();
  const list = subjectsFor(area, filter || null);
  const { subjects: mastery } = await masteryMaps(ctx);

  root.innerHTML = html`
    <h1>Matérias</h1>
    <p class="lead">Escolha a disciplina ou continue o plano · <span class="tag">${area}</span></p>
    <div class="chips" style="margin-bottom:16px">
      <a class="chip" href="#/materias" aria-pressed="${!filter}">Todas</a>
      ${provas.map(p => html`<a class="chip" href="#/materias?prova=${p}" aria-pressed="${p === filter}">${p}</a>`)}
    </div>
    <div class="grid two">
      ${list.map(s => {
        const m = mastery.get(s.id);
        const nq = questionsFor({ subjectId: s.id }).length;
        return html`<div class="card">
          <div class="spread"><span class="tag">${s.prova}</span><span class="muted small">${topicsOf(s.id).length} tópicos · ${nq} questões</span></div>
          <h3>${s.name}</h3>
          <p class="muted small" style="margin:0 0 6px">Domínio do conteúdo: ${masteryLabel(m)}${m ? ` (${Math.round(m.mastery * 100)}%)` : ''}</p>
          ${bar(m ? m.mastery : 0)}
          <div class="row" style="margin-top:12px">
            <a class="btn small" href="#/materias/${encodeURIComponent(s.id)}">Tópicos</a>
            ${nq ? html`<a class="btn small ghost" href="#/estudar?subject=${encodeURIComponent(s.id)}">Praticar →</a>` : ''}
          </div>
        </div>`;
      })}
    </div>`;
}

async function materia(ctx, route, root) {
  const s = subject(route.args[0]);
  if (!s) { root.innerHTML = html`<h1>Disciplina não encontrada</h1><a href="#/materias">Voltar</a>`; return; }
  const topicId = route.args[1] || null;
  const { topics: mastery } = await masteryMaps(ctx);
  const topics = topicsOf(s.id);

  if (topicId) {
    const t = topics.find(x => x.id === topicId);
    if (!t) { root.innerHTML = html`<h1>Tópico não encontrado</h1><a href="#/materias/${encodeURIComponent(s.id)}">Voltar</a>`; return; }
    const lessons = lessonsFor(topicId);
    const frags = (t.fragmentIds || []).map(fragment).filter(Boolean);
    const nq = questionsFor({ topicId }).length;
    ctx.setResume(`#/materias/${encodeURIComponent(s.id)}/${encodeURIComponent(topicId)}`, `${s.name} — ${t.title}`);
    root.innerHTML = html`
      <p><a href="#/materias/${encodeURIComponent(s.id)}">← ${s.name}</a></p>
      <h1>${t.code ? `${t.code} ` : ''}${t.title}</h1>
      <p class="lead">${masteryLabel(mastery.get(t.id))} ${editalRef(t)}</p>
      ${frags.length ? html`<h2>Texto do edital</h2><div class="card">${frags.map(f => html`<p style="white-space:pre-line;margin-top:0">${f.text}</p><p class="prov">Edital, p. ${f.page}</p>`)}</div>` : ''}
      <h2>Estudo</h2>
      ${lessons.length
        ? lessons.map(l => html`<article class="card" style="margin-bottom:12px"><h3 style="margin-top:0">${l.title}</h3>${md(l.body)}<p class="prov">${provenance(l.provenance)}</p></article>`)
        : html`<div class="card empty"><strong>Sem explicação publicada para este tópico</strong>Aulas e resumos entram pelo pacote de conteúdo depois de revisados.</div>`}
      <div class="row" style="margin-top:16px">
        ${nq ? html`<a class="btn" href="#/estudar?topic=${encodeURIComponent(t.id)}">Resolver ${nq} questão(ões) →</a>` : html`<span class="muted">Nenhuma questão publicada para este tópico.</span>`}
      </div>`;
    return;
  }

  const roots = topics.filter(t => !t.parentId);
  const children = id => topics.filter(t => t.parentId === id);
  const item = t => {
    const m = mastery.get(t.id);
    const kids = children(t.id);
    return html`<li style="margin:6px 0">
      <a href="#/materias/${encodeURIComponent(s.id)}/${encodeURIComponent(t.id)}">${t.code ? `${t.code} ` : ''}${t.title}</a>
      <span class="muted small"> · ${masteryLabel(m)}</span>
      ${kids.length ? html`<ul>${kids.map(item)}</ul>` : ''}</li>`;
  };
  root.innerHTML = html`
    <p><a href="#/materias">← Matérias</a></p>
    <h1>${s.name}</h1>
    <p class="lead"><span class="tag">${s.prova}</span> Tópicos do edital e materiais relacionados</p>
    <div class="row" style="margin-bottom:12px">
      ${questionsFor({ subjectId: s.id }).length ? html`<a class="btn" href="#/estudar?subject=${encodeURIComponent(s.id)}">Praticar a disciplina →</a>` : ''}
      <a class="btn ghost" href="#/mapas/${encodeURIComponent(s.id)}">Mapa mental</a>
    </div>
    <div class="card">${topics.length ? html`<ul style="padding-left:18px;margin:0">${roots.map(item)}</ul>` : html`<p class="muted">Sem tópicos cadastrados.</p>`}</div>`;
}
