import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replay, dueQueue, GRADES, applyReview, initialState } from '../../js/logic/srs.js';
import { masteryBy, byTopic, streak, dedupe, accuracy, weakest, localDay } from '../../js/logic/stats.js';
import { prioritize, incidenceShares, todayPlan, schedule, daysUntil, estimateScore } from '../../js/logic/planner.js';
import { scoreAttempt, subjectPoints } from '../../js/logic/scoring.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/content.json', import.meta.url)));
const T0 = Date.parse('2026-10-01T12:00:00Z');
const DAY = 86400000;

test('SRS: intervalos crescem com acertos e voltam no erro', () => {
  let s = applyReview(initialState(), GRADES.good, T0);
  assert.equal(s.intervalDays, 1);
  s = applyReview(s, GRADES.good, T0 + DAY);
  assert.equal(s.intervalDays, 6);
  s = applyReview(s, GRADES.good, T0 + 7 * DAY);
  assert.ok(s.intervalDays >= 15);
  s = applyReview(s, GRADES.again, T0 + 30 * DAY);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.equal(s.due, T0 + 30 * DAY + 10 * 60000);
});

test('SRS: replay é independente da ordem de chegada dos eventos (convergência entre aparelhos)', () => {
  const evs = [
    { id: 'b', card_id: 'c1', grade: 2, reviewed_at: '2026-10-02T10:00:00Z' },
    { id: 'a', card_id: 'c1', grade: 2, reviewed_at: '2026-10-01T10:00:00Z' },
    { id: 'c', card_id: 'c1', grade: 0, reviewed_at: '2026-10-09T10:00:00Z' },
  ];
  const s1 = replay(evs).get('c1');
  const s2 = replay([...evs].reverse()).get('c1');
  assert.deepEqual(s1, s2);
  assert.equal(s1.lapses, 1);
});

test('SRS: fila põe vencidos antes dos novos e limita novos', () => {
  const states = replay([{ id: '1', card_id: 'old', grade: 2, reviewed_at: new Date(T0 - 5 * DAY).toISOString() }]);
  const q = dueQueue(['n1', 'old', 'n2', 'n3'], states, T0, 2);
  assert.deepEqual(q, ['old', 'n1', 'n2']);
});

test('dedupe remove eventos repetidos pelo id', () => {
  assert.equal(dedupe([{ id: 1 }, { id: 1 }, { id: 2 }]).length, 2);
});

test('domínio: prior Beta(1,1) e decaimento pela idade', () => {
  const now = T0;
  const recent = [{ id: 1, topic_ids: ['t'], correct: true, answered_at: new Date(now).toISOString() }];
  const old = [{ id: 1, topic_ids: ['t'], correct: true, answered_at: new Date(now - 60 * DAY).toISOString() }];
  const mr = masteryBy(recent, byTopic, now).get('t');
  const mo = masteryBy(old, byTopic, now).get('t');
  assert.ok(Math.abs(mr.mastery - 2 / 3) < 1e-9);
  assert.ok(mo.mastery < mr.mastery && mo.mastery > 0.5);
  assert.equal(accuracy([]), null);
});

test('sequência de dias conta até ontem se hoje ainda não estudou', () => {
  const now = new Date(2026, 9, 10, 9);
  const d = n => new Date(2026, 9, 10 - n, 20).toISOString();
  assert.equal(streak([d(1), d(2), d(3)], now), 3);
  assert.equal(streak([d(0), d(1), d(3)], now), 2);
  assert.equal(streak([d(2)], now), 0);
});

test('weakest exige mínimo de respostas', () => {
  const m = new Map([['a', { mastery: 0.2, n: 2 }], ['b', { mastery: 0.4, n: 5 }], ['c', { mastery: 0.9, n: 5 }]]);
  assert.deepEqual(weakest(m, 3).map(x => x[0]), ['b', 'c']);
});

test('pontuação usa regras oficiais por área e respeita pesos', () => {
  const rules = fixture.exam.rules;
  assert.equal(subjectPoints(rules, 'C03', 's-ti-1'), 8);
  assert.equal(subjectPoints(rules, 'A01', 's-ti-1'), null);
  const s = scoreAttempt(rules, 'C03', [
    { subject_id: 's-comum-1', correct: true },
    { subject_id: 's-ti-1', correct: true },
    { subject_id: 's-ti-1', correct: false },
    { subject_id: 's-orc-1', correct: true }, // não é da área C03: ignorada
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.max, 12);
  assert.equal(s.habilitacao[0].ok, false);
  assert.equal(scoreAttempt(null, 'C03', []), null);
});

test('incidência: só verificada, com divisão igual quando falta', () => {
  const sh = incidenceShares(fixture, 'C03');
  assert.equal(sh.get('s-comum-1-t1').basis, 'historica');
  assert.ok(Math.abs(sh.get('s-comum-1-t1').share - 5 / 6) < 1e-9);
  assert.equal(sh.get('s-comum-1-t3').share, 0);
  assert.equal(sh.get('s-ti-1-t1').basis, 'uniforme');
  const unverified = { ...fixture, incidence: fixture.incidence.map(i => ({ ...i, verified: false })) };
  assert.equal(incidenceShares(unverified, 'C03').get('s-comum-1-t1').basis, 'uniforme');
});

test('prioridade filtra pela área e cai quando o domínio sobe', () => {
  const rows = prioritize(fixture, 'C03', new Map());
  assert.ok(rows.every(r => r.topic.subjectId !== 's-orc-1'));
  const top = rows[0].topic.id;
  const mastered = new Map([[top, { mastery: 0.95, n: 20 }]]);
  const rows2 = prioritize(fixture, 'C03', mastered);
  assert.notEqual(rows2[0].topic.id, top);
});

test('plano do dia: revisões primeiro e respeita o tempo disponível', () => {
  const rows = prioritize(fixture, 'C03', new Map());
  const tasks = todayPlan({ minutesPerDay: 60, dueCards: 20, wrongToReview: 3, rows });
  assert.equal(tasks[0].kind, 'flashcards');
  assert.equal(tasks[1].kind, 'erros');
  assert.ok(tasks.reduce((s, t) => s + t.minutes, 0) <= 60);
});

test('cronograma vai até a véspera da prova e só em dias de estudo', () => {
  const rows = prioritize(fixture, 'C03', new Map());
  const now = new Date(2026, 11, 1);
  const cal = schedule({ rows, examDate: '2026-12-13', minutesPerDay: 50, studyWeekdays: [1, 3, 5], now });
  assert.equal(daysUntil('2026-12-13', now), 12);
  assert.ok(cal.every(d => [1, 3, 5].includes(new Date(d.day + 'T12:00:00').getDay())));
  assert.ok(cal.every(d => d.day < '2026-12-13'));
  assert.ok(cal.every(d => d.blocks.length <= 2 && new Set(d.blocks.map(b => b.topicId)).size === d.blocks.length));
  assert.equal(localDay(now), '2026-12-01');
});

test('estimativa de pontos só existe com regras', () => {
  assert.equal(estimateScore({ ...fixture, exam: null }, 'C03', new Map()), null);
  const e = estimateScore(fixture, 'C03', new Map([['s-ti-1', { mastery: 0.5 }]]));
  assert.deepEqual(e, { total: 4, max: 12 });
});
