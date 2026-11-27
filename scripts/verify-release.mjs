#!/usr/bin/env node
/**
 * Verify one release end to end: the tag, the package committed at that tag, the asset GitHub
 * serves, the Latest flag, the changelog section the notes came from, and the pinned privacy URL.
 *
 *   node scripts/verify-release.mjs                  # the version in manifest.json
 *   node scripts/verify-release.mjs --version=1.3.0  # an older release
 *
 * This is RELEASING.md steps 6 to 8 as one command. It is the only thing that looks at what a
 * user actually downloads, so it runs after the release exists and before the store upload. It
 * compares the downloaded asset's bytes with the package committed at the tag, not with the
 * working tree, so a tree that has moved on since the release does not make it pass or fail.
 *
 * Needs network access to api.github.com and a checkout with an `origin` remote. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { packageFileName } from './package-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = argValue('version') || manifest.version;
const tag = `v${version}`;
const zip = packageFileName(version);
// The rest of the checks describe the release the store will get, so they only apply to the
// version in the manifest. An older release is checked for its tag, its asset and its notes.
const current = version === manifest.version;

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

function same(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...rest) => execFileSync('git', rest, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const gitOk = (...rest) => {
  try {
    git(...rest);
    return true;
  } catch {
    return false;
  }
};

const origin = git('remote', 'get-url', 'origin').toString().trim();
const remote = origin.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
if (!remote) {
  console.error(`verify-release: cannot read owner/repo from origin ${JSON.stringify(origin)}`);
  process.exit(2);
}
const [, owner, repoName] = remote;
const api = `https://api.github.com/repos/${owner}/${repoName}`;
const web = `https://github.com/${owner}/${repoName}`;

async function json(url) {
  const res = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'xload-verify-release' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function bytes(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'xload-verify-release' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Release notes are compared as text, not as bytes: GitHub stores the body it was given, but a
// trailing space or a stray blank line is not what this check is for.
const normalize = (text) =>
  (text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// --------------------------------------------------------------- tag and package

group('release — the tag and the package committed at it');

check(`tag ${tag} exists`, gitOk('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`), 'push the tag first');
if (gitOk('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')) {
  check(
    `tag ${tag} is on main`,
    gitOk('merge-base', '--is-ancestor', tag, 'refs/remotes/origin/main'),
    'the tag does not point at a commit main contains'
  );
}

// Read at the tag, not from the working tree: what was committed with the release is what the
// asset has to match, whatever has happened to the files since.
let tagPackage = null;
if (gitOk('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) && gitOk('cat-file', '-e', `${tag}:${zip}`)) {
  tagPackage = git('show', `${tag}:${zip}`);
}
check(`the tag contains ${zip}`, Boolean(tagPackage), 'commit the built package with the release');
if (!tagPackage) {
  console.log(`\n${passes} passed, ${failures.length} failed`);
  console.error(`\nNothing to verify: ${tag} has no ${zip}. Land the package with the tag, then run this again.`);
  process.exit(1);
}
const committedSha = sha256(tagPackage);
console.log(`      ${zip}: ${tagPackage.length.toLocaleString('en-US')} bytes, sha256 ${committedSha}`);

// --------------------------------------------------------------- the release

group('release — what GitHub published');

const release = await json(`${api}/releases/tags/${tag}`);
check(`release ${tag} exists`, Boolean(release), 'create it with gh release create');
if (!release) {
  console.log(`\n${passes} passed, ${failures.length} failed`);
  process.exit(1);
}

same('the release is published, not a draft or prerelease', [release.draft, release.prerelease], [false, false]);
same('the release title names the version', release.name, `xload ${version}`);
check('CHANGELOG.md has a section for this version', new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`, 'm').test(read('CHANGELOG.md')), 'release notes come from it');
if (current && exists('scripts/release-notes.mjs')) {
  const notes = execFileSync('node', ['scripts/release-notes.mjs', version], { cwd: root }).toString();
  same('the release body is the changelog section', normalize(release.body), normalize(notes));
} else if (!current) {
  console.log('      skipped — the body of an older release is not compared: the changelog has moved on since');
}

// --------------------------------------------------------------- the asset

group('release — the asset a user downloads');

same('the release carries exactly the package', release.assets.map((asset) => asset.name), [zip]);
const asset = release.assets.find((entry) => entry.name === zip);
if (asset) {
  same('the asset size matches the committed package', asset.size, tagPackage.length);
  const downloaded = await bytes(asset.browser_download_url);
  same('the downloaded size matches the committed package', downloaded.length, tagPackage.length);
  same('the downloaded sha256 matches the committed package', sha256(downloaded), committedSha);
}

// --------------------------------------------------------------- Latest

if (current) {
  group('release — the Latest flag');

  const latest = await json(`${api}/releases/latest`);
  same('this release is the one GitHub calls Latest', latest && latest.tag_name, tag);
} else {
  console.log(`\nskipped — ${tag} is not the current version, so the Latest flag is not its claim to make`);
}

// --------------------------------------------------------------- pinned policy

group('privacy — the pinned URL serves the policy committed at the tag');

const pinned = `${web}/blob/${tag}/PRIVACY.md`;
if (current) check('STORE-LISTING.md pins that URL', read('STORE-LISTING.md').includes(pinned), `expected ${pinned}`);
const page = await fetch(pinned, { headers: { 'user-agent': 'xload-verify-release' } });
check('the pinned URL answers 200', page.status === 200, `${pinned} answered ${page.status}`);
if (gitOk('cat-file', '-e', `${tag}:PRIVACY.md`)) {
  const committedPolicy = git('show', `${tag}:PRIVACY.md`).toString().replace(/\r\n/g, '\n');
  const served = (await bytes(`https://raw.githubusercontent.com/${owner}/${repoName}/${tag}/PRIVACY.md`)).toString().replace(/\r\n/g, '\n');
  same('the tag serves the policy committed there', served, committedPolicy);
} else {
  check('PRIVACY.md exists at the tag', false, 'nothing to pin');
}

// --------------------------------------------------------------- summary

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nThe release does not match this repository. Fix the release, not the checks.');
  process.exit(1);
}
