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
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { PACKAGE_FILES, packageFileName } from './package-files.mjs';

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

/**
 * Whether every pixel is fully opaque, which the store requires so an image cannot composite
 * against its own background. A colour type with no alpha channel is opaque by construction;
 * RGBA is decoded and its alpha bytes scanned, so a file that merely *has* an alpha channel but
 * paints 255 everywhere still passes.
 */
function pngOpaque(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return { ok: false, why: 'no IHDR chunk' };
  // IHDR payload: width 16..20, height 20..24, bit depth 24, colour type 25, interlace 28.
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (bitDepth !== 8) return { ok: false, why: `bit depth ${bitDepth}` };
  if (interlace !== 0) return { ok: false, why: 'interlaced PNG' };
  if (colorType !== 6) {
    if (![0, 2, 3].includes(colorType)) return { ok: false, why: `colour type ${colorType}` };
    return bytes.includes('tRNS')
      ? { ok: false, why: 'has a tRNS transparency chunk' }
      : { ok: true, why: 'no alpha channel' };
  }

  const idat = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const stride = width * 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const line = Buffer.alloc(stride);
  let previous = Buffer.alloc(stride);
  let transparent = 0;
  let firstClear = null;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = previous[x];
      const c = x >= 4 ? previous[x - 4] : 0;
      let value = source[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = value & 255;
    }
    for (let x = 3; x < stride; x += 4) {
      if (line[x] !== 255) {
        transparent++;
        if (!firstClear) firstClear = `alpha ${line[x]} at ${(x - 3) / 4},${y}`;
      }
    }
    previous = Buffer.from(line);
  }
  return transparent
    ? { ok: false, why: `${transparent} transparent pixel(s), first ${firstClear}` }
    : { ok: true, why: 'alpha 255 everywhere' };
}

const manifest = JSON.parse(read('manifest.json'));

// The manifest holds message references (`__MSG_extName__`) rather than text, so every claim
// about the name or description is checked against the English catalog those references
// resolve to — the text Chrome shows on any browser whose language is neither en nor fr.
const LOCALES = ['en', 'fr'];
const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(read(`_locales/${locale}/messages.json`))])
);
const message = (catalog, key) => catalog[key]?.message;
const localize = (value, catalog = catalogs.en) =>
  value.replace(/__MSG_(\w+)__/g, (reference, key) => message(catalog, key) ?? reference);
const appName = localize(manifest.name);
const appDescription = localize(manifest.description);
const DOC_FILES = ['README.md', 'PRIVACY.md', 'SECURITY.md', 'STORE-LISTING.md', 'RELEASING.md', 'REJECTION-PLAYBOOK.md'];
const docs = Object.fromEntries(DOC_FILES.map((file) => [file, read(file)]));
const doc = docs['STORE-LISTING.md'];

/** Fenced blocks in document order, without the fence lines and one trailing newline. */
const blocks = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));

const SHIPPED = ['manifest.json', 'popup.html', 'popup.js', 'background.js'];
const source = Object.fromEntries(SHIPPED.map((file) => [file, read(file)]));
const allSource = Object.values(source).join('\n');

// ============================================================== STORE-LISTING.md
group('STORE-LISTING.md — manifest fields');

same('name in doc matches manifest', doc.includes(`- \`name\`: \`${appName}\``), true);
check(
  `name length stated as ${appName.length} of 45`,
  doc.includes(`${appName.length} of 45 characters`),
  'doc disagrees with the name the manifest resolves to'
);
same('version in doc matches manifest', doc.includes(`- \`version\`: \`${manifest.version}\``), true);
check('package tab quotes the same version', doc.includes(`Version shows **${manifest.version}**`), 'Package tab section');
check('checklist quotes the same version', doc.includes(`Version ${manifest.version}, exactly three permissions`), 'Before submitting checklist');

const iconSizes = Object.keys(manifest.icons);
same('icon sizes in doc match manifest', doc.includes(`- \`icons\`: ${iconSizes.join('/')} at the package root`), true);
same('icon sizes present on disk', iconSizes.every((size) => exists(manifest.icons[size])), true);
same('no 32px icon file exists', exists('icon32.png'), false);

same('declared permissions match doc', manifest.permissions.join(', '), 'system.cpu, system.memory, storage');
check(
  'doc states exactly three permissions',
  doc.includes('exactly three entries: `system.cpu`, `system.memory` and `storage`'),
  'Package tab section'
);
check('doc promises no host-permissions row', doc.includes('**No host permissions**'), 'Package tab section');

same('popup file exists', exists(manifest.action.default_popup), true);
same('service worker file exists', exists(manifest.background.service_worker), true);

