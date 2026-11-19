# Releasing

The steps to cut a release, in order. Everything here is a command you can paste; nothing
relies on remembering what was done last time.

## 1. Bump the version and write the notes

- `manifest.json`: set `"version"` to the new number.
- `CHANGELOG.md`: add a section at the top, linked to the release page it will get:

  ```markdown
  ## [1.2.0](https://github.com/jbodkin1/xload_chrome_ext/releases/tag/v1.2.0) — <date>

  ### What changed
  ```

## 2. Rebuild the store zip

Only the seven extension files go in, with `manifest.json` at the zip root — no docs, no
`store/`, no tooling.

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"
rm -f ./*.zip
zip -X -q "$ZIP" manifest.json popup.html popup.js background.js icon16.png icon48.png icon128.png
unzip -Z1 "$ZIP"                                   # exactly 7 entries, no directories
unzip -p "$ZIP" manifest.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version"
unzip -t "$ZIP" | tail -1                          # No errors detected
```

## 3. Check the listing copy against the files

`STORE-LISTING.md` repeats concrete numbers — manifest name and version, icon sizes,
character counts, image dimensions and the zip inventory — and every one of them drifts
quietly after a bump or a re-capture. `scripts/check-listing.mjs` re-derives them from the
repository and exits non-zero on any mismatch:

```bash
node scripts/check-listing.mjs             # also checks that every URL in the doc returns 200
node scripts/check-listing.mjs --offline   # files only, no network
```

Fix whatever it reports before committing; the doc is then checked, not remembered. The same
check runs offline in GitHub Actions on every push to `main` and on every pull request, so
drift fails the build long before release day.

After editing `STORE-LISTING.md`, regenerate the paste file with
`node scripts/build-submission-copy.mjs`. The check fails until it is regenerated, because
`store/SUBMISSION-COPY.txt` has to match the doc verbatim.

**A red `docs match the code` run blocks the merge.** Branch protection on `main` lists that
job — the name GitHub shows, not the workflow's `checks` name — as a required status check
(Settings → Branches). If a failing run ever leaves the merge button enabled, the rule has
been removed or loosened: restore it rather than merging on trust.

## 4. Land the release commit through a pull request, then tag

`main` is protected: a direct `git push origin main` is rejected with `GH006` until the
`docs match the code` check has passed on that commit. The release commit therefore travels
on a branch like any other change, and the tag goes on the merge commit afterwards.

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"
RELEASE_BRANCH="release/$VERSION"

git checkout -b "$RELEASE_BRANCH"
git add manifest.json CHANGELOG.md "$ZIP"
git commit -m "Release $VERSION"
git push -u origin "$RELEASE_BRANCH"

gh pr create --base main --head "$RELEASE_BRANCH" \
  --title "Release $VERSION" \
  --body "Version bump, changelog entry and store zip for $VERSION."
gh pr checks --watch                 # the required check; exits non-zero if it fails
gh pr merge --rebase --delete-branch

git checkout main
git pull --ff-only
git tag -a "v$VERSION" -m "xload $VERSION"
git push origin "v$VERSION"
```

If the check fails, `--watch` exits non-zero and `gh pr merge` refuses; fix the cause, push
to the branch again and the check re-runs. Tags are not covered by branch protection, so the
tag push behaves as before and points at the commit the check passed on.

## 5. Publish the release with notes from the changelog

`scripts/release-notes.mjs` prints one section and handles both heading styles (plain
`## 1.0.0` and linked `## [1.1.0](…)`), so the notes can never drift from the file.

Re-derived here so this step works in a fresh shell:

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"

gh release create "v$VERSION" --title "xload $VERSION" \
  --notes-file <(node scripts/release-notes.mjs "$VERSION")
```

## 6. Attach the package

Re-derived here so this step works in a fresh shell:

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"

gh release upload "v$VERSION" "$ZIP"
gh release view "v$VERSION" --json assets -q '.assets[] | "\(.name) \(.size)"'
```

## 7. Make it the latest release

GitHub marks whichever release is newest by tag creation date, so creating an old tag
afterwards steals the label. Re-derived here so this step works in a fresh shell:

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"

gh release list --limit 5          # check the "Latest" column
gh release edit "v$VERSION" --latest
gh api repos/jbodkin1/xload_chrome_ext/releases/latest -q .tag_name
```

## 8. Verify what a user would download

Re-derived here so this step works in a fresh shell:

```bash
VERSION=$(node -p "require('./manifest.json').version")
ZIP="xload-retro-system-monitor-$VERSION.zip"

curl -sL -o /tmp/asset.zip \
  "https://github.com/jbodkin1/xload_chrome_ext/releases/download/v$VERSION/$ZIP"
shasum -a 256 "$ZIP" /tmp/asset.zip     # must match
rm /tmp/asset.zip
```

## After the release

- The Chrome Web Store upload uses the same zip attached to the release.
- Store listing copy, assets and privacy-tab answers live in `STORE-LISTING.md`; the
  screenshots, promo tile and marquee are in `store/`. After editing either, re-run
  `node scripts/check-listing.mjs`.
