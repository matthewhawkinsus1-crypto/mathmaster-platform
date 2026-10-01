/*
 * FUNCTION INVESTIGATION: ONE VERDICT, WHICHEVER PATH MARKS THE WORK.
 *
 * The browser tool, QuestionEngine and the server all mark a
 * functionInvestigation2 response with the same pure grader
 * (functions/shared/serverGrading/tools/functionInvestigation2.mjs). These
 * tests pin, for every mode the component can put on screen:
 *
 *   - the verdicts themselves (correct, incorrect, partial, equivalent forms,
 *     unauthored defaults, tampered and oversize work);
 *   - parity: the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the JSON the browser would send) agree exactly;
 *   - extraction: on every filled-in answer the grader reproduces the inline
 *     checks the component ran before the move, check for check;
 *   - the one deliberate change: an untouched box is no longer an answer;
 *   - wiring: the component's own mode, Check routing and work object (read
 *     from its source and evaluated) match what the declaration and grader
 *     expect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import grader from '../../functions/shared/serverGrading/tools/functionInvestigation2.mjs';
import declaration, { resolveFunctionInvestigationMode } from '../../functions/shared/serverGrading/declarations/functionInvestigation2.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { nearlyEqual } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  behaviorForSpec,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  numericSetsMatch,
  parseNumericList,
} from '../../functions/shared/toolMath/functionInvestigation2/functionInvestigationMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const TYPE = 'functionInvestigation2';
const COMPONENT = 'src/tools/functionInvestigation2/FunctionInvestigation2.jsx';
const question = (fields = {}) => ({ type: TYPE, ...fields });
const MODES = ['features', 'domainRange', 'intercepts', 'behavior', 'compare'];

/**
 * Mark work through both paths and require them to agree exactly.
 *
 * The browser path is what the tool's Check runs; the server path re-reads the
 * tool response the browser would send, after a JSON round trip.
 */
const gradeBoth = (q, work) => {
  const browser = gradeToolCheck(grader, q, work);
  assert.ok(browser.toolResponse, 'the browser path builds the tool response it would send');
  const server = gradeServerResponse({ question: q, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.reason ?? null, browser.reason ?? null, 'reason');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server };
};

const verdict = (q, work) => {
  const { browser, server } = gradeBoth(q, work);
  assert.equal(server.graded, true, `graded (${server.reason})`);
  assert.equal(server.surfaceId, TYPE);
  return {
    isCorrect: browser.isCorrect,
    isComplete: browser.isComplete,
    score: browser.score,
    parts: Object.fromEntries(browser.parts.map((part) => [part.id, part.isCorrect])),
    complete: Object.fromEntries(browser.parts.map((part) => [part.id, part.isComplete])),
    mode: server.mode,
  };
};

/*
 * THE COMPONENT'S CHECKS AS THEY WERE BEFORE THE MOVE — copied verbatim from
 * FunctionInvestigation2.jsx's checkFeatures / checkDomainRange /
 * checkIntercepts / checkBehavior / checkComparison and its Check routing
 * (whose final `else` is the comparison check). The shared grader must
 * reproduce this on every filled-in answer.
 */
const legacyCheck = (questionData = {}, state = {}) => {
  const mode = questionData.mode || 'features';
  const spec = normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...questionData.function });
  const features = investigationFeatures(spec);
  const domainRange = domainRangeForSpec(spec);
  const intercepts = interceptsForSpec(spec);
  const compareLeft = normalizeInvestigationSpec(questionData.left || { type: 'linear', a: 1, h: 0, k: 0 });
  const compareRight = normalizeInvestigationSpec(questionData.right || { type: 'quadratic', a: 1, h: 0, k: 0 });
  const compareX = Number(questionData.x ?? 2);
  const comparisonResult = compareFunctionValues(compareLeft, compareRight, compareX);
  const {
    anchorX = '', anchorY = '', verticalAsymptote = '', horizontalAsymptote = '',
    domainCode = '', rangeCode = '', xIntercepts = '', yIntercept = '', behavior = '', comparison = '',
  } = state;
  if (mode === 'features') {
    const checks = [nearlyEqual(Number(anchorX), features.anchor.point[0], 0.01), nearlyEqual(Number(anchorY), features.anchor.point[1], 0.01)];
    if (features.verticalAsymptotes.length) checks.push(nearlyEqual(Number(verticalAsymptote), features.verticalAsymptotes[0], 0.01));
    if (features.horizontalAsymptotes.length) checks.push(nearlyEqual(Number(horizontalAsymptote), features.horizontalAsymptotes[0], 0.01));
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length };
  }
  if (mode === 'domainRange') {
    const checks = [domainCode === domainRange.domainCode, rangeCode === domainRange.rangeCode];
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 };
  }
  if (mode === 'intercepts') {
    const parsedX = parseNumericList(xIntercepts);
    const parsedY = parseNumericList(yIntercept);
    const expectedY = intercepts.y == null ? [] : [intercepts.y];
    const checks = [numericSetsMatch(parsedX, intercepts.x, 0.01), numericSetsMatch(parsedY, expectedY, 0.01)];
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 };
  }
  if (mode === 'behavior') {
    const ok = behavior === behaviorForSpec(spec);
    return { isCorrect: ok, score: ok ? 1 : 0 };
  }
  const ok = comparison === comparisonResult.relation;
  return { isCorrect: ok, score: ok ? 1 : 0 };
};

// ---------------------------------------------------------------------------
// Declaration and mode resolution
// ---------------------------------------------------------------------------

