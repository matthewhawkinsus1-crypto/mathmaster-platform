// FEEDBACK THAT TEACHES — the classroom Path pattern (Student push, Job A).
//
// A miss used to say only "Not quite. You have N attempts remaining on this
// version." Now: a specific, non-revealing message for the miss (the server's
// own misconception classifiers, run display-only, then cheap generic checks),
// a hint offered from the second miss, and a worked solution once the
// question closes. This suite holds the rules that make that safe:
//
//   1  every registry code has a student message that names the error, never
//      the answer and never the student
//   2  the diagnosis is display only: it never touches the grading result and
//      never reaches the attempt recorder
//   3  nothing beyond right/wrong while an assessment item can still be
//      answered; a server-graded host keeps its own feedback
//   4  a hint is never a smaller answer; hints follow Path's release rule
//   5  the back-up step is recorded but is not counted as help; a worked
//      example is
//   6  "Ask my teacher" writes only a time and a question position
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MISCONCEPTION_REGISTRY } from '../../functions/shared/misconceptionCodes.mjs';
import { MISCONCEPTION_STUDENT_MESSAGES, codesWithoutStudentMessage, studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { genericMissCheck, GENERIC_MISS_MESSAGES } from '../../src/platform/supports/feedback/genericMissChecks.js';
import { diagnoseMiss, displayFamilyValues, expectedForPart } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { closedAttemptText, feedbackOpenForItem, hintOfferedAfterMiss, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { partialCreditBreakdown } from '../../src/platform/supports/feedback/partialCreditBreakdown.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildQuestionHints, hintRelease } from '../../src/platform/supports/hints/questionHints.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { helpRequestAfterClose, helpRequestFields, nextHelpRequest } from '../../src/platform/supports/helpRequest.js';
import { familyInstance } from './helpers/misconceptionFixtures.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------ 1. messages */

test('1. every registry code has a student message: names the error, carries no number, never labels the student', () => {
  assert.deepEqual(codesWithoutStudentMessage(), []);
  assert.equal(Object.keys(MISCONCEPTION_STUDENT_MESSAGES).length, MISCONCEPTION_REGISTRY.length, 'no message for a code that does not exist');
  MISCONCEPTION_REGISTRY.forEach(({ id }) => {
    const message = studentMisconceptionMessage(id);
    // Fixed text: no digit, so no value of any question can be in it (the
    // definitional "where y = 0" and formula notation — x², −b/(2a) — are
    // the only numbers allowed).
    assert.doesNotMatch(message.replace(/(?:=|equals?(?: to)?) 0\b|²|\(2a\)/g, ''), /\d/, `${id}: no numbers`);
    assert.doesNotMatch(message, /\b(careless|lazy|you are|you're|you always|you never|wrong student)\b/i, `${id}: about the work, not the student`);
    assert.ok(message.length > 40 && message.length < 260, `${id}: a sentence or two`);
  });
  Object.values(GENERIC_MISS_MESSAGES).forEach((message) => assert.doesNotMatch(message, /\d/));
  assert.equal(studentMisconceptionMessage('constructor'), null, 'own keys only');
});

/* ------------------------------------------------------ generic checks */

test('the generic checks name a sign flip, a swapped pair, a reciprocal and an unsimplified fraction — and nothing else', () => {
  assert.equal(genericMissCheck({ student: '-4', expected: '4' })?.check, 'sign-flipped');
  assert.equal(genericMissCheck({ student: '(3, 2)', expected: [2, 3] })?.check, 'coordinates-swapped');
  assert.equal(genericMissCheck({ student: '(-2, -3)', expected: '(2, 3)' })?.check, 'sign-flipped');
  assert.equal(genericMissCheck({ student: '1/4', expected: '4' })?.check, 'reciprocal');
  assert.equal(genericMissCheck({ student: '\\frac{2}{3}', expected: '3/2' })?.check, 'reciprocal');
  assert.equal(genericMissCheck({ student: '6/8', expected: '3/4' })?.check, 'not-simplified');
  // Not explained, so nothing is claimed.
  assert.equal(genericMissCheck({ student: '5', expected: '4' }), null);
  assert.equal(genericMissCheck({ student: '1', expected: '1' }), null, 'a correct value is never a miss');
  assert.equal(genericMissCheck({ student: '3/4', expected: '0.75' }), null, 'a reduced fraction is not "unsimplified"');
  assert.equal(genericMissCheck({ student: '1', expected: '-1' })?.check, 'sign-flipped');
  assert.equal(genericMissCheck({ student: '1', expected: '1' }), null);
  assert.equal(genericMissCheck({ student: '0', expected: '0' }), null);
  assert.equal(genericMissCheck({ student: '(2, 2)', expected: '(2, 2)' }), null);
  assert.equal(genericMissCheck({ student: '-1', expected: '1' })?.check, 'sign-flipped', 'not a reciprocal: ±1 is its own');
  assert.equal(genericMissCheck({}), null);
});

/* --------------------------------------------- 2. display only, not a grade */

// Seat 3 of this synthetic assignment draws −9x + 2 = 74, where the
// inverse-operation-sign value (−76/9) matches no other modelled error.
const ASSIGNMENT_ID = 'a-two-step';
const twoStepSlot = { questionId: 'q-two-step', type: 'multiAnswer', activityRole: 'classwork', questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' } };
const delivered = resolveFamilyQuestionInstance({
  question: twoStepSlot,
  assignmentId: ASSIGNMENT_ID,
  storageIndex: 0,
  allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' },
});
const onScreen = { ...delivered.question, familyDelivery: delivered.delivery };
const browserGrading = (question, responses) => {
  const graded = gradeMultiAnswerResponse(question, responses);
  return { graded: true, isCorrect: graded.parts.every((part) => part.isCorrect), parts: graded.parts };
};

test('2. the miss message comes from the server\'s own classifier, on values the browser reproduces from the pin', () => {
  assert.ok(!delivered.error, 'a real family instance');
  const values = displayFamilyValues({ template: twoStepSlot, delivered: onScreen, assignmentId: ASSIGNMENT_ID, storageIndex: 0 });
  assert.deepEqual(values, delivered.instance.values, 'the same values the server reproduces');
  const { a, b, c } = values;
  // ax + b = c treated as ax = c + b: the inverse-operation-sign value.
  const grading = browserGrading(onScreen, { solution: String((c + b) / a) });
  assert.equal(grading.isCorrect, false);
  const before = JSON.stringify(grading);
  const diagnosis = diagnoseMiss({ question: onScreen, grading, response: null, familyValues: values });
  assert.equal(JSON.stringify(grading), before, 'the grading result is untouched');
  assert.equal(diagnosis?.source, 'classifier');
  assert.equal(diagnosis.code, 'inverse-operation-sign');
  assert.equal(diagnosis.message, studentMisconceptionMessage('inverse-operation-sign'));
  // Without the reproduced values the classifier cannot speak; nothing is guessed.
  const unexplained = diagnoseMiss({ question: onScreen, grading, response: null, familyValues: null });
  assert.notEqual(unexplained?.code, 'inverse-operation-sign');
  // Correct work is never diagnosed.
  const right = browserGrading(onScreen, { solution: String(values.x) });
  assert.equal(right.isCorrect, true);
  assert.equal(diagnoseMiss({ question: onScreen, grading: right, response: null, familyValues: values }), null);
  // Two explanations for one value is no explanation: on −2x − 14 = 0 the
  // kept-sign value is also the sign-flipped answer, so the classifier
  // abstains and only the plainer generic check speaks.
  const ambiguous = resolveFamilyQuestionInstance({ question: twoStepSlot, assignmentId: 'a-feedback-synthetic', storageIndex: 0, allocation: { seat: 3, variant: 0, stride: 40, index: 3, basis: 'seated' } });
  const av = ambiguous.instance.values;
  assert.equal((av.c + av.b) / av.a, -av.x, 'the fixture is the ambiguous one');
  const both = diagnoseMiss({ question: ambiguous.question, grading: browserGrading(ambiguous.question, { solution: String((av.c + av.b) / av.a) }), familyValues: av });
  assert.deepEqual([both?.source, both?.code], ['generic', 'sign-flipped']);
  // Another pin is not this instance.
  assert.equal(displayFamilyValues({ template: twoStepSlot, delivered: { familyDelivery: { ...delivered.delivery, fingerprint: 'other' } }, assignmentId: ASSIGNMENT_ID, storageIndex: 0 }), null);
});

test('2. where no classifier fires, a generic check speaks for a plain multi-answer key', () => {
  const question = { type: 'multiAnswer', answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4' }, { id: 'point', label: 'Point', answer: '(2, 5)' }] };
  assert.equal(expectedForPart(question, { id: 'slope' }), '3/4');
  const grading = browserGrading(question, { slope: '-3/4', point: '(2, 5)' });
  assert.equal(diagnoseMiss({ question, grading })?.code, 'sign-flipped');
  const swapped = browserGrading(question, { slope: '3/4', point: '(5, 2)' });
  assert.equal(diagnoseMiss({ question, grading: swapped })?.code, 'coordinates-swapped');
  const unexplained = browserGrading(question, { slope: '7', point: '(2, 5)' });
  assert.equal(diagnoseMiss({ question, grading: unexplained }), null, 'an unmodelled miss gets no invented reason');
  assert.equal(diagnoseMiss({ question: null, grading }), null);
  assert.equal(diagnoseMiss({ question, grading: { graded: false, parts: [] } }), null);
});

test('2. the grade and the recorded evidence are identical with and without the display', () => {
  // The recorder never receives a code: the classroom engine computes the
  // message after onGrade returned, from state the recorder never sees.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const handler = region(engine, 'const handleMissingToolAction = async', 'const handleModelingLabGrade', 'registry tool forwarder');
  assert.doesNotMatch(handler, /misconception|diagnos/i);
  const usage = region(engine, 'const attemptSupportUsage = () => ({', '});', 'the attempt support usage');
  assert.doesNotMatch(usage, /diagnos|missDetail|gradedForDisplay/);
  (engine.match(/onGrade\??\.?\(([\s\S]*?)\);/g) || []).forEach((call) => assert.doesNotMatch(call, /diagnos|missDetail|gradedForDisplay/));
  const detail = region(engine, 'const missDetail = useMemo(() => {', '}, [', 'the display-only miss detail');
  assert.match(detail, /if \(!feedback \|\| feedback\.isCorrect \|\| feedback\.blocked \|\| !feedbackOpen\) return null;/);
  assert.match(detail, /gradedForDisplay\.feedback !== feedback/, 'only for the attempt on screen');
});

/* ------------------------------------- 3. the gate for anything beyond right/wrong */

test('3. no feedback, diagnosis or review while an assessment item can still be answered', () => {
  // practice: immediate feedback, open or closed
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: true, closed: false }), true);
  // DOL / quiz / test before release: nothing
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: false, immediateFeedback: false, closed: true }), false);
  // released, but the item can still be answered: nothing
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: false }), false);
  // released and closed: the review may show
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: true }), true);
  // a server-graded host (Path, Test Cycle, Live Challenge) owns its feedback
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: true, closed: true, serverGraded: true }), false);

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /const feedbackOpen = feedbackOpenForItem\(\{\s*showOutcomeFeedback,\s*immediateFeedback: resolvedActivityPolicy\?\.feedback === 'immediate',\s*closed: locked,\s*serverGraded,\s*\}\);/);
  assert.match(engine, /const closedReview = \(isCorrect \|\| isExpired\) && feedbackOpen \? \(/);
  // The hint control follows the activity's help policy, and a server-graded host keeps its own.
  assert.match(engine, /const hintControlAllowed = toolHintsAllowed && !serverGrading;/);
  assert.match(engine, /const toolHintsAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false;/);
});

