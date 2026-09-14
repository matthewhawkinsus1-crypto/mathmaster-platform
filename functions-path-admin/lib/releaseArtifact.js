"use strict";

// The certified release artifact, as production sees it.
//
// Certification already happened at build time: every family was compiled,
// Firestore-certified, and proved issuable and privately gradeable by sampling
// real generated instances through the production issuer. Production does NOT
// repeat that. What it does here is cheap and defensive, and it is exactly the
// set of checks that distinguishes "a certified artifact" from "a JSON file":
//
//   * the artifact is structurally valid and declares a supported schema
//   * the manifest's own content hash re-derives from its document hashes
//   * every document about to be WRITTEN still hashes to its manifest entry
//   * every document about to be written is still legal Firestore data
//
// Documents that are not being written are not re-checked, because they are not
// being touched.

const fs = require("fs");
const path = require("path");
const { requireRuntime, importRuntime } = require("./runtime");

const RELEASE_DIR = path.join(__dirname, "..", "release");
const MANIFEST_FILE = path.join(RELEASE_DIR, "coursePathReleaseV2.manifest.json");
const DOCUMENTS_FILE = path.join(RELEASE_DIR, "coursePathReleaseV2.documents.json");

const compiler = () => requireRuntime("lib/pathContentCompiler.js");

let manifestCache = null;
let documentsCache = null;

/** The certified manifest shipped with this deployment, or null. */
function loadReleaseManifest() {
  if (manifestCache !== undefined && manifestCache !== null) return manifestCache;
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  manifestCache = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  return manifestCache;
}

/**
 * The answer-bearing compiled package.
 *
 * Loaded lazily and only when documents are actually being staged, so a status
 * poll never pays for it and function discovery never touches it.
 */
function loadReleaseDocuments() {
  if (documentsCache) return documentsCache;
  if (!fs.existsSync(DOCUMENTS_FILE)) return null;
  documentsCache = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, "utf8"));
  return documentsCache;
}

function releaseArtifactPresent() {
  return fs.existsSync(MANIFEST_FILE) && fs.existsSync(DOCUMENTS_FILE);
}

/** Identity only — safe to return to the browser. */
function deployedReleaseIdentity() {
  const manifest = loadReleaseManifest();
  if (!manifest) return null;
  return {
    releaseId: manifest.releaseId || null,
    contentHash: manifest.contentHash || null,
    schemaVersion: manifest.schemaVersion ?? null,
    compilerSchemaVersion: manifest.compilerSchemaVersion ?? null,
    questionCount: manifest.questionCount ?? 0,
    courses: manifest.courses || [],
    courseCounts: manifest.courseCounts || {},
    certificationSamples: manifest.certificationSamples ?? null,
    build: manifest.build || null,
    documentsAvailable: fs.existsSync(DOCUMENTS_FILE),
  };
}

/**
 * Structural validation of the manifest. No document payload is read.
 *
 * Returns an array of diagnostics; an empty array means the artifact may be used.
 */
