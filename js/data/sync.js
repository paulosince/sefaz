// Sincronização entre o IndexedDB e o Neon.
//
// Envio: a fila (outbox) é enviada em lotes. Respostas, revisões e simulados
// são eventos imutáveis com id gerado no aparelho; o servidor ignora ids
// repetidos (ON CONFLICT DO NOTHING), então reenviar após uma falha é seguro.
// Preferências (kv) usam "última gravação vence" por updated_at, com o
// desempate feito por um gatilho no banco (db/001_user_data.sql).
//
// Recebimento: busca linhas com synced_at > cursor (relógio do servidor) e
// une localmente pelo id.

import * as store from './store.js';
import { client, currentUser, remoteEnabled } from './remote.js';
import * as idb from '../lib/idb.js';

const TABLES = {
  answers: ['id', 'question_id', 'chosen', 'correct', 'topic_ids', 'subject_id', 'source', 'session_id', 'answered_at', 'elapsed_ms'],
  reviews: ['id', 'card_id', 'grade', 'reviewed_at'],
  simulados: ['id', 'kind', 'config', 'started_at', 'finished_at', 'items', 'score'],
};
// Nome local (IndexedDB) -> tabela no Neon.
const REMOTE = { answers: 'user_answers', reviews: 'user_reviews', simulados: 'user_simulados', kv: 'user_kv' };
const BATCH = 200;
const PAGE = 1000;
const OVERLAP_MS = 5 * 60000;

let running = null;
const listeners = new Set();
export function onSyncState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(s) { listeners.forEach(fn => fn(s)); }

function pick(row, cols) {
  const o = {};
  for (const c of cols) if (row[c] !== undefined) o[c] = row[c];
  return o;
}

async function cursorKey(profileId, table) { return `cursor:${profileId}:${table}`; }

async function getCursor(profileId, table) {
  return (await idb.get('meta', await cursorKey(profileId, table)))?.value || '1970-01-01T00:00:00Z';
}

async function setCursor(profileId, table, value) {
  await idb.put('meta', { key: await cursorKey(profileId, table), value });
}

/** Sincroniza o perfil se ele estiver ligado à conta logada. */
export function syncProfile(profile) {
  if (running) return running;
  running = (async () => {
    if (!remoteEnabled() || !profile || !profile.userId) return { skipped: 'local' };
    if (!navigator.onLine) return { skipped: 'offline' };
    const user = await currentUser();
    if (!user) return { skipped: 'sem-sessao' };
    if (user.id !== profile.userId) return { skipped: 'outra-conta' };
    emit({ state: 'syncing' });
    const c = await client();
    const pushed = await push(c, profile.id);
    const pulled = await pull(c, profile.id);
    await idb.put('meta', { key: `lastSync:${profile.id}`, value: new Date().toISOString() });
    emit({ state: 'idle', pushed, pulled });
    return { pushed, pulled };
  })().catch(err => {
    console.warn('Falha na sincronização:', err);
    emit({ state: 'error', error: String(err.message || err) });
    return { error: String(err.message || err) };
  }).finally(() => { running = null; });
  return running;
}

async function push(c, profileId) {
  const queue = await store.pendingOutbox(profileId);
  let sent = 0;
  for (const table of [...Object.keys(TABLES), 'kv']) {
    const entries = queue.filter(e => e.table === table);
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const rows = [];
      const seen = new Set();
      for (const e of chunk) {
        if (seen.has(e.rowId)) continue;
        seen.add(e.rowId);
        const r = await store.getRow(table, profileId, e.rowId);
        if (!r) continue;
        rows.push(table === 'kv' ? { key: r.key, value: r.value, updated_at: r.updated_at } : pick(r, TABLES[table]));
      }
      if (rows.length) {
        const q = c.from(REMOTE[table]).upsert(rows, table === 'kv'
          ? { onConflict: 'user_id,key' }
          : { onConflict: 'user_id,id', ignoreDuplicates: true });
        const { error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      await store.clearOutbox(chunk.map(e => e.seq));
      sent += rows.length;
    }
  }
  return sent;
}

async function pull(c, profileId) {
  let received = 0;
  for (const table of [...Object.keys(TABLES), 'kv']) {
    // Recua 5 minutos: uma transação que começou antes do último cursor pode
    // ter confirmado depois dele. Repetições são descartadas pelo id.
    let cursor = new Date(Date.parse(await getCursor(profileId, table)) - OVERLAP_MS).toISOString();
    for (;;) {
      const cols = table === 'kv' ? 'key,value,updated_at,synced_at' : [...TABLES[table], 'synced_at'].join(',');
      const { data, error } = await c.from(REMOTE[table]).select(cols).gte('synced_at', cursor).order('synced_at').limit(PAGE);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data.length) break;
      const rows = data.map(({ synced_at, ...r }) => r);
      received += table === 'kv' ? await store.mergeRemoteKV(profileId, rows) : await store.mergeRemote(table, profileId, rows);
      const next = data[data.length - 1].synced_at;
      await setCursor(profileId, table, next);
      if (data.length < PAGE || next === cursor) break;
      cursor = next;
    }
  }
  return received;
}

export async function lastSync(profileId) {
  return (await idb.get('meta', `lastSync:${profileId}`))?.value || null;
}
