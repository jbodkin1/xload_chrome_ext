#!/usr/bin/env node
/**
 * Load the release package into a throwaway Chrome profile and use it the way a reviewer
 * would: open the popup from the toolbar action, watch it draw, change a setting, reload,
 * then read Chrome's own error record for the extension.
 *
 *   node scripts/smoke.mjs                  # headless, the default
 *   node scripts/smoke.mjs --headed         # watch it happen
 *   node scripts/smoke.mjs --keep           # leave the profile behind for poking at
 *   node scripts/smoke.mjs --lang=fr        # ask for a browser UI language (Linux, Windows)
 *   node scripts/smoke.mjs --catalog=fr     # render the French catalog on any platform
 *   node scripts/smoke.mjs --zip=... --chrome=...
 *
 * It answers the question the docs cannot: does the thing in the zip actually run? The
 * checker proves the files and the prose agree; this proves Chrome can load them, draw the
 * popup, keep a setting across a reload, and do it all without logging an error. Needs a
 * Chrome or Chromium install and the versioned zip from RELEASING.md step 2.
 *
 * No dependencies: the zip is read here, and the browser is driven over the DevTools
 * protocol with Node's own WebSocket.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PACKAGE_FILES, packageFileName } from './package-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const keep = args.includes('--keep');
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
// Pin the browser language, so the same run can be repeated against another catalog.
const lang = argValue('lang');
// Render another catalog without changing the browser's own language.
const catalogOverride = argValue('catalog');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
let passes = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? passes++ : failures.push(label);
  return ok;
}

// ------------------------------------------------------------------ the package

/** Minimal ZIP reader: central directory + stored/deflated entries, no zip64. */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error(`${file} is not a zip file`);
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error('unreadable central directory');
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const zipPath = path.resolve(root, argValue('zip') || packageFileName(manifest.version));

if (!fs.existsSync(zipPath)) {
  console.error(`No package at ${path.relative(root, zipPath)}. Build it first — RELEASING.md step 2.`);
  process.exit(2);
}

let entries;
try {
  entries = readZip(zipPath);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const names = entries.map((entry) => entry.name).sort();
check(
  `package holds the ${PACKAGE_FILES.length} shipped files`,
  JSON.stringify(names) === JSON.stringify([...PACKAGE_FILES].sort()),
  names.join(' ')
);
check('manifest.json sits at the package root', names.includes('manifest.json'));

const sha = (data) => createHash('sha256').update(data).digest('hex');
const stale = entries.filter((entry) => {
  const inRepo = path.join(root, entry.name);
  return !fs.existsSync(inRepo) || sha(fs.readFileSync(inRepo)) !== sha(entry.data);
});
// A stale zip would smoke-test code that is not in the repository, and pass.
check('every entry matches the repository file', stale.length === 0, `differs: ${stale.map((e) => e.name).join(', ')}`);

// ------------------------------------------------------------------ the browser

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

const chromePath = findChrome();
if (!check('Chrome is installed', Boolean(chromePath), 'nothing found; pass --chrome=/path/to/chrome')) {
  console.log(`\n${passes} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`      using ${chromePath}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xload-smoke-'));
// chrome.i18n resolves extension messages against Chrome's application locale, which on macOS
// comes from the profile rather than --lang: writing it before launch is what makes a French
// run French instead of English with a French flag.
if (lang) {
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ intl: { app_locale: lang } }));
}
const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), 'xload-smoke-ext-'));
for (const entry of entries) {
  const target = path.join(unpacked, entry.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, entry.data);
}
// --catalog puts another catalog where Chrome's own language looks for messages, so the
// translation is exercised through the same lookup the popup uses on any platform. It is a
// harness for the strings, not a substitute for --lang where the OS honours it.
if (catalogOverride) {
  fs.copyFileSync(
    path.join(unpacked, '_locales', catalogOverride, 'messages.json'),
    path.join(unpacked, '_locales', 'en', 'messages.json')
  );
}

const chromeArgs = [
  `--user-data-dir=${profile}`,
  '--enable-unsafe-extension-debugging',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-service-autorun',
  '--window-size=900,700',
  // --lang sets the UI language on Linux and Windows; on macOS the app takes it from the
  // bundle's NSLocale, which a directly-launched binary reads from -AppleLanguages.
  ...(lang ? ['--lang=' + lang, ...(process.platform === 'darwin' ? [`-AppleLanguages=(${lang})`] : [])] : []),
  ...(headed ? [] : ['--headless=new']),
  'about:blank',
];
const chrome = spawn(chromePath, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog += chunk.toString(); });

