// Takes the screenshots listed in shots.json from the real game with headless Chrome over the
// DevTools protocol (Node 22, standard library only): `node shoot.ts [path-to-chrome]`.
// Each page is game/index.html?shot=..., captured as a JPEG once the game sets window.__shotReady.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const chrome = process.argv[2] ?? process.env.CHROME ?? 'google-chrome';
const shots: { name: string; query: string }[] = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const page = pathToFileURL(join(here, 'game', 'index.html')).href;
const port = 9333;
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1280,720', '--hide-scrollbars', '--allow-file-access-from-files', '--user-data-dir=' + join(here, '.chrome-shots'), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let target: { webSocketDebuggerUrl: string } | undefined;
for (let i = 0; i < 50 && !target; i += 1) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t: { type: string }) => t.type === 'page');
  } catch {}
}
if (!target) throw new Error('chrome did not start');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(String(m.data));
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg.result ?? msg.error);
});
const send = (method: string, params: object = {}) =>
  new Promise<any>((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
mkdirSync(join(here, 'screenshots'), { recursive: true });
for (const shot of shots) {
  await send('Page.navigate', { url: page + shot.query });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i += 1) {
    await sleep(100);
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    ready = r?.result?.value === true;
  }
  if (!ready) throw new Error(`${shot.name}: the scene never became ready`);
  const jpeg = shot.name.endsWith('.jpg');
  const r = await send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 88 } : { format: 'png' });
  writeFileSync(join(here, 'screenshots', shot.name), Buffer.from(r.data, 'base64'));
  console.log('wrote', shot.name);
}
ws.close();
proc.kill();
