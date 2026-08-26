#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'functions', 'index.js');
const checkOnly = process.argv.includes('--check');
let source = fs.readFileSync(target, 'utf8');

const seedList = `const COORDINATED_CCMR_RELEASE_SEED_FILES = Object.freeze([
  "digitalSAT_pathQuestionBank_seed.json",
  "act_pathQuestionBank_seed.json",
  "tsia2_pathQuestionBank_seed.json",
]);`;
const frameworkDeclaration = 'const COORDINATED_CCMR_RELEASE_FRAMEWORKS = Object.freeze(["act", "digitalSAT", "tsia2"]);';
if (!source.includes(seedList)) throw new Error('Could not locate coordinated CCMR seed-file declaration.');
if (!source.includes(frameworkDeclaration)) {
  source = source.replace(seedList, `${seedList}\n${frameworkDeclaration}`);
}

const importerStartMarker = 'exports.seedPathQuestionBank = onCall(async (request) => {';
const importerEndMarker = '\n});\n\nconst BUILT_IN_PATH_SEED_FILES = Object.freeze([';
const importerStart = source.indexOf(importerStartMarker);
const importerEnd = source.indexOf(importerEndMarker, importerStart);
if (importerStart < 0 || importerEnd < 0) throw new Error('Could not locate the manual Path seed importer.');

const importerReplacement = `exports.seedPathQuestionBank = onCall(async (request) => {
  const actor = await requireRootAdmin(request);
  const db = getFirestore();
  const dryRun = request.data?.dryRun === true;
  const items = Array.isArray(request.data?.items) ? request.data.items : [];
  if (!items.length) throw new HttpsError("invalid-argument", "Supply the seed items to import.");
  if (items.length > 600) throw new HttpsError("invalid-argument", "Import at most 600 items per call.");

  // Dry-run stays available for package authoring, but released SAT/ACT/TSIA2
  // content may only be written by the atomic coordinated refresh. Allowing a
  // generic write here could change the bank without moving the release
  // manifest and would make active sessions observe an impossible mixed state.
  if (!dryRun) {
    const attemptedProtectedFrameworks = [...new Set(items
      .map((item) => String(item?.assessmentContext?.framework || "").trim())
      .filter((framework) => COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes(framework)))].sort();
    if (attemptedProtectedFrameworks.length) {
      throw new HttpsError(
        "failed-precondition",
        "Release-managed assessment content (" + attemptedProtectedFrameworks.join(", ") + ") cannot be written by the generic Path seed importer. Use refreshReleasedCcmrPathBanks for the atomic SAT/ACT/TSIA2 release refresh.",
      );
    }
  }
  return processPathSeedImport({ db, actor, items, dryRun });
});`;

const currentImporter = source.slice(importerStart, importerEnd + '\n});'.length);
if (!currentImporter.includes('COORDINATED_CCMR_RELEASE_FRAMEWORKS')) {
  source = `${source.slice(0, importerStart)}${importerReplacement}${source.slice(importerEnd + '\n});'.length)}`;
}

const oldExpected = 'const expectedFrameworks = ["act", "digitalSAT", "tsia2"];';
const expectedMatches = source.split(oldExpected).length - 1;
if (expectedMatches > 0) {
  source = source.split(oldExpected).join('const expectedFrameworks = [...COORDINATED_CCMR_RELEASE_FRAMEWORKS].sort();');
}

const original = fs.readFileSync(target, 'utf8');
if (source === original) {
  console.log(JSON.stringify({ mode: checkOnly ? 'check' : 'write', alreadyPatched: true }, null, 2));
  process.exit(0);
}

if (checkOnly) {
  console.log(JSON.stringify({ mode: 'check', wouldPatch: true, expectedFrameworkRefactors: expectedMatches }, null, 2));
} else {
  fs.writeFileSync(target, source);
  console.log(JSON.stringify({ mode: 'write', patched: true, expectedFrameworkRefactors: expectedMatches }, null, 2));
}
