/*
 * THE STORED CLASSROOM ATTEMPTS THE JOB K RE-GRADE REPORT IS PROVED ON.
 *
 * Shared by tests/platform/kGrading_classroomRegradePlan.test.mjs (an
 * in-memory store) and tests/integration/classroomRegradeReport.test.mjs (the
 * emulator, through the real ingestStudentSubmissions callable).
 *
 * Each fixture is one question as an assignment stored it BEFORE the K
 * commits, one student's work on it, and the verdict the pre-K code recorded:
 *
 *   - 2a, 2b: the stored question is the pre-K compile (the graders are
 *     byte-identical), so today's grader on it IS the old verdict;
 *   - 2c, 2d, 2e, 2f and the later grader changes: the grader changed, so
 *     the old verdict is pinned in `old` (or, where today's grader refuses
 *     the question, the whole old result in `oldResult`);
 *   - the compiler drops: the stored question is the pre-K compile and the
 *     grader never changed, so today's grader on it IS the old verdict.
 *     `expect.newScore` there is the verdict on the AUTHORED question (the
 *     report shows it; it never proposes it). Both the pinned verdicts and the pre-K stored shapes are
 *     checked against the pre-K code itself (commit PRE_K_COMMIT) by the
 *     platform test whenever that commit is in the clone.
 *
 * `expect` is what the report must say, derived by hand in the comments;
 * `expect.defects: []` marks a negative control no K defect may claim.
 */
import { gradeToolWork } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../../functions/shared/serverGrading/gradingResult.mjs';
import { getQuestionCredit, recordQuestionAttempt } from '../../../functions/shared/attemptPolicy.mjs';
import { captureAutomaticGradingEvidence, responseInspectionEvidenceDocumentId } from '../../../functions/shared/responseInspector.mjs';
import { REGRADE_CLASS, NEEDS_TEACHER_REASON, DEFECT } from '../../../scripts/lib/classroomRegradePlan.mjs';

// The parent of the first K commit (505d9e8): the code that graded every
// attempt this report looks at.
export const PRE_K_COMMIT = '4dc216e';

const payloadOf = (questions, title = 'Job K re-grade fixtures') => ({
  schemaVersion: 5,
  assignment: { title, courseId: 'algebra1' },
  sections: [{ role: 'classwork', title: 'Classwork', questions }],
});
export const compileWith = (compile, intent) => compile(payloadOf([intent])).package.sections[0].questions[0];

/* --- the V5 intents --------------------------------------------------------- */

// 2a. 2x + 3y = 12 crosses the axes at (6, 0) and (0, 4); (3, 2) is on it
// (6 + 6 = 12). The other prompt has no V5 source anywhere.
export const INTENT_2A = { prompt: 'Graph 2x + 3y = 12.', studentActions: ['constructLine'], standard: 'A.3C', standardForm: { A: 2, B: 3, C: 12 } };
export const INTENT_2A_NO_SOURCE = { prompt: 'Graph 4x + 2y = 8.', studentActions: ['constructLine'], standard: 'A.3C', standardForm: { A: 4, B: 2, C: 8 } };
// 2b. f(x) = 3·5^(x − 1) + 4, composition at x = 1: f⁻¹(f(1)) = 1; the
// default y is f(2) = 3·5 + 4 = 19, and f(f⁻¹(19)) = 19. The pre-K compile
// stored {type: 'linear', a: 3, h: 0, k: 5} (k taken from b), whose bridge
// graded 3·2^x + 5: f(2) = 17.
export const INTENT_2B = { prompt: 'Use f to find f⁻¹(f(1)) and f(f⁻¹(f(2))).', studentActions: ['exponentialLogBridge'], mode: 'composition', function: { a: 3, b: 5, h: 1, k: 4 }, x: 1 };
export const INTENT_2B_NO_SOURCE = { ...INTENT_2B, prompt: 'For the function shown, find f⁻¹(f(1)) and f(f⁻¹(y)).' };
// 2c, question-level branch: f(x) = (x − 2)² − 1 kept on x ≥ 2, the branch
// named only on the question (V5 drops it from f).
export const INTENT_2C_BRANCH = {
  standard: '2A.2B', prompt: 'Restrict f and undo it.', studentActions: ['findInverse'],
  mode: 'inverse', f: { type: 'quadratic', a: 1, h: 2, k: -1 }, inverseBranch: 'right', x: 5,
};

/*
 * THE COMPILER DROPS (the compiler no longer drops these; the graders never
 * changed). Each is pinned below as the pre-K compile stored it.
 *   parabola: x² = 8y, focus (0, 2), directrix y = −2. The authored P(2, 0.5)
 *     is on it (4 = 8·0.5): both distances 2.5. The stored question lost P,
 *     so the screen and grader used the offset-4 point (4, 2): both 4.
 *   parabolaOffset4: the authored offset IS the default 4: the same problem,
 *     never listed (negative control).
 *   polynomial: P(x) = x² − 9 at the authored r = 3: P(3) = 0, a factor; the
 *     stored question lost r and graded r = 2: P(2) = −5, not a factor.
 *   signRational: (x − 2)/(x + 3) ≥ 0, no mode authored: the stored chart is
 *     'polynomial', so it showed and graded x − 2 ≥ 0 (cut at 2 only).
 *   signNumerator: numeratorFactors (x − 5) beside factors (x − 1)(x − 3): the
 *     stored question kept only the factors.
 *   signAuthoredPolynomial: the author chose 'polynomial' beside denominator
 *     factors: stored as authored, never listed (negative control).
 *   signRationalNoSource: the rational shape with no V5 source anywhere.
 */
