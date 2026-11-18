/*
 * THE DRAFTS THAT THREW ON EVERY LOAD NOW OPEN, AND VALID DRAFTS OPEN AS BEFORE.
 *
 * A student's unfinished work in a registry tool is saved as a draft and read
 * back the moment the tool mounts. Before toolDraftShape.js a draft of a shape
 * the tool did not expect threw inside the first render; QuestionModuleBoundary
 * showed "This question could not be displayed", and because the draft was
 * still saved, every reload and every Chromebook showed it again. The handoff
 * named three (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 6): the
 * Regression Calculator's rows[].type, StepAlgebra2's history and the systems
 * workspace's backSub.equationIndex. Restoring every draft-backed field of
 * every scene from hostile values found the rest; fixtures/toolDraftDamageCases.json
 * holds one draft per place a tool threw, cut to the fields it needs.
 *
 * Each test opens the drafts its fix covers through Vite SSR, as a reload
 * renders them (helpers/toolDraftRender.mjs), and asserts that the tool opens,
 * that the damaged field was repaired or set aside (and said so), and that the
 * draft's valid fields came back exactly as saved. On the build before the fix
 * every one of these drafts threw. A 3×3 system also reads its reduced 2×2's
 * own draft record directly, on its first render: one test opens the 3×3 on
 * damaged records of that nested scope, another reads every recorded 2×2
 * record through it.
 *
 * The last tests are the other half of the promise: every valid draft the
 * tools wrote in Chromium (fixtures/toolDraftValidRecords.json), and the
 * classwork capture's (fixtures/classworkQ2RuntimeCapture.json), restores
 * exactly as it was saved, with nothing reported.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { openToolDraftRenderer, errorText } from './helpers/toolDraftRender.mjs';
import { LONG_TEXT_LENGTH } from './helpers/hostileDraftValues.mjs';
import * as R from '../../src/tools/systemsWorkspace/substitutionReduction.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const CASES = JSON.parse(read('tests/platform/fixtures/toolDraftDamageCases.json')).cases;
const VALID = JSON.parse(read('tests/platform/fixtures/toolDraftValidRecords.json')).scenes;

let rendererPromise = null;
const renderer = () => { rendererPromise ||= openToolDraftRenderer({ cacheName: 'tool-draft-damage' }); return rendererPromise; };
after(async () => { if (rendererPromise) await (await rendererPromise).close(); });

const sceneById = async (id) => {
  const scene = (await renderer()).scenes.find((candidate) => candidate.id === id);
  assert.ok(scene, `scene ${id}`);
  return scene;
};
const restoredField = (result, field) => result.hydrated.find((entry) => entry.field === field)?.result;

/** Open `record`; assert it renders, `field` was repaired, and every other field came back as saved. */
const opensRepaired = async (sceneId, record, field, label = field) => {
  const result = await (await renderer()).open(await sceneById(sceneId), { record });
  assert.deepEqual(errorText(result), [], `${sceneId} ${label}: the tool opens`);
  const restored = restoredField(result, field);
  assert.ok(restored, `${sceneId} ${label}: ${field} was read back`);
  assert.ok(restored.issues.length > 0, `${sceneId} ${label}: the repair of ${field} is reported`);
  result.hydrated.forEach((entry) => {
    if (entry.field === field || !Object.prototype.hasOwnProperty.call(record, entry.field)) return;
    assert.deepEqual(entry.result.value, record[entry.field], `${sceneId} ${label}: the valid ${entry.field} comes back as saved`);
  });
  return { result, restored };
};

/* ------------------------------------------------ the three the handoff named */

