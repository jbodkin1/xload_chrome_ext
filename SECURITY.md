# Security Policy

xload is a small, self-contained Chrome extension. It reads the local CPU load, draws a graph of it, and does nothing else. This document describes exactly what it touches and what it does not.

## What it reads

Only the system CPU tick counters, through `chrome.system.cpu.getInfo()`. From each core the extension takes the `user`, `kernel` and `idle` counters, diffs them against the previous sample, divides active ticks (user plus kernel) by total ticks (user plus kernel plus idle), and turns the result into a single load percentage. That number is what the graph and the `LOAD:` readout display.

That is the entire data path. The extension does not read page content, DOM, forms, passwords, cookies, tabs, history, bookmarks, downloads, files, clipboard, keystrokes or window titles. It has no `content_scripts`, no `host_permissions`, and no ability to inject anything into a page — it has no page context at all. The only thing it renders is its own popup, and its one background script is a service worker that seeds default settings on install and then stops.

## What it stores

Nothing leaves your machine, and nothing is collected about you: no analytics, no telemetry, no identifiers, no accounts, no usage statistics, no crash reporting, and no network code of any kind in the extension. `fetch`, `XMLHttpRequest` and `WebSocket` are never used, and there is no server for the extension to talk to.

Locally, in Chrome's `chrome.storage.local` for the extension, two small items are kept:

- your settings: theme, refresh rate, and the grid and scanline toggles;
- the rolling history of up to 120 load percentages, so the graph looks continuous the next time you open the popup.

Both are stored by Chrome on your own device, are specific to this extension's origin, and are not readable by websites. They contain nothing but a load percentage and a handful of display preferences. Removing the extension deletes them with it.

Because sampling runs on a timer that lives inside the popup, nothing is measured while the popup is closed.

## Permissions

| Permission | Why |
| --- | --- |
| `system.cpu` | the only way an extension can observe system load; returns per-core tick counters and no process or content information |
| `storage` | persists the settings and the graph history described above |

There are no optional permissions, no `<all_urls>`, no externally connectable messaging, and no `web_accessible_resources`. The extension ships no remote or eval'd code; every line runs as packaged.

## What a compromise would and would not expose

Because the extension holds no host permissions, the worst case for a hypothetical bug in this codebase is confined to the two things it can legitimately reach: a load percentage and a display config. The extension is not in a position to leak page data, credentials or browsing activity, as it cannot see them in the first place.

## Reporting a vulnerability

If you find a security issue, please report it privately through this repository's **Security** tab ("Report a vulnerability"), which opens a GitHub security advisory visible only to the maintainers. Please do not open a public issue for a vulnerability, and allow reasonable time for a fix before disclosing it publicly.

There are no bounties. Reports are read, and fixes ship in the normal release flow.