export const INTENT_PARABOLA = { prompt: 'For x² = 8y, find the distances from P(2, 0.5) to the focus and to the directrix. Is P on the parabola?', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', parabola: { h: 0, k: 0, p: 2, orientation: 'vertical' }, point: [2, 0.5] };
export const INTENT_PARABOLA_OFFSET4 = { prompt: 'For x² = 8y, P is the point of the parabola with x = 4. Find its distances to the focus and to the directrix.', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', parabola: { h: 0, k: 0, p: 2, orientation: 'vertical', offset: 4 } };
export const INTENT_POLYNOMIAL = { prompt: 'Let P(x) = x² − 9. Evaluate P(3). Is (x − 3) a factor of P?', studentActions: ['factorPolynomial'], mode: 'factorZero', polynomial: { coefficients: [1, 0, -9], candidateRoot: 3 } };
export const INTENT_SIGN_RATIONAL = { prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', studentActions: ['solveInequality'], signChart: { factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } };
export const INTENT_SIGN_NUMERATOR = { prompt: 'Solve x − 5 ≥ 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [{ root: 1 }, { root: 3 }], numeratorFactors: [{ root: 5 }], relation: '>=' } };
export const INTENT_SIGN_AUTHORED_POLYNOMIAL = { prompt: 'Solve (x − 2) ≥ 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } };
export const INTENT_SIGN_RATIONAL_NO_SOURCE = { prompt: 'Solve (x − 4)/(x + 1) > 0.', studentActions: ['solveInequality'], signChart: { factors: [{ root: 4 }], denominatorFactors: [{ root: -1 }], relation: '>' } };

/** The V5 source the report rebuilds the compiled questions from (the no-source prompts are absent). */
export const V5_SOURCE = payloadOf([
  INTENT_2A, INTENT_2B, INTENT_PARABOLA, INTENT_PARABOLA_OFFSET4, INTENT_POLYNOMIAL,
  INTENT_SIGN_RATIONAL, INTENT_SIGN_NUMERATOR, INTENT_SIGN_AUTHORED_POLYNOMIAL,
], 'Job K re-grade V5 source');

/* --- the stored (pre-K) questions -------------------------------------------- */

/*
 * The questions exactly as the pre-K compile (commit PRE_K_COMMIT) stored
 * them, pinned as literals so a later compiler change cannot move them:
 *
 *   - graphing2*: INTENT_2A*, the coefficients lost (no standardForm);
 *   - bridge*: INTENT_2B*, the linear default, k taken from b, h 0, no base;
 *   - graphing2 and bridge were imported from V5_SOURCE (bridge is its second
 *     question, q_section-1_1_2); the no-source ones each stand alone;
 *   - inverseBranch: INTENT_2C_BRANCH, the branch only on the question;
 *   - dol1, dol1Geometric: two term items of District DOL1 as first authored
 *     (findSequenceTerm), the copy a classroom imported before 283b29b holds.
 *
 * The platform test recompiles each with the pre-K code and compares.
 */
export const PRE_K_STORED = Object.freeze({
  graphing2: { type: 'graphing2', mode: 'standardForm', standard: 'A.3C', prompt: 'Graph 2x + 3y = 12.', activityRole: 'classwork', studentActions: ['constructLine'], questionId: 'q_section-1_1_1', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2 } },
  graphing2NoSource: { type: 'graphing2', mode: 'standardForm', standard: 'A.3C', prompt: 'Graph 4x + 2y = 8.', activityRole: 'classwork', studentActions: ['constructLine'], questionId: 'q_section-1_1_1', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2 } },
  bridge: { type: 'exponentialLogBridge', mode: 'composition', function: { type: 'linear', a: 3, h: 0, k: 5 }, x: 1, prompt: 'Use f to find f⁻¹(f(1)) and f(f⁻¹(f(2))).', activityRole: 'classwork', studentActions: ['exponentialLogBridge'], questionId: 'q_section-1_1_2', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2 } },
  bridgeNoSource: { type: 'exponentialLogBridge', mode: 'composition', function: { type: 'linear', a: 3, h: 0, k: 5 }, x: 1, prompt: 'For the function shown, find f⁻¹(f(1)) and f(f⁻¹(y)).', activityRole: 'classwork', studentActions: ['exponentialLogBridge'], questionId: 'q_section-1_1_1', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2 } },
  inverseBranch: { type: 'inverseCompositionLab', mode: 'inverse', f: { type: 'quadratic', a: 1, h: 2, k: -1 }, x: 5, inverseBranch: 'right', prompt: 'Restrict f and undo it.', activityRole: 'classwork', studentActions: ['findInverse'], standard: '2A.2B', questionId: 'q_section-1_1_1', questionWeight: 1, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1 } },
  dol1: { type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, commonDifference: 4 }, prompt: 'An arithmetic sequence starts at 7 and each term is 4 more than the term before it. Find the second, third and fifth terms.', activityRole: 'classwork', dok: 2, difficultyBand: 3, studentActions: ['findSequenceTerm'], standard: 'A.12C', questionId: 'q_section-2_2_12', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2.5 } },
  dol1Geometric: { type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'geometric', first: 3, commonRatio: 2 }, prompt: 'A geometric sequence starts at 3 and each term is twice the term before it. Find the second, third and fifth terms.', activityRole: 'practice', dok: 2, difficultyBand: 3, studentActions: ['findSequenceTerm'], standard: 'A.12C', questionId: 'q_section-3_3_8', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2.5 } },
  // The compiler drops, imported from V5_SOURCE (positions 3 to 8); the
  // no-source sign chart stands alone.
  parabola: { type: 'parabolaGeometryLab', mode: 'equidistance', h: 0, k: 0, p: 2, orientation: 'vertical', prompt: 'For x² = 8y, find the distances from P(2, 0.5) to the focus and to the directrix. Is P on the parabola?', activityRole: 'classwork', studentActions: ['analyzeParabolaGeometry'], questionId: 'q_section-1_1_3', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2.5 } },
  parabolaOffset4: { type: 'parabolaGeometryLab', mode: 'equidistance', h: 0, k: 0, p: 2, orientation: 'vertical', prompt: 'For x² = 8y, P is the point of the parabola with x = 4. Find its distances to the focus and to the directrix.', activityRole: 'classwork', studentActions: ['analyzeParabolaGeometry'], questionId: 'q_section-1_1_4', questionWeight: 1.5, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 2.5 } },
  polynomial: { type: 'polynomialWorkshop', mode: 'factorZero', coefficients: [1, 0, -9], prompt: 'Let P(x) = x² − 9. Evaluate P(3). Is (x − 3) a factor of P?', activityRole: 'classwork', studentActions: ['factorPolynomial'], questionId: 'q_section-1_1_5', questionWeight: 1.25, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1.5 } },
  signRational: { type: 'signSolutionAnalyzer', mode: 'polynomial', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=', prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', activityRole: 'classwork', studentActions: ['solveInequality'], questionId: 'q_section-1_1_6', questionWeight: 1.25, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1.5 } },
  signNumerator: { type: 'signSolutionAnalyzer', mode: 'polynomial', factors: [{ root: 1 }, { root: 3 }], relation: '>=', prompt: 'Solve x − 5 ≥ 0.', activityRole: 'classwork', studentActions: ['solveInequality'], questionId: 'q_section-1_1_7', questionWeight: 1.25, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1.5 } },
  signAuthoredPolynomial: { type: 'signSolutionAnalyzer', mode: 'polynomial', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=', prompt: 'Solve (x − 2) ≥ 0.', activityRole: 'classwork', studentActions: ['solveInequality'], questionId: 'q_section-1_1_8', questionWeight: 1.25, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1.5 } },
  signRationalNoSource: { type: 'signSolutionAnalyzer', mode: 'polynomial', factors: [{ root: 4 }], denominatorFactors: [{ root: -1 }], relation: '>', prompt: 'Solve (x − 4)/(x + 1) > 0.', activityRole: 'classwork', studentActions: ['solveInequality'], questionId: 'q_section-1_1_1', questionWeight: 1.25, questionWeightBasis: { source: 'auto', rule: 'workload-v1', units: 1.5 } },
});

