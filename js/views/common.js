import { html } from '../lib/util.js';
import { content, hasContent } from '../data/content.js';
import { EXAM_FALLBACK } from '../config.js';
import { masteryBy, byTopic, bySubject } from '../logic/stats.js';

export function noContent(what = 'o conteúdo') {
  return html`<div class="card empty"><strong>Conteúdo ainda não carregado</strong>
    Não encontrei ${what} no pacote de conteúdo (data/content.json). Ele é gerado a partir do Neon pelo
    script <code>scripts/export-content.mjs</code>. Nada aqui é preenchido com dados inventados.</div>`;
}

export { hasContent };

/** Dados do concurso: do pacote oficial quando existir; senão, o fallback marcado como "a conferir". */
export function examInfo(area) {
  const exam = content().exam;
  const a = exam && exam.areas && exam.areas[area];
  return {
    date: (exam && exam.date) || EXAM_FALLBACK.date,
    vagas: (a && a.vagas) ?? EXAM_FALLBACK.vagas[area] ?? null,
    official: Boolean(exam && exam.date),
    rules: exam && exam.rules,
  };
}

export async function masteryMaps(ctx) {
  const { answers } = await ctx.data();
  return { topics: masteryBy(answers, byTopic), subjects: masteryBy(answers, bySubject), answers };
}

export function bar(frac, cls = '') {
  const pct = Math.max(0, Math.min(100, Math.round((frac || 0) * 100)));
  return html`<div class="bar ${cls}" role="img" aria-label="${pct}%"><span style="width:${pct}%"></span></div>`;
}

export function provenance(p) {
  if (!p) return html`<span class="tag gray">origem não informada</span>`;
  if (p.kind === 'fcc' || p.kind === 'oficial') {
    return html`<span class="tag">${p.org || 'FCC'} ${p.year || ''}</span> ${p.exam || ''}${p.number ? html` · questão ${p.number}` : ''}${p.url ? html` · <a href="${p.url}" target="_blank" rel="noopener">fonte</a>` : ''}`;
  }
  return html`<span class="tag gray">${p.kind || 'material'}</span> ${p.note || ''}`;
}

export function editalRef(topic) {
  const pages = topic && topic.pages;
  if (!pages || !pages.length) return '';
  return html`<span class="muted small">Edital, p. ${pages.join(', ')}</span>`;
}