group('manifest.json — minimum Chrome version');

// The floor Chrome and the store enforce, so a browser that cannot read this manifest is told
// "Not compatible" rather than failing at install. Manifest V3 is supported from Chrome 88 and
// nothing the package calls is newer than that — the promise form of chrome.system.cpu.getInfo()
// arrived in 91, but popup.js uses the callback form, which predates MV3 by years. A higher
// number would not be wrong, only narrower than the code needs.
const MV3_FLOOR = 88;
const minimumChrome = manifest.minimum_chrome_version;
check('manifest declares minimum_chrome_version', typeof minimumChrome === 'string', `found ${JSON.stringify(minimumChrome)}`);
check(
  'it is a major version string, the form the store compares as a prefix',
  typeof minimumChrome === 'string' && /^\d+$/.test(minimumChrome),
  JSON.stringify(minimumChrome)
);
check(
  `it is not below the Manifest V3 floor of ${MV3_FLOOR}`,
  Number(minimumChrome) >= MV3_FLOOR,
  `${minimumChrome} would refuse browsers that can read this manifest`
);
const chromeClaims = [...docs['README.md'].matchAll(/Chrome (\d+) or later/g)].map((m) => Number(m[1]));
check('README states the minimum version', chromeClaims.length > 0, 'no "Chrome N or later"');
same('every minimum in README matches the manifest', [...new Set(chromeClaims)], [Number(minimumChrome)]);
check('STORE-LISTING.md quotes the manifest floor', doc.includes(`\`minimum_chrome_version\`: \`${minimumChrome}\``), 'step 1 manifest metadata');
check('the checklist repeats the floor', doc.includes(`minimum Chrome ${minimumChrome}`), 'Before submitting checklist');

group('STORE-LISTING.md — character counts');

const summary = blocks.find((b) => b.startsWith('A tiny X11-style'));
const alternative = blocks.find((b) => b.startsWith('Watch your CPU load'));
const detailed = blocks.find((b) => b.startsWith('xload is a small Chrome extension'));
const detailedFr = blocks.find((b) => b.startsWith('xload est une petite extension Chrome'));

check('summary block found', Boolean(summary));
check('alternative block found', Boolean(alternative));
check('detailed description block found', Boolean(detailed));
check('French detailed description block found', Boolean(detailedFr));

