// Pacote de conteúdo (edital, tópicos, questões, flashcards...).
// Gerado a partir do Neon por scripts/export-content.mjs e servido como JSON
// estático; o Service Worker o mantém em cache para uso offline.

import { CONFIG } from '../config.js';
import { normalize } from '../lib/util.js';

export const EMPTY = {
  version: null, generatedAt: null, source: null, exam: null,
  subjects: [], topics: [], fragments: [], questions: [], flashcards: [],
  mindmaps: [], lessons: [], incidence: [], discursive: [], changes: [],
};

let current = EMPTY;
let indexes = null;

export async function loadContent(url = CONFIG.contentUrl) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    current = { ...EMPTY, ...(await res.json()) };
  } catch (err) {
    console.warn('Conteúdo não carregado:', err);
    current = EMPTY;
  }
  indexes = null;
  return current;
}

export function setContent(c) { current = { ...EMPTY, ...c }; indexes = null; }
export function content() { return current; }
export function hasContent() { return current.topics.length > 0 || current.fragments.length > 0; }

function idx() {
  if (indexes) return indexes;
  const map = (arr) => new Map(arr.map(x => [x.id, x]));
  indexes = {
    subjects: map(current.subjects),
    topics: map(current.topics),
    questions: map(current.questions.filter(isPublished)),
    flashcards: map(current.flashcards.filter(isPublished)),
    fragments: map(current.fragments),
  };
  return indexes;
}

export function isPublished(item) { return !item.status || item.status === 'published'; }

export const subject = id => idx().subjects.get(id);
export const topic = id => idx().topics.get(id);
export const question = id => idx().questions.get(id);
export const flashcard = id => idx().flashcards.get(id);
export const fragment = id => idx().fragments.get(id);

export function subjectsFor(area, prova) {
  return current.subjects
    .filter(s => !s.areas || s.areas.includes(area))
    .filter(s => !prova || s.prova === prova)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function topicsOf(subjectId) {
  return current.topics.filter(t => t.subjectId === subjectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function questionsFor({ area, subjectId, topicId } = {}) {
  const allowed = area ? new Set(subjectsFor(area).map(s => s.id)) : null;
  return [...idx().questions.values()].filter(q =>
    (!allowed || allowed.has(q.subjectId)) &&
    (!subjectId || q.subjectId === subjectId) &&
    (!topicId || (q.topicIds || []).includes(topicId)));
}

export function flashcardsFor({ area, subjectId } = {}) {
  const allowed = area ? new Set(subjectsFor(area).map(s => s.id)) : null;
  return [...idx().flashcards.values()].filter(f => {
    const sid = f.subjectId || topic(f.topicId)?.subjectId;
    return (!allowed || allowed.has(sid)) && (!subjectId || sid === subjectId);
  });
}

export function lessonsFor(topicId) {
  return current.lessons.filter(l => l.topicId === topicId && isPublished(l));
}

export function fragmentsFor({ area, query } = {}) {
  const allowed = area ? new Set(subjectsFor(area).map(s => s.id)) : null;
  const q = normalize(query);
  return current.fragments
    .filter(f => !allowed || !f.subjectId || allowed.has(f.subjectId))
    .filter(f => !q || normalize(f.text).includes(q))
    .sort((a, b) => (a.page - b.page) || (a.seq - b.seq));
}

/** Mapa mental: usa o mapa publicado; senão deriva da hierarquia do edital. */
export function mindmapFor(subjectId) {
  const m = current.mindmaps.find(x => x.subjectId === subjectId && isPublished(x));
  if (m) return { root: m.root, derived: false };
  const s = subject(subjectId);
  if (!s) return null;
  const tops = topicsOf(subjectId);
  const build = parentId => tops.filter(t => (t.parentId || null) === parentId)
    .map(t => ({ label: t.code ? `${t.code} ${t.title}` : t.title, topicId: t.id, children: build(t.id) }));
  return { root: { label: s.name, children: build(null) }, derived: true };
}
