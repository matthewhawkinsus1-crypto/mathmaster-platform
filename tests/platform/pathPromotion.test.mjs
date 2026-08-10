import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPathBankRecord, evaluatePromotion, pathBankIdFor, primaryStandardsOf, supportsVariants,
} from '../../functions/shared/pathPromotion.mjs';

const GOOD = {
  type: 'algebra',
  prompt: 'Solve for x.',
  equationLatex: '2x + 5 = 13',
  variable: 'x',
  answer: '4',
  difficultyBand: 2,
  dok: 1,
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
};

const verdict = (evaluation, id) => evaluation.checks.find((entry) => entry.id === id);

// --- The gate lets good content through --------------------------------------------

test('a complete, gradeable, aligned question can be promoted', () => {
  const evaluation = evaluatePromotion(GOOD);
  assert.equal(evaluation.canPromote, true, JSON.stringify(evaluation.blocking));
  assert.equal(evaluation.toolId, 'algebra');
  assert.deepEqual(evaluation.standards, ['A.5A']);
  assert.equal(evaluation.preview.hasPrivateGrading, true);
});

// --- And stops each specific harm ----------------------------------------------------

test('a tool with no server grader cannot be promoted', () => {
  const evaluation = evaluatePromotion({ ...GOOD, type: 'transformationsLab' });
  assert.equal(evaluation.canPromote, false);
  assert.equal(verdict(evaluation, 'serverGradeable').passed, false);
  assert.match(verdict(evaluation, 'serverGradeable').detail, /no secure server grader/);
});

test('a question with no standard cannot be promoted', () => {
  const { alignments, ...noAlignment } = GOOD;
  const evaluation = evaluatePromotion(noAlignment);
  assert.equal(evaluation.canPromote, false);
  assert.equal(verdict(evaluation, 'alignment').passed, false);
  assert.match(verdict(evaluation, 'alignment').detail, /belongs to nothing/);
});

test('a question with no answer cannot be promoted', () => {
  const { answer, ...noAnswer } = GOOD;
  const evaluation = evaluatePromotion(noAnswer);
  assert.equal(evaluation.canPromote, false);
  assert.equal(verdict(evaluation, 'gradingData').passed, false);
  assert.match(verdict(evaluation, 'gradingData').detail, /marked wrong/);
});

test('a draft or inactive question cannot be promoted', () => {
  assert.equal(evaluatePromotion({ ...GOOD, active: false }).canPromote, false);
  assert.equal(evaluatePromotion({ ...GOOD, status: 'draft' }).canPromote, false);
  assert.equal(verdict(evaluatePromotion({ ...GOOD, active: false }), 'eligible').passed, false);
});

test('a failing schema check from the caller blocks promotion', () => {
  const evaluation = evaluatePromotion(GOOD, {
    schemaResult: { isValid: false, errors: ['relationMapping requires at least one pair.'] },
  });
  assert.equal(evaluation.canPromote, false);
  assert.match(verdict(evaluation, 'schemaValid').detail, /at least one pair/);
});

test('an unrun schema check is reported as unverified, never as passed', () => {
  const evaluation = evaluatePromotion(GOOD);
  assert.equal(verdict(evaluation, 'schemaValid').passed, null);
  assert.ok(evaluation.unverified.some((entry) => entry.id === 'schemaValid'));
  // Unverified does not block — the server's own checks are the authoritative
  // ones — but it is visible rather than silently absent.
  assert.equal(evaluation.canPromote, true);
});

test('the public payload is checked for answer leakage before anything is stored', () => {
  const evaluation = evaluatePromotion(GOOD);
  assert.equal(verdict(evaluation, 'noAnswerLeak').passed, true);
  // The check walks the payload the browser would receive, and the allowlist is
  // what keeps it clean: the answer never appears in it.
  assert.ok(!JSON.stringify(evaluation.preview || {}).includes('"4"'));
});

