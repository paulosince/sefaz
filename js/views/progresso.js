import { html, fmtPct } from '../lib/util.js';
import { subjectsFor, topic, subject } from '../data/content.js';
import { accuracy, streak, dailySeries, weakest, masteryLabel } from '../logic/stats.js';
import { estimateScore } from '../logic/planner.js';
import { content } from '../data/content.js';
import { masteryMaps, bar } from './common.js';

export async function progresso(ctx, route, root) {
  const { answers, reviews, simulados } = await ctx.data();
  const { topics, subjects } = await masteryMaps(ctx);
  const series = dailySeries(answers, 30);
  const peak = Math.max(1, ...series.map(d => d.total));
  const est = estimateScore(content(), ctx.profile.area, subjects);
  const goal = await ctx.getKV('meta');
  const weak = weakest(topics);
  const minutes = Math.round(answers.reduce((s, a) => s + (a.elapsed_ms || 0), 0) / 60000);

  root.innerHTML = html`
    <h1>Progresso</h1>
    <p class="lead">${ctx.profile.name} · ${ctx.profile.area}</p>
    <div class="kpis">
      <div class="kpi"><b>${answers.length}</b><span>Questões respondidas</span></div>
      <div class="kpi"><b>${fmtPct(accuracy(answers))}</b><span>Acertos</span></div>
      <div class="kpi"><b>${streak([...answers.map(a => a.answered_at), ...reviews.map(r => r.reviewed_at)]) || '—'}</b><span>Dias seguidos</span></div>
    </div>
    <p class="muted small">${reviews.length} revisões de flashcards · ${simulados.length} simulado(s) · ~${minutes} min em questões (tempo medido por questão)</p>

    <h2>Meta e pontuação estimada</h2>
    <div class="card">
      ${est ? html`<p style="margin-top:0">Estimativa atual: <strong>${est.total.toFixed(1)}</strong> de ${est.max} pontos (${fmtPct(est.total / est.max)})
          ${goal && goal.pct ? html` · meta: ${goal.pct}%` : ''}</p>${bar(est.total / est.max, 'navy')}
          <p class="muted small">Estimativa = pontos de cada disciplina × domínio estimado nela. Disciplinas sem respostas contam como 0. É um indicador, não uma previsão de nota.</p>`
        : html`<p class="muted" style="margin:0">Sem as regras oficiais de pontuação no pacote de conteúdo, mostro só a taxa de acertos.
          ${goal && goal.pct ? html` Meta de acertos: <strong>${goal.pct}%</strong> · atual: <strong>${fmtPct(accuracy(answers))}</strong>.` : ''}</p>`}
      <p class="small" style="margin-bottom:0"><a href="#/plano">Ajustar meta no plano</a></p>
    </div>

    <h2>Evolução (30 dias)</h2>
    <div class="card">
      <div class="spark" role="img" aria-label="Questões por dia nos últimos 30 dias">
        ${series.map(d => html`<span class="${d.total ? '' : 'zero'}" style="height:${Math.round(d.total / peak * 100)}%" title="${d.day}: ${d.correct}/${d.total}"></span>`)}
      </div>
      <p class="muted small" style="margin-bottom:0">Questões por dia. Passe o mouse para ver acertos.</p>
    </div>

    <h2>Domínio por disciplina</h2>
    <div class="card stack">
      ${subjectsFor(ctx.profile.area).map(s => {
        const m = subjects.get(s.id);
        return html`<div><div class="spread small"><span><span class="tag">${s.prova}</span> ${s.name}</span><span class="muted">${masteryLabel(m)}${m ? ` · ${m.correct}/${m.total}` : ''}</span></div>${bar(m ? m.mastery : 0)}</div>`;
      })}
    </div>

    <h2>Onde mais erra</h2>
    ${weak.length ? html`<div class="card table-wrap"><table class="data"><thead><tr><th>Tópico</th><th>Disciplina</th><th>Acertos</th><th></th></tr></thead><tbody>
      ${weak.map(([id, m]) => {
        const t = topic(id);
        return html`<tr><td>${t ? t.title : id}</td><td>${t ? subject(t.subjectId)?.name : ''}</td><td>${m.correct}/${m.total}</td>
          <td><a href="#/estudar?topic=${encodeURIComponent(id)}&new=1">Praticar</a></td></tr>`;
      })}</tbody></table></div>`
      : html`<p class="muted">Responda pelo menos 3 questões de um tópico para ele aparecer aqui.</p>`}`;
}
