/*
 * THE ASSIGNMENT'S CALCULATOR SETTING, AND THE GRAPHING CALCULATOR IT GIVES
 * (pass 3, PR-25 / open PR #239, and PR-26 / issue #383 R3).
 *
 * An assignment saved with toolPolicy.calculator "graphing" gave its students
 * the basic keypad: nothing between App and resolveCalculatorPolicy read the
 * setting. And a prompt saying "enter f(x) into the built-in graphing
 * calculator" found no calculator that graphs on an ordinary assignment — the
 * only one was the secure practice test's.
 *
 * Order of precedence (calculatorPolicy.js): assessment rules, then the
 * question's own setting, then the assignment's, then the platform default
 * (the owner, 2026-10-20: the question wins, as #239 had it). A no-calculator
 * skill stays without one, and on an exit ticket, quiz or test the stricter of
 * the assignment's and the question's own authored mode wins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { CALCULATOR_MODES, calculatorKeyPointsShown, resolveCalculatorPolicy } from '../../src/platform/policies/calculatorPolicy.js';
import { ENTRY_KINDS, findGraphFeatures, parseGraphEntry } from '../../src/platform/assessment/graphingCalculatorModel.js';
import { isSingleLineAnswerTarget, shouldSubmitAnswerOnEnter } from '../../src/platform/interaction/answerEntryUx.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const { BASIC, SCIENTIFIC, GRAPHING, NONE, SQUARE_ROOT } = CALCULATOR_MODES;
const classwork = getEffectiveActivityPolicy('classwork');
const resolve = (overrides = {}) => resolveCalculatorPolicy({ questionSpec: {}, activityPolicy: classwork, ...overrides });

// ─── PR-25: the order of precedence ─────────────────────────────────────────

test('4. with no setting anywhere a question gets the platform default', () => {
  const policy = resolve();
  assert.deepEqual([policy.available, policy.mode, policy.source], [true, BASIC, 'platformDefault']);
});

test('3. the question\'s own setting applies when the assignment has none', () => {
  for (const noSetting of [null, undefined, '', 'inherit', 'questionSpecific', 'nonsense']) {
    const policy = resolve({ questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: noSetting });
    assert.deepEqual([policy.mode, policy.source], [SCIENTIFIC, 'questionDesign'], String(noSetting));
  }
});

test('3. the assignment\'s setting applies over the platform default: every item with no setting of its own takes it', () => {
  const overDefault = resolve({ assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([overDefault.available, overDefault.mode, overDefault.source], [true, GRAPHING, 'assignmentToolPolicy']);

  const off = resolve({ assignmentCalculatorMode: NONE });
  assert.equal(off.available, false);
  assert.equal(off.source, 'assignmentToolPolicy');
  assert.match(off.reason, /turned the calculator off for this assignment/);
});

test('2. on ordinary work the question\'s own mode wins over the assignment\'s, wider or narrower (#239\'s order)', () => {
  const overAssignment = resolve({ questionSpec: { calculatorPolicy: BASIC }, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([overAssignment.mode, overAssignment.source], [BASIC, 'questionDesign']);

  const embedded = resolve({ questionSpec: { rawSpec: { calculatorMode: GRAPHING } }, assignmentCalculatorMode: SQUARE_ROOT });
  assert.deepEqual([embedded.mode, embedded.source], [GRAPHING, 'questionDesign']);

  const notOff = resolve({ questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: NONE });
  assert.deepEqual([notOff.available, notOff.mode, notOff.source], [true, SCIENTIFIC, 'questionDesign']);

  for (const role of ['warmup', 'classwork', 'practice']) {
    const activityPolicy = getEffectiveActivityPolicy(role);
    const own = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: BASIC } }, assignmentCalculatorMode: GRAPHING });
    assert.deepEqual([own.mode, own.source], [BASIC, 'questionDesign'], role);
  }
});

test('2. a "teacher choice" question uses the teacher\'s choice; with none set the assignment\'s setting is that choice', () => {
  const questionSpec = { calculatorPolicy: CALCULATOR_MODES.TEACHER_CHOICE };
  const chosen = resolve({ questionSpec, teacherCalculatorChoice: SCIENTIFIC, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([chosen.mode, chosen.source], [SCIENTIFIC, 'teacherChoice']);
  for (const role of ['classwork', 'dol']) {
    const unset = resolve({ activityPolicy: getEffectiveActivityPolicy(role), questionSpec, assignmentCalculatorMode: GRAPHING });
    assert.deepEqual([unset.available, unset.mode, unset.source], [true, GRAPHING, 'assignmentToolPolicy'], role);
  }
  const nothingSet = resolve({ questionSpec });
  assert.deepEqual([nothingSet.available, nothingSet.source], [false, 'teacherChoice']);
});

test('2. an assignment set to "teacher choice" uses the teacher\'s choice, and with none set defers to the question', () => {
  const chosen = resolve({ assignmentCalculatorMode: CALCULATOR_MODES.TEACHER_CHOICE, teacherCalculatorChoice: GRAPHING });
  assert.deepEqual([chosen.mode, chosen.source], [GRAPHING, 'assignmentToolPolicy']);
  const unset = resolve({ questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: CALCULATOR_MODES.TEACHER_CHOICE });
  assert.deepEqual([unset.mode, unset.source], [SCIENTIFIC, 'questionDesign']);
});

test('1. assessment rules decide over the assignment\'s setting, either way', () => {
  const sat = resolve({ assessmentContext: 'sat', assignmentCalculatorMode: NONE });
  assert.deepEqual([sat.available, sat.mode, sat.source], [true, GRAPHING, 'assessmentContext']);
  const asvab = resolve({ assessmentContext: 'asvab', assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([asvab.available, asvab.source], [false, 'assessmentContext']);
  const blueprintOff = resolve({ assessmentContext: { mode: NONE }, assignmentCalculatorMode: GRAPHING });
  assert.equal(blueprintOff.available, false);
});

test('1. any assessment context skips the assignment level, also where it forces nothing', () => {
  // A context that allows a calculator only by accommodation: none without one, the plan's with one.
  const byPlanOnly = resolve({ assessmentContext: { mode: NONE, accommodationOverride: true }, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([byPlanOnly.available, byPlanOnly.mode, byPlanOnly.source], [false, NONE, 'assessmentContext']);
  const withPlan = resolve({ assessmentContext: { mode: NONE, accommodationOverride: true }, assignmentCalculatorMode: GRAPHING, studentSupportProfile: { accommodations: ['calculator-basic'] } });
  assert.deepEqual([withPlan.available, withPlan.mode, withPlan.source], [true, BASIC, 'accommodation']);
  // A context naming a mode without forcing it: the question decides, not the assignment.
  const unforced = resolve({ assessmentContext: { mode: BASIC }, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([unforced.mode, unforced.source], [BASIC, 'platformDefault']);
  const unforcedAuthored = resolve({ assessmentContext: { mode: BASIC }, questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([unforcedAuthored.mode, unforcedAuthored.source], [SCIENTIFIC, 'questionDesign']);
});

test('a skill assessed without a calculator gets none, whatever the assignment says — unless the support plan overrides computation', () => {
  for (const questionSpec of [{ calculatorPolicy: NONE }, { rawSpec: { calculatorMode: NONE } }]) {
    const blocked = resolve({ questionSpec, assignmentCalculatorMode: GRAPHING });
    assert.equal(blocked.available, false, JSON.stringify(questionSpec));
    assert.match(blocked.reason, /No calculator is allowed for this skill/);
  }
  const plan = resolve({
    questionSpec: { calculatorPolicy: NONE },
    assignmentCalculatorMode: GRAPHING,
    studentSupportProfile: { accommodations: ['calculator', 'calculator-override-computation'] },
  });
  assert.deepEqual([plan.available, plan.source], [true, 'accommodation']);
});

test('a documented calculator accommodation still applies where the assignment turned calculators off', () => {
  const policy = resolve({ assignmentCalculatorMode: NONE, studentSupportProfile: { accommodations: ['calculator-basic'] } });
  assert.deepEqual([policy.available, policy.mode, policy.source], [true, BASIC, 'accommodation']);
});

test('exit tickets, quizzes and tests keep the stricter of the assignment\'s and the question\'s own authored calculator', () => {
  for (const role of ['dol', 'quiz', 'test']) {
    const activityPolicy = getEffectiveActivityPolicy(role);
    const authoredBasic = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: BASIC } }, assignmentCalculatorMode: GRAPHING });
    assert.deepEqual([authoredBasic.mode, authoredBasic.source], [BASIC, 'questionDesign'], `${role}: the assignment never widens an authored calculator`);

    const notAuthored = resolve({ activityPolicy, assignmentCalculatorMode: GRAPHING });
    assert.deepEqual([notAuthored.mode, notAuthored.source], [GRAPHING, 'assignmentToolPolicy'], `${role}: an item with no authored mode takes the assignment's`);

    const narrowed = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: GRAPHING } }, assignmentCalculatorMode: BASIC });
    assert.deepEqual([narrowed.mode, narrowed.source], [BASIC, 'assignmentToolPolicy'], `${role}: the assignment may narrow`);

    const off = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: NONE });
    assert.equal(off.available, false, `${role}: the assignment may turn it off`);

    // Equally strong but different (Square Root and Basic): the question's own.
    const rootOverBasic = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: SQUARE_ROOT } }, assignmentCalculatorMode: BASIC });
    assert.deepEqual([rootOverBasic.mode, rootOverBasic.source], [SQUARE_ROOT, 'questionDesign'], `${role}: square root kept over basic`);
    const basicOverRoot = resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: BASIC } }, assignmentCalculatorMode: SQUARE_ROOT });
    assert.deepEqual([basicOverRoot.mode, basicOverRoot.source], [BASIC, 'questionDesign'], `${role}: basic kept over square root`);
  }
  // A role-less policy whose outcome feedback waits is treated the same way.
  const waiting = resolve({ activityPolicy: { feedback: 'teacherRelease' }, questionSpec: { calculatorPolicy: SCIENTIFIC }, assignmentCalculatorMode: GRAPHING });
  assert.equal(waiting.mode, SCIENTIFIC);
  // Classwork with the same inputs keeps the question's own, wider or narrower.
  assert.equal(resolve({ questionSpec: { rawSpec: { calculatorMode: BASIC } }, assignmentCalculatorMode: GRAPHING }).mode, BASIC);
  assert.equal(resolve({ questionSpec: { rawSpec: { calculatorMode: GRAPHING } }, assignmentCalculatorMode: BASIC }).mode, GRAPHING);
});

test('zeros, minimum and maximum are listed only where they cannot state an unreleased answer (keyPointsAllowed)', () => {
  // Ordinary work: yes, whatever set the calculator.
  assert.equal(resolve({ assignmentCalculatorMode: GRAPHING }).keyPointsAllowed, true);
  assert.equal(resolve({ activityPolicy: getEffectiveActivityPolicy('practice'), assignmentCalculatorMode: GRAPHING }).keyPointsAllowed, true);
  for (const role of ['dol', 'quiz', 'test']) {
    const activityPolicy = getEffectiveActivityPolicy(role);
    // Graphing from the assignment alone: graph, trace and table, but no listed vertex.
    const fromAssignment = resolve({ activityPolicy, assignmentCalculatorMode: GRAPHING });
    assert.deepEqual([fromAssignment.mode, fromAssignment.keyPointsAllowed], [GRAPHING, false], role);
    // The item itself authored a graphing calculator: its author chose to allow them.
    assert.equal(resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: GRAPHING } } }).keyPointsAllowed, true, `${role}: embedded`);
    assert.equal(resolve({ activityPolicy, questionSpec: { calculatorPolicy: GRAPHING } }).keyPointsAllowed, true, `${role}: calculatorPolicy`);
    assert.equal(resolve({ activityPolicy, questionSpec: { rawSpec: { calculatorMode: SCIENTIFIC } }, assignmentCalculatorMode: GRAPHING }).keyPointsAllowed, false, `${role}: authored other than graphing`);
  }
  assert.equal(resolve({ activityPolicy: { feedback: 'afterAssignmentSubmit' }, assignmentCalculatorMode: GRAPHING }).keyPointsAllowed, false, 'any waiting feedback mode');
  // Present on every result, early returns included.
  for (const policy of [
    resolve({ assessmentContext: 'sat' }),
    resolve({ assessmentContext: 'asvab' }),
    resolve({ questionSpec: { calculatorPolicy: CALCULATOR_MODES.TEACHER_CHOICE } }),
    resolve({ studentSupportProfile: { accommodations: ['calculator'] } }),
    resolve({ questionSpec: { calculatorPolicy: NONE } }),
  ]) assert.equal(typeof policy.keyPointsAllowed, 'boolean', JSON.stringify(policy));

  // Shown: where the policy allows them, or once the whole assessment is released —
  // never because one question closed and showed its own feedback (B1').
  const dol = resolve({ activityPolicy: getEffectiveActivityPolicy('dol'), assignmentCalculatorMode: GRAPHING });
  assert.equal(calculatorKeyPointsShown({ policy: dol }), false, 'open exit ticket');
  assert.equal(calculatorKeyPointsShown({ policy: dol, feedbackReleased: true, showOutcomeFeedback: true }), false, 'a closed question of an open exit ticket');
  assert.equal(calculatorKeyPointsShown({ policy: dol, assessmentReviewReleased: true }), true, 'the exit ticket released');
  assert.equal(calculatorKeyPointsShown({ policy: resolve({ assignmentCalculatorMode: GRAPHING }) }), true, 'classwork');
  assert.equal(calculatorKeyPointsShown({ policy: resolve({ activityPolicy: getEffectiveActivityPolicy('practice'), assignmentCalculatorMode: GRAPHING }) }), true, 'post-due practice runs as practice');
  assert.equal(calculatorKeyPointsShown({}), false, 'no policy: none');

  // QuestionEngine asks exactly that, with the assessment's release.
  const engine = source('src/QuestionEngine.jsx');
  const mount = region(engine, '<AssignmentGraphingCalculator\n', '/>', 'host element');
  assert.match(mount, /keyPoints=\{calculatorKeyPointsShown\(\{ policy: calculatorPolicy, assessmentReviewReleased \}\)\}/);
  assert.doesNotMatch(executableSource(mount), /showOutcomeFeedback|feedbackReleased/, 'one question\'s release is not the assessment\'s');
  assert.match(engine, /import \{ CALCULATOR_MODES, calculatorKeyPointsShown, resolveCalculatorPolicy \} from '\.\/platform\/policies\/calculatorPolicy';/);
  const host = source('src/components/calculator/AssignmentGraphingCalculator.jsx');
  assert.match(region(host, '<GraphingCalculatorPanel', '/>', 'panel element'), /keyPoints=\{keyPoints\}/);
  assert.match(host, /roomRef = null, keyPoints = false \}\)/, 'off unless the engine says so');
});

test('the student assignment screen forwards the assignment\'s calculator setting, and QuestionEngine resolves with it', () => {
  const app = source('src/App.jsx');
  // The element is the branch App renders once the family engine is loaded
  // (familyEngineLoading), hence the `}` after it.
  const engineElement = region(app, '<QuestionEngine\n              key={`${activeAssignmentId}-', '/>}\n            {/* SAVE HEALTH', 'App student QuestionEngine element');
  assert.match(engineElement, /assignmentCalculatorMode=\{assignment\?\.toolPolicy\?\.calculator \|\| null\}/);

  const engine = source('src/QuestionEngine.jsx');
  assert.match(engine, /^\s*assignmentCalculatorMode = null,$/m, 'QuestionEngine takes the prop');
  const policyMemo = region(engine, 'const calculatorPolicy = useMemo(() => resolveCalculatorPolicy({', ']);', 'calculator policy memo');
  assert.match(policyMemo, /\n\s*assignmentCalculatorMode,\n/);
  assert.match(policyMemo, /\}\), \[[^\]]*\bassignmentCalculatorMode\b[^\]]*$/, 'and re-resolves when it changes');
});

// ─── PR-26: the graphing calculator on ordinary assignments ────────────────

test('a graphing policy outside an assessment context opens the graphing calculator from the Calculator control — one calculator, not two', () => {
  const engine = source('src/QuestionEngine.jsx');
  const offer = region(engine, 'const graphingCalculatorOffered =', ';\n', 'graphing offer');
  assert.match(offer, /calculatorPolicy\?\.available/);
  assert.match(offer, /calculatorPolicy\.mode === CALCULATOR_MODES\.GRAPHING/);
  assert.match(offer, /!assessmentContext/, 'a secure test brings its own graphing calculator');
  assert.match(engine, /import \{ CALCULATOR_MODES, [^}]*resolveCalculatorPolicy \} from '\.\/platform\/policies\/calculatorPolicy';/);

  const mount = region(engine, 'const keypadCalculator = (', '})()}', 'calculator mount');
  assert.match(mount, /return graphingCalculatorOffered \? \(/);
  const host = region(mount, '<AssignmentGraphingCalculator\n', '/>', 'host element');
  for (const prop of ['open={calculatorOpen}', 'onOpenChange={setCalculatorOpen}', 'roomRef={questionEngineRef}', 'fallback={keypadCalculator}', 'onUnavailable={markGraphingCalculatorFailed}']) {
    assert.ok(host.includes(prop), prop);
  }
  assert.match(mount, /\) : keypadCalculator;/, 'otherwise the keypad drawer, as before');
  assert.equal((engine.match(/<CalculatorPanel\b/g) || []).length, 1, 'the keypad drawer is mounted once');
});

test('opening the graphing calculator records calculatorUsed exactly as the keypad drawer does', () => {
  const engine = source('src/QuestionEngine.jsx');
  const control = region(engine, 'const handleCalculatorControl = () => {', '\n  };', 'calculator control');
  assert.match(control, /markCalculatorOpened\(\);\n\s*setCalculatorOpen\(true\);/);
  const mark = region(engine, 'const markCalculatorOpened = () => {', '\n  };', 'mark opened');
  assert.match(mark, /setCalculatorUsed\(true\)/);
  assert.match(mark, /reportSupportEvidence\('calculator', 'used'\)/);
  // The graphing panel opens only through that control: it has no launcher of its own here.
  const host = source('src/components/calculator/AssignmentGraphingCalculator.jsx');
  assert.match(host, /showLauncher=\{false\}/);
  assert.match(host, /open=\{open\}/);
});

test('the graphing calculator is loaded lazily, and a failed load falls back to the keypad drawer', () => {
  const engine = executableSource(source('src/QuestionEngine.jsx'));
  assert.doesNotMatch(engine, /^import [^;]*(GraphingCalculatorPanel|AssignmentGraphingCalculator)[^;]*;/m, 'no static import');
  const lazyLoad = region(engine, 'const AssignmentGraphingCalculator = lazy(', ';\n', 'lazy graphing calculator');
  assert.match(lazyLoad, /import\('\.\/components\/calculator\/AssignmentGraphingCalculator\.jsx'\)/);
  assert.match(lazyLoad, /\.catch\(\(\) => \(\{ default: GraphingCalculatorUnavailable \}\)\)/);
  const unavailable = region(engine, 'const GraphingCalculatorUnavailable = (', '};', 'stand-in');
  assert.match(unavailable, /useEffect\(\(\) => \{ onUnavailable\?\.\(\); \}, \[onUnavailable\]\);/);
  assert.match(unavailable, /return fallback;/);
  assert.match(engine, /<Suspense fallback=\{null\}>\s*<AssignmentGraphingCalculator\n/);
  // The control is then named for the keypad that stood in.
  assert.match(engine, /const calculatorShowsGraphing = graphingCalculatorOffered && !graphingCalculatorFailed;/);
  assert.match(engine, /const calculatorName = calculatorShowsGraphing \? 'Graphing calculator' : 'Calculator';/);
  assert.match(engine, /const markGraphingCalculatorFailed = useCallback\(\(\) => setGraphingCalculatorFailed\(true\), \[\]\);/);
});

test('the graphing calculator is given nothing about the question', () => {
  const host = source('src/components/calculator/AssignmentGraphingCalculator.jsx');
  assert.match(host, /export default function AssignmentGraphingCalculator\(\{ open = false, onOpenChange = null, roomRef = null, keyPoints = false \}\)/);
  const panelElement = region(host, '<GraphingCalculatorPanel', '/>', 'panel element');
  assert.deepEqual(
    [...panelElement.matchAll(/^\s+([a-zA-Z]+)(?:=|$)/gm)].map((match) => match[1]).sort(),
    ['keyPoints', 'onOpenChange', 'open', 'showLauncher'],
  );
  const engine = source('src/QuestionEngine.jsx');
  const mount = region(engine, '<AssignmentGraphingCalculator\n', '/>', 'host element');
  assert.deepEqual([...mount.matchAll(/\s([a-zA-Z]+)=\{/g)].map((match) => match[1]), ['open', 'onOpenChange', 'roomRef', 'keyPoints', 'fallback', 'onUnavailable']);
  assert.match(mount, /keyPoints=\{calculatorKeyPointsShown\(\{ policy: calculatorPolicy, assessmentReviewReleased \}\)\}/, 'a policy flag and the release, not question data');
  assert.match(mount, /roomRef=\{questionEngineRef\}/, 'the element to pad, not its content');
});

test('the secure test\'s graphing calculator is used exactly as before: its own launcher, its own state, no key points', () => {
  const container = source('src/components/assessment/SecureExamContainer.jsx');
  const element = region(container, '<GraphingCalculatorPanel', '/>', 'secure exam panel');
  assert.doesNotMatch(element, /\b(open|showLauncher|keyPoints)\b/);
  const panel = source('src/components/assessment/GraphingCalculatorPanel.jsx');
  const props = region(panel, 'export default function GraphingCalculatorPanel({', '}) {', 'panel props');
  assert.match(props, /open: openProp = undefined,/);
  assert.match(props, /showLauncher = true,/);
  assert.match(props, /keyPoints = false,/);
  assert.match(panel, /\{showLauncher && <button\n\s+ref=\{launcherRef\}/);
  assert.match(panel, /const features = keyPoints && featureEntry \? findGraphFeatures\(/);
  assert.match(panel, /\{keyPoints && \(\n\s+<div data-graphing-key-points="">/);
  // A floating tool over Work View only when a question's control opens it.
  assert.match(panel, /data-work-view-floating-tool=\{showLauncher \? undefined : 'graphing-calculator'\}/);
});

test('Enter in a graphing calculator line belongs to the calculator, not to the question around it', () => {
  const inside = { tagName: 'INPUT', type: 'text', closest: (selector) => (selector.includes('[data-graphing-calculator]') ? {} : null), getAttribute: () => null };
  const answerBox = { tagName: 'INPUT', type: 'text', closest: () => null, getAttribute: () => null };
  assert.equal(isSingleLineAnswerTarget(inside), false);
  assert.equal(isSingleLineAnswerTarget(answerBox), true);
  assert.equal(shouldSubmitAnswerOnEnter({ event: { key: 'Enter', target: inside }, responseComplete: true, canSubmit: true }), false);
  // QuestionEngine's Enter contract asks resolveQuestionEnterIntent, which asks
  // isSingleLineAnswerTarget — the guard above (browser-proven:
  // tests/browser/assignmentGraphingCalculator.mjs, "Enter in a line").
});

// ─── The mathematics: zeros, minimum, maximum ──────────────────────────────

const features = (text, xMin = -10, xMax = 10) => findGraphFeatures(parseGraphEntry(text), { xMin, xMax });

test('zeros, minimum and maximum of the lines a prompt asks about', () => {
  assert.deepEqual(features('f(x) = x^2 - 4'), { zeros: [-2, 2], minima: [{ x: 0, y: -4 }], maxima: [], more: { zeros: false, minima: false, maxima: false } });
  const vertex = features('y = -2(x - 3)^2 + 8');
  assert.deepEqual(vertex.zeros, [1, 5]);
  assert.deepEqual(vertex.maxima, [{ x: 3, y: 8 }]);
  assert.deepEqual(vertex.minima, []);
  const cubic = features('y = x^3 - 3x');
  assert.deepEqual(cubic.minima, [{ x: 1, y: -2 }]);
  assert.deepEqual(cubic.maxima, [{ x: -1, y: 2 }]);
  assert.deepEqual(cubic.zeros.map((x) => Number(x.toFixed(6))), [-1.732051, 0, 1.732051]);
  assert.deepEqual(features('y = x^2 - 2').zeros.map((x) => Number(x.toFixed(6))), [-1.414214, 1.414214]);
});

test('a line that touches y = 0 has that zero; a break is not a zero and not a turning point', () => {
  // Between sample points (the view is sampled every 1/24 from −10), so a
  // touching zero is found as the turning point it is, not by luck.
  assert.deepEqual(features('y = (x - 1.03)^2').zeros, [1.03]);
  assert.deepEqual(features('y = abs(x - 0.3)').zeros, [0.3]);
  assert.deepEqual(features('y = 3 - (x - 1/48)^2').maxima.map(({ x, y }) => [Number(x.toFixed(6)), y]), [[0.020833, 3]], 'a peak exactly between two samples');
  for (const text of ['y = 1/x', 'y = 1/x^2', 'y = 1/(x - 0.01)', 'y = x/abs(x)', 'y = floor(x - 0.3) + 0.5', 'y = floor(x)']) {
    const found = features(text);
    assert.deepEqual([found.zeros, found.minima, found.maxima], [[], [], []], text);
  }
  const tangent = features('y = tan(x)', -2, 2);
  assert.deepEqual(tangent.zeros, [0], 'tan x crosses at 0, and jumps (not crosses) at ±π/2');
  assert.deepEqual(features('y = 5'), { zeros: [], minima: [], maxima: [], more: { zeros: false, minima: false, maxima: false } });
});

test('a zoomed or stretched view states the turning point exactly', () => {
  // One "Zoom in" (the view x −5 to 5) once read the minimum as (1 × 10^−8, −4).
  assert.deepEqual(features('y = x^2 - 4', -5, 5).minima, [{ x: 0, y: -4 }]);
  assert.deepEqual(features('y = x^2 - 4', -0.001, 0.0012).minima, [{ x: 0, y: -4 }]);
  assert.deepEqual(features('y = x^2/10^6 - 1', -3000, 3000), { zeros: [-1000, 1000], minima: [{ x: 0, y: -1 }], maxima: [], more: { zeros: false, minima: false, maxima: false } });
  assert.deepEqual(features('y = -2(x - 3)^2 + 8', 2.5, 3.7).maxima, [{ x: 3, y: 8 }]);
  assert.deepEqual(features('y = (x - 1/3)^2').minima.map(({ x, y }) => [Number(x.toFixed(6)), y]), [[0.333333, 0]]);
});

test('an integer vertex reads as that integer in every view (x² − 6x + 5 is (3, −4), not (3.00000003, −4))', () => {
  for (const [xMin, xMax] of [[-10, 10], [-5, 15], [2, 4], [-2.5, 7.5]]) {
    assert.deepEqual(features('y = x^2 - 6x + 5', xMin, xMax).minima, [{ x: 3, y: -4 }], `x² − 6x + 5 on [${xMin}, ${xMax}]`);
    assert.deepEqual(features('y = -x^2 + 6x - 5', xMin, xMax).maxima, [{ x: 3, y: 4 }], `−x² + 6x − 5 on [${xMin}, ${xMax}]`);
  }
  // The sweep: expanded parabolas a·x² + b·x + c with integer vertex (h, k), in six views.
  const term = (n, v) => (n === 0 ? '' : ` ${n < 0 ? '-' : '+'} ${Math.abs(n)}${v}`);
  const wrong = [];
  let checked = 0;
  for (const a of [1, -1, 2, -2, 3, -3, 0.5, -0.5]) {
    for (let h = -6; h <= 6; h += 1) {
      for (let k = -6; k <= 6; k += 1) {
        const text = `y = ${a}x^2${term(-2 * a * h, 'x')}${term(a * h * h + k, '')}`;
        for (const [xMin, xMax] of [[-10, 10], [-5, 5], [-2.5, 2.5], [-5, 15], [-20, 20], [-15, 5]]) {
          if (h <= xMin || h >= xMax) continue;
          checked += 1;
          const found = features(text, xMin, xMax);
          const turn = a > 0 ? found.minima : found.maxima;
          if (turn.length !== 1 || turn[0].x !== h || turn[0].y !== k) wrong.push(`${text} on [${xMin}, ${xMax}]: ${JSON.stringify(turn)}`);
        }
      }
    }
  }
  assert.ok(checked > 6000, `${checked} checked`);
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} of ${checked} vertices misread`);
});

test('a turning value is reported as it is, and a near miss of y = 0 is not a zero', () => {
  for (const [text, low] of [['y = 10000x^2 + 0.01', 0.01], ['y = 5x^2 + 0.000001', 0.000001]]) {
    for (const [xMin, xMax] of [[-10, 10], [-0.01, 0.01]]) {
      const found = features(text, xMin, xMax);
      assert.deepEqual([found.zeros, found.minima], [[], [{ x: 0, y: low }]], `${text} on [${xMin}, ${xMax}]`);
    }
  }
});

test('where the line\'s domain starts or ends on screen, that edge is a zero if the line is 0 there', () => {
  assert.deepEqual(features('y = sqrt(x - 0.3)').zeros, [0.3]);
  assert.deepEqual(features('y = sqrt(x - 0.3) + 1').zeros, []);
  assert.deepEqual(features('y = sqrt(4 - x^2)'), { zeros: [-2, 2], minima: [], maxima: [{ x: 0, y: 2 }], more: { zeros: false, minima: false, maxima: false } });
});

test('only the view is searched, and long lists are capped', () => {
  assert.deepEqual(features('y = x^2 - 4', 0, 10).zeros, [2]);
  assert.deepEqual(features('y = x^2 - 4', 0, 10).minima, [], 'the vertex at the edge of the view is not a turning point inside it');
  const wide = features('y = sin(x)', -100, 100);
  assert.equal(wide.zeros.length, 8);
  assert.equal(wide.more.zeros, true);
  assert.equal(findGraphFeatures(parseGraphEntry('3 + 4'), { xMin: -1, xMax: 1 }), null, 'a value is not a graph');
  assert.equal(findGraphFeatures({ kind: ENTRY_KINDS.FUNCTION, evaluate: () => 0 }, { xMin: 2, xMax: 1 }), null, 'an empty view');
});
