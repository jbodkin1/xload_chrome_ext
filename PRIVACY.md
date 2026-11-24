# Privacy Policy — xload Retro System Monitor

**Last updated: 24 November 2026**

xload is a Chrome extension that displays a live CPU load graph in a popup styled after a vintage X11 application. This policy describes exactly what the extension can access, what it stores, and what it does with that information. It applies to xload wherever it is installed, including the copy distributed through the Chrome Web Store. That copy is published under the publisher name **Minibiz-Free-Apps**, which is the store account of the person who maintains this repository at <https://github.com/jbodkin1/xload_chrome_ext> — the same individual, publishing under a name, not a separate vendor.

## Summary

- xload does **not** collect, transmit, sell or share any personal data.
- It has **no** network code: no `fetch`, no `XMLHttpRequest`, no WebSocket, no telemetry, no analytics, no crash reporting, no accounts.
- It reads **only** local CPU tick counters and memory capacity figures, and stores **only** your display settings and a short graph history on your own device.

## What the extension accesses

**CPU load counters.** xload calls `chrome.system.cpu.getInfo()` and reads the per-core `user`, `kernel` and `idle` tick counters. It subtracts consecutive samples to calculate a single system load percentage, which is what the graph draws. That API does not expose process names, application data, open windows, files or anything about you; there is nothing else in it to read.

**Memory capacity.** xload calls `chrome.system.memory.getInfo()` and reads two numbers: the machine's total installed memory and its available memory. Their difference, as a percentage of the total, is the `MEMORY:` readout in the status bar. Both are capacities, not contents — the API does not expose which applications are running, what they hold in memory, or anything about your files, windows or pages.

**Nothing else.** The extension has no host permissions and no content scripts, so it cannot read page content, DOM, forms, passwords, cookies, tabs, browsing history, bookmarks, downloads, clipboard or keystrokes. Its only user interface is its own popup window. The package does contain one background script — a service worker that writes those same two defaults the first time the extension is installed and then stops; it does no sampling, opens no connections, and does not run persistently.

## What is stored, and where

Two items are saved in `chrome.storage.local`, which keeps them on your device:

1. **Settings** — the selected theme, refresh rate, and the grid and scanline toggles.
2. **Graph history** — up to the 120 most recent load percentages, so the graph looks continuous when you reopen the popup.

Both are stored by Chrome under the extension's own origin. They are not accessible to websites, are never written to `chrome.storage.sync`, and are not transmitted anywhere: the extension has no server to send them to.

**Retention:** the history is a rolling window — each new sample replaces the oldest once 120 are held. Sampling happens only while the popup is open: there is no alarm, timer or background sampling, so the history does not change while the popup is closed. Everything is deleted from your device when you uninstall the extension or clear its data in Chrome.

## What is not done with data

No data is sold, rented, transferred or disclosed to third parties, because none is collected. No data is used for advertising, profiling, creditworthiness, lending, or any purpose unrelated to drawing the graph. There is no advertising, no affiliate code, and no third-party SDK in the package.

## Permissions and why they are needed

| Permission | Purpose |
| --- | --- |
| `system.cpu` | read the CPU tick counters used to compute the load percentage shown in the graph |
| `system.memory` | read total and available memory to show the `MEMORY:` percentage in the status bar |
| `storage` | save the settings and graph history described above, locally |

Neither permission is optional or requested at runtime; both are declared in the manifest and used for the purposes stated.

## Limited Use statement

xload's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used solely to provide the extension's single purpose — displaying a CPU load graph and the memory readout — and is not transferred except as necessary for that purpose, which in this case means it is not transferred at all. It is not sold, not used or transferred for purposes unrelated to that single purpose, and not used or transferred to determine creditworthiness or for lending purposes — the three certifications the Chrome Web Store privacy tab asks for.

## Children

The extension is a system utility. It does not knowingly collect information from anyone, including children under 13.

## Changes to this policy

If a future version of xload ever adds a feature that changes these practices, this document will be updated before that version is published, and the change will be noted in the extension's release notes and version history.

## Contact

Questions about this policy, or a security report, go through the repository:

- Security issues: open a private advisory via the **Security** tab of <https://github.com/jbodkin1/xload_chrome_ext>
- Anything else: open an issue at <https://github.com/jbodkin1/xload_chrome_ext/issues>

See also [SECURITY.md](SECURITY.md) for the security policy.
