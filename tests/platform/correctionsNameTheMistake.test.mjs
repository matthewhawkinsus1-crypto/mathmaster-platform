// HELP-13 (QA pass 3, 03-help-and-self-correction.md): Test Cycle Corrections
// said "Your answers showed a specific mistake pattern" and never named it,
// and a miss answered "Not yet. Look again at what the question is asking you
// to find…" whatever the student did.
//
//   (a) the recorded code reaches the screen as its student message;
//   (b) a miss the item's own work explains gets that message instead of the
//       generic line — read from the server-held item, never stating the answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  correctionTargetMistakePattern,
  describeCorrectionTargetForStudent,
} from '../../src/platform/student/testCycleDiscovery.js';
import { MISCONCEPTION_STUDENT_MESSAGES, studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import { CORRECTION_MISS_DIAGNOSIS_TOOLS, diagnoseCorrectionMiss } from '../../functions/shared/correctionMissDiagnosis.mjs';
import { buildAttemptSupportPayload } from '../../functions/shared/pathSolutionSupport.mjs';
import { buildMisconceptionEvidence } from '../../functions/shared/misconceptionCodes.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const mathPath = require('./lib/mathPath');
const secureItems = require('./lib/secureItems');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

const GENERIC = /Look again at what the question is asking you to find/;

/* ---------------------------------------------------------------- (a) ---- */

test('(a) a recorded mistake pattern is named in its student message; nothing is named without one', () => {
  const target = { missed: 2, diagnosis: 'misconception', misconception: 'slope-sign-reversed' };
  assert.equal(correctionTargetMistakePattern(target), MISCONCEPTION_STUDENT_MESSAGES['slope-sign-reversed']);
  assert.match(describeCorrectionTargetForStudent(target), /showed the mistake named below/);
  assert.doesNotMatch(describeCorrectionTargetForStudent(target), /slope-sign-reversed/, 'never the code itself');
  // A standard diagnosis names nothing, even with a stray code on it.
  assert.equal(correctionTargetMistakePattern({ diagnosis: 'standard', misconception: 'slope-sign-reversed' }), null);
  // A code this build has no message for degrades to the old sentence.
  const unknown = { diagnosis: 'misconception', misconception: 'a-future-code' };
  assert.equal(correctionTargetMistakePattern(unknown), null);
  assert.match(describeCorrectionTargetForStudent(unknown), /specific mistake pattern/);
});

test('(a) a plan built from server-proved Test evidence names that pattern on the student screen', () => {
  const blueprint = {
    title: 'Unit 3 Test (synthetic)', passingScore: 70,
    targets: [{ targetId: 't1', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 2, familyIds: ['f1', 'f2'] }],
  };
  // The block a server classifier builds (the registry's own builder).
  const proved = buildMisconceptionEvidence({ classifierId: 'tool:relationMapping/default', findings: [{ code: 'domain-range-swapped', parts: ['domain', 'range'] }] });
  assert.ok(proved, 'the fixture is real server provenance');
  const responses = [{ targetId: 't1', slotId: 't1#1', familyId: 'f1', questionInstanceId: 'i1', score: 0, isCorrect: false, grading: { score: 0, isCorrect: false, misconceptionEvidence: proved } }];
  const plan = buildCorrectionPlan({ blueprint, profile: buildPerformanceProfile({ blueprint, responses }), policy: { mode: 'testCycle' }, releasedTestGrade: 0, assignmentId: 'A1', studentId: 'S1' });
  const [target] = plan.targets;
  assert.equal(target.diagnosis, 'misconception');
  assert.equal(target.misconception, 'domain-range-swapped');
  assert.equal(correctionTargetMistakePattern(target), studentMisconceptionMessage('domain-range-swapped'));
  // A legacy plan's free-text label has no message, so nothing is named.
  assert.equal(correctionTargetMistakePattern({ diagnosis: 'misconception', misconception: 'distributes-sign-once' }), null);
});

test('(a) the student plan carries the code (and only for a misconception diagnosis); the screen shows its message', () => {
  const visible = region(functionsIndex, 'function studentVisibleCorrectionPlan(', 'const CORRECTION_ATTEMPTS_PER_QUESTION', 'studentVisibleCorrectionPlan');
  assert.match(visible, /\n\s*misconception: target\.diagnosis === "misconception" \? \(target\.misconception \|\| null\) : null,/);
  const screen = componentSource('src/components/student/TestCycleCorrections.jsx');
  assert.match(screen, /const activePattern = activeTarget \? correctionTargetMistakePattern\(activeTarget\) : null;/);
  const box = region(screen, '{activePattern && (', ')}', 'pattern box');
  assert.match(box, /data-corrections-pattern=""/);
  assert.match(box, /\{activePattern\}/);
});

/* ---------------------------------------------------------------- (b) ---- */

const issue = async (question) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, 'the fixture issues as a real corrections item');
  return secureItems.storableItem({ ...question, questionInstanceId: 'correction-x', privateGrading: plan.privateGrading, ...plan.toolPayload });
};