test('3. a closed question points at a worked solution only when there is one', () => {
  assert.match(closedAttemptText({ maximumAttempts: 3, reviewAvailable: true }), /final allowed attempt \(3 total\)\. This response is locked\. The worked solution is below\.$/);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 3, reviewAvailable: false }), /below|review/i);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 3, reviewAvailable: false, allowReplacement: true }), /below|review/i);
  assert.match(closedAttemptText({ maximumAttempts: 2, reviewAvailable: true, allowReplacement: true }), /request a new question/);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 2, reviewAvailable: true, allowReplacement: false }), /new question|another problem/);
  // The legacy intro no longer promises another problem it cannot give.
  const legacy = executableSource(read('src/SolutionReview.jsx'));
  assert.match(legacy, /allowReplacement\s*\?\s*'This problem version is closed\. Review the solution before requesting another problem at the same difficulty\.'\s*:\s*'This problem version is closed\. Compare your work with the solution\.'/);
});

test('3. the review reads the authored solutionReview the compiler already copies', () => {
  const question = {
    type: 'multiAnswer',
    answerFields: [{ id: 'x', answer: '4' }],
    solutionReview: { headline: 'Undo the operations in reverse order.', reasoning: ['Subtract 5 from both sides: 3x = 12.', 'Divide both sides by 3: x = 4.'], answerSummary: 'x = 4' },
  };
  const review = buildClosedQuestionReview({ question });
  assert.equal(review.hasContent, true);
  assert.deepEqual(review.authored.reasoning, question.solutionReview.reasoning);
  assert.match(review.speechText, /Subtract 5 from both sides/);
  const empty = buildClosedQuestionReview({ question: { type: 'multiAnswer' } });
  assert.equal(empty.hasContent, false);
  assert.match(empty.intro, /not available/);
  assert.equal(buildClosedQuestionReview({ question: { type: 'multiAnswer' }, legacyContent: () => ({ hasContent: true }) }).hasContent, true);
});