test('every mode the tool renders is shared-server graded, and the manifest carries the declaration', () => {
  assert.equal(GRADING_MANIFEST.functionInvestigation2, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'features');
  assert.deepEqual(Object.keys(declaration.modes).sort(), [...MODES].sort());
  for (const mode of MODES) {
    assert.equal(declaration.modes[mode].authority, GRADING_AUTHORITY.SHARED_SERVER, mode);
    assert.equal(typeof grader.modeGraders[mode], 'function', mode);
    const support = serverResponseGradingSupport(question({ mode, function: { type: 'quadratic', a: 1, h: 0, k: 0 } }));
    assert.equal(support.supported, true, `${mode}: ${support.reason}`);
    assert.equal(support.mode, mode);
  }
  // A toolId-addressed question resolves to the same surface.
  assert.equal(serverResponseGradingSupport({ toolId: TYPE, type: 'tool', mode: 'behavior' }).surfaceId, TYPE);
});

/*
 * The component's own mode expression and Check routing, read out of its
 * source and EVALUATED — so this compares behaviour, not spelling. If the
 * component changes how it picks a view or a check, this fails until the
 * declaration follows.
 */
const componentSource = executableSource(fs.readFileSync(COMPONENT, 'utf8'));
const expressionAfter = (startNeedle, endNeedle) => region(componentSource, startNeedle, endNeedle, startNeedle)
  .slice(startNeedle.length)
  .trim()
  .replace(/;\s*$/, '');

const componentMode = new Function('questionData', `return (${expressionAfter('const mode =', ';')});`);
const CHECK_HANDLERS = ['checkFeatures', 'checkDomainRange', 'checkIntercepts', 'checkBehavior', 'checkComparison'];
const componentCheckRouting = new Function('mode', ...CHECK_HANDLERS, `return (${expressionAfter('const primaryAction =', 'const workspaceCapabilities')});`);
const HANDLER_MODE = { checkFeatures: 'features', checkDomainRange: 'domainRange', checkIntercepts: 'intercepts', checkBehavior: 'behavior', checkComparison: 'compare' };
const componentCheckedMode = (questionData) => {
  const handlers = CHECK_HANDLERS.map((name) => Object.assign(() => name, { handlerName: name }));
  const action = componentCheckRouting(componentMode(questionData), ...handlers);
  return HANDLER_MODE[action.onAction.handlerName];
};

const STATE_FIELDS = ['anchorX', 'anchorY', 'verticalAsymptote', 'horizontalAsymptote', 'domainCode', 'rangeCode', 'xIntercepts', 'yIntercept', 'behavior', 'comparison'];
const componentWork = new Function('mode', ...STATE_FIELDS, `return (${expressionAfter('const work =', 'useReportToolWork(work)')});`);

const MODE_PROBES = [
  {}, { mode: undefined }, { mode: null }, { mode: '' }, { mode: 0 }, { mode: false },
  { mode: 'features' }, { mode: 'domainRange' }, { mode: 'intercepts' }, { mode: 'behavior' }, { mode: 'compare' },
  { mode: 'Features' }, { mode: ' features' }, { mode: 'domainRange ' }, { mode: 'range' }, { mode: 'unknown' },
  { mode: true }, { mode: 1 }, { mode: ['features'] }, { mode: {} },
];

test('the declaration resolves exactly the check the component runs, unknown modes included', () => {
  // Sanity: the evaluated routing is the real one.
  assert.equal(componentCheckedMode({ mode: 'intercepts' }), 'intercepts');
  assert.equal(componentCheckedMode({}), 'features');
  for (const probe of MODE_PROBES) {
    const q = question(probe);
    const expected = componentCheckedMode(q);
    assert.equal(resolveToolMode(declaration, q), expected, `mode ${JSON.stringify(probe.mode)}`);
    assert.equal(grader.support(q).mode, expected, `support mode ${JSON.stringify(probe.mode)}`);
  }
  // The default fallback would have graded features for an unknown mode; the
  // component checks a comparison there.
  assert.equal(resolveFunctionInvestigationMode({ mode: 'unknown' }), 'compare');
  assert.equal(resolveToolMode(declaration, question({ mode: 'unknown' })), 'compare');
});

test('the work the component submits for each mode is exactly the work its grader reads', () => {
  const state = {
    anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '-2',
    domainCode: 'xNotH', rangeCode: 'yNotK', xIntercepts: '2', yIntercept: '-4', behavior: 'decreasingBranches', comparison: 'right',
  };
  const build = (mode) => componentWork(mode, ...STATE_FIELDS.map((field) => state[field]));
  assert.deepEqual(build('features'), { anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '-2' });
  assert.deepEqual(build('domainRange'), { domainCode: 'xNotH', rangeCode: 'yNotK' });
  assert.deepEqual(build('intercepts'), { xIntercepts: '2', yIntercept: '-4' });
  assert.deepEqual(build('behavior'), { behavior: 'decreasingBranches' });
  assert.deepEqual(build('compare'), { comparison: 'right' });
  assert.deepEqual(build('unknown'), { comparison: 'right' }, 'an unknown mode checks the comparison, as its routing does');
  // Every field the component fills in for the default question is right, so
  // each mode's work is fully correct through both paths — a renamed field on
  // either side turns this red.
  for (const mode of [...MODES, 'unknown']) {
    const work = build(mode);
    assert.deepEqual(boundToolWork(work).dropped, [], `${mode}: no student field is a stripped key`);
    const result = verdict(question({ mode }), work);
    assert.equal(result.isCorrect, true, mode);
    assert.equal(result.isComplete, true, mode);
  }
});

