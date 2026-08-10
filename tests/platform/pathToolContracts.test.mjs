import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_TOOL_IDS, buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse,
  isPathEligible, resolvePathToolId,
} from '../../functions/shared/pathToolContracts.mjs';

// Authored questions, each carrying its answer the way the authoring contract
// actually stores it.
const QUESTIONS = {
  algebra: {
    type: 'algebra',
    prompt: 'Solve for x.',
    equationLatex: '2x + 5 = 13',
    variable: 'x',
    answer: '4',
    acceptedAnswers: ['4.0'],
  },
  system: {
    type: 'system',
    prompt: 'Solve the system.',
    equationsLatex: ['y = 2x + 1', 'y = -x + 4'],
    graph: { xMin: -5, xMax: 5 },
    answer: '(1, 3)',
    classification: 'one solution',
  },
  relationMapping: {
    type: 'relationMapping',
    prompt: 'Build the mapping diagram.',
    pairs: [[-2, 3], [1, 2], [3, -1]],
    ask: ['mapping', 'domain', 'range', 'isFunction'],
    domainLabel: 'x',
  },
  intervalNumberLine: {
    type: 'intervalNumberLine',
    prompt: 'Graph the solution.',
    min: -10,
    max: 10,
    step: 1,
    ask: ['graph', 'notation'],
    expectedIntervals: [{ start: -4, end: 2, startClosed: true, endClosed: false }],
    expectedNotation: '[-4, 2)',
  },
  multiAnswer: {
    type: 'multiAnswer',
    prompt: 'Analyse the function.',
    answerFields: [
      { id: 'slope', label: 'Slope', expected: '3' },
      { id: 'intercept', label: 'y-intercept', expected: '-2' },
    ],
  },
  systemsWorkspace: {
    type: 'systemsWorkspace',
    prompt: 'Solve and classify the system.',
    mode: 'linear',
    // The two lines are the question. Where they meet is arithmetic, and the
    // server does it again for itself.
    system: { m1: 2, b1: 1, m2: -1, b2: 7 },
  },
  stepAlgebra: {
    type: 'stepAlgebra',
    prompt: 'Solve on the balance workspace.',
    equationLatex: '3x - 6 = 9',
    variable: 'x',
    answer: '5',
  },
  functionInvestigation: {
    type: 'functionInvestigation',
    prompt: 'Graph the function, then describe it.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    pointTasks: [
      { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
      { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
    ],
    endpointRequirements: [{ id: 'endpoint-left', point: [-5, -9], vector: [-1, -2], marker: 'arrow' }],
    analysisParts: [
      { id: 'slope', label: 'Slope', kind: 'text', acceptedAnswers: ['2'] },
    ],
  },
};

// Every string that must never reach a browser, per question.
const SECRETS = {
  algebra: ['"4"', 'acceptedAnswers'],
  system: ['(1, 3)', 'one solution'],
  relationMapping: [],
  intervalNumberLine: ['[-4, 2)'],
  multiAnswer: ['"3"', '"-2"'],
  systemsWorkspace: [],
  stepAlgebra: ['"5"'],
  // The y-values of the plotted points, and the end-behaviour symbol.
  functionInvestigation: ['[0,1]', '[2,5]', 'arrow'],
};

// --- The allowlist actually holds --------------------------------------------

test('every declared tool is eligible and grades', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    assert.ok(QUESTIONS[toolId], `this test file must cover ${toolId}`);
    assert.equal(isPathEligible(QUESTIONS[toolId]), true, `${toolId} must be path-eligible`);
  });
});

// Any key whose presence would mean the answer travelled. Checked as KEYS,
// walking the object — a substring scan would trip over the word "solution"
// in a perfectly legitimate prompt.
const FORBIDDEN_KEYS = [
  'answer', 'answers', 'acceptedAnswers', 'expected', 'expectedIntervals',
  'expectedNotation', 'expectedInequality', 'solution', 'solutions', 'grading',
  'privateGrading', 'classification', 'correct', 'isCorrect', 'key',
];

const collectKeys = (value, found = new Set()) => {
  if (Array.isArray(value)) { value.forEach((entry) => collectKeys(entry, found)); return found; }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => { found.add(key); collectKeys(entry, found); });
  }
  return found;
};