/* ------------------------------------------------------------ 4. hints */

test('4. specific feedback first: an authored wrong-answer message, then the diagnosis, then authored feedback', () => {
  const question = {
    attemptFeedback: ['Check which operation you undid first.', 'Look at the sign of each term.'],
    misconceptions: [{ match: ['16'], message: 'It looks like 4 was added instead of subtracted.' }],
  };
  assert.equal(missFeedback({ question, parts: [{ response: '16' }], diagnosis: { message: 'diag', source: 'generic' } }).source, 'authored-misconception');
  assert.equal(missFeedback({ question, parts: [{ response: '9' }], diagnosis: { message: 'diag', source: 'generic' } }).message, 'diag');
  assert.equal(missFeedback({ question, parts: [{ response: '9' }], attemptNumber: 2 }).message, 'Look at the sign of each term.');
  assert.equal(missFeedback({ question: {}, parts: [{ response: '9' }] }), null, 'never padded with a generic line');
  assert.equal(hintOfferedAfterMiss({ attemptNumber: 1, hintsAvailable: true }), false, 'one miss is a slip');
  assert.equal(hintOfferedAfterMiss({ attemptNumber: 2, hintsAvailable: true }), true);
  assert.equal(hintOfferedAfterMiss({ attemptNumber: 2, hintsAvailable: true, open: false }), false);
});

