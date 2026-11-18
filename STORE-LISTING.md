# Chrome Web Store listing — draft copy

Everything the Developer Dashboard asks for, in the order it asks for it. Character counts
were measured against the live strings, not estimated. Store limits: name 75, short
description 132, detailed description 16,384.

---

## Store listing tab

### Item name (25 / 75)

```
xload Retro System Monitor
```

### Short description (132 max)

This is the `description` field in `manifest.json`, and the line that shows in search
results. It must also be updated in the manifest before upload.

```
A tiny X11-style CPU load graph for your toolbar. No accounts, no telemetry, six CRT themes, and nothing in the way.
```

Alternative, plainer:

```
Watch your CPU load in a vintage X11 window: a live scrolling graph, six CRT themes, no telemetry or accounts.
```

### Category

**Developer Tools** — it is a system monitor and the audience is people who watch machines.
(`Productivity` is the fallback if Developer Tools feels too narrow.)

### Language

English (United States).

### Detailed description (16,384 max)

Plain text, no Markdown — the store renders line breaks but not formatting. Keep it under
about 3,000 characters; reviewers and users both stop reading long ones.

```
xload is a small Chrome extension that plots your live CPU load in a window that looks like a 1990s X11 workstation.

Click the toolbar icon and a 400x330 window opens: a navy title bar, "xload - System Load Average" in Courier, and a CRT screen carrying a continuously scrolling graph of total system load. That is the whole extension. There is no sidebar, no onboarding flow, no account, and no settings page hidden three clicks away.

WHY IT EXISTS

Most system monitors are heavyweight: a dashboard, a tray of widgets, a database, an account. Sometimes you just want to know whether your CPU is busy. This is for people who miss the days of fast, simple applications that were not bloated: four small files and a handful of kilobytes of plain JavaScript doing exactly one thing.

WHAT IT DOES

- Live CPU load graph: a rolling 120-point history, so you see the last couple of minutes of behaviour rather than one instantaneous number.
- Six themes: Classic X11 (white paper, red trace), Phosphor Slate, Amber Monitor, Hacker Green, Neon Cyberpunk, and Monochrome.
- Adjustable refresh rate: from 0.1s to 5.0s, defaulting to 1.0s, so you can trade smoothness against cost.
- Toggleable grid and CRT scanlines: alignment lines for reading values, and scanlines if you want the full nostalgic experience.
- Remembers your settings: theme, refresh rate and toggles persist, along with the graph history, so the graph picks up where it left off when you reopen the popup.

HOW IT MEASURES

The load figure is computed honestly, not faked: xload samples chrome.system.cpu.getInfo() and diffs the user and kernel tick counters against the previous sample, summed across all cores. The result is plotted against an auto-scaling Y axis rounded up to the nearest 10% and capped at 100%, so an idle machine shows a nearly flat line at the bottom instead of a meaningless full-height wiggle.

PRIVACY

No network requests, no analytics, no telemetry, no accounts, no ads. The extension holds only two permissions: system.cpu, to read load counters, and storage, to keep your display settings and graph history on your own machine. It cannot read page content, tabs, history, files or clipboard, and nothing is ever uploaded anywhere.

PERMISSIONS

- system.cpu: reads per-core CPU tick counters to calculate load. No process or application information is available to it.
- storage: saves your theme, refresh rate, toggles, and the rolling graph history locally.

No dependencies, no build step, no framework. Source code and security policy: github.com/jbodkin1/xload_chrome_ext
```

---

## Privacy practices tab

Chrome requires this tab to be complete before an item can be published, and reviewers
compare it against the submitted code.

### Single purpose

```
Displays the system's live CPU load in a retro X11-style popup graph.
```

### Permission justification — `system.cpu`

```
The extension's only feature is a live CPU load graph. chrome.system.cpu.getInfo() is the sole API that exposes system-wide CPU tick counters; the extension subtracts consecutive user/kernel/idle samples to compute a load percentage for display. No other capability of this permission is used, and it does not expose process names, application data, page content, or any user information. It is the minimum permission consistent with the single purpose.
```

### Permission justification — `storage`

```
Used only to persist the extension's own display preferences (theme, refresh rate, grid and scanline toggles) and up to 120 recent load percentages, all in chrome.storage.local on the user's device, so the popup reopens with the user's settings and a continuous graph. Nothing is written to sync storage, and no data leaves the machine.
```

### Remote code

Select **"No, I am not using remote code."** Accurate: there is no `eval`, no dynamic
import, no remote script, and no network code of any kind in the package.

### Data usage disclosures

Chrome's policy is that local processing and storage must still be disclosed, even when
nothing is transmitted (see the User Data FAQ, question 3). So:

- The **data collection checkboxes**: no category applies. xload does not collect
  personally identifiable information, health, financial, authentication, personal
  communications, location, web history, user activity, or website content. It stores a
  CPU percentage and a display config, which is not user data as the store defines it.
- **Certify the Limited Use requirements** — it is compliant precisely because there is no
  transmission, no advertising, and no sale or transfer of anything.
- Expect a reviewer question about the stored history if they read the code first; the
  `storage` justification above already answers it in the same terms the policy uses.

### Privacy policy URL

The tab requires a public URL, and the same disclosure must match the code. Use the
dedicated policy page, `PRIVACY.md`:

```
https://github.com/jbodkin1/xload_chrome_ext/blob/main/PRIVACY.md
```

