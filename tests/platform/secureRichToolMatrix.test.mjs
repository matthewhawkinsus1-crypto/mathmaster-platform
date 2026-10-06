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

test('the Number Line never ships inequalityText — on a "solve and graph" item it is the solved answer', async () => {
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
  assert.equal('inequalityText' in (await securePublic(issued, 'secureTest')).tool, false);
  // "Solve 4x − 1 > 15 and graph the solution": the bank's inequalityText is
  // x > 4 — the graph and the interval both. Every mode, every bank family.
  const numberLineFamilies = bank.filter((family) => family.type === 'intervalNumberLine' && family.active !== false);
  assert.ok(numberLineFamilies.some((family) => family.id === 'mm_gen_7_7_10B_greater-ray'), 'the solve-and-graph family is in the bank');
  for (const family of numberLineFamilies) {
    // eslint-disable-next-line no-await-in-loop
    const item = await issue(family);
    for (const mode of ['secureTest', 'secureRetest', 'corrections']) {
      // eslint-disable-next-line no-await-in-loop
      const tool = (await securePublic(item, mode)).tool;
      assert.equal('inequalityText' in tool, false, `${family.id} (${mode})`);
    }
  }
});

test('Function Investigation on a secure item: nothing states where a feature is — and every item stays completable', async () => {
  const { buildGraphWorkspaceModel } = await import('../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs');

  // A card that LOCATES a feature loses its stated x on a secure item.
  const intercepts = (await securePublic(await issue(bankFamily('mm_A_3C_v2_multi-feature-intercepts')), 'secureRetest')).tool;
  assert.equal('x' in intercepts.pointTasks.find((task) => /x-intercept/i.test(task.label)), false, '"Plot the x-intercept: x = −5" no more');
  assert.equal(intercepts.pointTasks.find((task) => /y-intercept/i.test(task.label)).x, 0, 'the y-intercept is found at x = 0 by definition');
  const vertexForm = await issue(bankFamily('mm_A_7A_v2_vertex-form-construct-and-analyze'));
  const secureVertex = (await securePublic(vertexForm, 'secureTest')).tool;
  assert.equal('x' in secureVertex.pointTasks.find((task) => /^Plot the vertex/i.test(task.label)), false);
  assert.equal(secureVertex.equationLatex, vertexForm.equationLatex, 'the authored equation travels');
  // Corrections are instruction: the cards keep their x there.
  assert.ok('x' in (await securePublic(vertexForm, 'corrections')).tool.pointTasks.find((task) => /^Plot the vertex/i.test(task.label)));

  // An inverse reflection's source cards keep their x: the workspace locates
  // each reflected point from it, and without it the item could never be
  // recorded (the fix review found two A2.2B items stuck).
  const inverse = (await securePublic(await issue(bankFamily('mm_A2_2B_v2_restricted-quadratic-inverse')), 'secureTest')).tool;
  const sources = new Set(inverse.inverseReflection.sourceTaskIds);
  inverse.pointTasks.filter((task) => sources.has(task.id)).forEach((task) => assert.ok('x' in task, `${task.id} keeps its x`));

  // An item whose own graph definition carries the vertex it asks for (shown
  // in standard form) is refused on a secure Test and Retest, with the reason;
  // Corrections still use it.
  const standardForm = (await mathPath.instantiateQuestion(bankFamily('mm_A_7A_v2_standard-form-to-graph'), 'matrix|seed-1')).question;
  for (const mode of ['secureTest', 'secureRetest']) {
    // eslint-disable-next-line no-await-in-loop
    const verdict = await secureItems.certifyItem(standardForm, { mode });
    assert.equal(verdict.compatible, false, mode);
    assert.match(verdict.reason, /asks for the vertex or axis of a parabola it does not show in vertex form/);
  }
  assert.equal((await secureItems.certifyItem(standardForm, { mode: 'corrections' })).compatible, true);
  // Vertex-form items are certified: the vertex is given by the equation shown.
  assert.equal((await secureItems.certifyItem(vertexForm, { mode: 'secureTest' })).compatible, true);

  // Every certified Function Investigation family: the secure workspace asks
  // for exactly what the practice one does — the same tasks, the same parts,
  // the same number of placements each part needs — so the transform can make
  // a card silent but never make an item impossible to complete.
  const families = bank.filter((family) => ['functionInvestigation', 'functionGraph'].includes(family.type) && family.active !== false);
  const shape = (model) => JSON.stringify({ tasks: model.tasks.map((task) => task.id), parts: model.analysisParts.map((part) => [part.id, part.kind, Array.isArray(part.expected) ? part.expected.length : part.expected ?? null]) });
  let compared = 0;
  for (const family of families) {
    // eslint-disable-next-line no-await-in-loop
    const item = await issue(family);
    // eslint-disable-next-line no-await-in-loop
    if (!(await secureItems.certifyItem(item, { mode: 'secureTest' })).compatible) continue;
    // eslint-disable-next-line no-await-in-loop
    const [secureTool, practiceTool] = [(await securePublic(item, 'secureTest')).tool, (await securePublic(item, 'corrections')).tool];
    [false, true].forEach((analysisMode) => {
      assert.equal(
        shape(buildGraphWorkspaceModel({ type: 'functionInvestigation', ...secureTool }, { analysisMode })),
        shape(buildGraphWorkspaceModel({ type: 'functionInvestigation', ...practiceTool }, { analysisMode })),
        `${family.id} (analysis ${analysisMode})`,
      );
    });
    compared += 1;
  }
  assert.ok(compared >= 30, `${compared} families compared`);
});

