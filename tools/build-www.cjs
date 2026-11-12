// Copy the game's runtime files into www/ for Capacitor (npx cap sync).
// Same file set /deploy uploads, taken from the working tree so local
// changes show up in the app. `--ref <commit>` takes them from that commit
// instead (store builds use `--ref HEAD`, leaving uncommitted edits out). The ?v=__VERSION__ cache busters are stripped:
// app files ship inside the bundle, so there's no browser cache to bust.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const refArg = process.argv.indexOf('--ref');
const ref = refArg > 0 ? process.argv[refArg + 1] : null;

const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 });
const list = (dir) => ref
  ? git('ls-tree', '--name-only', `${ref}:${dir}`).toString().split('\n').filter(Boolean)
  : fs.readdirSync(path.join(root, dir));
const read = (f) => ref ? git('show', `${ref}:${f}`) : fs.readFileSync(path.join(root, f));

const files = [
  'index.html',
  'vendor/libs.js',
  'assets/sounds.js',
  ...list('src')
    .filter((f) => f.endsWith('.js') || f === 'style.css')
    .map((f) => 'src/' + f),
  ...list('assets/fonts')
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => 'assets/fonts/' + f),
];

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, read(f));
}

const indexPath = path.join(out, 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace(/\?v=__VERSION__/g, ''));

console.log(`www/: ${files.length} files from ${ref || 'the working tree'}`);
