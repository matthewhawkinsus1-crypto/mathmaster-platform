/*
 * linearTableWorkbench — SERVER-AUTHORITATIVE GRADING PARITY.
 *
 * The workbench's Check used to call scoreLinearTableWorkbench itself and hand
 * the platform only the verdict. It now asks the shared grader
 * (functions/shared/serverGrading/tools/linearTableWorkbench.mjs), the same
 * pure function the server runs on the raw work. These tests pin:
 *
 *   - the verdict for every mode (constantRate, deriveEquation, repairValue)
 *     with the workbench's own defaults, tolerances, fraction parsing,
 *     order-normalized intervals and equal-weight score;
 *   - that the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the serialized tool response) agree exactly;
 *   - that the grader reproduces the workbench's previous scorer except for
 *     the two documented fixes (an unchosen offending row, an equation mathjs
 *     must not evaluate);
 *   - that tampered or malformed work never crashes and never earns credit;
 *   - that the component routes, grades and reports through the grader and
 *     carries no verdict of its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import linearTableWorkbenchGrader, {
  linearTableEvidenceChecks,
  linearTableRequiredComparisons,
} from '../../functions/shared/serverGrading/tools/linearTableWorkbench.mjs';
import linearTableWorkbenchDeclaration, {
  resolveLinearTableWorkbenchMode,
} from '../../functions/shared/serverGrading/declarations/linearTableWorkbench.mjs';
import {
  LINEAR_TABLE_WORKBENCH_MODES,
  equationTextIsSafeToEvaluate,
  scoreLinearTableWorkbench,
} from '../../functions/shared/toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { declaredGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const COMPONENT = readFileSync(new URL('../../src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', import.meta.url), 'utf8');

/*
 * The work exactly as LinearTableWorkbench.jsx submits it: its `emptyState`
 * plus whatever the student did, with the recorded intervals (the state the
 * component calls `evidence`) under `intervals`. The source-contract test
 * below pins that the component submits this object.
 */
const labWork = (state = {}) => ({
  intervals: [],
  classification: '',
  repairRowIndex: null,
  repairedValue: '',
  m: '',
  b: '',
  equation: '',
  ...state,
});
const interval = (i, j, dx, dy, rate) => ({ i, j, dx: String(dx), dy: String(dy), rate: String(rate) });
// The same work in the shape the workbench handed scoreLinearTableWorkbench before.
const previousResponse = ({ intervals, ...rest }) => ({ ...rest, evidence: intervals });

/** Grade through the browser path and the server path; they must agree exactly. */
const bothPaths = (question, work) => {
  const browser = gradeToolCheck(linearTableWorkbenchGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces the tool response it would send');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server };
};
const grade = (question, work) => bothPaths(question, work).browser;
const partIds = (result) => result.parts.map((part) => part.id);
const verdicts = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));
const completeness = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isComplete]));

// --- Fixtures ----------------------------------------------------------------------
// y = 2x + 3, equal spacing.
const LINEAR_Q = { type: 'linearTableWorkbench', mode: 'constantRate', rows: [{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }], requiredComparisons: 2 };
const LINEAR_CORRECT = labWork({ intervals: [interval(0, 1, 1, 2, 2), interval(1, 2, 1, 2, 2)], classification: 'linear' });

// Rate 2, 2, then 5.
const NONLINEAR_Q = { type: 'linearTableWorkbench', mode: 'constantRate', rows: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 9 }], requiredComparisons: 3 };
const NONLINEAR_CORRECT = labWork({
  intervals: [interval(0, 1, 1, 2, 2), interval(1, 2, 1, 2, 2), interval(2, 3, 1, 5, 5)],
  classification: 'nonlinear',
});

// y = -2x + 10 through irregular x-values.
const DERIVE_Q = { type: 'linearTableWorkbench', mode: 'deriveEquation', rows: [{ x: -3, y: 16 }, { x: 1, y: 8 }, { x: 4, y: 2 }, { x: 9, y: -8 }], requiredComparisons: 2 };
const DERIVE_CORRECT = labWork({
  intervals: [interval(0, 1, 4, -8, -2), interval(2, 3, 5, -10, -2)],
  classification: 'linear',
  m: '-2',
  b: '10',
  equation: 'y = -2x + 10',
});

