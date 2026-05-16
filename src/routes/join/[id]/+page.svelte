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
  let isIOSSafari = $state(false);
  let isAndroid = $state(false);
  let deferredPrompt = $state<any>(null);
  let installChecked = $state(false);
  let linkCopied = $state(false);

  const sessionId = page.params.id;

  function checkInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    isInstalled = standalone;

    const ua = navigator.userAgent.toLowerCase();
    isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    isAndroid = /android/.test(ua);

    if (isIOS) {
      const isSafari = /safari/.test(ua) && !/crios|fxios|opios|edgios/.test(ua);
      isIOSSafari = isSafari;
    }

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

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    linkCopied = true;
    setTimeout(() => linkCopied = false, 2000);
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
        <p class="install-subtitle">For the full Gatsby experience</p>

        <div class="deco-divider">
          <span class="deco-star">&#10022;</span>
        </div>

        {#if isIOS && !isIOSSafari}
          <!-- iOS but NOT Safari - can't install from here -->
          <div class="safari-warning">
            <div class="safari-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" fill="rgba(201,168,76,0.2)"/></svg>
            </div>
            <p class="warning-title">Switch to Safari</p>
            <p class="warning-text">Only Safari can install apps on iPhone</p>

            <div class="safari-steps">
              <div class="guide-step">
                <div class="step-badge">1</div>
                <div class="step-content">
                  <p>Copy this link</p>
                </div>
              </div>
              <button class="copy-link-btn" onclick={copyLink}>
                {#if linkCopied}
                  <span class="copy-check">&#10003;</span> Copied!
                {:else}
                  <span class="copy-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span>
                  Tap to copy link
                {/if}
              </button>
              <div class="step-connector"></div>
              <div class="guide-step">
                <div class="step-badge">2</div>
                <div class="step-content">
                  <p>Open <strong>Safari</strong> and paste in the address bar</p>
                </div>
              </div>
            </div>
          </div>

        {:else if isIOS && isIOSSafari}
          <!-- iOS Safari - show visual guide -->
          <div class="ios-visual-guide">
            <p class="guide-intro">Tap the share button below</p>

            <div class="share-arrow-container">
              <div class="share-arrow">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              </div>
            </div>

            <div class="share-button-visual">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </div>

            <div class="guide-steps">
              <div class="guide-step">
                <div class="step-badge">1</div>
                <div class="step-content">
                  <p>Tap <span class="share-icon-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> in the toolbar below</p>
                </div>
              </div>
              <div class="step-connector"></div>
              <div class="guide-step">
                <div class="step-badge">2</div>
                <div class="step-content">
                  <p>Scroll down, tap <strong>Add to Home Screen</strong></p>
                </div>
              </div>
              <div class="step-connector"></div>
              <div class="guide-step">
                <div class="step-badge">3</div>
                <div class="step-content">
                  <p>Tap <strong>Add</strong> &mdash; then open from home</p>
                </div>
              </div>
            </div>
          </div>

        {:else if deferredPrompt}
          <!-- Android with install prompt -->
          <button class="btn btn-primary" onclick={installAndroid}>
            Install App
          </button>

        {:else}
          <!-- Android/other fallback -->
          <div class="ios-visual-guide">
            <div class="guide-steps">
              <div class="guide-step">
                <div class="step-badge">1</div>
                <div class="step-content">
                  <p>Tap <strong>&#8942;</strong> menu in your browser</p>
                </div>
              </div>
              <div class="step-connector"></div>
              <div class="guide-step">
                <div class="step-badge">2</div>
                <div class="step-content">
                  <p>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></p>
                </div>
              </div>
              <div class="step-connector"></div>
              <div class="guide-step">
                <div class="step-badge">3</div>
                <div class="step-content">
                  <p>Open from your home screen</p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <button class="btn-skip" onclick={skipInstall}>
          Continue in browser
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

  /* Safari warning (non-Safari iOS) */
  .safari-warning {
    text-align: center;
    margin: 8px 0;
  }

  .safari-icon {
    margin-bottom: 16px;
  }

  .warning-title {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
  }

  .warning-text {
    font-size: 15px;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 20px;
  }

  .safari-steps {
    text-align: left;
  }

  .copy-link-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    margin: 12px 0;
    background: var(--accent-dim);
    border: 1px dashed var(--accent);
    border-radius: var(--radius);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    transition: all 0.2s;
  }

  .copy-link-btn:active {
    background: rgba(201, 168, 76, 0.25);
  }

  .copy-check {
    font-size: 18px;
  }

  .copy-icon {
    display: inline-flex;
  }

  /* iOS Safari visual guide */
  .ios-visual-guide {
    margin: 8px 0;
  }

  .guide-intro {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--text);
    font-style: italic;
    margin-bottom: 16px;
  }

  .share-arrow-container {
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
  }

  .share-arrow {
    animation: bounce-down 1.2s ease-in-out infinite;
  }

  @keyframes bounce-down {
    0%, 100% { transform: translateY(0); opacity: 1; }
    50% { transform: translateY(12px); opacity: 0.6; }
  }

  .share-button-visual {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 2px solid var(--accent);
    border-radius: 10px;
    margin-bottom: 28px;
    animation: pulse-glow 2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 8px rgba(201, 168, 76, 0.2); }
    50% { box-shadow: 0 0 24px rgba(201, 168, 76, 0.5); }
  }

  .guide-steps {
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .guide-step {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 0;
  }

  .step-badge {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-dim);
    border: 1px solid var(--border-gold);
    color: var(--accent);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    border-radius: 50%;
  }

  .step-content p {
    font-size: 16px;
    color: var(--text);
    line-height: 1.4;
  }

  .step-content strong {
    color: var(--accent);
    font-weight: 600;
  }

  .step-connector {
    width: 1px;
    height: 8px;
    background: var(--border-gold);
    margin-left: 16px;
  }

  .share-icon-inline {
    display: inline-flex;
    vertical-align: middle;
    color: var(--accent);
    margin: 0 2px;
  }

  .btn-skip {
    display: block;
    width: 100%;
    margin-top: 28px;
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
