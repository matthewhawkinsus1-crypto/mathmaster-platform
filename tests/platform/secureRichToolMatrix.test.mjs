/*
 * THE SECURE RICH TOOL CERTIFICATION MATRIX.
 *
 * For every Rich Tool the secure runtime certifies, one real item goes through
 * the same server functions the Test, Retest, Corrections and teacher preview
 * callables call (functions/lib/secureItems.js, mathPath, secureExam):
 *
 *   issued     instantiated from the family with a seed, its issue plan built,
 *              its certification checked — exactly as issueCourseTestQuestion
 *   public     what a student's browser receives in each mode: the tool is
 *              THERE (this is the regression: it used to be dropped, and a
 *              graphing item arrived as a bare "Answer" box), no private
 *              grading material is, and no assistance key is in a secure mode
 *   answered   correct work is built FROM THE PUBLIC PAYLOAD ALONE, the way a
 *              student builds it — never from the key — and serialized in the
 *              shape the tool submits
 *   graded     by the secure grading authority: right work is right, wrong
 *              work is wrong, unfinished work is refused as an interface
 *              problem (it used to reach the field grader and score 0 always)
 *   stored     the raw construction round-trips through the bounded storage
 *              form a session keeps (Firestore cannot hold nested arrays), and
 *              grading the stored copy gives the same verdict — which is what
 *              finalizing from an autosaved draft does
 *
 * Bank items are the real seed families (functions/seeds/pathQuestionBank).
 * Tools no bank family uses yet are certified on small authored items.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { assistanceKeysIn } from '../../functions/shared/questionRuntimePolicy.mjs';
import {
  AUTHORED_RICH_ITEMS,
  BANK_FAMILY_BY_TOOL,
  RICH_TOOL_ANSWERS,
  loadBankFamilies,
} from '../fixtures/secureRichToolAnswers.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const secureExam = require('../../functions/lib/secureExam.js');

const bank = await loadBankFamilies();
const bankFamily = (id) => {
  const family = bank.find((entry) => entry.id === id);
  assert.ok(family, `bank family ${id} exists`);
  return family;
};

// Keys that carry an answer or a grading rule. None may reach a browser.
const PRIVATE_KEYS = new Set([
  'expected', 'accepted', 'acceptedAnswers', 'answer', 'answerKey', 'correctAnswer', 'solution',
  'privateGrading', 'generatorParameters', 'gradingDefinition', 'definition', 'expectedIntervals',
  'expectedNotation', 'expectedInequality', 'expectedFinalRelation', 'expectedModel', 'descriptor',
  'regression', 'solutionReview', 'supportHints', 'attemptFeedback', 'misconceptions', 'seedKey',
]);
const privateKeysIn = (value, path = '', found = []) => {
  if (Array.isArray(value)) { value.forEach((child, index) => privateKeysIn(child, `${path}[${index}]`, found)); return found; }
  if (!value || typeof value !== 'object') return found;
  Object.entries(value).forEach(([key, child]) => {
    if (PRIVATE_KEYS.has(key)) found.push(`${path}.${key}`);
    privateKeysIn(child, `${path}.${key}`, found);
  });
  return found;
};

/** Issue one item the way issueCourseTestQuestion does. */
const issue = async (family, seed = 'matrix|seed-1') => {
  const instantiated = await mathPath.instantiateQuestion(family, seed);
  assert.ok(instantiated.question, `${family.id} instantiates`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  assert.equal(plan.issuable, true, `${family.id} is issuable`);
  return {
    ...instantiated.question,
    questionInstanceId: 'matrix-q1',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    generatorParameters: instantiated.parameters,
    privateGrading: plan.privateGrading,
    ...plan.toolPayload,
  };
};

/** What a student's browser receives for a secure exam item. */
const securePublic = async (issued, mode) => secureExam.publicQuestion(await secureItems.publicItem(issued, { mode }));

/*
 * One row per certified tool: the item (a real bank family where the bank
 * uses the tool, a small authored item where it does not yet), and how a
 * student answers it from what they can see (tests/fixtures/secureRichToolAnswers.mjs).
 */
const ROWS = Object.keys(RICH_TOOL_ANSWERS).map((toolId) => ({
  toolId,
  family: () => (BANK_FAMILY_BY_TOOL[toolId] ? bankFamily(BANK_FAMILY_BY_TOOL[toolId]) : AUTHORED_RICH_ITEMS[toolId]),
  ...RICH_TOOL_ANSWERS[toolId],
}));

for (const row of ROWS) {
  test(`${row.toolId}: issued, public in every mode, answered from public data, graded, stored`, async () => {
    const family = row.family();
    const issued = await issue(family);

    // CERTIFIED for every Test Cycle mode, from the instance a student gets.
    for (const mode of ['secureTest', 'secureRetest', 'corrections']) {
      // eslint-disable-next-line no-await-in-loop
      const verdict = await secureItems.certifyItem(issued, { mode });
      assert.equal(verdict.compatible, true, `${row.toolId} certified for ${mode}`);
      assert.equal(verdict.toolId, row.toolId);
    }

    // PUBLIC. The tool is there, under the mode the server chose.
    const test = await securePublic(issued, 'secureTest');
    const retest = await securePublic(issued, 'secureRetest');
    const corrections = await secureItems.publicItem(issued, { mode: 'corrections' });
    assert.equal(test.pathToolId, row.toolId, 'the secure payload carries the tool');
    assert.ok(test.tool && typeof test.tool === 'object', 'and its public configuration');
    assert.equal(test.runtimeMode, 'secureTest');
    assert.equal(retest.runtimeMode, 'secureRetest');
    assert.equal(corrections.runtimeMode, 'corrections');
    assert.equal(corrections.pathToolId, row.toolId);
    // Nothing private, in any mode; no assistance in a secure one.
    [test, retest, corrections].forEach((payload) => {
      assert.deepEqual(privateKeysIn(payload), [], `${row.toolId} ${payload.runtimeMode} carries no private key`);
    });
    assert.deepEqual(assistanceKeysIn(test), [], 'no assistance key on a secure Test');
    assert.deepEqual(assistanceKeysIn(retest), [], 'no assistance key on a secure Retest');
    // Secure delivery hides what cues the student about what is assessed.
    ['familyId', 'dok', 'difficultyBand', 'alignmentKey'].forEach((key) => assert.equal(key in test, false, key));

    // ANSWERED from the public payload, GRADED by the secure authority.
    const right = await secureItems.gradeItem(issued.privateGrading, { responses: {}, raw: row.answer(test) });
    assert.equal(right.rejected, false, `${row.toolId}: correct work is accepted as work (${right.detail || ''})`);
    assert.equal(right.isCorrect, true, `${row.toolId}: correct work is correct`);
    assert.equal(right.score, 1);
    const wrong = await secureItems.gradeItem(issued.privateGrading, { responses: {}, raw: row.wrong(test) });
    assert.equal(wrong.isCorrect, false, `${row.toolId}: wrong work is wrong`);
    assert.ok(wrong.score < 1);
    const missing = await secureItems.gradeItem(issued.privateGrading, { responses: {} });
    assert.equal(missing.rejected, true, 'no construction is an interface problem, not a wrong answer');
    assert.equal(missing.isCorrect, false);

    // A browser's claimed verdict is not read: it is stripped before grading.
    const forged = await secureItems.gradeItem(issued.privateGrading, { responses: {}, raw: { ...row.wrong(test), isCorrect: true, score: 1 } });
    assert.equal(forged.isCorrect, false);

    // STORED as the bounded canonical string, and graded the same from it.
    const stored = await secureItems.storedToolFields({ raw: { ...row.answer(test), isCorrect: true } });
    assert.equal(typeof stored.rawJson, 'string');
    assert.doesNotMatch(stored.rawJson, /"isCorrect"/);
    const regraded = await secureItems.gradeItem(issued.privateGrading, { responses: {}, rawJson: stored.rawJson });
    assert.equal(regraded.isCorrect, true, 'the autosaved copy grades exactly as submitted');
    assert.equal(await secureItems.payloadHasWork({ responses: {}, rawJson: stored.rawJson }), true);
  });
}

test('every certified tool has a row in this matrix', async () => {
  const { SECURE_TOOL_CERTIFICATIONS } = await import('../../functions/shared/secureToolCertification.mjs');
  const covered = new Set(ROWS.map((row) => row.toolId));
  const missing = Object.keys(SECURE_TOOL_CERTIFICATIONS).filter((toolId) => !covered.has(toolId));
  assert.deepEqual(missing, [], 'a certified tool with no end-to-end row');
});

test('a field-graded secure item is unchanged: no tool, same public fields, same grader', async () => {
  const family = {
    id: 'matrix-fields',
    prompt: 'Certification item: compute {{a}} + {{b}}.',
    responseFields: [{ id: 'answer', label: 'Sum', inputProfile: 'number', expected: '{{sum}}' }],
    generator: { parameters: { a: { type: 'int', min: 11, max: 89 }, b: { type: 'int', min: 11, max: 89 } }, derived: { sum: 'a+b' } },
  };
  const issued = await issue(family);
  const publicItem = await securePublic(issued, 'secureTest');
  assert.equal('pathToolId' in publicItem, false);
  assert.equal(publicItem.responseFields[0].id, 'answer');
  assert.equal('expected' in publicItem.responseFields[0], false);
  const [, a, b] = /compute (\d+) \+ (\d+)/.exec(publicItem.prompt);
  const right = await secureItems.gradeItem(issued.privateGrading, { responses: { answer: String(Number(a) + Number(b)) } });
  assert.equal(right.isCorrect, true);
  const wrong = await secureItems.gradeItem(issued.privateGrading, { responses: { answer: '-1' } });
  assert.equal(wrong.isCorrect, false);
  // The field grader is the same one: identical verdicts.
  const direct = await mathPath.gradeResponse(issued.privateGrading, { responses: { answer: String(Number(a) + Number(b)) } });
  assert.equal(direct.isCorrect, right.isCorrect);
  assert.equal(direct.score, right.score);
});

test('the Step Algebra workspace arrives on a secure item at the level that never does arithmetic for the student', async () => {
  const issued = await issue({ ...bankFamily('mm_A_5A_v2_balance-workspace'), workspaceDifficulty: 1, supportLevel: 1 });
  const secure = await securePublic(issued, 'secureTest');
  assert.equal(secure.tool.workspaceDifficulty, 5);
  assert.equal(secure.tool.supportLevel, 5);
  const corrections = await secureItems.publicItem(issued, { mode: 'corrections' });
  assert.equal(corrections.tool.workspaceDifficulty, 1, 'Corrections keeps the authored support');
});

test('a word-problem context is re-sanitized and its scaffold switched off on a secure item', async () => {
  const issued = await issue({
    ...bankFamily('mm_A_2G_v2_vertical-graph'),
    context: {
      scenario: 'A fence post stands at x = -6.',
      quantities: [{ id: 'q1', name: 'position', isUnknown: true, value: -6 }],
      scaffold: { enabled: true },
      interpretation: { prompt: 'What does it mean?', expectedMeaning: 'the answer' },
    },
  });
  const secure = await securePublic(issued, 'secureTest');
  const json = JSON.stringify(secure);
  assert.doesNotMatch(json, /expectedMeaning/);
  assert.equal(secure.context.scaffold.enabled, false, 'the Problem Understanding scaffold is assistance');
  assert.equal(secure.context.quantities[0].givenValue ?? null, null, 'an unknown quantity carries no value');
  const corrections = await secureItems.publicItem(issued, { mode: 'corrections' });
  assert.equal(corrections.context.scaffold.enabled, true);
});

test('an intervalNumberLine item that asks for the inequality does not ship it', async () => {
  const issued = await issue({
    id: 'matrix-interval-inequality',
    type: 'intervalNumberLine',
    prompt: 'Graph the solution, then write it as an inequality.',
    ask: ['graph', 'inequality'],
    min: -10, max: 10, step: 1, variable: 'x',
    inequalityText: 'x > 3',
    expectedIntervals: [{ min: 3, max: null, minClosed: false, maxClosed: false }],
    expectedInequality: 'x > 3',
  });
  const secure = await securePublic(issued, 'secureTest');
  assert.equal('inequalityText' in secure.tool, false);
  // Where it is the question (graph it), it still travels.
  const graphOnly = await issue({ id: 'matrix-interval-graph', type: 'intervalNumberLine', prompt: 'Graph x > 3.', ask: ['graph'], min: -10, max: 10, step: 1, inequalityText: 'x > 3', expectedIntervals: [{ min: 3, max: null, minClosed: false, maxClosed: false }] });
  assert.equal((await securePublic(graphOnly, 'secureTest')).tool.inequalityText, 'x > 3');
});

test('an uncertified tool is never issued securely — and never downgraded to a text box', async () => {
  const verdict = await secureItems.certifyItem({ type: 'transformationsLab', prompt: 'Reflect the figure.' }, { mode: 'secureTest' });
  assert.equal(verdict.compatible, false);
  assert.match(verdict.reason, /Transformations Lab/);
});

test('workspace drafts are accepted only inside the open item\'s draft family, bounded and verdict-free', async () => {
  const draftKey = await secureItems.examItemDraftKey('session-1', 'q-1');
  const stored = await secureItems.storedToolFields({
    raw: { points: [[1, 2], [3, 4]] },
    workspaceDrafts: [
      { key: `${draftKey}:work:tool`, savedAt: 10, value: { points: [[1, 2]], isCorrect: true } },
      { key: 'mathmaster:draft:v2:someone-else', savedAt: 11, value: 'not this item' },
      { key: (await secureItems.examItemDraftKey('session-1', 'q-2')), savedAt: 12, value: 'another item' },
    ],
  }, { draftKey, includeWorkspaceDrafts: true });
  const entries = JSON.parse(stored.workspaceDraftsJson);
  assert.deepEqual(entries.map((entry) => entry.key), [`${draftKey}:work:tool`]);
  assert.equal('isCorrect' in entries[0].value, false);
  // A recorded response never keeps them.
  const recorded = await secureItems.storedToolFields({ raw: { points: [[1, 2], [3, 4]] }, workspaceDrafts: [{ key: `${draftKey}:x`, savedAt: 1, value: 1 }] }, { draftKey });
  assert.equal('workspaceDraftsJson' in recorded, false);
  // And they come back in the shape the browser restores from.
  const restored = secureItems.publicDraft({ responsePayload: { responses: {}, ...stored } });
  assert.deepEqual(restored.responsePayload.raw, { points: [[1, 2], [3, 4]] });
  assert.equal(restored.responsePayload.workspaceDrafts[0].key, `${draftKey}:work:tool`);
});

test('oversized tool work is refused rather than truncated', async () => {
  await assert.rejects(
    () => secureItems.storedToolFields({ raw: { notes: Array.from({ length: 200 }, (unused, index) => `${index}`.repeat(90)) } }),
    (error) => error.code === 'raw_too_large',
  );
});