test('4. every question type has a hint, authored first — and a hint that contains the answer is dropped', () => {
  const multi = { type: 'multiAnswer', prompt: 'Find the slope.', answerFields: [{ id: 'slope', label: 'Slope', answer: '7/3' }] };
  const fallback = buildQuestionHints(multi);
  assert.ok(fallback.length >= 1, 'multi-answer gets at least the generic hint');
  const authored = buildQuestionHints({ ...multi, supportHints: ['Slope is rise over run: compare the change in y with the change in x.', 'The slope is 7/3.'], hints: 'Pick two points on the line.' });
  assert.equal(authored[0].source, 'authored');
  assert.equal(authored[0].text, 'Slope is rise over run: compare the change in y with the change in x.');
  assert.ok(authored.some((hint) => hint.text === 'Pick two points on the line.'), 'the hints field the compiler now keeps is read');
  assert.ok(!authored.some((hint) => /7\/3/.test(hint.text)), 'the leaking authored hint is gone');
  const system = buildQuestionHints({ type: 'system', solution: [2, -1], hint: 'The solution is (2, -1).' });
  assert.ok(!system.some((hint) => hint.text.includes('(2, -1)')));
});

test('4. Path\'s release rule: the first hint on request, each next one after another attempt; none where help is withheld', () => {
  const hints = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
  assert.deepEqual(hintRelease({ hints, revealed: 0, attemptCount: 0 }).canRevealNext, true);
  assert.equal(hintRelease({ hints, revealed: 1, attemptCount: 0 }).canRevealNext, false);
  assert.equal(hintRelease({ hints, revealed: 1, attemptCount: 0 }).waitingForAttempt, true);
  assert.equal(hintRelease({ hints, revealed: 1, attemptCount: 1 }).canRevealNext, true);
  assert.equal(hintRelease({ hints, revealed: 3, attemptCount: 5 }).canRevealNext, false);
  assert.equal(hintRelease({ hints, hintsAllowed: false }).allowed, false, 'DOL / quiz / test');
  assert.equal(hintRelease({ hints, closed: true }).allowed, false, 'a closed question');
});

