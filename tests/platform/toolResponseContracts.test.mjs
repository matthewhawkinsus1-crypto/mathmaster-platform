import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PATH_TOOL_IDS, PATH_ANALYSIS_NOTATION_KINDS, PATH_ANALYSIS_POINT_FEATURES,
  buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse, isPathEligible,
  normalizeAnswer, normalizePathIntervals, pathIntervalNotationMatches, samePathIntervals,
} from '../../functions/shared/pathToolContracts.mjs';
import { NOTATION_ANALYSIS_KINDS, POINT_FEATURES } from '../../src/analysisRequestCatalog.js';
import { setAnswerMatches } from '../../src/interactiveGraphEngine.js';
import {
  normalizeIntervals, notationMatches, sameIntervals,
} from '../../src/tools/intervalNumberLine/intervalMath.js';
import { PATH_TOOL_QUESTIONS } from './fixtures/pathToolQuestions.mjs';

// Does the server grade what the browser actually sends?
//
// WHY THIS FILE EXISTS. The number-line tool has always submitted its endpoints
// as `{min, max, minClosed, maxClosed}`. The server's grader read
// `{start, end, startClosed, endClosed}`. A student whose graph was right was
// told it was wrong, in secure My Math Path, silently.
//
// There WAS a server test for that grader. It passed. It passed because the
// test author wrote the response by hand, out of the same wrong assumption the
// server was written from — so the test agreed with the bug instead of catching
// it. A hand-written response object only ever proves the grader is consistent
// with whoever wrote the test.
//
// So the responses below were not written. They were CAPTURED: each one is the
// exact object that left a real Chromium browser, after a real student
// interaction with the real React tool, rendered from the real public payload,
// on its way into `serverGrading.submit`. The capture harness mounted
// QuestionEngine exactly as PathSessionPlayer does. If a tool changes what it
// sends, the recapture changes and this file fails.
//
// Recapturing is a browser job and is done deliberately, not on every test run:
// see the harness note in the fixture header.

const CAPTURED = JSON.parse(
  await readFile(new URL('./fixtures/capturedToolResponses.json', import.meta.url), 'utf8'),
);

const questionFor = (key) => PATH_TOOL_QUESTIONS[key];
const gradeCapture = (key) => gradePathResponse({
  privateGrading: buildPrivateToolGrading(questionFor(key)),
  raw: CAPTURED[key].rawWork,
});

// --- Every Path-eligible tool is covered, and none was quietly dropped -------

test('every tool with a server grader has a captured browser response', () => {
  const covered = new Set(Object.values(CAPTURED).map((entry) => entry.pathToolId));
  PATH_TOOL_IDS.forEach((toolId) => {
    assert.ok(
      covered.has(toolId),
      `${toolId} has no captured response — a tool with no capture is a tool whose wire format nobody has checked`,
    );
  });
});

test('each capture came from the question this file grades it against', () => {
  Object.entries(CAPTURED).forEach(([key, entry]) => {
    const question = questionFor(key);
    assert.ok(question, `${key} has no authored question`);
    assert.equal(buildPublicToolPayload(question).pathToolId, entry.pathToolId);
    assert.equal(isPathEligible(question), true, `${key} would not be issued at all`);
  });
});

// --- The verdict, on work a student who knew the answer actually produced ----

test('a correct answer from the real browser tool is graded correct', () => {
  const failures = Object.keys(CAPTURED)
    .map((key) => ({ key, result: gradeCapture(key) }))
    .filter((entry) => !entry.result.isCorrect)
    .map((entry) => ({
      tool: entry.key,
      rejected: entry.result.rejected || false,
      reason: entry.result.reason || null,
      parts: entry.result.parts,
      sent: CAPTURED[entry.key].rawWork,
    }));

  assert.deepEqual(
    failures, [],
    `the server marked real correct student work wrong:\n${JSON.stringify(failures, null, 2)}`,
  );
});