test('Regression Calculator: a row with no type is dropped, the other rows and the run come back (rows[].type)', async () => {
  const run = { operation: 'linearRegression', table: [[1, 2], [2, 4], [3, 5]], m: 1.5, b: 0.667, r: 0.98, r2: 0.96 };
  const rows = [
    { id: 'r1', type: 'table', rows: [['1', '2'], ['2', '4'], ['3', '5'], ['', '']] },
    { id: 'r2', value: '(3, 6)' },
    { id: 'r3', type: 7, value: '' },
    { id: 'r4', type: 'expression', value: 'y₁ ~ mx₁ + b' },
  ];
  const { restored, result } = await opensRepaired('sample:regressionCalculator', { rows, run, direction: 'positive' }, 'rows');
  assert.deepEqual(restored.value, [rows[0], rows[3]]);
  assert.deepEqual(restoredField(result, 'run').value, run, 'the regression run still stands beside its expression');
  // A run without its numbers is not drawn with toFixed: it is not kept.
  const broken = await opensRepaired('sample:regressionCalculator', { rows: [rows[0], rows[3]], run: { operation: 'linearRegression', m: 'one' } }, 'run');
  assert.equal(broken.restored.value, null);
});

test('StepAlgebra2: a step without its equations ends the history there, the steps before it come back (history)', async () => {
  const first = { before: { a: 3, b: 6, c: 21 }, operation: 'subtract', operand: 6, after: { a: 3, b: 0, c: 15 } };
  const later = { before: { a: 3, b: 0, c: 15 }, operation: 'divide', operand: 3, after: { a: 1, b: 0, c: 5 } };
  for (const damaged of [null, 'subtract 6', { operation: 'divide', operand: 3 }, { ...later, after: 5 }]) {
    const { restored } = await opensRepaired('sample:stepAlgebra2', { state: { a: 1, b: 0, c: 5 }, history: [first, damaged, later] }, 'history', JSON.stringify(damaged));
    assert.deepEqual(restored.value, [first]);
  }
});

test('systems workspace: a back-substitution index that is not one of the equations reads as not chosen yet (backSub.equationIndex)', async () => {
  const solved = VALID['extra:journey-sub-2x2'].find((record) => Number.isInteger(record.backSub?.equationIndex) && record.secondSolved?.value != null);
  assert.ok(solved, 'a recorded substitution solve that reached back-substitution');
  for (const index of ['Equation 1', '1', 2, -1, 0.5, { index: 0 }]) {
    const { restored } = await opensRepaired('extra:journey-sub-2x2', { ...solved, backSub: { equationIndex: index } }, 'backSub', JSON.stringify(index));
    assert.deepEqual(restored.value, { equationIndex: null });
  }
});

/* -------------------------------------------- every other place a tool threw */

const FIXES = [...new Set(CASES.map((testCase) => testCase.fix))].sort();
test('the damage fixture holds the drafts of every fix', () => {
  assert.ok(CASES.length >= 100, `${CASES.length} damaged drafts`);
  assert.ok(FIXES.includes('platform-scalar'));
  ['regressionCalculator/RegressionCalculator', 'stepAlgebra2/StepAlgebra2', 'systemsWorkspace/AlgebraicSystemMode'].forEach((fix) => assert.ok(FIXES.includes(fix), fix));
});

for (const fix of FIXES) {
  const title = fix === 'platform-scalar'
    ? 'every tool: a text, true / false or number field that held anything else restores as its own kind'
    : `${fix}: the damaged drafts that threw on every load open, with their valid fields as saved`;
  test(title, async () => {
    for (const testCase of CASES.filter((candidate) => candidate.fix === fix)) {
      await opensRepaired(testCase.scene, testCase.record, testCase.field, `${testCase.field} ${testCase.damage} (threw "${testCase.threw.message}" at ${testCase.threw.at})`);
    }
  });
}

/* --------------------------- the reduced 2×2 a 3×3 reads on its first render */

