// P3: treino de estudo de caso com cronômetro, contagem de linhas/palavras e
// autoavaliação pelos critérios publicados no conteúdo. O rascunho é salvo
// a cada alteração para não se perder.

import { html, md } from '../lib/util.js';
import { content } from '../data/content.js';
import { noContent } from './common.js';

export async function discursiva(ctx, route, root, alive) {
  const items = (content().discursive || []).filter(d => !d.status || d.status === 'published')
    .filter(d => !d.areas || d.areas.includes(ctx.profile.area));
  const id = route.args[0];
  const { simulados } = await ctx.data();
  const done = simulados.filter(s => s.kind === 'p3');

  if (!id) {
    root.innerHTML = html`<h1>Discursiva (P3)</h1><p class="lead">Estudo de caso: escreva, acompanhe o tempo e avalie-se pelos critérios.</p>
      ${items.length ? html`<div class="grid two">${items.map(d => html`<a class="card" style="text-decoration:none;color:inherit" href="#/discursiva/${encodeURIComponent(d.id)}">
          <h3 style="margin-top:0">${d.title}</h3><p class="muted small">${d.provenance?.kind === 'fcc' ? `FCC ${d.provenance.year || ''}` : 'Proposta de treino'}${d.minutes ? ` · ${d.minutes} min` : ''}</p>
          ${done.some(s => s.config.promptId === d.id) ? html`<span class="tag ok">feito</span>` : ''}</a>`)}</div>`
        : noContent('propostas de estudo de caso')}`;
    return;
  }

  const d = items.find(x => x.id === id);
  if (!d) { root.innerHTML = html`<h1>Proposta não encontrada</h1><a href="#/discursiva">Voltar</a>`; return; }
  const draftKey = `p3draft:${d.id}`;
  const draft = (await ctx.getKV(draftKey)) || { text: '', startedAt: null, checks: {} };
  if (!alive()) return;
  ctx.setResume(`#/discursiva/${encodeURIComponent(d.id)}`, `Discursiva: ${d.title}`);
  const criteria = d.criteria || [];

  root.innerHTML = html`
    <p><a href="#/discursiva">← Discursiva</a></p>
    <h1>${d.title}</h1>
    <div class="card">${md(d.prompt)}${d.limits ? html`<p class="muted small">${d.limits}</p>` : ''}</div>
    <div class="spread" style="margin:14px 0 6px"><label class="field" for="txt">Sua resposta</label><span class="muted small"><span id="count"></span> · <span class="timer" id="clock"></span></span></div>
    <textarea id="txt" spellcheck="true">${draft.text}</textarea>
    <h2>Autoavaliação</h2>
    ${criteria.length ? html`<div class="card stack">${criteria.map((c, i) => html`
      <label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-c="${i}" ${draft.checks[i] ? 'checked' : ''} style="margin-top:4px;width:20px;height:20px">
        <span><strong>${c.label}</strong>${c.points != null ? ` (${c.points} pts)` : ''}${c.hint ? html`<br><span class="muted small">${c.hint}</span>` : ''}</span></label>`)}</div>`
      : html`<p class="muted">Critérios de avaliação não publicados para esta proposta.</p>`}
    ${d.modelAnswer ? html`<details class="card" style="margin-top:12px"><summary><strong>Ver resposta de referência</strong></summary>${md(d.modelAnswer)}</details>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn" id="submit">Registrar tentativa</button><button class="btn ghost" id="reset">Recomeçar</button></div>`;

  const txt = root.querySelector('#txt');
  const count = () => {
    const words = txt.value.trim() ? txt.value.trim().split(/\s+/).length : 0;
    root.querySelector('#count').textContent = `${words} palavras · ${txt.value.split('\n').length} linhas`;
  };
  let saveT = null;
  txt.oninput = () => {
    if (!draft.startedAt) draft.startedAt = new Date().toISOString();
    draft.text = txt.value; count();
    clearTimeout(saveT); saveT = setTimeout(() => ctx.setKV(draftKey, draft), 800);
  };
  root.querySelectorAll('[data-c]').forEach(cb => cb.onchange = () => { draft.checks[cb.dataset.c] = cb.checked; ctx.setKV(draftKey, draft); });
  const clock = () => {
    const el = root.querySelector('#clock');
    if (!el) return;
    if (!draft.startedAt) { el.textContent = d.minutes ? `${d.minutes}:00 disponíveis` : '—'; return; }
    const used = Math.floor((Date.now() - Date.parse(draft.startedAt)) / 1000);
    const total = d.minutes ? d.minutes * 60 - used : used;
    const a = Math.abs(total);
    el.textContent = `${total < 0 ? '-' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}${d.minutes ? ' restantes' : ''}`;
  };
  const t = setInterval(clock, 1000);
  root._cleanup = () => { clearInterval(t); clearTimeout(saveT); ctx.setKV(draftKey, draft); };
  count(); clock();

  root.querySelector('#submit').onclick = async () => {
    const got = criteria.reduce((s, c, i) => s + (draft.checks[i] ? (c.points ?? 1) : 0), 0);
    const max = criteria.reduce((s, c) => s + (c.points ?? 1), 0);
    await ctx.saveSimulado({
      kind: 'p3', config: { promptId: d.id }, started_at: draft.startedAt || new Date().toISOString(), finished_at: new Date().toISOString(),
      items: [{ question_id: d.id, text: draft.text, checks: draft.checks }], score: max ? { total: got, max, provas: [], self: true } : null,
    });
    await ctx.setKV(draftKey, null);
    ctx.announce('Tentativa registrada.');
    ctx.navigate('#/discursiva');
  };
  root.querySelector('#reset').onclick = async () => {
    if (!confirm('Apagar o rascunho e recomeçar?')) return;
    await ctx.setKV(draftKey, null);
    ctx.rerender();
  };
}