test('no capture is rejected as malformed — the server understands the wire format', () => {
  Object.keys(CAPTURED).forEach((key) => {
    const result = gradeCapture(key);
    assert.notEqual(result.rejected, true, `${key} sent a shape the server calls malformed`);
    assert.equal(result.score, 1, `${key} scored ${result.score} on fully correct work`);
  });
});

// --- The specific bug, on the specific shape that caused it ------------------

test('the number line sends min/max, and the server reads min/max', () => {
  // The literal captured object, spelled out here so the mismatch is visible in
  // the test rather than hidden behind a JSON file.
  assert.deepEqual(CAPTURED.intervalNumberLine.rawWork.intervals, [
    { min: -3, max: 5, minClosed: true, maxClosed: false },
  ]);
  assert.equal(CAPTURED.intervalNumberLine.rawWork.notation, '[-3, 5)');

  // And the shape the old server expected is NOT what the browser sends.
  const sent = CAPTURED.intervalNumberLine.rawWork.intervals[0];
  assert.equal(sent.start, undefined, 'nothing in the browser ever called it "start"');
  assert.equal(sent.startClosed, undefined);
});

test('a ray reaches the server as null, because JSON has no Infinity', () => {
  const sent = CAPTURED.intervalNumberLineRays.rawWork.intervals;
  assert.equal(sent[0].max, null, 'the browser drew a ray to +∞ and JSON flattened it to null');
  assert.equal(sent[1].min, null);
  // Read as 0 rather than as unbounded, this would mark every ray wrong.
  const normalized = normalizePathIntervals(sent);
  assert.equal(normalized[0].min, Number.NEGATIVE_INFINITY);
  assert.equal(normalized[1].max, Number.POSITIVE_INFINITY);
});

test('a union is the same answer whichever piece the student drew first', () => {
  const drawn = CAPTURED.intervalNumberLineRays.rawWork.intervals;
  assert.equal(drawn[0].min, 2, 'this student drew the right-hand ray first');
  assert.equal(gradeCapture('intervalNumberLineRays').isCorrect, true);
  // Reversed, it is still the same set.
  assert.equal(samePathIntervals([...drawn].reverse(), drawn), true);
});

test('both endpoint vocabularies still grade, so older content keeps working', () => {
  const legacy = {
    ...PATH_TOOL_QUESTIONS.intervalNumberLine,
    ask: ['graph', 'notation'],
    intervals: undefined,
    expectedIntervals: [{ start: -3, end: 5, startClosed: true, endClosed: false }],
  };
  const result = gradePathResponse({
    privateGrading: buildPrivateToolGrading(legacy),
    // The browser has not changed: it still sends min/max.
    raw: CAPTURED.intervalNumberLine.rawWork,
  });
  assert.equal(result.isCorrect, true, JSON.stringify(result.parts));
});

// --- The two copies of the interval rules must agree -------------------------

test('the server interval maths agrees with the tool the student used', () => {
  // The server cannot import the client bundle, so the rules exist twice. That
  // is only safe while something checks they still say the same thing.
  const cases = [
    [[{ min: -3, max: 5, minClosed: true, maxClosed: false }], '[-3, 5)', true],
    [[{ min: -3, max: 5, minClosed: true, maxClosed: false }], '(-3, 5)', false],
    [[{ min: null, max: -3, maxClosed: true }, { min: 2, max: null }], '(-∞, -3] U (2, ∞)', true],
    [[{ min: null, max: -3, maxClosed: true }, { min: 2, max: null }], '(-inf, -3] U [2, inf)', false],
    [[{ min: 0, max: 0, minClosed: true, maxClosed: true }], '[0, 0]', true],
  ];
  cases.forEach(([intervals, notation, expected]) => {
    assert.equal(notationMatches(notation, intervals), expected, `client disagreed on ${notation}`);
    assert.equal(pathIntervalNotationMatches(notation, intervals), expected, `server disagreed on ${notation}`);
  });
});