test('4. a worked sibling is never this question in disguise', () => {
  const question = { type: 'multiAnswer', prompt: 'Solve 3x + 5 = 17.', answerFields: [{ id: 'x', answer: '4' }] };
  const example = { prompt: 'Solve 2x + 1 = 9.', steps: ['Subtract 1 from both sides: 2x = 8.', 'Divide both sides by 2: x = 4.'], answer: 'x = 4' };
  assert.equal(similarExampleIsSafe(question, { ...example, answer: '4' }), false, 'same answer');
  assert.equal(similarExampleIsSafe(question, { prompt: 'Solve 2x + 1 = 11.', steps: ['Subtract 1: 2x = 10.', 'Divide by 2: x = 5.'], answer: '5' }), true);
  assert.equal(similarExampleIsSafe(question, { prompt: question.prompt, steps: ['…'], answer: '5' }), false, 'same prompt');
  assert.equal(similarExampleIsSafe(question, { prompt: 'Solve 2x = 10.', steps: ['Check: 4 is not it.'], answer: '5' }), false, 'a step that names this answer');
  assert.equal(similarExampleIsSafe(question, null), false);
});

/* ------------------------------------------------- 5. what counts as help */

test('5. the back-up step is recorded and not counted as help; a hint or a worked example is', () => {
  const base = { record: null, isCorrect: true, maximumAttempts: 3, parts: [] };
  const backUp = recordQuestionAttempt({ ...base, supportUsage: { backUpStepUsed: true, scaffoldUsed: false, isMathematicallyIndependent: true } });
  assert.equal(backUp.record.supportUsage.backUpStepUsed, true, 'recorded');
  assert.equal(backUp.record.supportUsage.isMathematicallyIndependent, true, 'not a penalty');
  const example = recordQuestionAttempt({ ...base, supportUsage: { workedExampleUsed: true } });
  assert.equal(example.record.supportUsage.workedExampleUsed, true);
  assert.equal(example.record.supportUsage.isMathematicallyIndependent, false);
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const usage = region(engine, 'const attemptSupportUsage = () => ({', '});', 'the attempt support usage');
  assert.match(usage, /backUpStepUsed: Boolean\(scaffoldComplete\),/);
  assert.match(usage, /scaffoldUsed: false,/);
  assert.match(usage, /workedExampleUsed: Boolean\(workedExampleUsed\),/);
  assert.match(usage, /isMathematicallyIndependent: !hintUsed && !workedExampleUsed,/);
  const reveal = region(engine, 'const revealNextHint = () => {', '};', 'revealing a hint');
  assert.match(reveal, /recordHintUse\(\);/, 'every hint revealed is recorded');
  const similar = region(engine, 'const openSimilarExample = () => {', '};', 'opening a worked example');
  assert.match(similar, /setWorkedExampleUsed\(true\);/);
});

