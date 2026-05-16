<script lang="ts">
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase';
  import { compressImage } from '$lib/image';
  import type { Session, Guest, Photo } from '$lib/types';

  let session = $state<Session | null>(null);
  let guest = $state<Guest | null>(null);
  let photos = $state<Photo[]>([]);
  let guests = $state<Guest[]>([]);
  let uploading = $state(false);
  let showCamera = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let lightboxPhoto = $state<Photo | null>(null);

  const sessionId = page.params.id;

  function getPhotoUrl(path: string) {
    return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  async function loadData() {
    const stored = localStorage.getItem(`guest_${sessionId}`);
    if (stored) {
      guest = JSON.parse(stored);
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
          if (data) {
            photos = [data, ...photos];
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guests', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          guests = [...guests, payload.new as Guest];
        }
      )
      .subscribe();
  }

  async function uploadPhoto(file: File) {
    if (!guest) return;
    uploading = true;

    try {
      const compressed = await compressImage(file);
      const ext = 'jpg';
      const path = `${sessionId}/${Date.now()}_${guest.id.slice(0, 8)}.${ext}`;

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
    uploading = false;
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

  async function openCamera() {
    showCamera = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoEl) videoEl.srcObject = stream;
    } catch {
      showCamera = false;
    }
  }

  async function capturePhoto() {
    if (!videoEl || !stream) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d')!.drawImage(videoEl, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      closeCamera();
      await uploadPhoto(file);
    }, 'image/jpeg', 0.85);
  }

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    showCamera = false;
  }

  loadData();
  subscribeRealtime();
</script>

{#if showCamera}
  <div class="camera-overlay">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoEl} autoplay playsinline></video>
    <div class="camera-controls">
      <button class="cam-btn cancel" onclick={closeCamera}>&#10005;</button>
      <button class="cam-btn shutter" onclick={capturePhoto}></button>
      <div style="width:56px"></div>
    </div>
  </div>
{/if}

{#if lightboxPhoto}
  <div class="lightbox" onclick={() => lightboxPhoto = null} role="dialog" onkeydown={(e) => e.key === 'Escape' && (lightboxPhoto = null)}>
    <img src={getPhotoUrl(lightboxPhoto.storage_path)} alt="" />
    <div class="lightbox-info">
      <span>{lightboxPhoto.guest?.name ?? 'Unknown'}</span>
      <span>{new Date(lightboxPhoto.created_at).toLocaleTimeString()}</span>
    </div>
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
      {:else}
        <h1>Loading...</h1>
      {/if}
    </div>
  </header>

  {#if guest}
    <div class="actions container">
      <button class="btn btn-primary" onclick={openCamera}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Camera
      </button>
      <label class="btn btn-secondary upload-label">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload
        <input type="file" accept="image/*" multiple onchange={handleFileSelect} hidden />
      </label>
    </div>

    {#if uploading}
      <div class="container">
        <div class="upload-bar">
          <div class="upload-progress"></div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="container">
      <a href="/join/{sessionId}" class="btn btn-primary" style="width:100%;margin:16px 0;">
        Join to add photos
      </a>
    </div>
  {/if}

  <div class="gallery container">
    {#if photos.length === 0}
      <div class="empty-gallery">
        <p>No photos yet</p>
        <p class="hint">Be the first to capture a moment!</p>
      </div>
    {:else}
      <div class="photo-grid">
        {#each photos as photo (photo.id)}
          <button class="photo-item" onclick={() => lightboxPhoto = photo}>
            <img
              src={getPhotoUrl(photo.storage_path)}
              alt="Photo by {photo.guest?.name ?? 'guest'}"
              loading="lazy"
            />
            <div class="photo-meta">
              <span>{photo.guest?.name ?? ''}</span>
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
    padding: 48px 0 16px;
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

  .actions {
    display: flex;
    gap: 12px;
    margin: 16px auto;
  }

  .actions .btn {
    flex: 1;
  }

  .upload-label {
    cursor: pointer;
  }

  .upload-bar {
    height: 4px;
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
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
  }

  .photo-item {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-sm);
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

  .photo-item:hover img {
    transform: scale(1.05);
  }

  .photo-meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 24px 8px 8px;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    font-size: 12px;
    color: white;
  }

  /* Camera overlay */
  .camera-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: black;
    display: flex;
    flex-direction: column;
  }

  .camera-overlay video {
    flex: 1;
    object-fit: cover;
  }

  .camera-controls {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 24px;
    background: rgba(0,0,0,0.8);
  }

  .cam-btn {
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }

  .shutter {
    width: 72px;
    height: 72px;
    background: white;
    border: 4px solid var(--accent);
  }

  .shutter:active {
    transform: scale(0.9);
  }

  .cancel {
    width: 56px;
    height: 56px;
    background: rgba(255,255,255,0.15);
    color: white;
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Lightbox */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: rgba(0,0,0,0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    cursor: pointer;
  }

  .lightbox img {
    max-width: 95vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: var(--radius);
  }

  .lightbox-info {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