// y = -2x + 10, except row 3 (index 2) was mistyped as 99; it should be 6.
const REPAIR_Q = { type: 'linearTableWorkbench', mode: 'repairValue', rows: [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 99 }, { x: 4, y: 2 }, { x: 6, y: -2 }], requiredComparisons: 2 };
const REPAIR_CORRECT = labWork({
  intervals: [interval(0, 1, 2, -4, -2), interval(3, 4, 2, -4, -2)],
  classification: 'linear',
  repairRowIndex: 2,
  repairedValue: '6',
});

// y = 2x + 3, except the FIRST row (index 0), which should be 3.
const REPAIR_FIRST_Q = { type: 'linearTableWorkbench', mode: 'repairValue', rows: [{ x: 0, y: 50 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }, { x: 4, y: 11 }], requiredComparisons: 2 };
const REPAIR_FIRST_CORRECT = labWork({
  intervals: [interval(1, 2, 1, 2, 2), interval(3, 4, 1, 2, 2)],
  classification: 'linear',
  repairRowIndex: 0,
  repairedValue: '3',
});

// y = x/2 + 1: a fractional slope.
const FRACTION_Q = { type: 'linearTableWorkbench', mode: 'deriveEquation', rows: [{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 3 }, { x: 6, y: 4 }], requiredComparisons: 2 };

// --- The declaration ------------------------------------------------------------

test('linearTableWorkbench is declared shared-server in every mode, and the manifest and graders agree', () => {
  assert.equal(GRADING_MANIFEST.linearTableWorkbench, linearTableWorkbenchDeclaration);
  assert.equal(linearTableWorkbenchDeclaration.contractVersion, 1);
  assert.equal(linearTableWorkbenchDeclaration.defaultMode, 'constantRate');
  // The declaration lists exactly the modes the workbench's mathematics knows.
  assert.deepEqual(Object.keys(linearTableWorkbenchDeclaration.modes).sort(), [...LINEAR_TABLE_WORKBENCH_MODES].sort());
  Object.values(linearTableWorkbenchDeclaration.modes).forEach((entry) => assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER));
  assert.equal(linearTableWorkbenchDeclaration.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(TOOL_GRADERS.linearTableWorkbench, linearTableWorkbenchGrader);
  assert.equal(linearTableWorkbenchGrader.toolId, 'linearTableWorkbench');
  assert.deepEqual([...linearTableWorkbenchGrader.problems], []);
  LINEAR_TABLE_WORKBENCH_MODES.forEach((mode) => assert.equal(typeof linearTableWorkbenchGrader.modeGraders[mode], 'function', mode));
});

