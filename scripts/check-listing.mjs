#!/usr/bin/env node
/**
 * Check the facts the repository's prose asserts about this repository.
 *
 *   node scripts/check-listing.mjs              # includes the HTTP link check
 *   node scripts/check-listing.mjs --offline    # skip the link check
 *
 * Two kinds of drift are caught here:
 *
 * 1. STORE-LISTING.md is written as a dashboard walkthrough, so it repeats concrete
 *    numbers — the manifest name, version and icon sizes, the summary and
 *    detailed-description lengths, the dimensions and file sizes of the store images and
 *    the contents of the release zip. Every one of those can drift silently after a
 *    version bump, a manifest edit or a re-capture.
 *
 * 2. README.md, PRIVACY.md and SECURITY.md make promises about the code itself —
 *    permissions, no network code, no background sampling, the 120-point history, the
 *    load formula, the popup size, the themes and refresh rates. Those are re-derived
 *    from manifest.json, popup.html, popup.js and background.js, so a code change that
 *    makes a document untrue fails here rather than in front of a reviewer.
 *
 * No dependencies: PNG dimensions come from the IHDR chunk, the zip is read with `unzip`,
 * and links are checked with the built-in fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const offline = process.argv.includes('--offline');
const root = process.cwd();
const failures = [];
let passes = 0;

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const kib = (file) => fs.statSync(path.join(root, file)).size / 1024;

function group(name) {
  console.log(`\n${name}`);
}

function check(label, condition, detail = '') {
  if (condition) {
    passes++;
    console.log(`ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function same(label, actual, expected) {
  const equal = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, equal, `expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
}

/** Dimensions from the PNG signature and IHDR chunk — no image library needed. */
function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const manifest = JSON.parse(read('manifest.json'));
const DOC_FILES = ['README.md', 'PRIVACY.md', 'SECURITY.md', 'STORE-LISTING.md'];
const docs = Object.fromEntries(DOC_FILES.map((file) => [file, read(file)]));
const doc = docs['STORE-LISTING.md'];

/** Fenced blocks in document order, without the fence lines and one trailing newline. */
const blocks = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));

const SHIPPED = ['manifest.json', 'popup.html', 'popup.js', 'background.js'];
const source = Object.fromEntries(SHIPPED.map((file) => [file, read(file)]));
const allSource = Object.values(source).join('\n');

// ============================================================== STORE-LISTING.md
group('STORE-LISTING.md — manifest fields');

same('name in doc matches manifest', doc.includes(`- \`name\`: \`${manifest.name}\``), true);
check(
  `name length stated as ${manifest.name.length} of 45`,
  doc.includes(`${manifest.name.length} of 45 characters`),
  'doc disagrees with manifest.name length'
);
same('version in doc matches manifest', doc.includes(`- \`version\`: \`${manifest.version}\``), true);
check('package tab quotes the same version', doc.includes(`Version shows **${manifest.version}**`), 'Package tab section');
check('checklist quotes the same version', doc.includes(`Version ${manifest.version}, exactly two permissions`), 'Before submitting checklist');

const iconSizes = Object.keys(manifest.icons);
same('icon sizes in doc match manifest', doc.includes(`- \`icons\`: ${iconSizes.join('/')} at the package root`), true);
same('icon sizes present on disk', iconSizes.every((size) => exists(manifest.icons[size])), true);
same('no 32px icon file exists', exists('icon32.png'), false);

same('declared permissions match doc', manifest.permissions.join(', '), 'system.cpu, storage');
check(
  'doc states exactly two permissions',
  doc.includes('exactly two entries: `system.cpu` and `storage`'),
  'Package tab section'
);
check('doc promises no host-permissions row', doc.includes('**No host permissions**'), 'Package tab section');

same('popup file exists', exists(manifest.action.default_popup), true);
same('service worker file exists', exists(manifest.background.service_worker), true);

group('STORE-LISTING.md — character counts');

const summary = blocks.find((b) => b.startsWith('A tiny X11-style'));
const alternative = blocks.find((b) => b.startsWith('Watch your CPU load'));
const detailed = blocks.find((b) => b.startsWith('xload is a small Chrome extension'));

check('summary block found', Boolean(summary));
check('alternative block found', Boolean(alternative));
check('detailed description block found', Boolean(detailed));

