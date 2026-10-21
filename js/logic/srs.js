// Revisão espaçada (variante do SM-2).
// O estado de cada cartão é recalculado a partir do log de revisões, que é
// só de inserção. Assim dois aparelhos que revisaram offline convergem para o
// mesmo estado depois da sincronização: basta unir os eventos pelo id.

export const GRADES = Object.freeze({ again: 0, hard: 1, good: 2, easy: 3 });

const DAY = 86400000;
const MIN_EASE = 1.3;

export function initialState() {
  return { reps: 0, ease: 2.5, intervalDays: 0, due: null, lapses: 0, last: null };
}

export function applyReview(state, grade, at) {
  const s = { ...state };
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (grade === GRADES.again) {
    s.reps = 0;
    s.lapses += 1;
    s.ease = Math.max(MIN_EASE, s.ease - 0.2);
    s.intervalDays = 0; // volta ainda hoje (10 min)
    s.due = t + 10 * 60000;
  } else {
    if (grade === GRADES.hard) s.ease = Math.max(MIN_EASE, s.ease - 0.15);
    if (grade === GRADES.easy) s.ease += 0.15;
    if (s.reps === 0) s.intervalDays = grade === GRADES.easy ? 3 : 1;
    else if (s.reps === 1) s.intervalDays = grade === GRADES.hard ? 3 : grade === GRADES.easy ? 8 : 6;
    else {
      const mult = grade === GRADES.hard ? 1.2 : grade === GRADES.easy ? s.ease * 1.3 : s.ease;
      s.intervalDays = Math.max(s.intervalDays + 1, Math.round(s.intervalDays * mult));
    }
    s.reps += 1;
    s.due = t + s.intervalDays * DAY;
  }
  s.last = t;
  return s;
}

function byTimeThenId(a, b) {
  const d = Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at);
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Map cardId -> estado, a partir de eventos {id, card_id, grade, reviewed_at}. */
export function replay(events) {
  const states = new Map();
  for (const ev of [...events].sort(byTimeThenId)) {
    const prev = states.get(ev.card_id) || initialState();
    states.set(ev.card_id, applyReview(prev, ev.grade, ev.reviewed_at));
  }
  return states;
}

/** Cartões a revisar agora: vencidos primeiro, depois nunca vistos (até `newLimit`). */
export function dueQueue(cardIds, states, now = Date.now(), newLimit = 10) {
  const due = [];
  const fresh = [];
  for (const id of cardIds) {
    const s = states.get(id);
    if (!s) fresh.push(id);
    else if (s.due <= now) due.push([id, s.due]);
  }
  due.sort((a, b) => a[1] - b[1]);
  return [...due.map(d => d[0]), ...fresh.slice(0, newLimit)];
}

/** Probabilidade aproximada de lembrar (curva exponencial com estabilidade = intervalo). */
export function retrievability(state, now = Date.now()) {
  if (!state || state.last == null) return 0;
  const stability = Math.max(state.intervalDays, 0.5);
  const elapsed = Math.max(0, (now - state.last) / DAY);
  return Math.exp(Math.log(0.9) * elapsed / stability);
}
