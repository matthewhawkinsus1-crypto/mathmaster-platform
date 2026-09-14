#!/usr/bin/env node
// Carry the shared Path runtime into the path-admin deployment bundle.
//
// Firebase packages a codebase's OWN source directory. `functions-path-admin/`
// is uploaded; `functions/` is not. The shared Path modules therefore have to
// travel with it.
//
// This is a COPY, not a fork. `functions-path-admin/vendor/` is generated and
// gitignored, `tests/platform/pathAdminCodebaseIsolation.test.mjs` fails if a
// vendored file ever differs from its source, and in the repository the
// path-admin code resolves straight to `functions/` because `vendor/` is not
// there. What is tested and what is deployed are the same bytes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'functions-path-admin', 'vendor');

/**
 * The declared runtime closure.
 *
 * `shared/` is taken whole: the Path issuer reaches tool contracts, generation,
 * grading, equivalence and the standards registry, and enumerating that graph by
 * hand is how a deploy discovers a missing module in production instead of here.
 */
export const VENDORED_PATHS = Object.freeze([
  { from: 'shared', to: 'shared', kind: 'dir' },
  { from: 'lib/pathContentCompiler.js', to: 'lib/pathContentCompiler.js', kind: 'file' },
  { from: 'lib/pathFirestoreShape.js', to: 'lib/pathFirestoreShape.js', kind: 'file' },
  { from: 'lib/mathPath.js', to: 'lib/mathPath.js', kind: 'file' },
]);

const sourceRoot = path.join(ROOT, 'functions');

function filesFor(entry) {
  if (entry.kind === 'file') return [{ from: entry.from, to: entry.to }];
  const dir = path.join(sourceRoot, entry.from);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => ({ from: path.join(entry.from, item.name), to: path.join(entry.to, item.name) }));
}

/** Every (source, vendored) pair this codebase deploys. */
export function vendoredFilePairs() {
  return VENDORED_PATHS.flatMap((entry) => filesFor(entry)).map((pair) => ({
    source: path.join(sourceRoot, pair.from),
    vendored: path.join(VENDOR, pair.to),
    relative: pair.to,
  }));
}

/** Files whose vendored copy is missing or has drifted from its source. */
export function vendorDrift() {
  return vendoredFilePairs().filter((pair) => {
    if (!fs.existsSync(pair.vendored)) return true;
    return fs.readFileSync(pair.vendored) .compare(fs.readFileSync(pair.source)) !== 0;
  });
}

export function syncPathAdminRuntime() {
  const pairs = vendoredFilePairs();
  fs.rmSync(VENDOR, { recursive: true, force: true });
  pairs.forEach((pair) => {
    fs.mkdirSync(path.dirname(pair.vendored), { recursive: true });
    fs.copyFileSync(pair.source, pair.vendored);
  });
  return pairs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pairs = syncPathAdminRuntime();
  console.log(`Synced ${pairs.length} shared Path runtime file(s) into functions-path-admin/vendor/.`);
}