test('a matrix3 response is refused for its own shape, never for the system\'s classification', async () => {
  const { getPathToolContract } = await import('../../functions/shared/pathToolContracts.mjs');
  const contract = getPathToolContract('systemsWorkspace');
  const definitionFor = (type) => ({ mode: 'matrix3', requireTechnology: true, solution: { type, x: 1, y: 2, z: 3 } });
  const responses = [
    { classification: 'none', technologyUsed: true },
    { classification: 'infinite', technologyUsed: true },
    { classification: 'one', technologyUsed: true },
    { classification: 'one', technologyUsed: true, x: 1, y: 2, z: 3 },
  ];
  responses.forEach((raw) => {
    const verdicts = ['one', 'none', 'infinite'].map((type) => contract.validateStudentResponse(definitionFor(type), raw).valid);
    assert.equal(new Set(verdicts).size, 1, `${JSON.stringify(raw)} is refused or accepted alike whatever the key: ${verdicts}`);
  });
  // A "none" claim on a one-solution system is an answer — and a wrong one.
  const item = await issue(bankFamily('mm_A2_3B_v2_matrix-technology-rref'));
  const graded = await secureItems.gradeIssuedItem(item, { responses: {}, raw: { classification: 'none', technologyUsed: true } });
  assert.equal(graded.rejected, false);
  assert.equal(graded.isCorrect, false);
});

test('grading never throws: crafted or oversized work is refused, so a session can always be finished', async () => {
  const graphing = await issue(bankFamily(BANK_FAMILY_BY_TOOL.graphing2));
  const poison = { toString: 1, valueOf: 1 };
  const crafted = await secureItems.gradeIssuedItem(graphing, { responses: {}, raw: { points: [[poison, poison], [poison, poison]] } });
  assert.equal(crafted.rejected, true);
  assert.equal(crafted.score, 0);
  const numberLine = await issue(bankFamily(BANK_FAMILY_BY_TOOL.intervalNumberLine));
  assert.equal((await secureItems.gradeIssuedItem(numberLine, { responses: {}, raw: { intervals: [null], notation: 'x' } })).rejected, true);
  // Too large to record is a refusal with its own message, not an internal error.
  // Every string within the contract's own bounds (1,000 characters), the whole
  // over what a secure item records (MAX_RAW_JSON).
  const notes = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`note${index}`, 'x'.repeat(900)]));
  const huge = await secureItems.gradeIssuedItem(graphing, { responses: {}, raw: { points: [[1, 2]], ...notes } });
  assert.equal(huge.rejected, true);
  assert.equal(huge.reason, 'raw_too_large');
  assert.match(huge.detail, /too large/);
});

test('storage encodes only what Firestore refuses: field items stay exactly as before', async () => {
  const storage = require('../../functions/lib/secureItemStorage.js');
  const fieldItem = await issue(bank.find((family) => !family.type && family.active !== false && /fields|choice/i.test(JSON.stringify(family.responseFields || family.choices || []))) || bank.find((family) => !family.type));
  const storedField = storage.storableItem(fieldItem);
  assert.equal('privateGradingJson' in storedField, false, 'a field item is stored plain — an older function instance still reads it');
  assert.deepEqual(storedField.privateGrading, fieldItem.privateGrading);
  const lab = await issue(bankFamily(BANK_FAMILY_BY_TOOL.dataModelingLab));
  const storedLab = storage.storableItem(lab);
  assert.equal(typeof storedLab.privateGradingJson, 'string');
  assert.equal(storage.holdsNestedArray(storedLab), false);
  assert.deepEqual(storage.readStoredItem(storedLab), lab);
});

test('an encoded item read by code that predates the codec is refused, never silently scored 0', async () => {
  // A deploy window or a rollback runs older graders against new documents.
  const storage = require('../../functions/lib/secureItemStorage.js');
  const lab = await issue(bankFamily(BANK_FAMILY_BY_TOOL.dataModelingLab));
  const stored = storage.storableItem(lab);
  assert.equal(storage.holdsNestedArray(stored), false, 'the stand-in is storable');
  // What an older submitPathResponse does: grade `privateGrading` as stored.
  const asOld = await mathPath.gradePathToolResponse(stored.privateGrading, { raw: RICH_TOOL_ANSWERS.dataModelingLab.answer({ tool: lab.tool }) });
  assert.equal(asOld.rejected, true, 'refused — no attempt spent, no evidence written');
  // What an older secure submit does: the field grader cannot read it at all.
  await assert.rejects(async () => mathPath.gradeResponse(stored.privateGrading, { responses: { answer: '1' } }));
  // The codec reads the real definition back.
  assert.deepEqual(storage.readStoredItem(stored).privateGrading, lab.privateGrading);
  // An unreadable copy leaves the stand-in, which grading refuses.
  const damaged = storage.readStoredItem({ ...stored, privateGradingJson: '{not json' });
  assert.equal((await secureItems.gradeIssuedItem(damaged, { responses: {}, raw: { r: 0.5 } })).rejected, true);
});

test('every bank item stores on a My Math Path session without an array inside an array', async () => {
  const storage = require('../../functions/lib/secureItemStorage.js');
  const tooled = bank.filter((family) => family.type && family.active !== false);
  const failures = [];
  for (const family of tooled) {
    let item;
    // eslint-disable-next-line no-await-in-loop
    try { item = await issue(family); } catch { continue; }
    // The shape issueNextQuestion writes: the sanitized question, the public
    // tool payload and the private grading definition.
    const currentQuestion = { ...mathPath.buildSanitizedQuestion(item, { toolPayload: { pathToolId: item.pathToolId, tool: item.tool } }), privateGrading: item.privateGrading };
    const stored = storage.storableItem(currentQuestion);
    if (storage.holdsNestedArray(stored)) failures.push(family.id);
    else assert.deepEqual(storage.readStoredItem(stored), storage.readStoredItem(currentQuestion), family.id);
  }
  assert.deepEqual(failures, []);
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
