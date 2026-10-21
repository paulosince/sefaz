import { html, fmtDate } from '../lib/util.js';
import { hasContent, subject } from '../data/content.js';
import { content } from '../data/content.js';
import { prioritize, todayPlan, schedule, daysUntil, BLOCK_MIN } from '../logic/planner.js';
import { examInfo, masteryMaps, noContent } from './common.js';
import { dueCount } from './flashcards.js';
import { wrongQuestionIds } from './estudar.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DEFAULTS = { minutesPerDay: 120, studyWeekdays: [1, 2, 3, 4, 5, 6] };

export async function plano(ctx, route, root) {
  const settings = { ...DEFAULTS, ...((await ctx.getKV('plano')) || {}) };
  const meta = (await ctx.getKV('meta')) || {};
  const exam = examInfo(ctx.profile.area);
  const days = daysUntil(exam.date);

  const form = html`
    <details class="card" ${ctx.profile && !(await ctx.getKV('plano')) ? 'open' : ''}>
      <summary><strong>Disponibilidade e meta</strong> <span class="muted small">· ${settings.minutesPerDay} min/dia · ${settings.studyWeekdays.map(d => WEEKDAYS[d]).join(', ')}${meta.pct ? ` · meta ${meta.pct}%` : ''}</span></summary>
      <form id="cfg" class="stack" style="margin-top:12px">
        <div><label class="field" for="mpd">Minutos de estudo por dia</label><input id="mpd" type="number" min="15" max="720" step="5" value="${settings.minutesPerDay}"></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="field">Dias de estudo</legend>
          <div class="chips">${WEEKDAYS.map((w, i) => html`<label class="chip"><input type="checkbox" name="wd" value="${i}" ${settings.studyWeekdays.includes(i) ? 'checked' : ''}> ${w}</label>`)}</div></fieldset>
        <div><label class="field" for="goal">Meta de aproveitamento (%)</label><input id="goal" type="number" min="1" max="100" value="${meta.pct || ''}" placeholder="ex.: 75"></div>
        <button class="btn" type="submit">Salvar</button>
      </form>
    </details>`;

  if (!hasContent()) {
    root.innerHTML = html`<h1>Plano de hoje</h1>${form}<div style="margin-top:12px">${noContent('os tópicos para planejar')}</div>`;
    bind(ctx, root);
    return;
  }

  const { topics } = await masteryMaps(ctx);
  const rows = prioritize(content(), ctx.profile.area, topics);
  const { answers } = await ctx.data();
  const tasks = todayPlan({
    minutesPerDay: settings.minutesPerDay,
    dueCards: await dueCount(ctx),
    wrongToReview: wrongQuestionIds(answers).length,
    rows,
  });
  const cal = schedule({ rows, examDate: exam.date, minutesPerDay: settings.minutesPerDay, studyWeekdays: settings.studyWeekdays });
  const noEvidence = rows.every(r => r.incidence.basis !== 'historica');
  const noRules = rows.every(r => !r.subjectPointsKnown);

  const link = t => t.kind === 'flashcards' ? '#/flashcards'
    : t.kind === 'erros' ? '#/estudar?mode=erros&new=1'
    : `#/materias/${encodeURIComponent(t.subjectId)}/${encodeURIComponent(t.topicId)}`;
  const title = t => t.kind === 'flashcards' ? `Revisar ${t.count} flashcard(s)` : t.kind === 'erros' ? `Refazer ${t.count} questão(ões) errada(s)` : t.title;

  root.innerHTML = html`
    <h1>Plano de hoje</h1>
    <p class="lead">${days != null && days > 0 ? `${days} dias até a prova (${fmtDate(exam.date)}).` : ''} Recalculado a cada resposta.</p>
    ${noEvidence || noRules ? html`<div class="notice" style="margin-bottom:12px">Base da priorização:
      ${noRules ? 'regras de pontuação oficiais ainda não carregadas (todas as disciplinas com o mesmo peso)' : 'pesos oficiais'};
      ${noEvidence ? 'sem incidência histórica verificada (tópicos com divisão igual dentro da disciplina)' : 'incidência histórica verificada'}.
      O que mais pesa hoje é o seu domínio por tópico.</div>` : ''}
    <ol class="stack" style="list-style:none;padding:0">
      ${tasks.map((t, i) => html`<li class="card${i === 0 ? ' continue' : ''}">
        <div class="spread"><strong>${i + 1}. ${title(t)}</strong><span class="muted small">${t.minutes} min</span></div>
        ${t.subjectId ? html`<p class="muted small" style="margin:4px 0 0">${subject(t.subjectId)?.name}</p>` : ''}
        <p class="small" style="margin:6px 0 10px">${t.reason}</p>
        <a class="btn small" href="${link(t)}">${i === 0 ? 'Começar →' : 'Abrir'}</a></li>`)}
    </ol>
    ${form}
    <h2>Próximas duas semanas</h2>
    <div class="card table-wrap">${cal.length ? html`<table class="data"><thead><tr><th>Dia</th><th>Blocos de ${BLOCK_MIN} min</th></tr></thead><tbody>
      ${cal.slice(0, 14).map(d => html`<tr><td style="white-space:nowrap">${fmtDate(d.day, { weekday: 'short', day: '2-digit', month: 'short' })}</td>
        <td>${d.blocks.map(b => b.title).join(' · ')}</td></tr>`)}</tbody></table>
      <p class="muted small">Cronograma até a prova: ${cal.length} dias de estudo, distribuídos pela prioridade atual. Ele muda conforme você acerta e erra.</p>`
      : html`<p class="muted">Sem dias de estudo até a data da prova.</p>`}</div>`;
  bind(ctx, root);
}

function bind(ctx, root) {
  const f = root.querySelector('#cfg');
  f.onsubmit = async e => {
    e.preventDefault();
    const wd = [...f.querySelectorAll('[name=wd]:checked')].map(x => Number(x.value));
    await ctx.setKV('plano', { minutesPerDay: Math.max(15, Number(f.querySelector('#mpd').value) || 120), studyWeekdays: wd.length ? wd : DEFAULTS.studyWeekdays });
    const g = Number(f.querySelector('#goal').value);
    await ctx.setKV('meta', g ? { pct: Math.min(100, Math.max(1, g)) } : null);
    ctx.announce('Plano atualizado.');
    ctx.rerender();
  };
}
