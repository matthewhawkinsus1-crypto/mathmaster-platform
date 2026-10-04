/*
 * MISCONCEPTION CLASSIFIER FIXTURES — shared by the behaviour suite
 * (misconceptionEvidence.test.mjs) and the mutation suite
 * (misconceptionClassifierMutation.test.mjs), so a mutant is judged against
 * exactly the cases the behaviour suite asserts.
 *
 * Every fixture is graded by the REAL shared grader (gradeServerResponse) on a
 * question built by the REAL platform family (or an authored tool question),
 * so a classifier is only ever handed the grading result the server would
 * hand it. `expected` is the list of codes the classifier must record — `[]`
 * where the honest answer is "no code".
 */
import { getPlatformQuestionFamily } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../../functions/shared/questionFamilyContract.mjs';
import { gradeServerResponse, gradeToolWork } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { MISCONCEPTION_FIXTURES_PHASE2 } from './misconceptionFixturesPhase2.mjs';

/** A built family instance for chosen parameters, exactly as the engine builds one. */
export const familyInstance = (familyId, params, { tool = 'multiAnswer', constraints = {} } = {}) => {
  const family = getPlatformQuestionFamily(familyId, 1);
  if (!family) throw new Error(`unknown family ${familyId}`);
  const values = Object.freeze({ ...params, ...family.derive(params) });
  const constraintValues = resolveFamilyConstraints(family, constraints).values;
  const built = family.tools[tool](values, { constraints: constraintValues, authored: {}, answer: family.answer(values, constraintValues) });
  const question = {
    questionId: `${familyId}-fixture`,
    activityRole: 'classwork',
    ...built,
    type: built.type || tool,
    familyId: family.id,
    familyVersion: family.version,
    familyInstance: Object.freeze({ familyId: family.id, familyVersion: family.version, fingerprint: `fixture:${JSON.stringify(params)}` }),
  };
  return { question, values };
};

export const fieldsResponse = (fields) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(fields).map(([id, value]) => ({ id, value: String(value), isComplete: String(value).trim() !== '' })),
});
export const systemResponse = (x, y) => ({ kind: 'scalar', type: 'system', value: `(${x}, ${y})`, fields: [] });

const familyCase = (name, familyId, params, response, expected, options = {}) => {
  const { question, values } = familyInstance(familyId, params, options);
  return { name, question, response: typeof response === 'function' ? response(values) : response, familyValues: values, expected };
};

const toolCase = (name, toolId, question, work, expected) => {
  const { toolResponse } = gradeToolWork({ toolId, question, work });
  return { name, question, response: toolResponse, familyValues: null, expected };
};

/** The server's grading of a fixture — what ingestion would hand the classifier. */
export const gradeFixture = (fixture) => gradeServerResponse({ question: fixture.question, response: fixture.response });

// slope through (1, 2) and (3, 8): rise 6, run 2, m = 3.
const SLOPE = { x1: 1, y1: 2, x2: 3, y2: 8 };
// slope through (0, 0) and (2, 2): m = 1, so its reciprocal IS the slope.
const SLOPE_ONE = { x1: 0, y1: 0, x2: 2, y2: 2 };
// 3x + 5 = 20 → x = 5.
const TWO_STEP = { x: 5, a: 3, b: 5 };
// 3x − 6 = 0 → x = 2. Here −x (−2) is ALSO the moved-constant value (0 − 6)/3.
const TWO_STEP_ZERO = { x: 2, a: 3, b: -6 };
// 4x + 3 = 2x + 11 → x = 4.
const MULTI_STEP = { x: 4, a: 4, cc: 2, b: 3 };
// Intercepts (4, 0) and (0, -2); and a line whose intercepts share a value.
const INTERCEPTS = { p: 4, q: -2 };
const INTERCEPTS_EQUAL = { p: 3, q: 3 };
// x + 2y = 7 and 3x − y = 7 → (3, 2).
const ELIMINATION = { x0: 3, y0: 2, a1: 1, b1: 2, a2: 3, b2: -1 };
// y = 2x + 1 and 3x + 2y = 16 → (2, 5); partial distribution gives x = (16 − 1)/(3 + 4) = 15/7.
const SUBSTITUTION = { x0: 2, y0: 5, m: 2, a: 3, b: 2 };
// 2|x − 3| + 1 = 9 → x = −1 or 7.
const ABSOLUTE = { h: 3, d: 4, k: 1, a: 2 };
// 2|x| + 1 = 9 → x = ±4: centred at 0, so negating a solution gives the other.
const ABSOLUTE_CENTERED = { h: 0, d: 4, k: 1, a: 2 };
// Vertex (2, −3), a = 1.
const VERTEX = { h: 2, k: -3, a: 1 };
// Zeros −1 and 4; and opposite zeros −3 and 3.
const ZEROS = { r1: -1, r2: 4, a: 1 };
const ZEROS_OPPOSITE = { r1: -3, r2: 3, a: 1 };

