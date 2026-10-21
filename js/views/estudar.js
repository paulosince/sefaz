// Resolução de questões: uma por vez, correção imediata e justificativa.
// A sessão (ordem das questões e posição) fica salva, então sair e voltar
// ou trocar de matéria não perde o ponto onde parou.

import { html, md, shuffle } from '../lib/util.js';
import { questionsFor, question, subject, topic } from '../data/content.js';
import { provenance, noContent } from './common.js';

const SESSION_SIZE = 10;

/** Questões cuja resposta mais recente foi errada. */
export function wrongQuestionIds(answers) {
  const last = new Map();
  for (const a of [...answers].sort((x, y) => x.answered_at.localeCompare(y.answered_at))) last.set(a.question_id, a.correct);
  return [...last.entries()].filter(([, ok]) => !ok).map(([id]) => id);
}

export async function estudar(ctx, route, root, alive) {
  const q = route.query;
  const subjectId = q.get('subject'), topicId = q.get('topic'), mode = q.get('mode') || 'normal';
  const key = `session:${mode}:${subjectId || ''}:${topicId || ''}`;
  const { answers } = await ctx.data();

  let session = await ctx.getKV(key);
  const fresh = q.get('new') === '1' || !session || session.index >= session.ids.length;
  if (fresh) {
    let pool;
    if (mode === 'erros') {
      const wrong = new Set(wrongQuestionIds(answers));
      pool = questionsFor({ area: ctx.profile.area }).filter(x => wrong.has(x.id));
    } else {
      pool = questionsFor({ area: ctx.profile.area, subjectId, topicId });
      // Prioriza as ainda não respondidas, depois as erradas.
      const seen = new Map(answers.map(a => [a.question_id, a.correct]));
      pool = [...shuffle(pool.filter(x => !seen.has(x.id))), ...shuffle(pool.filter(x => seen.get(x.id) === false)), ...shuffle(pool.filter(x => seen.get(x.id) === true))];
    }
    session = { ids: pool.slice(0, SESSION_SIZE).map(x => x.id), index: 0, results: {}, startedAt: new Date().toISOString(), id: crypto.randomUUID() };
    if (q.get('new') === '1') { history.replaceState(null, '', location.hash.replace(/[?&]new=1/, '')); }
    await ctx.setKV(key, session);
  }
  if (!alive()) return;

  const scope = topicId ? topic(topicId)?.title : subjectId ? subject(subjectId)?.name : mode === 'erros' ? 'Revisão de erros' : 'Todas as matérias';
  const back = topicId ? `#/materias/${encodeURIComponent(topic(topicId)?.subjectId || '')}/${encodeURIComponent(topicId)}` : subjectId ? `#/materias/${encodeURIComponent(subjectId)}` : '#/materias';

  if (!session.ids.length) {
    root.innerHTML = html`<p><a href="${back}">← Voltar</a></p><h1>${scope}</h1>${mode === 'erros'
      ? html`<div class="card empty"><strong>Nenhum erro pendente</strong>Você acertou a última tentativa de todas as questões que errou.</div>`
      : noContent('questões publicadas para este recorte')}`;
    return;
  }

  const draw = () => {
    if (session.index >= session.ids.length) return summary();
    const item = question(session.ids[session.index]);
    if (!item) { session.index++; return draw(); }
    const res = session.results[item.id];
    const s = subject(item.subjectId);
    ctx.setResume(location.hash, `${scope}: questão ${session.index + 1} de ${session.ids.length}`);
    root.innerHTML = html`
      <p><a href="${back}">← ${scope}</a></p>
      <div class="card">
        <div class="q-head"><span class="tag">${s ? s.prova : ''}</span><span class="muted small">Questão ${session.index + 1} de ${session.ids.length}</span></div>
        <h1 class="sr-only">Questão ${session.index + 1}</h1>
        <div class="q-stem">${item.stem}</div>
        <ul class="options" role="list">
          ${item.options.map(o => {
            let cls = '';
            if (res) { if (o.key === item.answer) cls = 'correct'; else if (o.key === res.chosen) cls = 'wrong'; }
            return html`<li><button class="option ${cls}" data-key="${o.key}" ${res ? 'disabled' : ''} aria-label="Alternativa ${o.key}: ${o.text}"><span class="key">${o.key}</span><span>${o.text}</span></button></li>`;
          })}
        </ul>
        ${res ? html`
          <div class="feedback ${res.correct ? 'ok' : 'bad'}" role="status">
            <strong>${res.correct ? 'Correta!' : `Incorreta. Gabarito: ${item.answer}.`}</strong>
            ${item.explanation ? md(item.explanation) : html`<p class="muted">Sem justificativa publicada para esta questão.</p>`}
          </div>
          <div class="row" style="margin-top:12px"><button class="btn" id="next">${session.index + 1 < session.ids.length ? 'Próxima questão →' : 'Ver resultado'}</button></div>` : ''}
        <p class="prov">${provenance(item.provenance)}</p>
      </div>`;
    const t0 = performance.now();
    root.querySelectorAll('.option:not([disabled])').forEach(b => b.onclick = async () => {
      const chosen = b.dataset.key;
      const correct = chosen === item.answer;
      session.results[item.id] = { chosen, correct };
      await ctx.addAnswer({
        question_id: item.id, chosen, correct, topic_ids: item.topicIds || [], subject_id: item.subjectId,
        source: mode === 'erros' ? 'revisao' : 'estudo', session_id: session.id, elapsed_ms: Math.round(performance.now() - t0),
      });
      await ctx.setKV(key, session);
      ctx.announce(correct ? 'Resposta correta.' : `Resposta incorreta. O gabarito é ${item.answer}.`);
      draw();
      root.querySelector('#next')?.focus();
    });
    const next = root.querySelector('#next');
    if (next) next.onclick = async () => { session.index++; await ctx.setKV(key, session); draw(); window.scrollTo(0, 0); };
  };

  const summary = () => {
    const results = Object.values(session.results);
    const ok = results.filter(r => r.correct).length;
    ctx.setResume('#/plano', 'Sessão concluída. Veja a próxima recomendação no plano.');
    root.innerHTML = html`
      <p><a href="${back}">← ${scope}</a></p>
      <h1>Sessão concluída</h1>
      <div class="card"><p style="margin-top:0;font-size:20px"><strong>${ok}</strong> de ${results.length} corretas</p>
        <div class="row">
          <a class="btn" href="${location.hash.split('?')[0]}?${new URLSearchParams({ ...(subjectId && { subject: subjectId }), ...(topicId && { topic: topicId }), ...(mode !== 'normal' && { mode }), new: '1' })}">Nova sessão</a>
          <a class="btn ghost" href="#/plano">Próxima atividade do plano</a>
        </div></div>`;
  };

  draw();
}
