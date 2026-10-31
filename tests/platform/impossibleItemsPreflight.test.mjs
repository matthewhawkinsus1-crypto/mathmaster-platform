// PRE-FLIGHT ADVICE ON QUESTIONS THAT CANNOT HAVE THE ANSWER THEY LOOK LIKE
// THEY ASK FOR (TT04; audit findings A1-61 and C2-134).
//
// Three authoring slips used to reach students without a word to the teacher:
//
//   a 2×2 system with no variable   `0 = 5`, `0 = 3` is graded correctly (a
//                                   653c4a) but authoring could warn;
//   a 3×3 system with a variable    validateAlgebraicSystemAuthoring returned a
//   in none of its equations        warning that import, Pre-Flight and publish
//                                   never read (C2-134), and the owner chose to
//                                   show it to teachers;
//   a vertex or center the          a graph-analysis question that names no
//   function lacks                  feature asks for the vertex of an
//                                   exponential, which has none, so the key is
//                                   "Does not exist" (GR18).
//
// The owner's "show teachers" is met as ADVICE, in its own Pre-Flight panel: a
// warning in the readiness diagnostics would make the assignment "Needs Review",
// an unpublished draft students never see (assignmentAuthoringState.js), and
// would hide a deliberate dependent system's lesson from its class.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAlgebraicSystemAuthoring } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { auditAssignmentImpossibleItems } from '../../src/platform/preflight/impossibleItemsPreflight.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { AUTHORING_STATES } from '../../src/platform/preflight/authoringStates.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const system = (equations, extra = {}) => ({ type: 'systemsWorkspace', mode: 'algebraic', equations, ...extra });
const threeBy = (equations, extra = {}) => system(equations, { method: 'elimination', variables: ['x', 'y', 'z'], ...extra });

test('a 2×2 system is noted when an equation has no variable, or a variable is in neither equation', () => {
  const warnings = (equations) => validateAlgebraicSystemAuthoring(system(equations)).warnings;
  assert.deepEqual(warnings(['0 = 5', '0 = 3']), [
    'systemsWorkspace 2×2 algebraic system: equations 1 and 2 have no variable in them, so they are always true or never true and the system cannot have exactly one solution. Check this is the system you meant.',
  ]);
  assert.match(warnings(['0 = 5', 'x + y = 3'])[0], /equation 1 has no variable in it, so it is always true or never true/);
  assert.match(warnings(['3 = 3', 'x + y = 3'])[0], /equation 1 has no variable in it/);
  assert.match(warnings(['x + y = 3', '0 = 0'])[0], /equation 2 has no variable in it/);
  assert.deepEqual(warnings(['x = 3', '2x = 6']), [
    'systemsWorkspace 2×2 algebraic system: y has a zero coefficient in both equations, so it is never determined and the system has no solution or infinitely many. Check this is the system you meant.',
  ]);
  // An ordinary pair, a pair of parallel lines and a pair whose rows each hold
  // one variable say nothing: each has a variable in every equation and in the pair.
  assert.deepEqual(warnings(['x + y = 5', 'x - y = 1']), []);
  assert.deepEqual(warnings(['y = 2x + 1', 'y = 2x + 5']), []);
  assert.deepEqual(warnings(['x = 3', 'y = -2']), []);
  // A warning, never an error: a saved assignment that works stays valid.
  assert.deepEqual(validateAlgebraicSystemAuthoring(system(['0 = 5', '0 = 3'])).errors, []);
});

test('a 3×3 system keeps the note it always had, word for word', () => {
  const { warnings, errors } = validateAlgebraicSystemAuthoring(threeBy(['x + y = 3', 'x - y = 1', '2x + y = 4']));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    'systemsWorkspace 3×3 algebraic system: z has a zero coefficient in all three equations, so it is never determined and the system has no solution or infinitely many. Students can classify it by elimination; check this is the system you meant.',
  ]);
  assert.deepEqual(validateAlgebraicSystemAuthoring(threeBy(['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'])).warnings, []);
});

