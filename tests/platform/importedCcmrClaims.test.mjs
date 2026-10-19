/*
 * IMPORT: A QUESTION WRITTEN AS EXAM PRACTICE GETS AN AUDITED ITEM ONLY IF IT PASSES.
 *
 * Pasted or uploaded JSON can hold questions written as SAT, ACT or TSIA2
 * practice. Import replaces each with the audited item it imitates, for every
 * class, before Review compiles the lesson. That was the server's first choice,
 * unchecked: an item promising a graph it lacks arrived in Review as a blocker
 * the teacher had not caused. proveImportedCcmrClaims keeps the first offered
 * item MathMaster's checks accept in place, and keeps the teacher's question
 * when none passes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { proveImportedCcmrClaims } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const PRODUCTION_ITEM = 'mm_sat_A_3E_5_intercept-change_v21';

// Algebra I M2 T2 Lesson 2, with its eleventh Practice question written as
// direct Digital SAT practice, the way an outside AI marks one.
const lessonWithClaim = () => {
  const raw = JSON.parse(read('teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json'));
  const practice = raw.sections.find((section) => section.role === 'practice');
  const claim = practice.questions[10];
  claim.alignments = [...claim.alignments, { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' }];
  claim.assessmentContext = { framework: 'digitalSAT', examStyle: true };
  return { raw, claimId: claim.questionId, sectionIndex: raw.sections.indexOf(practice), questionIndex: 10 };
};

// The callable's answer at import (ensurePracticeTarget: false), through JSON.
const importHydration = (raw) => clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(raw), { ensurePracticeTarget: false, includeCandidates: true }));
const compiled = (raw) => parseAssignmentBlueprintText(JSON.stringify(raw)).assignmentV5;
const questionAt = (assignment, { sectionIndex, questionIndex }) => assignment.sections[sectionIndex].questions[questionIndex];

test('the item the server would have chosen first fails in place, so the claim gets the next one that passes', () => {
  const { raw, claimId, ...place } = lessonWithClaim();
  const hydration = importHydration(raw);
  const slot = hydration.audit.plan.slots.find((entry) => entry.kind === 'directClaim' && entry.questionId === claimId);
  assert.ok(slot && slot.candidates.length > 1, 'the server offers audited items for the claim');
  // As the server might rank it: the item from the production failure first.
  const seed = JSON.parse(read('functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json'));
  const production = bank.bankDocumentToV5Intent((seed.items || seed.documents).find((document) => document.id === PRODUCTION_ITEM), { activityRole: 'practice' });
  slot.candidates = [production, ...slot.candidates.filter((intent) => intent.ccmrSource.documentId !== PRODUCTION_ITEM)];

  const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration });
  assert.equal(proven.proven, true);
  const [used] = proven.audit.directClaims.replaced;
  assert.ok(used && used.documentId !== PRODUCTION_ITEM, 'a different audited item is used');
  assert.equal(proven.audit.replaced, 1);
  assert.equal(proven.audit.directClaims.skipped[0].documentId, PRODUCTION_ITEM);
  assert.match(proven.audit.directClaims.skipped[0].errors.join('\n'), /^Question 24 refers to a graph in its prompt, but the question contains none/);
  assert.ok(!('plan' in proven.audit), 'the plan stays out of the import record');

  // What Review compiles next is the item that was proven, and it passes.
  const model = buildAssignmentV5PreflightModel(compiled(proven.assignment));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(questionAt(model.assignmentV5, place).ccmrSource.documentId, used.documentId);
  assert.equal(questionAt(model.assignmentV5, place).ccmrSource.source, 'auditedBank');
  // Nothing else in the lesson moved.
  const before = compiled(raw);
  model.assignmentV5.sections.forEach((section, sectionIndex) => section.questions.forEach((question, questionIndex) => {
    if (sectionIndex === place.sectionIndex && questionIndex === place.questionIndex) return;
    assert.equal(question.questionId, before.sections[sectionIndex].questions[questionIndex].questionId);
  }));
});

test('a claim no offered item passes for stays as written, and the import says so', () => {
  const { raw, claimId, ...place } = lessonWithClaim();
  const hydration = importHydration(raw);
  const slot = hydration.audit.plan.slots.find((entry) => entry.kind === 'directClaim' && entry.questionId === claimId);
  // Only items that promise a graph they lack.
  slot.candidates = slot.candidates.map((intent) => ({ ...intent, prompt: `The graph below shows it. ${intent.prompt}` }));

  const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration });
  assert.equal(proven.audit.replaced, 0);
  assert.deepEqual(questionAt(proven.assignment, place), questionAt(raw, place), 'the teacher’s question is kept exactly');
  const miss = proven.audit.misses.find((entry) => entry.reason === 'no_audited_item_passed_checks');
  assert.ok(miss, 'recorded for the import warning');
  assert.equal(miss.questionNumber, 24);
  assert.equal(proven.audit.directClaims.skipped.length, slot.candidates.length, 'every offered item was checked and its reason kept');
  assert.equal(buildAssignmentV5PreflightModel(compiled(proven.assignment)).isValid, true, 'the lesson Review opens is still valid');
});

test('an older server (no plan), or JSON that does not compile as written, keeps the server’s own answer', () => {
  const { raw } = lessonWithClaim();
  const legacy = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(raw), { ensurePracticeTarget: false }));
  const fromLegacy = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration: legacy });
  assert.equal(fromLegacy.proven, false);
  assert.deepEqual(fromLegacy.assignment, legacy.assignment);
  assert.deepEqual(fromLegacy.audit, legacy.audit);

  const planned = importHydration(raw);
  const uncompiled = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: null, hydration: planned });
  assert.equal(uncompiled.proven, false);
  assert.deepEqual(uncompiled.assignment, planned.assignment);
  assert.ok(!('plan' in uncompiled.audit));
});

test('import asks for the candidates, proves them before the lesson is compiled, and warns about a claim kept as written', () => {
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  const block = region(workspace, 'const handleAssignmentJsonReady', 'const handleCreateAssignment', 'import');
  assert.match(block, /await hydrateAssignmentCcmr\(raw, \{ ensurePracticeTarget: false, includeCandidates: true \}\)/);
  assert.match(block, /const proven = proveImportedCcmrClaims\(\{ rawAssignment: raw, authoredAssignmentV5, hydration: hydrated \}\);\s*sourceText = JSON\.stringify\(proven\.assignment\);\s*ccmrAudit = proven\.audit;/);
  assert.ok(block.indexOf('proveImportedCcmrClaims(') < block.indexOf('readAssignmentJson(sourceText)'), 'proven before Review compiles the lesson');
  // A call in .jsx with no import passes the build and fails at runtime.
  assert.match(workspace, /^import \{[^}]*\bproveImportedCcmrClaims\b[^}]*\} from '\.\.\/\.\.\/platform\/assignments\/canonicalCcmrHydration\.js';$/m);
  const warnings = region(executableSource(read('src/App.jsx')), 'const ccmrAuditWarnings = (audit) => {', 'return messages;', 'ccmrAuditWarnings');
  assert.match(warnings, /miss\?\.reason === 'no_audited_item_passed_checks'/);
  assert.match(warnings, /messages\.push\(`MathMaster kept \$\{which\} as written/);
});
