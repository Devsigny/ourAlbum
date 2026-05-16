import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, 'icon-source.svg');
const staticDir = join(__dirname, '..', 'static');

const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon.png', size: 32 },
  { name: 'icon-72.png', size: 72 },
  { name: 'icon-96.png', size: 96 },
  { name: 'icon-128.png', size: 128 },
  { name: 'icon-144.png', size: 144 },
  { name: 'icon-152.png', size: 152 },
  { name: 'icon-167.png', size: 167 },
  { name: 'icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-256.png', size: 256 },
  { name: 'icon-384.png', size: 384 },
  { name: 'icon-512.png', size: 512 },
];

// Maskable icon (with extra padding for safe zone)
const maskableSizes = [
  { name: 'icon-maskable-192.png', size: 192 },
  { name: 'icon-maskable-512.png', size: 512 },
];

async function generateIcons() {
  // Standard icons
  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(staticDir, name));
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Maskable icons (add 20% padding with background fill for safe area)
  for (const { name, size } of maskableSizes) {
    const innerSize = Math.round(size * 0.7);
    const padding = Math.round((size - innerSize) / 2);

    const innerIcon = await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 15, g: 15, b: 15, alpha: 1 }
      }
    })
      .composite([{ input: innerIcon, left: padding, top: padding }])
      .png()
      .toFile(join(staticDir, name));

    console.log(`Generated ${name} (${size}x${size}, maskable)`);
  }

  // Generate ICO-style favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(join(staticDir, 'favicon.png'));

  // Apple splash screens (common sizes)
  const splashes = [
    { name: 'splash-1170x2532.png', w: 1170, h: 2532 },
    { name: 'splash-1284x2778.png', w: 1284, h: 2778 },
    { name: 'splash-750x1334.png', w: 750, h: 1334 },
    { name: 'splash-1125x2436.png', w: 1125, h: 2436 },
  ];

  for (const { name, w, h } of splashes) {
    const iconSize = Math.round(Math.min(w, h) * 0.3);
    const icon = await sharp(svgBuffer).resize(iconSize, iconSize).png().toBuffer();

    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 }
      }
    })
      .composite([{
        input: icon,
        left: Math.round((w - iconSize) / 2),
        top: Math.round((h - iconSize) / 2 - h * 0.05)
      }])
      .png()
      .toFile(join(staticDir, name));

    console.log(`Generated ${name} (${w}x${h})`);
  }

  console.log('\nAll icons generated!');
}

generateIcons().catch(console.error);
