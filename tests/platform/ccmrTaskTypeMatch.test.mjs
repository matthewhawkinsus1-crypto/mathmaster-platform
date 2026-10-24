/*
 * TT15 — AN HONORS SWAP MATCHES THE QUESTION'S TASK TYPE, NOT ONLY ITS TEKS.
 *
 * When a regular lesson goes to an Honors class, about 15% of Practice is
 * replaced by audited SAT/ACT/TSIA2 items on the same TEKS. ACT and TSIA2
 * "native" items are crosswalked onto every TEKS their skill touches (the ACT
 * polynomial-evaluation item lists 151), so on TEKS alone the swap put a
 * function-evaluation item in place of the DOL 3 review's recursive-sequence
 * question (A.12C) and an ACT linear equation a(x − b) = c in place of a
 * DOL #2 Matrix Lab question. Decided: match the task type the matcher can
 * see, and when no candidate of the right task type exists, keep the
 * teacher's question.
 *
 * These run the real lessons, the real audited bank, the real server choice
 * and the client's validated selection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { HONORS_CCMR_STATUS, buildHonorsCcmrCandidate } from '../../src/platform/assignments/canonicalCcmrHydration.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

/** A lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewed = (relPath) => {
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(read(relPath)).assignmentV5, {}));
  assert.equal(model.isValid, true, `${relPath} passes Pre-Flight:\n${model.errors.join('\n')}`);
  return model.assignmentV5;
};
const DOL1 = reviewed('teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json');
const DOL2 = reviewed('teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json');
const DOL3 = reviewed('teacher-import-jsons/algebra1-dol3/Algebra1_DOL3_Review.json');

const places = (assignment) => assignment.sections.flatMap((section, sectionIndex) => section.questions.map((question, questionIndex) => ({ question, sectionIndex, questionIndex })));
const questionById = (assignment, id) => {
  const found = places(assignment).find(({ question }) => question.questionId === id);
  assert.ok(found, `${id} is in the lesson`);
  return found.question;
};

const bankDocuments = new Map();
for (const file of Object.values(bank.FRAMEWORK_FILES)) {
  const payload = JSON.parse(read(`functions/seeds/pathQuestionBank/${file}`));
  for (const document of payload.items || payload.documents || []) bankDocuments.set(document.id, document);
}
const bankDocument = (id) => {
  const document = bankDocuments.get(id);
  assert.ok(document, `audited bank document ${id} exists`);
  return document;
};

const SEQUENCE_TOOL = questionById(DOL3, 'dol3-review-q13');
// DOL 1's geometric sequence is a plain multi-part question that carries its
// sequence; without that, the sequence shows only in its words.
const SEQUENCE_CARRIED = questionById(DOL1, 'q_section-3_3_8');
const SEQUENCE_WORDS = (() => {
  const question = clone(SEQUENCE_CARRIED);
  delete question.sequence;
  return question;
})();
const MATRIX_LAB = questionById(DOL2, 'dol2r-pr-17');
const ABSOLUTE_VALUE_INEQUALITY = questionById(DOL2, 'dol2r-pr-9');
const COMPOSE = { questionId: 'compose', standard: 'A2.2D', studentActions: ['composeFunctions'], prompt: 'Compare the composition orders for f(x)=−x+6 and g(x)=3x+1 at x=2.' };
const LINEAR_SOLVE = { questionId: 'solve', standard: 'A.5A', studentActions: ['solveEquation'], equation: '3x+4=40', prompt: 'Solve for x.' };

test('the matcher reads a question’s task from its tool, what it carries, or a prompt that names the object', () => {
  const kinds = (question) => bank.deriveSourceSemanticProfile(question).taskKinds;
  assert.deepEqual(kinds(SEQUENCE_TOOL), ['sequence'], 'the Sequence Explorer question');
  assert.deepEqual(kinds(SEQUENCE_CARRIED), ['sequence'], 'a plain question that carries its sequence');
  assert.deepEqual(kinds(SEQUENCE_WORDS), ['sequence'], 'a plain question about a geometric sequence and its terms');
  assert.deepEqual(kinds({ studentActions: ['multipleResponses'], sequence: { kind: 'arithmetic', first: 2, difference: 3 }, prompt: 'Find the next three terms.' }), ['sequence'], 'a carried sequence, whatever the words');
  assert.deepEqual(kinds({ studentActions: ['multipleResponses'], matrices: { A: { rows: [[1, 2], [3, 4]] } }, prompt: 'What is the entry in row 2, column 1 of AB?' }), ['matrix'], 'carried matrices, whatever the words');
  assert.deepEqual(kinds(MATRIX_LAB), ['matrix'], 'the Matrix Lab question');
  assert.deepEqual(kinds(ABSOLUTE_VALUE_INEQUALITY), ['inequality']);
  assert.deepEqual(kinds(COMPOSE), ['composition']);
  assert.deepEqual(kinds({ studentActions: ['multipleResponses'], prompt: 'Find the inverse of matrix A.' }), ['matrix'], 'a matrix’s inverse is a matrix task');
  // Nothing to compare against: the TEKS match decides, as before.
  assert.deepEqual(kinds(LINEAR_SOLVE), []);
  assert.deepEqual(kinds({ studentActions: ['multipleResponses'], prompt: 'Describe a sequence of transformations that maps triangle ABC onto triangle DEF.' }), []);
});

test('a crosswalked item stands in for a question whose task shows only when its own task type names that task', () => {
  const compatible = (question, id) => bank.isSemanticallyCompatible(bank.deriveSourceSemanticProfile(question), bankDocument(id));
  assert.equal(compatible(SEQUENCE_TOOL, 'mm_act_fn_1_polynomial-evaluation_v21'), false, 'function evaluation is not a sequence task');
  assert.equal(compatible(SEQUENCE_WORDS, 'mm_act_fn_1_polynomial-evaluation_v21'), false);
  assert.equal(compatible(MATRIX_LAB, 'mm_act_alg_1_linear-distribution_v21'), false, 'a(x − b) = c is not a matrix task');
  assert.equal(compatible(MATRIX_LAB, 'mm_act_nq_4_matrix-product-entry_v21'), true, 'a matrix product is');
  assert.equal(compatible(COMPOSE, 'mm_act_fn_2_piecewise-evaluation_v21'), false);
  assert.equal(compatible(COMPOSE, 'mm_act_fn_ch1_composition_v21'), true);
  assert.equal(compatible(LINEAR_SOLVE, 'mm_act_alg_1_linear-distribution_v21'), true, 'a question whose task does not show keeps the TEKS match');
});

test('an assessed item stands on the TEKS it assesses; the same item crosswalked does not', () => {
  const profile = bank.deriveSourceSemanticProfile(SEQUENCE_TOOL);
  const item = (alignment) => ({ taskType: 'parameterReasoning', alignments: [{ framework: 'teks', code: 'A.12C', role: 'primary', ...alignment }] });
  assert.equal(bank.isSemanticallyCompatible(profile, item({ evidenceLevel: 'assessed' })), true);
  assert.equal(bank.isSemanticallyCompatible(profile, item({ evidenceMode: 'crosswalk' })), false);
  assert.equal(bank.isSemanticallyCompatible(profile, { ...item({ evidenceLevel: 'assessed' }), alignments: [{ framework: 'teks', code: 'A.12A', evidenceLevel: 'assessed' }] }), false, 'an assessment of another standard says nothing about this task');
  // A real Digital SAT item whose task type names no task, on DOL #2's standard.
  assert.equal(bank.isSemanticallyCompatible(bank.deriveSourceSemanticProfile(ABSOLUTE_VALUE_INEQUALITY), bankDocument('mm_sat_A2_6F_integer_count_strict_v21')), true);
});

test('HARD RULE (TT15): a sequence question is never swapped for an ACT function item; it keeps its place', () => {
  for (const question of [SEQUENCE_TOOL, SEQUENCE_CARRIED, SEQUENCE_WORDS]) {
    const match = bank.explainAuditedBankMatch(question);
    assert.deepEqual(match.teksCodes, ['A.12C']);
    assert.ok(match.sameTeksCount > 0, 'A.12C items exist: ACT function items crosswalked onto it');
    assert.equal(match.semanticallyCompatibleCount, 0);
    assert.equal(match.reason, 'no_semantically_compatible_audited_item');
    assert.deepEqual(match.sourceConstructSignals.taskKinds, ['sequence']);
    const chosen = bank.chooseAuditedBankDocumentAnyFramework({ teksCodes: ['A.12C'], dok: question.dok, difficultyBand: question.difficultyBand, seed: `tt15|${question.questionId}`, sourceQuestion: question });
    assert.equal(chosen, null, chosen && `unexpectedly matched ${chosen.id} (${chosen.taskType})`);
  }
  const plan = bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(DOL3), { ensurePracticeTarget: true, includeCandidates: true }).audit.plan;
  const slot = plan.slots.find((entry) => entry.questionId === 'dol3-review-q13');
  assert.deepEqual(slot.candidates, [], 'nothing is offered for question 13');
});

test('HARD RULE (TT15): the DOL #2 Matrix Lab question is never given the ACT linear equation a(x − b) = c', () => {
  const match = bank.explainAuditedBankMatch(MATRIX_LAB);
  assert.equal(match.reason, 'no_semantically_compatible_audited_item');
  assert.ok(match.sameTeksCount > 0);
  const chosen = bank.chooseAuditedBankDocumentAnyFramework({ teksCodes: match.teksCodes, seed: 'tt15|matrix', sourceQuestion: MATRIX_LAB });
  assert.equal(chosen, null, chosen && `unexpectedly matched ${chosen.id} (${chosen.taskType})`);
});

// A standard is "taught once" when no other ordinary question in the lesson
// carries its TEKS. An audited item counts as Honors CCMR transfer only on a
// TEKS taught elsewhere (courseRigor's ccmrEnrichment).
const taughtOnce = (assignment) => {
  const all = places(assignment);
  return all.filter((place) => {
    const codes = bank.questionTeksCodes(place.question);
    return !all.some((other) => other !== place && bank.questionTeksCodes(other.question).some((code) => codes.includes(code)));
  });
};

test('the regular DOL 3 review still gets a READY Honors version, from standards it teaches more than once', () => {
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(DOL3), { ensurePracticeTarget: true, includeCandidates: true }));
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: DOL3, hydration, honorsEnrichmentQuestion: null });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, `${candidate.status}: ${candidate.explanation}`);
  assert.equal(candidate.sourcedCount, candidate.targetCount);
  assert.equal(candidate.honorsReport.checks.ccmrEnrichment, true);
  candidate.sourced.forEach((entry) => assert.doesNotMatch(entry.documentId, /^mm_act_fn_/, `Q${entry.questionNumber} is not an ACT function item`));
  const q13 = questionById(candidate.assignmentV5, 'dol3-review-q13');
  assert.equal(q13.ccmrSource, undefined, 'question 13 is the authored recursive-sequence question');
  assert.deepEqual(q13.studentActions, SEQUENCE_TOOL.studentActions);
  const once = taughtOnce(DOL3);
  assert.ok(once.some(({ question }) => question.questionId === 'dol3-review-q13'));
  once.forEach(({ question, sectionIndex, questionIndex }) => {
    const kept = candidate.assignmentV5.sections[sectionIndex].questions[questionIndex];
    assert.equal(kept.questionId, question.questionId, `${question.questionId} (${bank.questionTeksCodes(question)}) is taught once and keeps its place`);
    assert.equal(kept.ccmrSource, undefined);
  });
});

test('the server’s own in-place choice also leaves standards taught once alone', () => {
  const { assignment, audit } = bank.ensureAuditedCcmrPractice(clone(DOL3));
  assert.equal(audit.autoSourced, audit.targetCount);
  const once = new Set(taughtOnce(DOL3).map(({ question }) => question.questionId));
  places(assignment).forEach(({ question, sectionIndex, questionIndex }) => {
    if (question?.ccmrSource?.source !== 'auditedBank') return;
    const replaced = DOL3.sections[sectionIndex].questions[questionIndex];
    assert.equal(once.has(replaced.questionId), false, `${replaced.questionId} is taught once but was replaced by ${question.ccmrSource.documentId}`);
  });
});
