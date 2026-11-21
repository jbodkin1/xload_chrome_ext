/**
 * Captures the five Chrome Web Store screenshots (1280x800) from the real popup.
 *
 * The recipe is the one STORE-LISTING.md documents, so a re-capture lines up with the
 * assets already in store/:
 *
 *   640x400 viewport at deviceScaleFactor 2  ->  1280x800 raster
 *   popup zoomed to 1.1875                   ->  475x392 CSS = 950x784 device
 *   popup centred, 4 px from the top         ->  x 165..1114, y 8..791
 *
 * The popup is opened as an ordinary tab on its own chrome-extension:// URL rather than
 * through chrome.action.openPopup(), so the frame can be laid out and the wait for 120
 * samples is the only thing that has to be timed. It is the same page, same canvas and same
 * controller either way; nothing is mocked and nothing is drawn by this script.
 *
 *   node scripts/capture-screenshots.mjs                     # all five, into store/review-<date>/
 *   node scripts/capture-screenshots.mjs --only=1,3          # just those
 *   node scripts/capture-screenshots.mjs --out=/tmp/shots    # somewhere else
 *   node scripts/capture-screenshots.mjs --keep              # leave the temp profile behind
 *
 * Real `yes` processes supply the load, killed part-way through each shot so the trace has
 * rises and falls instead of a flat line. A shot is only written once the popup holds 120
 * samples, because the graph spaces points for a full window and fewer leaves the right side
 * of the plot empty.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const argValue = (name) => {
  const match = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!match) return null;
  return match.includes('=') ? match.slice(match.indexOf('=') + 1) : null;
};
const keep = args.includes('--keep');
const only = argValue('only')?.split(',').map(Number) ?? null;

const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(root, argValue('out') || `store/review-${today}`);

// Shipped files only, so the extension under test is exactly the package.
const SHIPPED = ['manifest.json', 'popup.html', 'popup.js', 'background.js', 'icon16.png', 'icon48.png', 'icon128.png'];

// The backdrops measured from the tracked assets: the light X11 desktop for the pale themes,
// near-black for the dark ones. Matching them keeps a fresh set visually interchangeable.
const LIGHT = '#e8e8ed';
const DARK = '#080b09';
const TOUR_BG = '#0d0e12';
const TOUR_TEXT = '#9aa0a6';

const SHOTS = [
  {
    n: 1,
    name: '01-hero-classic-x11',
    backdrop: LIGHT,
    config: { theme: 'classic', refreshRate: 1000, showGrid: true, scanlines: true },
    note: 'Classic X11 at 1.0s, both overlays on — the first-launch look',
  },
  {
    n: 2,
    name: '02-hacker-green-load',
    backdrop: DARK,
    config: { theme: 'matrix-green', refreshRate: 100, showGrid: true, scanlines: true },
    note: 'Hacker Green at 0.1s under load',
  },
  {
    n: 3,
    name: '03-theme-tour',
    montage: true,
    note: 'all six themes, each a real capture, 3x2 grid',
  },
  {
    n: 4,
    name: '04-dense-0.1s',
    backdrop: DARK,
    config: { theme: 'vapor-cyber', refreshRate: 100, showGrid: true, scanlines: true },
    note: 'Neon Cyberpunk at 0.1s, dense trace',
  },
  {
    n: 5,
    name: '05-scanlines-off',
    backdrop: LIGHT,
    config: { theme: 'classic', refreshRate: 1000, showGrid: true, scanlines: false },
    note: 'Classic X11 at 1.0s, scanlines off with the grid still on',
  },
];

const TOUR = [
  { theme: 'classic', label: 'CLASSIC X11' },
  { theme: 'retro-dark', label: 'PHOSPHOR SLATE' },
  { theme: 'amber-crt', label: 'AMBER MONITOR' },
  { theme: 'matrix-green', label: 'HACKER GREEN' },
  { theme: 'vapor-cyber', label: 'NEON CYBERPUNK' },
  { theme: 'mono-high', label: 'MONOCHROME' },
];

function findChrome() {
  const explicit = argValue('chrome');
  if (explicit) return explicit;
  const byPlatform = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    linux: [],
  };
  for (const candidate of byPlatform[process.platform] || []) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    try {
      return execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }).split('\n')[0].trim();
    } catch { /* keep looking */ }
  }
  return null;
}

/** Width and height from a PNG's IHDR, without decoding the image. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file}: not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    socket.onmessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result);
      }
    };
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(expression, sessionId) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
}

const chromePath = findChrome();
if (!chromePath) {
  console.error('capture: no Chrome found; pass --chrome=/path/to/chrome');
  process.exit(1);
}
console.log(`using ${chromePath}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xload-shots-'));
const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), 'xload-shots-ext-'));
for (const name of SHIPPED) fs.copyFileSync(path.join(root, name), path.join(unpacked, name));
fs.mkdirSync(outDir, { recursive: true });

const chrome = spawn(chromePath, [
  `--user-data-dir=${profile}`,
  '--enable-unsafe-extension-debugging',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-service-autorun',
  '--hide-scrollbars',
  '--headless=new',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog += chunk.toString(); });

const loadProcs = new Set();
const killLoad = () => {
  for (const proc of loadProcs) {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  }
  loadProcs.clear();
};

const cleanup = () => {
  killLoad();
  try { chrome.kill('SIGTERM'); } catch { /* already gone */ }
  if (!keep) {
    for (const dir of [profile, unpacked]) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
};

