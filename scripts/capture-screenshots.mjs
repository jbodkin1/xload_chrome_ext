/**
 * Captures the five Chrome Web Store screenshots (1280x800), the small promo tile (440x280)
 * and the six-theme marquee (1400x560) from the real popup.
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
 *   node scripts/capture-screenshots.mjs --only=6            # just the promo tile
 *   node scripts/capture-screenshots.mjs --only=7            # just the marquee
 *   node scripts/capture-screenshots.mjs --out=/tmp/shots    # somewhere else
 *   node scripts/capture-screenshots.mjs --catalog=fr        # the French popup, into store/review-fr-<date>/
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
import { PACKAGE_FILES } from './package-files.mjs';

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
const catalog = argValue('catalog');

const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(root, argValue('out') || `store/review${catalog ? `-${catalog}` : ''}-${today}`);

// Shipped files only, so the extension under test is exactly the package. The list lives in
// scripts/package-files.mjs, shared with the build script, CI and the smoke test.
const SHIPPED = PACKAGE_FILES;

// The backdrops measured from the tracked assets: the light X11 desktop for the pale themes,
// near-black for the dark ones. Matching them keeps a fresh set visually interchangeable.
const LIGHT = '#e8e8ed';
const DARK = '#080b09';
const GRID_BG = '#0d0e12';
const GRID_TEXT = '#9aa0a6';

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
    name: '03-amber-monitor',
    backdrop: DARK,
    config: { theme: 'amber-crt', refreshRate: 500, showGrid: true, scanlines: true },
    note: 'Amber Monitor at 0.5s — the fourth theme colour, with readable readouts',
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
  {
    n: 6,
    name: '06-promo-tile-440x280',
    // The tile is the one asset with no popup chrome in it: the store shows it small, in search
    // and category placements, so it carries the graph and the name and nothing that has to be
    // read. Composed from a Hacker Green frame the same way the marquee is composed from six.
    tile: {
      width: 440,
      height: 280,
      stripHeight: 200,
      // Inside the CRT screen of a 1280x800 capture, 2:1, so 0.5:1 lands it at 440x200 with the
      // window chrome and the settings panel both out of frame.
      source: { x: 190, y: 100, width: 880, height: 400 },
      wordmark: 'xload',
      wordmarkSize: 43,
      wordmarkColor: '#ffffff',
      wordmarkTracking: '0.09em',
      tagline: 'SYSTEM MONITOR',
      taglineSize: 11,
      taglineColor: '#22c522',
      taglineTracking: '0.385em',
      taglineGap: 3,
    },
    backdrop: GRID_BG,
    config: { theme: 'matrix-green', refreshRate: 100, showGrid: true, scanlines: true },
    note: 'small promo tile: the Hacker Green graph over the wordmark bar',
  },
  {
    n: 7,
    name: '07-marquee-1400x560',
    // The six-theme grid lives here rather than in a screenshot: at 1400x560 the tiles are the
    // biggest they can be while all six fit, and the marquee is shown only to featured
    // placements, where being a palette overview is the point.
    // Tile geometry is measured off the popup in a 1280x800 capture: the graph area inside the
    // CRT screen spans x 184..1090, y 142..595 (906x453, exactly 2:1), which is cropped for the
    // tiles so the 3-wide grid can fill the full 1400 px instead of leaving ~240 px bands at
    // each side. The settings panel and its 9 px readouts are deliberately not in frame, so the
    // marquee carries no text small enough to be unreadable.
    grid: {
      width: 1400,
      height: 560,
      header: 'xload &middot; SIX THEMES &middot; REAL SAMPLES',
      headerHeight: 60,
      headerSize: 19,
      source: { x: 190, y: 100, width: 896, height: 388 },
      tileWidth: 460,
      tileHeight: 199,
      gapX: 10,
      gapY: 26,
      labelGap: 6,
      labelSize: 14,
    },
    note: 'all six themes in a 3x2 grid, for featured placement',
  },
];

const GRID_TILES = [
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
for (const name of SHIPPED) {
  const target = path.join(unpacked, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, name), target);
}

// --catalog renders another catalog by putting it where Chrome's own language looks for
// messages: the popup asks chrome.i18n, so no page script can switch the strings. The title
// bar of that catalog is read here and every frame is checked against it, so a French run
// cannot quietly write English screenshots.
let catalogMessages = null;
if (catalog) {
  const source = path.join(root, '_locales', catalog, 'messages.json');
  if (!fs.existsSync(source)) {
    console.error(`capture: no _locales/${catalog}/messages.json to render`);
    process.exit(1);
  }
  catalogMessages = JSON.parse(fs.readFileSync(source, 'utf8'));
  fs.copyFileSync(source, path.join(unpacked, '_locales', 'en', 'messages.json'));
}
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
      title: document.querySelector('.x11-title-bar div').textContent,
      lang: document.documentElement.lang,
      scale: Math.min(100, Math.ceil(peak / 10) * 10)
    };
  })()`, sessionId);
  await cdp.send('Target.closeTarget', { targetId });
  if (catalogMessages && reported.title !== catalogMessages.titleBar.message) {
    throw new Error(`${label}: the popup rendered ${JSON.stringify(reported.title)} in ${reported.lang}, not the ${catalog} catalog`);
  }
  return { png, ...reported, seconds: Math.round((Date.now() - started) / 1000) };
}

function gridHtml(spec, tiles) {
  const { width, height, header, headerHeight, headerSize, source, tileWidth, tileHeight, gapX, gapY, labelGap, labelSize } = spec;
  // Each tile is a crop of a whole 1280x800 capture, placed at its natural size and cut to the
  // source rect before scaling, so a tile contains no backdrop. Three columns with the tiles
  // sized to the remaining width: the grid is centred and lands flush at 1400 px.
  const columns = 3;
  const gridWidth = columns * tileWidth + (columns - 1) * gapX;
  const left0 = Math.round((width - gridWidth) / 2);
  const rowHeight = tileHeight + labelGap + labelSize + 2;
  const scale = tileWidth / source.width;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; background: ${GRID_BG}; position: relative;
           font-family: 'Courier New', Courier, monospace; font-weight: bold; color: ${GRID_TEXT}; }
    .header { position: absolute; left: 0; top: 0; width: ${width}px; height: ${headerHeight}px;
              line-height: ${headerHeight + 6}px; text-align: center; font-size: ${headerSize}px;
              letter-spacing: 0.047em; }
    .tile { position: absolute; width: ${tileWidth}px; height: ${tileHeight}px; overflow: hidden; }
    .tile img { display: block; width: 1280px; height: 800px; transform-origin: top left;
                transform: scale(${scale.toFixed(7)}) translate(-${source.x}px, -${source.y}px); }
    .label { position: absolute; width: ${tileWidth}px; text-align: center; font-size: ${labelSize}px;
             line-height: 1; letter-spacing: 0.02em; }
  </style></head><body>
    <div class="header">${header}</div>
    ${tiles.map((tile, i) => {
      const left = left0 + (i % columns) * (tileWidth + gapX);
      const top = headerHeight + Math.floor(i / columns) * (rowHeight + gapY);
      return `<div class="tile" style="left:${left}px;top:${top}px"><img src="${tile.src}"></div>
    <div class="label" style="left:${left}px;top:${top + tileHeight + labelGap}px">${tile.label}</div>`;
    }).join('\n    ')}
  </body></html>`;
}

/** The 440x280 tile: a graph strip cut from one capture, over the wordmark bar. */
function tileHtml(spec, png) {
  const { width, height, stripHeight, source, wordmark, wordmarkSize, wordmarkColor, wordmarkTracking, tagline, taglineSize, taglineColor, taglineTracking, taglineGap } = spec;
  const scale = width / source.width;
  const barHeight = height - stripHeight;
  // The capture is laid out at its scaled size and offset so the crop is what shows, rather
  // than a transform on a 1280-wide image, so the downscale is done by the image decoder.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; background: ${GRID_BG}; position: relative; overflow: hidden;
           font-family: 'Courier New', Courier, monospace; font-weight: bold; }
    .strip { position: absolute; left: 0; top: 0; width: ${width}px; height: ${stripHeight}px; overflow: hidden; }
    .strip img { position: absolute; display: block; width: ${Math.round(1280 * scale)}px; height: ${Math.round(800 * scale)}px;
                 left: ${-source.x * scale}px; top: ${-source.y * scale}px; }
    .bar { position: absolute; left: 0; top: ${stripHeight}px; width: ${width}px; height: ${barHeight}px;
           display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .wordmark { font-size: ${wordmarkSize}px; line-height: 1; color: ${wordmarkColor}; letter-spacing: ${wordmarkTracking}; }
    .tagline { margin-top: ${taglineGap}px; font-size: ${taglineSize}px; line-height: 1; color: ${taglineColor};
               letter-spacing: ${taglineTracking}; }
  </style></head><body>
    <div class="strip"><img src="data:image/png;base64,${png.toString('base64')}"></div>
    <div class="bar"><div class="wordmark">${wordmark}</div><div class="tagline">${tagline}</div></div>
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

  // The promo tile and the marquee carry graph crops and fixed labels rather than popup text,
  // so a catalog run shoots the five screenshots unless those two are named with --only.
  const wanted = SHOTS.filter((shot) => (only ? only.includes(shot.n) : !(catalog && (shot.tile || shot.grid))));
  const written = [];

  for (const shot of wanted) {
    process.stdout.write(`shot ${shot.n} ${shot.name} ... `);
    let result;
    if (shot.grid) {
      const tiles = [];
      const tileDir = argValue('tiles');
      if (tileDir) fs.mkdirSync(tileDir, { recursive: true });
      for (const [i, entry] of GRID_TILES.entries()) {
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
              GRID_BG,
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
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: shot.grid.width, height: shot.grid.height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp.evaluate(`document.open(); document.write(${JSON.stringify(gridHtml(shot.grid, tiles))}); document.close(); true`, sessionId);
      await sleep(600);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
      await cdp.send('Target.closeTarget', { targetId });
      result = { png: Buffer.from(data, 'base64'), samples: 120 * GRID_TILES.length, seconds: 0 };
      process.stdout.write('\n  ');
    } else if (shot.tile) {
      // Three `yes` processes give the strip a rising, falling trace rather than a flat one.
      let frame;
      for (let attempt = 1; ; attempt++) {
        if (attempt > 1) process.stdout.write(`(attempt ${attempt}) `);
        frame = await capturePopups(shot.config, GRID_BG, 'promo tile', 3);
        if (frame.scale < 100 || attempt >= 4) break;
        process.stdout.write(`SCALE ${frame.scale}% MAX, re-shooting ... `);
      }
      const { targetId, sessionId } = await openPopupPage();
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: shot.tile.width, height: shot.tile.height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp.evaluate(`document.open(); document.write(${JSON.stringify(tileHtml(shot.tile, frame.png))}); document.close(); true`, sessionId);
      await sleep(600);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
      await cdp.send('Target.closeTarget', { targetId });
      result = { png: Buffer.from(data, 'base64'), samples: frame.samples, newest: frame.newest, readout: frame.readout, seconds: frame.seconds };
    } else {
      // A frame whose peak touches 100% rounds its scale up to "100% MAX" and reads as clipped
      // next to the others, so it is shot again rather than kept. Nothing is trimmed.
      for (let attempt = 1; ; attempt++) {
        if (attempt > 1) process.stdout.write(`(attempt ${attempt}) `);
        result = await capturePopups(shot.config, shot.backdrop, shot.name);
        if (result.scale < 100 || attempt >= 4) break;
        process.stdout.write(`SCALE ${result.scale}% MAX, re-shooting ... `);
      }
    }

    const file = path.join(outDir, `${shot.name}.png`);
    fs.writeFileSync(file, result.png);
    const size = pngSize(file);
    const expect = shot.grid
      ? [shot.grid.width, shot.grid.height]
      : shot.tile
        ? [shot.tile.width, shot.tile.height]
        : [1280, 800];
    const ok = size.width === expect[0] && size.height === expect[1];
    written.push({ ...shot, file, size, ok, load: result.newest, readout: result.readout, seconds: result.seconds });
    console.log(`${ok ? 'ok' : 'WRONG SIZE'} ${size.width}x${size.height}  ${(result.png.length / 1024).toFixed(0)} KB  LOAD ${result.readout ?? '-'}`);
  }

  console.log(`\nwrote ${written.length} shot(s) to ${outDir}`);
  if (catalog) console.log(`      catalog ${catalog}: every frame shows "${catalogMessages.titleBar.message}"`);
  for (const shot of written) {
    console.log(`  ${path.basename(shot.file)}  ${shot.size.width}x${shot.size.height}  ${shot.note}`);
    if (shot.config) console.log(`      theme ${shot.config.theme}, refresh ${shot.config.refreshRate}ms, grid ${shot.config.showGrid}, scanlines ${shot.config.scanlines}, backdrop ${shot.backdrop}`);
  }
  const bad = written.filter((shot) => !shot.ok);
  if (bad.length) {
    console.error(`\n${bad.length} shot(s) are not their documented size`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\ncapture failed: ${error.message}`);
  if (chromeLog.trim()) console.error(chromeLog.slice(-600));
  process.exitCode = 1;
} finally {
  cleanup();
}