if (summary) {
  same('summary is byte-identical to the description the manifest resolves to', summary, appDescription);
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
if (detailedFr) {
  const stated = doc.match(/The text is ([\d,]+) characters/);
  const checklist = doc.match(/French description pasted \(([\d,]+) chars\)/);
  same('French detailed length in doc', stated && Number(stated[1].replace(/,/g, '')), detailedFr.length);
  same('French detailed length in checklist', checklist && Number(checklist[1].replace(/,/g, '')), detailedFr.length);
  check('French detailed description under the 16,384 limit', detailedFr.length <= 16384, `${detailedFr.length} chars`);
  check('French detailed description repeats the four-files claim', detailedFr.includes('quatre petits fichiers'), 'French detailed description');
}

group('STORE-LISTING.md — assets');

const screenshots = ['01-hero-classic-x11.png', '02-hacker-green-load.png', '03-amber-monitor.png', '04-dense-0.1s.png', '05-scanlines-off.png'];
const tile = 'store/06-promo-tile-440x280.png';
const marquee = 'store/07-marquee-1400x560.png';

// Exactly what the store takes: the five screenshots, the tile and the marquee at their
// required pixel sizes, every one fully opaque. A wrong file here is a rejected listing.
const ASSETS = [
  ...screenshots.map((shot) => [`store/${shot}`, 1280, 800, 'screenshot']),
  [tile, 440, 280, 'small promo tile'],
  [marquee, 1400, 560, 'marquee'],
];

const onDisk = fs.readdirSync(path.join(root, 'store')).filter((f) => f.endsWith('.png')).sort();
same('store holds exactly the seven assets', onDisk.length, 7);
same('store holds the seven files named here', onDisk, ASSETS.map(([file]) => path.basename(file)).sort());

for (const [file, width, height, kind] of ASSETS) {
  const name = path.basename(file);
  same(`${kind} ${name} exists`, exists(file), true);
  if (!exists(file)) continue;
  const size = pngSize(file);
  same(`${kind} ${name} is ${width}x${height}`, size && `${size.width}x${size.height}`, `${width}x${height}`);
  const opaque = pngOpaque(file);
  check(`${kind} ${name} is fully opaque`, opaque.ok, opaque.why);
}
for (const shot of screenshots) {
  check(`${shot} is named in the doc`, doc.includes(`\`${shot}\``), 'screenshot table');
}
check('doc states five screenshots', doc.includes('five screenshots'), 'Before submitting checklist');

// The French set is the same five frames with the translated popup. The promo tile and the
// marquee carry no translatable text, so they deliberately have no French counterparts — a
// sixth file in here would mean someone re-shot the wrong thing.
const frDir = 'store/fr';
same(
  'store/fr holds the five French screenshots',
  exists(frDir) ? fs.readdirSync(path.join(root, frDir)).filter((f) => f.endsWith('.png')).sort() : [],
  [...screenshots].sort()
);
for (const shot of screenshots) {
  const file = `${frDir}/${shot}`;
  const size = exists(file) ? pngSize(file) : null;
  same(`French screenshot ${shot} is 1280x800`, size && `${size.width}x${size.height}`, '1280x800');
}
const tileKb = doc.match(/`store\/06-promo-tile-440x280\.png` \(\d+×\d+ PNG, (\d+) KB\)/);
check(
  `promo tile size stated as ${Math.round(kib(tile))} KB`,
  Number(tileKb?.[1]) === Math.round(kib(tile)),
  `doc says ${tileKb ? tileKb[1] : 'nothing'}`
);
const marqueeKb = doc.match(/`store\/07-marquee-1400x560\.png` \(\d+×\d+ PNG, (\d+) KB\)/);
check(
  `marquee size stated as ${Math.round(kib(marquee))} KB`,
  Number(marqueeKb?.[1]) === Math.round(kib(marquee)),
  `doc says ${marqueeKb ? marqueeKb[1] : 'nothing'}`
);

group('STORE-LISTING.md — package');

const zipName = packageFileName(manifest.version);
const zipPath = path.join(root, zipName);
check(`package ${zipName} exists`, exists(zipName), 'run step 2 of RELEASING.md');

if (exists(zipName)) {
  const entries = execFileSync('unzip', ['-Z1', zipName], { cwd: root }).toString().trim().split('\n');
  const expected = [...PACKAGE_FILES];
  same('zip holds no directory entries', entries.filter((e) => e.endsWith('/')), []);
  same('zip contents', [...entries].sort(), [...expected].sort());

  // The count in the docs is derived from the package, never compared with a literal: the old
  // `doc.includes('eight entries')` asserted the doc against itself, so it stayed green while
  // the second catalog made the zip hold nine files.
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const entriesWord = words[entries.length] ?? String(entries.length);
  check(`doc states ${entriesWord} entries`, doc.includes(`${entriesWord} entries`), 'zip inventory in the checklist');
  check(
    `RELEASING.md states ${entriesWord} extension files`,
    docs['RELEASING.md'].includes(`${entriesWord} extension files`),
    'step 2 inventory sentence'
  );
  check(
    `RELEASING.md counts ${entries.length} entries in its unzip step`,
    docs['RELEASING.md'].includes(`# exactly ${entries.length} entries, no directories`),
    'the unzip command comment'
  );
  check('doc names the package', doc.includes(zipName), 'upload step');
  const zipKb = doc.match(/this package is (\d+) KB/);
  check(
    `package size stated as ${Math.round(kib(zipName))} KB`,
    Number(zipKb?.[1]) === Math.round(kib(zipName)),
    `doc says ${zipKb ? `${zipKb[1]} KB` : 'nothing'}`
  );

  // The upload step names the release asset as an alternative source, so the doc has to
  // identify those bytes exactly: the first 1.1.0 asset was 16 bytes lighter because it was
  // built before the manifest changed, and "download the zip from the release" did not
  // distinguish the two. Byte count and hash are re-derived from the committed package, so a
  // rebuild that changes either fails here until the doc is updated with it.
  const zipBytes = fs.readFileSync(zipPath);
  const zipHash = crypto.createHash('sha256').update(zipBytes).digest('hex');
  const zipSize = zipBytes.length.toLocaleString('en-US');
  check(`the upload step states the ${zipSize}-byte size`, doc.includes(`${zipSize} bytes`), 'step 1');
  check('the upload step quotes the package sha256', doc.includes(zipHash), zipHash);
  check(
    'the upload step links the release for this version',
    doc.includes(`/releases/tag/v${manifest.version}`),
    `expected /releases/tag/v${manifest.version}`
  );

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
same('chrome.system is only used for cpu and memory', [...new Set(systemApis)], ['cpu', 'memory']);

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
check(
  'the status bar carries LOAD, MEMORY and SCALE in that order',
  /id="load-value"[\s\S]*id="memory-value"[\s\S]*id="scale-value"/.test(source['popup.html']),
  'status bar spans'
);

// The option labels are message keys, not text, so the names are read from the English
// catalog the keys resolve to — the same strings Chrome puts in the menu.
const optionTags = [...source['popup.html'].matchAll(/<option value="([^"]+)" data-i18n="([^"]+)"><\/option>/g)];
const themeOptions = optionTags
  .filter(([, value]) => !/^\d+$/.test(value))
  .map(([, , key]) => message(catalogs.en, key) || '');
const themeKeys = [...source['popup.js'].matchAll(/^\s*'([a-z-]+)':\s*\{ bg:/gm)].map((m) => m[1]);
same('theme menu holds six themes', themeOptions.length, 6);
same('theme table holds six themes', themeKeys.length, 6);
const themeNames = themeOptions.map((label) => label.replace(/\s*\([^)]*\)$/, ''));
for (const name of themeNames) {
  check(`README names the ${name} theme`, docs['README.md'].includes(name), 'theme list');
}
const intervals = [...source['popup.html'].matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1])).filter((v) => v >= 100);
const rateValues = intervals.filter((v) => [100, 500, 1000, 2000, 5000].includes(v));
same('refresh options span 0.1s to 5.0s', [Math.min(...rateValues), Math.max(...rateValues)], [100, 5000]);
check('default refresh rate is 1.0s', /refreshRate: 1000/.test(source['popup.js']) && /refreshRate: 1000/.test(source['background.js']));
check('default theme is Classic X11', /theme: 'classic'/.test(source['popup.js']));

