<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { PARTY_SESSION_ID } from '$lib/config';

  if (browser) {
    const guestKey = `guest_${PARTY_SESSION_ID}`;
    const stored = localStorage.getItem(guestKey);
    if (stored) {
      goto(`/session/${PARTY_SESSION_ID}`, { replaceState: true });
    } else {
      goto(`/join/${PARTY_SESSION_ID}`, { replaceState: true });
    }
  }
</script>

<div class="splash">
  <div class="loader"></div>
</div>

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
    border: 2px solid var(--border-gold, #3a3428);
    border-top-color: var(--accent, #c9a84c);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