const SPECS = {
  quadratic: { type: 'quadratic', a: 1, h: 2, k: -3 },
  absolute: { type: 'absolute', a: -1, h: 1, k: 4 },
  rational: { type: 'rational', a: 2, h: 1, k: 2 },
  cubic: { type: 'cubic', a: 1, h: -1, k: 2 },
  exponential: { type: 'exponential', a: 1, base: 2, h: 0, k: 1 },
  logarithmic: { type: 'logarithmic', a: 1, base: 2, h: 0, k: 1 },
  linear: { type: 'linear', a: 2, h: 0, k: 1 },
};
const analysis = (spec, analysisRequests, extra = {}) => ({ type: 'graphAnalysis', prompt: 'Use the graph.', functionSpec: spec, ...(analysisRequests ? { analysisRequests } : {}), ...extra });
const ask = (feature, extra = {}) => ({ id: feature, kind: 'point', feature, ...extra });

test('a vertex or center the function lacks is noted; one it has is not', () => {
  const audit = (...questions) => auditAssignmentImpossibleItems(questions).warnings;

  // Written: the vertex of an exponential, a logarithm, a line.
  for (const name of ['exponential', 'logarithmic', 'linear']) {
    assert.deepEqual(audit(analysis(SPECS[name], [ask('vertex')])), [
      `Question 1 asks for the vertex of ${name === 'exponential' ? 'an' : 'a'} ${SPECS[name].type} function, which has none, so the key is "Does not exist". If you meant that, nothing needs to change; if not, ask for a point the function does have.`,
    ], name);
  }
  // A center of a parabola, a vertex of a rational.
  assert.match(audit(analysis(SPECS.quadratic, [ask('center')]))[0], /asks for the center of a quadratic function, which has none/);
  assert.match(audit(analysis(SPECS.rational, [ask('vertex')]))[0], /asks for the vertex of a rational function, which has none/);
  // A spec with no type reads "this function".
  assert.match(audit(analysis({ a: 1, h: 0, k: 0 }, [ask('vertex')]))[0], /^Question 1 asks for the vertex of this function, which has none/);
  // A request kind the workspace does not know is read as the function's own point.
  assert.match(audit(analysis(SPECS.linear, [{ id: 'k', kind: 'keyPoint' }]))[0], /^Question 1 asks for the vertex of a linear function/);
  assert.deepEqual(audit(analysis(SPECS.cubic, [{ id: 'k', kind: 'keyPoint' }])), [], 'a cubic\'s own point is its center, which it has');

  // Not written: no feature named asks for the function's own, which an
  // exponential lacks.
  assert.deepEqual(audit(analysis(SPECS.exponential, null)), [
    'Question 1 names no feature to find, so it asks for the vertex of an exponential function, which has none, and the key is "Does not exist". Add analysisRequests for the features you mean.',
  ]);

  // The function has it: nothing to say.
  assert.deepEqual(audit(analysis(SPECS.quadratic, [ask('vertex')]), analysis(SPECS.absolute, [ask('vertex')]), analysis(SPECS.rational, [ask('center')]), analysis(SPECS.cubic, [ask('center')])), []);
  assert.deepEqual(audit(analysis(SPECS.quadratic, null), analysis(SPECS.rational, null), analysis(SPECS.cubic, null)), [], 'the default is the function\'s own point');
  // Other requests say nothing about vertex or center.
  assert.deepEqual(audit(analysis(SPECS.exponential, [{ id: 'd', kind: 'domain', notation: 'interval' }, ask('yIntercept'), ask('xIntercepts')])), []);
  // The author wrote the key themselves: their call.
  assert.deepEqual(audit(analysis(SPECS.exponential, [ask('vertex', { expected: [] })])), []);
  assert.deepEqual(audit(analysis(SPECS.exponential, [ask('vertex', { expected: [[0, 1]] })])), []);
  // Only the request that asks, by its place.
  const third = audit(
    analysis(SPECS.quadratic, [ask('vertex')]),
    { type: 'multipleChoice', prompt: 'Which?', options: ['a', 'b'], answer: 'a' },
    analysis(SPECS.linear, [{ id: 'd', kind: 'domain', notation: 'interval' }, ask('vertex')]),
  );
  assert.equal(third.length, 1);
  assert.match(third[0], /^Question 3 asks for the vertex of a linear function/);
  // A graph a student builds first (functionGraph) reaches the same Analyze stage.
  assert.match(audit({ type: 'functionGraph', prompt: 'Graph it.', functionSpec: SPECS.exponential, analysisRequests: [ask('vertex')] })[0], /^Question 1 asks for the vertex of an exponential function/);
});