group('localisation — the catalogs, the manifest and the popup agree');

// chrome.i18n resolves every label against the browser's language, so a key missing from one
// catalog is a blank word in front of a user, and a key nothing reads is dead weight in the
// package. Each check below collects every problem and reports it as one line, so a failure
// names the key without printing a passing line for each of the twenty that are fine.
same('manifest declares the default locale', manifest.default_locale, 'en');
check('manifest name is a message reference', /^__MSG_\w+__$/.test(manifest.name), manifest.name);
check('manifest description is a message reference', /^__MSG_\w+__$/.test(manifest.description), manifest.description);
same('both catalogs define the same keys', Object.keys(catalogs.fr).sort(), Object.keys(catalogs.en).sort());
same(
  'the package ships both catalogs',
  LOCALES.map((locale) => PACKAGE_FILES.includes(`_locales/${locale}/messages.json`)),
  [true, true]
);

const catalogProblems = [];
for (const locale of LOCALES) {
  for (const [key, entry] of Object.entries(catalogs[locale])) {
    if (!entry.message || !entry.message.trim()) catalogProblems.push(`${locale}.${key}: no message`);
    if (!entry.description || !entry.description.trim()) catalogProblems.push(`${locale}.${key}: no description`);
    const used = [...new Set([...entry.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1].toLowerCase()))].sort();
    const declared = Object.keys(entry.placeholders || {}).sort();
    if (JSON.stringify(used) !== JSON.stringify(declared)) {
      catalogProblems.push(`${locale}.${key}: uses [${used.join(', ')}], declares [${declared.join(', ')}]`);
    }
  }
}
same('every entry has a message, a description and matching placeholders', catalogProblems, []);

