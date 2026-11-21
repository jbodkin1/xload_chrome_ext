#!/usr/bin/env node
/**
 * Regenerate store/SUBMISSION-COPY.txt from STORE-LISTING.md.
 *
 *   node scripts/build-submission-copy.mjs
 *
 * The paste file is the one thing you type into the dashboard from, while STORE-LISTING.md is
 * where the copy is edited. This writes the file from the doc so the two cannot disagree, and
 * scripts/check-listing.mjs fails if the committed file stops matching.
 *
 * No dependencies, no arguments: it reads the repository from the current directory and
 * overwrites store/SUBMISSION-COPY.txt.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const listingPath = path.join(root, 'STORE-LISTING.md');
const outPath = path.join(root, 'store', 'SUBMISSION-COPY.txt');

const doc = fs.readFileSync(listingPath, 'utf8');
const blocks = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));

function pick(description, test) {
  const block = blocks.find(test);
  if (!block) {
    console.error(`build-submission-copy: no ${description} found in STORE-LISTING.md`);
    process.exit(1);
  }
  return block;
}

const summary = pick('summary block', (b) => b.startsWith('A tiny X11-style'));
const detailed = pick('detailed description block', (b) => b.startsWith('xload is a small Chrome extension'));
const singlePurpose = pick('single-purpose answer', (b) => b.startsWith('Displays the system'));
const cpuAnswer = pick('system.cpu justification', (b) => b.includes('chrome.system.cpu.getInfo() is the sole API'));
const storageAnswer = pick('storage justification', (b) => b.startsWith('Used only to persist'));
const testInstructions = pick('test-instructions answer', (b) => b.startsWith('Click the toolbar icon'));

const policyUrl = (doc.match(/https?:\/\/[^\s`)>"]*\/PRIVACY\.md/) || [])[0];
if (!policyUrl) {
  console.error('build-submission-copy: no PRIVACY.md URL found in STORE-LISTING.md');
  process.exit(1);
}

const n = (value) => value.toLocaleString('en-US');
const bar = (title) => `=== ${title} ===`;

const out = [
  'xload Retro System Monitor - copy to paste into the Chrome Web Store dashboard',
  'Generated from STORE-LISTING.md by scripts/build-submission-copy.mjs. Do not edit by hand:',
  'run that script instead, and scripts/check-listing.mjs will tell you if this file drifts.',
  'Paste only the text under each header. The headers and the blank lines between sections are not part of any field.',
  '',
  bar(`SUMMARY - Store listing (${n(summary.length)} characters, limit 132)`),
  summary,
  '',
  bar(`DETAILED DESCRIPTION - Store listing (${n(detailed.length)} characters, limit 16,384)`),
  detailed,
  '',
  bar(`PRIVACY TAB - SINGLE PURPOSE (${n(singlePurpose.length)} characters)`),
  singlePurpose,
  '',
  bar('PRIVACY TAB - PERMISSION JUSTIFICATION: system.cpu'),
  cpuAnswer,
  '',
  bar('PRIVACY TAB - PERMISSION JUSTIFICATION: storage'),
  storageAnswer,
  '',
  bar('PRIVACY TAB - REMOTE CODE'),
  'No, I am not using remote code.',
  '',
  bar('PRIVACY TAB - PRIVACY POLICY URL'),
  policyUrl,
  '',
  bar('PRIVACY TAB - DATA COLLECTION'),
  'Leave every category unticked: no personally identifiable information, health, financial,',
  'authentication, personal communications, location, web history, user activity or website',
  'content is collected.',
  '',
  bar('PRIVACY TAB - CERTIFICATIONS (tick all three)'),
  "1. Limited Use: data is used only for the extension's single purpose.",
  '2. Not sold, and not transferred outside the approved cases.',
  '3. Not used or transferred to determine creditworthiness or for lending.',
  '',
  bar('TEST INSTRUCTIONS - Test instructions tab'),
  testInstructions,
  '',
].join('\n');

fs.writeFileSync(outPath, out);
console.log(`wrote ${path.relative(root, outPath)} (${Buffer.byteLength(out)} bytes)`);
console.log(`summary ${summary.length}, detailed ${detailed.length}, single purpose ${singlePurpose.length}`);
