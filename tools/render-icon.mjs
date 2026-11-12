// Render the app icon art with the game's own renderer (headless Chrome, UI hidden):
// a ball, a falling row of dominoes and the star, on the game's sky and grass.
// usage: node tools/render-icon.mjs [www dir=www] [out=resources/icon-art.png] [size=1024]
// Then npm run icons. Build www first (npm run www) so the art matches the game.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [www = 'www', outFile = 'resources/icon-art.png', size = '1024'] = process.argv.slice(2);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-prof-'));
const port = 9700 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--use-angle=metal', '--enable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +size / 2, height: +size / 2, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'file://' + path.resolve(www, 'index.html') });
await sleep(4000);
const info = await ev(`(() => {
  const s = document.createElement('style');
  s.textContent = '#topbar,#tray,#view-tools,#run-tools,#item-tools,#play-badge,#toast,#coach,#hint,#win-card,#locked-tag,#loader{display:none!important}' +
    '#app{display:block!important;height:100vh!important}#stage{position:fixed!important;inset:0!important}#stage::after{display:none!important}#scene{width:100vw!important;height:100vh!important}';
  document.head.appendChild(s);
  document.getElementById('mode-sandbox').click();
  EXAMPLES.__icon = { items: [['ball', 0.4, 0], ['domino', 1.6, 0], ['domino', 2.6, 0], ['domino', 3.6, 0], ['domino', 4.6, 0], ['star', 3.6, 2.2]] };
  loadExample('__icon');
  return 'ok';
})()`);
await sleep(1200);
// Frame: 5.5 units wide, the grass the bottom quarter. Tilt the dominoes like a falling row.
const pose = `(() => {
  const W = 5.5, cv = document.getElementById('scene');
  const zoom = cv.clientWidth / (PX_PER_UNIT * W), H = cv.clientHeight / (PX_PER_UNIT * zoom);
  viewSnap = null; Object.assign(view, { cx: 0 + W / 2, cy: -1.4 + H / 2, zoom });
  backdrop.material.uniforms.uGrid = { get value() { return 0; }, set value(v) {} }; // no edit grid
  const doms = [...items.values()].filter((i) => i.type === 'domino').sort((a, b) => a.x - b.x);
  const tilt = [58, 40, 22, 4];
  doms.forEach((d, k) => {
    placeMesh(d);
    const m = d.mesh, a = -tilt[k] * Math.PI / 180;
    const px = m.position.x + 0.125, py = m.position.y - 0.75; // bottom-right corner
    const dx = m.position.x - px, dy = m.position.y - py;
    m.position.x = px + dx * Math.cos(a) - dy * Math.sin(a);
    m.position.y = py + dx * Math.sin(a) + dy * Math.cos(a);
    m.rotation.z = a;
  });
  // A sky gradient instead of the game's flat sky: deeper blue up top, the game's sky by the grass.
  if (!scene.background?.isTexture) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#7dbdf2'); grad.addColorStop(0.75, '#cfe6fb'); grad.addColorStop(1, '#e3f1fd');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  const star = [...items.values()].find((i) => i.type === 'star'); if (star) { star.mesh.rotation.z = -0.2; star.mesh.scale.setScalar(1.35); eachMesh(star.mesh, (m) => m.material.emissive?.set(0x8a5c00)); }
})()`;
await ev(pose); await sleep(500); await ev(pose); await sleep(300);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(outFile, Buffer.from(r.result.data, 'base64'));
ws.close(); chrome.kill(); await sleep(800); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
console.log('saved', outFile);
