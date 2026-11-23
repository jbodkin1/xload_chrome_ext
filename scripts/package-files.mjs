/**
 * The package: the only files that ship, in the order they go into the zip.
 *
 * Everything that builds, loads or checks the store package reads this list — the build
 * script, CI, the smoke test, the screenshot capture and the docs checker — so adding a
 * shipped file is a one-line change here instead of an edit in five places that can drift.
 */
export const PACKAGE_FILES = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'background.js',
  'icon16.png',
  'icon48.png',
  'icon128.png',
];

/** The store package's file name, derived from the manifest version. */
export const packageFileName = (version) => `xload-retro-system-monitor-${version}.zip`;