const cleanup = () => {
  try { chrome.kill('SIGTERM'); } catch { /* already gone */ }
  if (!keep) {
    for (const dir of [profile, unpacked]) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
};

const watchdog = setTimeout(() => {
  console.error('smoke: timed out after 90s');
  cleanup();
  process.exit(1);
}, 90000);
watchdog.unref();

async function devToolsPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`);
    if (fs.existsSync(file)) {
      const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
      if (port) return port;
    }
    await sleep(100);
  }
  throw new Error('Chrome never opened a DevTools port');
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    socket.onmessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result);
      } else if (payload.method) {
        this.events.push(payload);
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

  /** Console errors and uncaught exceptions seen so far, from any attached session. */
  problems() {
    return this.events.flatMap((event) => {
      if (event.method === 'Runtime.exceptionThrown') {
        return [`EXCEPTION: ${event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text}`];
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        return [`console.error: ${event.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`];
      }
      if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
        return [`log.error [${event.params.entry.source}]: ${event.params.entry.text}`];
      }
      return [];
    });
  }
}

let cdp = null;
try {
  const port = await devToolsPort();
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  check('Chrome answers the DevTools protocol', Boolean(version.webSocketDebuggerUrl));
  console.log(`      ${version.Browser}`);

  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  cdp = new Cdp(socket);

  const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: unpacked });
  check('the package loads as an extension', Boolean(extensionId), 'Extensions.loadUnpacked returned no id');
  console.log(`      id ${extensionId}`);

  let worker = null;
  for (let i = 0; i < 20 && !worker; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.includes(extensionId));
    if (!worker) await sleep(250);
  }
  check('the service worker starts', Boolean(worker), 'no service_worker target for the extension');

  let workerSession = null;
  if (worker) {
    workerSession = (await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true })).sessionId;
    await cdp.send('Runtime.enable', {}, workerSession);
    await cdp.send('Log.enable', {}, workerSession);
  }

  // The toolbar button itself is browser chrome and cannot be clicked from here; this is the
  // API the button calls, and it opens the same anchored popup window.
  const opened = workerSession
    ? await cdp.evaluate(
      `chrome.action.openPopup().then(() => 'opened').catch((error) => 'error: ' + error.message)`,
      workerSession
    ).catch((error) => `threw: ${error.message}`)
    : 'no service worker to call it from';
  check('the toolbar action opens a popup', opened === 'opened', opened);

  let popup = null;
  for (let i = 0; i < 24 && !popup; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    popup = targetInfos.find((target) => target.url.startsWith(`chrome-extension://${extensionId}/popup.html`) && target.type !== 'service_worker');
    if (!popup) await sleep(250);
  }
  check('the popup is the extension\'s own page', Boolean(popup), 'no popup.html target appeared');

  if (popup) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: popup.targetId, flatten: true });
    for (const domain of ['Runtime', 'Log', 'Page', 'Console']) await cdp.send(`${domain}.enable`, {}, sessionId);

    // Reload after attaching, so the first paint happens inside the window where console
    // events are recorded — otherwise an error thrown while the popup built itself is unseen.
    await cdp.send('Page.reload', {}, sessionId);
    await sleep(2600);

    const shape = await cdp.evaluate(`(() => {
      const canvas = document.getElementById('xload-canvas');
      const box = canvas.getBoundingClientRect();
      return { inner: [innerWidth, innerHeight], canvas: { css: [Math.round(box.width), Math.round(box.height)], backing: [canvas.width, canvas.height] } };
    })()`, sessionId);
    check('the popup is the documented 400x330', shape.inner[0] === 400 && shape.inner[1] === 330, JSON.stringify(shape.inner));
    check('the canvas has a drawing surface', shape.canvas.backing[0] > 0 && shape.canvas.backing[1] > 0, JSON.stringify(shape.canvas));

    // `history`, `config` and `themes` are top-level bindings in the popup's classic script, so
    // the probe asks the page what it believes it is drawing instead of hard-coding a colour.
    // Counting the theme's line colour is what separates a real trace from grid lines on an
    // otherwise blank canvas, which is all an ink test can see.
    const canvasState = `(() => {
      const canvas = document.getElementById('xload-canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let line = '#ff0000';
      try { line = themes[config.theme].line; } catch { /* the script did not run */ }
      const [lr, lg, lb] = [1, 3, 5].map((i) => parseInt(line.slice(i, i + 2), 16));
      let ink = 0;
      let trace = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== pixels[i + 3] || pixels[i + 1] || pixels[i + 2]) ink++;
        if (Math.abs(pixels[i] - lr) < 40 && Math.abs(pixels[i + 1] - lg) < 40 && Math.abs(pixels[i + 2] - lb) < 40) trace++;
      }
      const samples = typeof history === 'undefined' ? -1 : history.length;
      return {
        inkRatio: ink / (pixels.length / 4),
        trace,
        line,
        samples,
        newest: samples > 0 ? history[samples - 1] : null,
        readout: document.getElementById('load-value').textContent
      };
    })()`;

    const first = await cdp.evaluate(canvasState, sessionId);
    check('the graph is drawn', first.inkRatio > 0.01, `${(first.inkRatio * 100).toFixed(1)}% of the canvas has ink`);
    check('the trace is drawn in the theme colour', first.trace > 0, `${first.trace} pixels near ${first.line}`);

    // The readout is localized, so the expected string comes from the message the popup
    // itself used: chrome.i18n in the page, with the sample formatted the same way.
    const expectedLoad = first.newest === null
      ? null
      : await cdp.evaluate(
        `chrome.i18n.getMessage('loadPercent', [${JSON.stringify(first.newest.toFixed(2))}])`,
        sessionId
      );
    check(
      'the load readout quotes the newest sample',
      expectedLoad !== null && first.readout === expectedLoad,
      `${JSON.stringify(first.readout)} against ${JSON.stringify(expectedLoad)} for sample ${first.newest}`
    );

    const browserLang = await cdp.evaluate('document.documentElement.lang', sessionId);
    if (lang && !browserLang.toLowerCase().startsWith(lang.toLowerCase())) {
      console.log(`skip  the browser runs in ${browserLang}; --lang only changes that on Linux and Windows — use --catalog=${lang} to render a catalog here`);
    }
    const rendered = catalogOverride || (lang && browserLang.toLowerCase().startsWith(lang.toLowerCase()) ? lang : null);

    if (rendered) {
      const catalog = JSON.parse(fs.readFileSync(path.join(root, '_locales', rendered, 'messages.json'), 'utf8'));
      const ui = await cdp.evaluate(`(() => {
        const strip = (s) => [...s].filter((c) => !'0123456789.%'.includes(c)).join('').trim();
        return {
          lang: document.documentElement.lang,
          title: document.querySelector('.x11-title-bar div').textContent,
          firstTheme: document.querySelector('#theme-select option').textContent,
          loadLabel: strip(document.getElementById('load-value').textContent),
          empty: [...document.querySelectorAll('[data-i18n]')].filter((el) => !el.textContent.trim()).length
        };
      })()`, sessionId);
      if (lang && !catalogOverride) {
        check(`the popup follows the browser language (${lang})`, ui.lang.toLowerCase().startsWith(lang.toLowerCase()), `html lang is ${JSON.stringify(ui.lang)}`);
      }
      check(`the title bar is in ${rendered}`, ui.title === catalog.titleBar.message, `${JSON.stringify(ui.title)} against the ${rendered} catalog`);
      check(`the theme menu is in ${rendered}`, ui.firstTheme === catalog.themeClassic.message, `${JSON.stringify(ui.firstTheme)} against the ${rendered} catalog`);
      check(`the status bar is in ${rendered}`, ui.loadLabel === catalog.loadPercent.message.split('$')[0].trim(), `${JSON.stringify(ui.loadLabel)} against the ${rendered} catalog`);
      check('every message key in the popup resolved', ui.empty === 0, `${ui.empty} element(s) left empty`);
    }

    // The memory readout is checked against the API rather than a fixed number: the percentage
    // moves with whatever else is running, so the assertion is that it is a sane percentage of
    // the reported capacity, within a few points of the current value.
    const memoryState = await cdp.evaluate(`new Promise((resolve) => {
      chrome.system.memory.getInfo((info) => {
        resolve({
          shown: document.getElementById('memory-value').textContent,
          current: Math.round(((info.capacity - info.availableCapacity) / info.capacity) * 100),
          capacity: info.capacity
        });
      });
    })`, sessionId);
    // The label is localized; the number is not. The percentage can move between the popup's
    // sample and this one, so the label is matched exactly and the number only approximately.
    const shownPercent = Number((memoryState.shown.match(/(\d{1,3})%/) || [])[1]);
    const memoryLabel = await cdp.evaluate(`(() => {
      const strip = (s) => [...s].filter((c) => !'0123456789.%'.includes(c)).join('').trim();
      return strip(chrome.i18n.getMessage('memoryPercent', ['0']));
    })()`, sessionId);
    const shownLabel = [...memoryState.shown].filter((c) => !'0123456789.%'.includes(c)).join('').trim();
    check(
      'the memory readout uses the localized label',
      shownLabel === memoryLabel,
      `${JSON.stringify(memoryState.shown)} against ${JSON.stringify(memoryLabel)}`
    );
    check(
      'the memory readout is a percentage of system RAM',
      Number.isFinite(shownPercent) && Math.abs(shownPercent - memoryState.current) <= 3,
      `${JSON.stringify(memoryState.shown)} against ${memoryState.current}% of ${memoryState.capacity} bytes`
    );

    await sleep(3000);
    const grown = await cdp.evaluate(canvasState, sessionId);
    check('samples keep arriving while the popup is open', grown.samples > first.samples, `${first.samples} → ${grown.samples}`);
    check('the trace extends with the samples', grown.trace > first.trace, `${first.trace} → ${grown.trace} pixels in the theme colour`);

    await cdp.evaluate(`(() => {
      const theme = document.getElementById('theme-select');
      theme.value = 'matrix-green';
      theme.dispatchEvent(new Event('change', { bubbles: true }));
      const scanlines = document.getElementById('scanlines-toggle');
      scanlines.checked = false;
      scanlines.dispatchEvent(new Event('change', { bubbles: true }));
      const rate = document.getElementById('interval-select');
      rate.value = '500';
      rate.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`, sessionId);
    await sleep(1200);
    const saved = await cdp.evaluate(`new Promise((resolve) => chrome.storage.local.get(['config'], resolve))`, sessionId);
    check(
      'a changed setting is written to storage',
      saved.config?.theme === 'matrix-green' && saved.config?.scanlines === false && saved.config?.refreshRate === 500,
      JSON.stringify(saved.config)
    );

    await cdp.send('Page.reload', {}, sessionId);
    await sleep(1800);
    const restored = await cdp.evaluate(`(() => {
      const stored = document.getElementById('theme-select').value;
      const scanlines = document.getElementById('scanlines-toggle').checked;
      const rate = document.getElementById('interval-select').value;
      return { theme: stored, scanlines, rate };
    })()`, sessionId);
    check(
      'the setting survives a reload',
      restored.theme === 'matrix-green' && restored.scanlines === false && restored.rate === '500',
      JSON.stringify(restored)
    );

    await sleep(400);
    const popupProblems = cdp.problems();
    check('the popup logs no errors', popupProblems.length === 0, popupProblems.join(' | '));
  }

  // Chrome's own record: this is what the Errors button on chrome://extensions reads.
  const internals = await cdp.send('Target.createTarget', { url: 'chrome://extensions-internals/' });
  const internalsSession = (await cdp.send('Target.attachToTarget', { targetId: internals.targetId, flatten: true })).sessionId;
  await cdp.send('Runtime.enable', {}, internalsSession);
  await sleep(1500);
  const record = JSON.parse(await cdp.evaluate('document.body.innerText', internalsSession));
  const mine = record.find((item) => item.id === extensionId);
  check('Chrome has a record of the extension', Boolean(mine), 'not in chrome://extensions-internals');
  if (mine) {
    check('no manifest errors', (mine.manifest_errors || []).length === 0, JSON.stringify(mine.manifest_errors));
    check('no install warnings', (mine.install_warnings || []).length === 0, JSON.stringify(mine.install_warnings));
    check('no runtime errors', (mine.runtime_errors || []).length === 0, JSON.stringify(mine.runtime_errors));
    const apis = [...(mine.permissions?.active?.api || [])].sort();
    check(
      'the only API permissions are storage, system.cpu and system.memory',
      JSON.stringify(apis) === JSON.stringify(['storage', 'system.cpu', 'system.memory']),
      apis.join(', ')
    );
    const hosts = [
      ...(mine.permissions?.active?.explicit_hosts || []),
      ...(mine.permissions?.active?.scriptable_hosts || []),
    ];
    check('no host permissions are granted', hosts.length === 0, hosts.join(', '));
  }

  cdp.socket.close();
} catch (error) {
  console.error(`\nsmoke: ${error.message}`);
  if (chromeLog.trim()) console.error(chromeLog.split('\n').slice(-8).join('\n'));
  failures.push('the run completed');
} finally {
  clearTimeout(watchdog);
  cleanup();
  if (keep) console.log(`\nprofile kept at ${profile}`);
}

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) console.error('\nThe release package does not behave as the docs describe it.');
process.exit(failures.length ? 1 : 0);
