// Simulados: configuração → uma questão por tela → relatório.
// O simulado em andamento fica salvo (sobrevive a recarregar a página ou
// ficar sem rede). Ao concluir, cada resposta entra no histórico como
// source = 'simulado' e o simulado inteiro é guardado com a pontuação.

import { html, md, shuffle, fmtPct } from '../lib/util.js';
import { questionsFor, question, subjectsFor, subject, content } from '../data/content.js';
import { provasForArea, scoreAttempt } from '../logic/scoring.js';
import { noContent, provenance } from './common.js';

const RUN_KEY = 'simulado:running';

export async function simulados(ctx, route, root, alive) {
  const sub = route.args[0];
  if (sub === 'resultado') return resultado(ctx, route.args[1], root);
  const running = await ctx.getKV(RUN_KEY);
  if (sub === 'executar' && running) return executar(ctx, running, root, alive);
  return configurar(ctx, root, running);
}

async function configurar(ctx, root, running) {
  const area = ctx.profile.area;
  const all = questionsFor({ area });
  const { simulados: hist } = await ctx.data();
  const rules = content().exam && content().exam.rules;
  const provas = provasForArea(rules, area).filter(p => p.kind !== 'discursiva');
  if (!all.length) {
    root.innerHTML = html`<h1>Simulados</h1>${noContent('questões publicadas')}${historico(hist)}`;
    return;
  }
  root.innerHTML = html`
    <h1>Simulados</h1>
    <p class="lead">Treino por matéria, prova completa ou treino cronometrado.</p>
    ${running ? html`<div class="notice" style="margin-bottom:12px">Há um simulado em andamento. <a href="#/simulados/executar">Continuar</a> ou
      <button class="link" id="discard">descartar</button>.</div>` : ''}
    <form id="cfg" class="card stack">
      <fieldset style="border:0;padding:0;margin:0"><legend class="field">Tipo</legend>
        <div class="chips">
          <label class="chip"><input type="radio" name="kind" value="materia" checked> Por matéria</label>
          ${provas.map(p => html`<label class="chip"><input type="radio" name="kind" value="prova:${p.id}"> ${p.id} completa</label>`)}
          <label class="chip"><input type="radio" name="kind" value="misto"> Misto da área</label>
        </div>
      </fieldset>
      <div id="subjectRow"><label class="field" for="subj">Matéria</label>
        <select id="subj">${subjectsFor(area).filter(s => questionsFor({ subjectId: s.id }).length).map(s => html`<option value="${s.id}">${s.prova} · ${s.name} (${questionsFor({ subjectId: s.id }).length})</option>`)}</select></div>
      <div class="grid two">
        <div><label class="field" for="n">Número de questões</label><input id="n" type="number" min="1" max="200" value="${Math.min(12, all.length)}"></div>
        <div><label class="field" for="min">Tempo (minutos, 0 = sem cronômetro)</label><input id="min" type="number" min="0" max="600" value="0"></div>
      </div>
      <p class="muted small" id="provaNote" hidden></p>
      <button class="btn" type="submit">Iniciar simulado</button>
    </form>
    ${historico(hist)}`;

  const form = root.querySelector('#cfg');
  const sync = () => {
    const kind = form.kind.value;
    root.querySelector('#subjectRow').hidden = kind !== 'materia';
    const note = root.querySelector('#provaNote');
    if (kind.startsWith('prova:')) {
      const p = provas.find(x => `prova:${x.id}` === kind);
      const need = (p.subjects || []).reduce((s, x) => s + (x.questions || 0), 0);
      root.querySelector('#n').value = need;
      root.querySelector('#n').disabled = true;
      root.querySelector('#min').value = p.durationMin || 0;
      note.hidden = false;
      note.textContent = `Composição oficial: ${need} questões${p.durationMin ? `, ${p.durationMin} min` : ''}. Se o banco não tiver questões suficientes de alguma disciplina, o simulado sai menor e o relatório avisa.`;
    } else { root.querySelector('#n').disabled = false; note.hidden = true; }
  };
  form.querySelectorAll('[name=kind]').forEach(r => r.onchange = sync);
  root.querySelector('#discard')?.addEventListener('click', async () => { await ctx.setKV(RUN_KEY, null); ctx.rerender(); });
  form.onsubmit = async e => {
    e.preventDefault();
    const kind = form.kind.value;
    const n = Number(root.querySelector('#n').value) || 10;
    const minutes = Number(root.querySelector('#min').value) || 0;
    let ids = [], shortfall = [];
    if (kind === 'materia') ids = shuffle(questionsFor({ subjectId: root.querySelector('#subj').value })).slice(0, n).map(q => q.id);
    else if (kind === 'misto') ids = shuffle(all).slice(0, n).map(q => q.id);
    else {
      const p = provas.find(x => `prova:${x.id}` === kind);
      for (const s of p.subjects || []) {
        const pool = shuffle(questionsFor({ subjectId: s.subjectId }));
        if (pool.length < s.questions) shortfall.push({ subjectId: s.subjectId, have: pool.length, need: s.questions });
        ids.push(...pool.slice(0, s.questions).map(q => q.id));
      }
    }
    if (!ids.length) { alert('Não há questões para essa configuração.'); return; }
    const run = {
      id: crypto.randomUUID(), kind, config: { n, minutes, subjectId: kind === 'materia' ? root.querySelector('#subj').value : null, shortfall },
      ids, chosen: {}, index: 0, startedAt: new Date().toISOString(),
      deadline: minutes ? Date.now() + minutes * 60000 : null,
    };
    await ctx.setKV(RUN_KEY, run);
    ctx.navigate('#/simulados/executar');
  };
  sync();
}

