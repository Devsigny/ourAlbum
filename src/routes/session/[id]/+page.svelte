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
  let lastCameraUploadDone = $state(false);

  const sessionId = page.params.id;

  function getPhotoUrl(path: string) {
    return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
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
        guest = JSON.parse(stored);
      } catch {}
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

  async function uploadPhoto(file: File, fromCamera = false) {
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

      const { data: newPhoto } = await supabase.from('photos').insert({
        session_id: sessionId,
        guest_id: guest.id,
        storage_path: path
      }).select('*, guest:guests(name)').single();

      if (newPhoto && !photos.some(p => p.id === newPhoto.id)) {
        photos = [newPhoto, ...photos];
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }

    uploadCount--;
    if (uploadCount <= 0) {
      uploading = false;
      uploadCount = 0;
    }

    if (fromCamera) {
      lastCameraUploadDone = true;
      setTimeout(() => {
        lastCameraUploadDone = false;
        cameraInput?.click();
      }, 300);
    }
  }

  function handleFileSelect(e: Event, fromCamera = false) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      uploadPhoto(file, fromCamera && files.length === 1);
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
    <title>Val & Isa - Gatsby Night</title>
  {/if}
</svelte:head>

<!-- Hidden native file inputs -->
<input
  bind:this={cameraInput}
  type="file"
  accept="image/*"
  capture="environment"
  onchange={(e) => handleFileSelect(e, true)}
  hidden
/>
<input
  bind:this={galleryInput}
  type="file"
  accept="image/*"
  multiple
  onchange={(e) => handleFileSelect(e, false)}
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
        <div class="header-deco">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>
        <h1>Val & Isa</h1>
        <p class="header-subtitle">A Great Gatsby Night</p>
        <div class="stats">
          <span>{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
          <span class="dot">&#10022;</span>
          <span>{guests.length} guest{guests.length !== 1 ? 's' : ''}</span>
        </div>
        {#if guest}
          <p class="guest-badge"><strong>{guest.name}</strong></p>
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Capture
      </button>
      <button class="btn btn-secondary" onclick={openGallery}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Gallery
      </button>
    </div>

    {#if uploading}
      <div class="container">
        <div class="upload-bar">
          <div class="upload-progress"></div>
        </div>
        <p class="upload-hint">{uploadCount} uploading...</p>
      </div>
    {/if}
  {/if}

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

<style>
  .session-page {
    min-height: 100dvh;
    padding-bottom: 40px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(201, 168, 76, 0.06) 0%, transparent 50%),
      var(--bg);
  }

  header {
    padding: 40px 0 12px;
    text-align: center;
  }

  .header-deco {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .header-deco .deco-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
  }

  .header-deco .deco-diamond {
    width: 6px;
    height: 6px;
    background: var(--accent);
    transform: rotate(45deg);
  }

  header h1 {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 1px;
  }

  .header-subtitle {
    font-family: var(--font-body);
    font-size: 14px;
    font-style: italic;
    color: var(--text-muted);
    letter-spacing: 1px;
    margin-top: 2px;
  }

  .stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 10px;
    color: var(--text-muted);
    font-size: 14px;
    letter-spacing: 0.5px;
  }

  .dot {
    color: var(--accent);
    font-size: 8px;
  }

  .guest-badge {
    margin-top: 6px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .guest-badge strong {
    color: var(--accent);
    font-family: var(--font-display);
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
    margin: 16px auto;
  }

  .actions .btn {
    flex: 1;
  }

  .upload-bar {
    height: 2px;
    background: var(--border-gold);
    overflow: hidden;
    margin-bottom: 12px;
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
    margin-top: 2px;
    margin-bottom: 8px;
  }

  .gallery {
    margin-top: 8px;
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
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 2px;
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
    cursor: pointer;
    outline: none;
  }

  .lightbox img {
    max-width: 92vw;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 2px;
    cursor: default;
    border: 1px solid var(--border-gold);
  }

  .lightbox-info {
    display: flex;
    gap: 12px;
    margin-top: 14px;
    font-size: 15px;
    cursor: default;
  }

  .lb-name {
    color: var(--accent);
    font-family: var(--font-display);
    font-weight: 600;
  }

  .lb-time {
    color: var(--text-muted);
  }

  .lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(201, 168, 76, 0.1);
    border: 1px solid rgba(201, 168, 76, 0.2);
    color: var(--accent);
    font-size: 36px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .lb-nav:hover {
    background: rgba(201, 168, 76, 0.2);
    border-color: var(--accent);
  }

  .lb-prev { left: 12px; }
  .lb-next { right: 12px; }

  .lb-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(201, 168, 76, 0.1);
    border: 1px solid rgba(201, 168, 76, 0.2);
    color: var(--accent);
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