It is written as a standalone policy (scope, retention, Limited Use, contact) rather than
a repository note, which is what a reviewer expects behind this field. `SECURITY.md` covers
the vulnerability-reporting side and is linked from the policy rather than used as the URL.

---

## Graphic assets

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128×128 PNG | Required — `icon128.png` exists |
| Screenshots | 1280×800 (640×400 also accepted) | Five captured, in `store/` |
| Small promo tile | 440×280 PNG/JPEG | Produced — `store/06-promo-tile-440x280.png` |
| Marquee | 1400×560 PNG/JPEG | Optional, for featured placement |

### Screenshot checklist

Constraints first, because these are the usual rejection reasons: at least one screenshot,
up to five; **1280×800** (640×400 accepted); PNG or JPEG; **square corners, full bleed, no
padding, no rounded corners, no drop shadow**; upright and undistorted; must show the real
popup from the current version, not a mockup.

The popup is 400×330 (1.212:1), so in a 1.6:1 frame it is height-limited: filling the frame
vertically gives 950×784 of popup — 74% of the width and 98% of the height — which is the
largest the popup can be without cropping or distortion. These were captured that way: the
unpacked extension at a 2× device pixel ratio inside a 640×400 viewport, with the popup
scaled by CSS `zoom: 1.1875` so it fills the frame height (text rasterises at that size, so
it stays sharp; the canvas scales through the existing `image-rendering: pixelated`).
Filling the frame this way is what keeps `LOAD:` and `SCALE:` legible at thumbnail size —
at the earlier 62%-width framing the 9px status line turned to mush when downscaled. Real
`yes` processes produced the load, and the popup's outer drop shadow is neutralised (its
inset bevel is untouched), so nothing in frame casts a shadow.

### Screenshots produced (`store/`)

All five are 1280×800 PNG, full bleed, no padding, no drop shadow, and show 120 real
samples each:

| # | File | Shows |
| --- | --- | --- |
| 1 | `01-hero-classic-x11.png` | default Classic X11 at 1.0s, the first-launch look |
| 2 | `02-hacker-green-load.png` | Hacker Green at 0.1s under real load |
| 3 | `03-theme-tour.png` | all six themes, each a real capture, in a 3×2 grid at 1280×800 |
| 4 | `04-dense-0.1s.png` | Neon Cyberpunk at 0.1s, dense trace |
| 5 | `05-scanlines-off.png` | scanlines off with the grid still on |

`store/gallery.html` shows all five at once for review. Two notes on how they were made,
so a future re-capture matches:

- Shot 3 is a montage, not a menu. A native `<select>` dropdown is drawn by the browser UI
  layer rather than the page, so it cannot appear in a page screenshot; the tour shows all
  six themes as individual real captures instead, so the full range is visible in one asset.
- Legibility limit, measured: tiles are 416×343 in the 3×2 grid, which puts the 9px
  `LOAD:`/`SCALE:` line at roughly 2.3 px once the image is downscaled to 320 px wide. A 2×2
  of four larger tiles was tried and only reached 441×364 (+6%) — still ~2.5 px — because the
  popup's 1.212:1 aspect makes a 2-row grid row-limited, not width-limited. Reading the status
  line needs a ~1060 px wide tile, i.e. one theme per screenshot. Readable numbers are what
  shots 1, 2, 4 and 5 provide; shot 3 is deliberately a theme showcase, and stays six-wide so
  that no theme is hidden.
- The graph uses a fixed 120-point spacing, so fewer than 120 samples leaves the right side
  of the plot empty. Let the popup run until it holds 120 points before capturing.

Before uploading each shot, check: no browser chrome or bookmark bar in frame, no clip of
an unrelated window, no text overlay claiming anything the code does not do, nothing
blurry, UI text readable at the store's downscaled thumbnail, and the LOAD value is a
plausible percentage rather than `NaN` or `0.00%` on a busy machine.

### Small promo tile (440×280)

Produced: `store/06-promo-tile-440x280.png` (440×280 PNG, 44 KB). It is composed from the
Hacker Green capture — the top 200 px is the CRT screen cropped 880×400 and scaled 0.5:1,
so it shows the graph only, with no window chrome and no title bar — over a dark `#0d0e12`
bar carrying the wordmark `xload` and the two-word line `SYSTEM MONITOR`. No other text,
since promo tiles are not localised and should not depend on a language.

To re-cut it after a re-capture: keep the 440×200 graph strip and the 440×80 wordmark bar,
and aim the crop inside the CRT screen (roughly x 200..1080, y 96..496 of a 1280×800 shot).

---

## Before submitting

- [x] Manifest `description` matches the short description above, and `version` is 1.1.0.
- [x] Upload package built: `xload-retro-system-monitor-1.1.0.zip`.
- [x] Screenshots captured: the five files in `store/`.
- [ ] Privacy policy URL set to the `PRIVACY.md` blob link above.
- [ ] Fill in the privacy practices tab: single purpose, both permission justifications,
      "no remote code", and the Limited Use certification.
- [x] Zip holds only the extension files — seven entries, `manifest.json` at the root, no
      `README.md`, `SECURITY.md`, `PRIVACY.md`, `.git` or screenshots.
- [ ] Confirm the dashboard's permission list matches the manifest exactly (two entries),
      and that no host permissions appear.
