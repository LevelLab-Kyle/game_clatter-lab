// Copy the game's runtime files into www/ for Capacitor (npx cap sync).
// Same file set /deploy uploads, taken from the working tree so local
// changes show up in the app. The ?v=__VERSION__ cache busters are stripped:
// app files ship inside the bundle, so there's no browser cache to bust.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

const files = [
  'index.html',
  'vendor/libs.js',
  'assets/sounds.js',
  ...fs.readdirSync(path.join(root, 'src'))
    .filter((f) => f.endsWith('.js') || f === 'style.css')
    .map((f) => 'src/' + f),
  ...fs.readdirSync(path.join(root, 'assets/fonts'))
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => 'assets/fonts/' + f),
];

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, f), dest);
}

const indexPath = path.join(out, 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace(/\?v=__VERSION__/g, ''));

console.log(`www/: ${files.length} files`);
