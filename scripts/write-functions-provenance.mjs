#!/usr/bin/env node
/*
 * STAMP A CLOUD FUNCTIONS CODEBASE WITH THE COMMIT IT IS ABOUT TO SHIP FROM.
 *
 *   node scripts/write-functions-provenance.mjs --codebase default --dir functions
 *   node scripts/write-functions-provenance.mjs --codebase path-admin --dir functions-path-admin
 *
 * The FIRST predeploy command of both codebases in firebase.json, so every way
 * of deploying them — scripts/release-firebase.mjs, the grouped script, a raw
 * `firebase deploy` — uploads <dir>/deploy-provenance.json:
 *
 *   { schemaVersion, codebase, gitSha, gitShaShort, treeClean, writtenAt }
 *
 * functions/lib/deployProvenance.js turns it into the Cloud labels mm-git-sha
 * and mm-tree on every deployed function, and the platformBuildInfo callable
 * serves it (docs/DEPLOY_FROM_CLOUD_SHELL.md, "Which commit is live").
 *
 * Git never fails a deploy: no git, or no repository, writes gitSha "unknown",
 * which the release tool's verify step then refuses to call a finished release.
 * A --dir that is not a directory does fail: a typo in firebase.json should stop
 * the deploy rather than stamp nothing.
 *
 * Idempotent per commit. A file that already records this codebase, commit and
 * tree state is left byte for byte as it is. The Firebase CLI hashes the
 * packaged source and, on a whole-codebase deploy, skips functions whose hash
 * did not change; a fresh timestamp on every run would defeat that and push all
 * ~160 functions into the per-minute mutation quota on a simple re-run.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One implementation of the record and its labels, shared with the deployed
// reader (and, vendored, with the path-admin codebase).
const core = require('../functions/lib/deployProvenance.js');

export const {
  PROVENANCE_FILE_NAME,
  PROVENANCE_SCHEMA_VERSION,
  UNKNOWN_GIT_SHA,
  buildDeployProvenance,
  normalizeDeployProvenance,
  provenanceLabels,
  sanitizeLabelValue,
} = core;

const CODEBASE_NAME = /^[a-z0-9_-]{1,63}$/;

/**
 * Whether an existing deploy-provenance.json already says what this run would
 * say (same codebase, commit and tree state) and can be kept as it is. Pure.
 */
export const keepExistingProvenance = (existingRaw, next) => {
  if (!existingRaw || typeof existingRaw !== 'object' || existingRaw.schemaVersion !== PROVENANCE_SCHEMA_VERSION) return false;
  if (!next || next.gitSha === UNKNOWN_GIT_SHA) return false;
  const existing = normalizeDeployProvenance(existingRaw);
  return existing.codebase === next.codebase
    && existing.gitSha === next.gitSha
    && existing.treeClean === next.treeClean
    && Boolean(existing.writtenAt);
};

/** `git <args>` in the repository, or null when git is missing or fails. */
const runGit = (args) => {
  try {
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 });
    if (result.error || result.status !== 0) return null;
    return String(result.stdout ?? '');
  } catch {
    return null;
  }
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Write (or keep) <dir>/deploy-provenance.json. `git` and `now` are injectable
 * so the decision can be exercised without a repository or a clock.
 */
export const writeFunctionsProvenance = ({ codebase, dir, git = runGit, now = () => new Date() } = {}) => {
  const name = String(codebase ?? '').trim();
  if (!CODEBASE_NAME.test(name)) throw new Error(`--codebase must be a Firebase Functions codebase name, got "${codebase ?? ''}".`);
  if (!dir) throw new Error('--dir is required: the codebase source directory, as in firebase.json.');
  const targetDir = path.resolve(repoRoot, String(dir));
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`--dir ${dir} is not a directory (resolved to ${targetDir}).`);
  }

  const headSha = git(['rev-parse', 'HEAD']);
  const porcelainStatus = git(['status', '--porcelain']);
  const next = buildDeployProvenance({
    gitSha: headSha === null ? null : headSha.trim(),
    porcelainStatus,
    nowIso: now().toISOString(),
    codebase: name,
  });

  const file = path.join(targetDir, PROVENANCE_FILE_NAME);
  const existing = readJson(file);
  if (keepExistingProvenance(existing, next)) {
    return { file, provenance: normalizeDeployProvenance(existing), written: false };
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return { file, provenance: next, written: true };
};

const option = (argv, name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null;
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  try {
    const { file, provenance, written } = writeFunctionsProvenance({ codebase: option(argv, 'codebase'), dir: option(argv, 'dir') });
    const labels = provenanceLabels(provenance);
    console.log(`deploy provenance [${provenance.codebase}] ${provenance.gitShaShort} (${labels['mm-tree']}) -> ${path.relative(repoRoot, file) || file} ${written ? '(written)' : '(unchanged: same commit and tree)'}`);
    if (provenance.gitSha === UNKNOWN_GIT_SHA) {
      console.warn('WARNING: git could not name the commit; these functions will report gitSha "unknown".');
    }
  } catch (error) {
    console.error(`write-functions-provenance: ${error.message}`);
    console.error('Usage: node scripts/write-functions-provenance.mjs --codebase <name> --dir <codebase source dir>');
    process.exit(2);
  }
}
