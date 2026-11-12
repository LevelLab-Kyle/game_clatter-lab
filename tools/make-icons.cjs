// Turn resources/icon-art.png (drawn by tools/render-icon.mjs with the game's own
// renderer) into the inputs for `npx capacitor-assets generate`, plus the
// Play Store icon and feature graphic in build/store/.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const out = path.join(root, 'resources');
const store = path.join(root, 'build', 'store');
const art = path.join(out, 'icon-art.png');
const BG = '#1a1a1a';
const SKY = '#cfe6fb';

const roundIcon = (size) => sharp(art).resize(size, size)
  .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="#fff"/></svg>`), blend: 'dest-in' }])
  .png().toBuffer();

(async () => {
  if (!fs.existsSync(art)) throw new Error('resources/icon-art.png is missing: run node tools/render-icon.mjs');
  // iOS and the legacy Android icon use the art as is. The Android adaptive icon
  // uses it as a full-bleed foreground (its corners fall outside every mask).
  await sharp(art).resize(1024, 1024).flatten({ background: SKY }).png().toFile(path.join(out, 'icon-only.png'));
  await sharp(art).resize(1024, 1024).png().toFile(path.join(out, 'icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: SKY } }).png().toFile(path.join(out, 'icon-background.png'));

  // Splash: the rounded icon in the middle of the dark app background.
  const mid = await roundIcon(800);
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } })
      .composite([{ input: mid, left: 966, top: 966 }]).png().toFile(path.join(out, name));
  }
  console.log('resources/: icon-only, icon-foreground, icon-background, splash, splash-dark');

  // Web: rounded tab icons, and a square home-screen icon (iOS rounds its own corners).
  const web = path.join(root, 'assets', 'icons');
  fs.mkdirSync(web, { recursive: true });
  for (const size of [32, 192]) await sharp(await roundIcon(size)).png().toFile(path.join(web, `favicon-${size}.png`));
  await sharp(art).resize(180, 180).flatten({ background: SKY }).png().toFile(path.join(web, 'apple-touch-icon.png'));
  console.log('assets/icons/: favicon-32, favicon-192, apple-touch-icon');

  // Play Store art: 512 icon, and a 1024x500 feature graphic (needs a store screenshot).
  fs.mkdirSync(store, { recursive: true });
  await sharp(art).resize(512, 512).png().toFile(path.join(store, 'play-icon-512.png'));
  const shotPath = path.join(store, 'play-tablet-3-domino-play.png');
  if (fs.existsSync(shotPath)) {
    const shot = await sharp(shotPath).resize(560, 315).png().toBuffer();
    const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
      <rect width="1024" height="500" fill="${BG}"/>
      <rect x="434" y="156" width="570" height="325" rx="10" fill="#3a3a3a"/>
      <text x="719" y="118" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="76" fill="#e5e5e5">Clatter Lab</text></svg>`);
    await sharp(frame).composite([
      { input: await roundIcon(340), left: 50, top: 80 },
      { input: shot, left: 439, top: 161 },
    ]).png().toFile(path.join(store, 'play-feature-1024x500.png'));
  }
  console.log('build/store/: play-icon-512' + (fs.existsSync(shotPath) ? ', play-feature-1024x500' : ''));
})();