test('no answer key survives into the public payload', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    const payload = buildPublicToolPayload(QUESTIONS[toolId]);
    const keys = collectKeys(payload);
    FORBIDDEN_KEYS.forEach((forbidden) => {
      assert.ok(!keys.has(forbidden), `${toolId} payload carries a "${forbidden}" field`);
    });
    // And the actual secret values, wherever they might have been copied to.
    const serialized = JSON.stringify(payload);
    SECRETS[toolId].forEach((secret) => {
      assert.ok(!serialized.includes(secret), `${toolId} payload leaked ${secret}: ${serialized}`);
    });
  });
});

test('a question that hides its answer in an unexpected field still cannot leak it', () => {
  // The allowlist is what makes this true: a field nobody anticipated is not
  // copied, because only named fields are.
  const sneaky = { ...QUESTIONS.algebra, teacherNotes: 'x = 4', solutionSteps: ['x = 4'], hiddenTarget: 4 };
  const keys = collectKeys(buildPublicToolPayload(sneaky));
  ['teacherNotes', 'solutionSteps', 'hiddenTarget'].forEach((field) => {
    assert.ok(!keys.has(field), `an unanticipated field ${field} reached the browser`);
  });
});

test('the public payload still describes the tool well enough to render it', () => {
  const algebra = buildPublicToolPayload(QUESTIONS.algebra);
  assert.equal(algebra.pathToolId, 'algebra');
  assert.equal(algebra.tool.equationLatex, '2x + 5 = 13');

  const system = buildPublicToolPayload(QUESTIONS.system);
  assert.deepEqual(system.tool.equationsLatex, ['y = 2x + 1', 'y = -x + 4']);
  assert.ok(system.tool.graph, 'the graph window is student-visible configuration');

  const relation = buildPublicToolPayload(QUESTIONS.relationMapping);
  assert.equal(relation.tool.pairs.length, 3, 'the relation IS the question here');

  const line = buildPublicToolPayload(QUESTIONS.intervalNumberLine);
  assert.equal(line.tool.min, -10);
  assert.equal(line.tool.max, 10);

  const multi = buildPublicToolPayload(QUESTIONS.multiAnswer);
  assert.equal(multi.tool.answerFields.length, 2);
  assert.equal(multi.tool.answerFields[0].label, 'Slope');
  assert.equal(multi.tool.answerFields[0].expected, undefined, 'a part may carry its prompt, never its answer');

  // The Systems Workspace draws itself from the two lines, and needs nothing else.
  const workspace = buildPublicToolPayload(QUESTIONS.systemsWorkspace);
  assert.deepEqual(workspace.tool.system, { m1: 2, b1: 1, m2: -1, b2: 7 });

  const step = buildPublicToolPayload(QUESTIONS.stepAlgebra);
  assert.equal(step.tool.equationLatex, '3x - 6 = 9');
  assert.equal(step.tool.variable, 'x');

  // The graphing workspace is handed the function — the student is asked to
  // draw it — but not the y-values, and not which end symbol is right.
  const graph = buildPublicToolPayload(QUESTIONS.functionInvestigation);
  assert.deepEqual(graph.tool.functionSpec, { type: 'linear', m: 2, b: 1 });
  assert.equal(graph.tool.pointTasks.length, 2);
  assert.equal(graph.tool.pointTasks[0].x, 0, 'which x to plot is the task');
  assert.equal(graph.tool.pointTasks[0].expected, undefined, 'the y is the answer');
  assert.equal(graph.tool.endpointRequirements[0].marker, undefined, 'which symbol belongs there is the answer');
  assert.ok(graph.tool.endpointRequirements[0].point, 'where the graph ends is student-visible');
  assert.equal(graph.tool.analysisParts[0].acceptedAnswers, undefined);
});

test('the allowlist is per tool, because one field list cannot be safe for all', () => {
  // `pairs` is the question for a mapping diagram...
  const relation = buildPublicToolPayload(QUESTIONS.relationMapping);
  assert.ok(relation.tool.pairs);
  // ...and nothing else picks it up just because it exists.
  const smuggled = buildPublicToolPayload({ ...QUESTIONS.algebra, pairs: [[1, 4]] });
  assert.equal(smuggled.tool.pairs, undefined, 'algebra has no business exposing plotted pairs');
});

// --- Fail closed ---------------------------------------------------------------