async function devToolsPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}: ${chromeLog.slice(-400)}`);
    if (fs.existsSync(file)) {
      const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
      if (port) return port;
    }
    await sleep(100);
  }
  throw new Error('Chrome never opened a DevTools port');
}

/** Layout the popup page the way the store frames it: centred, zoomed, shadow removed. */
const frameCss = (backdrop) => `
  html { background: ${backdrop} !important; overflow: hidden; display: flex; justify-content: center; align-items: flex-start; padding-top: 4px; }
  body { zoom: 1.1875; box-shadow: inset 1px 1px 0px #dfdfdf !important; }
`;

let cdp = null;
let extensionId = null;

async function openPopupPage() {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  for (const domain of ['Runtime', 'Page']) await cdp.send(`${domain}.enable`, {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 2, mobile: false }, sessionId);
  await cdp.send('Page.navigate', { url: `chrome-extension://${extensionId}/popup.html` }, sessionId);
  return { targetId, sessionId };
}

/** One 1280x800 frame of the popup with the given settings, once it holds 120 samples. */
async function capturePopups(config, backdrop, label, loadCount = 4) {
  const { targetId, sessionId } = await openPopupPage();
  await sleep(800);
  await cdp.evaluate(
    `new Promise((resolve) => chrome.storage.local.set({ config: ${JSON.stringify(config)}, history: [] }, resolve))`,
    sessionId
  );
  await cdp.send('Page.reload', {}, sessionId);
  await sleep(900);
  await cdp.evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(frameCss(backdrop))};
    document.head.appendChild(style);
    return true;
  })()`, sessionId);

  // Let the first few samples land on an idle machine, so the trace starts low and climbs
  // instead of opening with a full-scale spike that pins SCALE at 100% MAX.
  await sleep(700);
  const started = Date.now();
  // Four `yes` processes hold the box near 70%, matching the SCALE the tracked assets show;
  // dropping them in steps gives the trace a fall instead of a flat plateau pinned at 100%.
  const stops = loadCount >= 4 ? [[45, 2], [75, 1], [100, 1]] : [[45, loadCount - 1], [75, loadCount - 1]];
  let stopIndex = 0;
  for (let i = 0; i < loadCount; i++) {
    loadProcs.add(spawn('yes', [], { stdio: 'ignore' }));
    await sleep(120);
  }

  let samples = 0;
  while (samples < 120) {
    samples = await cdp.evaluate('history.length', sessionId).catch(() => 0);
    while (stopIndex < stops.length && samples >= stops[stopIndex][0]) {
      const procs = [...loadProcs].slice(0, stops[stopIndex][1]);
      for (const proc of procs) { try { proc.kill('SIGKILL'); } catch { /* gone */ } loadProcs.delete(proc); }
      stopIndex++;
    }
    if (Date.now() - started > 200000) throw new Error(`${label}: only ${samples}/120 samples after 200s`);
    if (samples < 120) await sleep(400);
  }
  killLoad();

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
  const png = Buffer.from(data, 'base64');
  // The graph rounds its scale up to the next 10%, so one 100% sample pins the readout at
  // "100% MAX". That is honest data, but a saturated frame reads as clipped; the caller can
  // use this to shoot again instead of shipping it.
  const reported = await cdp.evaluate(`(() => {
    let peak = 20;
    for (const value of history) if (value > peak) peak = value;
    return {
      newest: history[history.length - 1],
      samples: history.length,
      readout: document.getElementById('load-value').textContent,
      scale: Math.min(100, Math.ceil(peak / 10) * 10)
    };
  })()`, sessionId);
  await cdp.send('Target.closeTarget', { targetId });
  return { png, ...reported, seconds: Math.round((Date.now() - started) / 1000) };
}

function tourHtml(tiles) {
  const tileAt = (i) => ({ left: 6 + (i % 3) * 426, top: 30 + Math.floor(i / 3) * 375 });
  // Tile geometry and type metrics are measured off the tracked store/03-theme-tour.png: tiles
  // at x 6/432/858 and y 30/405, 416x343 each, header ink 289 px wide, labels ~8.5 px per
  // character. The source frame is placed at its natural 1280x800 and cut to the popup rect
  // (165, 8, 950x784) before the 0.4379 scale, so a tile is exactly the popup and no backdrop.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1280px; height: 800px; background: ${TOUR_BG}; position: relative;
           font-family: 'Courier New', Courier, monospace; font-weight: bold; color: ${TOUR_TEXT}; }
    .header { position: absolute; left: 0; top: 0; width: 1280px; height: 30px; line-height: 36px;
              text-align: center; font-size: 18px; letter-spacing: 0.047em; }
    .tile { position: absolute; width: 416px; height: 343px; overflow: hidden; }
    .tile img { display: block; width: 1280px; height: 800px; transform-origin: top left;
                transform: scale(0.4378947) translate(-165px, -8px); }
    .label { position: absolute; width: 416px; text-align: center; font-size: 14px; line-height: 1;
             letter-spacing: 0.02em; }
  </style></head><body>
    <div class="header">SIX THEMES &middot; REAL SAMPLES</div>
    ${tiles.map((tile, i) => {
      const { left, top } = tileAt(i);
      return `<div class="tile" style="left:${left}px;top:${top}px"><img src="${tile.src}"></div>
    <div class="label" style="left:${left}px;top:${top + 351}px">${tile.label}</div>`;
    }).join('\n    ')}
  </body></html>`;
}

