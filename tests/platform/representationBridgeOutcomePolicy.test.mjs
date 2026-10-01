/*
 * ON A DOL, QUIZ OR TEST, THE REPRESENTATION BRIDGE NEVER ANSWERS "RIGHT OR WRONG"
 * BEFORE SUBMIT.
 *
 * The classic bridge defaults to `checkpoint` timing: every "Check this stage"
 * was a verdict ("Graph correct" / "Needs another look"), each stage stayed
 * locked until the one before it passed, and Submit stayed disabled until every
 * stage passed. On an exit ticket — one attempt, outcomes withheld until
 * submission — that is an answer key the student can query for free: edit,
 * check, edit again until it says correct, then spend the attempt. The PR #397
 * board already gated its checks on `showImmediateFeedback`; this bridge read
 * only the authored timing.
 *
 * The policy now lives in one pure function, resolveRepresentationBridgeStageGate,
 * so it is tested here as behaviour. The component is held to it by the
 * source contracts at the bottom (node cannot render .jsx), and the real screen
 * by tests/browser/toolPolicyGates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REPRESENTATION_BRIDGE_STAGES,
  representationBridgeStageCompletion,
  resolveRepresentationBridgeStageGate,
  resolveRequiredComparisons,
  scoreRepresentationBridge,
} from '../../src/tools/representationBridge/representationBridgeMath.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const question = {
  type: 'representationBridge',
  mode: 'linear',
  source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
  context: {
    inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
    rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
    yInterceptMeaning: 'starting profit after paying the booth fee',
    zeroMeaning: 'number of items that must be sold to break even',
  },
  requiredComparisons: 3,
  graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
};

const rightResponse = () => ({
  tableEvidence: [
    { i: 0, j: 1, dx: '2', dy: '10', rate: '5' },
    { i: 1, j: 2, dx: '2', dy: '10', rate: '5' },
    { i: 2, j: 3, dx: '2', dy: '10', rate: '5' },
  ],
  studentSlope: '5',
  rateConclusion: 'constant',
  generalForm: { m: '5', b: '-20', equation: 'y = 5x - 20' },
  factoredForm: { a: '5', c: '4', equation: 'y = 5(x - 4)' },
  graphConstruction: { points: [[4, 0], [5, 5]] },
  meaningAssignments: {
    rate: { unit: 'dollars per item', contextMeaning: 'profit earned for each item sold', mathRole: 'rate of change / slope' },
    yIntercept: { unit: 'dollars', contextMeaning: 'starting profit after paying the booth fee', mathRole: 'y-intercept / constant term' },
    zero: { unit: 'items', contextMeaning: 'number of items that must be sold to break even', mathRole: 'zero / x-intercept' },
  },
});

// Every stage FINISHED, every stage WRONG.
const wrongResponse = () => ({
  tableEvidence: [
    { i: 0, j: 1, dx: '2', dy: '9', rate: '4' },
    { i: 1, j: 2, dx: '2', dy: '9', rate: '4' },
    { i: 2, j: 3, dx: '2', dy: '9', rate: '4' },
  ],
  studentSlope: '4',
  rateConclusion: 'not constant',
  generalForm: { m: '4', b: '-19', equation: 'y = 4x - 19' },
  factoredForm: { a: '4', c: '3', equation: 'y = 4(x - 3)' },
  graphConstruction: { points: [[3, 0], [4, 4]] },
  meaningAssignments: {
    rate: { unit: 'items', contextMeaning: 'number of items that must be sold to break even', mathRole: 'zero / x-intercept' },
    yIntercept: { unit: 'dollars per item', contextMeaning: 'profit earned for each item sold', mathRole: 'rate of change / slope' },
    zero: { unit: 'dollars', contextMeaning: 'starting profit after paying the booth fee', mathRole: 'y-intercept / constant term' },
  },
});

// What the component hands the gate on one render.
const gateFor = (response, { showImmediateFeedback, feedbackTiming = 'checkpoint', stageChecks = {}, submissionFeedbackShown = false } = {}) => (
  resolveRepresentationBridgeStageGate({
    feedbackTiming,
    showImmediateFeedback,
    requiredStages: REPRESENTATION_BRIDGE_STAGES,
    stageChecks,
    parts: scoreRepresentationBridge(question, response).parts,
    completion: representationBridgeStageCompletion(question, response),
    submissionFeedbackShown,
  })
);

// A student pressing "Check this stage" on every stage, in order: what each
// press records is what the gate says a press records.
const pressEveryCheck = (response, options) => {
  let stageChecks = {};
  REPRESENTATION_BRIDGE_STAGES.forEach((stage) => {
    const recorded = gateFor(response, { ...options, stageChecks }).recordCheck(stage);
    stageChecks = { ...stageChecks, [stage]: recorded };
  });
  return stageChecks;
};

// Everything the screen shows that could depend on correctness.
const observable = (response, options) => {
  const stageChecks = pressEveryCheck(response, options);
  const gate = gateFor(response, { ...options, stageChecks });
  return {
    reports: REPRESENTATION_BRIDGE_STAGES.map((stage) => gate.checkReport(stage)),
    blocked: REPRESENTATION_BRIDGE_STAGES.map((stage) => gate.stageBlocked(stage)),
    revealed: REPRESENTATION_BRIDGE_STAGES.map((stage) => gate.revealAllowed(stage)),
    readyToSubmit: gate.readyToSubmit,
  };
};

// ---------------------------------------------------------------- fixtures sanity
test('the fixtures are what they claim: one right everywhere, one wrong everywhere, both finished', () => {
  const right = scoreRepresentationBridge(question, rightResponse()).parts;
  const wrong = scoreRepresentationBridge(question, wrongResponse()).parts;
  REPRESENTATION_BRIDGE_STAGES.forEach((stage) => {
    assert.equal(right[stage], true, `${stage} is right in rightResponse`);
    assert.equal(wrong[stage], false, `${stage} is wrong in wrongResponse`);
  });
  assert.deepEqual(Object.values(representationBridgeStageCompletion(question, rightResponse())), [true, true, true, true, true]);
  assert.deepEqual(Object.values(representationBridgeStageCompletion(question, wrongResponse())), [true, true, true, true, true]);
});

// ---------------------------------------------------------------- withheld outcomes
test('where outcomes are withheld, nothing a stage check shows depends on whether the work is right', () => {
  for (const feedbackTiming of ['checkpoint', 'guided', 'submitOnly']) {
    const options = { showImmediateFeedback: false, feedbackTiming };
    assert.deepEqual(
      observable(wrongResponse(), options),
      observable(rightResponse(), options),
      `${feedbackTiming}: finished-but-wrong work must look exactly like finished-and-right work`,
    );
  }
});

test('where outcomes are withheld, a stage check reports only that the stage is finished', () => {
  const stageChecks = pressEveryCheck(wrongResponse(), { showImmediateFeedback: false });
  const gate = gateFor(wrongResponse(), { showImmediateFeedback: false, stageChecks });
  REPRESENTATION_BRIDGE_STAGES.forEach((stage) => {
    assert.equal(stageChecks[stage], true, `${stage}: a press on finished work records "finished", not the verdict`);
    assert.deepEqual(gate.checkReport(stage), { kind: 'completion', complete: true }, `${stage} names no verdict`);
  });
  assert.equal(gate.verdictsShown, false);

  // An unfinished stage says so — and still nothing about correctness.
  const partial = { ...wrongResponse(), factoredForm: { a: '4', c: '', equation: '' } };
  const partialChecks = pressEveryCheck(partial, { showImmediateFeedback: false });
  assert.deepEqual(
    gateFor(partial, { showImmediateFeedback: false, stageChecks: partialChecks }).checkReport('factoredForm'),
    { kind: 'completion', complete: false },
  );
});

test('where outcomes are withheld, no stage is locked behind another being right', () => {
  const gate = gateFor(wrongResponse(), { showImmediateFeedback: false, stageChecks: {} });
  REPRESENTATION_BRIDGE_STAGES.forEach((stage) => {
    assert.equal(gate.stageBlocked(stage), false, `${stage} opens without any earlier stage passing`);
  });
});

test('where outcomes are withheld, Submit waits for every required stage to be finished, and only that', () => {
  assert.equal(gateFor(wrongResponse(), { showImmediateFeedback: false }).readyToSubmit, true, 'finished-but-wrong work can be submitted');
  assert.equal(gateFor(rightResponse(), { showImmediateFeedback: false }).readyToSubmit, true);
  const unfinishedGraph = { ...wrongResponse(), graphConstruction: { points: [[3, 0]] } };
  assert.equal(gateFor(unfinishedGraph, { showImmediateFeedback: false }).readyToSubmit, false, 'an unfinished stage still holds Submit');
  // No press of "Check this stage" is needed: readiness is the work, not the button.
  assert.equal(gateFor(wrongResponse(), { showImmediateFeedback: false, stageChecks: {} }).readyToSubmit, true);
});

test('where outcomes are withheld, the highlights never reveal a value (revealing it only once it is right is a verdict)', () => {
  const stageChecks = Object.fromEntries(REPRESENTATION_BRIDGE_STAGES.map((stage) => [stage, true]));
  for (const feedbackTiming of ['guided', 'checkpoint', 'submitOnly']) {
    const gate = gateFor(rightResponse(), { showImmediateFeedback: false, feedbackTiming, stageChecks, submissionFeedbackShown: true });
    REPRESENTATION_BRIDGE_STAGES.forEach((stage) => assert.equal(gate.revealAllowed(stage), false, `${feedbackTiming}/${stage}`));
  }
});

// ---------------------------------------------------------------- shown outcomes: unchanged practice
test('where outcomes are shown, checkpoint checks are verdicts that lock later stages until they pass', () => {
  const options = { showImmediateFeedback: true };
  // Nothing checked: everything after the first required stage is locked.
  const fresh = gateFor(rightResponse(), { ...options, stageChecks: {} });
  assert.equal(fresh.stageBlocked('rateEvidence'), false);
  assert.equal(fresh.stageBlocked('generalForm'), true);
  assert.equal(fresh.stageBlocked('meaning'), true);
  assert.equal(fresh.readyToSubmit, false);

  // A press records the verdict, and the report names it.
  assert.equal(gateFor(wrongResponse(), options).recordCheck('generalForm'), false);
  assert.equal(gateFor(rightResponse(), options).recordCheck('generalForm'), true);
  const wrongChecked = gateFor(wrongResponse(), { ...options, stageChecks: { rateEvidence: false } });
  assert.deepEqual(wrongChecked.checkReport('rateEvidence'), { kind: 'verdict', passed: false });
  assert.equal(wrongChecked.stageBlocked('generalForm'), true, 'a failed check keeps the next stage locked');

  // Every stage checked and right: everything open, Submit ready.
  const allChecked = pressEveryCheck(rightResponse(), options);
  const passed = gateFor(rightResponse(), { ...options, stageChecks: allChecked });
  REPRESENTATION_BRIDGE_STAGES.forEach((stage) => {
    assert.equal(passed.stageBlocked(stage), false);
    assert.deepEqual(passed.checkReport(stage), { kind: 'verdict', passed: true });
  });
  assert.equal(passed.readyToSubmit, true);
  assert.equal(passed.verdictsShown, true);
});

test('where outcomes are shown, a stale green check re-locks once earlier work is edited', () => {
  const options = { showImmediateFeedback: true };
  const allChecked = pressEveryCheck(rightResponse(), options);
  const edited = { ...rightResponse(), generalForm: { m: '5', b: '-19', equation: 'y = 5x - 19' } };
  const gate = gateFor(edited, { ...options, stageChecks: allChecked });
  assert.equal(gate.stageBlocked('factoredForm'), true);
  assert.equal(gate.readyToSubmit, false);
  assert.deepEqual(gate.checkReport('generalForm'), { kind: 'verdict', passed: false });
});

test('where outcomes are shown, guided and submitOnly timings keep their highlight and Submit rules', () => {
  const options = { showImmediateFeedback: true };
  const guided = gateFor(wrongResponse(), { ...options, feedbackTiming: 'guided' });
  assert.equal(guided.revealAllowed('generalForm'), true);
  assert.equal(guided.stageBlocked('meaning'), false);
  assert.equal(guided.readyToSubmit, true);

  const submitOnly = gateFor(rightResponse(), { ...options, feedbackTiming: 'submitOnly' });
  assert.equal(submitOnly.revealAllowed('generalForm'), false, 'submitOnly reveals nothing before feedback exists');
  assert.equal(gateFor(rightResponse(), { ...options, feedbackTiming: 'submitOnly', submissionFeedbackShown: true }).revealAllowed('generalForm'), true);

  const checkpoint = gateFor(rightResponse(), { ...options, stageChecks: { generalForm: true } });
  assert.equal(checkpoint.revealAllowed('generalForm'), true, 'checkpoint reveals a stage once it is checked');
  assert.equal(checkpoint.revealAllowed('factoredForm'), false);
});

test('the default is outcomes shown: a host that never set the flag keeps the practice behaviour', () => {
  const gate = resolveRepresentationBridgeStageGate({
    stageChecks: {},
    parts: scoreRepresentationBridge(question, rightResponse()).parts,
    completion: representationBridgeStageCompletion(question, rightResponse()),
  });
  assert.equal(gate.verdictsShown, true);
  assert.equal(gate.stageBlocked('generalForm'), true);
});

// ---------------------------------------------------------------- completion
test('a stage is finished when every entry it is graded on has been made — right or wrong', () => {
  const complete = (response) => representationBridgeStageCompletion(question, response);
  const base = wrongResponse();
  assert.equal(complete({ ...base, tableEvidence: base.tableEvidence.slice(0, 2) }).rateEvidence, false, 'fewer intervals than required');
  assert.equal(complete({ ...base, tableEvidence: [...base.tableEvidence.slice(0, 2), { i: 2, j: 3, dx: '2', dy: '', rate: '4' }] }).rateEvidence, false, 'an interval without its Δy');
  assert.equal(complete({ ...base, rateConclusion: '' }).rateEvidence, false, 'no conclusion');
  assert.equal(complete({ ...base, studentSlope: ' ' }).rateEvidence, false, 'no slope');
  assert.equal(complete({ ...base, generalForm: { m: '4', b: '-19', equation: '' } }).generalForm, false);
  assert.equal(complete({ ...base, factoredForm: { a: '', c: '3', equation: 'y = 4(x - 3)' } }).factoredForm, false);
  assert.equal(complete({ ...base, graphConstruction: { points: [[3, 0]] } }).graph, false);
  assert.equal(complete({ ...base, meaningAssignments: { ...base.meaningAssignments, zero: { unit: 'dollars', contextMeaning: '', mathRole: 'y-intercept / constant term' } } }).meaning, false);
  assert.equal(complete(base).rateEvidence, true);
  assert.equal(resolveRequiredComparisons(question, 4), 3);
  assert.equal(resolveRequiredComparisons({ requiredComparisons: 9 }, 3), 3, 'never more than the table has pairs');
});

// ---------------------------------------------------------------- the component is held to the gate
const bridgeSource = readFileSync(new URL('../../src/tools/representationBridge/RepresentationBridge.jsx', import.meta.url), 'utf8');
const bridge = executableSource(bridgeSource);
const classic = region(bridge, 'function ClassicRepresentationBridge', null, 'the classic bridge');

test('the bridge reads whether outcomes are shown from the runtime context and hands it to the gate', () => {
  assert.match(bridge, /import \{ useToolRuntimeContext \} from '\.\.\/shared\/ToolRuntimeContext';/);
  assert.match(classic, /\n\s*const \{ showImmediateFeedback \} = useToolRuntimeContext\(\);/);
  const gate = region(classic, 'const stageGate = resolveRepresentationBridgeStageGate({', '});', 'the stage gate');
  assert.match(gate, /\n\s*showImmediateFeedback,/);
  assert.match(gate, /\n\s*parts: liveResult\.parts,/);
  assert.match(gate, /\n\s*completion: stageCompletion,/);
  assert.match(gate, /\n\s*stageChecks,/);
  assert.match(classic, /const stageCompletion = useMemo\(\(\) => representationBridgeStageCompletion\(questionData, response\)/);
});

test('every stage lock, the Submit gate, the highlights and each check press come from the gate', () => {
  assert.match(classic, /\n\s*const stageRevealAllowed = stageGate\.revealAllowed;/);
  assert.match(classic, /\n\s*const stageBlocked = \(stage\) => stageGate\.stageBlocked\(stage\);/);
  assert.match(classic, /\n\s*const readyToSubmit = stageGate\.readyToSubmit;/);
  const checkStage = region(classic, 'const checkStage', 'const stageBlocked', 'the stage check handler');
  assert.match(checkStage, /const recorded = stageGate\.recordCheck\(stage\);/);
  assert.match(checkStage, /setStageChecks\(\(current\) => \(\{ \.\.\.current, \[stage\]: recorded \}\)\)/);
  assert.doesNotMatch(checkStage, /liveResult/, 'a press must not read the verdict itself');
  // The "needs another look" notice only ever exists beside a verdict.
  assert.match(checkStage, /setNotice\(stageGate\.verdictsShown && !recorded \?/);
});

test('every stage result is rendered through the gate, and the withheld result names no verdict', () => {
  const results = classic.match(/\{stageCheckResult\('(\w+)', '[^']+'\)\}/g) || [];
  assert.deepEqual(
    results.map((call) => call.match(/stageCheckResult\('(\w+)'/)[1]),
    ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
    'each of the five stages renders its result through stageCheckResult',
  );
  assert.doesNotMatch(classic, /ResultPill ok=\{stageChecks\./, 'no stage pill reads a stored check directly any more');
  const result = region(classic, 'const stageCheckResult', '\n  };', 'the stage result');
  assert.match(result, /const report = stageGate\.checkReport\(stage\);/);
  assert.match(result, /if \(report\.kind === 'verdict'\) \{\s*return <ResultPill ok=\{report\.passed\}>/, 'a verdict is rendered only for a verdict report');
  const withheld = region(result, '<span', '</span>', 'the finished-only result');
  assert.match(withheld, /data-stage-completion=\{report\.complete \?/);
  assert.match(withheld, /graded when you submit/);
  assert.doesNotMatch(withheld, /ResultPill|correct|Needs another look|✓|--mm-(success|error)/, 'the finished-only result carries no verdict word or colour');
  // And Submit is bound to the gate's readiness.
  assert.match(classic, /onClick=\{check\}\s*disabled=\{!readyToSubmit\}/);
});