// The 3×3 substitution of systemsWorkspaceSubstitutionReduction.test.mjs, at
// its reduced 2×2 (-3y + z = -3, -y - 4z = -14; y = 2, z = 3).
const REDUCTION_EQUATIONS = ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'];
const reductionAtSubsystem = () => {
  const system = R.buildReductionSystem({ variables: ['x', 'y', 'z'], equations: REDUCTION_EQUATIONS });
  const reduction = [
    (state) => R.chooseReductionSource(state, system, 'E1', 'x'),
    (state) => R.recordIsolatedExpression(state, system, '-(y) - (z) + (6)'),
    (state) => R.useIsolatedExpressionAsToken(state, system),
    (state) => R.attemptTargetSubstitution(state, system, 'E2', 'x'),
    (state) => R.attemptTargetSubstitution(state, system, 'E3', 'x'),
    (state) => R.openTargetSimplification(state, 'E2'),
    (state) => R.recordTargetStandardForm(state, system, 'E2', '-3 y+ z = -3'),
    (state) => R.recordTargetStandardForm(state, system, 'E3', '- y-4 z = -14'),
  ].reduce((state, move) => {
    const { state: next, feedback } = move(state);
    assert.equal(feedback, null);
    return next;
  }, R.emptyReductionState());
  const scope = `tool:reduced-${R.reducedSystemIdentity(R.reducedSystem(reduction, system))}`;
  return { reduction, scope };
};