function historico(hist) {
  if (!hist.length) return '';
  return html`<h2>Histórico</h2><div class="card table-wrap"><table class="data"><thead><tr><th>Data</th><th>Tipo</th><th>Acertos</th><th>Pontos</th></tr></thead><tbody>
    ${hist.map(h => {
      const ok = h.items.filter(i => i.correct).length;
      return html`<tr><td><a href="#/simulados/resultado/${h.id}">${new Date(h.started_at).toLocaleDateString('pt-BR')}</a></td><td>${kindLabel(h.kind)}</td>
        <td>${ok}/${h.items.length} (${fmtPct(ok / h.items.length)})</td><td>${h.score ? `${h.score.total}/${h.score.max}` : '—'}</td></tr>`;
    })}</tbody></table></div>`;
}

function kindLabel(k) { return k === 'materia' ? 'Por matéria' : k === 'misto' ? 'Misto' : k.startsWith('prova:') ? `${k.slice(6)} completa` : k; }

async function executar(ctx, run, root, alive) {
  let timer = null;
  const finish = async () => {
    clearInterval(timer);
    const items = run.ids.map(id => {
      const q = question(id);
      const chosen = run.chosen[id] || null;
      return { question_id: id, chosen, correct: Boolean(q && chosen === q.answer), subject_id: q?.subjectId, topic_ids: q?.topicIds || [] };
    });
    for (const it of items.filter(i => i.chosen)) {
      await ctx.addAnswer({ question_id: it.question_id, chosen: it.chosen, correct: it.correct, topic_ids: it.topic_ids, subject_id: it.subject_id, source: 'simulado', session_id: run.id });
    }
    const score = scoreAttempt(content().exam && content().exam.rules, ctx.profile.area, items);
    await ctx.saveSimulado({ id: run.id, kind: run.kind, config: run.config, started_at: run.startedAt, finished_at: new Date().toISOString(), items, score });
    await ctx.setKV(RUN_KEY, null);
    ctx.setResume(`#/simulados/resultado/${run.id}`, 'Resultado do último simulado');
    ctx.navigate(`#/simulados/resultado/${run.id}`);
  };
  const save = () => ctx.setKV(RUN_KEY, run);

  const draw = () => {
    const q = question(run.ids[run.index]);
    const answered = Object.keys(run.chosen).length;
    root.innerHTML = html`
      <div class="spread" style="margin-bottom:10px"><h1 style="font-size:20px;margin:0">Simulado · ${kindLabel(run.kind)}</h1>
        ${run.deadline ? html`<span class="timer" id="timer" role="timer" aria-live="off"></span>` : ''}</div>
      <div class="card">
        <div class="q-head"><span class="tag">${subject(q?.subjectId)?.prova || ''}</span><span class="muted small">Questão ${run.index + 1} de ${run.ids.length} · ${answered} respondida(s)</span></div>
        ${q ? html`<div class="q-stem">${q.stem}</div>
        <ul class="options" role="radiogroup" aria-label="Alternativas">
          ${q.options.map(o => html`<li><button class="option" role="radio" aria-checked="${run.chosen[q.id] === o.key}" data-key="${o.key}" style="${run.chosen[q.id] === o.key ? 'border-color:var(--navy);box-shadow:inset 0 0 0 2px var(--navy)' : ''}"><span class="key">${o.key}</span><span>${o.text}</span></button></li>`)}
        </ul>` : html`<p class="muted">Questão indisponível (removida do conteúdo).</p>`}
        <div class="spread">
          <button class="btn ghost" id="prev" ${run.index === 0 ? 'disabled' : ''}>← Anterior</button>
          ${run.index + 1 < run.ids.length ? html`<button class="btn" id="next">Próxima →</button>` : html`<button class="btn gold" id="finish">Concluir simulado</button>`}
        </div>
      </div>
      <details style="margin-top:12px"><summary class="small">Ir para questão</summary>
        <div class="chips" style="margin-top:8px">${run.ids.map((id, i) => html`<button class="chip" data-go="${i}" aria-pressed="${i === run.index}" aria-label="Questão ${i + 1}${run.chosen[id] ? ', respondida' : ''}">${i + 1}${run.chosen[id] ? '•' : ''}</button>`)}</div>
        <p><button class="link" id="finish2">Concluir agora</button></p></details>`;
    root.querySelectorAll('.option').forEach(b => b.onclick = () => { run.chosen[q.id] = b.dataset.key; save(); draw(); });
    root.querySelector('#prev').onclick = () => { run.index--; save(); draw(); };
    root.querySelector('#next')?.addEventListener('click', () => { run.index++; save(); draw(); window.scrollTo(0, 0); });
    const confirmFinish = () => {
      const blank = run.ids.length - Object.keys(run.chosen).length;
      if (!blank || confirm(`${blank} questão(ões) em branco. Concluir mesmo assim?`)) finish();
    };
    root.querySelector('#finish')?.addEventListener('click', confirmFinish);
    root.querySelector('#finish2').onclick = confirmFinish;
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { run.index = Number(b.dataset.go); save(); draw(); });
    tick();
  };
  const tick = () => {
    if (!run.deadline) return;
    const left = run.deadline - Date.now();
    const el = root.querySelector('#timer');
    if (left <= 0) { clearInterval(timer); ctx.announce('Tempo esgotado. Simulado concluído.'); finish(); return; }
    if (el) {
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      el.textContent = `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h` : ''}${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  };
  if (!alive()) return;
  draw();
  if (run.deadline) {
    timer = setInterval(tick, 1000);
    root._cleanup = () => clearInterval(timer);
  }
}