async function verifyReleaseManifest(manifest, { phase } = {}) {
  const plan = await importRuntime("shared/pathReleasePlan.mjs");
  const { PATH_RELEASE_ERROR, pathReleaseDiagnostic, releaseIdForContentHash, PATH_RELEASE_SCHEMA_VERSION } = plan;
  const diagnostics = [];
  const fail = (code, message, extra = {}) => diagnostics.push(pathReleaseDiagnostic({
    phase,
    code,
    message,
    releaseId: manifest?.releaseId || null,
    ...extra,
  }));

  if (!manifest) {
    fail(PATH_RELEASE_ERROR.ARTIFACT_MISSING, "No certified course Path release is deployed with this path-admin build.");
    return diagnostics;
  }
  if (manifest.schemaVersion !== PATH_RELEASE_SCHEMA_VERSION) {
    fail(
      PATH_RELEASE_ERROR.SCHEMA_UNSUPPORTED,
      `This deployment supports Path release schema ${PATH_RELEASE_SCHEMA_VERSION}; the artifact declares ${manifest.schemaVersion}.`,
    );
  }
  const supportedCompilerVersions = compiler().SUPPORTED_COMPILER_SCHEMA_VERSIONS;
  if (!supportedCompilerVersions.includes(manifest.compilerSchemaVersion)) {
    fail(
      PATH_RELEASE_ERROR.SCHEMA_UNSUPPORTED,
      `This deployment supports Path compiler schema ${supportedCompilerVersions.join(", ")}; the artifact was compiled by ${manifest.compilerSchemaVersion}.`,
    );
  }
  if (!Array.isArray(manifest.documents) || !manifest.documents.length) {
    fail(PATH_RELEASE_ERROR.ARTIFACT_UNREADABLE, "The certified release manifest lists no documents.");
    return diagnostics;
  }
  if (manifest.documents.length !== manifest.questionCount) {
    fail(
      PATH_RELEASE_ERROR.MANIFEST_MISMATCH,
      `The manifest declares ${manifest.questionCount} questions but lists ${manifest.documents.length}.`,
    );
  }

  // The release's own identity must re-derive from its parts. This catches a
  // hand-edited manifest and a half-written build alike.
  const derived = compiler().pathContentHash({
    schemaVersion: manifest.schemaVersion,
    compilerSchemaVersion: manifest.compilerSchemaVersion,
    documents: manifest.documents.map((entry) => [entry.id, entry.contentHash, entry.courseId]),
  });
  if (derived !== manifest.contentHash) {
    fail(
      PATH_RELEASE_ERROR.MANIFEST_MISMATCH,
      "The manifest's content hash does not match the documents it lists.",
      { details: { declared: manifest.contentHash, derived } },
    );
  } else if (manifest.releaseId !== releaseIdForContentHash(derived)) {
    fail(
      PATH_RELEASE_ERROR.MANIFEST_MISMATCH,
      `The manifest names release ${manifest.releaseId}, but its content hash names ${releaseIdForContentHash(derived)}.`,
    );
  }
  return diagnostics;
}

/**
 * Re-verify the documents this release is about to write.
 *
 * Two independent checks: the hash proves the bytes are the certified bytes, and
 * the Firestore-shape certification proves they are storable. A compiler defect
 * that produced a nested array therefore fails HERE, naming the property path,
 * instead of failing the Firestore batch with a generic INVALID_ARGUMENT.
 */
async function verifyDocumentsForStaging(entries, { manifest, phase, jobId } = {}) {
  const plan = await importRuntime("shared/pathReleasePlan.mjs");
  const { PATH_RELEASE_ERROR, pathReleaseDiagnostic, diagnosticFromCompilerError } = plan;
  const { pathDocumentContentHash, certifyCompiledDocument } = compiler();
  const expected = new Map((manifest?.documents || []).map((entry) => [entry.id, entry.contentHash]));
  const diagnostics = [];

  for (const entry of entries) {
    const declared = expected.get(entry.id);
    const actual = pathDocumentContentHash(entry.document);
    if (!declared) {
      diagnostics.push(pathReleaseDiagnostic({
        phase,
        jobId,
        releaseId: manifest?.releaseId || null,
        code: PATH_RELEASE_ERROR.DOCUMENT_NOT_COMPILED,
        message: `${entry.id} is in the release package but not in its certified manifest.`,
        questionId: entry.id,
      }));
      continue;
    }
    if (declared !== actual) {
      diagnostics.push(pathReleaseDiagnostic({
        phase,
        jobId,
        releaseId: manifest?.releaseId || null,
        code: PATH_RELEASE_ERROR.DOCUMENT_HASH_MISMATCH,
        message: `${entry.id} does not match its certified hash. The deployed package and manifest disagree.`,
        questionId: entry.id,
        details: { declared, actual },
      }));
      continue;
    }
    const errors = certifyCompiledDocument(entry.document, { id: entry.id });
    errors.forEach((error) => diagnostics.push(diagnosticFromCompilerError(error, {
      phase,
      jobId,
      releaseId: manifest?.releaseId || null,
    })));
  }
  return diagnostics;
}

module.exports = {
  MANIFEST_FILE,
  DOCUMENTS_FILE,
  loadReleaseManifest,
  loadReleaseDocuments,
  releaseArtifactPresent,
  deployedReleaseIdentity,
  verifyReleaseManifest,
  verifyDocumentsForStaging,
};