test('mode resolution matches the component: an exact mode name, otherwise the constant-rate view', () => {
  // How the workbench chose its view before this change: `questionData.mode
  // || 'constantRate'`, then panels for exactly 'repairValue' and
  // 'deriveEquation' — anything else showed the constant-rate screen.
  const previousView = (question) => {
    const mode = question.mode || 'constantRate';
    return mode === 'repairValue' || mode === 'deriveEquation' ? mode : 'constantRate';
  };
  const modes = [undefined, null, '', 'constantRate', 'deriveEquation', 'repairValue', 'notAMode', ' repairValue ', 'RepairValue', ['repairValue'], 7];
  for (const mode of modes) {
    const question = { ...REPAIR_Q, ...(mode === undefined ? {} : { mode }) };
    const label = JSON.stringify(mode);
    const view = previousView(question);
    assert.equal(resolveLinearTableWorkbenchMode(question), view, `component view for ${label}`);
    assert.equal(resolveToolMode(linearTableWorkbenchDeclaration, question), view, `declared mode for ${label}`);
    const support = declaredGradingSupport(question);
    assert.equal(support.supported, true, label);
    assert.equal(support.mode, view, label);
    // The scorer's own branch agrees: only the repair view grades a repair.
    assert.equal(partIds(grade(question, REPAIR_CORRECT)).includes('repairIndex'), view === 'repairValue', label);
  }
  assert.equal(declaredGradingSupport({ toolId: 'linearTableWorkbench', rows: LINEAR_Q.rows }).mode, 'constantRate');

  // The component routes with the declaration's resolver and reads the mode nowhere else.
  const executable = executableSource(COMPONENT);
  assert.match(executable, /import \{ resolveLinearTableWorkbenchMode \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/declarations\/linearTableWorkbench\.mjs'/);
  assert.match(executable, /const mode = resolveLinearTableWorkbenchMode\(questionData\);/);
  assert.equal((executable.match(/questionData\??\.mode\b/g) || []).length, 0, 'no second reading of questionData.mode');
});

// --- Fully correct, every mode --------------------------------------------------------

test('fully correct constant-rate work earns full credit on both paths', () => {
  const result = grade(LINEAR_Q, LINEAR_CORRECT);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(partIds(result), ['evidenceCount', 'evidenceAccuracy', 'classification']);
});

test('a nonlinear table is correct only when the recorded rates actually change', () => {
  const result = grade(NONLINEAR_Q, NONLINEAR_CORRECT);
  assert.equal(result.isCorrect, true);
  assert.deepEqual(partIds(result), ['evidenceCount', 'evidenceAccuracy', 'classification', 'nonconstantRateEvidence']);

  // Three correct intervals that all happen to show rate 2, then "nonlinear".
  const cherryPicked = labWork({ intervals: [interval(0, 1, 1, 2, 2), interval(1, 2, 1, 2, 2), interval(0, 2, 2, 4, 2)], classification: 'nonlinear' });
  const weak = grade(NONLINEAR_Q, cherryPicked);
  assert.equal(weak.isCorrect, false);
  assert.deepEqual(verdicts(weak), { evidenceCount: true, evidenceAccuracy: true, classification: true, nonconstantRateEvidence: false });
  assert.equal(weak.score, 3 / 4);
});

test('fully correct deriveEquation and repairValue work earns full credit on both paths', () => {
  const derive = grade(DERIVE_Q, DERIVE_CORRECT);
  assert.equal(derive.isCorrect, true);
  assert.equal(derive.isComplete, true);
  assert.deepEqual(partIds(derive), ['evidenceCount', 'evidenceAccuracy', 'classification', 'slope', 'intercept', 'equation']);

  const repair = grade(REPAIR_Q, REPAIR_CORRECT);
  assert.equal(repair.isCorrect, true);
  assert.equal(repair.isComplete, true);
  assert.deepEqual(partIds(repair), ['evidenceCount', 'evidenceAccuracy', 'repairIndex', 'repairValue', 'classification']);

  const first = grade(REPAIR_FIRST_Q, REPAIR_FIRST_CORRECT);
  assert.equal(first.isCorrect, true, 'choosing Row 1 when Row 1 is the broken one');
});

// --- Incorrect and partial credit ---------------------------------------------------

test('incorrect work scores the equal-weight share of parts that are right', () => {
  const wrongClass = grade(LINEAR_Q, { ...LINEAR_CORRECT, classification: 'nonlinear' });
  assert.equal(wrongClass.isCorrect, false);
  assert.deepEqual(verdicts(wrongClass), { evidenceCount: true, evidenceAccuracy: true, classification: false });
  assert.equal(wrongClass.score, 2 / 3);

  const signSlip = grade(DERIVE_Q, { ...DERIVE_CORRECT, intervals: [interval(0, 1, 4, 8, 2), DERIVE_CORRECT.intervals[1]], b: '-10' });
  assert.deepEqual(verdicts(signSlip), { evidenceCount: true, evidenceAccuracy: false, classification: true, slope: true, intercept: false, equation: true });
  assert.equal(signSlip.score, 4 / 6);

  const wrongRow = grade(REPAIR_Q, { ...REPAIR_CORRECT, repairRowIndex: 3, repairedValue: '7' });
  assert.deepEqual(verdicts(wrongRow), { evidenceCount: true, evidenceAccuracy: true, repairIndex: false, repairValue: false, classification: true });
  assert.equal(wrongRow.score, 3 / 5);

  // The recorded partial credit is the score, as the workbench reported it.
  assert.equal(attemptInputsFromGrading(signSlip).partialCreditPercent, 67);
});

test('partially complete work is graded (missing inputs are wrong) and reported incomplete', () => {
  // One interval of the two required, nothing else.
  const started = grade(DERIVE_Q, labWork({ intervals: [DERIVE_CORRECT.intervals[0]] }));
  assert.equal(started.graded, true);
  assert.equal(started.isComplete, false);
  assert.equal(started.isCorrect, false);
  assert.deepEqual(verdicts(started), { evidenceCount: false, evidenceAccuracy: true, classification: false, slope: false, intercept: false, equation: false });
  assert.deepEqual(completeness(started), { evidenceCount: false, evidenceAccuracy: true, classification: false, slope: false, intercept: false, equation: false });
  assert.equal(started.score, 1 / 6);

  // Every part but one present: still incomplete, so a deadline would not auto-submit it.
  for (const [question, work, missing] of [
    [DERIVE_Q, { ...DERIVE_CORRECT, equation: '' }, 'equation'],
    [DERIVE_Q, { ...DERIVE_CORRECT, m: '  ' }, 'slope'],
    [REPAIR_Q, { ...REPAIR_CORRECT, repairRowIndex: null }, 'repairIndex'],
    [REPAIR_Q, { ...REPAIR_CORRECT, repairedValue: '' }, 'repairValue'],
    [LINEAR_Q, { ...LINEAR_CORRECT, classification: '' }, 'classification'],
    [LINEAR_Q, { ...LINEAR_CORRECT, intervals: [LINEAR_CORRECT.intervals[0], interval(1, 2, 1, 2, '')] }, 'evidenceAccuracy'],
  ]) {
    const result = grade(question, work);
    assert.equal(result.isComplete, false, missing);
    assert.equal(result.isCorrect, false, missing);
    assert.equal(completeness(result)[missing], false, missing);
    assert.equal(verdicts(result)[missing], false, missing);
  }
});

test('completeness waits for the intervals the Check button waits for', () => {
  // requiredComparisons unauthored: the workbench asks for 3.
  const question = { ...LINEAR_Q, requiredComparisons: undefined };
  const two = grade(question, LINEAR_CORRECT);
  assert.equal(two.isComplete, false);
  assert.equal(verdicts(two).evidenceCount, false);
  const three = grade(question, { ...LINEAR_CORRECT, intervals: [...LINEAR_CORRECT.intervals, interval(2, 3, 1, 2, 2)] });
  assert.equal(three.isComplete, true);
  assert.equal(three.isCorrect, true);
  assert.equal(linearTableRequiredComparisons(question), 3);
  assert.equal(three.parts[0].label, 'At least 3 distinct recorded intervals');
});

// --- Equivalent forms --------------------------------------------------------------

test('equivalent entries are accepted: fractions, decimals, a true minus sign, either row order, any equation form', () => {
  const forms = labWork({
    intervals: [
      // Recorded from the later row back to the earlier one: still smaller x to larger x.
      { i: 1, j: 0, dx: '8/2', dy: '−8', rate: '-2.0' },
      { i: 3, j: 2, dx: '5', dy: '-10', rate: '-10/5' },
    ],
    classification: 'linear',
    m: '-4/2',
    b: '10.0',
    equation: '2x + y = 10',
  });
  assert.equal(grade(DERIVE_Q, forms).isCorrect, true);
  for (const equation of ['y=-2x+10', 'y = 10 - 2x', 'y - 10 = -2(x - 0)', 'y = -2*x + 10', '-2x + 10 = y', 'y = sqrt(4)(-x) + 10']) {
    assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, equation })).equation, true, equation);
  }
  for (const equation of ['y = 2x + 10', 'y = -2x', 'x = -2y + 10', 'Y = -2x + 10', 'y = -2x^2 + 10', 'y = -2x + 10 = 0']) {
    assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, equation })).equation, false, equation);
  }

  // A fractional slope typed as a fraction or a decimal.
  const half = labWork({ intervals: [interval(0, 1, 2, 1, '1/2'), interval(1, 2, 2, 1, 0.5)], classification: 'linear', m: '1/2', b: '1', equation: 'y = x/2 + 1' });
  assert.equal(grade(FRACTION_Q, half).isCorrect, true);
  assert.equal(grade(FRACTION_Q, { ...half, m: '0.5', equation: 'y = 0.5x + 1' }).isCorrect, true);

  // Numbers where the boxes would hold text (an older draft) read the same.
  assert.equal(grade(DERIVE_Q, { ...DERIVE_CORRECT, intervals: [{ i: 0, j: 1, dx: 4, dy: -8, rate: -2 }, { i: 2, j: 3, dx: 5, dy: -10, rate: -2 }], m: -2, b: 10 }).isCorrect, true);
  // So does a row index the select stored as text.
  assert.equal(grade(REPAIR_Q, { ...REPAIR_CORRECT, repairRowIndex: '2' }).isCorrect, true);
});

