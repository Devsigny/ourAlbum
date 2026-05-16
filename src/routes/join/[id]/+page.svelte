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

  let isInstalled = $state(false);
  let isIOS = $state(false);
  let isAndroid = $state(false);
  let deferredPrompt = $state<any>(null);
  let showIOSGuide = $state(false);
  let installChecked = $state(false);

  const sessionId = page.params.id;

  function checkInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    isInstalled = standalone;

    const ua = navigator.userAgent.toLowerCase();
    isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    isAndroid = /android/.test(ua);

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      if (e.matches) isInstalled = true;
    });

    installChecked = true;
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      isInstalled = true;
    }
    deferredPrompt = null;
  }

  function skipInstall() {
    isInstalled = true;
  }

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

  checkInstallState();
  loadSession();
</script>

<div class="join-page">
  <div class="container">
    {#if installChecked && !isInstalled}
      <div class="install-gate">
        <div class="deco-top">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>

        <p class="prelude">Before entering</p>
        <h1>Install the App</h1>
        <p class="install-subtitle">For the best experience tonight</p>

        <div class="deco-divider">
          <span class="deco-star">&#10022;</span>
        </div>

        {#if isIOS}
          {#if !showIOSGuide}
            <button class="btn btn-primary" onclick={() => showIOSGuide = true}>
              How to Install
            </button>
          {/if}
          {#if showIOSGuide}
            <div class="ios-guide">
              <div class="ios-step">
                <span class="step-num">1</span>
                <p>Tap the <strong>Share</strong> button <span class="share-icon">&#xFEFF;<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> at the bottom of Safari</p>
              </div>
              <div class="ios-step">
                <span class="step-num">2</span>
                <p>Scroll down and tap <strong>Add to Home Screen</strong></p>
              </div>
              <div class="ios-step">
                <span class="step-num">3</span>
                <p>Tap <strong>Add</strong> in the top right</p>
              </div>
              <div class="ios-step">
                <span class="step-num">4</span>
                <p>Open the app from your home screen</p>
              </div>
            </div>
          {/if}
        {:else if deferredPrompt}
          <button class="btn btn-primary" onclick={installAndroid}>
            Install App
          </button>
        {:else}
          <div class="ios-guide">
            <div class="ios-step">
              <span class="step-num">1</span>
              <p>Open your browser menu <strong>(three dots)</strong></p>
            </div>
            <div class="ios-step">
              <span class="step-num">2</span>
              <p>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></p>
            </div>
            <div class="ios-step">
              <span class="step-num">3</span>
              <p>Open it from your home screen</p>
            </div>
          </div>
        {/if}

        <button class="btn-skip" onclick={skipInstall}>
          Continue without installing
        </button>

        <div class="deco-bottom">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>
      </div>
    {:else if notFound}
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

  /* Install gate */
  .install-gate {
    text-align: center;
    padding: 40px 0;
  }

  .install-gate h1 {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .install-subtitle {
    font-family: var(--font-body);
    font-size: 16px;
    font-style: italic;
    color: var(--text-muted);
  }

  .ios-guide {
    text-align: left;
    margin: 24px 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ios-step {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-gold);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    border-radius: 50%;
  }

  .ios-step p {
    font-size: 16px;
    color: var(--text);
    line-height: 1.5;
    padding-top: 2px;
  }

  .ios-step strong {
    color: var(--accent);
    font-weight: 600;
  }

  .share-icon {
    display: inline-flex;
    vertical-align: middle;
    color: var(--accent);
  }

  .btn-skip {
    display: block;
    width: 100%;
    margin-top: 24px;
    padding: 12px;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 14px;
    font-style: italic;
    letter-spacing: 0.5px;
    transition: color 0.2s;
  }

  .btn-skip:hover {
    color: var(--text);
  }
</style>
