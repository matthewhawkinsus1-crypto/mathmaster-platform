"use strict";

// Where the shared Path runtime lives at run time.
//
// Firebase packages a codebase's OWN source directory: `functions-path-admin/`
// is uploaded, and `../functions/` is not. The shared Path modules therefore
// have to travel with this codebase, and `scripts/sync-path-admin-runtime.mjs`
// copies them into `vendor/` at predeploy.
//
// There is still exactly ONE implementation. `vendor/` is generated, gitignored,
// and a platform test fails if a vendored copy ever differs from its source. In
// the repository (tests, emulator, local development) `vendor/` does not exist
// and the modules resolve straight to `functions/`, so what is tested and what
// is deployed are the same bytes.

const fs = require("fs");
const path = require("path");

const VENDOR_ROOT = path.join(__dirname, "..", "vendor");
const REPO_ROOT = path.join(__dirname, "..", "..", "functions");

/**
 * Absolute path of a shared module.
 *
 * The REPOSITORY copy wins when it is present. In the deployed bundle it never
 * is — `functions/` is not uploaded — so production resolves to `vendor/`. In
 * the repository this means tests, the emulator and local development always
 * read the one real source, and a stale generated copy can never quietly become
 * what is under test.
 */
function runtimeModulePath(relative) {
  const repo = path.join(REPO_ROOT, relative);
  if (fs.existsSync(repo)) return repo;
  const vendored = path.join(VENDOR_ROOT, relative);
  if (fs.existsSync(vendored)) return vendored;
  throw new Error(
    `The Path runtime module ${relative} is not available. Run: npm run deploy:path-admin (which syncs it), or node scripts/sync-path-admin-runtime.mjs.`,
  );
}

/** CommonJS shared module (functions/lib/*.js). */
function requireRuntime(relative) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(runtimeModulePath(relative));
}

/** ESM shared module (functions/shared/*.mjs), loaded lazily and cached. */
const esmCache = new Map();
function importRuntime(relative) {
  if (!esmCache.has(relative)) {
    esmCache.set(relative, import(`file://${runtimeModulePath(relative)}`));
  }
  return esmCache.get(relative);
}

/** True when the shared runtime is resolving to the vendored deployment copy. */
function usingVendoredRuntime() {
  return !fs.existsSync(REPO_ROOT) && fs.existsSync(VENDOR_ROOT);
}

module.exports = { runtimeModulePath, requireRuntime, importRuntime, usingVendoredRuntime, VENDOR_ROOT, REPO_ROOT };