test('tolerances are the workbench\'s: 1e-6 for interval values, 1e-4 for m and b', () => {
  const intervalWithin = { ...LINEAR_CORRECT, intervals: [interval(0, 1, '1.0000005', 2, 2), LINEAR_CORRECT.intervals[1]] };
  const intervalOutside = { ...LINEAR_CORRECT, intervals: [interval(0, 1, '1.00001', 2, 2), LINEAR_CORRECT.intervals[1]] };
  assert.equal(verdicts(grade(LINEAR_Q, intervalWithin)).evidenceAccuracy, true);
  assert.equal(verdicts(grade(LINEAR_Q, intervalOutside)).evidenceAccuracy, false);
  assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, m: '-2.00005' })).slope, true);
  assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, m: '-2.001' })).slope, false);
  assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, b: '10.00009' })).intercept, true);
  assert.equal(verdicts(grade(DERIVE_Q, { ...DERIVE_CORRECT, b: '10.0002' })).intercept, false);
});

test('unauthored question fields take the workbench\'s defaults', () => {
  // No mode -> constant rate; [x, y] rows; no requiredComparisons -> 3.
  const question = { type: 'linearTableWorkbench', rows: [[0, 3], [1, 5], [2, 7], [3, 9]] };
  const work = labWork({ intervals: [interval(0, 1, 1, 2, 2), interval(1, 2, 1, 2, 2), interval(2, 3, 1, 2, 2)], classification: 'linear' });
  const { browser: result, server } = bothPaths(question, work);
  assert.equal(server.mode, 'constantRate');
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);

  // A requiredComparisons beyond the table's pairs is capped for the check.
  const small = { type: 'linearTableWorkbench', rows: [[0, 0], [1, 1], [2, 2]], requiredComparisons: 9 };
  const allPairs = labWork({ intervals: [interval(0, 1, 1, 1, 1), interval(1, 2, 1, 1, 1), interval(0, 2, 2, 2, 1)], classification: 'linear' });
  assert.equal(verdicts(grade(small, allPairs)).evidenceCount, true);
});

