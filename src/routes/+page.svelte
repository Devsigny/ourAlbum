<script lang="ts">
  import { supabase } from '$lib/supabase';
  import type { Session } from '$lib/types';
  import QRCode from 'qrcode';

  let name = $state('');
  let description = $state('');
  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let qrDataUrl = $state('');
  let selectedSession = $state<Session | null>(null);

  async function loadSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
    sessions = data ?? [];
    loading = false;
  }

  async function createSession() {
    if (!name.trim()) return;
    creating = true;
    const { data } = await supabase
      .from('sessions')
      .insert({ name: name.trim(), description: description.trim() || null, created_by: 'admin' })
      .select()
      .single();

    if (data) {
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

  loadSessions();
</script>

<div class="container">
  <header>
    <h1>ourAlbum</h1>
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
      <button
        class="btn btn-secondary"
        onclick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${selectedSession!.id}`)}
      >
        Copy Link
      </button>
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
        <button class="session-card" onclick={() => showQR(session)}>
          <div class="session-info">
            <span class="session-name">{session.name}</span>
            {#if session.description}
              <span class="session-desc">{session.description}</span>
            {/if}
          </div>
          <span class="session-arrow">QR &rarr;</span>
        </button>
        <a href="/session/{session.id}" class="session-link">Open Gallery &rarr;</a>
      {/each}
    {/if}
  </section>
</div>

<style>
  header {
    text-align: center;
    padding: 60px 0 40px;
  }

  h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
  }

  .subtitle {
    color: var(--text-muted);
    margin-top: 8px;
    font-size: 15px;
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

  .sessions-list {
    margin-bottom: 60px;
  }

  .session-card {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 4px;
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
    font-size: 14px;
    font-weight: 500;
  }

  .session-link {
    display: block;
    text-align: right;
    font-size: 13px;
    color: var(--accent);
    margin-bottom: 12px;
    padding: 4px 16px;
  }

  .session-link:hover {
    text-decoration: underline;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 32px 0;
  }
</style>