// --- The legacy field-graded branch, which the starter bank uses ------------------

// Exactly the shape of the seed documents: no type, no toolId, no pathToolId,
// questionType "response", and expected answers on the response fields.
const LEGACY_SEED = {
  id: 'seed-A.5A-foundation',
  questionType: 'response',
  familyId: 'A.5A-foundation',
  familyVersion: 1,
  prompt: 'Solve 2x + 5 = 13 for x.',
  responseFields: [{ id: 'x', label: 'x =', inputProfile: 'number', expected: 4 }],
  alignmentKeys: ['texas:A.5A'],
  difficultyBand: 2,
  dok: 1,
  active: true,
};

test('a legacy field-graded question is promotable without any tool contract', () => {
  const evaluation = evaluatePromotion(LEGACY_SEED);
  assert.equal(evaluation.canPromote, true, JSON.stringify(evaluation.blocking));
  assert.equal(evaluation.toolId, null, 'it declares no tool, and that is fine');
  assert.equal(verdict(evaluation, 'serverGradeable').passed, true);
  assert.equal(verdict(evaluation, 'gradingData').passed, true);
  assert.deepEqual(evaluation.standards, ['A.5A']);
});

test('questionType "response" is not read as a tool declaration', () => {
  // Reading questionType as a tool would demand a contract for a tool called
  // "response" and reject every seed document in the bank.
  assert.equal(evaluatePromotion(LEGACY_SEED).canPromote, true);
  assert.equal(evaluatePromotion({ ...LEGACY_SEED, questionType: 'anythingAtAll' }).canPromote, true);
});

test('a field-graded question with no expected answer is still refused', () => {
  const noAnswer = { ...LEGACY_SEED, responseFields: [{ id: 'x', label: 'x =' }] };
  const evaluation = evaluatePromotion(noAnswer);
  assert.equal(evaluation.canPromote, false);
  assert.equal(verdict(evaluation, 'gradingData').passed, false);
});

test('declaring a tool with no contract still fails closed, and says which check', () => {
  const evaluation = evaluatePromotion({ ...LEGACY_SEED, type: 'transformationsLab' });
  assert.equal(evaluation.canPromote, false);
  assert.equal(verdict(evaluation, 'serverGradeable').passed, false);
  assert.match(verdict(evaluation, 'serverGradeable').detail, /transformationsLab/);
  // It must NOT drop through to field grading just because it has
  // responseFields — that is how a graphing question becomes a text box.
  assert.equal(verdict(evaluation, 'gradingData').passed, false);
});

test('the promotion gate is never stricter than production buildIssuePlan', async () => {
  // The gate and the runtime have to agree, or content that production would
  // happily issue is rejected at the door — or worse, the reverse.
  const { default: mathPath } = await import('../../functions/lib/mathPath.js');
  const cases = [
    ['tool-backed', GOOD],
    ['legacy field-graded', LEGACY_SEED],
    ['legacy, no answer', { ...LEGACY_SEED, responseFields: [{ id: 'x', label: 'x =' }] }],
    ['declares unknown tool', { ...LEGACY_SEED, type: 'transformationsLab' }],
    ['declares unknown tool with answer', { ...GOOD, type: 'transformationsLab' }],
    ['no fields at all', { ...LEGACY_SEED, responseFields: [] }],
  ];
  for (const [label, question] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildIssuePlan(question);
    const gate = evaluatePromotion(question);
    assert.equal(
      gate.canPromote, plan.issuable,
      `${label}: gate says ${gate.canPromote}, production says ${plan.issuable} (${plan.reason})`,
    );
  }
});

// --- Variants are reported, not required -----------------------------------------------

test('a single fixed item is usable, and says why it is not enough on its own', () => {
  const evaluation = evaluatePromotion(GOOD);
  assert.equal(verdict(evaluation, 'variantSupport').passed, null);
  assert.match(verdict(evaluation, 'variantSupport').detail, /single fixed item/);
  assert.equal(evaluation.canPromote, true, 'a fixed item still belongs in the bank');
});

