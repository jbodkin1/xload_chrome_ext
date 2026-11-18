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

## 3. Commit and tag

```bash
git add manifest.json CHANGELOG.md "$ZIP"
git commit -m "Release $VERSION"
git tag -a "v$VERSION" -m "xload $VERSION"
git push origin main
git push origin "v$VERSION"
```

## 4. Publish the release with notes from the changelog

`scripts/release-notes.mjs` prints one section and handles both heading styles (plain
`## 1.0.0` and linked `## [1.1.0](…)`), so the notes can never drift from the file.

```bash
gh release create "v$VERSION" --title "xload $VERSION" \
  --notes-file <(node scripts/release-notes.mjs "$VERSION")
```

## 5. Attach the package

```bash
gh release upload "v$VERSION" "$ZIP"
gh release view "v$VERSION" --json assets -q '.assets[] | "\(.name) \(.size)"'
```

## 6. Make it the latest release

GitHub marks whichever release is newest by tag creation date, so creating an old tag
afterwards steals the label:

```bash
gh release list --limit 5          # check the "Latest" column
gh release edit "v$VERSION" --latest
gh api repos/jbodkin1/xload_chrome_ext/releases/latest -q .tag_name
```

## 7. Verify what a user would download

```bash
curl -sL -o /tmp/asset.zip \
  "https://github.com/jbodkin1/xload_chrome_ext/releases/download/v$VERSION/$ZIP"
shasum -a 256 "$ZIP" /tmp/asset.zip     # must match
rm /tmp/asset.zip
```

## After the release

- The Chrome Web Store upload uses the same zip attached to the release.
- Store listing copy, assets and privacy-tab answers live in `STORE-LISTING.md`; the
  screenshots, promo tile and marquee are in `store/`.
