# Release notes

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