test('the same row pair recorded twice never counts twice', () => {
  const result = grade(LINEAR_Q, { ...LINEAR_CORRECT, intervals: [interval(0, 1, 1, 2, 2), interval(1, 0, 1, 2, 2)] });
  assert.equal(verdicts(result).evidenceCount, false);
  assert.equal(result.isCorrect, false);
  const checks = linearTableEvidenceChecks(LINEAR_Q, { ...LINEAR_CORRECT, intervals: [interval(0, 1, 1, 2, 2), interval(1, 0, 1, 2, 2)] });
  assert.deepEqual(checks.map((entry) => entry.duplicate), [false, true]);
});

// --- Parity with the scorer the workbench ran before ----------------------------------

const PREVIOUS_LABELS = {
  evidenceAccuracy: 'Δx, Δy, and rate for every recorded interval',
  nonconstantRateEvidence: 'Recorded intervals show that the rate changes',
  classification: 'Linear vs. nonlinear classification',
  repairIndex: 'Identified offending row',
  repairValue: 'Corrected value',
  slope: 'Slope (m)',
  intercept: 'y-intercept (b)',
  equation: 'Equation y = mx + b',
};

test('the grader reproduces the workbench\'s previous verdict, parts, labels, score and partial credit', () => {
  const fixtures = [
    [LINEAR_Q, LINEAR_CORRECT],
    [LINEAR_Q, { ...LINEAR_CORRECT, classification: 'nonlinear' }],
    [LINEAR_Q, labWork({ intervals: [interval(0, 1, 1, 2, 2)] })],
    [NONLINEAR_Q, NONLINEAR_CORRECT],
    [NONLINEAR_Q, { ...NONLINEAR_CORRECT, intervals: NONLINEAR_CORRECT.intervals.slice(0, 2), classification: 'linear' }],
    [DERIVE_Q, DERIVE_CORRECT],
    [DERIVE_Q, { ...DERIVE_CORRECT, m: '2', equation: 'y = 2x + 10' }],
    [DERIVE_Q, labWork({ intervals: [interval(0, 1, 4, -8, -2), interval(0, 1, 4, -8, -2)], classification: 'linear', m: '-2' })],
    [REPAIR_Q, REPAIR_CORRECT],
    [REPAIR_Q, { ...REPAIR_CORRECT, repairRowIndex: 4, repairedValue: '6' }],
    [REPAIR_FIRST_Q, REPAIR_FIRST_CORRECT],
    [FRACTION_Q, labWork({ intervals: [interval(0, 1, 2, 1, '1/2'), interval(1, 2, 2, 1, '2')], classification: 'linear', m: '1/2', b: '1', equation: 'y = x/2 + 1' })],
  ];
  fixtures.forEach(([question, work], index) => {
    const previous = scoreLinearTableWorkbench(question, previousResponse(work));
    const shared = grade(question, work);
    assert.equal(shared.isCorrect, previous.isCorrect, `fixture ${index}`);
    assert.equal(shared.score, previous.score, `fixture ${index}`);
    assert.deepEqual(shared.parts.map((part) => [part.id, part.isCorrect]), Object.entries(previous.parts), `fixture ${index}`);
    assert.equal(attemptInputsFromGrading(shared).partialCreditPercent, previous.isCorrect ? 100 : Math.round(previous.score * 100), `fixture ${index}`);
    shared.parts.forEach((part) => {
      const expected = part.id === 'evidenceCount'
        ? `At least ${linearTableRequiredComparisons(question)} distinct recorded intervals`
        : PREVIOUS_LABELS[part.id];
      assert.equal(part.label, expected, `fixture ${index}: ${part.id}`);
    });
    // The per-interval feedback the workbench shows is the scorer's, unchanged.
    assert.deepEqual(linearTableEvidenceChecks(question, work), previous.evidenceCorrectness, `fixture ${index}`);
  });
});

