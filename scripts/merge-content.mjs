#!/usr/bin/env node
// Junta o conteúdo extraído do edital (data/edital-2026.json, gerado por
// scripts/build_edital.py) ao pacote data/content.json, preservando o que já
// existe lá e não vem do edital (questões, flashcards, aulas, incidência...).
//
//   node scripts/merge-content.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const edital = JSON.parse(readFileSync(new URL('data/edital-2026.json', root)));
const current = JSON.parse(readFileSync(new URL('data/content.json', root)));

const merged = {
  ...current,
  source: edital.source,
  exam: edital.exam,
  subjects: edital.subjects,
  topics: edital.topics,
  fragments: edital.fragments,
};
delete merged.note;
for (const k of ['questions', 'flashcards', 'mindmaps', 'lessons', 'incidence', 'discursive', 'changes']) merged[k] = merged[k] || [];

const body = JSON.stringify({ ...merged, version: null, generatedAt: null });
merged.version = createHash('sha256').update(body).digest('hex').slice(0, 12);
merged.generatedAt = new Date().toISOString();
writeFileSync(new URL('data/content.json', root), JSON.stringify(merged));
console.log(`data/content.json versão ${merged.version}: ${merged.subjects.length} disciplinas, ${merged.topics.length} tópicos, ${merged.fragments.length} trechos`);
