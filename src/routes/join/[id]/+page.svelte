<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import type { Session, Guest } from '$lib/types';

  let session = $state<Session | null>(null);
  let existingGuest = $state<Guest | null>(null);
  let guestName = $state('');
  let joining = $state(false);
  let error = $state('');
  let notFound = $state(false);

  const sessionId = page.params.id;

  async function loadSession() {
    const stored = localStorage.getItem(`guest_${sessionId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Guest;
        const { data } = await supabase
          .from('guests')
          .select('*')
          .eq('id', parsed.id)
          .single();
        if (data) {
          existingGuest = data;
        }
      } catch {}
    }

    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!data) {
      notFound = true;
      return;
    }
    session = data;
  }

  function rejoin() {
    goto(`/session/${sessionId}`);
  }

  async function joinSession() {
    if (!guestName.trim() || !session) return;
    joining = true;
    error = '';

    const { data, error: err } = await supabase
      .from('guests')
      .insert({ session_id: session.id, name: guestName.trim() })
      .select()
      .single();

    if (err) {
      error = 'Something went wrong. Please try again.';
      joining = false;
      return;
    }

    if (data) {
      localStorage.setItem(`guest_${session.id}`, JSON.stringify(data));
      goto(`/session/${session.id}`);
    }
  }

  loadSession();
</script>

<div class="join-page">
  <div class="container">
    {#if notFound}
      <div class="center">
        <h1>Album not found</h1>
        <p>This link may have expired or doesn't exist.</p>
      </div>
    {:else if !session}
      <div class="center">
        <div class="loader"></div>
        <p>Loading album...</p>
      </div>
    {:else}
      <div class="join-card">
        <div class="sparkle">&#10022;</div>
        <h1>{session.name}</h1>
        {#if session.description}
          <p class="desc">{session.description}</p>
        {/if}

        {#if existingGuest}
          <p class="welcome-back">Welcome back, <strong>{existingGuest.name}</strong>!</p>
          <button class="btn btn-primary" onclick={rejoin}>
            Open Album
          </button>
          <button class="btn btn-secondary join-new" onclick={() => { existingGuest = null; }}>
            Join as someone else
          </button>
        {:else}
          <p class="invite-text">You're invited to capture this moment together</p>
          <form onsubmit={(e) => { e.preventDefault(); joinSession(); }}>
            <input
              class="input"
              type="text"
              placeholder="Your name"
              bind:value={guestName}
              autocomplete="name"
            />
            {#if error}
              <p class="error">{error}</p>
            {/if}
            <button class="btn btn-primary" type="submit" disabled={joining || !guestName.trim()}>
              {joining ? 'Joining...' : 'Join Album'}
            </button>
          </form>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .join-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
  }

  .center {
    text-align: center;
    padding: 40px 0;
  }

  .center h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .center p {
    color: var(--text-muted);
  }

  .join-card {
    text-align: center;
    padding: 40px 0;
  }

  .sparkle {
    font-size: 40px;
    color: var(--accent);
    margin-bottom: 16px;
  }

  .join-card h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .desc {
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .invite-text {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 32px;
  }

  .welcome-back {
    color: var(--text-muted);
    font-size: 16px;
    margin: 24px 0;
  }

  .welcome-back strong {
    color: var(--accent);
  }

  .join-new {
    margin-top: 12px;
    width: 100%;
    font-size: 13px;
    padding: 10px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn {
    width: 100%;
  }

  .error {
    color: #e57373;
    font-size: 14px;
  }

  .loader {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
