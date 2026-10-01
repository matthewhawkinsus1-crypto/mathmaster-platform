"use strict";

// WHICH COMMIT THESE CLOUD FUNCTIONS WERE BUILT FROM (F-REL-3).
//
// Hosting publishes mathmaster-build.json; a deployed function used to carry
// nothing that said which code it was, so when a callable misbehaved nobody
// could say what was live. Now the FIRST predeploy step of each codebase
// (firebase.json)
//
//   node scripts/write-functions-provenance.mjs --codebase <name> --dir <source>
//
// writes deploy-provenance.json into the codebase's source directory just
// before the Firebase CLI packages it. Every deploy path runs it — the release
// tool, the grouped script and a raw `firebase deploy` — so every upload carries
// the commit it was made from. The file is gitignored but NOT in the codebase's
// `ignore` list: the CLI packages by `ignore`, never by .gitignore.
//
// This module is the one implementation of the record and its labels:
//   * the writer script imports the pure helpers below;
//   * functions/index.js stamps every function with deployProvenanceLabels
//     (setGlobalOptions) and serves deployProvenance from platformBuildInfo;
//   * functions-path-admin carries a vendored copy
//     (scripts/sync-path-admin-runtime.mjs) and points readDeployProvenance at
//     its own file.
//
// Reading never throws. A missing or malformed file is a deployment that cannot
// say where it came from, and it says so: gitSha "unknown".

const fs = require("fs");
const path = require("path");

const PROVENANCE_SCHEMA_VERSION = 1;
const PROVENANCE_FILE_NAME = "deploy-provenance.json";
const UNKNOWN_GIT_SHA = "unknown";

// Cloud labels: keys and values may hold lowercase letters, digits, "_" and
// "-", at most 63 characters; a key must start with a letter.
const LABEL_MAX_LENGTH = 63;
const LABEL_KEYS = Object.freeze({ gitSha: "mm-git-sha", tree: "mm-tree" });

const FULL_SHA = /^[0-9a-f]{40}$/;

/** A full 40-character commit id, lowercased, or "unknown". */
function normalizeGitSha(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return FULL_SHA.test(text) ? text : UNKNOWN_GIT_SHA;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * The provenance record a predeploy writes. Pure: the caller supplies the git
 * facts and the clock.
 *
 * @param {object} facts
 * @param {string|null} facts.gitSha           `git rev-parse HEAD`, or null when git is unavailable
 * @param {string|null} facts.porcelainStatus  `git status --porcelain`, or null when git is unavailable
 * @param {string} facts.nowIso                when it was written
 * @param {string} facts.codebase              the Firebase Functions codebase name
 */
function buildDeployProvenance({ gitSha = null, porcelainStatus = null, nowIso = null, codebase = null } = {}) {
  const sha = normalizeGitSha(gitSha);
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    codebase: String(codebase ?? "").trim() || "unknown",
    gitSha: sha,
    gitShaShort: sha === UNKNOWN_GIT_SHA ? UNKNOWN_GIT_SHA : sha.slice(0, 12),
    // Clean only when git answered and reported nothing. A tree git could not
    // describe, or a commit it could not name, is not provably clean.
    treeClean: sha !== UNKNOWN_GIT_SHA && typeof porcelainStatus === "string" && porcelainStatus.trim() === "",
    writtenAt: normalizeTimestamp(nowIso),
  };
}

/**
 * Whatever was read from disk, reduced to a well-formed record. Anything that
 * is not a schema-1 record with a full commit id becomes "unknown".
 */
function normalizeDeployProvenance(raw, { codebase = null } = {}) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const wellFormed = record.schemaVersion === PROVENANCE_SCHEMA_VERSION;
  const sha = wellFormed ? normalizeGitSha(record.gitSha) : UNKNOWN_GIT_SHA;
  const recordedCodebase = wellFormed && typeof record.codebase === "string" ? record.codebase.trim() : "";
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    codebase: recordedCodebase || String(codebase ?? "").trim() || "unknown",
    gitSha: sha,
    gitShaShort: sha === UNKNOWN_GIT_SHA ? UNKNOWN_GIT_SHA : sha.slice(0, 12),
    treeClean: sha !== UNKNOWN_GIT_SHA && record.treeClean === true,
    writtenAt: wellFormed ? normalizeTimestamp(record.writtenAt) : null,
  };
}

/** Read a deploy-provenance.json. Never throws. */
function readDeployProvenance(filePath, { codebase = null } = {}) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    raw = null;
  }
  return Object.freeze(normalizeDeployProvenance(raw, { codebase }));
}

/** Lowercase, only [a-z0-9_-], at most 63 characters — or the fallback. */
function sanitizeLabelValue(value, fallback = UNKNOWN_GIT_SHA) {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, LABEL_MAX_LENGTH);
  return text || fallback;
}

function sanitizeLabelKey(key) {
  const text = sanitizeLabelValue(key, "");
  return /^[a-z]/.test(text) ? text : `mm-${text}`.slice(0, LABEL_MAX_LENGTH);
}

/**
 * The Cloud labels every deployed function carries:
 *   mm-git-sha  the full commit id, or "unknown"
 *   mm-tree     "clean" | "dirty"
 */
function provenanceLabels(provenance = {}) {
  const sha = normalizeGitSha(provenance?.gitSha);
  return {
    [sanitizeLabelKey(LABEL_KEYS.gitSha)]: sanitizeLabelValue(sha),
    [sanitizeLabelKey(LABEL_KEYS.tree)]: sanitizeLabelValue(sha !== UNKNOWN_GIT_SHA && provenance?.treeClean === true ? "clean" : "dirty"),
  };
}

// This file is also vendored into functions-path-admin, where `..` is not a
// codebase root, so the default codebase's own record is read on first use
// rather than at load. functions/index.js reads it while the CLI discovers
// functions, which is when the labels are taken.
const OWN_PROVENANCE_FILE = path.join(__dirname, "..", PROVENANCE_FILE_NAME);
let ownProvenance = null;
let ownLabels = null;
function defaultCodebaseProvenance() {
  if (!ownProvenance) ownProvenance = readDeployProvenance(OWN_PROVENANCE_FILE, { codebase: "default" });
  return ownProvenance;
}

module.exports = {
  PROVENANCE_SCHEMA_VERSION,
  PROVENANCE_FILE_NAME,
  UNKNOWN_GIT_SHA,
  LABEL_KEYS,
  LABEL_MAX_LENGTH,
  normalizeGitSha,
  buildDeployProvenance,
  normalizeDeployProvenance,
  readDeployProvenance,
  sanitizeLabelValue,
  provenanceLabels,
};

Object.defineProperties(module.exports, {
  /** This (default) codebase's deploy-provenance.json, normalized and frozen. */
  deployProvenance: {
    enumerable: true,
    get: defaultCodebaseProvenance,
  },
  /** Its Cloud labels: { "mm-git-sha": <sha|unknown>, "mm-tree": "clean"|"dirty" }. */
  deployProvenanceLabels: {
    enumerable: true,
    get() {
      if (!ownLabels) ownLabels = Object.freeze(provenanceLabels(defaultCodebaseProvenance()));
      return ownLabels;
    },
  },
});