const LINE = { type: 'graphing', m: 2, b: -3, prompt: 'Identify the slope and the y-intercept.' };
const LINE_NEGATIVE_INTERCEPT = { type: 'graphing', m: 2, b: -2 };
const INEQUALITIES = {
  type: 'systemsWorkspace', prompt: 'Graph the system.', mode: 'inequalities', interaction: 'construct',
  inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }],
};
const onFirst = [{ x: 0, y: 1 }, { x: 2, y: 3 }];
const onSecond = [{ x: 0, y: 6 }, { x: 4, y: 4 }];
const RAY = { type: 'intervalNumberLine', prompt: 'Graph x ≥ 3.', min: -8, max: 8, intervals: [{ min: 3, max: null, minClosed: true, maxClosed: false }], ask: ['graph', 'interval'] };
const SEGMENT = { type: 'intervalNumberLine', prompt: 'Graph −3 ≤ x < 5.', min: -8, max: 8, intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }], ask: ['graph'] };
const QUANTITIES = [
  { id: 'time', label: 'Time', unit: 'minutes' },
  { id: 'volume', label: 'Water in the pool', unit: 'litres' },
  { id: 'rate', label: 'Fill rate' },
];
const MODEL = { type: 'relationshipModel', quantities: QUANTITIES, correctIndependentId: 'time', correctDependentId: 'volume' };

