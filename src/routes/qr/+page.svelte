<script lang="ts">
  import { browser } from '$app/environment';
  import { PARTY_SESSION_ID } from '$lib/config';
  import QRCode from 'qrcode';

  let qrDataUrl = $state('');
  let joinUrl = $state('');

  async function generate() {
    joinUrl = `${window.location.origin}/join/${PARTY_SESSION_ID}`;
    qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 600,
      margin: 3,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    });
  }

  if (browser) generate();
</script>

<div class="print-page">
  <div class="border-outer">
    <div class="border-inner">
      <div class="corner tl"></div>
      <div class="corner tr"></div>
      <div class="corner bl"></div>
      <div class="corner br"></div>

      <div class="content">
        <div class="deco-top">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>

        <p class="prelude">You are invited to</p>
        <h1>Val & Isa</h1>
        <p class="subtitle">A Great Gatsby Night</p>

        <div class="deco-divider">
          <span class="deco-star">&#10022;</span>
        </div>

        <p class="scan-text">Scan to join the album</p>

        {#if qrDataUrl}
          <div class="qr-frame">
            <img src={qrDataUrl} alt="QR Code" />
          </div>
        {/if}

        <p class="url">{joinUrl}</p>

        <div class="deco-divider">
          <span class="deco-star">&#10022;</span>
        </div>

        <p class="tagline">Capture this evening through everyone's eyes</p>

        <div class="deco-bottom">
          <div class="deco-line"></div>
          <div class="deco-diamond"></div>
          <div class="deco-line"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @media print {
    :global(body) { background: #1a1a1a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  .print-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: #1a1a1a;
  }

  .border-outer {
    width: 100%;
    max-width: 480px;
    border: 2px solid rgba(201, 168, 76, 0.4);
    border-radius: 4px;
    padding: 12px;
  }

  .border-inner {
    border: 1px solid rgba(201, 168, 76, 0.25);
    border-radius: 2px;
    padding: 40px 32px;
    position: relative;
  }

  .corner {
    position: absolute;
    width: 16px;
    height: 16px;
  }

  .corner::before, .corner::after {
    content: '';
    position: absolute;
    background: #c9a84c;
  }

  .tl { top: -2px; left: -2px; }
  .tl::before { width: 16px; height: 2px; top: 0; left: 0; }
  .tl::after { width: 2px; height: 16px; top: 0; left: 0; }

  .tr { top: -2px; right: -2px; }
  .tr::before { width: 16px; height: 2px; top: 0; right: 0; }
  .tr::after { width: 2px; height: 16px; top: 0; right: 0; }

  .bl { bottom: -2px; left: -2px; }
  .bl::before { width: 16px; height: 2px; bottom: 0; left: 0; }
  .bl::after { width: 2px; height: 16px; bottom: 0; left: 0; }

  .br { bottom: -2px; right: -2px; }
  .br::before { width: 16px; height: 2px; bottom: 0; right: 0; }
  .br::after { width: 2px; height: 16px; bottom: 0; right: 0; }

  .content {
    text-align: center;
  }

  .deco-top, .deco-bottom {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .deco-bottom {
    margin-bottom: 0;
    margin-top: 24px;
  }

  .deco-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #c9a84c, transparent);
  }

  .deco-diamond {
    width: 8px;
    height: 8px;
    background: #c9a84c;
    transform: rotate(45deg);
  }

  .prelude {
    font-family: var(--font-body, 'Cormorant Garamond', Georgia, serif);
    font-size: 14px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #998e7e;
    margin-bottom: 8px;
  }

  h1 {
    font-family: var(--font-display, 'Playfair Display', Georgia, serif);
    font-size: 52px;
    font-weight: 800;
    color: #c9a84c;
    letter-spacing: 2px;
    margin-bottom: 4px;
  }

  .subtitle {
    font-family: var(--font-body, 'Cormorant Garamond', Georgia, serif);
    font-size: 20px;
    font-style: italic;
    color: #998e7e;
    letter-spacing: 1px;
  }

  .deco-divider {
    margin: 24px 0;
    position: relative;
  }

  .deco-divider::before {
    content: '';
    position: absolute;
    left: 15%;
    right: 15%;
    top: 50%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.3), transparent);
  }

  .deco-star {
    position: relative;
    color: #c9a84c;
    font-size: 18px;
    background: #1a1a1a;
    padding: 0 16px;
  }

  .scan-text {
    font-family: var(--font-display, 'Playfair Display', Georgia, serif);
    font-size: 16px;
    font-weight: 600;
    color: #f5f0e8;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  .qr-frame {
    display: inline-block;
    padding: 20px;
    background: #ffffff;
    border: 2px solid rgba(201, 168, 76, 0.3);
    border-radius: 8px;
  }

  .qr-frame img {
    display: block;
    width: 260px;
    height: 260px;
  }

  .url {
    font-size: 11px;
    color: #998e7e;
    margin-top: 12px;
    letter-spacing: 0.5px;
    word-break: break-all;
  }

  .tagline {
    font-family: var(--font-body, 'Cormorant Garamond', Georgia, serif);
    font-size: 16px;
    font-style: italic;
    color: #998e7e;
  }
</style>