test('a generated question reports variant support', () => {
  assert.equal(supportsVariants({ variantMode: 'generated' }), true);
  assert.equal(supportsVariants({ variants: [{}, {}] }), true);
  assert.equal(supportsVariants(GOOD), false);
  assert.equal(verdict(evaluatePromotion({ ...GOOD, variantMode: 'generated' }), 'variantSupport').passed, true);
});

// --- Standards are read from whichever authoring shape is present -------------------------

test('standards come from alignments, alignmentKeys or a bare teks field', () => {
  assert.deepEqual(primaryStandardsOf(GOOD), ['A.5A']);
  assert.deepEqual(primaryStandardsOf({ alignmentKeys: ['texas:A.2A'] }), ['A.2A']);
  assert.deepEqual(primaryStandardsOf({ teks: 'a.3b' }), ['A.3B']);
  // A supporting alignment is not what the question primarily assesses.
  assert.deepEqual(
    primaryStandardsOf({ alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary' },
      { framework: 'teks', code: 'A.2A', role: 'supporting' },
    ] }),
    ['A.5A'],
  );
});

// --- What gets stored -----------------------------------------------------------------------

test('the bank record carries provenance and canonical alignment keys', () => {
  const record = buildPathBankRecord(GOOD, {
    promotedBy: 'teacher@d.org', sourceAssignmentId: 'unit-3', sourceQuestionIndex: 2, now: 1000,
  });
  assert.deepEqual(record.alignmentKeys, ['texas:A.5A']);
  assert.equal(record.active, true);
  assert.equal(record.pathToolId, 'algebra');
  assert.deepEqual(record.promotedFrom, { assignmentId: 'unit-3', questionIndex: 2 });
  assert.equal(record.promotedBy, 'teacher@d.org');
  assert.equal(record.promotedAt, 1000);
});

test('a question that cannot be promoted produces no record at all', () => {
  assert.equal(buildPathBankRecord({ ...GOOD, answer: undefined }, { promotedBy: 'x' }), null);
});

test('promoting the same question twice updates rather than duplicates', () => {
  const first = pathBankIdFor({ sourceAssignmentId: 'unit-3', sourceQuestionIndex: 2 });
  const second = pathBankIdFor({ sourceAssignmentId: 'unit-3', sourceQuestionIndex: 2 });
  assert.equal(first, second);
  assert.equal(first, 'assignment_unit-3_q2');
});

// --- The supplied fixture, as a real promotion candidate ---------------------------------------

test('the handoff assignment is graded honestly question by question', async () => {
  const raw = await readFile(new URL('./fixtures/attributesAndRelationsOfFunctions.json', import.meta.url), 'utf8');
  const { questions } = JSON.parse(raw);

  const results = questions.map((question, index) => ({
    index,
    type: question.type,
    ...evaluatePromotion(question),
  }));

  const promotable = results.filter((entry) => entry.canPromote);
  const blocked = results.filter((entry) => !entry.canPromote);

  // Every question in it declares A2.7I, so alignment passes for all of them —
  // the alignment SPECIFICITY problem is a separate audit, and this gate does
  // not pretend to catch it.
  results.forEach((entry) => {
    assert.equal(
      entry.checks.find((c) => c.id === 'alignment').passed, true,
      `question ${entry.index} should carry a standard`,
    );
  });

  // The real division is by tool: the ones MathMaster can grade server-side can
  // be promoted, the rest cannot yet, and the gate says which.
  assert.ok(promotable.length > 0, 'some of this assignment is promotable');
  assert.ok(blocked.length > 0, 'and some of it is not, which is the honest answer');
  blocked.forEach((entry) => {
    assert.ok(entry.blocking.length > 0, `question ${entry.index} must say why it is blocked`);
  });
});
