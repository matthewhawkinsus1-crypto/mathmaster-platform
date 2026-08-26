#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'functions', 'index.js');
let source = fs.readFileSync(target, 'utf8');

const before = `exports.withdrawQuestionFromPathBank = onCall(async (request) => {\n  await requireTeacher(request);\n  const db = getFirestore();\n  const bankId = String(request.data?.bankId || "").trim();\n  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");\n  // Deactivated rather than deleted: an evidence event already recorded against\n  // it should still be able to name the question a student answered.\n  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });\n  await rebuildStoredPathCoverage(db);\n  return { bankId, active: false };\n});`;

const after = `exports.withdrawQuestionFromPathBank = onCall(async (request) => {\n  await requireTeacher(request);\n  const db = getFirestore();\n  const bankId = String(request.data?.bankId || "").trim();\n  if (!bankId) throw new HttpsError("invalid-argument", "bankId is required.");\n\n  const existingQuestion = await db.collection("pathQuestionBank").doc(bankId).get();\n  if (!existingQuestion.exists) {\n    throw new HttpsError("not-found", "The Path-bank question no longer exists.");\n  }\n  const framework = String(existingQuestion.data()?.assessmentContext?.framework || "").trim();\n  if (COORDINATED_CCMR_RELEASE_FRAMEWORKS.includes(framework)) {\n    throw new HttpsError(\n      "failed-precondition",\n      "Released SAT, ACT, and TSIA2 questions cannot be withdrawn one at a time. Use refreshReleasedCcmrPathBanks so the complete audited release and manifest change together.",\n    );\n  }\n\n  // Deactivated rather than deleted: an evidence event already recorded against\n  // it should still be able to name the question a student answered.\n  await db.collection("pathQuestionBank").doc(bankId).set({ active: false, withdrawnAt: Date.now() }, { merge: true });\n  await rebuildStoredPathCoverage(db);\n  return { bankId, active: false };\n});`;

const occurrences = source.split(before).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one unguarded withdrawal callable, found ${occurrences}.`);
}
source = source.replace(before, after);
fs.writeFileSync(target, source);
console.log('Protected release-managed assessment families from single-question withdrawal.');
