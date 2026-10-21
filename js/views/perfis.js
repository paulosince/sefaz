import { html } from '../lib/util.js';
import { AREAS } from '../config.js';
import * as store from '../data/store.js';
import { remoteEnabled, currentUser, signInWithGoogle, signOut, client } from '../data/remote.js';
import { syncProfile, lastSync } from '../data/sync.js';

export async function perfis(ctx, route, root, alive) {
  const profiles = await store.listProfiles();
  const active = ctx.profile;
  const remote = remoteEnabled();
  const user = remote ? await currentUser() : null;
  const synced = active ? await lastSync(active.id) : null;
  const pending = active ? (await store.pendingOutbox(active.id)).length : 0;
  if (!alive()) return;

  // Volta do login Google: liga o perfil ativo à conta, se ainda não estiver ligado.
  let bindMsg = '';
  if (user && active && !active.userId) {
    const other = profiles.find(p => p.userId === user.id);
    if (other) bindMsg = `Esta conta Google já está ligada ao perfil ${other.name}. Selecione-o para sincronizar.`;
    else {
      active.userId = user.id;
      active.email = user.email;
      await store.updateProfile(active);
      await ctx.reloadProfiles();
      const c = await client();
      await c.from('user_profiles').upsert({ display_name: active.name, area: active.area }, { onConflict: 'user_id' });
      syncProfile(active).then(() => { ctx.invalidate(); });
      bindMsg = `Perfil ${active.name} ligado à conta ${user.email}.`;
    }
  }

  root.innerHTML = html`
    <h1>${active ? 'Perfil, conta e dados' : 'Quem vai estudar?'}</h1>
    <p class="lead">Cada perfil tem histórico, flashcards, simulados e plano próprios. O conteúdo é compartilhado; os dados de aprendizagem não.</p>
    ${bindMsg ? html`<div class="notice" role="status">${bindMsg}</div>` : ''}

    <div class="grid two" style="margin-top:12px">
      ${profiles.map(p => html`
        <div class="card">
          <div class="spread"><strong>${p.name} · ${p.area}</strong>${active && p.id === active.id ? html`<span class="tag">ativo</span>` : ''}</div>
          <p class="muted small">${AREAS[p.area]?.name}<br>${p.userId ? `Conta: ${p.email || 'Google'}` : 'Somente neste aparelho'}</p>
          ${active && p.id === active.id ? '' : html`<button class="btn" data-pick="${p.id}">Entrar como ${p.name}</button>`}
        </div>`)}
    </div>

    <details class="card" style="margin-top:12px">
      <summary><strong>Criar outro perfil</strong></summary>
      <form id="newProfile" class="stack" style="margin-top:12px">
        <div><label class="field" for="pname">Nome</label><input id="pname" type="text" required maxlength="40"></div>
        <div><label class="field" for="parea">Área</label>
          <select id="parea">${Object.values(AREAS).map(a => html`<option value="${a.code}">${a.code} — ${a.name}</option>`)}</select></div>
        <button class="btn" type="submit">Criar perfil</button>
      </form>
    </details>

    ${active ? html`
      <h2>Conta e sincronização</h2>
      <div class="card stack">
        ${!remote ? html`<p class="muted" style="margin:0">Login e sincronização ainda não estão configurados neste app
            (falta preencher <code>js/config.js</code> com as URLs do Neon Auth e da Data API). Os dados ficam só neste aparelho; use o backup abaixo.</p>`
          : user ? html`<p style="margin:0">Conectado como <strong>${user.email}</strong>.</p>
              <p class="muted small" style="margin:0">Última sincronização: ${synced ? new Date(synced).toLocaleString('pt-BR') : 'nunca'} · ${pending} alteração(ões) pendente(s)</p>
              <div class="row"><button class="btn" id="syncNow">Sincronizar agora</button><button class="btn ghost" id="logout">Sair da conta</button></div>`
            : html`<p style="margin:0">Entre com Google para guardar o progresso de <strong>${active.name}</strong> na nuvem e continuar em outro aparelho.</p>
              ${!navigator.onLine ? html`<p class="muted small">Sem conexão agora. O login precisa de internet; o estudo não.</p>` : ''}
              <div><button class="btn" id="login" ${navigator.onLine ? '' : 'disabled'}>Entrar com Google</button></div>
              ${pending ? html`<p class="muted small" style="margin:0">${pending} alteração(ões) aguardando para subir.</p>` : ''}`}
      </div>

      <h2>Backup</h2>
      <div class="card stack">
        <p class="muted" style="margin:0">Exporta respostas, revisões, simulados e preferências de ${active.name}. Importar une os dados sem duplicar.</p>
        <div class="row">
          <button class="btn" id="export">Exportar backup</button>
          <label class="btn ghost" for="importFile">Importar backup</label>
          <input id="importFile" type="file" accept="application/json,.json" class="sr-only">
        </div>
        <p id="backupMsg" class="small" role="status"></p>
      </div>

      <h2>Zona de cuidado</h2>
      <div class="card"><p class="muted" style="margin-top:0">Apaga ${active.name} e todos os dados locais dele neste aparelho. Dados já sincronizados continuam na conta.</p>
        <button class="btn ghost" id="delete">Apagar perfil deste aparelho</button></div>` : ''}`;

  root.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {
    await ctx.switchProfile(b.dataset.pick);
    ctx.navigate('#/inicio');
  });
  root.querySelector('#newProfile').onsubmit = async e => {
    e.preventDefault();
    const p = await store.createProfile({ name: root.querySelector('#pname').value.trim(), area: root.querySelector('#parea').value });
    await ctx.switchProfile(p.id);
    ctx.navigate('#/inicio');
  };
  if (!active) return;
  const on = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
  on('#login', async () => {
    try { await signInWithGoogle(); } catch (err) { alert(err.message); }
  });
  on('#logout', async () => {
    await signOut();
    ctx.rerender();
  });
  on('#syncNow', async () => {
    const r = await syncProfile(ctx.profile);
    ctx.invalidate();
    ctx.announce(r.error ? `Erro: ${r.error}` : `Sincronizado: ${r.pushed || 0} enviado(s), ${r.pulled || 0} recebido(s).`);
    ctx.rerender();
  });
  on('#export', async () => {
    const data = await store.exportBackup(active.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rumo-sefaz-${active.name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  root.querySelector('#importFile').onchange = async e => {
    const msg = root.querySelector('#backupMsg');
    try {
      const file = e.target.files[0];
      const data = JSON.parse(await file.text());
      if (data.profile && data.profile.area !== active.area &&
        !confirm(`O backup é de ${data.profile.name} (${data.profile.area}), e o perfil ativo é ${active.name} (${active.area}). Importar mesmo assim?`)) return;
      const c = await store.importBackup(active.id, data);
      ctx.invalidate();
      msg.textContent = `Importado: ${c.answers} resposta(s), ${c.reviews} revisão(ões), ${c.simulados} simulado(s).`;
    } catch (err) {
      msg.textContent = `Não foi possível importar: ${err.message}`;
    }
  };
  on('#delete', async () => {
    if (!confirm(`Apagar ${active.name} e todos os dados locais dele? Faça um backup antes, se precisar.`)) return;
    await store.deleteProfile(active.id);
    await store.setActiveProfileId(null);
    await ctx.reloadProfiles();
    ctx.navigate('#/perfis');
  });
}