export const MISCONCEPTION_FIXTURES = Object.freeze([
  // --- linear.slopeFromPoints -----------------------------------------------------
  familyCase('slope: correct', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: '3' }), []),
  familyCase('slope: run over rise', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: '1/3' }), ['slope-run-over-rise']),
  familyCase('slope: sign reversed', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: '-3' }), ['slope-sign-reversed']),
  familyCase('slope: both errors at once is not named', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: '-1/3' }), []),
  familyCase('slope: an unmodeled wrong value is not named', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: '4' }), []),
  familyCase('slope: unreadable work is not named', 'linear.slopeFromPoints', SLOPE, fieldsResponse({ slope: 'three' }), []),
  // m = 1: the reciprocal IS the slope, and −1 is both "sign reversed" and
  // "reciprocal and sign reversed" — two explanations, so no code.
  familyCase('slope 1: −1 matches two strategies and is not named', 'linear.slopeFromPoints', SLOPE_ONE, fieldsResponse({ slope: '-1' }), []),
  // --- functions.identifyIntercepts --------------------------------------------------
  familyCase('intercepts: correct', 'functions.identifyIntercepts', INTERCEPTS, fieldsResponse({ xIntercept: '(4, 0)', yIntercept: '(0, -2)' }), []),
  familyCase('intercepts: swapped points', 'functions.identifyIntercepts', INTERCEPTS, fieldsResponse({ xIntercept: '(0, -2)', yIntercept: '(4, 0)' }), ['intercepts-swapped']),
  familyCase('intercepts: swapped values', 'functions.identifyIntercepts', INTERCEPTS, fieldsResponse({ xIntercept: '(-2, 0)', yIntercept: '(0, 4)' }), ['intercepts-swapped']),
  familyCase('intercepts: pairs written (y, x)', 'functions.identifyIntercepts', INTERCEPTS, fieldsResponse({ xIntercept: '(0, 4)', yIntercept: '(-2, 0)' }), ['ordered-pair-reversed']),
  familyCase('intercepts: one wrong, one right is not named', 'functions.identifyIntercepts', INTERCEPTS, fieldsResponse({ xIntercept: '(0, -2)', yIntercept: '(0, -2)' }), []),
  familyCase('intercepts: equal values cannot tell a swap from a reversal', 'functions.identifyIntercepts', INTERCEPTS_EQUAL, fieldsResponse({ xIntercept: '(0, 3)', yIntercept: '(3, 0)' }), []),
  // --- linear.twoStepEquation (3x + 5 = 20) -------------------------------------------
  familyCase('two-step: correct', 'linear.twoStepEquation', TWO_STEP, fieldsResponse({ solution: '5' }), []),
  familyCase('two-step: constant moved without changing sign', 'linear.twoStepEquation', TWO_STEP, fieldsResponse({ solution: '25/3' }), ['inverse-operation-sign']),
  familyCase('two-step: divided only some terms', 'linear.twoStepEquation', TWO_STEP, fieldsResponse({ solution: '5/3' }), ['partial-division']),
  familyCase('two-step: −x has two causes and is not named', 'linear.twoStepEquation', TWO_STEP, fieldsResponse({ solution: '-5' }), []),
  familyCase('two-step: −x that is also the moved-constant value is not named', 'linear.twoStepEquation', TWO_STEP_ZERO, fieldsResponse({ solution: '-2' }), []),
  familyCase('two-step: did not divide is not named', 'linear.twoStepEquation', TWO_STEP, fieldsResponse({ solution: '15' }), []),
  // --- linear.multiStepEquation (4x + 3 = 2x + 11) -------------------------------------
  familyCase('multi-step: correct', 'linear.multiStepEquation', MULTI_STEP, fieldsResponse({ solution: '4' }), []),
  familyCase('multi-step: constant moved without changing sign', 'linear.multiStepEquation', MULTI_STEP, fieldsResponse({ solution: '7' }), ['inverse-operation-sign']),
  familyCase('multi-step: variable term moved without changing sign', 'linear.multiStepEquation', MULTI_STEP, fieldsResponse({ solution: '4/3' }), ['inverse-operation-sign']),
  familyCase('multi-step: unmodeled', 'linear.multiStepEquation', MULTI_STEP, fieldsResponse({ solution: '3' }), []),
  // --- systems.elimination (x + 2y = 7, 3x − y = 7 → (3, 2)) -----------------------------
  familyCase('elimination: correct', 'systems.elimination', ELIMINATION, systemResponse(3, 2), [], { tool: 'system' }),
  familyCase('elimination: (y, x)', 'systems.elimination', ELIMINATION, systemResponse(2, 3), ['ordered-pair-reversed'], { tool: 'system' }),
  familyCase('elimination: on one line only', 'systems.elimination', ELIMINATION, systemResponse(1, 3), ['system-point-on-one-line-only'], { tool: 'system' }),
  familyCase('elimination: on neither line', 'systems.elimination', ELIMINATION, systemResponse(1, 1), [], { tool: 'system' }),
  familyCase('elimination: as a multiAnswer pair', 'systems.elimination', ELIMINATION, fieldsResponse({ solution: '(2, 3)' }), ['ordered-pair-reversed']),
  // --- systems.substitution (y = 2x + 1, 3x + 2y = 16 → (2, 5)) --------------------------
  familyCase('substitution: correct', 'systems.substitution', SUBSTITUTION, systemResponse(2, 5), [], { tool: 'system' }),
  familyCase('substitution: partial distribution, y from the first equation', 'systems.substitution', SUBSTITUTION, systemResponse('15/7', '37/7'), ['substitution-partial-distribution'], { tool: 'system' }),
  familyCase('substitution: on one line only, not the distribution error', 'systems.substitution', SUBSTITUTION, systemResponse(0, 1), ['system-point-on-one-line-only'], { tool: 'system' }),
  // --- absoluteValue.solveEquation (2|x − 3| + 1 = 9 → −1, 7) ------------------------------
  familyCase('absolute value: correct', 'absoluteValue.solveEquation', ABSOLUTE, fieldsResponse({ smallerSolution: '-1', largerSolution: '7' }), []),
  familyCase('absolute value: solutions in the wrong boxes is not a misconception', 'absoluteValue.solveEquation', ABSOLUTE, fieldsResponse({ smallerSolution: '7', largerSolution: '-1' }), []),
  familyCase('absolute value: negated a solution', 'absoluteValue.solveEquation', ABSOLUTE, fieldsResponse({ smallerSolution: '-7', largerSolution: '7' }), ['absolute-value-negated-solution']),
  familyCase('absolute value: one case only', 'absoluteValue.solveEquation', ABSOLUTE, fieldsResponse({ smallerSolution: '7', largerSolution: '7' }), ['absolute-value-one-case-only']),
  familyCase('absolute value centred at 0: ±4 in the wrong boxes is not a negated solution', 'absoluteValue.solveEquation', ABSOLUTE_CENTERED, fieldsResponse({ smallerSolution: '4', largerSolution: '-4' }), []),
  familyCase('absolute value: unmodeled', 'absoluteValue.solveEquation', ABSOLUTE, fieldsResponse({ smallerSolution: '-2', largerSolution: '8' }), []),
  // --- quadratics.identifyVertex (vertex (2, −3)) ----------------------------------------
  familyCase('vertex: correct', 'quadratics.identifyVertex', VERTEX, fieldsResponse({ vertex: '(2, -3)' }), []),
  familyCase('vertex: x sign reversed', 'quadratics.identifyVertex', VERTEX, fieldsResponse({ vertex: '(-2, -3)' }), ['vertex-x-sign-reversed']),
  familyCase('vertex: x sign reversed, y carried through', 'quadratics.identifyVertex', VERTEX, fieldsResponse({ vertex: '(-2, 13)' }), ['vertex-x-sign-reversed']),
  familyCase('vertex: written (y, x)', 'quadratics.identifyVertex', VERTEX, fieldsResponse({ vertex: '(-3, 2)' }), ['ordered-pair-reversed']),
  familyCase('vertex: unmodeled', 'quadratics.identifyVertex', VERTEX, fieldsResponse({ vertex: '(2, 3)' }), []),
  // --- functions.identifyZeros (zeros −1, 4) ----------------------------------------------
  familyCase('zeros: correct', 'functions.identifyZeros', ZEROS, fieldsResponse({ smallerZero: '-1', largerZero: '4' }), []),
  familyCase('zeros: signs reversed', 'functions.identifyZeros', ZEROS, fieldsResponse({ smallerZero: '-4', largerZero: '1' }), ['zeros-sign-reversed']),
  familyCase('zeros: one sign reversed is not named', 'functions.identifyZeros', ZEROS, fieldsResponse({ smallerZero: '1', largerZero: '4' }), []),
  familyCase('zeros: opposite zeros in the wrong boxes are not a sign error', 'functions.identifyZeros', ZEROS_OPPOSITE, fieldsResponse({ smallerZero: '3', largerZero: '-3' }), []),
  // --- graphing / lineFeatures (y = 2x − 3) -----------------------------------------------
  toolCase('line features: correct', 'graphing', LINE, { slope: '2', intercept: '-3' }, []),
  toolCase('line features: run over rise', 'graphing', LINE, { slope: '0.5', intercept: '-3' }, ['slope-run-over-rise']),
  toolCase('line features: slope sign reversed', 'graphing', LINE, { slope: '-2', intercept: '-3' }, ['slope-sign-reversed']),
  toolCase('line features: slope and intercept exchanged', 'graphing', LINE, { slope: '-3', intercept: '2' }, ['slope-intercept-swapped']),
  toolCase('line features: a swap that is also a sign error is not named', 'graphing', LINE_NEGATIVE_INTERCEPT, { slope: '-2', intercept: '2' }, []),
  toolCase('line features: intercept wrong alone is not named', 'graphing', LINE, { slope: '2', intercept: '3' }, []),
  // --- systemsWorkspace / inequalities (legacy construct) ---------------------------------
  toolCase('inequalities: correct', 'systemsWorkspace', INEQUALITIES, { construction: [{ points: onFirst, boundaryStyle: 'solid', shade: 'above' }, { points: onSecond, boundaryStyle: 'dashed', shade: 'below' }] }, []),
  toolCase('inequalities: dashed for ≥', 'systemsWorkspace', INEQUALITIES, { construction: [{ points: onFirst, boundaryStyle: 'dashed', shade: 'above' }, { points: onSecond, boundaryStyle: 'dashed', shade: 'below' }] }, ['inequality-boundary-style']),
  toolCase('inequalities: shaded the wrong side', 'systemsWorkspace', INEQUALITIES, { construction: [{ points: onFirst, boundaryStyle: 'solid', shade: 'above' }, { points: onSecond, boundaryStyle: 'dashed', shade: 'above' }] }, ['inequality-shaded-wrong-side']),
  toolCase('inequalities: both, on different boundaries', 'systemsWorkspace', INEQUALITIES, { construction: [{ points: onFirst, boundaryStyle: 'dashed', shade: 'above' }, { points: onSecond, boundaryStyle: 'dashed', shade: 'above' }] }, ['inequality-boundary-style', 'inequality-shaded-wrong-side']),
  toolCase('inequalities: style on a wrong boundary is not judged', 'systemsWorkspace', INEQUALITIES, { construction: [{ points: [{ x: 0, y: 0 }, { x: 2, y: 5 }], boundaryStyle: 'dashed', shade: 'below' }, { points: onSecond, boundaryStyle: 'dashed', shade: 'below' }] }, []),
  // --- intervalNumberLine / numberLine ------------------------------------------------------
  toolCase('number line: correct', 'intervalNumberLine', RAY, { intervals: [{ min: 3, max: Infinity, minClosed: true, maxClosed: false }], notation: '[3, inf)' }, []),
  toolCase('number line: open circle for ≥', 'intervalNumberLine', RAY, { intervals: [{ min: 3, max: Infinity, minClosed: false, maxClosed: false }], notation: '[3, inf)' }, ['endpoint-inclusion-error']),
  toolCase('number line: ray reversed', 'intervalNumberLine', RAY, { intervals: [{ min: -Infinity, max: 3, minClosed: false, maxClosed: true }], notation: '(-inf, 3]' }, ['inequality-direction-reversed']),
  toolCase('number line: the complement is not named', 'intervalNumberLine', RAY, { intervals: [{ min: -Infinity, max: 3, minClosed: false, maxClosed: false }], notation: '(-inf, 3)' }, []),
  toolCase('number line: segment endpoint wrong', 'intervalNumberLine', SEGMENT, { intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: true }] }, ['endpoint-inclusion-error']),
  toolCase('number line: a different segment is not named', 'intervalNumberLine', SEGMENT, { intervals: [{ min: -2, max: 5, minClosed: true, maxClosed: false }] }, []),
  // --- relationshipModel / standalone -----------------------------------------------------
  toolCase('relationship model: correct', 'relationshipModel', MODEL, { independentId: 'time', dependentId: 'volume' }, []),
  toolCase('relationship model: exchanged', 'relationshipModel', MODEL, { independentId: 'volume', dependentId: 'time' }, ['independent-dependent-swapped']),
  toolCase('relationship model: a third quantity is not named', 'relationshipModel', MODEL, { independentId: 'volume', dependentId: 'rate' }, []),
  // --- Phase 2: table workbench, composition, relation mapping, constructed
  // graphs, data modeling, student-build inequalities, representations board.
  ...MISCONCEPTION_FIXTURES_PHASE2,
]);

