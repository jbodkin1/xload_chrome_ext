# Vendored skills

Third-party agent skills, copied from an upstream release rather than edited here.
Nothing in `skills/` ships in the extension: `scripts/package-files.mjs` is the only list
of files that go into the zip.

Agents are pointed at these from `AGENTS.md`; Claude Code also finds
`modern-web-guidance` through the `.claude/skills/` symlink.

## modern-web-guidance

Google Chrome's [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)
corpus, stewarded by the Chrome, Edge, Firefox and MDN teams: a `SKILL.md` workflow plus
one guide per web platform feature or UI pattern.

| | |
| --- | --- |
| Upstream | <https://github.com/GoogleChrome/modern-web-guidance> |
| Release | `v1.0.2` — newest tag, and upstream `HEAD` when this was taken |
| Commit | `2b4aa13a72dd47cd135b06ce5abfccd92e19b24f` |
| Vendored | 23 Nov 2026 |
| Contents | `SKILL.md`, 211 guides in 17 disciplines, upstream `LICENSE` (Apache-2.0) |
| Size | 213 files, 2.4 MB |
| Docs | <https://developer.chrome.com/docs/modern-web-guidance> |

Deliberately not vendored: upstream's plugin manifests (`plugin.json`,
`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.agents/`,
`gemini-extension.json`, `kimi.plugin.json`) and its other skill,
`skills/chrome-extensions`.

The tree is unmodified. Upstream keeps its `LICENSE` at the repository root, so a fresh
clone and `diff -r` report exactly one difference — that added `LICENSE` file. That is
the point of vendoring it unchanged: refreshing is a copy plus a diff, never a merge, and
any other difference means someone edited the vendored copy and it should be reverted.

### Checking for a newer release

```sh
git ls-remote --tags https://github.com/GoogleChrome/modern-web-guidance.git | tail -3
git ls-remote https://github.com/GoogleChrome/modern-web-guidance.git HEAD
```

Tags sort as text, so read the list rather than trusting `tail`; the newest tag and
`HEAD` are usually the same commit while a release is current. Migrating to a new tag is
a deliberate change with its own commit, not something to do while working on something
else.

### Refresh

Run from the repository root. Set `TAG` to the release being adopted.

```sh
TAG=v1.0.2
git clone --depth 1 --branch "$TAG" https://github.com/GoogleChrome/modern-web-guidance.git /tmp/mwg
git -C /tmp/mwg rev-parse HEAD          # record this commit in the table above
rm -rf skills/modern-web-guidance
git -C /tmp/mwg archive HEAD skills/modern-web-guidance | tar -x -C .
cp /tmp/mwg/LICENSE skills/modern-web-guidance/LICENSE
diff -r /tmp/mwg/skills/modern-web-guidance skills/modern-web-guidance   # only LICENSE
rm -rf /tmp/mwg
```

Deleting the directory before extracting is what keeps guides that upstream retired from
lingering behind; copying over the old tree leaves orphans that `diff -r` no longer
explains.

### After refreshing

1. Update `Release`, `Commit`, `Vendored`, `Contents`, `Size` above and the same version
   and commit in `AGENTS.md`.
2. Check the `--skill-version` pin in `SKILL.md` (currently `2026_11_16-268fb9ea`). The
   guide corpus and that CLI pin are versioned separately, so a tag bump can change one
   without the other; leave the line alone only if upstream left it alone.
3. Confirm the counts the docs quote:
   `find skills/modern-web-guidance/guides -name '*.md' | wc -l` and
   `du -sh skills/modern-web-guidance`.
4. Commit it on its own, so the review question is only "is this upstream's release?".
   A diff that edits individual guides is a sign the copy was merged instead of ported.
5. `node scripts/check-listing.mjs --offline` — the vendored copy is out of the package,
   so this should stay green at whatever count it reports on `main`.
