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
 * assignment's setting, then the question's, then the platform default. A
 * no-calculator skill stays without one, and on an exit ticket, quiz or test
 * the stricter of the assignment's and the question's own authored mode wins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { CALCULATOR_MODES, resolveCalculatorPolicy } from '../../src/platform/policies/calculatorPolicy.js';
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

test('2. the assignment\'s setting applies over the default and over the question\'s own mode', () => {
  const overDefault = resolve({ assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([overDefault.available, overDefault.mode, overDefault.source], [true, GRAPHING, 'assignmentToolPolicy']);

  const overQuestion = resolve({ questionSpec: { calculatorPolicy: BASIC }, assignmentCalculatorMode: GRAPHING });
  assert.deepEqual([overQuestion.mode, overQuestion.source], [GRAPHING, 'assignmentToolPolicy']);

  const narrower = resolve({ questionSpec: { rawSpec: { calculatorMode: GRAPHING } }, assignmentCalculatorMode: SQUARE_ROOT });
  assert.deepEqual([narrower.mode, narrower.source], [SQUARE_ROOT, 'assignmentToolPolicy']);

  const off = resolve({ assignmentCalculatorMode: NONE });
  assert.equal(off.available, false);
  assert.equal(off.source, 'assignmentToolPolicy');
  assert.match(off.reason, /turned the calculator off for this assignment/);
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
  }
  // A role-less policy whose outcome feedback waits is treated the same way.
  const waiting = resolve({ activityPolicy: { feedback: 'teacherRelease' }, questionSpec: { calculatorPolicy: SCIENTIFIC }, assignmentCalculatorMode: GRAPHING });
  assert.equal(waiting.mode, SCIENTIFIC);
  // Classwork with the same inputs follows the assignment.
  assert.equal(resolve({ questionSpec: { rawSpec: { calculatorMode: BASIC } }, assignmentCalculatorMode: GRAPHING }).mode, GRAPHING);
});

test('the student assignment screen forwards the assignment\'s calculator setting, and QuestionEngine resolves with it', () => {
  const app = source('src/App.jsx');
  const engineElement = region(app, '<QuestionEngine\n              key={`${activeAssignmentId}-', '/>\n            {/* SAVE HEALTH', 'App student QuestionEngine element');
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
  assert.match(engine, /import \{ CALCULATOR_MODES, resolveCalculatorPolicy \} from '\.\/platform\/policies\/calculatorPolicy';/);

  const mount = region(engine, 'const keypadCalculator = (', '})()}', 'calculator mount');
  assert.match(mount, /return graphingCalculatorOffered \? \(/);
  assert.match(mount, /<AssignmentGraphingCalculator open=\{calculatorOpen\} onOpenChange=\{setCalculatorOpen\} roomRef=\{questionEngineRef\} fallback=\{keypadCalculator\} \/>/);
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
  assert.match(lazyLoad, /\.catch\(\(\) => \(\{ default: \(\{ fallback = null \}\) => fallback \}\)\)/);
  assert.match(engine, /<Suspense fallback=\{null\}>\s*<AssignmentGraphingCalculator /);
});

test('the graphing calculator is given nothing about the question', () => {
  const host = source('src/components/calculator/AssignmentGraphingCalculator.jsx');
  assert.match(host, /export default function AssignmentGraphingCalculator\(\{ open = false, onOpenChange = null, roomRef = null \}\)/);
  const panelElement = region(host, '<GraphingCalculatorPanel', '/>', 'panel element');
  assert.deepEqual(
    [...panelElement.matchAll(/^\s+([a-zA-Z]+)(?:=|$)/gm)].map((match) => match[1]).sort(),
    ['keyPoints', 'onOpenChange', 'open', 'showLauncher'],
  );
  const engine = source('src/QuestionEngine.jsx');
  const mount = region(engine, '<AssignmentGraphingCalculator ', '/>', 'host element');
  assert.deepEqual([...mount.matchAll(/\s([a-zA-Z]+)=\{/g)].map((match) => match[1]), ['open', 'onOpenChange', 'roomRef', 'fallback']);
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

test('only the view is searched, and long lists are capped', () => {
  assert.deepEqual(features('y = x^2 - 4', 0, 10).zeros, [2]);
  assert.deepEqual(features('y = x^2 - 4', 0, 10).minima, [], 'the vertex at the edge of the view is not a turning point inside it');
  const wide = features('y = sin(x)', -100, 100);
  assert.equal(wide.zeros.length, 8);
  assert.equal(wide.more.zeros, true);
  assert.equal(findGraphFeatures(parseGraphEntry('3 + 4'), { xMin: -1, xMax: 1 }), null, 'a value is not a graph');
  assert.equal(findGraphFeatures({ kind: ENTRY_KINDS.FUNCTION, evaluate: () => 0 }, { xMin: 2, xMax: 1 }), null, 'an empty view');
});
