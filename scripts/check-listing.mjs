#!/usr/bin/env node
/**
 * Check the facts STORE-LISTING.md asserts about this repository against the repository.
 *
 *   node scripts/check-listing.mjs              # includes the HTTP link check
 *   node scripts/check-listing.mjs --offline    # skip the link check
 *
 * STORE-LISTING.md is written as a dashboard walkthrough, so it repeats concrete numbers:
 * the manifest name, version and icon sizes, the summary and detailed-description lengths,
 * the dimensions and file sizes of the store images, and the contents of the release zip.
 * Every one of those can drift silently after a version bump, a manifest edit or a
 * re-capture. This script re-derives them from the files and exits non-zero on any
 * mismatch, so the listing copy is checked rather than remembered.
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
const passes = [];

function check(label, condition, detail = '') {
  if (condition) {
    passes.push(label);
  } else {
    failures.push(detail ? `${label} (${detail})` : label);
  }
}

function same(label, actual, expected) {
  const equal = JSON.stringify(actual) === JSON.stringify(expected);
  check(label, equal, `expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
}

const kib = (file) => fs.statSync(path.join(root, file)).size / 1024;

/** Dimensions from the PNG signature and IHDR chunk — no image library needed. */
function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const doc = fs.readFileSync(path.join(root, 'STORE-LISTING.md'), 'utf8');

/** Fenced blocks in document order, without the fence lines and one trailing newline. */
const blocks = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));

// ---------------------------------------------------------------- manifest fields
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
same('icon sizes present on disk', iconSizes.every((size) => fs.existsSync(path.join(root, manifest.icons[size]))), true);
same('no 32px icon file exists', fs.existsSync(path.join(root, 'icon32.png')), false);

same('declared permissions match doc', manifest.permissions.join(', '), 'system.cpu, storage');
check(
  'doc states exactly two permissions',
  doc.includes('exactly two entries: `system.cpu` and `storage`'),
  'Package tab section'
);
for (const key of ['host_permissions', 'content_scripts', 'web_accessible_resources', 'externally_connectable', 'optional_permissions']) {
  same(`manifest has no ${key}`, manifest[key], undefined);
}
check('doc promises no host-permissions row', doc.includes('**No host permissions**'), 'Package tab section');

same('popup file exists', fs.existsSync(path.join(root, manifest.action.default_popup)), true);
same('service worker file exists', fs.existsSync(path.join(root, manifest.background.service_worker)), true);

// ---------------------------------------------------------------- character counts
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
  check('detailed description is the one the doc tells you to paste', doc.includes('This one is'), 'prose check');
}

// ---------------------------------------------------------------- assets
const screenshots = ['01-hero-classic-x11.png', '02-hacker-green-load.png', '03-theme-tour.png', '04-dense-0.1s.png', '05-scanlines-off.png'];
const onDisk = fs.readdirSync(path.join(root, 'store')).filter((f) => f.endsWith('.png')).sort();
same('store holds exactly the seven assets', onDisk.length, 7);
for (const shot of screenshots) {
  const file = path.join('store', shot);
  same(`${shot} exists`, fs.existsSync(path.join(root, file)), true);
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
check(`promo tile size stated as ${Math.round(kib(tile))} KB`, tileKb && Number(tileKb[1]), Math.round(kib(tile)) + ' KB');
const marqueeKb = doc.match(/`store\/07-marquee-1400x560\.png` \(\d+×\d+ PNG, (\d+) KB\)/);
check(`marquee size stated as ${Math.round(kib(marquee))} KB`, marqueeKb && Number(marqueeKb[1]), Math.round(kib(marquee)) + ' KB');

// ---------------------------------------------------------------- package
const zipName = `xload-retro-system-monitor-${manifest.version}.zip`;
const zipPath = path.join(root, zipName);
check(`package ${zipName} exists`, fs.existsSync(zipPath), 'run step 2 of RELEASING.md');

if (fs.existsSync(zipPath)) {
  const entries = execFileSync('unzip', ['-Z1', zipName], { cwd: root }).toString().trim().split('\n');
  const expected = ['manifest.json', 'popup.html', 'popup.js', 'background.js', ...iconSizes.map((s) => manifest.icons[s])];
  same('zip holds no directory entries', entries.filter((e) => e.endsWith('/')), []);
  same('zip contents', [...entries].sort(), [...expected].sort());
  same('doc states seven entries', doc.includes('seven entries'), true);
  check('doc names the package', doc.includes(zipName), 'upload step');
  const zipKb = doc.match(/this package is (\d+) KB/);
  check(`package size stated as ${Math.round(kib(zipName))} KB`, zipKb && Number(zipKb[1]), Math.round(kib(zipName)) + ' KB');

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

// ---------------------------------------------------------------- links
const urls = [...new Set(doc.match(/https?:\/\/[^\s`)>"]+/g) || [])];
check('doc contains links', urls.length > 0);
for (const url of ['https://github.com/jbodkin1/xload_chrome_ext', 'https://github.com/jbodkin1/xload_chrome_ext/issues']) {
  check(`doc references ${url}`, urls.includes(url), 'Homepage/Support URLs');
}

if (offline) {
  passes.push(`link check skipped (--offline): ${urls.length} URLs`);
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

// ---------------------------------------------------------------- report
for (const line of passes) console.log(`ok    ${line}`);
for (const line of failures) console.log(`FAIL  ${line}`);
console.log(`\n${passes.length} passed, ${failures.length} failed`);

if (failures.length) {
  console.error('\nSTORE-LISTING.md disagrees with the repository. Fix the doc or the file it describes, then re-run.');
  process.exit(1);
}