// The Representation Bridge table (0, −4), (2, −2), (4, 0), (6, 2): y = x − 4.
const BRIDGE_ROWS = [[0, -4], [2, -2], [4, 0], [6, 2]];

export const STORED = {
  graphing2: structuredClone(PRE_K_STORED.graphing2),
  graphing2NoSource: structuredClone(PRE_K_STORED.graphing2NoSource),
  bridge: structuredClone(PRE_K_STORED.bridge),
  bridgeNoSource: structuredClone(PRE_K_STORED.bridgeNoSource),
  inverseBranch: structuredClone(PRE_K_STORED.inverseBranch),
  // f names its own branch (x ≥ 2) and locks x = 0, left of the vertex:
  // f(0) = 3, and on x ≥ 2 f⁻¹(3) = 2 + √4 = 4 = 2h − x.
  inverseMirror: { type: 'inverseCompositionLab', questionId: 'k-regrade-2c-mirror', prompt: 'Find f⁻¹(f(0)).', mode: 'inverse', f: { type: 'quadratic', a: 1, h: 2, k: -1, inverseBranch: 'right' }, x: 0 },
  // (x² − 1)/(x² + x) = (x − 1)(x + 1)/(x(x + 1)): excluded −1 and 0.
  quotient: { type: 'functionOperationsLab', questionId: 'k-regrade-2d', prompt: 'Find the quotient.', f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, 1, 0] }, operations: ['quotient'] },
  // 2·2^(x − 1) − 3 = 2^x − 3: a = 1, h = 0, k = −3 draws the same graph.
  identify: { type: 'transformationsLab', questionId: 'k-regrade-2e', prompt: 'Identify a, h and k.', mode: 'identify', family: 'exponential', function: { type: 'exponential', a: 2, h: 1, k: -3, base: 2 } },
  dol1: structuredClone(PRE_K_STORED.dol1),
  // A sequence authored with `difference`: never affected.
  sequenceControl: { type: 'sequenceExplorer', questionId: 'k-regrade-2f-control', prompt: 'Analyze 7, 11, 15, ...', mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, difference: 4 } },

  /* --- the later grader changes (stored shapes the graders read directly) --- */
  // (x + 2)(x − 3) ≥ 0, written with the symbol. Intervals in chart order:
  // 0 (−∞, −2), 1 (−2, 3), 2 (3, ∞); the product is positive on 0 and 2.
  signGe: { type: 'signSolutionAnalyzer', questionId: 'k-regrade-sign-ge', prompt: 'Solve (x + 2)(x − 3) ≥ 0.', mode: 'polynomial', factors: [{ root: -2 }, { root: 3 }], relation: '≥' },
  // 0x + 0y = 5 and 0x + 0y = 3: no solution. The control's constants are 0.
  matrixNone: { type: 'systemsWorkspace', questionId: 'k-regrade-matrix', prompt: 'Classify the system.', mode: 'matrix', matrix: { a11: 0, a12: 0, b1: 5, a21: 0, a22: 0, b2: 3 } },
  matrixAllZero: { type: 'systemsWorkspace', questionId: 'k-regrade-matrix-zero', prompt: 'Classify the system.', mode: 'matrix', matrix: { a11: 0, a12: 0, b1: 0, a21: 0, a22: 0, b2: 0 } },
  algebraicNone: { type: 'systemsWorkspace', questionId: 'k-regrade-algebraic', prompt: 'Solve the system.', mode: 'algebraic', equations: ['x - x = 5', 'y - y = 3'] },
  // y = (13/14)x² + ... on 1990–1994: the pre-1dabf19 fit found no quadratic.
  // The same y on x = 0..4 is the control (both fits agree). Point lists are
  // stored as {x, y} (Firestore holds no array inside an array:
  // repairKnownFirestoreNestedArrays), and the graders read them so.
  quadraticYears: { type: 'dataModelingLab', questionId: 'k-regrade-quadratic-years', prompt: 'Fit a quadratic.', mode: 'quadraticFit', points: [{ x: 1990, y: 1 }, { x: 1991, y: 2 }, { x: 1992, y: 5.5 }, { x: 1993, y: 10 }, { x: 1994, y: 17 }] },
  quadraticSmall: { type: 'dataModelingLab', questionId: 'k-regrade-quadratic-small', prompt: 'Fit a quadratic.', mode: 'quadraticFit', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 5.5 }, { x: 3, y: 10 }, { x: 4, y: 17 }] },
  // (x² − 1) ÷ (x − 1) = x + 1 exactly, excluded 1.
  quotientExact: { type: 'functionOperationsLab', questionId: 'k-regrade-quotient-exact', prompt: 'Find the quotient.', f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, -1] }, operations: ['quotient'] },
  // 5x + 6y = −7: y = −(5/6)x − 7/6.
  standardLine: { type: 'graphing2', questionId: 'k-regrade-graphing2', prompt: 'Graph 5x + 6y = −7.', mode: 'standardForm', standard: { A: 5, B: 6, C: -7 } },
  // y = 2.3: on the 0.5 grid y is 2 or 2.5, never within 0.12 of 2.3.
  horizontalOffGrid: { type: 'graphing2', questionId: 'k-regrade-graphing2-void', prompt: 'Graph y = 2.3.', mode: 'verticalHorizontal', orientation: 'horizontal', value: 2.3 },
  // z = 2 + 3i, w = −1 + 2i; 'divide' is not an Operations choice.
  complexDivide: { type: 'complexPlaneLab', questionId: 'k-regrade-complex', prompt: 'Compute z ÷ w.', mode: 'operations', operation: 'divide', z: { re: 2, im: 3 }, w: { re: -1, im: 2 } },
  complexAdd: { type: 'complexPlaneLab', questionId: 'k-regrade-complex-add', prompt: 'Compute z + w.', mode: 'operations', operation: 'add', z: { re: 2, im: 3 }, w: { re: -1, im: 2 } },
  bridgeGeneral: {
    type: 'representationBridge', questionId: 'k-regrade-bridge', prompt: 'Write the line in slope-intercept form.', mode: 'linear',
    source: { kind: 'table', rows: BRIDGE_ROWS.map(([x, y]) => ({ x, y })) },
    context: { inputLabel: 'a', outputLabel: 'b', inputUnit: 'u', outputUnit: 'v', rateUnit: 'v per u', rateMeaning: 'r', yInterceptMeaning: 'yi', zeroMeaning: 'z' },
    requiredStages: ['generalForm'], requiredComparisons: 3, graphBounds: { xMin: -2, xMax: 8, yMin: -10, yMax: 10 }, feedbackTiming: 'checkpoint',
  },
  // (1, 2), (2, 4.5), (3, 5), (4, 8): m = 1.85, b = 0.25, r ≈ 0.96999663.
  regression: { type: 'regressionCalculator', questionId: 'k-regrade-regression', prompt: 'Run the regression.', sourceData: [{ x: 1, y: 2 }, { x: 2, y: 4.5 }, { x: 3, y: 5 }, { x: 4, y: 8 }] },

  parabola: structuredClone(PRE_K_STORED.parabola),
  parabolaOffset4: structuredClone(PRE_K_STORED.parabolaOffset4),
  polynomial: structuredClone(PRE_K_STORED.polynomial),
  signRational: structuredClone(PRE_K_STORED.signRational),
  signNumerator: structuredClone(PRE_K_STORED.signNumerator),
  signAuthoredPolynomial: structuredClone(PRE_K_STORED.signAuthoredPolynomial),
  signRationalNoSource: structuredClone(PRE_K_STORED.signRationalNoSource),
};