test('3×3 systems: a damaged draft of the reduced 2×2 opens, and a solved one is still known on the first render (subsystemReportFromDraft)', async () => {
  // The 3×3 reads its reduced 2×2's own draft record directly on its first
  // render, so that a solved subsystem does not flash open; that read threw on
  // these, before the 2×2 restored a field.
  const { reduction, scope } = reductionAtSubsystem();
  const question = { questionId: 'reduced-subsystem-draft', type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', prompt: 'Solve the system by substitution.', variables: ['x', 'y', 'z'], equations: REDUCTION_EQUATIONS, requireVerification: true };
  const { open } = await renderer();
  const opened = (subsystem) => open(question, { record: { reduction }, scopes: { [scope]: subsystem } });
  const checked = { operation: 'add', attempts: 1, text: '0 = 0', cancelledRows: { 0: true, 1: true }, cancellationConfirmed: true, coefficientAnswer: '0', constantAnswer: '0', combinationChecked: true, combinationValid: true };
  const solved = { method: 'substitution', selection: { equationIndex: 0, variable: 'z' }, firstSolved: { variable: 'y', value: 2, expression: '2' }, backSub: { equationIndex: 0 }, secondSolved: { variable: 'z', value: 3, expression: '3' } };
  // An object JSON can carry that cannot be turned into text or a number.
  const unprintable = () => JSON.parse('{"toString":1,"valueOf":null}');
  for (const [label, subsystem] of [
    ['a checked combination without its coefficients', { method: 'elimination', combination: checked }],
    ['coefficients null', { method: 'elimination', combination: { ...checked, coefficients: null } }],
    ['a coefficient that is no number', { method: 'elimination', combination: { ...checked, coefficients: { a: unprintable(), b: 0, c: 0 } } }],
    ['a statement that is no text', { method: 'elimination', combination: { ...checked, coefficients: { a: 0, b: 0, c: 0 }, text: unprintable() } }],
    ['a solved variable that is no text', { ...solved, firstSolved: { ...solved.firstSolved, variable: unprintable() } }],
    ['a solved value that is no number', { ...solved, secondSolved: { ...solved.secondSolved, value: unprintable() } }],
  ]) {
    const result = await opened(subsystem);
    assert.deepEqual(errorText(result), [], `${label}: the 3×3 opens`);
    assert.doesNotMatch(result.html, /Pick up solved value/, `${label}: no solution is read from it`);
  }
  // Both solves for one variable are not a solution of the pair.
  assert.doesNotMatch((await opened({ ...solved, secondSolved: { ...solved.secondSolved, variable: 'y' } })).html, /Pick up solved value/);
  // A valid solved 2×2 is read as before: the first render is already at
  // back-substitution, holding both values.
  const result = await opened(solved);
  assert.deepEqual(errorText(result), []);
  assert.match(result.html, /aria-label="Pick up solved value 2 for y"/);
  assert.match(result.html, /aria-label="Pick up solved value 3 for z"/);
});

test('the 3×3 reads every recorded 2×2 draft exactly as saved', async () => {
  const { subsystemReportFromDraft } = await (await renderer()).load('/src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  let solved = 0;
  for (const sceneId of ['extra:journey-sub-2x2', 'extra:journey-elim-2x2']) {
    const { variables } = await sceneById(sceneId);
    for (const record of VALID[sceneId]) {
      const report = subsystemReportFromDraft(record, variables);
      if (!report?.solution) continue;
      solved += 1;
      assert.deepEqual(report.solution, { [record.firstSolved.variable]: record.firstSolved.value, [record.secondSolved.variable]: record.secondSolved.value });
      // The very objects saved: nothing was rebuilt on the way.
      ['selection', 'substitution', 'firstSolved', 'backSub', 'secondSolved'].forEach((field) => assert.equal(report.detail[field], record[field], `${sceneId} ${field}`));
    }
  }
  assert.ok(solved >= 2, `${solved} solved 2×2 drafts read`);
});

test('text longer than the backup keeps is cut to it, and the tools that froze on it open', async () => {
  const { load, open } = await renderer();
  const { MAX_DRAFT_TEXT_LENGTH } = await load('/src/tools/shared/toolDraftShape.js');
  const long = 'a'.repeat(LONG_TEXT_LENGTH);
  // 100,000 characters held these on one render for 20 s or more (the read-aloud
  // label of each box reads the whole text); the division quotients did not
  // finish at all.
  for (const [sceneId, field] of [['path:intervalNumberLine', 'notation'], ['extra:polynomialWorkshop-longDivision', 'quotient'], ['extra:polynomialWorkshop-syntheticDivision', 'quotient'], ['extra:representationBridge-linearMultipleRepresentations', 'featureSlope']]) {
    const result = await open(await sceneById(sceneId), { record: { [field]: long } });
    assert.deepEqual(errorText(result), [], `${sceneId} opens`);
    const restored = restoredField(result, field);
    assert.equal(restored.value, long.slice(0, MAX_DRAFT_TEXT_LENGTH));
    assert.deepEqual(restored.issues, ['text-too-long']);
  }
});

/* ------------------------------------------ valid drafts restore as before */

test('every valid draft the tools wrote in Chromium restores exactly as it was saved, with nothing reported', async () => {
  const { open } = await renderer();
  let compared = 0;
  for (const [sceneId, records] of Object.entries(VALID)) {
    const scene = await sceneById(sceneId);
    for (const record of records) {
      const result = await open(scene, { record });
      assert.deepEqual(errorText(result), [], `${sceneId} opens`);
      const seen = new Set();
      result.hydrated.forEach((entry) => {
        if (seen.has(entry.field) || !Object.prototype.hasOwnProperty.call(record, entry.field)) return;
        seen.add(entry.field);
        compared += 1;
        assert.ok(isDeepStrictEqual(entry.result.value, record[entry.field]), `${sceneId} ${entry.field}: restored ${JSON.stringify(entry.result.value)?.slice(0, 200)}, saved ${JSON.stringify(record[entry.field])?.slice(0, 200)}`);
        assert.deepEqual([entry.result.restored, entry.result.issues], [true, []], `${sceneId} ${entry.field}: nothing to repair`);
      });
    }
  }
  assert.ok(compared >= 900, `${compared} fields compared`);
});

test('the draft the classwork substitution capture recorded in Chromium restores exactly as saved', async () => {
  const capture = JSON.parse(read('tests/platform/fixtures/classworkQ2RuntimeCapture.json'));
  const record = capture.persistedDraft[':work:tool'];
  const question = { questionId: 'classwork-q2-capture', type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', prompt: 'Solve the system by substitution.', equations: capture.equations, variables: ['x', 'y'] };
  const result = await (await renderer()).open(question, { record });
  assert.deepEqual(errorText(result), []);
  const fields = Object.keys(record);
  assert.ok(fields.length >= 10);
  fields.forEach((field) => {
    const restored = restoredField(result, field);
    if (!restored) return;
    assert.deepEqual(restored.value, record[field], field);
    assert.deepEqual(restored.issues, [], field);
  });
});