if (summary) {
  same('summary is byte-identical to manifest.description', summary, manifest.description);
  check(`summary length stated as ${summary.length}`, doc.includes(`${summary.length} characters.`), 'summary section');
  check('summary length under the 132 limit', summary.length <= 132, `${summary.length} chars`);
}
if (alternative) {
  check(`alternative length stated as ${alternative.length}`, doc.includes(`(${alternative.length} characters)`), 'summary section');
  check('alternative length under the 132 limit', alternative.length <= 132, `${alternative.length} chars`);
}
if (detailed) {
  const stated = doc.match(/This one is ([\d,]+)\./);
  const checklist = doc.match(/detailed description pasted \(([\d,]+) chars\)/);
  same('detailed length in doc', stated && Number(stated[1].replace(/,/g, '')), detailed.length);
  same('detailed length in checklist', checklist && Number(checklist[1].replace(/,/g, '')), detailed.length);
  check('detailed description under the 16,384 limit', detailed.length <= 16384, `${detailed.length} chars`);
  check('detailed description repeats the four-files claim', detailed.includes('four small files'), 'detailed description');
}

group('STORE-LISTING.md — assets');

const screenshots = ['01-hero-classic-x11.png', '02-hacker-green-load.png', '03-theme-tour.png', '04-dense-0.1s.png', '05-scanlines-off.png'];
const onDisk = fs.readdirSync(path.join(root, 'store')).filter((f) => f.endsWith('.png')).sort();
same('store holds exactly the seven assets', onDisk.length, 7);
for (const shot of screenshots) {
  const file = path.join('store', shot);
  same(`${shot} exists`, exists(file), true);
  check(`${shot} is named in the doc`, doc.includes(`\`${shot}\``), 'screenshot table');
  const size = pngSize(file);
  same(`${shot} is 1280x800`, size && `${size.width}x${size.height}`, '1280x800');
}
check('doc states five screenshots', doc.includes('five screenshots'), 'Before submitting checklist');

const tile = 'store/06-promo-tile-440x280.png';
const marquee = 'store/07-marquee-1400x560.png';
for (const [file, expected, label] of [
  [tile, { width: 440, height: 280 }, 'promo tile is 440x280'],
  [marquee, { width: 1400, height: 560 }, 'marquee is 1400x560'],
]) {
  const size = pngSize(file);
  same(label, size && `${size.width}x${size.height}`, `${expected.width}x${expected.height}`);
}
const tileKb = doc.match(/`store\/06-promo-tile-440x280\.png` \(\d+×\d+ PNG, (\d+) KB\)/);
check(`promo tile size stated as ${Math.round(kib(tile))} KB`, tileKb && Number(tileKb[1]), `${Math.round(kib(tile))} KB`);
const marqueeKb = doc.match(/`store\/07-marquee-1400x560\.png` \(\d+×\d+ PNG, (\d+) KB\)/);
check(`marquee size stated as ${Math.round(kib(marquee))} KB`, marqueeKb && Number(marqueeKb[1]), `${Math.round(kib(marquee))} KB`);

group('STORE-LISTING.md — package');

const zipName = `xload-retro-system-monitor-${manifest.version}.zip`;
const zipPath = path.join(root, zipName);
check(`package ${zipName} exists`, exists(zipName), 'run step 2 of RELEASING.md');

