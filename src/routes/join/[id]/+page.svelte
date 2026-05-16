<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
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

  if (browser) {
    loadSession();
  }
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
        <div class="deco-top">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>

        <p class="prelude">You are cordially invited to</p>
        <h1>Val & Isa</h1>
        <p class="event-subtitle">A Great Gatsby Night</p>

        <div class="deco-divider">
          <span class="deco-star">&#10022;</span>
        </div>

        {#if existingGuest}
          <p class="welcome-back">Welcome back, <strong>{existingGuest.name}</strong></p>
          <button class="btn btn-primary" onclick={rejoin}>
            Enter the Party
          </button>
          <button class="btn btn-secondary join-new" onclick={() => { existingGuest = null; }}>
            Different guest
          </button>
        {:else}
          <p class="invite-text">Capture this evening through everyone's eyes</p>
          <form onsubmit={(e) => { e.preventDefault(); joinSession(); }}>
            <input
              class="input"
              type="text"
              placeholder="Your name, darling"
              bind:value={guestName}
              autocomplete="name"
              autocapitalize="words"
            />
            {#if error}
              <p class="error">{error}</p>
            {/if}
            <button class="btn btn-primary" type="submit" disabled={joining || !guestName.trim()}>
              {joining ? 'Entering...' : 'Enter the Party'}
            </button>
          </form>
        {/if}

        <div class="deco-bottom">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>

      </div>
    {/if}
  </div>
</div>

<style>
  .join-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(201, 168, 76, 0.08) 0%, transparent 60%),
      var(--bg);
  }

  .center {
    text-align: center;
    padding: 40px 0;
  }

  .center h1 {
    font-family: var(--font-display);
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

  .prelude {
    font-size: 14px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .join-card h1 {
    font-family: var(--font-display);
    font-size: 42px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 2px;
    margin-bottom: 6px;
  }

  .event-subtitle {
    font-family: var(--font-body);
    font-size: 18px;
    font-style: italic;
    color: var(--text-muted);
    letter-spacing: 1px;
  }

  .deco-top, .deco-bottom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 24px 0;
  }

  .deco-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
  }

  .deco-diamond {
    width: 8px;
    height: 8px;
    background: var(--accent);
    transform: rotate(45deg);
  }

  .deco-divider {
    margin: 28px 0;
    text-align: center;
    position: relative;
  }

  .deco-divider::before {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    top: 50%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-gold), transparent);
  }

  .deco-star {
    position: relative;
    color: var(--accent);
    font-size: 18px;
    background: var(--bg);
    padding: 0 16px;
  }

  .invite-text {
    color: var(--text-muted);
    font-size: 16px;
    font-style: italic;
    margin-bottom: 32px;
  }

  .welcome-back {
    color: var(--text-muted);
    font-size: 18px;
    margin: 24px 0;
  }

  .welcome-back strong {
    color: var(--accent);
    font-family: var(--font-display);
    font-weight: 700;
  }

  .join-new {
    margin-top: 12px;
    width: 100%;
    font-size: 12px;
    padding: 10px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    border: 2px solid var(--border-gold);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

</style>
