// Dados pessoais de aprendizagem, isolados por perfil.
// Toda gravação vai para o IndexedDB e, na mesma transação, para a fila de
// sincronização (outbox). Assim uma resposta nunca se perde por falta de rede.

import * as idb from '../lib/idb.js';
import { uuid } from '../lib/util.js';
import { DEFAULT_PROFILES } from '../config.js';

const EVENT_STORES = ['answers', 'reviews', 'simulados'];

// ---------- perfis ----------

export async function listProfiles() {
  return (await idb.all('profiles')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createProfile({ name, area }) {
  const p = { id: uuid(), name, area, userId: null, createdAt: new Date().toISOString() };
  await idb.put('profiles', p);
  return p;
}

export async function updateProfile(p) { await idb.put('profiles', p); return p; }

export async function ensureDefaultProfiles() {
  const existing = await listProfiles();
  if (existing.length) return existing;
  for (const d of DEFAULT_PROFILES) await createProfile(d);
  return listProfiles();
}

export async function getActiveProfileId() { return (await idb.get('meta', 'activeProfile'))?.value || null; }
export async function setActiveProfileId(id) { await idb.put('meta', { key: 'activeProfile', value: id }); }

/** Apaga um perfil e todos os seus dados locais. */
export async function deleteProfile(profileId) {
  const stores = ['profiles', ...EVENT_STORES, 'kv', 'outbox'];
  const keys = {};
  for (const s of [...EVENT_STORES, 'kv', 'outbox']) {
    const rows = await idb.byIndex(s, 'profileId', profileId);
    keys[s] = rows.map(r => s === 'kv' ? [r.profileId, r.key] : s === 'outbox' ? r.seq : [r.profileId, r.id]);
  }
  await idb.write(stores, tx => {
    tx.objectStore('profiles').delete(profileId);
    for (const [s, ks] of Object.entries(keys)) ks.forEach(k => tx.objectStore(s).delete(k));
  });
}

// ---------- eventos (respostas, revisões, simulados) ----------

async function addEvent(store, profileId, row) {
  const full = { ...row, id: row.id || uuid(), profileId };
  await idb.write([store, 'outbox'], tx => {
    tx.objectStore(store).put(full);
    tx.objectStore('outbox').add({ profileId, table: store, rowId: full.id });
  });
  return full;
}

export function addAnswer(profileId, a) {
  return addEvent('answers', profileId, { answered_at: new Date().toISOString(), ...a });
}

export function addReview(profileId, r) {
  return addEvent('reviews', profileId, { reviewed_at: new Date().toISOString(), ...r });
}

export function saveSimulado(profileId, s) { return addEvent('simulados', profileId, s); }

export const listAnswers = profileId => idb.byIndex('answers', 'profileId', profileId);
export const listReviews = profileId => idb.byIndex('reviews', 'profileId', profileId);
export async function listSimulados(profileId) {
  return (await idb.byIndex('simulados', 'profileId', profileId)).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Grava eventos vindos do servidor sem gerar nova entrada no outbox. Ignora ids já existentes. */
export async function mergeRemote(store, profileId, rows) {
  const existing = new Set((await idb.byIndex(store, 'profileId', profileId)).map(r => r.id));
  const fresh = rows.filter(r => !existing.has(r.id));
  if (!fresh.length) return 0;
  await idb.write([store], tx => fresh.forEach(r => tx.objectStore(store).put({ ...r, profileId })));
  return fresh.length;
}

// ---------- chave-valor (preferências, retomada, plano) ----------
// Última gravação vence, comparando updated_at.

export async function getKV(profileId, key, fallback = null) {
  const r = await idb.get('kv', [profileId, key]);
  return r ? r.value : fallback;
}

export async function setKV(profileId, key, value) {
  const row = { profileId, key, value, updated_at: new Date().toISOString() };
  await idb.write(['kv', 'outbox'], tx => {
    tx.objectStore('kv').put(row);
    tx.objectStore('outbox').add({ profileId, table: 'kv', rowId: key });
  });
}

export async function mergeRemoteKV(profileId, rows) {
  let n = 0;
  for (const r of rows) {
    const local = await idb.get('kv', [profileId, r.key]);
    if (!local || local.updated_at < r.updated_at) {
      await idb.put('kv', { profileId, key: r.key, value: r.value, updated_at: r.updated_at });
      n++;
    }
  }
  return n;
}

export const listKV = profileId => idb.byIndex('kv', 'profileId', profileId);

// ---------- outbox ----------

export const pendingOutbox = profileId => idb.byIndex('outbox', 'profileId', profileId);

export async function getRow(table, profileId, rowId) {
  return idb.get(table, [profileId, rowId]);
}

export async function clearOutbox(seqs) {
  await idb.write(['outbox'], tx => seqs.forEach(s => tx.objectStore('outbox').delete(s)));
}

// ---------- backup ----------

export async function exportBackup(profileId) {
  const profile = await idb.get('profiles', profileId);
  return {
    format: 'rumo-sefaz-backup', version: 1, exportedAt: new Date().toISOString(),
    profile: { name: profile.name, area: profile.area },
    answers: await listAnswers(profileId),
    reviews: await listReviews(profileId),
    simulados: await listSimulados(profileId),
    kv: await listKV(profileId),
  };
}

/**
 * Importa um backup para o perfil. Eventos são unidos pelo id (sem duplicar);
 * itens novos entram no outbox para subir ao servidor.
 */
export async function importBackup(profileId, data) {
  if (!data || data.format !== 'rumo-sefaz-backup') throw new Error('Arquivo não é um backup do Rumo à SEFAZ.');
  const counts = {};
  for (const store of EVENT_STORES) {
    const existing = new Set((await listByStore(store, profileId)).map(r => r.id));
    const fresh = (data[store] || []).filter(r => r && r.id && !existing.has(r.id));
    await idb.write([store, 'outbox'], tx => fresh.forEach(r => {
      tx.objectStore(store).put({ ...r, profileId });
      tx.objectStore('outbox').add({ profileId, table: store, rowId: r.id });
    }));
    counts[store] = fresh.length;
  }
  counts.kv = await mergeRemoteKV(profileId, data.kv || []);
  return counts;
}

const listByStore = (store, profileId) => idb.byIndex(store, 'profileId', profileId);
