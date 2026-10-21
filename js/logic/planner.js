// Prioridades (Pareto) e plano adaptativo.
// Prioridade de um tópico = pontos em jogo × (1 − domínio) / esforço.
// "Pontos em jogo" usa as regras oficiais e a incidência histórica verificada
// quando existem; quando faltam, o tópico recebe parte igual dentro da
// disciplina e a justificativa diz que não há evidência histórica.

import { subjectPoints } from './scoring.js';
import { localDay } from './stats.js';

export const BLOCK_MIN = 25;

export function subjectsForArea(content, area) {
  return (content.subjects || []).filter(s => !s.areas || s.areas.includes(area));
}

export function topicsForArea(content, area) {
  const ids = new Set(subjectsForArea(content, area).map(s => s.id));
  // Seções (agrupadores) não entram: só os itens do edital.
  return (content.topics || []).filter(t => ids.has(t.subjectId) && !t.section);
}

/** Map topicId -> {share, count, basis} a partir de content.incidence (só verificada). */
export function incidenceShares(content, area) {
  const topics = topicsForArea(content, area);
  const bySubject = new Map();
  for (const t of topics) {
    if (!bySubject.has(t.subjectId)) bySubject.set(t.subjectId, []);
    bySubject.get(t.subjectId).push(t);
  }
  const counts = new Map();
  for (const row of content.incidence || []) {
    if (row.verified === false) continue;
    counts.set(row.topicId, (counts.get(row.topicId) || 0) + (row.count || 0));
  }
  const out = new Map();
  for (const [, list] of bySubject) {
    const total = list.reduce((s, t) => s + (counts.get(t.id) || 0), 0);
    for (const t of list) {
      if (total > 0) out.set(t.id, { share: (counts.get(t.id) || 0) / total, count: counts.get(t.id) || 0, basis: 'historica' });
      else out.set(t.id, { share: 1 / list.length, count: null, basis: 'uniforme' });
    }
  }
  return out;
}

/**
 * Lista de tópicos ordenada por prioridade.
 * mastery: Map topicId -> {mastery, n} (de stats.masteryBy).
 */
export function prioritize(content, area, mastery) {
  const rules = content.exam && content.exam.rules;
  const shares = incidenceShares(content, area);
  const subjects = new Map(subjectsForArea(content, area).map(s => [s.id, s]));
  const rows = [];
  for (const t of topicsForArea(content, area)) {
    const sp = subjectPoints(rules, area, t.subjectId);
    const inc = shares.get(t.id);
    const points = (sp ?? 1) * inc.share;
    const m = mastery.get(t.id);
    const dom = m ? m.mastery : 0.5; // sem dados: incerteza máxima
    const effort = t.effort || 1;
    const value = points * (1 - dom) / effort;
    rows.push({
      topic: t,
      subject: subjects.get(t.subjectId),
      points, subjectPointsKnown: sp != null, incidence: inc, mastery: m || null, effort, value,
    });
  }
  rows.sort((a, b) => b.value - a.value || a.topic.id.localeCompare(b.topic.id));
  return rows;
}

/** Percentual acumulado do valor (curva de Pareto). */
export function paretoCurve(rows) {
  const total = rows.reduce((s, r) => s + r.points, 0) || 1;
  let acc = 0;
  return [...rows].sort((a, b) => b.points - a.points).map(r => { acc += r.points; return { ...r, cumulative: acc / total }; });
}

export function explain(row) {
  const parts = [];
  parts.push(row.subjectPointsKnown ? 'peso oficial da disciplina' : 'sem regras de pontuação carregadas');
  parts.push(row.incidence.basis === 'historica'
    ? `incidência histórica: ${row.incidence.count} questão(ões)`
    : 'sem evidência histórica (divisão igual)');
  parts.push(row.mastery && row.mastery.n ? `domínio ${Math.round(row.mastery.mastery * 100)}% em ${row.mastery.n} resp.` : 'domínio ainda não avaliado');
  return parts.join(' · ');
}