try {
  const port = await devToolsPort();
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  cdp = new Cdp(socket);
  console.log(`connected to ${version.Browser}`);

  ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: unpacked }));
  if (!extensionId) throw new Error('Extensions.loadUnpacked returned no id');
  console.log(`extension ${extensionId}\n`);

  const wanted = SHOTS.filter((shot) => !only || only.includes(shot.n));
  const written = [];

  for (const shot of wanted) {
    process.stdout.write(`shot ${shot.n} ${shot.name} ... `);
    let result;
    if (shot.montage) {
      const tiles = [];
      const tileDir = argValue('tiles');
      if (tileDir) fs.mkdirSync(tileDir, { recursive: true });
      for (const [i, entry] of TOUR.entries()) {
        const cached = tileDir && path.join(tileDir, `${entry.theme}.png`);
        let png;
        if (cached && fs.existsSync(cached)) {
          process.stdout.write(`\n  tile ${i + 1}/6 ${entry.theme} (cached) ... `);
          png = fs.readFileSync(cached);
        } else {
          // Two `yes` processes keep the peak low enough that 0.1s sampling rarely saturates;
          // when a tile does read 100% MAX it is shot again rather than kept, because a tile
          // pegged at full scale looks clipped next to the others.
          for (let attempt = 1; ; attempt++) {
            process.stdout.write(`\n  tile ${i + 1}/6 ${entry.theme}${attempt > 1 ? ` (attempt ${attempt})` : ''} ... `);
            const { png: shot, scale } = await capturePopups(
              { theme: entry.theme, refreshRate: 100, showGrid: true, scanlines: true },
              TOUR_BG,
              `tour ${entry.theme}`,
              2
            );
            png = shot;
            process.stdout.write(`SCALE ${scale}% MAX `);
            if (scale < 100 || attempt >= 4) break;
          }
          if (cached) fs.writeFileSync(cached, png);
        }
        tiles.push({ label: entry.label, src: `data:image/png;base64,${png.toString('base64')}` });
      }
      const { targetId, sessionId } = await openPopupPage();
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp.evaluate(`document.open(); document.write(${JSON.stringify(tourHtml(tiles))}); document.close(); true`, sessionId);
      await sleep(600);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
      await cdp.send('Target.closeTarget', { targetId });
      result = { png: Buffer.from(data, 'base64'), samples: 120 * TOUR.length, seconds: 0 };
      process.stdout.write('\n  ');
    } else {
      result = await capturePopups(shot.config, shot.backdrop, shot.name);
    }

    const file = path.join(outDir, `${shot.name}.png`);
    fs.writeFileSync(file, result.png);
    const size = pngSize(file);
    const ok = size.width === 1280 && size.height === 800;
    written.push({ ...shot, file, size, ok, load: result.newest, readout: result.readout, seconds: result.seconds });
    console.log(`${ok ? 'ok' : 'WRONG SIZE'} ${size.width}x${size.height}  ${(result.png.length / 1024).toFixed(0)} KB  LOAD ${result.readout ?? '-'}`);
  }

  console.log(`\nwrote ${written.length} shot(s) to ${outDir}`);
  for (const shot of written) {
    console.log(`  ${path.basename(shot.file)}  ${shot.size.width}x${shot.size.height}  ${shot.note}`);
    if (shot.config) console.log(`      theme ${shot.config.theme}, refresh ${shot.config.refreshRate}ms, grid ${shot.config.showGrid}, scanlines ${shot.config.scanlines}, backdrop ${shot.backdrop}`);
  }
  const bad = written.filter((shot) => !shot.ok);
  if (bad.length) {
    console.error(`\n${bad.length} shot(s) are not 1280x800`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\ncapture failed: ${error.message}`);
  if (chromeLog.trim()) console.error(chromeLog.slice(-600));
  process.exitCode = 1;
} finally {
  cleanup();
}
