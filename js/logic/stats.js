// Indicadores de desempenho calculados sobre o histórico de respostas.
// Respostas: {id, question_id, topic_ids[], subject_id, correct, answered_at, source}

const DAY = 86400000;
export const HALF_LIFE_DAYS = 30;

/** Remove duplicatas pelo id (o mesmo evento pode chegar de dois caminhos). */
export function dedupe(rows) {
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}

export function accuracy(answers) {
  if (!answers.length) return null;
  return answers.filter(a => a.correct).length / answers.length;
}

/** Dias seguidos com pelo menos uma atividade, terminando hoje ou ontem. */
export function streak(dates, now = new Date()) {
  const days = new Set(dates.map(d => localDay(new Date(d))));
  let cursor = localDay(now);
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1);
  let n = 0;
  while (days.has(cursor)) { n++; cursor = shiftDay(cursor, -1); }
  return n;
}

export function localDay(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

/**
 * Domínio por chave (tópico ou disciplina): média de acertos com peso que decai
 * pela idade (meia-vida de 30 dias) e prior Beta(1,1).
 * Retorna Map chave -> {mastery, n, effective, correct, total, last}.
 */
export function masteryBy(answers, keyFn, now = Date.now()) {
  const acc = new Map();
  for (const a of answers) {
    const keys = keyFn(a);
    const age = Math.max(0, (now - Date.parse(a.answered_at)) / DAY);
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS);
    for (const k of keys) {
      if (k == null) continue;
      const e = acc.get(k) || { wc: 0, w: 0, correct: 0, total: 0, last: 0 };
      e.wc += w * (a.correct ? 1 : 0);
      e.w += w;
      e.total += 1;
      if (a.correct) e.correct += 1;
      e.last = Math.max(e.last, Date.parse(a.answered_at));
      acc.set(k, e);
    }
  }
  const out = new Map();
  for (const [k, e] of acc) {
    out.set(k, { mastery: (e.wc + 1) / (e.w + 2), n: e.total, effective: e.w, correct: e.correct, total: e.total, last: e.last });
  }
  return out;
}

export const byTopic = a => a.topic_ids || [];
export const bySubject = a => [a.subject_id];

export function masteryLabel(m) {
  if (!m || m.n === 0) return 'Ainda não avaliado';
  if (m.n < 5) return 'Poucos dados';
  if (m.mastery >= 0.8) return 'Domina';
  if (m.mastery >= 0.6) return 'Em consolidação';
  return 'Precisa reforçar';
}

/** Acertos por dia (últimos `days` dias) para o gráfico de evolução. */
export function dailySeries(answers, days = 30, now = new Date()) {
  const map = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    map.set(localDay(d), { day: localDay(d), total: 0, correct: 0 });
  }
  for (const a of answers) {
    const e = map.get(localDay(new Date(a.answered_at)));
    if (e) { e.total++; if (a.correct) e.correct++; }
  }
  return [...map.values()];
}

/** Tópicos em que mais erra (mínimo de `minN` respostas). */
export function weakest(masteryMap, minN = 3, limit = 5) {
  return [...masteryMap.entries()]
    .filter(([, m]) => m.n >= minN)
    .sort((a, b) => a[1].mastery - b[1].mastery)
    .slice(0, limit);
}
