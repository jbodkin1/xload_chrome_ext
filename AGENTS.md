# AGENTS.md

Project instructions for coding agents working in this repository.

## What this is

`xload` is a Chrome extension (Manifest V3): four shipped code files — `manifest.json`,
`popup.html`, `popup.js`, `background.js` — plus the English and French catalogs in
`_locales/` and the icons. No build step, no dependencies,
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

## Checking the French UI

Chrome resolves the message catalog from its **application** language, and that single value is
what `chrome.i18n.getUILanguage()` and `getMessage()` return in the popup and in the service
worker. Nothing in the page can change it, so there are two ways to see the French strings:

- `node scripts/smoke.mjs --catalog=fr` renders the French catalog through Chrome's normal
  lookup on any platform, without touching the browser's own language. `--lang=fr` switches the
  application language on Linux and Windows.
- **macOS ignores `--lang`.** Chrome 158 started with `--lang=fr` still reports `en-US` and
  serves the English catalog; that is Chrome, not the extension. Give the app a French language
  and start it again, then reload the extension:

  ```bash
  defaults write com.google.Chrome AppleLanguages -array fr
  open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-fr
  defaults delete com.google.Chrome AppleLanguages   # afterwards
  ```

  The same setting lives in System Settings → General → Language & Region → Applications →
  Google Chrome → Français, without editing a preference file.

## Browser tooling

`.mcp.json` starts Chrome DevTools MCP with two flags this extension needs:

- `--categoryExtensions` adds the extension tools — `install_extension`,
  `list_extensions`, `reload_extension`, `uninstall_extension`,
  `trigger_extension_action` — so a build can be loaded, reloaded and triggered in a live
  browser instead of only through `scripts/smoke.mjs`.
- `--autoConnect` attaches to Chrome running on your own profile instead of launching a
  throwaway one. That is what makes profile-bound behaviour testable: Chrome's built-in AI
  APIs, and any flow that needs a signed-in user.

`--autoConnect` needs Chrome 144+ and the remote debugging server started inside that
Chrome: open `chrome://inspect/#remote-debugging` and turn it on. Until then the server
still starts and its other tools work, but the first browser tool fails with
`Could not find DevToolsActivePort for chrome at …/Google/Chrome/DevToolsActivePort`. It
connects to that profile, so treat the browser it drives as the user's real browser.

## Conventions

- Commits: author `jbodkin1 <jbodkin@mail.com>`, no AI attribution or `Co-Authored-By`
  trailers. Changes land through a branch and a pull request whose checks pass, then a
  rebase merge; do not rewrite published tags or history.
- `CHANGELOG.md` is the source of the release notes (`scripts/release-notes.mjs` reads
  it), so release prose belongs there rather than in the release body alone.