test('a tool with no contract is not eligible, and is never downgraded', () => {
  const unsupported = { type: 'transformationsLab', prompt: 'Describe the transformation.', answer: 'shift up 3' };
  assert.equal(resolvePathToolId(unsupported), null);
  assert.equal(isPathEligible(unsupported), false);
  assert.equal(buildPublicToolPayload(unsupported), null, 'null means do not issue, not issue as text');
});

test('a supported tool with no gradable answer is not eligible either', () => {
  assert.equal(isPathEligible({ type: 'algebra', prompt: 'Solve.', equationLatex: 'x = 1' }), false);
  assert.equal(isPathEligible({ type: 'multiAnswer', parts: [{ id: 'a', label: 'A' }] }), false);
});

test('grading refuses when there is no server grader', () => {
  const result = gradePathResponse({ privateGrading: { pathToolId: 'transformationsLab' }, raw: { value: 'anything' } });
  assert.equal(result.isCorrect, false);
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'no_server_grader_for_this_tool');
});

// --- The graders ---------------------------------------------------------------

const grade = (toolId, raw) => gradePathResponse({
  privateGrading: buildPrivateToolGrading(QUESTIONS[toolId]),
  raw,
});

test('algebra: the server checks the value', () => {
  assert.equal(grade('algebra', { value: '4' }).isCorrect, true);
  assert.equal(grade('algebra', { value: '4.0' }).isCorrect, true, 'accepted forms count');
  assert.equal(grade('algebra', { value: '5' }).isCorrect, false);
});

test('systems: the intersection and the classification are both checked', () => {
  assert.equal(grade('system', { x: 1, y: 3, classification: 'one solution' }).isCorrect, true);
  assert.equal(grade('system', { value: '(1,3)', classification: 'one solution' }).isCorrect, true);
  assert.equal(grade('system', { x: 2, y: 3, classification: 'one solution' }).isCorrect, false);
  assert.equal(grade('system', { x: 1, y: 3, classification: 'no solution' }).isCorrect, false);
});

test('relations: arrows, sets and functionhood, each on its own', () => {
  const right = { arrows: [[1, 2], [-2, 3], [3, -1]], domain: [-2, 1, 3], range: [3, 2, -1], isFunction: 'yes' };
  const result = grade('relationMapping', right);
  assert.equal(result.isCorrect, true, JSON.stringify(result.parts));
  assert.equal(grade('relationMapping', { ...right, domain: [-2, 1] }).isCorrect, false);
  assert.equal(grade('relationMapping', { ...right, isFunction: 'no' }).isCorrect, false);
  // Order is not mathematics.
  assert.equal(grade('relationMapping', { ...right, range: [-1, 2, 3] }).isCorrect, true);
});

test('number line: the graph and the notation must agree with the key', () => {
  const right = { intervals: [{ start: -4, end: 2, startClosed: true, endClosed: false }], notation: '[-4, 2)' };
  assert.equal(grade('intervalNumberLine', right).isCorrect, true);
  // An endpoint that should be open but was closed is a different answer.
  assert.equal(grade('intervalNumberLine', {
    ...right,
    intervals: [{ start: -4, end: 2, startClosed: true, endClosed: true }],
  }).isCorrect, false);
});

test('systems workspace: the server redoes the solve rather than trusting the tool', () => {
  assert.equal(grade('systemsWorkspace', { x: 2, y: 5, classification: 'one' }).isCorrect, true);
  assert.equal(grade('systemsWorkspace', { x: 2, y: 5, classification: 'none' }).isCorrect, false);
  assert.equal(grade('systemsWorkspace', { x: 3, y: 5, classification: 'one' }).isCorrect, false);
});

test('step algebra: the equation the student finished on is the answer', () => {
  assert.equal(grade('stepAlgebra', { finalEquation: 'x = 5' }).isCorrect, true);
  assert.equal(grade('stepAlgebra', { finalEquation: '5 = x' }).isCorrect, true, 'either side counts');
  assert.equal(grade('stepAlgebra', { finalEquation: 'x = 3' }).isCorrect, false);
  // Left mid-solve.
  assert.equal(grade('stepAlgebra', { finalEquation: '3x = 15' }).isCorrect, false);
});

