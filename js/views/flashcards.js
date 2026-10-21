import { html, md } from '../lib/util.js';
import { flashcardsFor, flashcard, subjectsFor, topic } from '../data/content.js';
import { replay, dueQueue, GRADES, applyReview, initialState } from '../logic/srs.js';
import { noContent, provenance } from './common.js';

const DAY = 86400000;
function nextLabel(state, grade) {
  const s = applyReview(state || initialState(), grade, Date.now());
  const d = (s.due - Date.now()) / DAY;
  return d < 1 ? '10 min' : `${Math.round(d)} d`;
}

export async function dueCount(ctx) {
  const { reviews } = await ctx.data();
  const ids = flashcardsFor({ area: ctx.profile.area }).map(c => c.id);
  return dueQueue(ids, replay(reviews), Date.now(), 0).length;
}

export async function flashcards(ctx, route, root) {
  const subjectId = route.query.get('subject') || '';
  const cards = flashcardsFor({ area: ctx.profile.area, subjectId: subjectId || null });
  if (!flashcardsFor({ area: ctx.profile.area }).length) { root.innerHTML = html`<h1>Flashcards</h1>${noContent('flashcards publicados')}`; return; }
  const { reviews } = await ctx.data();
  const states = replay(reviews);
  const queue = dueQueue(cards.map(c => c.id), states);
  const subs = subjectsFor(ctx.profile.area).filter(s => flashcardsFor({ subjectId: s.id }).length);
  let revealed = false;

  const header = html`
    <h1>Flashcards</h1>
    <p class="lead">Revisão espaçada: o que você marca define quando o cartão volta.</p>
    <div class="chips" style="margin-bottom:16px">
      <a class="chip" href="#/flashcards" aria-pressed="${!subjectId}">Todas</a>
      ${subs.map(s => html`<a class="chip" href="#/flashcards?subject=${encodeURIComponent(s.id)}" aria-pressed="${s.id === subjectId}">${s.name}</a>`)}
    </div>`;

  const draw = () => {
    if (!queue.length) {
      const next = cards.map(c => states.get(c.id)?.due).filter(Boolean).sort((a, b) => a - b)[0];
      root.innerHTML = html`${header}<div class="card empty"><strong>Nada para revisar agora</strong>
        ${next ? `Próxima revisão: ${new Date(next).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}</div>`;
      return;
    }
    const c = flashcard(queue[0]);
    const st = states.get(c.id);
    root.innerHTML = html`${header}
      <p class="muted small">${queue.length} cartão(ões) na fila${st ? '' : ' · cartão novo'}</p>
      <div class="card flash" aria-live="polite">
        <div>${md(c.front)}</div>
        ${revealed ? html`<div class="answer">${md(c.back)}<p class="prov">${topic(c.topicId)?.title || ''} ${provenance(c.provenance)}</p></div>` : ''}
      </div>
      ${revealed
        ? html`<div class="grades" role="group" aria-label="Como foi lembrar?">
            <button class="btn ghost" data-g="${GRADES.again}">Errei<small>${nextLabel(st, GRADES.again)}</small></button>
            <button class="btn ghost" data-g="${GRADES.hard}">Difícil<small>${nextLabel(st, GRADES.hard)}</small></button>
            <button class="btn" data-g="${GRADES.good}">Lembrei<small>${nextLabel(st, GRADES.good)}</small></button>
            <button class="btn gold" data-g="${GRADES.easy}">Fácil<small>${nextLabel(st, GRADES.easy)}</small></button>
          </div>`
        : html`<div class="row" style="margin-top:14px;justify-content:center"><button class="btn" id="reveal">Revelar resposta</button></div>`}`;
    root.querySelector('#reveal')?.addEventListener('click', () => { revealed = true; draw(); root.querySelector('[data-g]')?.focus(); });
    root.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => {
      const grade = Number(b.dataset.g);
      const ev = await ctx.addReview({ card_id: c.id, grade });
      ctx.setResume('#/flashcards', 'Revisão de flashcards');
      states.set(c.id, applyReview(st || initialState(), grade, ev.reviewed_at));
      queue.shift();
      if (grade === GRADES.again) queue.push(c.id); // volta ainda nesta sessão
      revealed = false;
      draw();
      root.querySelector('#reveal')?.focus();
    });
  };
  draw();
}
