# Release notes

## [1.3.0](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.3.0) — 27 November 2026

The popup now speaks English or French, following Chrome's own language setting.

### Localisation

- New `_locales/en/messages.json` and `_locales/fr/messages.json`: every label, theme name, refresh-rate option and status-bar readout is a message, each with the description a translator works from.
- `manifest.json` declares `default_locale: "en"` and carries `__MSG_extName__` and `__MSG_extDescription__` instead of text, so the extension name and the store summary localize with the rest of the UI.
- `popup.js` resolves every string through `chrome.i18n.getMessage()`, sets `<html lang>` from `chrome.i18n.getUILanguage()`, and fills each `data-i18n` element from the catalog. English stays the fallback for any browser language that is neither English nor French.
- No new permissions and no network code: the catalogs ship with the extension and are read from disk by Chrome.

### Packaging and checks

- Upload package is now `xload-retro-system-monitor-1.3.0.zip`: nine entries, the two catalogs included.
- `README.md`, `STORE-LISTING.md`, `RELEASING.md` and `AGENTS.md` describe the bilingual popup and count nine entries; the store-listing regions note no longer calls the UI English-only.
- `scripts/smoke.mjs` derives its expected readouts from the same messages, and `--catalog=fr` renders the French catalog on any platform (`--lang=fr` covers Linux and Windows), so a run exercises the translation instead of assuming English.
- `scripts/check-listing.mjs` resolves the manifest's message references and checks that both catalogs define the same keys, that every placeholder is declared, and that no label or option text is still hardcoded in `popup.html`.

## [1.2.0](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.2.0) — 24 November 2026

Adds system memory to the popup: a `MEMORY:` percentage in the middle of the status bar.

### Popup

- The status bar now carries a third readout — `MEMORY:` between `LOAD:` and `SCALE:` — showing the percentage of installed RAM in use, sampled on the same timer as the CPU.
- Memory comes from `chrome.system.memory.getInfo()`, as `(capacity - availableCapacity) / capacity`, rounded to a whole percent and clamped to 0–100. The graph itself still plots CPU only.
- The status bar switched from a flex row to a three-column grid (`1fr auto 1fr`) so the memory figure sits at the true centre regardless of how wide the load and scale readouts get.

### Permissions

- `manifest.json` adds `system.memory` beside `system.cpu` and `storage`. It is the only API that reports installed and available memory; it exposes capacities only, so the privacy claims still hold — nothing is collected, and nothing is transmitted.
- Chrome asks the user to approve the new permission when an installed copy updates. That prompt is expected for this version.

### Docs and assets

- `README.md`, `PRIVACY.md`, `SECURITY.md` and `STORE-LISTING.md` now describe three permissions, the memory data path and the new readout, including a `system.memory` justification for the privacy tab.
- `store/`: the five screenshots and the hero image were re-captured with the readout in frame, and the marquee was re-cut from the new captures; its tiles are graph crops, so they look the same. The promo tile is a graph crop too and is unchanged.

## [1.1.0](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.1.0) — 18 November 2026

Prepares the extension for its Chrome Web Store listing; not yet published.

### Packaging

- Upload package `xload-retro-system-monitor-1.1.0.zip`: the seven extension files with `manifest.json` at the zip root — no docs, no screenshots, no tooling.
- `manifest.json` declares `minimum_chrome_version` 88 — Manifest V3's own floor, and older than anything the popup calls — so Chrome and the store show *Not compatible* instead of failing the install on an older browser. The attached zip was rebuilt to include it.
- Manifest short description rewritten to say what the graph actually plots (a live CPU load percentage, not a load average), and root-level `icons` declared.

### Store listing

- `STORE-LISTING.md`: measured descriptions, permission justifications, privacy-practices answers, screenshot checklist and promo-asset notes.
- `PRIVACY.md`: a standalone policy for the listing's privacy-policy URL, with `SECURITY.md` covering vulnerability reports and linked from both.
- `store/`: five 1280×800 screenshots, a 440×280 promo tile and a 1400×560 marquee, each captured from the real popup with real CPU samples and no drop shadow.

### Popup

- History writes are throttled and guarded by a dirty flag, so closing the popup no longer rewrites an unchanged array; config saves now report `chrome.runtime.lastError`.
- Unused config keys (`scaleMode`, `fixedMax`, `graphType`, `simulatedJitter`) removed.

## [1.0.0](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.0.0)

Initial release: a retro X11-style popup plotting live CPU load, with six themes, an adjustable refresh rate and toggleable grid and scanlines.
