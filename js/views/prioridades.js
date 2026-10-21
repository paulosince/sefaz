import { html, fmtPct } from '../lib/util.js';
import { content, hasContent } from '../data/content.js';
import { prioritize, paretoCurve, explain } from '../logic/planner.js';
import { masteryMaps, noContent } from './common.js';

export async function prioridades(ctx, route, root) {
  if (!hasContent()) { root.innerHTML = html`<h1>Prioridades</h1>${noContent('os tópicos')}`; return; }
  const { topics } = await masteryMaps(ctx);
  const rows = prioritize(content(), ctx.profile.area, topics);
  const curve = paretoCurve(rows);
  const k80 = curve.findIndex(r => r.cumulative >= 0.8) + 1;
  const hist = rows.filter(r => r.incidence.basis === 'historica').length;
  const exams = new Set((content().incidence || []).filter(i => i.verified !== false).flatMap(i => i.exams || []));

  root.innerHTML = html`
    <h1>Prioridades</h1>
    <p class="lead">Retorno provável em pontos por hora: pontos em jogo × o que falta dominar ÷ esforço.</p>
    <div class="notice" style="margin-bottom:12px">
      ${hist ? `Incidência histórica verificada em ${hist} de ${rows.length} tópicos${exams.size ? `, a partir de ${exams.size} prova(s)` : ''}.`
        : 'Ainda não há incidência histórica verificada no conteúdo. A ordem abaixo usa só os pesos oficiais (se carregados) e o seu domínio.'}
      ${k80 > 0 && hist ? ` ${k80} tópico(s) concentram 80% dos pontos estimados.` : ''}
    </div>
    <div class="card table-wrap"><table class="data">
      <thead><tr><th>#</th><th>Tópico</th><th>Pontos em jogo</th><th>Domínio</th><th>Por quê</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 60).map((r, i) => html`<tr>
        <td>${i + 1}</td>
        <td><strong>${r.topic.title}</strong><br><span class="muted small">${r.subject?.name}</span></td>
        <td>${r.points.toFixed(2)}</td>
        <td>${r.mastery ? fmtPct(r.mastery.mastery) : '—'}</td>
        <td class="small muted">${explain(r)}</td>
        <td><a href="#/materias/${encodeURIComponent(r.topic.subjectId)}/${encodeURIComponent(r.topic.id)}">Estudar</a></td></tr>`)}</tbody>
    </table></div>
    ${rows.length > 60 ? html`<p class="muted small">Mostrando 60 de ${rows.length} tópicos.</p>` : ''}`;
}