test('interval notation typed into a math field still grades', () => {
  // The notation box became a MathLive field, so a student's answer arrives as
  // LaTeX rather than as the unicode they appear to be typing. Every form below
  // is the same interval, and the graph beside it was already correct — marking
  // the notation wrong here fails a student who did nothing wrong.
  const expected = [
    { min: null, max: -3, minClosed: false, maxClosed: true },
    { min: 2, max: null, minClosed: false, maxClosed: false },
  ];
  const sameAnswer = [
    '(-\\infty, -3] \\cup (2, \\infty)',
    '\\left(-\\infty, -3\\right] \\cup \\left(2, \\infty\\right)',
    '(-\\infty,-3]\\cup(2,\\infty)',
    '(-∞, -3] ∪ (2, ∞)',
    '(-inf, -3] U (2, inf)',
  ];
  sameAnswer.forEach((notation) => {
    assert.equal(pathIntervalNotationMatches(notation, expected), true, `server rejected ${notation}`);
    assert.equal(notationMatches(notation, expected), true, `the tool rejected ${notation}`);
  });

  // And a genuinely different interval is still wrong in both.
  const wrong = '(-\\infty, -3) \\cup (2, \\infty)';
  assert.equal(pathIntervalNotationMatches(wrong, expected), false);
  assert.equal(notationMatches(wrong, expected), false);
});

test('the server and the tool normalize intervals identically', () => {
  const shapes = [
    [{ min: null, max: 4, maxClosed: true }],
    [{ min: 2, max: null, minClosed: true }],
    [{ min: 5, max: 1 }],
    [{ min: 3, max: 3, minClosed: true, maxClosed: true }],
    [{ min: 2, max: 4 }, { min: -1, max: 0 }],
  ];
  shapes.forEach((shape) => {
    assert.deepEqual(normalizePathIntervals(shape), normalizeIntervals(shape));
    assert.equal(samePathIntervals(shape, shape), sameIntervals(shape, shape));
  });
});

test('the server reads the same symbols the student typed', () => {
  // The math input hands back LaTeX; the answer key is written in unicode.
  // Every pair below is one answer written two ways, and the server has to see
  // them as one — the tool always did.
  const sameThing = [
    ['(-\\infty, \\infty)', '(-∞, ∞)'],
    ['[-3, 5) \\cup (7, \\infty)', '[-3, 5) ∪ (7, ∞)'],
    ['x \\le 4', 'x ≤ 4'],
    ['x \\ge -2', 'x ≥ -2'],
    ['x \\neq 0', 'x ≠ 0'],
  ];
  sameThing.forEach(([latex, unicode]) => {
    assert.equal(normalizeAnswer(latex), normalizeAnswer(unicode), `${latex} vs ${unicode}`);
    // And the tool's own comparison agrees, which is the point.
    assert.equal(setAnswerMatches(latex, [unicode]), true);
  });
  // Different answers stay different.
  assert.notEqual(normalizeAnswer('x \\le 4'), normalizeAnswer('x < 4'));
});

// --- The analysis-kind allowlist must not drift from the tool's own ----------

test('the contract knows exactly the analysis kinds the workspace renders', () => {
  assert.deepEqual([...PATH_ANALYSIS_NOTATION_KINDS], [...NOTATION_ANALYSIS_KINDS]);
  assert.deepEqual([...PATH_ANALYSIS_POINT_FEATURES], [...POINT_FEATURES]);
});

test('an analysis kind the workspace cannot render makes the question ineligible', () => {
  // An unrecognised kind does not fail loudly in the tool — it silently becomes
  // a click-a-point task. The server would then grade a typed answer the
  // student was never given a box for.
  const unrenderable = {
    ...PATH_TOOL_QUESTIONS.functionInvestigation,
    analysisParts: [{ id: 'slope', kind: 'text', acceptedAnswers: ['2'] }],
  };
  assert.equal(isPathEligible(unrenderable), false);
  assert.equal(buildPublicToolPayload(unrenderable), null, 'null means do not issue');
});

