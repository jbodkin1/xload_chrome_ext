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
| Files | 213 |
| Guides | 211 |
| Disciplines | 17 |
| Bytes | 2,074,710 |
| Contents | `SKILL.md`, `guides/**`, upstream `LICENSE` (Apache-2.0) |
| Docs | <https://developer.chrome.com/docs/modern-web-guidance> |

Deliberately not vendored: upstream's plugin manifests (`plugin.json`,
`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.agents/`,
`gemini-extension.json`, `kimi.plugin.json`) and its other skill,
`skills/chrome-extensions`.

The tree is unmodified. Upstream keeps its `LICENSE` at the repository root, so a fresh
clone and `diff -r` report exactly one difference — that added `LICENSE` file. That is
the point of vendoring it unchanged: refreshing is a copy plus a diff, never a merge, and
any other difference means someone edited the vendored copy and it should be reverted.

`scripts/check-listing.mjs` re-derives `Files`, `Guides`, `Disciplines` and `Bytes` from
the tree and compares them with the rows above, checks that `Release` and `Commit` are
recorded and agree with `AGENTS.md`, and checks that `.claude/skills/modern-web-guidance`
still resolves into `skills/`. CI runs it as *docs match the code*. It cannot reach the
network, so it cannot tell you a newer release exists — only that this copy is the one the
documents describe, which is what catches an edit or a half-finished refresh.

### Agent loading

Checked on 24 Nov 2026 on the machine this was set up on:

- **Gemini CLI 0.55.1** — `GEMINI_API_KEY=invalid gemini --debug -p 'hi'` logs
  `[MemoryDiscovery] ... GEMINI.md` followed by `Successfully read and processed imports`
  with a 3,361-character payload against `AGENTS.md`'s 3,303 bytes, so the file is found
  *and* the `@./AGENTS.md` import is expanded. Gemini CLI has no skill directory of its
  own here; those instructions are how it reaches the guides.
- **Claude Code 2.1.139** — not logged in on that machine, so discovery was not observed
  in a session. The layout is the documented one: a `<skill-name>` entry under
  `.claude/skills/` may be a symlink, and Claude Code reads `SKILL.md` from the target and
  loads the skill once even when several locations point at it
  (<https://code.claude.com/docs/en/skills>). 2.1.139 predates native `AGENTS.md` support,
  which is why `CLAUDE.md` imports it.
- Frontmatter fits the listing: `name` is 19 characters and `description` 859 of the 1,536
  characters Claude Code allows before it truncates an entry.

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
3. Recompute the numbers the table records, from the repository root:

   ```sh
   find skills/modern-web-guidance -type f | wc -l                            # Files
   find skills/modern-web-guidance/guides -name '*.md' | wc -l               # Guides
   ls skills/modern-web-guidance/guides | wc -l                              # Disciplines
   find skills/modern-web-guidance -type f -print0 | xargs -0 wc -c | tail -1 # Bytes
   ```
4. Commit it on its own, so the review question is only "is this upstream's release?".
   A diff that edits individual guides is a sign the copy was merged instead of ported.
5. `node scripts/check-listing.mjs --offline` — it re-derives the numbers you just edited,
   so a table that disagrees with the tree fails here rather than in review.
