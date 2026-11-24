# AGENTS.md

Project instructions for coding agents working in this repository.

## What this is

`xload` is a Chrome extension (Manifest V3): four shipped files — `manifest.json`,
`popup.html`, `popup.js`, `background.js` — plus icons. No build step, no dependencies,
no network calls. `README.md` describes it, `RELEASING.md` is the release checklist and
`STORE-LISTING.md` holds the Chrome Web Store copy.

## Before you say something works

- `node scripts/check-listing.mjs --offline` — checks every documented claim against the
  actual files. CI runs it as *docs match the code*; it must stay green. Do not weaken a
  check to make it pass — fix the file or the doc it is complaining about.
- `node scripts/build-package.mjs` — rebuilds `xload-retro-system-monitor-<version>.zip`
  from `scripts/package-files.mjs`, which is the only list of files that ship.
- `node scripts/smoke.mjs` — loads that package in Chrome and drives the popup. CI runs
  it as *popup runs in Chrome*.
- Change what ships and you also change `scripts/package-files.mjs` and every doc that
  counts or lists files.

## Skills

`skills/` holds third-party agent skills vendored at their upstream release. Read the
relevant skill **before** writing web UI, CSS layout or animation, or client-side JS
logic: the platform moves quickly and model training data runs behind it.

### modern-web-guidance

`skills/modern-web-guidance/SKILL.md` is Google Chrome's guidance corpus — 211 guides in
17 disciplines under `skills/modern-web-guidance/guides/`, Apache-2.0, vendored from
`GoogleChrome/modern-web-guidance` at `v1.0.2` (commit `2b4aa13`).

- **When**: any HTML, CSS, DOM or client-side JS work — dialogs and popovers, forms and
  validation, autofill, dark mode, anchor positioning, container queries, view
  transitions, scroll-driven effects, accessibility, performance (LCP/INP/CLS),
  security, web components, built-in AI.
- **How**: follow `SKILL.md`. Its flow drives the live CLI —
  `npx -y modern-web-guidance@latest search "<query>"`, then
  `retrieve "<id>"` — which is authoritative but needs network.
- **Offline**: the guides are vendored and the file name is the guide id, so
  `find skills/modern-web-guidance/guides -name '<id>.md'`. Read the discipline overview
  as well (`css.md`, `html.md`, `js.md`, `forms.md`, `accessibility.md`,
  `performance.md`, `security.md`) when a task spans more than one pattern.
- Upstream ships guidance as *preferred defaults*, not commands: use it where it fits
  the task, and do not add features the user did not ask for to satisfy a guide.

**Do not edit anything under `skills/modern-web-guidance/`.** That tree is byte-identical
to upstream on purpose, so a refresh is a copy plus `diff -r`, never a merge. Provenance,
the pinned version and the exact refresh commands are in `skills/README.md`; do not bump
the version by hand.

## Conventions

- Commits: author `jbodkin1 <jbodkin@mail.com>`, no AI attribution or `Co-Authored-By`
  trailers. Changes land through a branch and a pull request whose checks pass, then a
  rebase merge; do not rewrite published tags or history.
- `CHANGELOG.md` is the source of the release notes (`scripts/release-notes.mjs` reads
  it), so release prose belongs there rather than in the release body alone.