test('the analysis stage reaches the tool under the name the tool reads', () => {
  const payload = buildPublicToolPayload(PATH_TOOL_QUESTIONS.functionInvestigation);
  assert.ok(payload.tool.analysisRequests, 'the workspace only ever reads analysisRequests');
  assert.equal(payload.tool.analysisParts, undefined);
  assert.equal(payload.tool.analysisRequests[0].acceptedAnswers, undefined, 'and never the answer');
  // The capture proves the student was actually shown it and could answer.
  assert.equal(CAPTURED.functionInvestigation.rawWork.answers.domain, '(-\\infty, \\infty)');
});

// --- The workspace must be able to build itself from the payload -------------

test('a step-algebra question with no readable equation is not issued', () => {
  // The balance cannot be built without one, and a question the tool cannot
  // render reached students as an error card rather than as mathematics.
  const noEquation = { ...PATH_TOOL_QUESTIONS.stepAlgebra, equationLatex: undefined };
  assert.equal(isPathEligible(noEquation), false);
  assert.equal(isPathEligible(PATH_TOOL_QUESTIONS.stepAlgebra), true, 'equationLatex alone is enough');
});

// --- Forged verdicts, on the real shapes ------------------------------------

test('a forged verdict changes nothing on work the server has already judged', () => {
  Object.keys(CAPTURED).forEach((key) => {
    const result = gradePathResponse({
      privateGrading: buildPrivateToolGrading(questionFor(key)),
      raw: { ...CAPTURED[key].rawWork, isCorrect: true, score: 1, grading: { isCorrect: true } },
    });
    assert.deepEqual(result.parts, gradeCapture(key).parts, `${key} read the client's opinion`);
  });
});

// A grader that reads nothing passes everything, and would sail through the
// tests above. So each capture is also broken in the one way that matters for
// that tool, in its own real shape, and must come back wrong.
const SPOILED = {
  algebra: (work) => ({ ...work, value: '5' }),
  system: (work) => ({ ...work, x: 2 }),
  multiAnswer: (work) => ({ ...work, responses: { ...work.responses, intercept: '9' } }),
  relationMapping: (work) => ({ ...work, isFunction: 'no' }),
  // A closed endpoint where the answer is open: the same numbers, a different
  // interval. Nothing but reading `maxClosed` can tell these apart.
  intervalNumberLine: (work) => ({
    ...work,
    intervals: [{ ...work.intervals[0], maxClosed: true }],
    notation: '[-3, 5]',
  }),
  // A ray that stops at the edge of the visible number line instead of running
  // to infinity — the exact confusion that makes a viewport look like an answer.
  intervalNumberLineRays: (work) => ({
    ...work,
    intervals: [{ ...work.intervals[0], max: 8 }, work.intervals[1]],
    notation: '(-∞, -3] U (2, 8)',
  }),
  dataModelingLab: (work) => ({ ...work, r: 0 }),
  systemsWorkspace: (work) => ({ ...work, classification: 'none' }),
  dataModelingLab: (work) => ({ ...work, r: 0.25 }),
  graphing2: (work) => ({
    ...work,
    points: [[0, 1], [2, 6]],
    studentLine: { kind: 'slopeIntercept', m: 2.5, b: 1 },
  }),
  stepAlgebra: (work) => ({ ...work, finalEquation: ' x = 9' }),
  functionInvestigation: (work) => ({ ...work, placements: { ...work.placements, p2: [2, 9] } }),
};

test('work that is wrong in the tool is wrong on the server too', () => {
  Object.entries(SPOILED).forEach(([key, spoil]) => {
    const result = gradePathResponse({
      privateGrading: buildPrivateToolGrading(questionFor(key)),
      raw: spoil(CAPTURED[key].rawWork),
    });
    assert.equal(result.isCorrect, false, `${key} accepted a wrong answer: ${JSON.stringify(result.parts)}`);
  });
});

test('every captured tool has a wrong-answer case, so none passes by not being read', () => {
  Object.keys(CAPTURED).forEach((key) => {
    assert.ok(SPOILED[key], `${key} is only ever tested with a correct answer`);
  });
});