test('FIX: an unchosen offending row is no longer read as Row 1', () => {
  // Before: scoreLinearTableWorkbench compared Number(null) — 0 — with the
  // derived row, so leaving "Choose a row…" earned repairIndex whenever the
  // first row was the broken one.
  const unchosen = { ...REPAIR_FIRST_CORRECT, repairRowIndex: null };
  assert.equal(scoreLinearTableWorkbench(REPAIR_FIRST_Q, previousResponse(unchosen)).parts.repairIndex, true, 'the previous scorer');
  const after = grade(REPAIR_FIRST_Q, unchosen);
  assert.equal(verdicts(after).repairIndex, false);
  assert.equal(after.isCorrect, false);
  assert.equal(after.isComplete, false);
  assert.equal(after.score, 4 / 5);
  // An empty select value and junk are not a choice either; a real Row 1 still is.
  for (const repairRowIndex of ['', 'row 1', -1, 0.5, { index: 0 }, [0]]) {
    assert.equal(verdicts(grade(REPAIR_FIRST_Q, { ...REPAIR_FIRST_CORRECT, repairRowIndex })).repairIndex, false, JSON.stringify(repairRowIndex));
  }
  assert.equal(verdicts(grade(REPAIR_FIRST_Q, REPAIR_FIRST_CORRECT)).repairIndex, true);
});

test('FIX: an equation mathjs must not evaluate is refused before it is evaluated', () => {
  // gcd is not on the scalar allow-list: the previous scorer evaluated it
  // (gcd(10, 20) = 10, so this read as y = -2x + 10); the grader refuses it.
  const disallowed = { ...DERIVE_CORRECT, equation: 'y = -2x + gcd(10, 20)' };
  assert.equal(scoreLinearTableWorkbench(DERIVE_Q, previousResponse(disallowed)).parts.equation, true, 'the previous scorer');
  assert.equal(verdicts(grade(DERIVE_Q, disallowed)).equation, false);

  // The constructs that allocate or run code are refused without evaluating
  // (`y = zeros(3000,3000)` alone took a minute and ~700 MB).
  for (const text of ['y = zeros(3000,3000)', 'y = 1:1e7', 'y = [2]*x + 1', 'y = ones(9999, 9999)', 'y = evaluate("zeros(3000,3000)")', 'y = createUnit("foo")', 'y = 2x + 1; 3', 'y = a.b', 'y = {a: 1}', 'f(x) = 2x + 1', 'y = (a = 2)x']) {
    assert.equal(equationTextIsSafeToEvaluate(text), false, text);
  }
  const started = Date.now();
  const refused = grade(DERIVE_Q, { ...DERIVE_CORRECT, equation: 'y = zeros(3000,3000)' });
  assert.equal(verdicts(refused).equation, false);
  assert.ok(Date.now() - started < 5000, 'refused without being evaluated');
  // Ordinary equations, including scalar functions a student might write, are still evaluated.
  for (const text of ['y = -2x + 10', '2x + y = 10', 'y - 10 = -2(x - 0)', 'y = sqrt(4)x + 1', 'y = (1/2)x + 3', 'y = abs(-2)x']) {
    assert.equal(equationTextIsSafeToEvaluate(text), true, text);
  }
});

// --- Malformed and tampered work ------------------------------------------------------

test('verdict-looking keys injected into the work are stripped and change nothing', () => {
  const clean = { ...DERIVE_CORRECT, b: '11' };
  const baseline = grade(DERIVE_Q, clean);
  const tampered = {
    ...clean,
    isCorrect: true,
    score: 1,
    checks: { slope: true, intercept: true },
    expected: { m: -2, b: 10 },
    solution: 'y = -2x + 10',
    intervals: clean.intervals.map((entry) => ({ ...entry, correct: true })),
  };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['checks', 'correct', 'expected', 'isCorrect', 'score', 'solution']);
  const result = grade(DERIVE_Q, tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, baseline.score);
  assert.deepEqual(result.parts, baseline.parts);
});