test('5. the back-up question is authored, else the family\'s, else one that is true of every item', () => {
  const authored = backUpStepFor({ type: 'stepAlgebra', scaffold: { prompt: 'First move?', options: ['Add 3', 'Divide by 2'], correct: 'Add 3' } });
  assert.equal(authored.source, 'authored');
  const platform = backUpStepFor({ type: 'stepAlgebra', equation: 'x/3 = 4' });
  assert.ok(platform.options.includes(platform.correct));
  assert.doesNotMatch(platform.prompt, /undoes multiplication/, 'not the same multiplication question on every equation');
  assert.equal(backUpStepFor({ type: 'stepAlgebra', scaffold: { prompt: 'Bad', options: ['A'], correct: 'B' } }).source !== 'authored', true, 'a malformed scaffold is not used');
  assert.ok(backUpStepFor(null).options.length >= 2);
});

/* ------------------------------------------------- partial credit */

test('"40% partial credit so far" says which parts, never what the answers are', () => {
  const record = { partGrades: [
    { id: 'slope', label: 'Slope', isCorrect: true, graded: true },
    { id: 'b', label: 'y-intercept', isCorrect: false, graded: true, response: '7' },
    { id: 'eq', label: 'Equation', isCorrect: false, graded: true },
    { id: 'note', label: 'Notes', graded: false },
  ] };
  assert.equal(partialCreditBreakdown(record), 'last attempt: 1 of 3 parts right — still to fix: y-intercept, Equation');
  assert.equal(partialCreditBreakdown({ partGrades: [] }), '');
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // Same gate as the miss message: a released quiz or test item that can
  // still be answered gets the percentage, never which parts are wrong.
  assert.match(engine, /\{feedbackOpen && partialBreakdown \?/);
  assert.doesNotMatch(engine, /\{showOutcomeFeedback && partialBreakdown \?/);
});

/* ------------------------------------------------- 6. Ask my teacher */

test('6. "Ask my teacher" adds a time and a question position to the student\'s own presence, for this assignment only', () => {
  const request = nextHelpRequest({ requested: true, assignmentId: 'A1', questionIndex: 2, now: 1_700_000_000_000 });
  assert.deepEqual(helpRequestFields(request, { assignmentId: 'A1' }), { helpRequestedAt: 1_700_000_000_000, helpQuestionIndex: 2 });
  assert.deepEqual(helpRequestFields(request, { assignmentId: 'A2' }), {}, 'another assignment');
  assert.equal(nextHelpRequest({ requested: false, assignmentId: 'A1' }), null, 'cancelled');
  assert.deepEqual(helpRequestFields(null, { assignmentId: 'A1' }), {});
  // Closing the question it was raised on lowers the hand; other questions do not.
  assert.equal(helpRequestAfterClose(request, { 2: { status: 'correct' } }), null);
  assert.equal(helpRequestAfterClose(request, { 2: { status: 'expired' } }), null);
  assert.equal(helpRequestAfterClose(request, { 2: { status: 'attempted' } }), request, 'still working: still raised (same object)');
  assert.equal(helpRequestAfterClose(request, { 5: { status: 'correct' } }), request);
  assert.equal(helpRequestAfterClose(null, { 2: { status: 'correct' } }), null);

  // Wired: imported where it is used (nothing imports App.jsx, so a missing
  // import passes every other gate).
  const app = read('src/App.jsx');
  assert.match(app, /^import \{ helpRequestAfterClose, helpRequestFields, nextHelpRequest \} from '\.\/platform\/supports\/helpRequest\.js';$/m);
  // A raised hand comes down when its question closes (the toggle is gone
  // from a closed question, so nothing else could lower it).
  assert.match(app, /useEffect\(\(\) => \{ setHelpRequest\(\(current\) => helpRequestAfterClose\(current, activeWorkingTracker\)\); \}, \[activeWorkingTracker\]\);/);
  assert.match(app, /\.\.\.helpRequestFields\(helpRequest, \{ assignmentId: activeAssignmentId \}\),/);
  assert.match(app, /onAskTeacher=\{preview \|\| lifecycle\.isPracticeOnly \|\| user\?\.role !== 'student'\s*\? null\s*: \(requested\) => setHelpRequest\(nextHelpRequest\(\{ requested, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex \}\)\)\}/);
  // Published only after the stale document is deleted (a write before it
  // would be deleted and archived as a session of its own).
  const start = region(app, 'const startPresence = async () => {', '};', 'starting presence');
  assert.ok(start.indexOf('publishPresenceNowRef.current = publishLatest;') > start.indexOf('await deleteDoc(presenceRef);'));
});

/* ------------------------------------------- the compiler keeps authored hints */

test('the V5 compiler keeps a question\'s authored hints, so the Hint control can read them', async () => {
  const { compileAuthoringIntentV5 } = await import('../../src/platform/contract/authoringIntentV5.js');
  const source = JSON.parse(read('teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json'));
  const first = source.sections[0].questions[0];
  source.sections[0].questions[0] = { ...first, hints: ['Compare f(x − 4) with f(x): which way does the graph move?'], hint: 'Look at the + 3 outside the function.' };
  const compiled = compileAuthoringIntentV5(source);
  const question = compiled.package.sections[0].questions[0];
  assert.deepEqual(question.hints, ['Compare f(x − 4) with f(x): which way does the graph move?']);
  assert.equal(question.hint, 'Look at the + 3 outside the function.');
  const hints = buildQuestionHints(question).map((hint) => hint.text);
  assert.ok(hints.includes('Compare f(x − 4) with f(x): which way does the graph move?'));
});

test('6. "Ask my teacher" is never offered inside a secure Test or Test Cycle', () => {
  // The control exists only where the host hands QuestionEngine a callback,
  // and never under server grading (every secure item is server-graded).
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /const askTeacher = typeof onAskTeacher === 'function' && !locked && !serverGrading\s*\?/);
  // The secure path (Tests, Retests, Test Cycle, Corrections, CCMR exams)
  // never passes one: only the classroom assignment workspace does.
  ['src/components/assessment/SecureExamContainer.jsx', 'src/components/assessment/SecureExamQuestionPlayer.jsx',
    'src/components/question/RichQuestionRuntime.jsx', 'src/components/student/TestCycleCorrections.jsx',
    'src/components/student/TestCycleCard.jsx'].forEach((path) => assert.doesNotMatch(read(path), /onAskTeacher|helpRequested/, path));
  const app = read('src/App.jsx');
  assert.equal((app.match(/onAskTeacher=/g) || []).length, 1, 'one host: the assignment workspace');
  // And the secure host really is server-graded: the exam player renders
  // RichQuestionRuntime, which mounts QuestionEngine with serverGrading.
  assert.match(read('src/components/assessment/SecureExamQuestionPlayer.jsx'), /<RichQuestionRuntime/);
  assert.match(read('src/components/question/RichQuestionRuntime.jsx'), /\n\s*serverGrading=\{serverGrading\}\n/);
});
