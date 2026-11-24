# If review rejects it — permissions and single purpose

Two findings account for most first-submission rejections of a small utility: permissions a
reviewer thinks are unused or too broad, and a purpose that reads as more than one. The answer
to both is the same kind of statement — this is what the manifest asks for, this is the line of
code that uses it, this is what happens when you click the icon — so this page holds the replies
in paste-ready form, the evidence that backs each one, and how to send them.

## How to respond

1. Read the rejection email and the item's **Status** tab. They name the policy and usually the
   section; quote that policy by name in the reply.
2. If the finding is right — a permission really is unused, or the listing really does describe
   two things — fix it, rebuild the package (step 2 of [RELEASING.md](RELEASING.md)) and
   resubmit. An appeal that contradicts the submitted files only postpones the same verdict.
3. If the finding is wrong, appeal from the item's detail page in the developer dashboard with
   **Appeal**. It attaches the item ID, the violation and your contact details, so the message
   you write is only the argument; all later communication is by email. Paste the matching reply
   and put the evidence in the same message — a claim about code means nothing to a reviewer who
   cannot see the code without being told where it is.

| What the rejection says | Send |
| --- | --- |
| "requests permissions it does not need", "excessive permissions", or a named permission it says is unused | the permissions reply |
| "multiple purposes", "single purpose", or "functionality beyond the stated purpose" | the single purpose reply |
| both | one message, permissions first, with both evidence lists |

## Permissions: what to send

```
The extension has one screen — a CPU load graph with a memory readout — and it declares three
permissions, all of which that screen uses. It has no host_permissions, no content_scripts, no
optional_permissions and no network code.

system.cpu: this is the only API that exposes system-wide CPU tick counters.
chrome.system.cpu.getInfo() is called once per refresh interval while the popup is open
(popup.js, queryCpuInfo()) and consecutive user/kernel/idle samples are subtracted to produce
the displayed percentage. No other member of that API is called, and it exposes no process
names, application data, page content or user information.

system.memory: the status bar's MEMORY figure is the share of installed RAM in use, which is
what chrome.system.memory.getInfo() reports. popup.js reads total capacity and available
capacity in queryMemoryInfo() and shows their difference as a percentage. The call returns
capacities only — no process names, no per-application usage, no page or user information.

storage: used only to persist the extension's own display preferences (theme, refresh rate,
grid and scanline toggles) and its rolling 120-sample history in chrome.storage.local, so a
setting and the graph survive reopening the popup. chrome.storage.sync is never written, and
nothing stored is transmitted anywhere.

Each is the minimum consistent with the single purpose: no narrower API reports system load or
memory totals, and settings and history cannot survive a popup reload without storage. The manifest is at
manifest.json; the calls are in popup.js; the rationale is in PRIVACY.md.
```

**Evidence to include with it:**

- `manifest.json` — the `permissions` array holds exactly `system.cpu`, `system.memory` and
  `storage`; there is no `host_permissions`, `content_scripts`, `optional_permissions` or
  `externally_connectable`.
  Link: https://github.com/jbodkin1/xload_chrome_ext/blob/main/manifest.json
- `popup.js` — one `getInfo()` call inside `queryCpuInfo()`, and the history write inside
  `persistHistory()`. Link: https://github.com/jbodkin1/xload_chrome_ext/blob/main/popup.js
- `chrome://extensions` on the unpacked package: three permission chips, no site access. A
  screenshot of that card is the fastest way to show a reviewer the grant.
- https://github.com/jbodkin1/xload_chrome_ext/blob/main/PRIVACY.md — the policy already says
  the same thing, including that `chrome.storage.sync` is unused.

If the reviewer specifically says the permission is unused, add one sentence: the popup is the
only place sampling happens, so a reviewer who opens the extension without opening its popup
sees no activity at all — that is the design, not an unused permission. The **Test
instructions** tab in the submission says the same in one line.

## Single purpose: what to send

```
The extension has one purpose: display the system's live CPU load in a retro X11-style popup
graph.

The manifest declares one action popup and one service worker. The worker runs once on install
to write two default settings and an empty history, then stops; it does not sample, schedule
anything or fetch anything. There are no content scripts, no host permissions, no options page
and no other entry point.

Everything inside the popup is presentation of that one figure: the graph itself, six colour
themes, a refresh interval between 0.1 and 5 seconds, a grid and a scanline overlay that can be
switched off, and the persistence of those four display choices plus the graph history. None of
them is a second capability — removing any of them leaves the same single feature, drawn or
kept differently.

The extension makes no network requests, has no accounts, no analytics and no data collection,
so it has no second purpose to serve. The full description is in PRIVACY.md and the store
listing.
```

**Evidence to include with it:**

- The five screenshots in `store/` show the whole product: one window, one graph, one settings
  row. There is no other surface to screenshot.
- `manifest.json` has no `options_page`, `content_scripts`, `side_panel`, `devtools_page` or
  `chrome_url_overrides` — nothing that could carry a second purpose.
- The **Test instructions** tab, which states that sampling happens only while the popup is
  open and that the service worker only writes defaults.

## Regenerating the evidence

Every claim above is re-derived from the repository rather than remembered, so it can be
re-checked before sending:

```bash
node scripts/build-package.mjs                 # the package the reply describes
unzip -Z1 xload-retro-system-monitor-*.zip     # seven entries, no docs, no tooling
node scripts/check-listing.mjs                 # docs, permissions and copy against the code
node scripts/smoke.mjs                         # the package loads and draws in real Chrome
shasum -a 256 xload-retro-system-monitor-*.zip # quote this if the reviewer asks which zip
```

`scripts/smoke.mjs` also reads back Chrome's own permission grant for the installed package and
fails unless the only API permissions are `storage`, `system.cpu` and `system.memory` with no host
permissions,
which is the same fact the permissions reply asserts.