if (exists(zipName)) {
  const entries = execFileSync('unzip', ['-Z1', zipName], { cwd: root }).toString().trim().split('\n');
  const expected = ['manifest.json', 'popup.html', 'popup.js', 'background.js', ...iconSizes.map((s) => manifest.icons[s])];
  same('zip holds no directory entries', entries.filter((e) => e.endsWith('/')), []);
  same('zip contents', [...entries].sort(), [...expected].sort());
  same('doc states seven entries', doc.includes('seven entries'), true);
  check('doc names the package', doc.includes(zipName), 'upload step');
  const zipKb = doc.match(/this package is (\d+) KB/);
  check(`package size stated as ${Math.round(kib(zipName))} KB`, zipKb && Number(zipKb[1]), `${Math.round(kib(zipName))} KB`);

  for (const entry of expected) {
    let inside = null;
    try {
      inside = execFileSync('unzip', ['-p', zipName, entry], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    } catch {
      check(`zip entry ${entry} readable`, false, 'unzip -p failed');
      continue;
    }
    const outside = fs.readFileSync(path.join(root, entry));
    check(`zip entry ${entry} is identical to the repo file`, inside.equals(outside), 'zip is stale — rebuild it');
  }
}

// ============================================================== code invariants
group('manifest.json — what the docs say it does not ask for');

for (const key of ['host_permissions', 'content_scripts', 'web_accessible_resources', 'externally_connectable', 'optional_permissions']) {
  same(`manifest has no ${key}`, manifest[key], undefined);
}
same('manifest declares a background service worker', Boolean(manifest.background && manifest.background.service_worker), true);

group('source — no network, eval or remote code');

const banned = [
  [/\bfetch\s*\(/, 'fetch('],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bimport\s*\(/, 'dynamic import('],
  [/\brequire\s*\(/, 'require('],
];
for (const [pattern, name] of banned) {
  const hit = pattern.exec(allSource);
  check(`no ${name} in shipped code`, !hit, hit ? `found in ${SHIPPED.find((f) => pattern.test(source[f]))}` : '');
}
const remoteScript = /<script[^>]+src="(https?:|\/\/)/i.exec(source['popup.html']);
check('popup.html loads no remote script', !remoteScript, remoteScript ? remoteScript[0] : 'only packaged scripts');
same('no package.json (no dependencies or build step)', exists('package.json'), false);
same('no node_modules', exists('node_modules'), false);

group('source — storage and sampling');

check('uses chrome.storage.local', allSource.includes('chrome.storage.local'));
check('never uses chrome.storage.sync', !allSource.includes('chrome.storage.sync'));
check('only the two documented keys are read', /local\.get\(\['config', 'history'\]/.test(allSource));
check('writes only the documented keys', /local\.set\(\{ config \}/.test(allSource) && /local\.set\(\{ history \}/.test(allSource));
check('no chrome.alarms', !allSource.includes('chrome.alarms'));
check('sampling timer lives in the popup', source['popup.js'].includes('setInterval(') && !source['background.js'].includes('setInterval('));
check('background worker does not sample', !source['background.js'].includes('getInfo'));
check('background worker only seeds defaults on install', /chrome\.runtime\.onInstalled\.addListener/.test(source['background.js']));
const systemApis = [...allSource.matchAll(/chrome\.system\.(\w+)/g)].map((m) => m[1]);
same('chrome.system is only used for cpu', [...new Set(systemApis)], ['cpu']);

group('source — load maths, history and graph');

const historyPoints = Number((source['popup.js'].match(/maxDataPoints = (\d+)/) || [])[1]);
same('history length constant', historyPoints, 120);
check('load divides active ticks by total ticks', source['popup.js'].includes('activeTicksDiff / totalTicksDiff'));
check('load counts user plus kernel as active', /nowActive = pNow\.user \+ pNow\.kernel/.test(source['popup.js']));
check('load counts idle in the total', /nowTotal = pNow\.user \+ pNow\.kernel \+ pNow\.idle/.test(source['popup.js']));
check('load is clamped to 0..100', source['popup.js'].includes('Math.max(0, Math.min(100, loadPercent))'));
check('Y axis rounds up to the nearest 10%', /Math\.ceil\(maxLoadVal \/ 10\) \* 10/.test(source['popup.js']));
check('Y axis is capped at 100%', source['popup.js'].includes('if (maxLoadVal > 100) maxLoadVal = 100'));
check('canvas smoothing is off', /imageSmoothingEnabled = false/.test(source['popup.js']));
same('history only keeps the newest samples', source['popup.js'].includes('history.length > maxDataPoints) history.shift()'), true);

group('popup.html — size, themes and refresh rates');

const popupCss = source['popup.html'].match(/body\s*\{([\s\S]*?)\}/)[1];
check('popup width is 400px', /width:\s*400px/.test(popupCss));
check('popup height is 330px', /height:\s*330px/.test(popupCss));

const themeOptions = [...source['popup.html'].matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)]
  .map((m) => m[1])
  .filter((label) => !/s \(/.test(label));
const themeKeys = [...source['popup.js'].matchAll(/^\s*'([a-z-]+)':\s*\{ bg:/gm)].map((m) => m[1]);
same('theme menu holds six themes', themeOptions.length, 6);
same('theme table holds six themes', themeKeys.length, 6);
const themeNames = themeOptions.map((label) => label.replace(/\s*\([^)]*\)$/, ''));
for (const name of themeNames) {
  check(`README names the ${name} theme`, docs['README.md'].includes(name), 'theme list');
}
const intervals = [...source['popup.html'].matchAll(/<option value="(\d+)">/g)].map((m) => Number(m[1])).filter((v) => v >= 100);
const rateValues = intervals.filter((v) => [100, 500, 1000, 2000, 5000].includes(v));
same('refresh options span 0.1s to 5.0s', [Math.min(...rateValues), Math.max(...rateValues)], [100, 5000]);
check('default refresh rate is 1.0s', /refreshRate: 1000/.test(source['popup.js']) && /refreshRate: 1000/.test(source['background.js']));
check('default theme is Classic X11', /theme: 'classic'/.test(source['popup.js']));

// ============================================================== README / PRIVACY / SECURITY
group('README.md, PRIVACY.md, SECURITY.md — claims against the code');

const claims = (file, label, snippet) => {
  const haystack = docs[file].toLowerCase();
  check(`${file}: ${label}`, haystack.includes(snippet.toLowerCase()), `no "${snippet}"`);
};

for (const file of ['README.md', 'PRIVACY.md', 'SECURITY.md']) {
  claims(file, 'names system.cpu', '`system.cpu`');
  claims(file, 'names storage', '`storage`');
  claims(file, 'states the history holds 120 points', '120');
  claims(file, 'mentions the background service worker', 'service worker');
  claims(file, 'mentions chrome.storage.local', 'chrome.storage.local');
  claims(file, 'says pages cannot be read', 'host permissions');
  check(`${file}: does not revive the popup-only claim`, !docs[file].includes('runs only in its own popup'), 'says it runs only in its own popup');
}

claims('README.md', 'cites the four small files', 'four small files');
claims('README.md', 'states the popup size', '400×330');
claims('README.md', 'states the rolling history', 'rolling 120-point history');
claims('README.md', 'names the idle tick counters', 'idle tick counters');
claims('README.md', 'states the active-over-total division', 'dividing active ticks by total ticks');
claims('README.md', 'states the Y axis rounding', 'nearest 10%');
claims('README.md', 'states the Y axis cap', 'capped at 100%');
claims('README.md', 'states the refresh range floor', '0.1s (ultrafast)');
claims('README.md', 'states the refresh range ceiling', '5.0s');
claims('README.md', 'states the default refresh rate', 'defaults to 1.0s');
claims('README.md', 'states the six themes', 'six themes');
claims('README.md', 'states that no network requests are made', 'No network requests');
claims('README.md', 'states the install-time service worker', 'a service worker that seeds');
claims('README.md', 'lists the files that must be present', 'manifest.json');

claims('PRIVACY.md', 'denies fetch', 'no `fetch`');
claims('PRIVACY.md', 'names the idle counters', '`idle`');
claims('PRIVACY.md', 'says sync storage is never written', 'never written to `chrome.storage.sync`');
claims('PRIVACY.md', 'names the single purpose', 'single purpose');

claims('SECURITY.md', 'denies content scripts', 'no `content_scripts`');
claims('SECURITY.md', 'denies host permissions', 'no `host_permissions`');
claims('SECURITY.md', 'denies web accessible resources', 'no `web_accessible_resources`');
claims('SECURITY.md', 'names the idle counters', '`idle`');
claims('SECURITY.md', 'states the active-over-total division', 'divides active ticks');
claims('SECURITY.md', 'says sampling stops with the popup', 'nothing is measured while the popup is closed');

// README's install steps must name the code files it says must stay put, and the icons it
// refers to collectively must exist.
for (const file of SHIPPED) {
  check(`README mentions ${file}`, docs['README.md'].includes(file), 'installing section');
  same(`${file} exists for the install step`, exists(file), true);
}
check('README refers to the icon files in the install step', docs['README.md'].includes('icon files'), 'installing section');
for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
  same(`${file} exists for the install step`, exists(file), true);
}

group('docs — relative links resolve');

for (const [file, text] of Object.entries(docs)) {
  const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((target) => !/^(https?:|#|mailto:)/.test(target));
  for (const link of links) {
    const target = link.split('#')[0];
    if (target) same(`${file} link ${target} resolves`, exists(target), true);
  }
}

// ============================================================== links
group('links');

const urls = [...new Set(DOC_FILES.flatMap((file) => docs[file].match(/https?:\/\/[^\s`)>"]+/g) || []))];
check('docs contain links', urls.length > 0);
for (const url of ['https://github.com/jbodkin1/xload_chrome_ext', 'https://github.com/jbodkin1/xload_chrome_ext/issues']) {
  check(`docs reference ${url}`, urls.includes(url), 'Homepage/Support URLs');
}

if (offline) {
  check(`link check skipped (--offline): ${urls.length} URLs`, true);
} else {
  for (const url of urls) {
    let status = 'no response';
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      status = response.status;
    } catch (error) {
      status = error.name === 'TimeoutError' ? 'timeout' : error.message;
    }
    check(`link ${status} ${url}`, status === 200);
  }
}

// ============================================================== report
console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nThe docs disagree with the repository. Fix the doc or the file it describes, then re-run.');
  process.exit(1);
}
