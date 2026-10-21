// Cliente do Neon (Auth + Data API) via SDK oficial @neondatabase/neon-js,
// carregado sob demanda para não pesar na abertura do app.
// O navegador nunca recebe a string de conexão do banco: só o JWT do usuário,
// e as políticas RLS garantem que cada conta veja apenas suas linhas.

import { CONFIG } from '../config.js';

let clientPromise = null;

export function remoteEnabled() {
  return Boolean(CONFIG.neonAuthUrl && CONFIG.dataApiUrl);
}

export function client() {
  if (!remoteEnabled()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('../../vendor/neon-js-0.8.0-beta.mjs').then(({ createClient }) =>
      createClient({ auth: { url: CONFIG.neonAuthUrl }, dataApi: { url: CONFIG.dataApiUrl } }));
  }
  return clientPromise;
}

/** Usuário logado ({id, email, name}) ou null. Offline também devolve null. */
export async function currentUser() {
  const c = await client();
  if (!c || !navigator.onLine) return null;
  try {
    const { data } = await c.auth.getSession();
    const u = data && data.user;
    return u ? { id: u.id, email: u.email, name: u.name } : null;
  } catch (err) {
    console.warn('Sessão indisponível:', err);
    return null;
  }
}

export async function signInWithGoogle() {
  const c = await client();
  if (!c) throw new Error('Login não configurado (js/config.js).');
  const callbackURL = location.href.split('#')[0] + '#/perfis';
  await c.auth.signIn.social({ provider: 'google', callbackURL });
}

export async function signOut() {
  const c = await client();
  if (c) await c.auth.signOut();
}
