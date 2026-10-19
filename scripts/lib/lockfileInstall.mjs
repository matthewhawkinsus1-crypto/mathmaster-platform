/*
 * Does what is installed under node_modules match package-lock.json?
 *
 * The browser workflows add Playwright after `npm ci`. Until Oct 14, 2026 they
 * did it with `npm install --no-save --package-lock=false`, which re-resolves
 * the whole tree from package.json's ranges: 126 locked packages changed on
 * every run (react 19.2.8 -> 19.3.x, firebase 12.17.1 -> 12.19.0, vite
 * 8.2.0 -> 8.3.4), so the browser gates certified a build no one deploys. When
 * react 19.3.1 was published two minutes before react-dom 19.3.1, one run got
 * both versions and the app would not start.
 */

/**
 * @param {object} lock parsed package-lock.json (lockfileVersion 2 or 3)
 * @param {(installPath: string) => string | null} installedVersion version in
 *   `<installPath>/package.json`, or null when nothing is installed there
 * @returns {{ changed: string[], missing: string[] }} packages whose installed
 *   version differs from the lockfile, and required packages not installed.
 *   Packages the lockfile does not list (Playwright itself) are not checked.
 */
export function installDriftFromLockfile(lock, installedVersion) {
  const changed = [];
  const missing = [];
  for (const [installPath, entry] of Object.entries(lock.packages || {})) {
    if (!installPath || entry.link) continue;
    const name = installPath.replace(/^node_modules\//, '');
    const version = installedVersion(installPath);
    if (version === null) {
      // Optional packages are skipped on platforms they do not support.
      if (!entry.optional && !entry.devOptional) missing.push(`${name} ${entry.version}`);
    } else if (version !== entry.version) {
      changed.push(`${name} ${entry.version} -> ${version}`);
    }
  }
  return { changed, missing };
}
