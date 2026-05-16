<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { supabase } from '$lib/supabase';
  import type { Session } from '$lib/types';
  import type { User } from '@supabase/supabase-js';
  import QRCode from 'qrcode';

  let user = $state<User | null>(null);
  let authLoading = $state(true);
  let email = $state('');
  let password = $state('');
  let authError = $state('');
  let authMode = $state<'login' | 'signup'>('login');

  let name = $state('');
  let description = $state('');
  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let qrDataUrl = $state('');
  let selectedSession = $state<Session | null>(null);

  function tryGuestRedirect(): boolean {
    if (!browser) return false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('guest_')) {
        const sessionId = key.replace('guest_', '');
        goto(`/session/${sessionId}`);
        return true;
      }
    }
    return false;
  }

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    user = data.session?.user ?? null;
    if (!user && tryGuestRedirect()) return;
    authLoading = false;
    if (user) loadSessions();
  }

  async function login() {
    authError = '';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      authError = error.message;
      return;
    }
    await checkAuth();
  }

  async function signup() {
    authError = '';
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      authError = error.message;
      return;
    }
    await checkAuth();
  }

  async function logout() {
    await supabase.auth.signOut();
    user = null;
    sessions = [];
  }

  async function loadSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
    sessions = data ?? [];
    loading = false;
  }

  async function createSession() {
    if (!name.trim() || !user) return;
    creating = true;
    const { data } = await supabase
      .from('sessions')
      .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id })
      .select()
      .single();

    if (data) {
      const { data: adminGuest } = await supabase
        .from('guests')
        .insert({ session_id: data.id, name: 'Admin' })
        .select()
        .single();
      if (adminGuest) {
        localStorage.setItem(`guest_${data.id}`, JSON.stringify(adminGuest));
      }

      sessions = [data, ...sessions];
      name = '';
      description = '';
      await showQR(data);
    }
    creating = false;
  }

  async function showQR(session: Session) {
    selectedSession = session;
    const url = `${window.location.origin}/join/${session.id}`;
    qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });
  }

  checkAuth();
</script>

