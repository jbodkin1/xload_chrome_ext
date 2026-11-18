#!/usr/bin/env node
/**
 * Print one version's section from CHANGELOG.md, for use as GitHub release notes.
 *
 *   node scripts/release-notes.mjs 1.1.0
 *   gh release create v1.1.0 --title "xload 1.1.0" --notes-file <(node scripts/release-notes.mjs 1.1.0)
 *
 * Handles both heading styles the changelog uses:
 *
 *   ## 1.0.0
 *   ## [1.1.0](https://github.com/…/releases/tag/v1.1.0) — 18 November 2026
 *
 * A leading "v" in the argument is accepted, and the version must end the version
 * token, so asking for 1.1.0 can never match a 1.1.01 section.
 */
import fs from 'node:fs';
import path from 'node:path';

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const version = raw.replace(/^v/, '').trim();
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ## [<version>](link) — date   |   ## <version>   |   ## <version> — date
const heading = new RegExp(
  `^##\\s+(?:\\[)?v?${escaped}(?:\\])?(?:\\([^)]*\\))?(?:\\s|$)`
);

const changelog = path.join(process.cwd(), 'CHANGELOG.md');
const lines = fs.readFileSync(changelog, 'utf8').split('\n');

const start = lines.findIndex((line) => heading.test(line));
if (start === -1) {
  console.error(`release-notes: no section for ${version} in ${path.basename(changelog)}`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) { end = i; break; }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  console.error(`release-notes: section for ${version} is empty`);
  process.exit(1);
}

process.stdout.write(body + '\n');
