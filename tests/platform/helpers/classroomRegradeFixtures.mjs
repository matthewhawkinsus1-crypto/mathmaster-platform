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
 *   - 2c, 2d, 2e, 2f: the grader changed, so the old verdict is pinned in
 *     OLD_VERDICT. Both the pinned verdicts and the pre-K stored shapes are
 *     checked against the pre-K code itself (commit PRE_K_COMMIT) by the
 *     platform test whenever that commit is in the clone.
 *
 * `expect` is what the report must say, derived by hand in the comments.
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

/** The V5 source the report rebuilds 2a and 2b from (the no-source prompts are absent). */
export const V5_SOURCE = payloadOf([INTENT_2A, INTENT_2B], 'Job K re-grade V5 source');

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
});

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
};

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
];

/** The browser's tool response for this work (what an envelope carries). */
export const toolResponseFor = (fixture) => gradeToolWork({ toolId: fixture.tool, question: STORED[fixture.question], work: fixture.work }).toolResponse;

/**
 * The grading the pre-K code returned: today's grader on the stored question,
 * with the pinned old verdict laid over it (labels and responses are the
 * same in both).
 */
export const oldGradingFor = (fixture) => {
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
