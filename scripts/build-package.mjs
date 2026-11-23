#!/usr/bin/env node
/**
 * Build the package that gets uploaded: PACKAGE_FILES, manifest.json at the root, no
 * directories, no docs, no tooling.
 *
 *   node scripts/build-package.mjs                 # xload-retro-system-monitor-<version>.zip
 *   node scripts/build-package.mjs --out=/tmp/x.zip
 *
 * The file list lives in scripts/package-files.mjs and CI runs this same script, so the
 * package built by hand and the package built on a pull request are one recipe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PACKAGE_FILES, packageFileName } from './package-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const outArg = process.argv.slice(2).find((arg) => arg.startsWith('--out='));
const zipPath = outArg
  ? path.resolve(root, outArg.slice('--out='.length))
  : path.join(root, packageFileName(manifest.version));

const missing = PACKAGE_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`cannot build the package, missing: ${missing.join(', ')}`);
  process.exit(1);
}

// One package at a time: a leftover zip from an earlier version is how a stale file gets
// uploaded. Only the repo root is cleared, and only when writing there.
if (!outArg) {
  for (const file of fs.readdirSync(root)) {
    if (file.endsWith('.zip')) fs.rmSync(path.join(root, file));
  }
}

execFileSync('zip', ['-X', '-q', zipPath, ...PACKAGE_FILES], { cwd: root, stdio: 'inherit' });

const entries = execFileSync('unzip', ['-Z1', zipPath], { cwd: root }).toString().trim().split('\n');
const expected = [...PACKAGE_FILES].sort();
if (JSON.stringify([...entries].sort()) !== JSON.stringify(expected)) {
  console.error(`package holds ${entries.join(' ')}, expected ${expected.join(' ')}`);
  process.exit(1);
}
console.log(`${path.relative(root, zipPath)} — ${entries.length} entries, ${Math.round(fs.statSync(zipPath).size / 1024)} KB`);
