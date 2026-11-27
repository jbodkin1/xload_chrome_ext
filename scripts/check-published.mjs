#!/usr/bin/env node
/**
 * Check what the Chrome Web Store actually serves for this extension, against the repository.
 *
 *   node scripts/check-published.mjs                 # the version in manifest.json
 *   node scripts/check-published.mjs --id=<item-id>  # a different item
 *
 * Every other check compares the repository with itself. This one reads the public listing, in
 * English and in French, and compares the version, the name, the summary, the first line of the
 * detailed description and the number of screenshots with what the repository says they are.
 *
 * The page is a JavaScript application, but its server-rendered payload carries the listing
 * metadata — the item's embedded manifest, its language list and its gallery — which is what is
 * read here, so no browser is needed.
 *
 * It fails until the store has approved the version in manifest.json: the public listing lags the
 * dashboard. Run it after the update is live (RELEASING.md step 9), not on every pull request.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

// xload Retro System Monitor, as the store lists it.
const ITEM_ID = argValue('id') || 'gbkefgjcjlhnfdhjhhnhhohmpjmdeenp';
const PAGE = `https://chromewebstore.google.com/detail/${ITEM_ID}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const failures = [];
let passes = 0;

function group(name) {
  console.log(`\n${name}`);
}

function check(label, ok, detail = '') {
  if (ok) {
    passes++;
    console.log(`ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const catalog = (locale) => JSON.parse(fs.readFileSync(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
const summaryEn = catalog('en').extDescription.message;
const summaryFr = catalog('fr').extDescription.message;

const doc = fs.readFileSync(path.join(root, 'STORE-LISTING.md'), 'utf8');
const blocks = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));
const detailedEn = blocks.find((block) => block.startsWith('xload is a small Chrome extension'));
const detailedFr = blocks.find((block) => block.startsWith('xload est une petite extension Chrome'));
const firstLine = (block) => (block ? block.split('\n')[0].trim() : '');
const shotsOnDisk = fs
  .readdirSync(path.join(root, 'store'))
  .filter((file) => /^0[1-5]-.*\.png$/.test(file)).length;

// The payload is JSON inside HTML inside a JavaScript string, so quotes, apostrophes and newlines
// arrive escaped. Everything compared below is compared as prose: decoded, with runs of whitespace
// collapsed and the two apostrophe glyphs treated as one.
const prose = (text) =>
  text
    .replace(/\\u0027|&#39;|&apos;/g, "'")
    .replace(/\\u0026|&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\\+[nrt]/g, ' ')
    .replace(/\\+"/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pageVersion = (html) => (html.match(/"(\d+\.\d+(?:\.\d+)?)",\[\d+,\d+\],"\d+(?:\.\d+)? ?KiB"/) || [])[1];
const pageLanguages = (html) => {
  const hit = html.match(/"\d+(?:\.\d+)? ?KiB",\[([^\]]*)\]/);
  return hit ? (hit[1].match(/"[^"]*"/g) || []).map((token) => token.slice(1, -1)) : null;
};
// The gallery is the image list that follows the item's own name in its record; recommended items
// carry the same shape, which is why the name anchors it.
const pageGallery = (html) => {
  const hit = html.match(/xload Retro System Monitor"\],null,null,null,null,\[((?:\[1,"[^"]+"\],?)+)\]/);
  return hit ? (hit[1].match(/\[1,"/g) || []).length : null;
};

async function page(language) {
  const res = await fetch(`${PAGE}?hl=${language}`, {
    headers: { 'user-agent': UA, 'accept-language': language },
  });
  return { status: res.status, html: res.ok ? await res.text() : '' };
}

const en = await page('en');
const fr = await page('fr');

group('the published page — English listing');
check(`the item page answers 200`, en.status === 200, `${PAGE}?hl=en answered ${en.status}`);
const servedVersion = pageVersion(en.html);
check(
  `the store serves version ${manifest.version}`,
  servedVersion === manifest.version,
  `the page says ${servedVersion ?? 'nothing'}`
);
check('the store serves the name the manifest resolves to', prose(en.html).includes(prose(manifest.name.replace(/^__MSG_(\w+)__$/, (m, key) => catalog('en')[key].message))), 'item name');
check('the store serves the English summary', prose(en.html).includes(prose(summaryEn)), `expected ${JSON.stringify(summaryEn)}`);
check(
  'the store serves the English detailed description',
  prose(en.html).includes(prose(firstLine(detailedEn))),
  `expected it to open with ${JSON.stringify(firstLine(detailedEn))}`
);
const gallery = pageGallery(en.html);
check(`the gallery holds the ${shotsOnDisk} screenshots`, gallery === shotsOnDisk, `the page lists ${gallery ?? 'none'}`);
const languages = pageLanguages(en.html);
check('the listing declares two languages', languages && languages.length === 2, `the page declares ${JSON.stringify(languages)}`);

group('the published page — French listing');
check('the French page answers 200', fr.status === 200, `${PAGE}?hl=fr answered ${fr.status}`);
check('the store serves the French summary', prose(fr.html).includes(prose(summaryFr)), `expected ${JSON.stringify(summaryFr)}`);
check(
  'the store serves the French detailed description',
  prose(fr.html).includes(prose(firstLine(detailedFr))),
  `expected it to open with ${JSON.stringify(firstLine(detailedFr))}`
);

group('the published page — both languages agree');
// Two missing values are not agreement: a page that carries neither field must not pass by
// comparing undefined with undefined.
check('both pages show the same version', Boolean(servedVersion) && pageVersion(fr.html) === servedVersion, `${servedVersion} against ${pageVersion(fr.html)}`);
check('both pages show the same screenshot count', gallery !== null && pageGallery(fr.html) === gallery, `${gallery} against ${pageGallery(fr.html)}`);

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) {
  if (servedVersion !== manifest.version) {
    console.error(`\nThe store serves ${servedVersion ?? 'no version'} and the repository is at ${manifest.version}:`);
    console.error('the update has not been approved yet. Run this again once it is live.');
  } else {
    console.error('\nThe published listing does not match this repository. Fix the listing, not the checks.');
  }
  process.exit(1);
}