export function daysUntil(examDate, now = new Date()) {
  if (!examDate) return null;
  const [y, m, d] = examDate.split('-').map(Number);
  const exam = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam - today) / 86400000);
}

/**
 * Plano do dia.
 * opts: {minutesPerDay, dueCards, wrongToReview, rows (prioritize), now}
 */
export function todayPlan({ minutesPerDay = 120, dueCards = 0, wrongToReview = 0, rows = [] }) {
  const tasks = [];
  let left = minutesPerDay;
  if (dueCards > 0) {
    const min = Math.min(left, Math.max(5, Math.ceil(dueCards * 0.5)));
    tasks.push({ kind: 'flashcards', minutes: min, count: dueCards, reason: 'Revisões vencidas: revisar antes de esquecer custa menos que reaprender.' });
    left -= min;
  }
  if (wrongToReview > 0 && left > 0) {
    const min = Math.min(left, Math.max(10, wrongToReview * 2));
    tasks.push({ kind: 'erros', minutes: min, count: wrongToReview, reason: 'Questões erradas ainda não acertadas depois.' });
    left -= min;
  }
  for (const r of rows) {
    if (left < 10) break;
    const min = Math.min(left, BLOCK_MIN);
    tasks.push({ kind: 'topico', minutes: min, topicId: r.topic.id, subjectId: r.topic.subjectId, title: r.topic.title, reason: explain(r) });
    left -= min;
  }
  return tasks;
}

/**
 * Distribui blocos de estudo até a prova, proporcional ao valor de cada tópico
 * (método do maior resto, determinístico). studyWeekdays: [0..6] (0 = domingo).
 */
export function schedule({ rows, examDate, minutesPerDay = 120, studyWeekdays = [0, 1, 2, 3, 4, 5, 6], now = new Date(), maxDays = 400 }) {
  const n = daysUntil(examDate, now);
  if (n == null || n <= 0 || !rows.length) return [];
  const days = [];
  for (let i = 0; i < Math.min(n, maxDays); i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (studyWeekdays.includes(d.getDay())) days.push(d);
  }
  const perDay = Math.max(1, Math.floor(minutesPerDay / BLOCK_MIN));
  const totalBlocks = days.length * perDay;
  const totalValue = rows.reduce((s, r) => s + Math.max(r.value, 1e-6), 0);
  const quotas = rows.map(r => {
    const exact = totalBlocks * Math.max(r.value, 1e-6) / totalValue;
    return { r, n: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let rest = totalBlocks - quotas.reduce((s, q) => s + q.n, 0);
  [...quotas].sort((a, b) => b.rem - a.rem).forEach(q => { if (rest > 0) { q.n++; rest--; } });
  // Intercala: a cada passo escolhe o tópico com maior saldo restante relativo.
  const remaining = quotas.filter(q => q.n > 0).map(q => ({ ...q, left: q.n }));
  const out = [];
  for (const d of days) {
    const blocks = [];
    for (let b = 0; b < perDay; b++) {
      remaining.sort((a, c) => c.left / c.n - a.left / a.n || c.n - a.n);
      const pick = remaining.find(q => q.left > 0 && !blocks.some(x => x.topicId === q.r.topic.id));
      if (!pick) break;
      pick.left--;
      blocks.push({ topicId: pick.r.topic.id, title: pick.r.topic.title, subjectId: pick.r.topic.subjectId });
    }
    out.push({ day: localDay(d), blocks });
  }
  return out;
}

/** Estimativa de pontos atual: Σ pontos da disciplina × domínio da disciplina. */
export function estimateScore(content, area, subjectMastery) {
  const rules = content.exam && content.exam.rules;
  let total = 0, max = 0, known = false;
  for (const s of subjectsForArea(content, area)) {
    const sp = subjectPoints(rules, area, s.id);
    if (sp == null) continue;
    known = true;
    const m = subjectMastery.get(s.id);
    max += sp;
    total += sp * (m ? m.mastery : 0);
  }
  return known ? { total, max } : null;
}
