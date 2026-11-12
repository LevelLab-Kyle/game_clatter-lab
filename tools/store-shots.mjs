// Store screenshots of the web build in headless Chrome via CDP.
// usage: node tools/store-shots.mjs <www dir> <out dir> <device> [light|dark]  (device: a key of DEVICES)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [www, outDir, device, theme = 'light'] = process.argv.slice(2);
const DEVICES = {
  phone: { width: 440, height: 956, dpr: 3, mobile: true },        // 1320x2868 (6.9")
  'phone-land': { width: 874, height: 402, dpr: 3, mobile: true },   // 2622x1206 (6.3")
  'phone-port': { width: 402, height: 874, dpr: 3, mobile: true },   // 1206x2622 (6.3")
  tablet: { width: 1032, height: 1376, dpr: 2, mobile: true },     // 2064x2752 (13")
  'tablet-land': { width: 1376, height: 1032, dpr: 2, mobile: true },
  'play-phone': { width: 960, height: 540, dpr: 2, mobile: true },   // 1920x1080
  'play-tablet': { width: 1280, height: 720, dpr: 2, mobile: true }, // 2560x1440
  'play-phone-port': { width: 540, height: 960, dpr: 2, mobile: true },   // 1080x1920
  'play-tablet-port': { width: 720, height: 1280, dpr: 2, mobile: true }, // 1440x2560
};
const dev = DEVICES[device];
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(outDir, '.prof-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--allow-file-access-from-files', '--use-angle=metal', '--enable-gpu', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error('eval error:', expr, JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${device}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('saved', `${device}-${name}.png`);
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr, mobile: dev.mobile });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
await send('Page.navigate', { url: 'file://' + path.resolve(www, 'index.html') });
await sleep(4000);

// Upright screens get tall machines (store-scenes-portrait.json); wide ones the wide set.
const scenesFile = dev.height > dev.width ? 'store-scenes-portrait.json' : 'store-scenes.json';
const scenes = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), scenesFile), 'utf8'));
for (const s of scenes) {
  for (const step of s.steps) {
    if (step.js) await evaluate(step.js);
    if (step.wait) await sleep(step.wait);
  }
  await shot(s.name);
}
ws.close(); chrome.kill();
await sleep(1000); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
