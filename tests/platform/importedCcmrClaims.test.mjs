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
import { ccmrAuditWarnings } from '../../src/platform/assignments/ccmrAuditWarnings.js';
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
  // The warnings are the teacher workspace's own module (TT11 moved them out of App).
  assert.match(workspace, /^import \{ ccmrAuditWarnings \} from '\.\.\/\.\.\/platform\/assignments\/ccmrAuditWarnings\.js';$/m);
  assert.match(block, /const bankWarnings = \[\.\.\.ccmrAuditWarnings\(ccmrAudit\)\];/);
  assert.doesNotMatch(executableSource(read('src/App.jsx')), /ccmrAuditWarnings/, 'App no longer carries them on the student first load');
  const warnings = ccmrAuditWarnings({ misses: [{ reason: 'no_audited_item_passed_checks', questionNumber: 24 }] });
  assert.ok(warnings.some((message) => /^MathMaster kept Question 24 as written: no audited CCMR item offered for it passed/.test(message)), warnings.join('\n'));
});

/*
 * TT11: THE SERVER'S CANDIDATE BUDGET (40 PER IMPORT) RUNS OUT IN A LESSON WITH
 * MANY EXAM-STYLE QUESTIONS. A claim offered nothing used to stay as written
 * with no miss and no warning. The server's own choice for the place is now its
 * candidate, checked like any other, and a claim with nothing to try is named.
 */
const exhausted = (raw) => clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(raw), { ensurePracticeTarget: false, includeCandidates: true, candidateBudget: 0 }));

test('TT11: with the budget spent the claim is offered nothing, and the server\'s own choice is checked in its place', () => {
  const { raw, claimId, ...place } = lessonWithClaim();
  const hydration = exhausted(raw);
  const slot = hydration.audit.plan.slots.find((entry) => entry.kind === 'directClaim' && entry.questionId === claimId);
  assert.deepEqual(slot.candidates, [], 'the budget is spent before this claim');
  // The server's own choice: one that passes (the item a full plan proves for this claim).
  const full = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration: importHydration(raw) });
  const [passing] = full.audit.directClaims.replaced;
  assert.ok(passing, 'a full plan proves an item for the claim');
  const passingIntent = importHydration(raw).audit.plan.slots.find((entry) => entry.kind === 'directClaim' && entry.questionId === claimId)
    .candidates.find((intent) => intent.ccmrSource.documentId === passing.documentId);
  hydration.assignment.sections[place.sectionIndex].questions[place.questionIndex] = clone(passingIntent);

  const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration });
  assert.equal(proven.audit.replaced, 1);
  assert.equal(proven.audit.directClaims.replaced[0].documentId, passing.documentId);
  assert.equal(questionAt(proven.assignment, place).ccmrSource.documentId, passing.documentId);
  assert.equal(proven.audit.misses.filter((miss) => miss.questionNumber === 24).length, 0);
  assert.equal(buildAssignmentV5PreflightModel(compiled(proven.assignment)).isValid, true);
});

test('TT11: a server choice that fails in place is a named miss, never kept unchecked', () => {
  const { raw, claimId, ...place } = lessonWithClaim();
  const hydration = exhausted(raw);
  const seed = JSON.parse(read('functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json'));
  const production = bank.bankDocumentToV5Intent((seed.items || seed.documents).find((document) => document.id === PRODUCTION_ITEM), { activityRole: 'practice' });
  hydration.assignment.sections[place.sectionIndex].questions[place.questionIndex] = production;

  const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration });
  assert.equal(proven.audit.replaced, 0);
  assert.deepEqual(questionAt(proven.assignment, place), questionAt(raw, place), 'the teacher’s question is kept exactly');
  assert.equal(proven.audit.directClaims.skipped[0].documentId, PRODUCTION_ITEM);
  const miss = proven.audit.misses.find((entry) => entry.questionNumber === 24);
  assert.equal(miss?.reason, 'no_audited_item_passed_checks');
  assert.ok(claimId);
});

test('TT11: a claim with nothing to try is named once: by the server when it explained, else as never checked', () => {
  const { raw, ...place } = lessonWithClaim();
  // Nothing offered and no server choice at the place (the teacher's question is there).
  const silent = exhausted(raw);
  silent.assignment.sections[place.sectionIndex].questions[place.questionIndex] = clone(questionAt(raw, place));
  silent.audit.misses = [];
  const unchecked = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration: silent });
  assert.deepEqual(unchecked.audit.misses.map((miss) => [miss.questionNumber, miss.reason]), [[24, 'no_audited_item_offered']]);
  assert.deepEqual(questionAt(unchecked.assignment, place), questionAt(raw, place));
  const said = ccmrAuditWarnings(unchecked.audit);
  assert.ok(said.some((message) => message === 'MathMaster kept Question 24 as written: no audited CCMR item was offered for it, so it was not checked against the bank.'), said.join('\n'));

  // The server already said why (no item on the TEKS): no second miss, and its miss is numbered.
  const explained = exhausted(raw);
  explained.assignment.sections[place.sectionIndex].questions[place.questionIndex] = clone(questionAt(raw, place));
  explained.audit.misses = [{ sectionIndex: place.sectionIndex, questionIndex: place.questionIndex, framework: 'digitalSAT', domainId: 'algebra', teksCodes: ['A.3E'], reason: 'no_same_teks_audited_item', sameTeksCount: 0, semanticallyCompatibleCount: 0 }];
  const named = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration: explained });
  assert.deepEqual(named.audit.misses.map((miss) => [miss.questionNumber, miss.reason]), [[24, 'no_same_teks_audited_item']]);
  const told = ccmrAuditWarnings(named.audit);
  assert.ok(told.some((message) => message === 'MathMaster kept Question 24 as written: the audited CCMR bank has no item on its TEKS for that exam, so nothing was substituted.'), told.join('\n'));
  // A miss with no place still gets a sentence, by count.
  assert.ok(ccmrAuditWarnings({ misses: [{ reason: 'no_same_teks_audited_item' }, { reason: 'no_same_teks_audited_item' }] })
    .includes('MathMaster kept 2 exam-style questions as written: the audited CCMR bank has no item on their TEKS for that exam, so nothing was substituted.'));
});
