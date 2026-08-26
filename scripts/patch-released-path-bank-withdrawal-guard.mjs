#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'functions', 'index.js');
const checkOnly = process.argv.includes('--check');
const source = fs.readFileSync(target, 'utf8');

const startMarker = 'exports.withdrawQuestionFromPathBank = onCall(async (request) => {';
const endMarker = '\n});\n\n/**\n * Recompute the coverage index from the secure Path bank.';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Could not locate withdrawQuestionFromPathBank.');

const currentBlock = source.slice(start, end + '\n});'.length);
if (currentBlock.includes('COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes') && currentBlock.includes('.doc(bankId).get()')) {
  console.log(JSON.stringify({ mode: checkOnly ? 'check' : 'write', alreadyPatched: true }, null, 2));
  process.exit(0);
}

const replacement = `exports.withdrawQuestionFromPathBank = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const bankId = String(request.data?.bankId || "").trim();
  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");

  // A single-record withdrawal is safe for ordinary Path/custom content, but a
  // released SAT/ACT/TSIA2 family is part of one immutable content release.
  // Mutating one member behind the release manifest would let current sessions
  // see a bank that no longer matches their stamped release.
  const bankSnapshot = await db.collection("pathQuestionBank").doc(bankId).get();
  if (!bankSnapshot.exists) {
    throw new HttpsError("not-found", "This Path-bank question no longer exists.");
  }
  const bankRecord = bankSnapshot.data() || {};
  const assessmentFramework = String(bankRecord?.assessmentContext?.framework || "").trim();
  if (COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes(assessmentFramework)) {
    throw new HttpsError(
      "failed-precondition",
      "Release-managed assessment content cannot be withdrawn one question at a time. Use refreshReleasedCcmrPathBanks for the atomic SAT/ACT/TSIA2 release refresh.",
    );
  }

  // Deactivated rather than deleted: an evidence event already recorded against
  // it should still be able to name the question a student answered.
  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });
  await rebuildStoredPathCoverage(db);
  return { bankId, active: false };
});`;

const next = `${source.slice(0, start)}${replacement}${source.slice(end + '\n});'.length)}`;
if (next === source) throw new Error('Withdrawal guard patch made no changes.');

if (checkOnly) {
  console.log(JSON.stringify({ mode: 'check', wouldPatch: true }, null, 2));
} else {
  fs.writeFileSync(target, next);
  console.log(JSON.stringify({ mode: 'write', patched: true, target: path.relative(root, target) }, null, 2));
}