test('the component marks every Check through the shared grader and reports the same work live', () => {
  // The import that the call below depends on (a .jsx call with no import is a
  // runtime ReferenceError no build step catches).
  assert.match(componentSource, /import functionInvestigationGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/functionInvestigation2\.mjs';/);
  assert.match(componentSource, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(componentSource, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  /*
   * Every Check, EVALUATED: the component's own checkWork and check handlers
   * run against stubs, and what reaches submit() is compared exactly. The
   * verdict must be the shared result's, the response must be the very `work`
   * object, and the metadata must be the allowlist below and nothing else.
   *
   * An allowlist, not a denylist: the key values (domainRange, intercepts,
   * features.anchor.point, the comparison relation, the function values) are
   * deliberately NOT given to the evaluated code, so a handler that tries to
   * put one in its metadata throws a ReferenceError, and one that adds any
   * other field fails the deepEqual. Add a key here only if it is something
   * the student's screen already shows and not a value derived from the key.
   */
  const checkWorkSource = region(componentSource, 'const checkWork', 'const checkFeatures', 'checkWork');
  const handlersSource = region(componentSource, 'const checkFeatures', 'const feedbackMessage', 'check handlers');
  const wire = new Function(
    'gradeToolCheck', 'functionInvestigationGrader', 'questionData', 'work', 'mode', 'submit', 'spec', 'features', 'compareX',
    `${checkWorkSource}\n${handlersSource}\nreturn { ${CHECK_HANDLERS.join(', ')} };`,
  );
  const stubGrader = { toolId: 'stub-grader' };
  const stubQuestion = { mode: 'stub-question' };
  const stubWork = { stub: 'work' };
  const stubParts = [{ id: 'stub-part', isCorrect: true }];
  const stubResult = { graded: true, isComplete: true, isCorrect: false, score: 0.5, parts: stubParts, toolResponse: { value: '{}' } };
  const spec = { type: 'logarithmic', a: 1, h: 3, k: 4, base: 2 };
  const features = { anchor: { label: 'reference point', point: [4, 4], isOnGraph: true }, verticalAsymptotes: [3], horizontalAsymptotes: [] };
  const ALLOWED_METADATA = {
    checkFeatures: { family: 'logarithmic', featureLabel: 'reference point', anchorIsOnGraph: true },
    checkDomainRange: { family: 'logarithmic' },
    checkIntercepts: { family: 'logarithmic' },
    checkBehavior: { family: 'logarithmic' },
    checkComparison: { x: 7 },
  };
  for (const name of CHECK_HANDLERS) {
    const calls = [];
    const handlers = wire(
      (...args) => { calls.push(['grade', ...args]); return stubResult; },
      stubGrader, stubQuestion, stubWork, 'stub-mode',
      (...args) => calls.push(['submit', ...args]),
      spec, features, 7,
    );
    handlers[name]();
    assert.equal(calls.length, 2, `${name}: one shared grade, one submit`);
    const [[gradeTag, gradedBy, gradedQuestion, gradedWork], [submitTag, verdict, response, metadata]] = calls;
    assert.equal(gradeTag, 'grade', `${name}: the shared grader runs before submit`);
    assert.equal(gradedBy, stubGrader, `${name}: graded by the tool's shared grader`);
    assert.equal(gradedQuestion, stubQuestion, `${name}: against the question the tool was given`);
    assert.equal(gradedWork, stubWork, `${name}: the work it grades is the reported work`);
    assert.equal(submitTag, 'submit');
    assert.deepEqual(verdict, { isCorrect: false, score: 0.5 }, `${name}: the verdict is the shared result's, and only that`);
    assert.equal(response, stubWork, `${name}: the submitted response is the graded work`);
    assert.deepEqual(metadata, { mode: 'stub-mode', ...ALLOWED_METADATA[name], parts: stubParts }, `${name}: only non-secret metadata`);
  }
  // The live report is the same object the Check submits.
  assert.match(componentSource, /useReportToolWork\(work\);/);
  // No second definition of correctness survives in the component.
  assert.doesNotMatch(componentSource, /nearlyEqual|numericSetsMatch|parseNumericList|behaviorForSpec|compareFunctionValues/);
});

test('the feedback that names the wrong half reads part ids the grader actually produces', () => {
  // feedbackMessage tells a student WHICH half was wrong by looking a part up
  // by id; an id the grader never emits would silently degrade every message
  // to "neither matches".
  const feedback = region(componentSource, 'const feedbackMessage', 'const primaryAction', 'feedbackMessage');
  const idsFor = (mode) => {
    const start = feedback.indexOf(`if (mode === '${mode}'`);
    assert.notEqual(start, -1, `${mode}: feedback has a branch of its own`);
    const block = feedback.slice(start, feedback.indexOf('\n    }\n', start));
    return [...new Set([...block.matchAll(/partIsCorrect\('([^']+)'\)/g)].map((match) => match[1]))];
  };
  const sample = {
    features: [question(), { anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '-2' }],
    domainRange: [question({ mode: 'domainRange' }), { domainCode: 'xNotH', rangeCode: 'yNotK' }],
    intercepts: [question({ mode: 'intercepts' }), { xIntercepts: '2', yIntercept: '-4' }],
  };
  for (const [mode, [q, work]] of Object.entries(sample)) {
    const ids = idsFor(mode);
    assert.equal(ids.length, 2, `${mode}: feedback reads its two halves by id (${ids})`);
    const produced = gradeToolCheck(grader, q, work).parts.map((part) => part.id);
    ids.forEach((id) => assert.ok(produced.includes(id), `${mode}: feedback reads part "${id}", grader emits ${produced}`));
  }
});

// ---------------------------------------------------------------------------
// features
// ---------------------------------------------------------------------------

test('features: the unauthored default (rational a=2, h=1, k=-2) grades anchor and both asymptotes', () => {
  const q = question();
  const correct = verdict(q, { anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '-2' });
  assert.deepEqual({ ...correct, parts: undefined, complete: undefined }, { isCorrect: true, isComplete: true, score: 1, parts: undefined, complete: undefined, mode: 'features' });
  assert.deepEqual(Object.keys(correct.parts), ['anchor-x', 'anchor-y', 'vertical-asymptote', 'horizontal-asymptote']);

  const wrong = verdict(q, { anchorX: '2', anchorY: '2', verticalAsymptote: '-2', horizontalAsymptote: '1' });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.isComplete, true);
  assert.equal(wrong.score, 0);

  const pointOnly = verdict(q, { anchorX: '1', anchorY: '-2', verticalAsymptote: '-2', horizontalAsymptote: '1' });
  assert.equal(pointOnly.isCorrect, false);
  assert.equal(pointOnly.score, 0.5);
  assert.deepEqual(pointOnly.parts, { 'anchor-x': true, 'anchor-y': true, 'vertical-asymptote': false, 'horizontal-asymptote': false });

  const oneMissing = verdict(q, { anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '' });
  assert.equal(oneMissing.isComplete, false);
  assert.equal(oneMissing.isCorrect, false);
  assert.equal(oneMissing.score, 0.75);
});

test('features: tolerance 0.01 and the numeric forms the number inputs deliver', () => {
  const q = question({ mode: 'features', function: { type: 'quadratic', a: 1, h: 1, k: -4 } });
  for (const [x, y] of [['1', '-4'], ['1.0', '-4.00'], ['1.009', '-3.991'], [' 1 ', '-4'], ['1e0', '-4e0'], [1, -4]]) {
    assert.equal(verdict(q, { anchorX: x, anchorY: y }).isCorrect, true, `${x}, ${y}`);
  }
  assert.equal(verdict(q, { anchorX: '1.02', anchorY: '-4' }).score, 0.5, 'outside 0.01');
  // Families without asymptotes ask only for the point; stray asymptote fields are ignored.
  const vertexOnly = verdict(q, { anchorX: '1', anchorY: '-4', verticalAsymptote: '99', horizontalAsymptote: 'abc' });
  assert.deepEqual(Object.keys(vertexOnly.parts), ['anchor-x', 'anchor-y']);
  assert.equal(vertexOnly.isCorrect, true);
});

test('features: each family grades its own defining feature and only the asymptotes it has', () => {
  const cases = [
    [{ type: 'linear', a: 2, h: 1, k: 3 }, { anchorX: '0', anchorY: '1' }],
    [{ type: 'absolute', a: -1, h: 2, k: 3 }, { anchorX: '2', anchorY: '3' }],
    [{ type: 'squareRoot', a: 1, h: 2, k: 1 }, { anchorX: '2', anchorY: '1' }],
    [{ type: 'cubic', a: 1, h: 0, k: -8 }, { anchorX: '0', anchorY: '-8' }],
    [{ type: 'cubeRoot', a: 1, h: 1, k: 2 }, { anchorX: '1', anchorY: '2' }],
    [{ type: 'exponential', a: 2, h: 0, k: -8, base: 2 }, { anchorX: '0', anchorY: '-6', horizontalAsymptote: '-8' }],
    [{ type: 'logarithmic', a: 1, h: -1, k: 0, base: 2 }, { anchorX: '0', anchorY: '0', verticalAsymptote: '-1' }],
    [{ type: 'rational', a: 2, h: 0, k: 0 }, { anchorX: '0', anchorY: '0', verticalAsymptote: '0', horizontalAsymptote: '0' }],
  ];
  for (const [fn, work] of cases) {
    const result = verdict(question({ mode: 'features', function: fn }), work);
    assert.equal(result.isCorrect, true, fn.type);
    assert.equal(Object.keys(result.parts).length, Object.keys(work).length, `${fn.type} asks exactly the boxes it shows`);
  }
});

// ---------------------------------------------------------------------------
// domainRange
// ---------------------------------------------------------------------------

test('domainRange: both codes, either half, neither, and blank selections', () => {
  const q = question({ mode: 'domainRange', function: { type: 'quadratic', a: -1, h: 2, k: 6 } });
  assert.deepEqual(verdict(q, { domainCode: 'allReal', rangeCode: 'yLteK' }).score, 1);
  const domainOnly = verdict(q, { domainCode: 'allReal', rangeCode: 'yGteK' });
  assert.equal(domainOnly.isCorrect, false);
  assert.equal(domainOnly.score, 0.5);
  assert.deepEqual(domainOnly.parts, { domain: true, range: false });
  assert.equal(verdict(q, { domainCode: 'xGteH', rangeCode: 'yLteK' }).score, 0.5);
  assert.equal(verdict(q, { domainCode: 'xNotH', rangeCode: 'yNotK' }).score, 0);
  const blank = verdict(q, { domainCode: '', rangeCode: 'yLteK' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  assert.equal(blank.score, 0.5);
  // The unauthored default is rational: x ≠ h, y ≠ k.
  assert.equal(verdict(question({ mode: 'domainRange' }), { domainCode: 'xNotH', rangeCode: 'yNotK' }).isCorrect, true);
  // Graded by code against the key, never by position: a trimmed or reordered
  // choice list on the question changes nothing.
  for (const extra of [{ choices: ['yGteK', 'allReal'] }, { choices: ['allReal'] }, { domainChoices: ['xGtH'], rangeChoices: [] }]) {
    assert.equal(verdict({ ...q, ...extra }, { domainCode: 'allReal', rangeCode: 'yLteK' }).isCorrect, true, JSON.stringify(extra));
  }
});

// ---------------------------------------------------------------------------
// intercepts
// ---------------------------------------------------------------------------

test('intercepts: set equality in any order or separator, "none", and partial credit', () => {
  const q = question({ mode: 'intercepts', function: { type: 'quadratic', a: 1, h: 1, k: -4 } });
  for (const xIntercepts of ['-1, 3', '3, -1', '3 -1', '-1;3', '3,-1,3', ' -1 ,  3 ', '-1.004, 2.996']) {
    assert.equal(verdict(q, { xIntercepts, yIntercept: '-3' }).isCorrect, true, xIntercepts);
  }
  const xOnly = verdict(q, { xIntercepts: '-1, 3', yIntercept: '3' });
  assert.equal(xOnly.score, 0.5);
  assert.deepEqual(xOnly.parts, { 'x-intercepts': true, 'y-intercept': false });
  assert.equal(verdict(q, { xIntercepts: '3', yIntercept: '-3' }).score, 0.5, 'a missing root is wrong');
  assert.equal(verdict(q, { xIntercepts: '-1, 3, 5', yIntercept: '-3' }).score, 0.5, 'an extra root is wrong');
  assert.equal(verdict(q, { xIntercepts: 'abc', yIntercept: '-3' }).parts['x-intercepts'], false);
  // The tool reads numbers with Number(): a fraction was never accepted here.
  assert.equal(verdict(q, { xIntercepts: '-1, 6/2', yIntercept: '-3' }).parts['x-intercepts'], false);

  const none = question({ mode: 'intercepts', function: { type: 'rational', a: 2, h: 0, k: 0 } });
  for (const word of ['none', 'NONE', ' None ', '∅', 'empty', 'no']) {
    assert.equal(verdict(none, { xIntercepts: word, yIntercept: word }).isCorrect, true, word);
  }
  assert.equal(verdict(none, { xIntercepts: '0', yIntercept: 'none' }).score, 0.5);

  // Unauthored default: rational a=2, h=1, k=-2 crosses at x = 2 and y = -4.
  assert.equal(verdict(question({ mode: 'intercepts' }), { xIntercepts: '2', yIntercept: '-4' }).isCorrect, true);
});

// ---------------------------------------------------------------------------
// behavior
// ---------------------------------------------------------------------------

test('behavior: the family and the sign of a (and a base below 1) decide the statement', () => {
  const decaying = question({ mode: 'behavior', function: { type: 'exponential', a: 2, h: 0, k: 0, base: 0.5 } });
  assert.equal(verdict(decaying, { behavior: 'decreasing' }).isCorrect, true);
  const wrong = verdict(decaying, { behavior: 'increasing' });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.isComplete, true);
  assert.equal(wrong.score, 0);
  const blank = verdict(decaying, { behavior: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  assert.equal(verdict(question({ mode: 'behavior', function: { type: 'rational', a: -2, h: 0, k: 0 } }), { behavior: 'increasingBranches' }).isCorrect, true);
  assert.equal(verdict(question({ mode: 'behavior', function: { type: 'absolute', a: -1, h: 2, k: 3 } }), { behavior: 'maximum' }).isCorrect, true);
  // Unauthored default: rational with a > 0.
  assert.equal(verdict(question({ mode: 'behavior' }), { behavior: 'decreasingBranches' }).isCorrect, true);
});

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

test('compare: greater, equal and undefined at the shared input, with the unauthored defaults', () => {
  // Defaults: f(x) = x, g(x) = x², x = 2 — g is greater.
  assert.equal(verdict(question({ mode: 'compare' }), { comparison: 'right' }).isCorrect, true);
  assert.equal(verdict(question({ mode: 'compare' }), { comparison: 'left' }).isCorrect, false);
  const authored = question({ mode: 'compare', left: { type: 'linear', a: 2, h: 0, k: 1 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 3 });
  assert.equal(verdict(authored, { comparison: 'right' }).isCorrect, true);
  assert.equal(verdict({ ...authored, x: 1 }, { comparison: 'left' }).isCorrect, true, '3 > 1 at x = 1');
  assert.equal(verdict({ ...authored, x: '3' }, { comparison: 'right' }).isCorrect, true, 'x read with Number()');
  const equal = question({ mode: 'compare', left: { type: 'linear', a: 1, h: 0, k: 0 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 1 });
  assert.equal(verdict(equal, { comparison: 'equal' }).isCorrect, true);
  const undefinedHere = question({ mode: 'compare', left: { type: 'rational', a: 1, h: 0, k: 0 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 0 });
  assert.equal(verdict(undefinedHere, { comparison: 'undefined' }).isCorrect, true);
  assert.equal(verdict(undefinedHere, { comparison: 'equal' }).isCorrect, false);
  const blank = verdict(question({ mode: 'compare' }), { comparison: '' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  // An unauthored x is 2: x + 2 and x² meet there, and nowhere else nearby.
  const meetAtTwo = question({ mode: 'compare', left: { type: 'linear', a: 1, h: 0, k: 2 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 } });
  assert.equal(verdict(meetAtTwo, { comparison: 'equal' }).isCorrect, true);
  assert.equal(verdict({ ...meetAtTwo, x: 3 }, { comparison: 'right' }).isCorrect, true);
  // An unauthored side is the tool's own: f(x) = x on the left, g(x) = x² on the right.
  assert.equal(verdict(question({ mode: 'compare', x: 0.5 }), { comparison: 'left' }).isCorrect, true);
  assert.equal(verdict(question({ mode: 'compare', left: { type: 'linear', a: 1, h: 0, k: 1 }, x: 0.5 }), { comparison: 'left' }).isCorrect, true);
  assert.equal(verdict(question({ mode: 'compare', right: { type: 'linear', a: 1, h: 0, k: 1 }, x: 0.5 }), { comparison: 'right' }).isCorrect, true);
  // ...and only those: x + 2 meets the default x² at the default x (x³ would be 8),
  // and the default f(x) = x meets an authored g(x) = x everywhere.
  assert.equal(verdict(question({ mode: 'compare', left: { type: 'linear', a: 1, h: 0, k: 2 } }), { comparison: 'equal' }).isCorrect, true);
  assert.equal(verdict(question({ mode: 'compare', right: { type: 'linear', a: 1, h: 0, k: 0 }, x: -3 }), { comparison: 'equal' }).isCorrect, true);
});

test('an unrecognised mode is checked as the comparison its only Check runs, and blank is incomplete', () => {
  const q = question({ mode: 'graphFeatures', function: { type: 'quadratic', a: 1, h: 0, k: 0 } });
  const untouched = verdict(q, { comparison: '' });
  assert.equal(untouched.mode, 'compare');
  assert.equal(untouched.isComplete, false);
  assert.equal(untouched.isCorrect, false);
  assert.equal(untouched.score, 0);
});

// ---------------------------------------------------------------------------
// Extraction parity with the pre-shared component
// ---------------------------------------------------------------------------

const FUNCTION_GRID = [
  undefined,
  { type: 'linear', a: 2, h: 1, k: 3 }, { type: 'linear', a: -0.5, h: 0, k: 0 },
  { type: 'quadratic', a: 1, h: 1, k: -4 }, { type: 'quadratic', a: -2, h: -3, k: 0 }, { type: 'quadratic', a: 1, h: 2, k: 5 },
  { type: 'absolute', a: -1, h: 2, k: 3 }, { type: 'absolute', a: 0.5, h: -1, k: -2 },
  { type: 'cubic', a: 1, h: 0, k: -8 }, { type: 'cubic', a: -1, h: 2, k: 1 },
  { type: 'cubeRoot', a: 1, h: 1, k: 2 }, { type: 'cubeRoot', a: -2, h: 0, k: 0 },
  { type: 'squareRoot', a: 1, h: 2, k: 1 }, { type: 'squareRoot', a: -1, h: -4, k: 2 },
  { type: 'exponential', a: 2, h: 0, k: -8, base: 2 }, { type: 'exponential', a: 2, h: 1, k: 0, base: 0.5 }, { type: 'exponential', a: -1, h: 0, k: 3, base: 3 },
  { type: 'logarithmic', a: 1, h: -1, k: 0, base: 2 }, { type: 'logarithmic', a: -2, h: 1, k: 1, base: 10 }, { type: 'logarithmic', a: 1, h: 0, k: 0, base: 0.5 },
  { type: 'rational', a: 2, h: 0, k: 0 }, { type: 'rational', a: -3, h: 2, k: 1 }, { type: 'mystery', a: 1 },
];

const fmt = (value) => String(Math.round(value * 1e6) / 1e6);
const answersFor = (q) => {
  const spec = normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...q.function });
  const features = investigationFeatures(spec);
  const intercepts = interceptsForSpec(spec);
  const [ax, ay] = features.anchor.point;
  const va = features.verticalAsymptotes[0] ?? 0;
  const ha = features.horizontalAsymptotes[0] ?? 0;
  const xList = intercepts.x.length ? intercepts.x.map(fmt).join(', ') : 'none';
  const yList = intercepts.y == null ? 'none' : fmt(intercepts.y);
  const key = domainRangeForSpec(spec);
  return {
    features: [
      { anchorX: fmt(ax), anchorY: fmt(ay), verticalAsymptote: fmt(va), horizontalAsymptote: fmt(ha) },
      { anchorX: fmt(ax + 0.005), anchorY: fmt(ay - 0.5), verticalAsymptote: fmt(va + 0.009), horizontalAsymptote: fmt(ha + 3) },
      { anchorX: fmt(ax + 1), anchorY: fmt(ay), verticalAsymptote: fmt(va - 1), horizontalAsymptote: fmt(ha) },
      { anchorX: fmt(ax - 0.05), anchorY: fmt(ay + 0.011), verticalAsymptote: fmt(va), horizontalAsymptote: fmt(ha - 0.05) },
      { anchorX: '0', anchorY: '0', verticalAsymptote: '0', horizontalAsymptote: '0' },
      { anchorX: 'x', anchorY: fmt(ay), verticalAsymptote: fmt(va), horizontalAsymptote: '1e9' },
    ],
    domainRange: [
      { domainCode: key.domainCode, rangeCode: key.rangeCode },
      { domainCode: key.domainCode, rangeCode: 'yNotK' },
      { domainCode: 'xGtH', rangeCode: key.rangeCode },
      { domainCode: 'allReal', rangeCode: 'allReal' },
      { domainCode: 'nonsense', rangeCode: 'yGteK' },
    ],
    intercepts: [
      { xIntercepts: xList, yIntercept: yList },
      { xIntercepts: intercepts.x.length ? [...intercepts.x].reverse().map(fmt).join(' ') : 'NONE', yIntercept: 'none' },
      { xIntercepts: '0', yIntercept: yList },
      { xIntercepts: xList, yIntercept: '0' },
      { xIntercepts: 'none', yIntercept: 'none' },
      { xIntercepts: '1/2', yIntercept: 'abc' },
    ],
    behavior: ['minimum', 'maximum', 'increasing', 'decreasing', 'increasingBranches', 'decreasingBranches', 'sideways'].map((behavior) => ({ behavior })),
    compare: ['left', 'right', 'equal', 'undefined', 'bigger'].map((comparison) => ({ comparison })),
  };
};

const COMPARE_GRID = [
  {},
  { left: { type: 'linear', a: 2, h: 0, k: 1 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 3 },
  { left: { type: 'linear', a: 1, h: 0, k: 0 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 1 },
  { left: { type: 'rational', a: 1, h: 0, k: 0 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 0 },
  { left: { type: 'exponential', a: 1, h: 0, k: 0, base: 2 }, right: { type: 'cubic', a: 1, h: 0, k: 0 }, x: -1 },
  { left: { type: 'squareRoot', a: 1, h: 0, k: 0 }, right: { type: 'logarithmic', a: 1, h: 0, k: 0, base: 2 }, x: '4' },
  { left: {}, x: '' },
  { left: { type: 'linear', a: 1, h: 0, k: 2 }, right: { type: 'quadratic', a: 1, h: 0, k: 0 } },
  { x: 0.5 },
  { left: { type: 'linear', a: 1, h: 0, k: 2 } },
  { right: { type: 'linear', a: 1, h: 0, k: 0 }, x: -3 },
];

test('extraction: on every filled-in answer the shared grader is the component\'s old inline check', () => {
  let compared = 0;
  const assertSame = (q, work) => {
    const shared = verdict(q, work);
    const legacy = legacyCheck(q, work);
    assert.equal(shared.isCorrect, legacy.isCorrect, `isCorrect ${JSON.stringify({ q, work })}`);
    assert.equal(shared.score, legacy.score, `score ${JSON.stringify({ q, work })}`);
    compared += 1;
  };
  for (const fn of FUNCTION_GRID) {
    for (const mode of ['features', 'domainRange', 'intercepts', 'behavior']) {
      const q = question({ mode, ...(fn ? { function: fn } : {}) });
      for (const work of answersFor(q)[mode]) assertSame(q, work);
    }
  }
  for (const fields of COMPARE_GRID) {
    for (const mode of ['compare', 'somethingElse']) {
      const q = question({ mode, ...fields });
      for (const work of answersFor(q).compare) assertSame(q, work);
    }
  }
  assert.ok(compared > 400, `compared ${compared} answers`);
});

test('behaviour change, pinned: an untouched box is no longer graded as 0 or as "none"', () => {
  // BEFORE: the component read Number('') === 0 and parseNumericList('') === [],
  // so these empty screens scored as fully correct. AFTER: blank is incomplete
  // and incorrect, on the screen and on the server alike.
  const origin = question({ mode: 'features', function: { type: 'rational', a: 2, h: 0, k: 0 } });
  const emptyFeatures = { anchorX: '', anchorY: '', verticalAsymptote: '', horizontalAsymptote: '' };
  assert.deepEqual(legacyCheck(origin, emptyFeatures), { isCorrect: true, score: 1 });
  const now = verdict(origin, emptyFeatures);
  assert.deepEqual([now.isCorrect, now.isComplete, now.score], [false, false, 0]);
  // Typing the 0s is still exactly right.
  assert.equal(verdict(origin, { anchorX: '0', anchorY: '0', verticalAsymptote: '0', horizontalAsymptote: '0' }).isCorrect, true);

  // Every linear question used to hand out the y-intercept's x = 0 for free.
  const linear = question({ mode: 'features', function: { type: 'linear', a: 2, h: 1, k: 3 } });
  assert.deepEqual(legacyCheck(linear, { anchorX: '', anchorY: '1' }), { isCorrect: true, score: 1 });
  const linearNow = verdict(linear, { anchorX: '', anchorY: '1' });
  assert.deepEqual([linearNow.isCorrect, linearNow.score, linearNow.complete['anchor-x']], [false, 0.5, false]);

  const noIntercepts = question({ mode: 'intercepts', function: { type: 'rational', a: 2, h: 0, k: 0 } });
  assert.deepEqual(legacyCheck(noIntercepts, { xIntercepts: '', yIntercept: '  ' }), { isCorrect: true, score: 1 });
  const interceptsNow = verdict(noIntercepts, { xIntercepts: '', yIntercept: '  ' });
  assert.deepEqual([interceptsNow.isCorrect, interceptsNow.isComplete, interceptsNow.score], [false, false, 0]);
  assert.equal(verdict(noIntercepts, { xIntercepts: 'none', yIntercept: 'none' }).isCorrect, true);
});

test('completeness: untouched work is never complete, so a deadline cannot auto-submit it', () => {
  const untouched = {
    features: { anchorX: '', anchorY: '', verticalAsymptote: '', horizontalAsymptote: '' },
    domainRange: { domainCode: '', rangeCode: '' },
    intercepts: { xIntercepts: '', yIntercept: '' },
    behavior: { behavior: '' },
    compare: { comparison: '' },
  };
  for (const mode of MODES) {
    for (const fn of [undefined, { type: 'rational', a: 2, h: 0, k: 0 }, { type: 'linear', a: 1, h: 0, k: 0 }]) {
      const result = verdict(question({ mode, ...(fn ? { function: fn } : {}) }), untouched[mode]);
      assert.equal(result.isComplete, false, `${mode} ${JSON.stringify(fn)}`);
      assert.equal(result.isCorrect, false, `${mode} ${JSON.stringify(fn)}`);
    }
  }
  // Complete but wrong is complete.
  assert.equal(verdict(question({ mode: 'behavior' }), { behavior: 'minimum' }).isComplete, true);
  // A features question asks only the boxes it shows: a quadratic is complete without asymptotes.
  assert.equal(verdict(question({ function: { type: 'quadratic', a: 1, h: 0, k: 0 } }), { anchorX: '0', anchorY: '0', verticalAsymptote: '', horizontalAsymptote: '' }).isComplete, true);
});

// ---------------------------------------------------------------------------
// Tampered, malformed and oversize work
// ---------------------------------------------------------------------------

test('injected verdicts and keys are stripped and never change the grade', () => {
  const q = question({ mode: 'compare' });
  const injected = { comparison: 'left', isCorrect: true, score: 1, checks: [true], expected: 'left', answerKey: 'left', correct: true };
  const { dropped } = boundToolWork(injected);
  assert.deepEqual(dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'isCorrect', 'score']);
  const result = verdict(q, injected);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  const features = verdict(question(), { anchorX: '1', anchorY: '5', verticalAsymptote: '1', horizontalAsymptote: '-2', isCorrect: true, score: 1, feedback: 'ok' });
  assert.equal(features.isCorrect, false);
  assert.equal(features.score, 0.75);
});

test('wrong types and missing fields grade as unanswered, never as a crash', () => {
  const q = question();
  const odd = verdict(q, { anchorX: { value: 1 }, anchorY: ['-2'], verticalAsymptote: true, horizontalAsymptote: null });
  assert.deepEqual([odd.isCorrect, odd.isComplete, odd.score], [false, false, 0]);
  const empty = verdict(q, {});
  assert.deepEqual([empty.isCorrect, empty.isComplete, empty.score], [false, false, 0]);
  const intercepts = verdict(question({ mode: 'intercepts' }), { xIntercepts: [2], yIntercept: { y: -4 } });
  assert.deepEqual([intercepts.isCorrect, intercepts.isComplete], [false, false]);
  for (const comparison of [1, true, ['right'], { relation: 'right' }]) {
    const result = verdict(question({ mode: 'compare' }), { comparison });
    assert.equal(result.isCorrect, false, JSON.stringify(comparison));
  }
  assert.equal(verdict(question({ mode: 'domainRange' }), { domainCode: ['xNotH'], rangeCode: 7 }).score, 0);
  // Non-finite numbers travel as "Infinity" and never match a finite key.
  assert.equal(verdict(question({ mode: 'features', function: { type: 'quadratic', a: 1, h: 0, k: 0 } }), { anchorX: Infinity, anchorY: Number.NaN }).isCorrect, false);
});

test('non-object and oversize work is ungraded on both paths, not marked wrong', () => {
  const q = question({ mode: 'compare' });
  for (const work of [null, undefined, 'right', 7, ['right']]) {
    const { browser, server } = gradeBoth(q, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(server.graded, false, JSON.stringify(work));
  }
  const padding = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`pad${index}`, 'x'.repeat(1000)]));
  const { browser, server } = gradeBoth(q, { comparison: 'right', ...padding });
  assert.equal(browser.graded, false);
  assert.equal(server.reason, 'oversize-response');
});

test('realistic maximal work stays inside the response limits with nothing stripped', () => {
  const longList = Array.from({ length: 60 }, (_, index) => `-${index}.123456789`).join(', ');
  const works = [
    { anchorX: '-123456.7890123', anchorY: '98765.4321098', verticalAsymptote: '-0.0000001', horizontalAsymptote: '1e-7' },
    { domainCode: 'xNotH', rangeCode: 'yNotK' },
    { xIntercepts: longList, yIntercept: longList },
    { behavior: 'increasingBranches' },
    { comparison: 'undefined' },
  ];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  }
});

// ---------------------------------------------------------------------------
// Discrimination: the key comes from the question, and only from the question
// ---------------------------------------------------------------------------

test('correct work fails against a question whose key was altered', () => {
  const fixtures = [
    [{ mode: 'features', function: { type: 'quadratic', a: 1, h: 1, k: -4 } }, { function: { type: 'quadratic', a: 1, h: 1, k: -3 } }, { anchorX: '1', anchorY: '-4' }],
    [{ mode: 'features' }, { function: { type: 'rational', a: 2, h: 2, k: -2 } }, { anchorX: '1', anchorY: '-2', verticalAsymptote: '1', horizontalAsymptote: '-2' }],
    [{ mode: 'domainRange', function: { type: 'quadratic', a: -1, h: 2, k: 6 } }, { function: { type: 'quadratic', a: 1, h: 2, k: 6 } }, { domainCode: 'allReal', rangeCode: 'yLteK' }],
    [{ mode: 'intercepts', function: { type: 'quadratic', a: 1, h: 1, k: -4 } }, { function: { type: 'quadratic', a: 1, h: 2, k: -4 } }, { xIntercepts: '-1, 3', yIntercept: '-3' }],
    [{ mode: 'behavior', function: { type: 'exponential', a: 2, h: 0, k: 0, base: 0.5 } }, { function: { type: 'exponential', a: 2, h: 0, k: 0, base: 2 } }, { behavior: 'decreasing' }],
    [{ mode: 'compare', x: 3 }, { x: 0.5 }, { comparison: 'right' }],
  ];
  for (const [fields, alteration, work] of fixtures) {
    const original = question(fields);
    assert.equal(verdict(original, work).isCorrect, true, `${fields.mode}: correct against its own key`);
    const altered = verdict({ ...original, ...alteration }, work);
    assert.equal(altered.isCorrect, false, `${fields.mode}: must fail against an altered key`);
    assert.ok(altered.score < 1, fields.mode);
  }
});

test('the attempt record follows the shared result', () => {
  const partial = gradeToolCheck(grader, question({ mode: 'domainRange', function: { type: 'quadratic', a: -1, h: 2, k: 6 } }), { domainCode: 'allReal', rangeCode: 'yGteK' });
  const inputs = attemptInputsFromGrading(partial);
  assert.equal(inputs.isCorrect, false);
  assert.equal(inputs.partialCreditPercent, 50);
  assert.deepEqual(inputs.parts.map((part) => [part.id, part.isCorrect, part.response]), [['domain', true, 'allReal'], ['range', false, 'yGteK']]);
  // No part carries a key value as its label or response.
  const features = gradeToolCheck(grader, question(), { anchorX: '7', anchorY: '7', verticalAsymptote: '7', horizontalAsymptote: '7' });
  for (const part of features.parts) {
    assert.doesNotMatch(`${part.label} ${part.response}`, /-2|\b1\b/, part.id);
  }
});
