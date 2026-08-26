#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'functions', 'index.js');
const checkOnly = process.argv.includes('--check');
const source = fs.readFileSync(target, 'utf8');

const startMarker = 'exports.initializeStarterPathQuestionBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {';
const endMarker = '\n\n/**\n * Root-admin coordinated assessment-bank refresh.';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Could not locate the starter Path-bank initializer block.');

const currentBlock = source.slice(start, end);
if (currentBlock.includes('starter-initialization') && currentBlock.includes('fresh-install-only')) {
  console.log(JSON.stringify({ mode: checkOnly ? 'check' : 'write', alreadyPatched: true }, null, 2));
  process.exit(0);
}

const replacement = `exports.initializeStarterPathQuestionBank = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();

  // This callable installs the complete built-in starter package, including
  // legacy ASVAB content. It must never double as a live-bank refresh because
  // SAT, ACT, and TSIA2 now have their own atomic release protocol. The only
  // non-empty-bank exception is a retry of this exact initializer after a
  // failed fresh installation left the release manifest intentionally held.
  const manifestRef = db.collection(CONTENT_RELEASE_MANIFEST_COLLECTION).doc(CONTENT_RELEASE_MANIFEST_DOC);
  const [existingBank, existingManifestSnapshot] = await Promise.all([
    db.collection("pathQuestionBank").limit(1).get(),
    manifestRef.get(),
  ]);
  const existingManifest = existingManifestSnapshot.exists ? existingManifestSnapshot.data() : {};
  const retryingFailedStarterInitialization = !existingBank.empty
    && existingManifest?.status === "updating"
    && existingManifest?.updateOperation === "starter-initialization";
  if (!existingBank.empty && !retryingFailedStarterInitialization) {
    throw new HttpsError(
      "failed-precondition",
      "Starter Path-bank initialization is fresh-install-only. Use the dedicated bank refresh controls on an existing installation.",
    );
  }

  let items;
  try {
    items = loadBuiltInStarterPathSeed();
  } catch (error) {
    logger.error("Could not load built-in My Math Path starter bank", error);
    throw new HttpsError("failed-precondition", "The built-in My Math Path starter bank is unavailable in this deployment.");
  }
  // The built-in package is loaded on the server, so it is not constrained by
  // the browser callable payload limit used by custom imports. Firestore writes
  // are already chunked inside processPathSeedImport. Tag the current built-in
  // package so a later refresh can retire superseded bundled questions without
  // touching teacher-promoted or custom Path-bank content.
  const taggedItems = items.map((item) => ({
    ...item,
    builtInPathSeed: BUILT_IN_PATH_SEED_MARKER,
    builtInPathSeedRelease: PATH_RUNTIME_RELEASE,
  }));

  // Validate the whole starter package before closing tracked assessment
  // issuance. ASVAB intentionally remains outside this release manifest.
  const validation = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: true });
  if (validation.rejected?.length || validation.wouldAccept !== taggedItems.length) {
    return { ...validation, phase: "validation" };
  }
  const discoveredReleases = pathContentRelease.collectAssessmentContentReleases(taggedItems);
  const expectedFrameworks = ["act", "digitalSAT", "tsia2"];
  const pendingReleases = Object.fromEntries(expectedFrameworks
    .map((framework) => [framework, discoveredReleases[framework]])
    .filter(([, release]) => Boolean(release)));
  if (Object.keys(pendingReleases).length !== expectedFrameworks.length) {
    throw new HttpsError(
      "failed-precondition",
      "The starter package must contain release metadata for ACT, Digital SAT, and TSIA2 before installation.",
    );
  }

  const updatingManifest = pathContentRelease.beginAssessmentContentReleaseUpdate(
    retryingFailedStarterInitialization ? existingManifest : {},
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...updatingManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });

  // If any write or cleanup fails after this point, the manifest stays in
  // updating state and this same callable may safely resume the failed starter
  // installation. New SAT/ACT/TSIA2 issuance remains held in the meantime.
  const seed = await processPathSeedImport({ db, actor, items: taggedItems, dryRun: false });
  if (!seed.imported) {
    throw new HttpsError("failed-precondition", "The starter Path bank failed its write-time validation; tracked assessment issuance remains held.");
  }
  const removedSuperseded = await removeSupersededBuiltInPathSeedRecords(db, taggedItems);
  const coverage = await rebuildStoredPathCoverage(db);
  const { retireStaleTsia2PathStateForRelease } = await import("./shared/pathBankRelease.mjs");
  const tsia2PathBankRelease = await retireStaleTsia2PathStateForRelease(db);

  const activeManifest = pathContentRelease.completeAssessmentContentReleaseUpdate(
    updatingManifest,
    pendingReleases,
    Date.now(),
  );
  await manifestRef.set({
    ...activeManifest,
    updateOperation: "starter-initialization",
    updatedBy: actor.uid,
  });
  return { ...seed, phase: "complete", removedSuperseded, coverage, tsia2PathBankRelease, assessmentContentReleases: pendingReleases };
});`;

const next = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
if (next === source) throw new Error('Starter initializer patch made no changes.');

if (checkOnly) {
  console.log(JSON.stringify({ mode: 'check', wouldPatch: true, replacementBytes: replacement.length }, null, 2));
} else {
  fs.writeFileSync(target, next);
  console.log(JSON.stringify({ mode: 'write', patched: true, target: path.relative(root, target) }, null, 2));
}
