// Draw the app icon and splash art into resources/ for `npx capacitor-assets generate`.
// Simple placeholder art: a ball rolls down a ramp into a row of falling
// dominoes. Swap resources/*.png for real art any time and re-run `npm run icons`.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = path.join(__dirname, '..', 'resources');
const BG = '#1a1a1a';

// Art fits the middle 60% of a 1024 square (Android's adaptive-icon safe zone).
const art = `<g transform="translate(0 30)">
  <polygon points="250,380 250,410 560,660 560,630" fill="#0077ff"/>
  <rect x="230" y="660" width="564" height="24" rx="6" fill="#3a3a3a"/>
  <circle cx="300" cy="340" r="62" fill="#e5e5e5"/>
  <rect x="610" y="480" width="34" height="180" rx="6" fill="#ff8800" transform="rotate(28 610 660)"/>
  <rect x="690" y="480" width="34" height="180" rx="6" fill="#ff8800" transform="rotate(14 690 660)"/>
  <rect x="770" y="480" width="34" height="180" rx="6" fill="#ff8800"/></g>`;

const svg = (size, withBg) => {
  const pad = (size - 1024) / 2;
  const inner = `<g transform="translate(${pad} ${pad})">${art}</g>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${withBg ? `<rect width="100%" height="100%" fill="${BG}"/>` : ''}${inner}</svg>`);
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await sharp(svg(1024, true)).flatten({ background: BG }).png().toFile(path.join(out, 'icon-only.png'));
  await sharp(svg(1024, false)).png().toFile(path.join(out, 'icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: BG } }).png().toFile(path.join(out, 'icon-background.png'));
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp(svg(2732, true)).flatten({ background: BG }).png().toFile(path.join(out, name));
  }
  console.log('resources/: icon-only, icon-foreground, icon-background, splash, splash-dark');
})();