test('the system notes carry the question number, and a retired question is left out unless asked for', () => {
  const questions = [
    system(['x + y = 5', 'x - y = 1']),
    system(['0 = 5', '0 = 3']),
    { type: 'systemsWorkspace', mode: 'linear', system: { m1: 2, b1: 1, m2: -1, b2: 7 } },
    threeBy(['x + y = 3', 'x - y = 1', '2x + y = 4']),
    { ...system(['0 = 5', '0 = 3']), teacherExcluded: true },
    { type: 'multipleChoice', prompt: 'Which?', options: ['a', 'b'], answer: 'a' },
    null,
  ];
  const { warnings } = auditAssignmentImpossibleItems(questions);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /^Question 2: systemsWorkspace 2×2 algebraic system: equations 1 and 2 have no variable/);
  assert.match(warnings[1], /^Question 4: systemsWorkspace 3×3 algebraic system: z has a zero coefficient/);
  // Judged on what students are given only; asked for, a retired one is listed too.
  assert.equal(auditAssignmentImpossibleItems(questions, { deliveredOnly: false }).warnings.length, 3);
  // Graph-mode systems are not algebraic; an odd list never throws.
  assert.deepEqual(auditAssignmentImpossibleItems().warnings, []);
  assert.deepEqual(auditAssignmentImpossibleItems('nope').warnings, []);
});

const assignmentWith = (questions) => ({
  schemaVersion: 5,
  assignment: { title: 'Advice', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'practice' },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: questions.map((question) => ({ dok: 2, ...question, alignments: [{ framework: 'teks', code: 'A.2I', role: 'primary', evidenceLevel: 'assessed' }] })),
  }],
});

test('Pre-Flight carries the advice in its own group: never a readiness warning, never a block', () => {
  const flaggedSystem = system(['0 = 5', '0 = 3'], { studentActions: ['solveSystem'], variables: ['x', 'y'], method: 'studentChoice', prompt: 'Solve the system.' });
  const plainSystem = { ...flaggedSystem, equations: ['x + y = 5', 'x - y = 1'] };
  const flagged = buildAssignmentV5PreflightModel(assignmentWith([flaggedSystem]));
  const plain = buildAssignmentV5PreflightModel(assignmentWith([plainSystem]));
  assert.equal(flagged.impossibleItems.warnings.length, 1);
  assert.match(flagged.impossibleItems.warnings[0], /^Question 1: systemsWorkspace 2×2 algebraic system: equations 1 and 2 have no variable/);
  assert.deepEqual(plain.impossibleItems.warnings, []);
  // The readiness the advice must not change: the same findings with the system
  // fixed, and no "Needs Review" from the advice alone.
  assert.ok(!flagged.warnings.some((warning) => /always true or never true/.test(warning)));
  assert.ok(!flagged.errors.some((error) => /always true or never true/.test(error)));
  assert.deepEqual(flagged.errors, plain.errors);
  assert.deepEqual(flagged.warnings, plain.warnings);
  // The control is clean, so "ready" below is the advice changing nothing: a
  // warning diagnostic would have made it needsReview (a draft students never see).
  assert.equal(plain.authoringState, AUTHORING_STATES.READY);
  assert.equal(flagged.authoringState, AUTHORING_STATES.READY);
  assert.equal(flagged.isValid, plain.isValid);
  assert.ok(!flagged.diagnostics.some((entry) => /always true or never true/.test(JSON.stringify(entry))));

  // The graph note travels the same way.
  const graph = buildAssignmentV5PreflightModel(assignmentWith([{ ...analysis(SPECS.exponential, [ask('vertex')]), studentActions: ['analyzeFunction'] }]));
  assert.equal(graph.impossibleItems.warnings.length, 1);
  assert.match(graph.impossibleItems.warnings[0], /asks for the vertex of an exponential function/);
  assert.ok(!graph.warnings.some((warning) => /Does not exist/.test(warning)));
});

test('the Pre-Flight screen shows the advice in its own panel, saying it does not stop publishing', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.impossibleItems?.warnings?.length > 0 && (', '\n      )}', 'the questions-to-double-check panel');
  assert.match(panel, />Questions to double-check</);
  assert.match(panel, /preflightModel\.impossibleItems\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
  // And it is not one of the groups that decide readiness.
  const model = executableSource(componentSource('src/platform/preflight/assignmentV5PreflightModel.js'));
  const groups = region(model, 'const diagnosticGroups = [', '  ];', 'diagnostic groups');
  assert.doesNotMatch(groups, /impossibleItems/);
});