/*
 * PROBES — gradings no real grader produces today, that a classifier must
 * still refuse: each returns true when the classifier behaved.
 */
export const MISCONCEPTION_PROBES = Object.freeze([
  {
    // A form-sensitive field can mark a value wrong that equals the answer
    // (unsimplified, say). Equal to the answer is not a wrong strategy, even
    // where a strategy's value coincides with it (m = 1: run/rise = rise/run).
    name: 'a value equal to the answer, graded wrong for its form, is not a strategy',
    holds: (classify) => {
      const { question, values } = familyInstance('linear.slopeFromPoints', { x1: 0, y1: 0, x2: 2, y2: 2 });
      const response = fieldsResponse({ slope: '1' });
      const graded = gradeServerResponse({ question, response });
      const grading = { ...graded, isCorrect: false, parts: graded.parts.map((part) => ({ ...part, isCorrect: false })) };
      return classify({ question, response, grading, familyValues: values }).evidence === null;
    },
  },
  {
    // A constructed line the grader judged right (within its tolerance) is
    // never read for a slope error, even where the points alone would say 1/m.
    name: 'graph: a line the grader marked right is not read',
    holds: (classify) => {
      const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === 'graph: reciprocal slope from the right y-intercept');
      const graded = gradeServerResponse({ question: fixture.question, response: fixture.response });
      const grading = { ...graded, parts: graded.parts.map((part) => (part.id === 'line' ? { ...part, isCorrect: true } : part)) };
      return classify({ question: fixture.question, response: fixture.response, grading, familyValues: null }).evidence === null;
    },
  },
  {
    name: 'a verdict of correct is never classified, whatever its parts say',
    holds: (classify) => {
      const fixture = MISCONCEPTION_FIXTURES.find((entry) => entry.name === 'slope: run over rise');
      const grading = { ...gradeFixture(fixture), isCorrect: true };
      return classify({ question: fixture.question, response: fixture.response, grading, familyValues: fixture.familyValues }).evidence === null;
    },
  },
]);

/** Run one fixture through a classifier function; returns the sorted codes it recorded. */
export const classifiedCodes = (classify, fixture) => {
  const result = classify({ question: fixture.question, response: fixture.response, grading: gradeFixture(fixture), familyValues: fixture.familyValues });
  return result.findings.map((entry) => entry.code).sort();
};