// The regression the calculator runs on the source table, as it stores it.
export const REGRESSION_SOURCE = [[1, 2], [2, 4.5], [3, 5], [4, 8]];
export const REGRESSION_RUN = Object.freeze({ m: 1.85, b: 0.25, r: 0.9699966344221911 });
const regressionWork = (run) => ({
  table: REGRESSION_SOURCE,
  regressionRun: { operation: 'linearRegression', table: REGRESSION_SOURCE, ...REGRESSION_RUN, ...run },
  interpretation: { direction: 'positive', strength: 'strong' },
  processEvidence: [],
});

/* --- the fixtures ------------------------------------------------------------ */

const CANDIDATE = REGRADE_CLASS.CANDIDATE;
const LOWER = REGRADE_CLASS.NOW_LOWER;
const TEACHER = REGRADE_CLASS.NEEDS_TEACHER;
const SAME = REGRADE_CLASS.UNCHANGED;

/*
 * OLD_VERDICT: what the pre-K grader returned, as [isCorrect, score,
 * {partId: [isCorrect, isComplete]}]. null: today's grader on the stored
 * question already is the pre-K grader (2a, 2b, and the control).
 */
export const FIXTURES = [
  // 2a: the key line, rebuilt from the V5 source, is right (old: no line, 0).
  { tag: 'a-key', question: 'graphing2', tool: 'graphing2', work: { points: [[6, 0], [0, 4], [3, 2]] }, old: null,
    expect: { classification: CANDIDATE, defect: DEFECT.GRAPHING2_STANDARD_FORM, newCorrect: true, newScore: 100, oldScore: 0 } },
  // (1, 1): 2 + 3 = 5 ≠ 12; (2, 5): 4 + 15 = 19 ≠ 12. Neither point is on the
  // line, so nothing is right under either grader: stays out.
  { tag: 'a-wrong', question: 'graphing2', tool: 'graphing2', work: { points: [[1, 1], [2, 5]] }, old: null,
    expect: { classification: SAME, newCorrect: false, newScore: 0, oldScore: 0 } },
  // 4x + 2y = 8 through (2, 0) and (0, 4), but no source names its line.
  { tag: 'a-no-source', question: 'graphing2NoSource', tool: 'graphing2', work: { points: [[2, 0], [0, 4], [1, 2]] }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.STANDARD_FORM_LOST, defect: DEFECT.GRAPHING2_STANDARD_FORM } },
  // 2b: 19 is f(2) for 3·5^(x − 1) + 4; old graded 17 (3·2^x + 5).
  { tag: 'b-right', question: 'bridge', tool: 'exponentialLogBridge', work: { inverseAfterForward: '1', forwardAfterInverse: '19' }, old: null,
    expect: { classification: CANDIDATE, defect: DEFECT.BRIDGE_LINEAR_FUNCTION, newCorrect: true, newScore: 100, oldScore: 50 } },
  { tag: 'b-lower', question: 'bridge', tool: 'exponentialLogBridge', work: { inverseAfterForward: '1', forwardAfterInverse: '17' }, old: null,
    expect: { classification: LOWER, defect: DEFECT.BRIDGE_LINEAR_FUNCTION, newCorrect: false, newScore: 50, oldScore: 100 } },
  // 20 is neither 19 nor 17: half right (f⁻¹(f(1)) = 1) both times.
  { tag: 'b-wrong', question: 'bridge', tool: 'exponentialLogBridge', work: { inverseAfterForward: '1', forwardAfterInverse: '20' }, old: null,
    expect: { classification: SAME, newCorrect: false, newScore: 50, oldScore: 50 } },
  { tag: 'b-no-source', question: 'bridgeNoSource', tool: 'exponentialLogBridge', work: { inverseAfterForward: '1', forwardAfterInverse: '19' }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.BRIDGE_FUNCTION_LOST, defect: DEFECT.BRIDGE_LINEAR_FUNCTION } },
  // 2c, question-level branch: the old screen showed "no inverse", so the
  // box was never there (blank) and was marked complete and wrong.
  { tag: 'c-branch', question: 'inverseBranch', tool: 'inverseCompositionLab', work: { x: 5, inverseAnswer: '' }, old: [false, 0, { inverse: [false, true] }],
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.INVERSE_BOX_NEVER_SHOWN, defect: DEFECT.INVERSE_QUESTION_BRANCH } },
  // 2c, x = 0 off the kept branch: f⁻¹(f(0)) = 4. Old accepted x itself.
  { tag: 'c-mirror-right', question: 'inverseMirror', tool: 'inverseCompositionLab', work: { x: 0, inverseAnswer: '4' }, old: [false, 0, { inverse: [false, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.INVERSE_OFF_BRANCH_INPUT, newCorrect: true, newScore: 100, oldScore: 0 } },
  { tag: 'c-mirror-lower', question: 'inverseMirror', tool: 'inverseCompositionLab', work: { x: 0, inverseAnswer: '0' }, old: [true, 1, { inverse: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.INVERSE_OFF_BRANCH_INPUT, newCorrect: false, newScore: 0, oldScore: 100 } },
  { tag: 'c-wrong', question: 'inverseMirror', tool: 'inverseCompositionLab', work: { x: 0, inverseAnswer: '7' }, old: [false, 0, { inverse: [false, true] }],
    expect: { classification: SAME, newCorrect: false, newScore: 0, oldScore: 0 } },
  // 2d: (x − 1)/x is the quotient in lowest terms; the old degree check refused it.
  { tag: 'd-right', question: 'quotient', tool: 'functionOperationsLab', work: { responses: { quotient: '(x-1)/x' }, restrictions: '-1, 0' },
    old: [false, 0.5, { quotient: [false, true], 'quotient-restrictions': [true, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.QUOTIENT, newCorrect: true, newScore: 100, oldScore: 50 } },
  // ((x − 1)(x − 5))/(x(x − 5)) has an extra hole at x = 5, where f/g = 4/5 is defined.
  { tag: 'd-lower', question: 'quotient', tool: 'functionOperationsLab', work: { responses: { quotient: '((x-1)(x-5))/(x(x-5))' }, restrictions: '-1, 0' },
    old: [true, 1, { quotient: [true, true], 'quotient-restrictions': [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.QUOTIENT, newCorrect: false, newScore: 50, oldScore: 100 } },
  // (x + 1)/x is 2 at x = 1, where f/g = 0: wrong both times.
  { tag: 'd-wrong', question: 'quotient', tool: 'functionOperationsLab', work: { responses: { quotient: '(x+1)/x' }, restrictions: '-1, 0' },
    old: [false, 0.5, { quotient: [false, true], 'quotient-restrictions': [true, true] }],
    expect: { classification: SAME, newCorrect: false, newScore: 50, oldScore: 50 } },
  // 2e: 1·2^(x − 0) − 3 is the same graph; the old grader wanted a = 2, h = 1.
  { tag: 'e-right', question: 'identify', tool: 'transformationsLab', work: { a: '1', h: '0', k: '-3' },
    old: [false, 0.5, { a: [false, true], b: [true, true], h: [false, true], k: [true, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.TRANSFORMATIONS_IDENTIFY, newCorrect: true, newScore: 100, oldScore: 50 } },
  // 1.05·2^x − 3 is not 2^x − 3 (a off by 0.05 > 0.01): stays out.
  { tag: 'e-wrong', question: 'identify', tool: 'transformationsLab', work: { a: '1.05', h: '0', k: '-3' },
    old: [false, 0.5, { a: [false, true], b: [true, true], h: [false, true], k: [true, true] }],
    expect: { classification: SAME, newCorrect: false, newScore: 50, oldScore: 50 } },
  // 2f: 7, 11, 15, ... has change 4 and a₈ = 7 + 7·4 = 35; the old screen and
  // grader read 7, 8, 9, ... (change 1, a₈ = 14). Neither is a re-grade: the
  // item asks for a₂, a₃, a₅.
  { tag: 'f-dol1-new-right', question: 'dol1', tool: 'sequenceExplorer', work: { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' },
    old: [false, 1 / 3, { kind: [true, true], change: [false, true], term: [false, true] }],
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.DOL1_ITEM_MUST_BE_REPLACED, defect: DEFECT.SEQUENCE_ALIAS } },
  { tag: 'f-dol1-old-right', question: 'dol1', tool: 'sequenceExplorer', work: { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: '14' },
    old: [true, 1, { kind: [true, true], change: [true, true], term: [true, true] }],
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.DOL1_ITEM_MUST_BE_REPLACED, defect: DEFECT.SEQUENCE_ALIAS } },
  // Change 3 and a₈ = 30 for 7, 11, 15, ... (change 4, a₈ = 35): wrong both times.
  { tag: 'f-control', question: 'sequenceControl', tool: 'sequenceExplorer', work: { kindAnswer: 'arithmetic', changeAnswer: '3', termAnswer: '30' }, old: null,
    expect: { classification: SAME, newCorrect: false, newScore: 33, oldScore: 33 } },

  /* --- the later grader changes ------------------------------------------- */
  // '≥' was read as '<': the old key was the negative interval 1.
  { tag: 'sign-ge-right', question: 'signGe', tool: 'signSolutionAnalyzer', work: { selected: [0, 2] }, old: [false, 0, { intervals: [false, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.SIGN_INCLUSIVE_RELATION, newCorrect: true, newScore: 100, oldScore: 0 } },
  { tag: 'sign-ge-lower', question: 'signGe', tool: 'signSolutionAnalyzer', work: { selected: [1] }, old: [true, 1, { intervals: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.SIGN_INCLUSIVE_RELATION, newCorrect: false, newScore: 0, oldScore: 100 } },
  // Interval 0 alone is neither key: wrong both times.
  { tag: 'sign-ge-wrong', question: 'signGe', tool: 'signSolutionAnalyzer', work: { selected: [0] }, old: [false, 0, { intervals: [false, true] }],
    expect: { classification: SAME, newCorrect: false, newScore: 0, oldScore: 0 } },
  // 0 = 5 has no solution; the old solver called it 'infinite'.
  { tag: 'matrix-right', question: 'matrixNone', tool: 'systemsWorkspace', work: { classification: 'none' }, old: [false, 0, { classification: [false, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.SYSTEMS_NO_VARIABLE, newCorrect: true, newScore: 100, oldScore: 0 } },
  { tag: 'matrix-lower', question: 'matrixNone', tool: 'systemsWorkspace', work: { classification: 'infinite' }, old: [true, 1, { classification: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.SYSTEMS_NO_VARIABLE, newCorrect: false, newScore: 0, oldScore: 100 } },
  // 0 = 0 twice: infinitely many, before and after.
  { tag: 'matrix-control', question: 'matrixAllZero', tool: 'systemsWorkspace', work: { classification: 'infinite' }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  { tag: 'algebraic-right', question: 'algebraicNone', tool: 'systemsWorkspace',
    work: { reducedStatement: '0 = 5', specialCase: { statementTruth: 'false', solutionCount: 'none', classification: 'inconsistent' } },
    old: [false, 0, { 'reduced-statement': [false, true], 'statement-truth': [false, true], 'solution-count': [false, true], classification: [false, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.SYSTEMS_NO_VARIABLE, newCorrect: true, newScore: 100, oldScore: 0 } },
  // The exact least-squares fit a = 13/14, b = −25868/7, c = 36766681/10.
  { tag: 'quadratic-right', question: 'quadraticYears', tool: 'dataModelingLab', work: { a: '0.928571', b: '-3695.428571', c: '3676668.1' }, old: [false, 0, { fit: [false, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.DATA_QUADRATIC_FIT, newCorrect: true, newScore: 100, oldScore: 0 } },
  // On x = 0..4 the same y fit 13/14, 2/7, 67/70 under both fits.
  { tag: 'quadratic-control', question: 'quadraticSmall', tool: 'dataModelingLab', work: { a: '0.928571', b: '0.285714', c: '0.957143' }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  { tag: 'quotient-exact-right', question: 'quotientExact', tool: 'functionOperationsLab', work: { responses: { quotient: '(x^2-1)/(x-1)' }, restrictions: '1' },
    old: [false, 0.5, { quotient: [false, true], 'quotient-restrictions': [true, true] }],
    expect: { classification: CANDIDATE, defect: DEFECT.QUOTIENT_EXACT, newCorrect: true, newScore: 100, oldScore: 50 } },
  { tag: 'quotient-exact-control', question: 'quotientExact', tool: 'functionOperationsLab', work: { responses: { quotient: 'x+1' }, restrictions: '1' }, old: null,
    expect: { classification: SAME, newCorrect: true, newScore: 100, oldScore: 100 } },
  // (1, −2) is on it; (−5, 3.5) is half a unit above it (y = 3 there), but
  // the two give m = −11/12, b = −13/12: 1/12 from −5/6 and −7/6, inside the
  // m/b tolerance (0.12, 0.24).
  { tag: 'graphing2-lower', question: 'standardLine', tool: 'graphing2', work: { points: [[1, -2], [-5, 3.5]] },
    old: [true, 1, { 'point-1': [true, true], 'point-2': [false, true], line: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.GRAPHING2_BOTH_POINTS, newCorrect: false, newScore: 50, oldScore: 100 } },
  { tag: 'graphing2-control', question: 'standardLine', tool: 'graphing2', work: { points: [[1, -2], [-5, 3]] }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  // y = 2.5 is 0.2 from y = 2.3 (inside the old intercept tolerance 0.24),
  // and no 0.5-grid point is within 0.12 of the line. The both-points rule
  // does not apply to a target the grid cannot reach (targetReachableOnGrid),
  // so the nearest grid line stays right: unchanged, never listed.
  { tag: 'graphing2-void', question: 'horizontalOffGrid', tool: 'graphing2', work: { points: [[0, 2.5], [1, 2.5]] },
    old: [true, 1, { 'point-1': [false, true], 'point-2': [false, true], line: [true, true] }],
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  // z × w = (2 + 3i)(−1 + 2i) = −8 + i, what the old grader took 'divide' for.
  // Today's grader refuses the question, so the old result is pinned whole.
  { tag: 'complex-divide', question: 'complexDivide', tool: 'complexPlaneLab', work: { real: '-8', imaginary: '1' }, ingestBlocked: true,
    oldResult: { graded: true, isComplete: true, isCorrect: true, score: 1, parts: [
      { id: 'real', label: 'Real part', isComplete: true, isCorrect: true, credit: 1, response: '-8' },
      { id: 'imaginary', label: 'Imaginary part', isComplete: true, isCorrect: true, credit: 1, response: '1' },
    ] },
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.COMPLEX_OPERATION_NOT_OFFERED, defect: DEFECT.COMPLEX_OPERATION } },
  // z + w = 1 + 5i: right both times.
  { tag: 'complex-control', question: 'complexAdd', tool: 'complexPlaneLab', work: { real: '1', imaginary: '5' }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  // 'x*1 - 4' equals x − 4 but is not written mx + b.
  { tag: 'bridge-lower', question: 'bridgeGeneral', tool: 'representationBridge', work: { generalForm: { m: '1', b: '-4', equation: 'y = x*1 - 4' } },
    old: [true, 1, { generalForm: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.SLOPE_INTERCEPT_WRITTEN, newCorrect: false, newScore: 0, oldScore: 100 } },
  // '1x - 4' is mx + b with m written: accepted before and after.
  { tag: 'bridge-control', question: 'bridgeGeneral', tool: 'representationBridge', work: { generalForm: { m: '1', b: '-4', equation: 'y = 1x - 4' } }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  // A run whose r is the source's but whose m is not its table's (9 ≠ 1.85).
  { tag: 'regression-lower', question: 'regression', tool: 'regressionCalculator', work: regressionWork({ m: 9 }),
    old: [true, 1, { 'data-entry': [true, true], 'linear-regression': [true, true], 'correlation-produced': [true, true], interpretation: [true, true] }],
    expect: { classification: LOWER, defect: DEFECT.REGRESSION_RUN, newCorrect: false, newScore: 75, oldScore: 100 } },
  { tag: 'regression-control', question: 'regression', tool: 'regressionCalculator', work: regressionWork({}), old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },

  /* --- the compiler drops: the grader is unchanged, so old is today's ------- */
  // The authored P's distances, 2.5 and 2.5: wrong for the stored (4, 2).
  { tag: 'drop-parabola', question: 'parabola', tool: 'parabolaGeometryLab', work: { focusDistance: '2.5', directrixDistance: '2.5', onCurve: 'yes' }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.SHOWN_QUESTION_DIFFERS, defect: DEFECT.PARABOLA_POINT_DROPPED, newCorrect: true, newScore: 100, oldScore: 33 } },
  // The authored offset is the default: the same problem, never listed.
  { tag: 'drop-parabola-offset4', question: 'parabolaOffset4', tool: 'parabolaGeometryLab', work: { focusDistance: '4', directrixDistance: '4', onCurve: 'yes' }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
  // P(3) = 0, a factor: wrong for the stored r = 2 (P(2) = −5, not a factor).
  { tag: 'drop-polynomial', question: 'polynomial', tool: 'polynomialWorkshop', work: { value: '0', factorChoice: 'yes' }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.SHOWN_QUESTION_DIFFERS, defect: DEFECT.POLYNOMIAL_VALUES_DROPPED, newCorrect: true, newScore: 100, oldScore: 0 } },
  // The stored chart (x − 2 ≥ 0) had intervals 0 (−∞, 2), 1 (2, ∞); 1 was
  // its answer. The indexes are of that chart, so no automatic re-grade.
  { tag: 'drop-sign-rational', question: 'signRational', tool: 'signSolutionAnalyzer', work: { selected: [1] }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.SHOWN_QUESTION_DIFFERS, defect: DEFECT.SIGN_RATIONAL_MODE_DROPPED } },
  { tag: 'drop-sign-rational-no-source', question: 'signRationalNoSource', tool: 'signSolutionAnalyzer', work: { selected: [1] }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.SIGN_DENOMINATOR_IGNORED_NO_SOURCE, defect: DEFECT.SIGN_RATIONAL_MODE_DROPPED } },
  // The stored chart (x − 1)(x − 3) ≥ 0: intervals 0 and 2 were its answer.
  { tag: 'drop-sign-numerator', question: 'signNumerator', tool: 'signSolutionAnalyzer', work: { selected: [0, 2] }, old: null,
    expect: { classification: TEACHER, reason: NEEDS_TEACHER_REASON.SHOWN_QUESTION_DIFFERS, defect: DEFECT.SIGN_NUMERATOR_DROPPED } },
  // The author chose 'polynomial': stored exactly as authored.
  { tag: 'drop-sign-authored-polynomial', question: 'signAuthoredPolynomial', tool: 'signSolutionAnalyzer', work: { selected: [1] }, old: null,
    expect: { classification: SAME, defects: [], newCorrect: true, newScore: 100, oldScore: 100 } },
];

/** The browser's tool response for this work (what an envelope carries). */
export const toolResponseFor = (fixture) => gradeToolWork({ toolId: fixture.tool, question: STORED[fixture.question], work: fixture.work }).toolResponse;

/**
 * The grading the pre-K code returned: today's grader on the stored question,
 * with the pinned old verdict laid over it (labels and responses are the
 * same in both).
 */
export const oldGradingFor = (fixture) => {
  // A question today's grader refuses: the old result is pinned whole.
  if (fixture.oldResult) return structuredClone(fixture.oldResult);
  const current = gradeToolWork({ toolId: fixture.tool, question: STORED[fixture.question], work: fixture.work });
  if (!fixture.old) return current;
  const [isCorrect, score, parts] = fixture.old;
  return {
    ...current,
    isCorrect,
    score,
    // A part's credit is its verdict (none of these graders gives part credit).
    parts: current.parts.map((part) => ({
      ...part,
      isCorrect: parts[part.id][0],
      isComplete: parts[part.id][1],
      ...('credit' in part ? { credit: parts[part.id][0] ? 1 : 0 } : {}),
    })),
  };
};

/**
 * The question record and its evidence document exactly as ingestion
 * (functions/shared/submissionIngestion.mjs) writes them for a first attempt
 * graded `grading`, without Firestore.
 */
export const storedAttempt = ({ assignmentId, questionIndex, question, response, grading, submissionId, at }) => {
  const inputs = attemptInputsFromGrading(grading);
  const outcome = recordQuestionAttempt({
    record: null,
    isCorrect: inputs.isCorrect,
    questionDetails: String(question?.prompt || '').slice(0, 400),
    parts: inputs.parts,
    responseKey: String(response?.value || ''),
    partialCreditPercent: inputs.partialCreditPercent,
    occurredAt: at,
  });
  const record = {
    ...outcome.record,
    lastSubmissionId: submissionId,
    submissionOrigin: 'server-ingestion',
    gradedBy: 'server',
    serverGradingReason: null,
    academicOccurredAt: new Date(at).toISOString(),
    ingestedAt: new Date(at).toISOString(),
    recoveredLate: null,
  };
  const evidence = captureAutomaticGradingEvidence({
    response,
    grading: { ...outcome.result, isCorrect: record.status === 'correct', parts: record.partGrades },
    question,
    submittedAt: new Date(at).toISOString(),
    source: 'ordinarySubmission',
    gradingAuthority: 'server',
    graderVersion: grading.graderVersion || 'ordinary-response-v3',
    automaticScore: Math.round(getQuestionCredit(record) * 100),
  });
  return {
    record,
    evidenceDocumentId: responseInspectionEvidenceDocumentId({ assignmentId, questionIndex }),
    evidenceDocument: {
      schemaVersion: evidence.schemaVersion,
      assignmentId,
      questionIndex,
      questionId: question?.questionId || null,
      submissionId,
      variantIndex: 0,
      totalAttempts: Number(record.totalAttempts),
      evidence,
      source: 'server-ingestion',
    },
  };
};

/**
 * Lay an old grading over a record and evidence ingestion wrote with today's
 * grader: the verdict fields the pre-K grader would have produced for this
 * same first attempt, nothing else touched.
 */
export const agedToOldGrading = ({ record, evidenceDocument, question, response, grading }) => {
  const old = storedAttempt({
    assignmentId: evidenceDocument.assignmentId,
    questionIndex: evidenceDocument.questionIndex,
    question,
    response,
    grading,
    submissionId: record.lastSubmissionId,
    at: Date.parse(record.academicOccurredAt),
  });
  const verdictFields = ['status', 'attemptCount', 'totalAttempts', 'partGrades', 'partialCredit', 'bestPartialCredit'];
  const agedRecord = { ...record, ...Object.fromEntries(verdictFields.map((field) => [field, old.record[field]])) };
  return {
    record: agedRecord,
    evidenceDocument: {
      ...evidenceDocument,
      evidence: {
        ...evidenceDocument.evidence,
        automaticResult: old.evidenceDocument.evidence.automaticResult,
        automaticScore: old.evidenceDocument.evidence.automaticScore,
      },
    },
  };
};