// Exactly what submitTestCycleCorrectionResponse does: grade the stored item,
// then diagnose from the same stored definition and the bounded raw work.
const answer = async (stored, raw) => {
  const grading = await secureItems.gradeIssuedItem(stored, { raw });
  const diagnosis = diagnoseCorrectionMiss({
    privateGrading: secureItems.readStoredItem(stored).privateGrading,
    grading,
    raw: await secureItems.rawWorkOf({ raw }),
  });
  return { grading, diagnosis };
};

const SYSTEM = { pathToolId: 'system', prompt: 'Solve the system.', equations: ['x + y = 8', 'x - y = 2'], answer: [5, 3] };
const RAY = { pathToolId: 'intervalNumberLine', prompt: 'Graph the solution of x > 4.', expectedIntervals: [{ min: 4, max: null, minClosed: false }], ask: ['graph'] };

test('(b) a system answered with x and y exchanged is told to check the order, and nothing else is', async () => {
  const stored = await issue(SYSTEM);
  const swapped = await answer(stored, { x: 3, y: 5 });
  assert.equal(swapped.grading.isCorrect, false);
  assert.equal(swapped.diagnosis?.code, 'ordered-pair-reversed');
  assert.equal(swapped.diagnosis.message, MISCONCEPTION_STUDENT_MESSAGES['ordered-pair-reversed']);
  assert.equal((await answer(stored, { value: '(3, 5)' })).diagnosis?.code, 'ordered-pair-reversed', 'typed as a pair');
  assert.equal((await answer(stored, { x: 4, y: 4 })).diagnosis, null, 'a different wrong point names nothing');
  assert.equal((await answer(stored, { x: 3, y: 7 })).diagnosis, null, 'y in the x place alone is not an exchange');
  assert.equal((await answer(stored, { x: 2, y: 5 })).diagnosis, null, 'nor x in the y place alone');
  assert.equal((await answer(stored, { x: 5, y: 3 })).diagnosis, null, 'a correct answer is not diagnosed');
  // Only the grader's own verdict on the point is read: a point it accepted is
  // never called reversed, whatever the definition says.
  assert.equal(diagnoseCorrectionMiss({
    privateGrading: secureItems.readStoredItem(stored).privateGrading,
    grading: { isCorrect: false, parts: [{ id: 'solution', isCorrect: true }, { id: 'classification', isCorrect: false }] },
    raw: { x: 3, y: 5 },
  }), null);
});

test('(b) a number-line graph with a wrong endpoint, or the ray reversed, is named; another wrong graph is not', async () => {
  const stored = await issue(RAY);
  assert.equal((await answer(stored, { intervals: [{ min: 4, max: null, minClosed: true, maxClosed: false }] })).diagnosis?.code, 'endpoint-inclusion-error');
  assert.equal((await answer(stored, { intervals: [{ min: null, max: 4, minClosed: false, maxClosed: false }] })).diagnosis?.code, 'inequality-direction-reversed');
  assert.equal((await answer(stored, { intervals: [{ min: 6, max: null, minClosed: false, maxClosed: false }] })).diagnosis, null);
  assert.equal((await answer(stored, { intervals: [{ min: 4, max: null, minClosed: false, maxClosed: false }] })).diagnosis, null, 'correct');
  // The grader's verdict on the graph is what is read.
  assert.equal(diagnoseCorrectionMiss({
    privateGrading: secureItems.readStoredItem(stored).privateGrading,
    grading: { isCorrect: false, parts: [{ id: 'graph', isCorrect: true }, { id: 'notation', isCorrect: false }] },
    raw: { intervals: [{ min: 4, max: null, minClosed: true, maxClosed: false }] },
  }), null);
});

