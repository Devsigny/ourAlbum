<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { compressImage } from '$lib/image';
  import type { Session, Guest, Photo } from '$lib/types';

  let session = $state<Session | null>(null);
  let guest = $state<Guest | null>(null);
  let photos = $state<Photo[]>([]);
  let guests = $state<Guest[]>([]);
  let uploading = $state(false);
  let uploadCount = $state(0);
  let cameraInput = $state<HTMLInputElement | null>(null);
  let galleryInput = $state<HTMLInputElement | null>(null);
  let lightboxPhoto = $state<Photo | null>(null);
  let lightboxIdx = $state(-1);

  const sessionId = page.params.id;

  function getPhotoUrl(path: string) {
    return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  async function loadData() {
    const stored = localStorage.getItem(`guest_${sessionId}`);
    if (stored) {
      try {
        guest = JSON.parse(stored);
      } catch {}
    }

    if (!guest) {
      goto(`/join/${sessionId}`);
      return;
    }

    const [sessionRes, photosRes, guestsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('photos').select('*, guest:guests(name)').eq('session_id', sessionId).order('created_at', { ascending: false }),
      supabase.from('guests').select('*').eq('session_id', sessionId)
    ]);

    session = sessionRes.data;
    photos = photosRes.data ?? [];
    guests = guestsRes.data ?? [];
  }

  function subscribeRealtime() {
    supabase
      .channel(`photos_${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const { data } = await supabase
            .from('photos')
            .select('*, guest:guests(name)')
            .eq('id', payload.new.id)
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
      .subscribe();
  }

  async function uploadPhoto(file: File) {
    if (!guest) return;
    uploading = true;
    uploadCount++;

    try {
      const compressed = await compressImage(file);
      const path = `${sessionId}/${Date.now()}_${guest.id.slice(0, 8)}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('photos')
        .upload(path, compressed, { contentType: 'image/jpeg' });

      if (uploadErr) throw uploadErr;

      await supabase.from('photos').insert({
        session_id: sessionId,
        guest_id: guest.id,
        storage_path: path
      });
    } catch (e) {
      console.error('Upload failed:', e);
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
    if (!files) return;
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

  function openLightbox(photo: Photo, idx: number) {
    lightboxPhoto = photo;
    lightboxIdx = idx;
  }

  function lightboxNav(dir: -1 | 1) {
    const newIdx = lightboxIdx + dir;
    if (newIdx >= 0 && newIdx < photos.length) {
      lightboxIdx = newIdx;
      lightboxPhoto = photos[newIdx];
    }
  }

  function handleLightboxKey(e: KeyboardEvent) {
    if (e.key === 'Escape') lightboxPhoto = null;
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
  }

  loadData();
  subscribeRealtime();
</script>

<svelte:head>
  {#if session}
    <title>{session.name} - ourAlbum</title>
  {/if}
</svelte:head>

<!-- Hidden native file inputs -->
<input
  bind:this={cameraInput}
  type="file"
  accept="image/*"
  capture="environment"
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
  <div class="lightbox" role="dialog" tabindex="0" onkeydown={handleLightboxKey} onclick={() => lightboxPhoto = null}>
    {#if lightboxIdx > 0}
      <button class="lb-nav lb-prev" onclick={(e) => { e.stopPropagation(); lightboxNav(-1); }} aria-label="Previous">&lsaquo;</button>
    {/if}
    <img src={getPhotoUrl(lightboxPhoto.storage_path)} alt="" onclick={(e) => e.stopPropagation()} />
    {#if lightboxIdx < photos.length - 1}
      <button class="lb-nav lb-next" onclick={(e) => { e.stopPropagation(); lightboxNav(1); }} aria-label="Next">&rsaquo;</button>
    {/if}
    <div class="lightbox-info" onclick={(e) => e.stopPropagation()}>
      <span class="lb-name">{lightboxPhoto.guest?.name ?? 'Unknown'}</span>
      <span class="lb-time">{new Date(lightboxPhoto.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <button class="lb-close" onclick={(e) => { e.stopPropagation(); lightboxPhoto = null; }} aria-label="Close">&#10005;</button>
  </div>
{/if}

<div class="session-page">
  <header>
    <div class="container">
      {#if session}
        <h1>{session.name}</h1>
        <div class="stats">
          <span>{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
          <span class="dot"></span>
          <span>{guests.length} guest{guests.length !== 1 ? 's' : ''}</span>
        </div>
        {#if guest}
          <p class="guest-badge">Logged in as <strong>{guest.name}</strong></p>
        {/if}
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Camera
      </button>
      <button class="btn btn-secondary" onclick={openGallery}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload
      </button>
    </div>

    {#if uploading}
      <div class="container">
        <div class="upload-bar">
          <div class="upload-progress"></div>
        </div>
      </div>
    {/if}
  {/if}

  <div class="gallery container">
    {#if photos.length === 0}
      <div class="empty-gallery">
        <p>No photos yet</p>
        <p class="hint">Be the first to capture a moment!</p>
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

<style>
  .session-page {
    min-height: 100dvh;
    padding-bottom: 40px;
  }

  header {
    padding: 48px 0 12px;
    text-align: center;
  }

  header h1 {
    font-size: 26px;
    font-weight: 700;
  }

  .stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .guest-badge {
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .guest-badge strong {
    color: var(--accent);
  }

  .loading-header {
    padding: 20px 0;
    display: flex;
    justify-content: center;
  }

  .loader {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .actions {
    display: flex;
    gap: 12px;
    margin: 16px auto;
  }

  .actions .btn {
    flex: 1;
  }

  .upload-bar {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .upload-progress {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    animation: progress 1.5s ease-in-out infinite;
  }

  @keyframes progress {
    0% { width: 0%; }
    50% { width: 70%; }
    100% { width: 100%; }
  }

  .gallery {
    margin-top: 8px;
  }

  .empty-gallery {
    text-align: center;
    padding: 60px 0;
  }

  .empty-gallery p {
    color: var(--text-muted);
    font-size: 18px;
  }

  .hint {
    font-size: 14px !important;
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
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 4px;
    background: var(--bg-card);
    padding: 0;
    border: none;
    cursor: pointer;
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
    background: linear-gradient(transparent, rgba(0,0,0,0.65));
  }

  .photo-author {
    font-size: 10px;
    font-weight: 500;
    color: rgba(255,255,255,0.9);
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  /* Lightbox */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: rgba(0,0,0,0.97);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    cursor: pointer;
    outline: none;
  }

  .lightbox img {
    max-width: 92vw;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 4px;
    cursor: default;
  }

  .lightbox-info {
    display: flex;
    gap: 12px;
    margin-top: 14px;
    font-size: 14px;
    cursor: default;
  }

  .lb-name {
    color: var(--text);
    font-weight: 500;
  }

  .lb-time {
    color: var(--text-muted);
  }

  .lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 36px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .lb-nav:hover {
    background: rgba(255,255,255,0.2);
  }

  .lb-prev { left: 12px; }
  .lb-next { right: 12px; }

  .lb-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 20px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
