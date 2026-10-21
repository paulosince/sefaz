import { html, fmtDate } from '../lib/util.js';
import { content } from '../data/content.js';
import { EXAM_FALLBACK } from '../config.js';
import { provasForArea } from '../logic/scoring.js';
import { examInfo } from './common.js';

export async function concurso(ctx, route, root) {
  const exam = content().exam || {};
  const info = examInfo(ctx.profile.area);
  const section = route.args[0] || 'cronograma';
  const tabs = [['cronograma', 'Cronograma'], ['provas', 'Provas e pontuação'], ['carreira', 'Remuneração e carreira'], ['versoes', 'Versões do edital']];
  const src = content().source;

  let body;
  if (section === 'cronograma') {
    const items = exam.schedule || [];
    body = items.length
      ? html`<div class="table-wrap"><table class="data"><thead><tr><th>Evento</th><th>Data</th><th>Fonte</th></tr></thead><tbody>
          ${items.map(i => html`<tr><td>${i.event}</td><td>${i.date ? fmtDate(i.date) : i.text}</td><td class="muted">${i.page ? `p. ${i.page}` : ''}</td></tr>`)}
        </tbody></table></div>`
      : html`<div class="notice">O cronograma oficial ainda não está no pacote de conteúdo. Por enquanto, a única data exibida é a da prova
          (${fmtDate(info.date)}), obtida de notícias sobre o edital e <strong>a conferir</strong> no
          <a href="${EXAM_FALLBACK.editalUrl}" target="_blank" rel="noopener">site da FCC</a>.</div>`;
  } else if (section === 'provas') {
    const provas = provasForArea(info.rules, ctx.profile.area);
    body = provas.length
      ? html`${provas.map(p => html`<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">${p.id} · ${p.name}</h3>
          <p class="muted small">${p.kind || ''}${p.durationMin ? ` · ${p.durationMin} min` : ''}${p.page ? ` · edital p. ${p.page}` : ''}</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>Disciplina</th><th>Questões</th><th>Peso</th><th>Pontos</th></tr></thead><tbody>
          ${(p.subjects || []).map(s => html`<tr><td>${s.name || s.subjectId}</td><td>${s.questions}</td><td>${s.weight ?? 1}</td><td>${(s.questions || 0) * (s.weight ?? 1)}</td></tr>`)}
          </tbody></table></div></div>`)}
          ${(info.rules.habilitacao || []).length ? html`<h3>Critérios de habilitação</h3><ul>${info.rules.habilitacao.map(c => html`<li>${c.text || JSON.stringify(c)}</li>`)}</ul>` : ''}`
      : html`<div class="notice">As regras de provas, pesos e habilitação ainda não estão no pacote de conteúdo.
          Sem elas, o app mostra só acertos brutos e não calcula pontos ponderados. Consulte o edital oficial.</div>`;
  } else if (section === 'carreira') {
    body = exam.career
      ? html`<div class="card">${exam.career.text}${exam.career.page ? html`<p class="prov">Edital, p. ${exam.career.page}</p>` : ''}</div>`
      : html`<div class="notice">Dados de remuneração e carreira ainda não estão no pacote de conteúdo.</div>`;
  } else {
    const changes = content().changes || [];
    body = html`<div class="card"><p style="margin-top:0"><strong>Versão do conteúdo:</strong> ${content().version || '—'}
        ${content().generatedAt ? html` · gerado em ${fmtDate(content().generatedAt)}` : ''}</p>
        ${src && src.edital ? html`<p><strong>Edital:</strong> ${src.edital.title}${src.edital.url ? html` · <a href="${src.edital.url}" target="_blank" rel="noopener">abrir</a>` : ''}</p>` : ''}
        ${changes.length
          ? html`<h3>Retificações e alterações</h3><ul>${changes.map(c => html`<li><strong>${fmtDate(c.date)}</strong> — ${c.title}${c.impact ? html`<br><span class="muted small">${c.impact}</span>` : ''}</li>`)}</ul>`
          : html`<p class="muted">Nenhuma retificação registrada no pacote de conteúdo.</p>`}</div>`;
  }

  root.innerHTML = html`
    <h1>Informações do concurso</h1>
    <p class="lead">SEFAZ-SP 2026 · Analista de Planejamento, Orçamento e Finanças Públicas</p>
    <div class="chips" role="tablist" style="margin-bottom:16px">
      ${tabs.map(([k, l]) => html`<a class="chip" role="tab" aria-selected="${k === section}" aria-pressed="${k === section}" href="#/concurso/${k}">${l}</a>`)}
    </div>
    ${body}`;
}