async function resultado(ctx, id, root) {
  const { simulados: hist } = await ctx.data();
  const sim = hist.find(h => h.id === id);
  if (!sim) { root.innerHTML = html`<h1>Simulado não encontrado</h1><a href="#/simulados">Voltar</a>`; return; }
  const ok = sim.items.filter(i => i.correct).length;
  const bySubj = new Map();
  for (const it of sim.items) {
    const e = bySubj.get(it.subject_id) || { ok: 0, n: 0, blank: 0 };
    e.n++; if (it.correct) e.ok++; if (!it.chosen) e.blank++;
    bySubj.set(it.subject_id, e);
  }
  const wrong = sim.items.filter(i => !i.correct);
  const dur = sim.finished_at ? Math.round((Date.parse(sim.finished_at) - Date.parse(sim.started_at)) / 60000) : null;

  root.innerHTML = html`
    <p><a href="#/simulados">← Simulados</a></p>
    <h1>Resultado do simulado</h1>
    <p class="lead">${kindLabel(sim.kind)} · ${new Date(sim.started_at).toLocaleString('pt-BR')}${dur != null ? ` · ${dur} min` : ''}</p>
    <div class="kpis">
      <div class="kpi"><b>${ok}/${sim.items.length}</b><span>Acertos</span></div>
      <div class="kpi"><b>${fmtPct(ok / sim.items.length)}</b><span>Aproveitamento</span></div>
      <div class="kpi"><b>${sim.score ? `${sim.score.total}` : '—'}</b><span>${sim.score ? `de ${sim.score.max} pontos` : 'Pontos (sem regras oficiais)'}</span></div>
    </div>
    ${sim.config.shortfall && sim.config.shortfall.length ? html`<div class="notice" style="margin-top:12px">Banco insuficiente para a composição oficial em:
      ${sim.config.shortfall.map(s => `${subject(s.subjectId)?.name || s.subjectId} (${s.have}/${s.need})`).join('; ')}. A pontuação considera só as questões aplicadas.</div>` : ''}
    ${sim.score && sim.score.habilitacao && sim.score.habilitacao.length ? html`<h2>Critérios de habilitação</h2><ul>${sim.score.habilitacao.map(c => html`<li>${c.text || c.type}: ${c.ok == null ? 'não avaliado' : c.ok ? 'atingido' : 'não atingido'}${c.actual != null ? ` (${fmtPct(c.actual)})` : ''}</li>`)}</ul>` : ''}
    <h2>Por disciplina</h2>
    <div class="card table-wrap"><table class="data"><thead><tr><th>Disciplina</th><th>Acertos</th><th>Em branco</th></tr></thead><tbody>
      ${[...bySubj.entries()].map(([sid, e]) => html`<tr><td>${subject(sid)?.name || sid}</td><td>${e.ok}/${e.n} (${fmtPct(e.ok / e.n)})</td><td>${e.blank}</td></tr>`)}
    </tbody></table></div>
    <h2>Diagnóstico dos erros</h2>
    ${wrong.length ? wrong.map(it => {
      const q = question(it.question_id);
      if (!q) return '';
      return html`<details class="frag"><summary><span>${q.stem.slice(0, 110)}${q.stem.length > 110 ? '…' : ''}</span><span class="tag bad">${it.chosen || 'branco'} → ${q.answer}</span></summary>
        <div class="body"><div class="q-stem">${q.stem}</div>
        <ul>${q.options.map(o => html`<li${o.key === q.answer ? ' style="font-weight:600"' : ''}>${o.key}) ${o.text}</li>`)}</ul>
        ${q.explanation ? md(q.explanation) : html`<p class="muted">Sem justificativa publicada.</p>`}<p class="prov">${provenance(q.provenance)}</p></div></details>`;
    }) : html`<p class="muted">Nenhum erro. 🎯</p>`}
    <div class="row" style="margin-top:16px"><a class="btn" href="#/estudar?mode=erros&new=1">Revisar erros</a><a class="btn ghost" href="#/simulados">Novo simulado</a></div>`;
}