test('(b) the diagnosis is fixed text: no value from the item, never a refused item or an unmodeled answer, never throws', async () => {
  for (const code of ['ordered-pair-reversed', 'endpoint-inclusion-error', 'inequality-direction-reversed']) {
    assert.doesNotMatch(studentMisconceptionMessage(code), /\b[35]\b/, `${code} carries no value from the item`);
  }
  // Wave 7 extends the tools to every Path shape a platform classifier's rule
  // reads (tests/platform/secureTestMistakeEvidence.test.mjs proves each one).
  assert.deepEqual([...CORRECTION_MISS_DIAGNOSIS_TOOLS].sort(), ['dataModelingLab', 'fields', 'graphing2', 'intervalNumberLine', 'multiAnswer', 'relationMapping', 'system', 'systemsWorkspace']);
  // A refused (unfinished) answer is not a miss.
  assert.equal(diagnoseCorrectionMiss({ privateGrading: { pathToolId: 'system', definition: { solution: [5, 3] } }, grading: { isCorrect: false, rejected: true, parts: [{ id: 'solution', isCorrect: false }] }, raw: { x: 3, y: 5 } }), null);
  // A field item names only a right line in the wrong form: a wrong number names nothing.
  assert.equal(diagnoseCorrectionMiss({ privateGrading: { fields: [{ id: 'a', expected: '5' }] }, grading: { isCorrect: false, parts: [{ id: 'a', isCorrect: false }] }, raw: null, responses: { a: '3' } }), null);
  assert.equal(diagnoseCorrectionMiss({ privateGrading: { pathToolId: 'system', definition: null }, grading: { isCorrect: false, parts: null }, raw: { x: {} } }), null);
});

test('(b) what the student is told: authored answer message, then the diagnosis, then authored feedback, then the generic line', () => {
  const diagnosis = { message: MISCONCEPTION_STUDENT_MESSAGES['ordered-pair-reversed'] };
  const bare = { attemptFeedback: [], supportHints: [], misconceptions: [], solutionReview: { headline: 'H', reasoning: ['R'] } };
  const open = (support, extra = {}) => buildAttemptSupportPayload({ support, attemptNumber: 1, attemptsAllowed: 3, responsePayload: { responses: { a: '3, 5' } }, ...extra });
  assert.match(open(bare).feedback.message, GENERIC, 'the premise: without a diagnosis the generic line');
  const diagnosed = open(bare, { diagnosis });
  assert.equal(diagnosed.feedback.message, diagnosis.message);
  assert.equal(diagnosed.solutionReview, null, 'still nothing that states the answer while the item is open');
  assert.equal(open({ ...bare, attemptFeedback: ['Authored feedback.'] }, { diagnosis }).feedback.message, diagnosis.message);
  assert.equal(open({ ...bare, misconceptions: [{ match: ['3, 5'], message: 'The teacher message.' }] }, { diagnosis }).feedback.message, 'The teacher message.');
  // The last miss names it before pointing at the review.
  const closed = buildAttemptSupportPayload({ support: bare, attemptNumber: 3, attemptsAllowed: 3, questionFinalized: true, diagnosis });
  assert.ok(closed.feedback.message.startsWith(`${diagnosis.message} That is the last attempt`));
  assert.equal(buildAttemptSupportPayload({ support: bare, isCorrect: true, diagnosis }).feedback.message, 'Correct.');
});

test('(b) the corrections callable diagnoses a miss from the stored item and hands it to the support payload', () => {
  const submit = region(functionsIndex, 'exports.submitTestCycleCorrectionResponse = onCall(', '\n});\n', 'corrections submit');
  assert.match(submit, /\n\s*const diagnosis = grading\.isCorrect === true \? null : await correctionMissDiagnosisFor\(openForGrading, grading, request\.data\?\.responsePayload\);/);
  const support = region(submit, 'const support = await mathPath.attemptSupport({', '});', 'attempt support');
  assert.match(support, /\n\s*diagnosis,\n/);
  const helper = executableSource(region(functionsIndex, 'async function correctionMissDiagnosisFor(', '\n}\n', 'diagnosis helper'));
  // The stored item is the authority: its private grading, the bounded tool
  // work or the typed responses, and the item itself (a field's own words say
  // which line form it asks for).
  assert.match(helper, /const item = secureItems\.readStoredItem\(storedItem\) \|\| \{\};/);
  assert.match(helper, /const privateGrading = item\.privateGrading \|\| null;/);
  assert.match(helper, /await secureItems\.rawWorkOf\(responsePayload \|\| \{\}\)/);
  assert.match(helper, /import\("\.\/shared\/correctionMissDiagnosis\.mjs"\)/);
  assert.match(helper, /return diagnoseCorrectionMiss\(\{ privateGrading, grading, raw, responses, question: item \}\);/);
});
