/*
 * SI05 — AN AUDITED ITEM MATHMASTER ADDS ON ITS OWN IS GRADED ON THE SERVER.
 *
 * Pre-Flight's Honors version replaces about 15% of Practice with audited
 * SAT/ACT/TSIA2 items, and import replaces a question written as exam practice
 * with the audited item it imitates. Each audited item is a template (its
 * generator gives every student their own numbers). Added as it came, it was a
 * legacy template: the student's browser filled it and marked the answer, so
 * the key reached the device and the grade was never checked. The Algebra II
 * Honors files fixed this by hand for their own items (a65ada99) by making each
 * one an assignment-local Question Family; decided: every item MathMaster adds
 * goes the same way. These run the real lessons, bank, server choice, client
 * selection and server grading.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
  proveImportedCcmrClaims,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { allocationIndexFor } from '../../functions/shared/questionGenerationIdentity.mjs';
// Also registers the comparators the server registers.
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { serverResponseGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const isAudited = (question) => question?.ccmrSource?.source === 'auditedBank';
const isServerFamily = (question) => Boolean(question?.generator) && question?.questionFamily?.scope === 'assignment';

/** A lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewed = (relPath) => {
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(read(relPath)).assignmentV5, {}));
  assert.equal(model.isValid, true, `${relPath} passes Pre-Flight:\n${model.errors.join('\n')}`);
  return model.assignmentV5;
};

/*
 * The server's marking of one stored question, the way the a65ada99 test marks
 * the Algebra II Honors items: the version a student was delivered is rebuilt
 * on the server from its delivery pin, and the key is right and a changed
 * answer wrong there.
 */
const assertServerMarks = ({ assignment, question, storageIndex, label }) => {
  assert.ok(isServerFamily(question), `${label}: an assignment-local Question Family slot, not a template the browser fills`);
  for (const seat of [0, 7, 19]) {
    const allocation = { seat, variant: 0, stride: 32, index: allocationIndexFor({ seat, variant: 0, stride: 32 }), basis: 'provisional' };
    const delivered = resolveFamilyQuestionInstance({ question, assignmentId: assignment.id, storageIndex, allocation });
    assert.ok(delivered.question && !delivered.error, `${label}: delivered (${delivered.error})`);
    const resolved = resolveServerGradingQuestion({ assignment, question, questionIndex: storageIndex, variantIndex: 0, claimedDelivery: delivered.delivery, studentId: `student-${seat}` });
    assert.equal(resolved.familyBacked, true, label);
    assert.ok(resolved.question, `${label}: ${resolved.reason}`);
    assert.equal(resolved.question.prompt, delivered.question.prompt, `${label}: the version the student saw`);
    assert.equal(serverResponseGradingSupport(resolved.question).supported, true, `${label}: server-graded`);
    const right = resolved.question.answerFields.map((field) => ({ id: field.id, value: String(field.answer) }));
    const wrong = right.map((entry, position) => (position === right.length - 1 ? { ...entry, value: entry.value === '999' ? '998' : '999' } : entry));
    assert.deepEqual(
      [gradeServerResponse({ question: resolved.question, response: { kind: 'fields', fields: right } }).isCorrect,
        gradeServerResponse({ question: resolved.question, response: { kind: 'fields', fields: wrong } }).isCorrect],
      [true, false],
      `${label} at seat ${seat}: the key is right and a changed answer wrong`,
    );
  }
};

const storedQuestions = (assignmentV5) => assignmentV5.sections.flatMap((section) => section.questions);

test('every audited item the server places is an assignment-local Question Family', () => {
  const base = reviewed('teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json');
  const { assignment, audit } = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true });
  const placed = storedQuestions(assignment).filter(isAudited);
  assert.ok(placed.length >= 1, 'the server’s own choice places audited Practice');
  const offered = audit.plan.slots.flatMap((slot) => slot.candidates);
  assert.ok(offered.length > 5, 'and offers alternatives');
  [...placed, ...offered].forEach((intent) => {
    assert.deepEqual(intent.questionFamily, { scope: 'assignment' }, `${intent.ccmrSource.documentId}`);
    assert.ok(intent.generator, `${intent.ccmrSource.documentId} keeps the bank's generator`);
  });
});

for (const file of [
  'T1_L1_Solving_Linear_Equations_Honors',
  'T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors',
  'T2_L1_Solving_Systems_by_Graphing_Honors',
  'T2_L2_Solving_Systems_by_Substitution_Honors',
]) {
  test(`${file}: the audited items Pre-Flight adds to the Honors version are graded by the server`, () => {
    const base = reviewed(`teacher-import-jsons/algebra1-module3/${file}.json`);
    assert.equal(storedQuestions(base).filter(isAudited).length, 0, 'the file holds no audited items of its own');
    const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
    const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null });
    assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, `${candidate.status}: ${candidate.explanation}`);
    assert.ok(candidate.sourced.length >= 1);
    // What Create publishes, as the student's assignment.
    const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: base, honorsEnrichmentQuestion: null });
    const assignment = { ...created.assignmentV5, id: `${file}-honors` };
    const stored = storedQuestions(created.assignmentV5);
    const audited = stored.map((question, storageIndex) => ({ question, storageIndex })).filter(({ question }) => isAudited(question));
    assert.equal(audited.length, candidate.sourced.length);
    audited.forEach(({ question, storageIndex }) => assertServerMarks({ assignment, question, storageIndex, label: `${file} ${question.ccmrSource.documentId}` }));
  });
}

test('a question written as exam practice and replaced at import is graded by the server', () => {
  // Algebra I M2 T2 Lesson 2, its eleventh Practice question written as
  // direct Digital SAT practice, the way an outside AI marks one.
  const raw = JSON.parse(read('teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json'));
  const practice = raw.sections.find((section) => section.role === 'practice');
  const claim = practice.questions[10];
  claim.alignments = [...claim.alignments, { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' }];
  claim.assessmentContext = { framework: 'digitalSAT', examStyle: true };
  const compiled = (json) => parseAssignmentBlueprintText(JSON.stringify(json)).assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(raw), { ensurePracticeTarget: false, includeCandidates: true }));
  const proven = proveImportedCcmrClaims({ rawAssignment: raw, authoredAssignmentV5: compiled(raw), hydration });
  assert.equal(proven.audit.replaced, 1);
  const model = buildAssignmentV5PreflightModel(compiled(proven.assignment));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const stored = storedQuestions(model.assignmentV5);
  const storageIndex = stored.findIndex(isAudited);
  assert.ok(storageIndex >= 0);
  assertServerMarks({ assignment: { ...model.assignmentV5, id: 'imported-claim' }, question: stored[storageIndex], storageIndex, label: `import ${stored[storageIndex].ccmrSource.documentId}` });
});