test('wrong types and junk entries are graded as wrong, never thrown and never matched by accident', () => {
  const junk = { intervals: { 0: interval(0, 1, 1, 2, 2) }, classification: ['linear'], repairRowIndex: { row: 2 }, repairedValue: ['6'], m: { value: -2 }, b: null, equation: 42 };
  for (const question of [LINEAR_Q, DERIVE_Q, REPAIR_Q]) {
    const result = grade(question, junk);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, false);
    assert.equal(result.score, 0, question.mode);
  }
  // Junk inside the interval list: each bad entry is an invalid interval.
  const entries = [null, 'Row 1 to Row 2', 7, [0, 1, 1, 2, 2], { i: [0], j: [1], dx: [1], dy: [2], rate: [2] }, { i: '__proto__', j: 'length', dx: '1', dy: '2', rate: '2' }];
  for (const entry of entries) {
    const result = grade(LINEAR_Q, { ...LINEAR_CORRECT, intervals: [LINEAR_CORRECT.intervals[0], entry] });
    assert.equal(verdicts(result).evidenceAccuracy, false, JSON.stringify(entry));
    assert.equal(result.isCorrect, false, JSON.stringify(entry));
  }
  // The component's state name is not the work key: intervals sent as `evidence` are not read.
  const misnamed = grade(LINEAR_Q, previousResponse(LINEAR_CORRECT));
  assert.equal(misnamed.isCorrect, false);
  assert.equal(verdicts(misnamed).evidenceAccuracy, false);
  // Out-of-range rows are not an interval.
  assert.equal(verdicts(grade(LINEAR_Q, { ...LINEAR_CORRECT, intervals: [interval(0, 9, 9, 18, 2), LINEAR_CORRECT.intervals[1]] })).evidenceAccuracy, false);
  // A classification is an exact choice, not something that merely contains one.
  assert.equal(verdicts(grade(LINEAR_Q, { ...LINEAR_CORRECT, classification: ' linear' })).classification, false);
});