// The keys the code asks for, and only those: a missing one is a blank label, an extra one is
// a string nobody will ever see.
const manifestKeys = [manifest.name, manifest.description].map((value) => (value.match(/__MSG_(\w+)__/) || [])[1]);
const usedKeys = [...new Set([
  ...manifestKeys,
  ...[...source['popup.html'].matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
  ...[...source['popup.js'].matchAll(/\bt\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]),
])];
same('the code uses every key in both catalogs', usedKeys.filter((key) => !message(catalogs.en, key) || !message(catalogs.fr, key)), []);
same('every catalog key is used by the code', Object.keys(catalogs.en).filter((key) => !usedKeys.includes(key)), []);
check(
  'popup.js gets its text from chrome.i18n',
  source['popup.js'].includes('chrome.i18n.getMessage') && source['popup.js'].includes("querySelectorAll('[data-i18n]')")
);

// Nothing may still carry its English text in the markup, or the catalog and the page can
// disagree and switching language silently does nothing.
for (const tag of ['label', 'option']) {
  const hardcoded = [...source['popup.html'].matchAll(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g'))]
    .filter((m) => m[1].trim())
    .map((m) => m[0]);
  same(`no ${tag} text is hardcoded in popup.html`, hardcoded, []);
}

// French must be a translation, not the English catalog copied under another name.
const untranslated = ['titleBar', 'labelTheme', 'labelRefresh', 'labelGrid', 'labelScanlines', 'loadPercent', 'memoryPercent', 'scaleMax']
  .filter((key) => message(catalogs.fr, key) === message(catalogs.en, key));
same('the French catalog translates the popup', untranslated, []);

// Numbers are formatted for the catalog the popup is rendering, not for JavaScript: the
// separator is a message, and the French readouts also put a space before the percent sign.
same(
  'each catalog declares its decimal separator',
  [message(catalogs.en, 'decimalSeparator'), message(catalogs.fr, 'decimalSeparator')],
  ['.', ',']
);
check('popup.js formats readouts with the catalog separator', source['popup.js'].includes("t('decimalSeparator')"), 'number formatting');
check(
  'the French readouts put a space before the percent sign',
  ['loadPercent', 'memoryPercent', 'scaleMax'].every((key) => /\$[A-Z]+\$ %/.test(message(catalogs.fr, key))),
  'French typography'
);

// ============================================================== README / PRIVACY / SECURITY
group('README.md, PRIVACY.md, SECURITY.md — claims against the code');

const claims = (file, label, snippet) => {
  const haystack = docs[file].toLowerCase();
  check(`${file}: ${label}`, haystack.includes(snippet.toLowerCase()), `no "${snippet}"`);
};

for (const file of ['README.md', 'PRIVACY.md', 'SECURITY.md']) {
  claims(file, 'names system.cpu', '`system.cpu`');
  claims(file, 'names system.memory', '`system.memory`');
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
claims('README.md', 'states the memory readout', 'MEMORY:');
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

// Code — fenced blocks and inline snippets — holds example links (a changelog heading for a
// release that does not exist yet, a download path with $VERSION in it, `[1.1.0](…)`), so
// only prose is treated as linking anywhere.
const prose = (text) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

for (const [file, text] of Object.entries(docs)) {
  const links = [...prose(text).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((target) => !/^(https?:|#|mailto:)/.test(target));
  for (const link of links) {
    const target = link.split('#')[0];
    if (target) same(`${file} link ${target} resolves`, exists(target), true);
  }
}

group('RELEASING.md — each command block stands alone');

// Every step is meant to be pasteable in a fresh shell: a block that consumes $VERSION or
// $ZIP has to define it earlier in the same block, not inherit it from a previous step.
const releasing = docs['RELEASING.md'];
const bashBlocks = [...releasing.matchAll(/```bash\n([\s\S]*?)```/g)];
check('RELEASING.md contains bash blocks', bashBlocks.length > 0, 'expected at least one');

for (const match of bashBlocks) {
  const block = match[1];
  const heading = [...releasing.slice(0, match.index).matchAll(/^## (.+)$/gm)].pop();
  const where = heading ? `"${heading[1]}"` : 'the top of the file';
  const lines = block.split('\n');
  for (const name of ['VERSION', 'ZIP']) {
    const definition = lines.findIndex((line) => line.startsWith(`${name}=`));
    const use = lines.findIndex((line, index) => index !== definition && new RegExp(`\\$${name}\\b`).test(line));
    if (use === -1) continue;
    check(
      `${where} defines $${name} before using it`,
      definition !== -1 && definition < use,
      definition === -1 ? 'uses it without defining it' : 'defined after first use'
    );
  }
}

// The package smoke test only helps if the release steps tell someone to run it. It needs
// Chrome and the built zip, so it stays a local step rather than a CI job.
check('RELEASING.md runs the smoke test before the tag', releasing.includes('node scripts/smoke.mjs'), 'the release steps never mention it');
check('RELEASING.md compares the downloaded asset with the local zip', /shasum -a 256 "\$ZIP" \/tmp\/asset\.zip/.test(releasing), 'step 8 should verify the asset');
check('the smoke script it names exists', exists('scripts/smoke.mjs'));

// The package is built by one script from one list. A second copy of the file names — in the
// release steps or in the workflow — is how the build and the docs drift apart.
check('RELEASING.md builds the package with the script', releasing.includes('node scripts/build-package.mjs'), 'step 2 should call it');
check('the package builder it names exists', exists('scripts/build-package.mjs'));
check('the package file list is not repeated in RELEASING.md', !/\bicon128\.png\b/.test(releasing), 'name scripts/package-files.mjs instead');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8');
check('the package file list is not repeated in the workflow', !/\bicon128\.png\b/.test(workflow), 'call scripts/build-package.mjs instead');

group('privacy tab answers agree with PRIVACY.md');

// The Privacy tab is filled in by hand from STORE-LISTING.md while the policy is a separate
// file, and a reviewer reads both. Keep the answers and the policy saying the same things.
const policy = docs['PRIVACY.md'];
// Emphasis markers sit between the words these checks look for (`**no** network code`), and
// prose wraps mid-phrase ("no dynamic\nimport"), so comparisons run against text with the
// markers removed and the whitespace collapsed.
const plain = (text) => text.replace(/[`*]/g, '').replace(/\s+/g, ' ');
const singlePurpose = blocks.find((b) => b.startsWith('Shows live CPU load'));
const cpuAnswer = blocks.find((b) => b.includes('chrome.system.cpu.getInfo() is the sole API'));
const storageAnswer = blocks.find((b) => b.startsWith('Used only to persist'));

check('single-purpose answer found', Boolean(singlePurpose));
check('system.cpu justification found', Boolean(cpuAnswer));
check('storage justification found', Boolean(storageAnswer));

if (singlePurpose) {
  check(`single-purpose length stated as ${singlePurpose.length}`, doc.includes(`${singlePurpose.length} characters.`), 'length sentence');
  check('single purpose names the CPU load graph', /cpu load/i.test(singlePurpose) && /graph/i.test(singlePurpose));
  check('single purpose names the memory readout', /memory/i.test(singlePurpose), 'memory is half of what the popup shows');
  check(
    'policy states the same single purpose',
    plain(policy).includes('single purpose') && /cpu load graph/i.test(plain(policy)),
    'no "single purpose … CPU load graph" in PRIVACY.md'
  );
}

if (cpuAnswer) {
  check('cpu answer names the tick-diff method', /subtracts consecutive user\/kernel\/idle samples/i.test(cpuAnswer));
  check('policy describes the same method', /subtracts consecutive samples/i.test(policy));
  check('both name chrome.system.cpu.getInfo()', cpuAnswer.includes('chrome.system.cpu.getInfo()') && policy.includes('chrome.system.cpu.getInfo()'));
  check('both deny process-level data', /process names/i.test(cpuAnswer) && /process names/i.test(policy));
}

if (storageAnswer) {
  check('both name chrome.storage.local', storageAnswer.includes('chrome.storage.local') && policy.includes('chrome.storage.local'));
  const historyPattern = new RegExp(`\\b${historyPoints}\\b`);
  check(`both quote the ${historyPoints}-sample history`, historyPattern.test(storageAnswer) && historyPattern.test(policy));
  check('both say sync storage is unused', /sync storage/i.test(storageAnswer) && /chrome\.storage\.sync/.test(policy));
  check('both say nothing leaves the machine', /leaves the machine/i.test(storageAnswer) && /not transmitted/i.test(policy));
}

// Scope the wording checks to the paragraphs they belong to: the same phrases appear
// elsewhere in these docs, so a whole-file search would pass after the answer itself drifted.
const paragraphAfter = (text, marker) => {
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const rest = text.slice(start);
  const end = rest.search(/\n\s*\n/);
  return end === -1 ? rest : rest.slice(0, end);
};
const section = (text, heading) => {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
};

const remoteAnswer = paragraphAfter(doc, 'No, I am not using remote code');
check(
  'remote-code answer lists the mechanisms the code lacks',
  ['no eval', 'no dynamic import', 'no remote script', 'no network code'].every((phrase) => plain(remoteAnswer).includes(phrase)),
  'the Remote code paragraph'
);
check('policy denies network code in the same terms', plain(policy).includes('no network code'));

// Both scopes are located by marker text and then searched, so no separate "found" guard is
// needed: if either marker moves, all six certification checks below fail and name the scope.
const certificationsTab = paragraphAfter(doc, 'There are three separate claims');
const limitedUse = section(policy, '## Limited Use statement');
for (const [label, pattern] of [
  ['Limited Use', /limited use/i],
  ['no sale or transfer', /no sale|not sold/i],
  ['no creditworthiness or lending', /creditworthiness/i],
]) {
  check(`PRIVACY.md states the ${label} certification`, pattern.test(plain(limitedUse)), 'in the Limited Use section');
  check(`STORE-LISTING.md lists the ${label} certification`, pattern.test(plain(certificationsTab)), 'in the certifications bullet');
}


// GitHub answers Node's own user-agent with 503 on /blob/ pages — the same URL returns 200 once
// the request identifies itself — so every request below sends one. A link that is really gone
// answers 404/410, which fails on the first attempt; only answers that can be transient (5xx,
// 429, a timeout, a dropped connection) are retried, and a link that never stops failing still
// fails once the attempts run out.
const LINK_USER_AGENT = 'xload-link-check/1.0 (+https://github.com/jbodkin1/xload_chrome_ext)';

async function fetchLink(url, attempts = 3) {
  let last = { status: 'no response', response: null };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response = null;
    try {
      response = await fetch(url, {
        headers: { 'user-agent': LINK_USER_AGENT, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      last = { status: response.status, response };
      if (response.status !== 429 && response.status < 500) return last;
    } catch (error) {
      last = { status: error.name === 'TimeoutError' ? 'timeout' : error.message, response: null };
    }
    try {
      await response?.body?.cancel();
    } catch {
      /* the body of a failed attempt is not read */
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return last;
}

const GITHUB_FILE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|tree)\/([^/]+)\/(.+)$/;

/**
 * GitHub's HTML pages intermittently answer 503 to a non-browser client even when the file they
 * render is plainly there — the same check passes, then fails, then passes again. The blob page is
 * only a rendering of a file in the repository, so when the page itself refuses to answer the file
 * is confirmed at its raw URL instead: a link that names a file which does not exist answers 404
 * there just as it does on the page, while a wobbling edge no longer fails the build.
 */
async function fetchRawCopy(url) {
  const match = url.match(GITHUB_FILE_URL);
  if (!match) return null;
  const [, owner, repo, ref, file] = match;
  return fetchLink(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}`);
}

/** Resolve one link, returning the status to report and, when it took one, what the page said. */
async function resolveLink(url) {
  const page = await fetchLink(url);
  const transient = typeof page.status === 'number' && (page.status === 429 || page.status >= 500);
  if (!transient) return page;

  const raw = await fetchRawCopy(url);
  if (raw && raw.status === 200) return { status: 200, response: null, viaRaw: page.status };
  return { status: page.status, response: null, detail: `the page answered ${page.status}, and its raw copy ${raw ? raw.status : 'was not fetched'}` };
}

group('PRIVACY.md links point at the policy for this version');

// The store's policy field must serve what the submitted version shipped with, so the URL names
// the release tag rather than `main`: a policy edited after review cannot then change what a
// reviewer read. The tag comes from the manifest, so a version bump fails the check below until
// STORE-LISTING.md names the new one, which is the reminder to move the dashboard field too.
const POLICY_TAG = `v${manifest.version}`;
const POLICY_URL = `https://github.com/jbodkin1/xload_chrome_ext/blob/${POLICY_TAG}/PRIVACY.md`;
const RAW_POLICY_URL = POLICY_URL.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
const policyUrls = [...new Set(DOC_FILES.flatMap((file) => docs[file].match(/https?:\/\/[^\s`)>" ]*PRIVACY\.md[^\s`)>" ]*/gi) || []))];

check('docs link to the policy', policyUrls.length > 0);
same('every policy URL is the canonical blob link', policyUrls.filter((url) => url !== POLICY_URL), []);
check('STORE-LISTING.md gives that URL for the privacy field', doc.includes(POLICY_URL));
check('the URL names the file this script validates', POLICY_URL.endsWith('/PRIVACY.md') && exists('PRIVACY.md'));

if (!offline) {
  // The links group below already checks that POLICY_URL answers 200; what it cannot tell is
  // whether the copy being served is the policy committed at the tag the URL names. The text at
  // that tag comes from git rather than the working tree, because the two are allowed to differ:
  // editing PRIVACY.md after a release is exactly what the pinned URL is there to isolate.
  let committed = null;
  try {
    committed = execFileSync('git', ['show', `${POLICY_TAG}:PRIVACY.md`], { cwd: root }).toString();
  } catch {
    committed = null;
  }
  let published = null;
  const raw = await fetchLink(RAW_POLICY_URL);
  let problem =
    committed === null
      ? `git show ${POLICY_TAG}:PRIVACY.md failed — fetch the tag first (git fetch --tags)`
      : `raw copy answered ${raw.status}`;
  if (committed !== null && raw.status === 200 && raw.response) {
    published = await raw.response.text();
    problem = 'the served policy differs from the file committed at that tag';
  }
  check(
    'the pinned URL serves the policy committed at that tag',
    published !== null && published.trimEnd() === committed.trimEnd(),
    problem
  );
}

group('STORE-LISTING.md — test instructions');

// The Privacy answers justify the two permissions and never mention background.js, so this
// tab is the only place a reviewer is told what the service worker does. Without it the worker
// reads as an unexplained background script in a 17 KB package.
const testBlock = blocks.find((b) => b.startsWith('Click the toolbar icon'));
check('test-instructions answer found', Boolean(testBlock), 'expected a fenced answer starting "Click the toolbar icon"');

if (testBlock) {
  const sentences = (testBlock.match(/\.(?=\s|$)/g) || []).length;
  check('it is a single sentence', sentences === 1, `${sentences} sentence ends`);
  check('it names the service worker', /service worker/i.test(testBlock));
  check('it confines the worker to writing defaults on install', /writes two default settings on first install/i.test(testBlock) && /stops/i.test(testBlock));
  check('it keeps sampling in the popup', /sampling happens only while the popup is open/i.test(testBlock));

  const testSection = section(doc, '## 6. Test instructions tab');
  check('section 6 carries that answer', plain(testSection).includes(plain(testBlock)), 'the fenced block sits outside section 6');
  check('section 6 no longer calls the tab blank', !/blank for this item/i.test(testSection), 'still describes the tab as left blank');

  // The policy is the other half of the same story; keep the two saying it the same way.
  check('the policy describes the same worker', plain(policy).includes('writes those same two defaults'), 'PRIVACY.md wording');
  check('the policy says the same about sampling', plain(policy).includes('Sampling happens only while the popup is open'), 'PRIVACY.md retention paragraph');
}

group('REJECTION-PLAYBOOK.md — it may only claim what the code does');

// An appeal is a statement about the submitted code, and a reply that names a call the code
// does not make, or a function that does not exist, is worse than no reply at all. These
// checks tie the playbook's claims to the files it points a reviewer at.
const playbook = docs['REJECTION-PLAYBOOK.md'];
check('STORE-LISTING.md points at the playbook', doc.includes('[REJECTION-PLAYBOOK.md](REJECTION-PLAYBOOK.md)'), 'step 7');
for (const [label, api] of [
  ['system.cpu', 'chrome.system.cpu.getInfo'],
  ['storage', 'chrome.storage.local'],
]) {
  check(`the ${label} reply names ${api}, which the shipped code calls`, playbook.includes(api) && allSource.includes(api), 'reply and code disagree');
}
check(
  'it says sync storage is never written, and the code never touches it',
  /chrome\.storage\.sync/.test(playbook) && !allSource.includes('chrome.storage.sync')
);
for (const fn of ['queryCpuInfo', 'persistHistory']) {
  check(`it names ${fn}(), which exists in popup.js`, playbook.includes(`${fn}()`) && new RegExp(`function ${fn}\\(`).test(source['popup.js']));
}
check('it names the Appeal route the dashboard offers', /Appeal/.test(playbook), 'the Appeal button on the item detail page');

// The replies quote the files a reviewer can open, so the paths must be the shipped ones.
for (const file of ['manifest.json', 'popup.js']) {
  check(`it points at ${file} where the reviewer can open it`, playbook.includes(`/blob/main/${file}`), 'a link to the file on main');
}


group('store/SUBMISSION-COPY.txt matches the listing copy');

// One paste-ready file, generated from the listing doc. It is easy to hand-edit this and
// leave the two disagreeing, so the sections are compared verbatim.
const paste = read('store/SUBMISSION-COPY.txt');
same('contains the summary verbatim', paste.includes(summary), true);
same('contains the detailed description verbatim', paste.includes(detailed), true);
if (detailedFr) same('contains the French detailed description verbatim', paste.includes(detailedFr), true);
same('contains the single-purpose answer verbatim', paste.includes(singlePurpose), true);
same('contains the system.cpu justification verbatim', paste.includes(cpuAnswer), true);
same('contains the storage justification verbatim', paste.includes(storageAnswer), true);
if (testBlock) same('contains the test-instructions answer verbatim', paste.includes(testBlock), true);
same('does not carry the unused alternative summary', paste.includes(alternative), false);
check('carries the policy URL', paste.includes(POLICY_URL));
check('is plain text, with no fences or Markdown headings', !/```|^#{1,6} /m.test(paste));

// ============================================================== links
group('links');

const urls = [...new Set(DOC_FILES.flatMap((file) => prose(docs[file]).match(/https?:\/\/[^\s`)>" ]+/g) || []))];
check('docs contain links', urls.length > 0);
for (const url of ['https://github.com/jbodkin1/xload_chrome_ext', 'https://github.com/jbodkin1/xload_chrome_ext/issues']) {
  check(`docs reference ${url}`, urls.includes(url), 'Homepage/Support URLs');
}

if (offline) {
  check(`link check skipped (--offline): ${urls.length} URLs`, true);
} else {
  for (const url of urls) {
    const { status, detail, viaRaw } = await resolveLink(url);
    check(`link ${status} ${url}`, status === 200, detail);
    if (viaRaw) console.log(`      (the GitHub page answered ${viaRaw}; the raw copy confirmed the file)`);
  }
}

// ============================================================== report
console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nThe docs disagree with the repository. Fix the doc or the file it describes, then re-run.');
  process.exit(1);
}
