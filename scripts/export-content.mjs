#!/usr/bin/env node
// Gera data/content.json a partir do Neon.
//
//   DATABASE_URL=postgres://... node scripts/export-content.mjs            # exporta
//   DATABASE_URL=postgres://... node scripts/export-content.mjs --inspect  # lista tabelas/colunas
//
// Roda na sua máquina ou no CI, nunca no navegador: a string de conexão é
// secreta. O JSON gerado só contém conteúdo público (edital, questões de
// provas públicas, materiais) e vai para o GitHub Pages.

import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Defina DATABASE_URL.'); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') || url.includes('host=/') ? false : { rejectUnauthorized: true } });
await client.connect();

if (process.argv.includes('--inspect')) {
  const { rows } = await client.query(`
    select c.table_schema, c.table_name, c.column_name, c.data_type,
           (select reltuples::bigint from pg_class where oid = (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass) as approx_rows
    from information_schema.columns c
    where c.table_schema not in ('pg_catalog', 'information_schema', 'neon_auth', 'auth')
    order by 1, 2, c.ordinal_position`);
  let last = '';
  for (const r of rows) {
    const t = `${r.table_schema}.${r.table_name}`;
    if (t !== last) { console.log(`\n${t}  (~${r.approx_rows} linhas)`); last = t; }
    console.log(`  ${r.column_name}: ${r.data_type}`);
  }
  await client.end();
  process.exit(0);
}

async function view(name) {
  const exists = await client.query('select to_regclass($1) is not null as ok', [`public.${name}`]);
  if (!exists.rows[0].ok) { console.warn(`! ${name} não existe — exportado vazio`); return []; }
  return (await client.query(`select * from ${name}`)).rows;
}

const published = r => !r.status || r.status === 'published';
const examRows = await view('content_exam');
const exam = Object.fromEntries(examRows.map(r => [r.key, r.value]));

const bundle = {
  version: new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6),
  generatedAt: new Date().toISOString(),
  source: exam.source || null,
  exam: examRows.length ? { date: exam.date || null, areas: exam.areas || null, rules: exam.rules || null, schedule: exam.schedule || null, career: exam.career || null } : null,
  subjects: (await view('content_subjects')).map(r => ({ id: r.id, prova: r.prova, name: r.name, areas: r.areas, order: r.ord })),
  topics: (await view('content_topics')).map(r => ({
    id: r.id, subjectId: r.subject_id, parentId: r.parent_id, code: r.code, title: r.title, order: r.ord,
    pages: r.pages, fragmentIds: r.fragment_ids, effort: r.effort == null ? undefined : Number(r.effort),
  })),
  fragments: (await view('content_fragments')).map(r => ({ id: r.id, page: r.page, seq: r.seq, subjectId: r.subject_id, topicId: r.topic_id, title: r.title, text: r.text })),
  questions: (await view('content_questions')).filter(published).map(r => ({
    id: r.id, subjectId: r.subject_id, topicIds: r.topic_ids || [], stem: r.stem, options: r.options, answer: r.answer,
    explanation: r.explanation, provenance: r.provenance,
  })),
  flashcards: (await view('content_flashcards')).filter(published).map(r => ({ id: r.id, topicId: r.topic_id, subjectId: r.subject_id, front: r.front, back: r.back, provenance: r.provenance })),
  lessons: (await view('content_lessons')).filter(published).map(r => ({ id: r.id, topicId: r.topic_id, title: r.title, body: r.body, provenance: r.provenance })),
  mindmaps: (await view('content_mindmaps')).filter(published).map(r => ({ id: r.id, subjectId: r.subject_id, root: r.root })),
  incidence: (await view('content_incidence')).map(r => ({ topicId: r.topic_id, count: r.count, exams: r.exams, verified: r.verified })),
  discursive: (await view('content_discursive')).filter(published).map(r => ({
    id: r.id, title: r.title, prompt: r.prompt, minutes: r.minutes, criteria: r.criteria, modelAnswer: r.model_answer, areas: r.areas, provenance: r.provenance,
  })),
  changes: (await view('content_changes')).map(r => ({ date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date, title: r.title, impact: r.impact })),
};
await client.end();

// Verificações de integridade antes de publicar.
const problems = [];
const ids = new Set(bundle.subjects.map(s => s.id));
const topicIds = new Set(bundle.topics.map(t => t.id));
const fragIds = new Set(bundle.fragments.map(f => f.id));
for (const t of bundle.topics) {
  if (!ids.has(t.subjectId)) problems.push(`tópico ${t.id}: disciplina ${t.subjectId} inexistente`);
  for (const f of t.fragmentIds || []) if (!fragIds.has(f)) problems.push(`tópico ${t.id}: fragmento ${f} inexistente`);
}
for (const q of bundle.questions) {
  if (!ids.has(q.subjectId)) problems.push(`questão ${q.id}: disciplina inexistente`);
  if (!Array.isArray(q.options) || !q.options.some(o => o.key === q.answer)) problems.push(`questão ${q.id}: gabarito ${q.answer} não está nas alternativas`);
  if (!q.provenance) problems.push(`questão ${q.id}: sem proveniência`);
  for (const t of q.topicIds) if (!topicIds.has(t)) problems.push(`questão ${q.id}: tópico ${t} inexistente`);
}
for (const s of bundle.subjects) if (!s.areas || !s.areas.length) problems.push(`disciplina ${s.id}: sem áreas`);

const out = fileURLToPath(new URL('../data/content.json', import.meta.url));
writeFileSync(out, JSON.stringify(bundle));
console.log(`Gerado ${out}`);
console.log(Object.entries(bundle).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}: ${v.length}`).join(' · '));
if (problems.length) {
  console.warn(`\n${problems.length} problema(s) de integridade:`);
  problems.slice(0, 50).forEach(p => console.warn(' - ' + p));
  process.exitCode = 2;
}
