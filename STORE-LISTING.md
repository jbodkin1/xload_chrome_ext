# Chrome Web Store submission — copy and dashboard walkthrough

In the order the Developer Dashboard asks for it: developer account, upload, then the
Package, Store listing, Privacy practices, Distribution, Test instructions tabs, then
Submit for Review. Character counts were measured against the live strings, not estimated.
Store limits: item title 45 in `manifest.json` (75 maximum displayed), summary 132,
detailed description 16,384.

- [Before you start: the developer account](#before-you-start-the-developer-account)
- [1. Add new item — upload the package](#1-add-new-item--upload-the-package)
- [2. Package tab (read-only)](#2-package-tab-read-only)
- [3. Store listing tab](#3-store-listing-tab)
- [4. Privacy practices tab](#4-privacy-practices-tab)
- [5. Distribution tab](#5-distribution-tab)
- [6. Test instructions tab](#6-test-instructions-tab)
- [7. Submit for Review](#7-submit-for-review)
- [Before submitting](#before-submitting)

---

## Before you start: the developer account

Everything here lives on the **Account page** of
`https://chrome.google.com/webstore/devconsole`, not on the item, and none of it can be
skipped — publishing is blocked until it is done.

- Accept the developer agreement and pay the one-time registration fee.
- Enable **2-Step Verification** on the Google account. Required before publishing.
- Verify a contact email and set the publisher name to **`Minibiz-Free-Apps`**. That is the
  **Offered by** line the listing and every review email carries, and it applies to every item
  the   account publishes. It is the store account of the person who maintains this repository —
  the same individual, publishing under a name, not a separate vendor — so the Homepage and
  Support URLs below point here and the policy the item is reviewed against is `PRIVACY.md`
  in this repository. The account email cannot be changed later, so use an address you will
  keep.
- Declare **Trader** or **Non-Trader** (EU Digital Services Act). This is a legal statement
  about who is publishing, not about how the item looks, and the store can act on a wrong
  one. For this item:
  - **Non-Trader** — accurate if `Minibiz-Free-Apps` is a name you picked as an individual,
    xload is free with no revenue of any kind (no ads, no in-app purchases, no paid tier, no
    donations link, no paid support), and you are not publishing it as part of a registered
    business. The listing then shows the publisher name and a contact route, nothing else.
  - **Trader** — required if the name belongs to a registered business, or you take money for
    the extension or for support around it. Your legal name, postal address and contact
    details are shown publicly on the listing, and the store may ask you to verify them before
    the item can publish.

  Decide on that basis rather than on the name: a name that sounds like a brand does not make
  you a trader, and a personal-sounding one does not make a trader declaration correct. If you
  add a donations link, ads or a paid tier later, revisit the declaration at the same time.
- If the Account page offers a privacy policy URL, set it to the same `PRIVACY.md` link
  used on the Privacy tab in step 4. Chrome's docs describe the tab's disclosures as
  needing to be "consistent with" the account-level policy.
- A new publisher's allowance **defaults to two published extensions**, though the limit is
  set per account — the dashboard shows yours and offers a request for more. Not relevant for
  this item, worth knowing before the next one.

---

## 1. Add new item — upload the package

Dashboard → **Add new item** → **Choose file** → `xload-retro-system-monitor-1.2.0.zip`
→ **Upload**. Nothing is typed here, but the upload is not a bare parse: the manifest is
validated and the package is installed in a clean profile first, so a broken zip or a
manifest typo fails at this point rather than during review.

Upload the zip attached to the [v1.2.0 release](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.2.0)
or the copy committed at the repository root; they are the same bytes. It is 9,498 bytes with
this SHA-256: check it before uploading, because an asset built before a manifest change is
indistinguishable from the right one by name and would submit the older package.

```bash
shasum -a 256 xload-retro-system-monitor-1.2.0.zip
# 9d676fa86e9acdbdd16257508568f18ea92d98d3c6b461e44caa8d7e337a1a5d
```

Upload limit is 2 GB — this package is 9 KB.

Manifest metadata (name, version, icons, description) is **not editable in the dashboard
after upload**. A typo there means editing the manifest, bumping the version and
re-uploading, so confirm these before choosing the file:

- `name`: `xload Retro System Monitor` — 26 of 45 characters.
- `version`: `1.2.0`.
- `minimum_chrome_version`: `88` — Manifest V3 is supported from Chrome 88 and nothing in
  the package is newer, so the floor is the platform's own. Chrome and the store show
  **Not compatible** rather than installing on anything older.
- `description`: the summary string in step 3, 116 of 132 characters.
- `icons`: 16/48/128 at the package root — three sizes, no 32 (Chrome scales from 48).

---

## 2. Package tab (read-only)

No fields. Use it as the confirmation checkpoint:

- Version shows **1.2.0**.
- Permissions show exactly three entries: `system.cpu`, `system.memory` and `storage`.
- **No host permissions** row appears. If one does, something got into the manifest and
  the upload must be replaced.

---

## 3. Store listing tab

### Summary (132 max)

The dashboard prefills this from `manifest.description`, which already holds the exact
string below — confirm it rather than retyping, and do not paste the alternative on top:

```
A tiny X11-style CPU load graph for your toolbar. No accounts, no telemetry, six CRT themes, and nothing in the way.
```

116 characters. It is the line that shows in search results and category pages.

Unused alternative, plainer (110 characters), kept for reference only:

```
Watch your CPU load in a vintage X11 window: a live scrolling graph, six CRT themes, no telemetry or accounts.
```

### Item title

Read-only here: the store title comes from `manifest.name`, already set to
`xload Retro System Monitor` (26 of the 45 characters the manifest allows; the store
displays up to 75). There is no field to fill in, and changing it means a manifest edit
plus a new upload.

### Detailed description (16,384 max)

Plain text, no Markdown — the store renders line breaks but not formatting, so the `- `
feature bullets appear as literal dashes, as intended. Keep it under about 3,000
characters; reviewers and users both stop reading long ones. This one is 2,988.

```
xload is a small Chrome extension that plots your live CPU load in a window that looks like a 1990s X11 workstation.

Click the toolbar icon and a 400x330 window opens: a navy title bar, "xload - System Load Average" in Courier, and a CRT screen carrying a continuously scrolling graph of total system load. That is the whole extension. There is no sidebar, no onboarding flow, no account, and no settings page hidden three clicks away.

WHY IT EXISTS

Most system monitors are heavyweight: a dashboard, a tray of widgets, a database, an account. Sometimes you just want to know whether your CPU is busy. This is for people who miss the days of fast, simple applications that were not bloated: four small files and a handful of kilobytes of plain JavaScript doing exactly one thing.

WHAT IT DOES

- Live CPU load graph: a rolling 120-point history, so you see the last couple of minutes of behaviour rather than one instantaneous number.
- Live memory readout: MEMORY in the middle of the status bar shows the percentage of installed RAM in use, sampled on the same timer as the graph.
- Six themes: Classic X11 (white paper, red trace), Phosphor Slate, Amber Monitor, Hacker Green, Neon Cyberpunk, and Monochrome.
- Adjustable refresh rate: from 0.1s to 5.0s, defaulting to 1.0s, so you can trade smoothness against cost.
- Toggleable grid and CRT scanlines: alignment lines for reading values, and scanlines if you want the full nostalgic experience.
- Remembers your settings: theme, refresh rate and toggles persist, along with the graph history, so the graph picks up where it left off when you reopen the popup.

HOW IT MEASURES

The load figure is computed honestly, not faked: xload samples chrome.system.cpu.getInfo() and diffs the user, kernel and idle tick counters against the previous sample, summed across all cores, then divides active ticks by total ticks. The result is plotted against an auto-scaling Y axis rounded up to the nearest 10% and capped at 100%, so an idle machine shows a nearly flat line at the bottom instead of a meaningless full-height wiggle.

PRIVACY

No network requests, no analytics, no telemetry, no accounts, no ads. The extension holds only three permissions: system.cpu, to read load counters; system.memory, to read total and available memory for the MEMORY percentage; and storage, to keep your display settings and graph history on your own machine. It cannot read page content, tabs, history, files or clipboard, and nothing is ever uploaded anywhere.

PERMISSIONS

- system.cpu: reads per-core CPU tick counters to calculate load. No process or application information is available to it.
- system.memory: reads total and available memory to show the percentage in use. Capacities only, with no process or application information.
- storage: saves your theme, refresh rate, toggles, and the rolling graph history locally.

No dependencies, no build step, no framework. Source code and security policy: github.com/jbodkin1/xload_chrome_ext
```

### Category

**Developer Tools** — a system monitor, and the audience is people who watch machines.
Chrome scopes that category to tooling for web developers, so **Functionality & UI** is
the other defensible choice for a UI widget like this one. Pick one; don't try to hedge
across both.

### Language

English (United States).

### Graphic assets

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128×128 PNG | Required — upload `icon128.png` if the field is empty |
| Screenshots | 1280×800 (640×400 also accepted) | Five, in `store/` — order below |
| Small promo tile | 440×280 PNG/JPEG | Optional — `store/06-promo-tile-440x280.png` |
| Marquee | 1400×560 PNG/JPEG | Optional — `store/07-marquee-1400x560.png` |

Only the store icon and one screenshot are required; the tiles are worth uploading because
a complete set of assets makes the listing look finished next to items that have them.

#### Screenshot checklist

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
Filling the frame this way is what keeps `LOAD:`, `MEMORY:` and `SCALE:` legible at thumbnail size —
at the earlier 62%-width framing the 9px status line turned to mush when downscaled. Real
`yes` processes produced the load, and the popup's outer drop shadow is neutralised (its
inset bevel is untouched), so nothing in frame casts a shadow.

#### Screenshots produced (`store/`)

Upload in this order — the first shot is the one the store shows largest. All five are
1280×800 PNG, full bleed, no padding, no drop shadow, and show 120 real samples each:

| # | File | Shows |
| --- | --- | --- |
| 1 | `01-hero-classic-x11.png` | default Classic X11 at 1.0s, the first-launch look |
| 2 | `02-hacker-green-load.png` | Hacker Green at 0.1s under real load |
| 3 | `03-amber-monitor.png` | Amber Monitor at 0.5s, a fourth colour with readable readouts |
| 4 | `04-dense-0.1s.png` | Neon Cyberpunk at 0.1s, dense trace |
| 5 | `05-scanlines-off.png` | scanlines off with the grid still on |

`store/gallery.html` shows all five at once for review. Three notes on how they were made,
so a future re-capture matches:

- Shot 3 is one theme, not a menu. A native `<select>` dropdown is drawn by the browser UI
  layer rather than the page, so it cannot appear in a page screenshot; the six-theme overview
  is a composition of six individual real captures, and it now lives in the marquee.
- Legibility limit, measured: a 416×343 tile puts the 9px `LOAD:`/`SCALE:` line at roughly
  2.3 px once the image is downscaled to 320 px wide, and a 2×2 of four larger tiles only
  reached 441×364 (+6%) — still ~2.5 px — because the popup's 1.212:1 aspect makes a 2-row grid
  row-limited, not width-limited. Reading the status line needs a ~1060 px wide tile, i.e. one
  theme per screenshot, which is why shots 1–5 are single themes and the overview is the
  marquee, which shows graph crops and theme labels only — no readouts at all.
- The graph uses a fixed 120-point spacing, so fewer than 120 samples leaves the right side
  of the plot empty. Let the popup run until it holds 120 points before capturing.

To re-capture all five, run `node scripts/capture-screenshots.mjs`. It loads the shipped files
as an unpacked extension in a throwaway Chrome profile, frames the popup exactly as above
(640×400 at device pixel ratio 2, `zoom: 1.1875`, no drop shadow), feeds it real `yes` load
until the popup holds 120 samples, and writes five 1280×800 PNGs to `store/review-<date>/`;
review them there and copy over `store/` when you are happy with them. `--only=6` re-shoots
just the promo tile, `--only=7` re-shoots just the marquee, and `--tiles=<dir>` caches its six
tiles while you tune the grid.

Before uploading each shot, check: no browser chrome or bookmark bar in frame, no clip of
an unrelated window, no text overlay claiming anything the code does not do, nothing
blurry, UI text readable at the store's downscaled thumbnail, and the LOAD value is a
plausible percentage rather than `NaN` or `0.00%` on a busy machine.

#### What the store shows them at

Measured on the live store (21 November 2026), because Google's "Supplying images" page still
says every screenshot is downscaled to 640×400 and the store no longer does that for 1280×800
uploads: they are served whole (`=s1280-w1280-h800`) and the browser scales them down.

| Surface | File served | Rendered box |
| --- | --- | --- |
| Detail-page carousel, 1280 px viewport | 1280×800 | 535×335 |
| Detail-page carousel, 1440–1600 px viewport | 1280×800 | 593×371 |
| Detail-page carousel, ~430 px viewport | 1280×800 | 188×120 |
| Thumbnail strip | 1280×800 | 116×72 (90×56 on the narrow layout) |

On a 2× display the 593 px box is 1186 device px, so the 1280×800 file is used at close to 1:1
and the downscale only bites on a standard-DPI screen. Measured from the finished PNGs, the
9 px status line lands at a **6 px cap height in the 593 px box** (7 px at 640, 8 px at 800):
legible, but that is the floor — one-pixel strokes, with anything smaller turning to texture.
That is exactly what the 116 px thumbnails show; the marquee sidesteps it by carrying no small
text at all. A re-capture should not plan on information smaller than the settings panel:
if it has to be read, it belongs in the popup's own text, never in a tile or a caption.

#### Small promo tile (440×280)

`store/06-promo-tile-440x280.png` (440×280 PNG, 23 KB). It is composed by the capture script
from one Hacker Green frame, not cut by hand: the top 200 px is the CRT screen cropped 880×400
at x 190, y 100 and scaled 0.5:1, so it shows the graph only, with no window chrome and no
title bar — over a dark `#0d0e12` bar carrying the wordmark `xload` in white Courier and the
two-word line `SYSTEM MONITOR` in green. No other text, since promo tiles are not localised
and should not depend on a language.

To re-cut it: `node scripts/capture-screenshots.mjs --only=6`. It captures one 1280×800 frame
at 0.1s, composes the 440×200 strip and the 440×80 bar, and writes the tile to
`store/review-<date>/` like the screenshots, so review both together before copying over
`store/`. The crop, colours, type sizes and tracking are the `tile` spec on shot 6 in the
script, which is why a re-cut follows the current capture instead of a remembered crop; there
is no manual step.

#### Marquee (1400×560)

`store/07-marquee-1400x560.png` (1400×560 PNG, 235 KB), the six-theme overview: a 3×2 grid of
graph crops, each cut inside the CRT screen of a real 1280×800 capture (source rect 190, 100,
896×388) and scaled to 460×199, labelled under the tile, on `#0d0e12` beneath the line
`xload · SIX THEMES · REAL SAMPLES`. Tiles are sized to the full 1400 px width, so there are no
empty side bands, and the settings panel is deliberately out of frame — the marquee shows colour
and trace, never text small enough to be unreadable.

To re-cut it: `node scripts/capture-screenshots.mjs --only=7`, which captures the six tiles at
0.1s (or reuses `--tiles=<dir>`) and composes the grid at 1400×560.

### Additional fields

All optional, none required to submit:

- **Homepage URL** — `https://github.com/jbodkin1/xload_chrome_ext`, worth setting; it
  appears in the Details section of the listing.
- **Support URL** — `https://github.com/jbodkin1/xload_chrome_ext/issues`, worth setting;
  it is where users land instead of emailing you.
- **Official URL** — leave empty. The dropdown only lists sites verified in Google Search
  Console; an unverified publisher shows the publisher name instead.
- **Mature content** — leave off. Mature items are hidden from search for signed-out users.
- **YouTube video** — none.

---

## 4. Privacy practices tab

Chrome requires this tab to be complete before an item can be published, and reviewers
compare it against the submitted code. Each block below is a separate field.

### Single purpose description

```
Displays live CPU load and memory use in a retro X11-style popup graph.
```

71 characters.

### Permission justification — `system.cpu`

```
The extension's only feature is a live CPU load graph. chrome.system.cpu.getInfo() is the sole API that exposes system-wide CPU tick counters; the extension subtracts consecutive user/kernel/idle samples to compute a load percentage for display. No other capability of this permission is used, and it does not expose process names, application data, page content, or any user information. It is the minimum permission consistent with the single purpose.
```

### Permission justification — `system.memory`

```
The popup shows system memory in use as a percentage of installed RAM, which requires chrome.system.memory.getInfo(). The extension reads two numbers from it, total capacity and available capacity, and displays their difference as a percentage; no other capability of this permission is used. The API exposes memory capacities only: it does not reveal which applications are running, what they hold in memory, or any user information. It is the minimum permission consistent with the single purpose.
```

### Permission justification — `storage`

```
Used only to persist the extension's own display preferences (theme, refresh rate, grid and scanline toggles) and up to 120 recent load percentages, all in chrome.storage.local on the user's device, so the popup reopens with the user's settings and a continuous graph. Nothing is written to sync storage, and no data leaves the machine.
```

### Remote code

Select **"No, I am not using remote code."** Accurate: there is no `eval`, no dynamic
import, no remote script, and no network code of any kind in the package.

### Data usage

Two groups of checkboxes; both matter.

- **Data collection:** leave every category unticked. xload does not collect personally
  identifiable information, health, financial, authentication, personal communications,
  location, web history, user activity, or website content. It stores a CPU percentage and a
  display config, which is not user data as the store defines it.
- **Certifications:** tick **every statement in the group**, not just a limited-use one.
  There are three separate claims — limited use, no sale or transfer outside the approved
  cases, and no use or transfer to determine creditworthiness or for lending — and the tab
  will not submit while any is unticked. They are all accurate here precisely because
  nothing is transmitted, advertised, sold or transferred. `PRIVACY.md` carries the same
  three statements, so the policy and the tab agree word for word in substance.

Chrome's policy is that local processing and storage must still be disclosed, even when
nothing is transmitted (see the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), question 3: "Does an extension need to disclose user data handling if the data is only processed or stored locally?"), which is why the `storage`
justification names `chrome.storage.local` and the 120-sample history explicitly. Expect a
reviewer question about that history if they read the code first; the justification already
answers it in the policy's own terms.

### Privacy policy URL

The tab requires a public URL, and the same disclosure must match the code. Use the
dedicated policy page, `PRIVACY.md`:

```
https://github.com/jbodkin1/xload_chrome_ext/blob/main/PRIVACY.md
```

It is written as a standalone policy (scope, retention, Limited Use, contact) rather than
a repository note, which is what a reviewer expects behind this field. `SECURITY.md` covers
the vulnerability-reporting side and is linked from the policy rather than used as the URL.
If the Account page also has a policy field, use this same link there.

---

## 5. Distribution tab

- **Visibility:** Public — the extension is meant to be found. Unlisted keeps it out of search
  and categories but still installable by URL, which is the better choice if you want to test
  the live listing first; all visibility settings go through the same review either way.
- **Regions:** All regions — nothing in the extension is locale or region dependent, and the
  popup is English-only regardless.
- **Paid item / in-app purchases:** none. The extension is free and has nothing to declare.

---

## 6. Test instructions tab

Optional, but not empty for this item. No login, no credentials and no setup beyond
installing, so the tab would otherwise stay blank — but the Privacy answers justify the three
permissions and never mention `background.js`, the one manifest entry a reviewer would have
to guess about. One line closes that gap; paste this:

```
Click the toolbar icon; the first sample appears within about two seconds, there is nothing to sign in to, and sampling happens only while the popup is open — the service worker just writes two default settings on first install and stops.
```

It says the same three things as `PRIVACY.md` in the same words, so a reviewer cross-reading
the two finds no contradiction.

---

## 7. Submit for Review

**Submit for Review** opens a confirmation dialog carrying an **auto-publish** checkbox:

- **Checked:** the item goes live as soon as review passes. Leave the box as the dialog
  presents it if that is what you want; uncheck it to stage the release instead.
- **Unchecked:** the item is staged after review and you publish manually. The staging
  expires after **30 days**, then reverts to a draft that has to be reviewed again. You can
  also choose **Defer publish** from the item's menu after submitting.

For a first submission, unchecking it is the lower-risk option: it lets you look at the live
listing page before it is public. Review duration depends on the item; enable publish/staged
notifications on the Account page if you want the email rather than checking the dashboard.

If it comes back rejected, the replies, evidence and appeal route for the two likely findings —
permissions and single purpose — are in [REJECTION-PLAYBOOK.md](REJECTION-PLAYBOOK.md).

---

## Before submitting

**Account**

- [ ] Developer account registered: 2-Step Verification on, contact email verified, publisher
      name set to `Minibiz-Free-Apps`, Trader/Non-Trader declared per the guidance above on
      revenue and business status, account-level privacy policy URL set if offered.

**Upload**

- [x] Manifest `description` matches the summary above, and `version` is 1.2.0.
- [x] Upload package built: `xload-retro-system-monitor-1.2.0.zip`, 9,498 bytes, sha256
      `9d676fa86e9acdbdd16257508568f18ea92d98d3c6b461e44caa8d7e337a1a5d`.
- [x] Zip holds only the extension files — seven entries, `manifest.json` at the root, no
      `README.md`, `SECURITY.md`, `PRIVACY.md`, `.git` or screenshots.
- [ ] Package uploaded via **Add new item**.

**Package tab**

- [ ] Version 1.2.0, exactly three permissions, no host permissions, minimum Chrome 88.

**Store listing**

- [x] Assets captured: five screenshots, the 440×280 tile and the 1400×560 marquee, in `store/`.
- [ ] Summary confirmed as prefilled (116 chars); detailed description pasted (2,988 chars).
- [ ] Category and language set.
- [ ] Store icon present — upload `icon128.png` if the field is empty.
- [ ] Five screenshots, the promo tile and the marquee uploaded, in the order above.
- [ ] Homepage and Support URLs set.

**Privacy practices**

- [ ] Single purpose, both permission justifications and "no remote code" entered.
- [ ] Data collection boxes all unticked; every certification statement ticked.
- [ ] Privacy policy URL set to the `PRIVACY.md` blob link.

**Distribution**

- [ ] Visibility and regions chosen; nothing to declare under paid items or in-app purchases.

**Submit**

- [ ] Auto-publish decision made, then **Submit for Review**.
