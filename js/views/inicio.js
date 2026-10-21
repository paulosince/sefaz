import { html, fmtDate, fmtPct } from '../lib/util.js';
import { AREAS } from '../config.js';
import { accuracy, streak } from '../logic/stats.js';
import { daysUntil } from '../logic/planner.js';
import { examInfo } from './common.js';

export async function inicio(ctx, route, root) {
  const p = ctx.profile;
  const { answers, reviews } = await ctx.data();
  const exam = examInfo(p.area);
  const days = daysUntil(exam.date);
  const activity = [...answers.map(a => a.answered_at), ...reviews.map(r => r.reviewed_at)];
  const st = streak(activity);
  const acc = accuracy(answers);
  const resume = await ctx.getKV('resume');

  root.innerHTML = html`
    <section class="hero" aria-labelledby="hero-name">
      <div class="kicker">RUMO À SEFAZ · 2026</div>
      <h1 class="who" id="hero-name">${p.name} <span>·</span> ${p.area}</h1>
      <p class="role">Analista de Planejamento, Orçamento e Finanças Públicas<strong>${AREAS[p.area]?.name}</strong></p>
      <div class="facts">
        <div class="fact"><small>DATA DA PROVA</small><b>${fmtDate(exam.date)}</b></div>
        <div class="fact"><small>VAGAS DA ÁREA</small><b>${exam.vagas ?? '—'} vagas</b></div>
      </div>
      ${days != null && days >= 0 ? html`<p class="role" style="margin-top:14px">${days === 0 ? 'A prova é hoje.' : `Faltam ${days} dias.`}${exam.official ? '' : ' (data e vagas a conferir no edital)'}</p>` : ''}
    </section>

    <h2>Sua preparação</h2>
    <div class="kpis">
      <div class="kpi"><b>${st || '—'}</b><span>Dias seguidos</span></div>
      <div class="kpi"><b>${fmtPct(acc)}</b><span>Acertos</span></div>
      <div class="kpi"><b>${answers.length}</b><span>Questões</span></div>
    </div>

    <h2>Continue de onde parou</h2>
    <div class="card continue">
      ${resume
        ? html`<p style="margin-top:0">${resume.label}</p><a class="btn" href="${resume.route}">Continuar →</a>`
        : html`<p class="muted" style="margin-top:0">Seu próximo estudo aparecerá aqui.</p><a class="btn" href="#/plano">Começar a estudar →</a>`}
    </div>

    <h2>Informações do concurso</h2>
    <div class="card linklist">
      <a href="#/concurso/cronograma">Cronograma e datas</a>
      <a href="#/concurso/provas">Provas, pesos e pontuação</a>
      <a href="#/concurso/carreira">Remuneração e carreira</a>
      <a href="#/edital">Conteúdo programático</a>
    </div>`;
}