test('non-object and oversize work is not gradable on either path', () => {
  for (const work of [null, undefined, 'linear', 42, [interval(0, 1, 1, 2, 2)]]) {
    const { browser, server } = bothPaths(LINEAR_Q, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(server.graded, false);
    assert.equal(browser.isCorrect, false);
  }
  const oversize = {
    ...LINEAR_CORRECT,
    intervals: Array.from({ length: 120 }, (_, index) => interval(index % 4, (index + 1) % 4, 'x'.repeat(200), 2, 2)),
  };
  const { browser, server } = bothPaths(LINEAR_Q, oversize);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(server.reason, 'oversize-response');
});

test('realistic maximal work stays inside the response limits and is graded', () => {
  // A 12-row table with every one of its 66 intervals recorded as fractions.
  const rows = Array.from({ length: 12 }, (_, index) => ({ x: index * 3 - 17, y: -(index * 3 - 17) * 5 / 7 + 4 }));
  const question = { type: 'linearTableWorkbench', mode: 'deriveEquation', rows, requiredComparisons: 66 };
  const evidence = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const dx = (j - i) * 3;
      evidence.push(interval(i, j, `${dx}`, `-${dx * 5}/7`, '-5/7'));
    }
  }
  const work = labWork({ intervals: evidence, classification: 'linear', m: '-5/7', b: '4', equation: 'y = (-5/7)x + 4' });
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${canonicalToolWorkJson(work).length} chars`);
  const result = grade(question, work);
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.isCorrect, true);
});

test('realistic work never carries a key the response contract strips', () => {
  for (const work of [LINEAR_CORRECT, NONLINEAR_CORRECT, DERIVE_CORRECT, REPAIR_CORRECT, labWork()]) {
    assert.deepEqual(boundToolWork(work).dropped, []);
  }
});

// --- Discrimination -------------------------------------------------------------------

test('correct work fails against a question whose key was altered', () => {
  assert.equal(grade(DERIVE_Q, DERIVE_CORRECT).isCorrect, true);
  // One table value moved: the table is no longer that line, or linear at all.
  const moved = { ...DERIVE_Q, rows: DERIVE_Q.rows.map((row, index) => (index === 3 ? { x: 9, y: -7 } : row)) };
  const movedResult = grade(moved, DERIVE_CORRECT);
  assert.equal(movedResult.isCorrect, false);
  assert.equal(verdicts(movedResult).evidenceAccuracy, false);
  assert.equal(verdicts(movedResult).classification, false);
  // A shifted line: same rates, different intercept.
  const shifted = { ...DERIVE_Q, rows: DERIVE_Q.rows.map((row) => ({ x: row.x, y: row.y + 1 })) };
  assert.deepEqual(verdicts(grade(shifted, DERIVE_CORRECT)), { evidenceCount: true, evidenceAccuracy: true, classification: true, slope: true, intercept: false, equation: false });
  // More intervals required than were recorded.
  assert.equal(verdicts(grade({ ...DERIVE_Q, requiredComparisons: 3 }, DERIVE_CORRECT)).evidenceCount, false);
  // A different broken row.
  const otherRepair = { ...REPAIR_Q, rows: [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 6 }, { x: 4, y: 20 }, { x: 6, y: -2 }] };
  assert.equal(verdicts(grade(otherRepair, REPAIR_CORRECT)).repairIndex, false);
});

// --- The component is wired to the grader -------------------------------------------

test('the workbench\'s Check computes its verdict only through the shared grader and submits that verdict with the work', () => {
  const executable = executableSource(COMPONENT);
  assert.match(executable, /import linearTableWorkbenchGrader,?[\s\S]*?from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/linearTableWorkbench\.mjs'/);
  assert.match(executable, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js'/);
  assert.match(executable, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js'/);

  const check = region(executable, 'const check = () => {', 'const feedbackParts', 'the Check handler');
  assert.match(check, /const result = gradeToolCheck\(linearTableWorkbenchGrader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{[^}]*parts: result\.parts[^}]*\}/);
  assert.match(check, /evidenceCorrectness: linearTableEvidenceChecks\(questionData, work\)/);
  // No verdict of its own, and no answer material in the metadata.
  assert.doesNotMatch(executable, /scoreLinearTableWorkbench|findTableRepair|fitTableLine|tableClassification|matchesNumericAnswer/);
  assert.doesNotMatch(check, /repair\b|correctedY|fit\b|trueClassification|equationCheck|expected/);
});

test('the work the workbench submits is the work it reports live, with every graded field', () => {
  const executable = executableSource(COMPONENT);
  const workMemo = region(executable, 'const work = useMemo(', 'useReportToolWork(work);', 'the work memo');
  assert.match(workMemo, /\(\) => \(\{ intervals: evidence, classification, repairRowIndex, repairedValue, m, b, equation \}\)/);
  // Staging boxes are not work until the interval is recorded.
  assert.doesNotMatch(workMemo, /staging/);
  assert.match(executable, /useReportToolWork\(work\);/);
  // The work is built before Check reads it, at render scope.
  assert.ok(executable.indexOf('const work = useMemo(') < executable.indexOf('const check = () => {'));
  // Recording an interval stores the row indexes and the three typed values the grader reads.
  assert.match(region(executable, 'const recordInterval = () => {', 'const editEvidence', 'recordInterval'), /const nextEntry = \{ i, j, dx: stagingDx, dy: stagingDy, rate: stagingRate \};/);
});

test('the workbench\'s guidance reads the grader\'s parts and interval checks by the ids the grader emits', () => {
  const ids = new Set([
    ...partIds(grade(NONLINEAR_Q, labWork())),
    ...partIds(grade(DERIVE_Q, labWork())),
    ...partIds(grade(REPAIR_Q, labWork())),
  ]);
  const guidance = region(executableSource(COMPONENT), 'const feedbackGuidance = (() => {', 'return (', 'the feedback guidance');
  for (const id of ['evidenceCount', 'nonconstantRateEvidence', 'classification', 'repairIndex', 'repairValue', 'slope', 'intercept', 'equation']) {
    assert.ok(ids.has(id), `the grader emits ${id}`);
    assert.match(guidance, new RegExp(`case '${id}':`), id);
  }
  const executable = executableSource(COMPONENT);
  assert.match(executable, /const feedbackParts = feedback\?\.metadata\?\.parts \|\| \[\];/);
  assert.match(executable, /feedback\.metadata\.evidenceCorrectness/);
  const [first] = linearTableEvidenceChecks(DERIVE_Q, { ...DERIVE_CORRECT, intervals: [interval(0, 1, 4, 8, 2)] });
  assert.deepEqual({ dx: first.dxCorrect, dy: first.dyCorrect, rate: first.rateCorrect, complete: first.complete }, { dx: true, dy: false, rate: false, complete: false });
});