test('step algebra: a question needing symbolic marking is not eligible at all', () => {
  const symbolic = {
    ...QUESTIONS.stepAlgebra,
    algebraPrompts: [{ id: 'expand', prompt: 'Expand 2(x+1).', acceptedExpressions: ['2x+2'] }],
  };
  assert.equal(isPathEligible(symbolic), false, 'the server has no CAS, so it must not mark expressions');
  assert.equal(buildPublicToolPayload(symbolic), null);
});

test('graphing: points, end behaviour and analysis are each marked, and partial credit is real', () => {
  const right = {
    placements: { p1: [0, 1], p2: [2, 5] },
    markerPlacements: { 'endpoint-left': { marker: 'arrow' } },
    answers: { slope: '2' },
  };
  const all = grade('functionInvestigation', right);
  assert.equal(all.isCorrect, true, JSON.stringify(all.parts));

  const onePointOff = grade('functionInvestigation', { ...right, placements: { p1: [0, 1], p2: [2, 9] } });
  assert.equal(onePointOff.isCorrect, false);
  assert.equal(onePointOff.score, 0.75, 'three of the four parts still count');

  // The curve is a construction aid, not a graded part, so claiming it was
  // snapped changes nothing.
  const claimsSnapped = grade('functionInvestigation', { ...right, snapped: true, placements: { p1: [9, 9], p2: [9, 9] } });
  assert.equal(claimsSnapped.isCorrect, false);
});

test('multi-part: every part is marked, and partial credit is real', () => {
  const both = grade('multiAnswer', { responses: { slope: '3', intercept: '-2' } });
  assert.equal(both.isCorrect, true);
  assert.equal(both.score, 1);

  const half = grade('multiAnswer', { responses: { slope: '3', intercept: '9' } });
  assert.equal(half.isCorrect, false, 'the question is right only when every part is');
  assert.equal(half.score, 0.5);
  assert.deepEqual(half.parts.map((part) => part.isCorrect), [true, false]);
});

// --- Adversarial ----------------------------------------------------------------

test('a forged isCorrect cannot change the verdict', () => {
  PATH_TOOL_IDS.forEach((toolId) => {
    const forged = {
      // Every shape of lie a client could tell.
      isCorrect: true,
      correct: true,
      score: 1,
      grading: { isCorrect: true, score: 1 },
      // ...attached to work that is actually wrong.
      value: '99999',
      x: 42, y: 42,
      arrows: [[9, 9]],
      domain: [9], range: [9], isFunction: 'no',
      intervals: [{ start: 9, end: 10, startClosed: true, endClosed: true }],
      notation: 'nonsense',
      responses: { slope: '99', intercept: '99' },
      classification: 'infinite',
      finalEquation: 'x = 99999',
      placements: { p1: [9, 9], p2: [9, 9] },
      markerPlacements: { 'endpoint-left': { marker: 'open' } },
      answers: { slope: '99' },
    };
    const result = gradePathResponse({ privateGrading: buildPrivateToolGrading(QUESTIONS[toolId]), raw: forged });
    assert.equal(result.isCorrect, false, `${toolId} trusted a forged verdict`);
    assert.equal(result.score, 0, `${toolId} trusted a forged score`);
  });
});

test('a forged score cannot survive on a partially correct answer', () => {
  const result = gradePathResponse({
    privateGrading: buildPrivateToolGrading(QUESTIONS.multiAnswer),
    raw: { score: 1, isCorrect: true, responses: { slope: '3', intercept: 'wrong' } },
  });
  assert.equal(result.score, 0.5, 'the server recomputes the score rather than accepting one');
  assert.equal(result.isCorrect, false);
});

test('a response that is not student work at all is rejected, not marked wrong-but-valid', () => {
  const rejected = gradePathResponse({ privateGrading: buildPrivateToolGrading(QUESTIONS.algebra), raw: {} });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.reason, 'malformed_response');
  assert.equal(rejected.isCorrect, false);
});

test('the grader is chosen from the stored question, never from the response', () => {
  // A client claiming to be a different tool cannot pick its own grader: the
  // private definition is the server's, and it decides.
  const result = gradePathResponse({
    privateGrading: buildPrivateToolGrading(QUESTIONS.system),
    raw: { pathToolId: 'algebra', toolId: 'algebra', type: 'algebra', value: '4' },
  });
  assert.equal(result.isCorrect, false, 'graded as a system, which is what was issued');
});
