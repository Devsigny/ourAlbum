<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  import { supabase } from '$lib/supabase';
  import { compressImage } from '$lib/image';
  import { PARTY_SESSION_ID } from '$lib/config';
  import QRCode from 'qrcode';
  import type { Session, Guest, Photo } from '$lib/types';

  let session = $state<Session | null>(null);
  let guest = $state<Guest | null>(null);
  let photos = $state<Photo[]>([]);
  let guests = $state<Guest[]>([]);
  let uploading = $state(false);
  let uploadCount = $state(0);
  let uploadError = $state('');
  let cameraInput = $state<HTMLInputElement | null>(null);
  let galleryInput = $state<HTMLInputElement | null>(null);
  let lightboxPhoto = $state<Photo | null>(null);
  let lightboxIdx = $state(-1);
  let knownPhotoIds = new Set<string>();
  let showQr = $state(false);
  let qrDataUrl = $state('');

  const sessionId = page.params.id;

  async function openQrModal() {
    if (!qrDataUrl) {
      const joinUrl = `${window.location.origin}/join/${PARTY_SESSION_ID}`;
      qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 500,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H'
      });
    }
    showQr = true;
  }

  function getPhotoUrl(path: string) {
    return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  function getThumbUrl(path: string) {
    return `${PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/photos/${path}?width=400&quality=70`;
  }

  let lightboxLoaded = $state(false);

  function preloadImage(path: string) {
    const img = new Image();
    img.src = getPhotoUrl(path);
  }

  function preloadAdjacent() {
    if (lightboxIdx > 0) preloadImage(photos[lightboxIdx - 1].storage_path);
    if (lightboxIdx < photos.length - 1) preloadImage(photos[lightboxIdx + 1].storage_path);
  }

  async function tryAutoJoinAdmin(): Promise<boolean> {
    const { data: authData } = await supabase.auth.getSession();
    const authUser = authData.session?.user;
    if (!authUser) return false;

    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (!sess || sess.created_by !== authUser.id) return false;

    let { data: existing } = await supabase
      .from('guests')
      .select('*')
      .eq('session_id', sessionId)
      .eq('name', 'Admin')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: created } = await supabase
        .from('guests')
        .insert({ session_id: sessionId, name: 'Admin' })
        .select()
        .single();
      existing = created;
    }

    if (existing) {
      guest = existing;
      localStorage.setItem(`guest_${sessionId}`, JSON.stringify(existing));
      return true;
    }
    return false;
  }

  async function loadData() {
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
          guest = data;
        } else {
          localStorage.removeItem(`guest_${sessionId}`);
        }
      } catch {
        localStorage.removeItem(`guest_${sessionId}`);
      }
    }

    if (!guest) {
      const autoJoined = await tryAutoJoinAdmin();
      if (!autoJoined) {
        goto(`/join/${sessionId}`);
        return;
      }
    }

    const [sessionRes, photosRes, guestsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('photos').select('*, guest:guests(name)').eq('session_id', sessionId).order('created_at', { ascending: false }),
      supabase.from('guests').select('*').eq('session_id', sessionId)
    ]);

    session = sessionRes.data;
    photos = photosRes.data ?? [];
    for (const p of photos) knownPhotoIds.add(p.id);
    guests = guestsRes.data ?? [];
  }

  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  function subscribeRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
      .channel(`photos_${sessionId}_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const newId = (payload.new as any).id;
          if (knownPhotoIds.has(newId)) return;
          knownPhotoIds.add(newId);
          const { data } = await supabase
            .from('photos')
            .select('*, guest:guests(name)')
            .eq('id', newId)
            .single();
          if (data && !photos.some(p => p.id === data.id)) {
            photos = [data, ...photos];
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guests', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const g = payload.new as Guest;
          if (!guests.some(x => x.id === g.id)) {
            guests = [...guests, g];
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setTimeout(() => subscribeRealtime(), 3000);
        }
      });
  }

  async function uploadPhoto(file: File) {
    if (!guest) return;
    uploading = true;
    uploadError = '';
    uploadCount++;

    try {
      const compressed = await compressImage(file);
      const path = `${sessionId}/${Date.now()}_${guest.id.slice(0, 8)}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('photos')
        .upload(path, compressed, { contentType: 'image/jpeg' });

      if (uploadErr) throw uploadErr;

      const { data: newPhoto } = await supabase.from('photos').insert({
        session_id: sessionId,
        guest_id: guest.id,
        storage_path: path
      }).select('*, guest:guests(name)').single();

      if (newPhoto && !knownPhotoIds.has(newPhoto.id)) {
        knownPhotoIds.add(newPhoto.id);
        photos = [newPhoto, ...photos];
      }
    } catch (e) {
      console.error('Upload failed:', e);
      uploadError = 'Upload failed — please try again';
      setTimeout(() => { uploadError = ''; }, 4000);
    }

    uploadCount--;
    if (uploadCount <= 0) {
      uploading = false;
      uploadCount = 0;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      uploadPhoto(file);
    }
    input.value = '';
  }

  function openNativeCamera() {
    cameraInput?.click();
  }

  function openGallery() {
    galleryInput?.click();
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchDeltaX = $state(0);
  let swiping = $state(false);
  let slideDir = $state<'left' | 'right' | null>(null);
  let lightboxEl = $state<HTMLDivElement | null>(null);
  let deleting = $state(false);

  function openLightbox(photo: Photo, idx: number) {
    lightboxPhoto = photo;
    lightboxIdx = idx;
    lightboxLoaded = false;
    touchDeltaX = 0;
    slideDir = null;
    requestAnimationFrame(() => lightboxEl?.focus());
    preloadAdjacent();
  }

  function closeLightbox() {
    lightboxPhoto = null;
    touchDeltaX = 0;
    slideDir = null;
  }

  function lightboxNav(dir: -1 | 1) {
    const newIdx = lightboxIdx + dir;
    if (newIdx >= 0 && newIdx < photos.length) {
      slideDir = dir === 1 ? 'left' : 'right';
      lightboxIdx = newIdx;
      lightboxPhoto = photos[newIdx];
      lightboxLoaded = false;
      touchDeltaX = 0;
      setTimeout(() => { slideDir = null; }, 300);
      preloadAdjacent();
    }
  }

  function handleLightboxKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swiping = true;
    touchDeltaX = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!swiping) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(touchDeltaX) < 10) {
      swiping = false;
      touchDeltaX = 0;
      return;
    }
    e.preventDefault();
    touchDeltaX = dx;
  }

  function handleTouchEnd() {
    if (!swiping) return;
    swiping = false;
    const threshold = 60;
    if (touchDeltaX < -threshold && lightboxIdx < photos.length - 1) {
      lightboxNav(1);
    } else if (touchDeltaX > threshold && lightboxIdx > 0) {
      lightboxNav(-1);
    } else if (Math.abs(touchDeltaX) < 10) {
      closeLightbox();
    }
    touchDeltaX = 0;
  }

  function isOwnPhoto(photo: Photo): boolean {
    return !!guest && photo.guest_id === guest.id;
  }

  async function deletePhoto() {
    if (!lightboxPhoto || !isOwnPhoto(lightboxPhoto)) return;
    deleting = true;

    const photo = lightboxPhoto;
    const idx = lightboxIdx;

    await supabase.storage.from('photos').remove([photo.storage_path]);
    await supabase.from('photos').delete().eq('id', photo.id);

    knownPhotoIds.delete(photo.id);
    photos = photos.filter(p => p.id !== photo.id);

    if (photos.length === 0) {
      closeLightbox();
    } else {
      const newIdx = Math.min(idx, photos.length - 1);
      lightboxIdx = newIdx;
      lightboxPhoto = photos[newIdx];
    }
    deleting = false;
  }

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function pollPhotos() {
    if (!session) return;
    const { data } = await supabase
      .from('photos')
      .select('*, guest:guests(name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (!data) return;
    const serverIds = new Set(data.map(p => p.id));
    const localIds = new Set(photos.map(p => p.id));
    const hasNew = data.some(p => !localIds.has(p.id));
    const hasRemoved = photos.some(p => !serverIds.has(p.id));
    if (hasNew || hasRemoved) {
      photos = data;
      knownPhotoIds = new Set(data.map(p => p.id));
    }
  }

  if (browser) {
    loadData().then(() => {
      subscribeRealtime();
      pollInterval = setInterval(pollPhotos, 10000);
    });
  }

  onDestroy(() => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });
</script>

<svelte:head>
  {#if session}
    <title>Val & Isa - Gatsby Night</title>
  {/if}
</svelte:head>

<!-- Hidden native file inputs -->
<input
  bind:this={cameraInput}
  type="file"
  accept="image/*"
  capture="user"
  onchange={handleFileSelect}
  hidden
/>
<input
  bind:this={galleryInput}
  type="file"
  accept="image/*"
  multiple
  onchange={handleFileSelect}
  hidden
/>

{#if lightboxPhoto}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="lightbox"
    role="dialog"
    tabindex="0"
    bind:this={lightboxEl}
    onkeydown={handleLightboxKey}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
  >
    <div
      class="lb-track"
      class:slide-left={slideDir === 'left'}
      class:slide-right={slideDir === 'right'}
      style="transform: translateX({touchDeltaX}px); {swiping ? '' : touchDeltaX === 0 ? '' : 'transition: transform 0.25s ease;'}"
    >
      {#if !lightboxLoaded}
        <div class="lb-spinner"></div>
      {/if}
      <img
        src={getPhotoUrl(lightboxPhoto.storage_path)}
        alt=""
        draggable="false"
        class:lb-img-loaded={lightboxLoaded}
        onload={() => { lightboxLoaded = true; }}
      />
    </div>

    <div class="lb-counter">{lightboxIdx + 1} / {photos.length}</div>

    <div class="lightbox-info">
      <span class="lb-name">{lightboxPhoto.guest?.name ?? 'Unknown'}</span>
      <span class="lb-time">{new Date(lightboxPhoto.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>

    {#if isOwnPhoto(lightboxPhoto)}
      <button class="lb-delete" onclick={(e) => { e.stopPropagation(); deletePhoto(); }} disabled={deleting} aria-label="Delete photo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    {/if}

    <button class="lb-close" onclick={closeLightbox} aria-label="Close">&#10005;</button>
  </div>
{/if}

{#if showQr}
  <div class="qr-overlay" onclick={() => { showQr = false; }} role="dialog">
    <div class="qr-modal" onclick={(e) => e.stopPropagation()}>
      <p class="qr-title">Scan to join</p>
      {#if qrDataUrl}
        <img class="qr-img" src={qrDataUrl} alt="QR Code" />
      {/if}
      <button class="qr-close" onclick={() => { showQr = false; }}>Close</button>
    </div>
  </div>
{/if}

<div class="session-page">
  <div class="sticky-top">
    <header>
      <div class="container">
        {#if session}
          <h1>Val & Isa</h1>
          <div class="header-row">
            <span class="stats">{photos.length} photo{photos.length !== 1 ? 's' : ''} &#10022; {guests.length} guest{guests.length !== 1 ? 's' : ''}</span>
            {#if guest}
              <span class="guest-badge">{guest.name}</span>
            {/if}
          </div>
        {:else}
          <div class="loading-header">
            <div class="loader"></div>
          </div>
        {/if}
      </div>
    </header>

    {#if guest}
      <div class="actions container">
        <button class="btn btn-primary" onclick={openNativeCamera}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Capture
        </button>
        <button class="btn btn-secondary" onclick={openGallery}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Gallery
        </button>
        <button class="btn btn-qr" onclick={openQrModal} aria-label="Share QR code">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/><line x1="21" y1="21" x2="21" y2="21"/></svg>
        </button>
      </div>
    {/if}

    {#if uploading}
      <div class="container upload-status">
        <div class="upload-bar">
          <div class="upload-progress"></div>
        </div>
        <p class="upload-hint">{uploadCount} uploading...</p>
      </div>
    {/if}

    {#if uploadError}
      <div class="container">
        <p class="upload-error">{uploadError}</p>
      </div>
    {/if}
  </div>

  <div class="gallery-scroll">
    <div class="gallery container">
      {#if photos.length === 0}
        <div class="empty-gallery">
          <p class="empty-icon">&#10022;</p>
          <p>No photos yet</p>
          <p class="hint">Be the first to capture a moment, old sport!</p>
        </div>
      {:else}
        <div class="photo-grid">
          {#each photos as photo, i (photo.id)}
            <button class="photo-item" onclick={() => openLightbox(photo, i)}>
              <img
                src={getPhotoUrl(photo.storage_path)}
                alt="Photo by {photo.guest?.name ?? 'guest'}"
                loading="lazy"
              />
              <div class="photo-meta">
                <span class="photo-author">{photo.guest?.name ?? ''}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .session-page {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .sticky-top {
    flex-shrink: 0;
  }

  header {
    padding: 16px 0 8px;
    text-align: center;
  }

  header h1 {
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 1px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 4px;
  }

  .stats {
    color: var(--text-muted);
    font-size: 12px;
    letter-spacing: 0.5px;
  }

  .guest-badge {
    font-size: 12px;
    color: var(--accent);
    font-family: var(--font-display);
    font-weight: 700;
  }

  .loading-header {
    padding: 20px 0;
    display: flex;
    justify-content: center;
  }

  .loader {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border-gold);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .actions {
    display: flex;
    gap: 12px;
    margin: 8px auto 10px;
  }

  .btn-qr {
    padding: 0 12px !important;
    flex: 0 !important;
    background: transparent;
    border: 1px solid var(--border-gold);
    border-radius: var(--radius);
    color: var(--accent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-qr:active {
    background: rgba(201, 168, 76, 0.1);
  }

  .actions .btn {
    flex: 1;
  }

  .upload-status {
    padding-bottom: 8px;
  }

  .upload-bar {
    height: 2px;
    background: var(--border-gold);
    overflow: hidden;
  }

  .upload-progress {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #e8d48b, var(--accent));
    background-size: 200% 100%;
    animation: progress-shine 1.5s ease-in-out infinite;
  }

  @keyframes progress-shine {
    0% { width: 0%; background-position: 0% 0%; }
    50% { width: 70%; background-position: 100% 0%; }
    100% { width: 100%; background-position: 0% 0%; }
  }

  .upload-hint {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
    margin-top: 4px;
  }

  .upload-error {
    text-align: center;
    font-size: 14px;
    color: #e57373;
    padding: 8px 8px 0;
  }

  .gallery-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .gallery {
    padding-top: 0;
  }

  .empty-gallery {
    text-align: center;
    padding: 60px 0;
  }

  .empty-icon {
    font-size: 32px;
    color: var(--accent);
    margin-bottom: 12px;
  }

  .empty-gallery p {
    color: var(--text-muted);
    font-size: 18px;
    font-style: italic;
  }

  .hint {
    font-size: 15px !important;
    margin-top: 8px;
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
  }

  @media (max-width: 400px) {
    .photo-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .photo-item {
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    border-radius: 2px;
    background: var(--bg-card);
    padding: 0;
    border: none;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s;
  }

  .photo-item:active img {
    transform: scale(0.97);
  }

  .photo-meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 20px 6px 5px;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
  }

  .photo-author {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 500;
    color: rgba(232, 212, 139, 0.9);
    text-shadow: 0 1px 3px rgba(0,0,0,0.7);
    letter-spacing: 0.5px;
  }

  /* Lightbox */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: rgba(10,10,10,0.97);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    outline: none;
    touch-action: pan-y;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }

  .lb-track {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    will-change: transform;
  }

  .lb-track.slide-left {
    animation: slideFromRight 0.3s ease;
  }

  .lb-track.slide-right {
    animation: slideFromLeft 0.3s ease;
  }

  @keyframes slideFromRight {
    from { transform: translateX(40%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes slideFromLeft {
    from { transform: translateX(-40%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .lb-track img {
    max-width: 92vw;
    max-height: 75vh;
    object-fit: contain;
    border-radius: 2px;
    border: 1px solid var(--border-gold);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .lb-track img.lb-img-loaded {
    opacity: 1;
  }

  .lb-spinner {
    position: absolute;
    width: 32px;
    height: 32px;
    border: 2px solid var(--border-gold);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .lb-counter {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    color: var(--text-muted);
    letter-spacing: 1px;
    font-family: var(--font-body);
  }

  .lightbox-info {
    position: absolute;
    bottom: 32px;
    display: flex;
    gap: 12px;
    font-size: 15px;
  }

  .lb-name {
    color: var(--accent);
    font-family: var(--font-display);
    font-weight: 600;
  }

  .lb-time {
    color: var(--text-muted);
  }

  .lb-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(201, 168, 76, 0.15);
    border: 1px solid rgba(201, 168, 76, 0.3);
    color: var(--accent);
    font-size: 20px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .lb-delete {
    position: absolute;
    top: 12px;
    left: 12px;
    background: rgba(229, 115, 115, 0.15);
    border: 1px solid rgba(229, 115, 115, 0.3);
    color: #e57373;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .lb-delete:disabled {
    opacity: 0.4;
  }

  .qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 10, 10, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .qr-modal {
    text-align: center;
    background: var(--bg-elevated);
    border: 1px solid var(--border-gold);
    border-radius: 12px;
    padding: 32px 24px;
    max-width: 320px;
    width: 100%;
  }

  .qr-title {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--accent);
    margin-bottom: 20px;
    letter-spacing: 1px;
  }

  .qr-img {
    width: 220px;
    height: 220px;
    border-radius: 8px;
  }

  .qr-close {
    margin-top: 20px;
    background: transparent;
    border: 1px solid var(--border-gold);
    color: var(--text-muted);
    padding: 10px 28px;
    border-radius: var(--radius);
    font-size: 14px;
    cursor: pointer;
  }
</style>