{#if authLoading}
  <div class="splash">
    <div class="loader"></div>
  </div>
{:else if !user}
  <div class="auth-page">
    <div class="container">
      <div class="auth-card">
        <h1>ourAlbum</h1>
        <p class="subtitle">Sign in to manage your albums</p>

        <div class="auth-tabs">
          <button class="tab" class:active={authMode === 'login'} onclick={() => { authMode = 'login'; authError = ''; }}>Sign In</button>
          <button class="tab" class:active={authMode === 'signup'} onclick={() => { authMode = 'signup'; authError = ''; }}>Sign Up</button>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); authMode === 'login' ? login() : signup(); }}>
          <input class="input" type="email" placeholder="Email" bind:value={email} autocomplete="email" />
          <input class="input" type="password" placeholder="Password" bind:value={password} autocomplete={authMode === 'login' ? 'current-password' : 'new-password'} />
          {#if authError}
            <p class="error">{authError}</p>
          {/if}
          <button class="btn btn-primary" type="submit">
            {authMode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  </div>
{:else}
  <div class="container">
    <header>
      <div class="header-row">
        <h1>ourAlbum</h1>
        <button class="btn-logout" onclick={logout}>Sign Out</button>
      </div>
      <p class="subtitle">Create a shared photo album for your event</p>
    </header>

    <section class="create-section">
      <h2>New Album</h2>
      <form onsubmit={(e) => { e.preventDefault(); createSession(); }}>
        <input
          class="input"
          type="text"
          placeholder="Album name (e.g. Roger's Birthday)"
          bind:value={name}
        />
        <input
          class="input"
          type="text"
          placeholder="Description (optional)"
          bind:value={description}
          style="margin-top: 12px"
        />
        <button class="btn btn-primary" type="submit" disabled={creating || !name.trim()}>
          {creating ? 'Creating...' : 'Create Album'}
        </button>
      </form>
    </section>

    {#if qrDataUrl && selectedSession}
      <section class="qr-section">
        <h2>Share this QR Code</h2>
        <p class="qr-name">{selectedSession.name}</p>
        <div class="qr-wrapper">
          <img src={qrDataUrl} alt="QR Code to join album" />
        </div>
        <p class="qr-url">{window.location.origin}/join/{selectedSession.id}</p>
        <div class="qr-actions">
          <button
            class="btn btn-secondary"
            onclick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${selectedSession!.id}`)}
          >
            Copy Link
          </button>
          <a href="/session/{selectedSession.id}" class="btn btn-secondary">Open Gallery</a>
        </div>
      </section>
    {/if}

    <section class="sessions-list">
      <h2>Your Albums</h2>
      {#if loading}
        <p class="empty">Loading...</p>
      {:else if sessions.length === 0}
        <p class="empty">No albums yet. Create one above!</p>
      {:else}
        {#each sessions as session}
          <div class="session-row">
            <button class="session-card" onclick={() => showQR(session)}>
              <div class="session-info">
                <span class="session-name">{session.name}</span>
                {#if session.description}
                  <span class="session-desc">{session.description}</span>
                {/if}
              </div>
              <span class="session-arrow">QR</span>
            </button>
            <a href="/session/{session.id}" class="session-link">Gallery &rarr;</a>
          </div>
        {/each}
      {/if}
    </section>
  </div>
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loader {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Auth */
  .auth-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
  }

  .auth-card {
    text-align: center;
    padding: 20px 0;
  }

  .auth-card h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
  }

  .subtitle {
    color: var(--text-muted);
    margin-top: 8px;
    font-size: 15px;
  }

  .auth-tabs {
    display: flex;
    gap: 0;
    margin: 28px 0 20px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .tab {
    flex: 1;
    padding: 12px;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .tab.active {
    background: var(--bg-elevated);
    color: var(--text);
  }

  .auth-card form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .auth-card .btn {
    width: 100%;
    margin-top: 4px;
  }

  .error {
    color: #e57373;
    font-size: 14px;
    text-align: left;
  }

  /* Admin */
  header {
    padding: 48px 0 32px;
    text-align: center;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .header-row h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
  }

  .btn-logout {
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    transition: all 0.2s;
  }

  .btn-logout:hover {
    color: var(--text);
    border-color: var(--text-muted);
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .create-section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 32px;
  }

  .create-section form {
    display: flex;
    flex-direction: column;
  }

  .create-section .btn {
    margin-top: 16px;
    width: 100%;
  }

  .qr-section {
    text-align: center;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 32px;
  }

  .qr-name {
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 16px;
    font-size: 20px;
  }

  .qr-wrapper {
    background: white;
    border-radius: var(--radius);
    display: inline-block;
    padding: 16px;
  }

  .qr-wrapper img {
    display: block;
    width: 250px;
    height: 250px;
  }

  .qr-url {
    font-size: 12px;
    color: var(--text-muted);
    margin: 12px 0;
    word-break: break-all;
  }

  .qr-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .sessions-list {
    margin-bottom: 60px;
  }

  .session-row {
    margin-bottom: 8px;
  }

  .session-card {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 16px;
    color: var(--text);
    transition: background 0.2s;
  }

  .session-card:hover {
    background: var(--bg-elevated);
  }

  .session-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .session-name {
    font-weight: 600;
  }

  .session-desc {
    font-size: 13px;
    color: var(--text-muted);
  }

  .session-arrow {
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    background: var(--bg-elevated);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }

  .session-link {
    display: block;
    text-align: center;
    font-size: 13px;
    color: var(--accent);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    padding: 10px;
    transition: background 0.2s;
  }

  .session-link:hover {
    background: var(--bg-elevated);
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 32px 0;
  }
</style>
