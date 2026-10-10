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
import { recordQuestionAttempt, requestReplacementQuestion } from '../../functions/shared/attemptPolicy.mjs';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { attemptWasIndependent } from '../../functions/shared/sectionRecoveryService.mjs';
import { classifyAttemptEvidence } from '../../src/platform/mastery/evidenceClassification.js';
import { attemptSupportUsageFrom, readSupportUse, rememberSupportUse, restoredSupportUse } from '../../src/platform/supports/supportUseMemory.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { genericMissCheck, GENERIC_MISS_MESSAGES, GENERIC_MISS_MESSAGES_OPEN } from '../../src/platform/supports/feedback/genericMissChecks.js';
import { diagnoseMiss, displayFamilyValues, expectedForPart, partIsChoice } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { closedAttemptText, feedbackOpenForItem, hintOfferedAfterMiss, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { partialCreditBreakdown } from '../../src/platform/supports/feedback/partialCreditBreakdown.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildQuestionHints, hintRelease } from '../../src/platform/supports/hints/questionHints.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { helpRequestAfterClose, helpRequestFields, nextHelpRequest } from '../../src/platform/supports/helpRequest.js';
import { buildWalkthroughMonitor } from '../../src/platform/teacher/walkthroughMonitor.js';
import { buildLiveStatus, classifyLiveStudent, LIVE_FLAGS, LIVE_SEVERITY, summarizeLiveClass } from '../../src/livePresence.js';
import { ACTIVITY_ROLES } from '../../functions/shared/activityPolicies.mjs';
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
  Object.values(GENERIC_MISS_MESSAGES_OPEN).forEach((message) => assert.doesNotMatch(message, /\d/));
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

test('2. a generic message never hands over the answer: no move named while attempts are left, nothing on a choice field (PR #462 review M6a, M6b)', () => {
  // Each open message says where to look and how to check — never the move
  // (negate, invert, swap, reduce) that turns the student's answer into the key.
  const MOVES = /sign|negative|opposite|upside|numerator|denominator|top|order|swap|first|simplest|factor|reduc|divid|flip|invert|traded/i;
  Object.entries(GENERIC_MISS_MESSAGES_OPEN).forEach(([check, message]) => assert.doesNotMatch(message, MOVES, `${check}: ${message}`));
  assert.deepEqual(Object.keys(GENERIC_MISS_MESSAGES_OPEN).sort(), Object.keys(GENERIC_MISS_MESSAGES).sort());

  // −4x + 8 = 36, key −7.
  const question = { type: 'multiAnswer', prompt: 'Solve −4x + 8 = 36.', answerFields: [{ id: 'x', label: 'x', answer: '-7' }] };
  const signed = diagnoseMiss({ question, grading: browserGrading(question, { x: '7' }) });
  assert.equal(signed?.code, 'sign-flipped');
  assert.equal(signed.message, GENERIC_MISS_MESSAGES_OPEN['sign-flipped'], 'attempts left (the default): no move named');
  assert.doesNotMatch(signed.message, MOVES);
  const inverted = diagnoseMiss({ question, grading: browserGrading(question, { x: '-1/7' }) });
  assert.equal(inverted?.code, 'reciprocal');
  assert.doesNotMatch(inverted.message, MOVES);
  // Once the item has closed, the error may be named.
  assert.equal(diagnoseMiss({ question, grading: browserGrading(question, { x: '7' }), attemptsLeft: false }).message, GENERIC_MISS_MESSAGES['sign-flipped']);
  assert.equal(genericMissCheck({ student: '7', expected: '-7' }).message, GENERIC_MISS_MESSAGES_OPEN['sign-flipped'], 'the default is the open wording');

  // A choice field: with options {5, 0, −5}, "the opposite sign" after −5 leaves one option.
  const choice = { type: 'multiAnswer', answerFields: [{ id: 'x', label: 'x', answer: '5', options: ['5', '0', '-5'] }] };
  assert.equal(partIsChoice(choice, { id: 'x' }), true);
  assert.equal(diagnoseMiss({ question: choice, grading: browserGrading(choice, { x: '-5' }) }), null);
  assert.equal(diagnoseMiss({ question: choice, grading: browserGrading(choice, { x: '-5' }), attemptsLeft: false }), null, 'closed or not');
  const profiled = { type: 'multiAnswer', answerFields: [{ id: 'x', label: 'x', answer: '5', inputProfile: 'choice' }] };
  assert.equal(partIsChoice(profiled, { id: 'x' }), true);
  // A free-response field beside a choice field still gets its message.
  const mixed = { type: 'multiAnswer', answerFields: [{ id: 'x', label: 'x', answer: '-7' }, { id: 'kind', label: 'Kind', answer: '5', options: ['5', '0', '-5'] }] };
  assert.equal(partIsChoice(mixed, { id: 'x' }), false);
  assert.equal(diagnoseMiss({ question: mixed, grading: browserGrading(mixed, { x: '7', kind: '-5' }) })?.code, 'sign-flipped');

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /diagnoseMiss\(\{ question: processedQuestion, grading: gradedForDisplay\.grading, response: gradedForDisplay\.response, familyValues, attemptsLeft: !isExpired \}\)/);
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
  const usage = region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'the attempt support usage');
  assert.doesNotMatch(usage, /diagnos|missDetail|gradedForDisplay|misconception/i);
  // What the display leaves on the NEXT attempt is a support fact, never a code.
  assert.doesNotMatch(read('src/platform/supports/supportUseMemory.js'), /misconception[A-Z]|diagnos|\bcode\b/);
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
  // closed, with right/wrong released for the item only (a DOL as each item
  // closes): nothing — "Grant one more DOL attempt" reopens the same item
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: true }), false);
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: true, assessmentReleased: false }), false);
  // closed, and the teacher released the assignment's feedback: the review may show
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: true, assessmentReleased: true }), true);
  // an assignment release does not open an item that can still be answered
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed: false, assessmentReleased: true }), false);
  // a server-graded host (Path, Test Cycle, Live Challenge) owns its feedback
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: true, closed: true, serverGraded: true }), false);
  // a role nobody recognises fails closed
  assert.equal(feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: true, closed: true, assessmentReleased: true, roleKnown: false }), false);

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // "Closed" is the question closing, never a section lock a teacher can lift.
  assert.match(engine, /const feedbackOpen = feedbackOpenForItem\(\{\s*showOutcomeFeedback,\s*immediateFeedback: resolvedActivityPolicy\?\.feedback === 'immediate',\s*closed: isCorrect \|\| isExpired,\s*assessmentReleased: assessmentReviewReleased === true,\s*serverGraded,\s*roleKnown: ladderRoleKnown,\s*\}\);/);
  assert.match(engine, /const closedReview = \(isCorrect \|\| isExpired\) && feedbackOpen \? \(/);
  assert.match(engine, /\{expiredAlmost \? 'Almost' : 'Incorrect'\}\{reviewAvailable && feedbackOpen \? ' — review below' : ''\}/);
  // The hint control follows the activity's help policy, and a server-graded host keeps its own.
  assert.match(engine, /const hintControlAllowed = toolHintsAllowed && !serverGrading && ladderRoleKnown;/);
  assert.match(engine, /const toolHintsAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false;/);
  assert.match(engine, /const ladderRoleKnown = Boolean\(activityPolicy\) \|\| isActivityRole\(String\(activityRole \?\? ''\)\.trim\(\)\.toLowerCase\(\)\);/);
  assert.match(engine, /import \{ getEffectiveActivityPolicy, isActivityRole \} from '\.\/platform\/policies\/activityPolicies';/);
});

test('3. a DOL\'s per-item right/wrong release never opens the worked solution (PR #462 review B1)', () => {
  const app = executableSource(read('src/App.jsx'));
  // The per-item release (a DOL item that is correct or out of attempts)
  // still shows right/wrong…
  assert.match(app, /const currentFeedbackReleased = lifecycle\.isPracticeOnly \|\| assignmentFeedbackWasReleased\(assignment\)\s*\|\| \(activeActivityPolicy\.feedback === 'afterAssignmentSubmit' && \['correct', 'expired'\]\.includes\(currentRecord\.status\)\);/);
  // …but the review follows the assignment-level release only.
  assert.match(app, /assessmentReviewReleased=\{assignmentFeedbackWasReleased\(assignment\)\}/);
  assert.doesNotMatch(app, /assessmentReviewReleased=\{currentFeedbackReleased\}/);
  assert.match(app, /const assignmentFeedbackWasReleased = \(assignment\) => assignment\?\.feedbackReleased === true \|\| Boolean\(assignment\?\.feedbackReleasedAt\);/);
  // The journey: a DOL item runs out of attempts (per-item release on), the
  // teacher grants one more attempt (the item is open again), all before any
  // assignment release — at no point may a review show.
  const dolItem = (closed) => feedbackOpenForItem({ showOutcomeFeedback: true, immediateFeedback: false, closed, assessmentReleased: false });
  assert.equal(dolItem(true), false, 'closed, per-item release');
  assert.equal(dolItem(false), false, 'reopened by a granted attempt');
});

test('3. a closed question points at a worked solution only when there is one', () => {
  assert.match(closedAttemptText({ maximumAttempts: 3, reviewAvailable: true }), /final allowed attempt \(3 total\)\. This response is locked\. The worked solution is below\.$/);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 3, reviewAvailable: false }), /below|review/i);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 3, reviewAvailable: false, allowReplacement: true }), /below|review/i);
  assert.match(closedAttemptText({ maximumAttempts: 2, reviewAvailable: true, allowReplacement: true }), /request a new question/);
  assert.doesNotMatch(closedAttemptText({ maximumAttempts: 2, reviewAvailable: true, allowReplacement: false }), /new question|another problem/);
  // The legacy intro no longer promises another problem it cannot give, and
  // uses the panel's words for a closed question (student push J copy pass).
  const legacy = executableSource(read('src/SolutionReview.jsx'));
  const intro = legacy.match(/allowReplacement\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/);
  assert.ok(intro, 'the intro depends on allowReplacement');
  assert.match(intro[1], /^This question is closed\..*request a new question/);
  assert.match(intro[2], /^This question is closed\./);
  assert.doesNotMatch(intro[2], /new question|another problem|request/i);
  assert.doesNotMatch(legacy, /problem version is closed/);
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
  // The same VALUE written another way is still this question's answer — the
  // numeric comparison, not the text one, catches these (review test gap).
  const steps = ['Subtract 1 from both sides.', 'Divide both sides by 2.'];
  assert.equal(similarExampleIsSafe(question, { prompt: 'Solve 2x + 1 = 9.', steps, answer: '4.0' }), false, '4.0 is 4');
  assert.equal(similarExampleIsSafe(question, { prompt: 'Solve 2x + 1 = 9.', steps, answer: '8/2' }), false, '8/2 is 4');
  assert.equal(similarExampleIsSafe(question, { prompt: 'Solve 2x + 1 = 9.', steps, answer: '04' }), false, '04 is 4');
  const fractionKey = { type: 'multiAnswer', prompt: 'Find the slope.', answerFields: [{ id: 'm', answer: '3/4' }] };
  assert.equal(similarExampleIsSafe(fractionKey, { prompt: 'Find the slope through (0, 0) and (8, 6).', steps: ['Rise over run.'], answer: '6/8' }), false, '6/8 is 3/4');
  assert.equal(similarExampleIsSafe(fractionKey, { prompt: 'Find the slope through (0, 0) and (8, 6).', steps: ['Rise over run.'], answer: '0.75' }), false, '0.75 is 3/4');
  assert.equal(similarExampleIsSafe(fractionKey, { prompt: 'Find the slope through (0, 0) and (5, 2).', steps: ['Rise over run.'], answer: '2/5' }), true, 'a different value is fine');
});

/* ------------------------------------------------- 5. what counts as help */

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), size: () => map.size };
};
const evidenceFor = (record, supportUsage, attemptNumber) => buildAttemptEvidenceEvent({
  studentId: 's1',
  assignment: { id: 'a1', standards: ['A.5A'] },
  question: { questionId: 'q1', type: 'multiAnswer', standards: ['A.5A'] },
  questionIndex: 0,
  activityRole: 'practice',
  attemptRecord: record,
  attemptResult: { isCorrect: true, attemptNumber, partialCredit: 100 },
  supportUsage,
});

test('5. what counts as help: a hint, a worked example, a problem-specific back-up step, a miss message — not the generic step (PR #462 review B3, M6c)', () => {
  const base = { record: null, isCorrect: true, maximumAttempts: 3, parts: [] };
  // The platform's generic back-up step: recorded, not help.
  const generic = attemptSupportUsageFrom({ backUpStepDone: true, backUpStepSource: 'platform' });
  assert.equal(generic.backUpStepUsed, true);
  assert.equal(generic.scaffoldUsed, false);
  assert.equal(generic.isMathematicallyIndependent, true);
  const genericRecord = recordQuestionAttempt({ ...base, supportUsage: generic }).record;
  assert.equal(genericRecord.supportUsage.backUpStepUsed, true, 'recorded');
  assert.equal(genericRecord.supportUsage.isMathematicallyIndependent, true, 'not a penalty');
  assert.equal(attemptWasIndependent(genericRecord.supportUsage), true);
  // A step written for THIS problem names its first move: help.
  for (const source of ['family', 'authored']) {
    const usage = attemptSupportUsageFrom({ backUpStepDone: true, backUpStepSource: source });
    assert.equal(usage.scaffoldUsed, true, source);
    assert.equal(usage.isMathematicallyIndependent, false, source);
    const record = recordQuestionAttempt({ ...base, supportUsage: usage }).record;
    assert.equal(record.supportUsage.scaffoldUsed, true, `${source}: recorded as a scaffold`);
    assert.equal(record.supportUsage.isMathematicallyIndependent, false, `${source}: not independent`);
    assert.equal(attemptWasIndependent(record.supportUsage), false, `${source}: the Recovery gate does not count it`);
    const event = evidenceFor(record, usage, 2);
    assert.equal(event.supportUsage.backUpStepUsed, true, `${source}: the evidence event carries the step`);
    assert.equal(classifyAttemptEvidence(event).key, 'supported', `${source}: mastery sees a supported attempt`);
  }
  // A specific miss message shown before this attempt: feedback-assisted.
  const assisted = attemptSupportUsageFrom({ feedbackAssisted: true });
  assert.equal(assisted.feedbackAssisted, true);
  assert.equal(assisted.isMathematicallyIndependent, false);
  const assistedRecord = recordQuestionAttempt({ ...base, supportUsage: { ...assisted, isMathematicallyIndependent: undefined } }).record;
  assert.equal(assistedRecord.supportUsage.feedbackAssisted, true, 'recorded even without the summary flag');
  assert.equal(assistedRecord.supportUsage.isMathematicallyIndependent, false);
  assert.equal(attemptWasIndependent({ feedbackAssisted: true }), false);
  const assistedEvent = evidenceFor(assistedRecord, assisted, 2);
  assert.equal(assistedEvent.supportUsage.feedbackAssisted, true);
  assert.ok(assistedEvent.supportTelemetry.some((entry) => entry.supportType === 'missFeedback' && entry.reducesMathematicalIndependence === true));
  assert.equal(classifyAttemptEvidence({ supportUsage: { feedbackAssisted: true }, performance: { attemptNumber: 2 } }).key, 'supported');
  // A hint or a worked example still is help; a host's own "not independent" stands.
  assert.equal(attemptSupportUsageFrom({ hintUsed: true }).isMathematicallyIndependent, false);
  assert.equal(attemptSupportUsageFrom({ workedExampleUsed: true }).isMathematicallyIndependent, false);
  assert.equal(attemptSupportUsageFrom({ supportUsage: { isMathematicallyIndependent: false } }).isMathematicallyIndependent, false);
  assert.equal(attemptSupportUsageFrom({ calculatorUsed: true, contextScaffoldUsed: true }).isMathematicallyIndependent, true);

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const usage = region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'the attempt support usage');
  assert.match(usage, /backUpStepDone: scaffoldComplete,/);
  assert.match(usage, /backUpStepSource: scaffold\.source,/);
  assert.match(usage, /feedbackAssisted,/);
  assert.match(usage, /hintUsed,/);
  assert.match(usage, /workedExampleUsed,/);
  // A miss message on screen makes the next attempt feedback-assisted.
  assert.match(engine, /useEffect\(\(\) => \{\s*if \(missDetail\?\.message\) setFeedbackAssisted\(true\);\s*\}, \[missDetail\]\);/);
  const reveal = region(engine, 'const revealNextHint = () => {', '};', 'revealing a hint');
  assert.match(reveal, /recordHintUse\(\);/, 'every hint revealed is recorded');
  assert.match(engine, /const recordHintUse = \(\) => setHintUsed\(true\);/);
  const similar = region(engine, 'const openSimilarExample = () => {', '};', 'opening a worked example');
  assert.match(similar, /setWorkedExampleUsed\(true\);/);
});

test('5. help had on a question survives leaving it and coming back (PR #462 review B2)', () => {
  const storage = memoryStorage();
  const draftKey = 'student-1|assignment-1|q0|v0|graded';
  const base = { isCorrect: false, maximumAttempts: 3, parts: [] };
  // Attempt 1: a hint revealed and a worked example opened, as the engine
  // remembers them at reveal time.
  rememberSupportUse(draftKey, { hintUsed: true, hintsRevealed: 1, workedExampleUsed: true }, storage);
  const first = recordQuestionAttempt({ ...base, record: null, supportUsage: attemptSupportUsageFrom({ hintUsed: true, workedExampleUsed: true }) }).record;
  // Leave and come back: the question remounts with fresh state.
  const restored = restoredSupportUse({ draftKey, record: first, storage });
  assert.equal(restored.hintUsed, true);
  assert.equal(restored.hintsRevealed, 1);
  assert.equal(restored.workedExampleUsed, true);
  const secondUsage = attemptSupportUsageFrom({ hintUsed: restored.hintUsed, workedExampleUsed: restored.workedExampleUsed });
  const second = recordQuestionAttempt({ ...base, isCorrect: true, record: first, supportUsage: secondUsage }).record;
  assert.equal(second.supportUsage.isMathematicallyIndependent, false, 'the correct second attempt is a supported one');
  assert.notEqual(classifyAttemptEvidence(evidenceFor(second, secondUsage, 2)).key, 'independentRetry');
  assert.equal(attemptWasIndependent(secondUsage), false, 'and does not count toward the Recovery gate');

  // Another device (no local memory): the record's last attempt still says so.
  assert.equal(restoredSupportUse({ draftKey, record: first, storage: memoryStorage() }).hintUsed, true);
  // A hint revealed before any attempt, then a remount: local memory says so.
  const early = memoryStorage();
  rememberSupportUse(draftKey, { hintUsed: true, hintsRevealed: 1 }, early);
  assert.equal(restoredSupportUse({ draftKey, record: { status: 'unattempted', attemptCount: 0 }, storage: early }).hintUsed, true);
  // Memory only grows: an empty write never erases help already had.
  rememberSupportUse(draftKey, { hintUsed: false, hintsRevealed: 0, workedExampleUsed: false }, storage);
  assert.equal(readSupportUse(draftKey, storage).hintUsed, true);
  // A replacement version is a new question: a new draft key, and a record
  // whose attempt count starts again.
  const replaced = requestReplacementQuestion({ ...second, status: 'expired', attemptCount: 3 });
  assert.equal(restoredSupportUse({ draftKey: 'student-1|assignment-1|q0|v1|graded', record: replaced, storage }).hintUsed, false);
  // A blocked storage never throws.
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => rememberSupportUse(draftKey, { hintUsed: true }, blocked));
  assert.equal(restoredSupportUse({ draftKey, record: first, storage: blocked }).hintUsed, true, 'the record still carries it');

  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /const \[restoredSupport\] = useState\(\(\) => restoredSupportUse\(\{ draftKey, record \}\)\);/);
  assert.match(engine, /const \[hintUsed, setHintUsed\] = useState\(restoredSupport\.hintUsed\);/);
  assert.match(engine, /const \[hintsRevealed, setHintsRevealed\] = useState\(restoredSupport\.hintsRevealed\);/);
  assert.match(engine, /const \[workedExampleUsed, setWorkedExampleUsed\] = useState\(restoredSupport\.workedExampleUsed\);/);
  assert.match(engine, /const \[scaffoldComplete, setScaffoldComplete\] = useState\(restoredSupport\.backUpStepUsed\);/);
  assert.match(engine, /const \[feedbackAssisted, setFeedbackAssisted\] = useState\(restoredSupport\.feedbackAssisted\);/);
  assert.match(engine, /rememberSupportUse\(draftKey, \{ hintUsed, hintsRevealed, workedExampleUsed, backUpStepUsed: scaffoldComplete, scaffoldUsed: backUpSpecific, feedbackAssisted \}\);/);
  assert.match(engine, /import \{ attemptSupportUsageFrom, rememberSupportUse, restoredSupportUse \} from '\.\/platform\/supports\/supportUseMemory\.js';/);
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
  // Once asking is no longer offered (post-due practice), the hand comes down.
  assert.equal(helpRequestAfterClose(request, { 2: { status: 'attempted' } }, { askingAllowed: false }), null);

  // Wired: imported where it is used (nothing imports App.jsx, so a missing
  // import passes every other gate).
  const app = read('src/App.jsx');
  assert.match(app, /^import \{ helpRequestAfterClose, helpRequestFields, nextHelpRequest \} from '\.\/platform\/supports\/helpRequest\.js';$/m);
  // A raised hand comes down when its question closes (the toggle is gone
  // from a closed question, so nothing else could lower it).
  assert.match(app, /useEffect\(\(\) => \{\s*setHelpRequest\(\(current\) => helpRequestAfterClose\(current, activeWorkingTracker, \{ askingAllowed: !activeLifecycle\?\.isPracticeOnly \}\)\);\s*\}, \[activeWorkingTracker, activeLifecycle\?\.isPracticeOnly\]\);/);
  assert.match(app, /\.\.\.helpRequestFields\(helpRequest, \{ assignmentId: activeAssignmentId \}\),/);
  assert.match(app, /onAskTeacher=\{preview \|\| lifecycle\.isPracticeOnly \|\| user\?\.role !== 'student'\s*\? null\s*: \(requested\) => setHelpRequest\(nextHelpRequest\(\{ requested, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex \}\)\)\}/);
  // Published only after the stale document is deleted (a write before it
  // would be deleted and archived as a session of its own).
  const start = region(app, 'const startPresence = async () => {', '};', 'starting presence');
  assert.ok(start.indexOf('publishPresenceNowRef.current = publishLatest;') > start.indexOf('await deleteDoc(presenceRef);'));
});

test('6. a hand comes down when its question locks without closing — DOL timer, a closed section, the Warm-Up window (PR #462 review M4)', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // `locked` covers every lock the host knows, not only a closed question…
  assert.match(engine, /const locked = Boolean\(isCorrect \|\| isExpired \|\| assignmentLocked\);/);
  // …and a locked question lowers its own raised hand, since Ask and Cancel go with it.
  assert.match(engine, /useEffect\(\(\) => \{\s*if \(locked && helpRequested && typeof onAskTeacher === 'function'\) onAskTeacher\(false\);\s*\}, \[locked, helpRequested, onAskTeacher\]\);/);
  const app = executableSource(read('src/App.jsx'));
  // The hand belongs to the question it was raised on: another question shows
  // "Ask my teacher", and only the question it was raised on can lower it.
  assert.match(app, /helpRequested=\{helpRequest\?\.assignmentId === activeAssignmentId && helpRequest\?\.questionIndex === currentQuestionIndex\}/);
  assert.match(app, /assignmentLocked=\{!preview && \(\(currentIsDOL && dolState\.status === 'ended'\) \|\| \(currentIsWarmup && warmupState\.status !== 'active'\) \|\| currentSectionManuallyLocked\)\}/);
});

test('6. the teacher sees a raised hand: first in the Room view and first in Walkthrough, wherever the student is (PR #462 review M5)', () => {
  const now = 1_800_000_000_000;
  const live = (overrides = {}) => ({ assignmentId: 'A1', activityRole: 'classwork', questionStates: 'ca......', sectionQuestionIndex: 2, questionIndex: 2, updatedAt: now - 5000, lastInteractionAt: now - 5000, ...overrides });
  const students = [
    { id: 's-ahead', name: 'Ahead Asker', liveStatus: live({ sectionQuestionIndex: 4, questionIndex: 4, helpRequestedAt: now - 30000, helpQuestionIndex: 4 }) },
    { id: 's-on', name: 'On Question', liveStatus: live({ sectionQuestionIndex: 2, helpRequestedAt: now - 20000, helpQuestionIndex: 2 }) },
    { id: 's-behind', name: 'Behind Quiet', liveStatus: live({ sectionQuestionIndex: 0, questionIndex: 0 }) },
    { id: 's-plain', name: 'Plain Worker', liveStatus: live({ sectionQuestionIndex: 2 }) },
  ];
  // Walkthrough: before, a student on or ahead of the teacher's question was
  // filtered out before the help priority was read.
  const walk = buildWalkthroughMonitor({ students, assignmentId: 'A1', teacherQuestionIndex: 2, nowValue: now, checkedStudentIds: ['s-on'] });
  const listed = walk.needsCheck.map((row) => row.id);
  assert.ok(listed.includes('s-ahead'), 'working ahead, hand raised');
  assert.ok(listed.includes('s-on'), 'on the question and already checked, hand raised');
  assert.ok(['s-ahead', 's-on'].includes(walk.visitNext.id), 'a raised hand is visited next');
  assert.ok(listed.indexOf('s-behind') > listed.indexOf('s-on') && listed.indexOf('s-behind') > listed.indexOf('s-ahead'));
  assert.ok(!listed.includes('s-plain'));
  assert.equal(walk.counts.helpRequests, 2);
  // Room (the default view): a raised hand is an alert, says so, and sorts first.
  const room = summarizeLiveClass(students, { nowValue: now, assignmentId: 'A1' });
  const asker = room.rows.find((row) => row.id === 's-on');
  assert.ok(asker.flags.includes(LIVE_FLAGS.HELP_REQUESTED));
  assert.equal(asker.severity, LIVE_SEVERITY.ALERT);
  assert.equal(asker.headline, 'Asked for help');
  assert.deepEqual(room.rows.slice(0, 2).map((row) => row.id).sort(), ['s-ahead', 's-on']);
  assert.equal(room.counts.helpRequests, 2);
  // A closed laptop's last request is not a student waiting.
  const gone = classifyLiveStudent({ id: 's-off', name: 'Gone', liveStatus: live({ updatedAt: now - 10 * 60000, helpRequestedAt: now - 11 * 60000 }) }, { nowValue: now });
  assert.ok(!gone.flags.includes(LIVE_FLAGS.HELP_REQUESTED));
  const monitor = read('src/components/teacher/LiveClassMonitor.jsx');
  assert.match(monitor, /\[LIVE_FLAGS\.HELP_REQUESTED\]: 'Hand raised',/);
  assert.match(monitor, /\{counts\.helpRequests > 0 && <strong data-live-help-count="" style=\{\{ color: 'var\(--mm-danger\)' \}\}> · \{counts\.helpRequests\} asked for help<\/strong>\}/);
  // The student is told where the teacher sees it, and an ask-only panel (a
  // DOL) says nothing about hints (m9).
  const panel = read('src/platform/supports/hints/HintPanel.jsx');
  assert.match(panel, /Your hand is raised on your teacher’s live class screen for this question\./);
  assert.doesNotMatch(panel, /Your teacher can see that you asked/);
  assert.match(panel, /const askOnly = !hints\.length && !similar;/);
  assert.match(panel, /\) : askOnly \? \(\s*<p[^>]*>Stuck\? Ask your teacher to come over\. Asking does not change your score\.<\/p>/);
});

test('6. every key the heartbeat writes is one the presence rule allows (PR #462 review m7)', () => {
  const rules = read('firestore.rules');
  const fn = region(rules, 'function presenceKeysKnown(data) {', '    }', 'the presence key rule');
  const allowed = new Set([...region(fn, 'hasOnly([', '])', 'the allowed keys').matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]));
  const app = executableSource(read('src/App.jsx'));
  const payload = region(app, 'const payload = {\n      studentId: user.id,', '\n    };', 'the presence payload');
  const appKeys = [...payload.matchAll(/^ {6}([A-Za-z]+)(?=[:,])/gm)].map((match) => match[1]);
  const keys = [...appKeys, ...Object.keys(buildLiveStatus({})), 'helpRequestedAt', 'helpQuestionIndex', 'pageVisible', 'updatedAt'];
  assert.ok(appKeys.includes('studentId') && appKeys.includes('currentTeksCode'));
  keys.forEach((key) => assert.ok(allowed.has(key), `${key} is written by the heartbeat but not allowed by the rule`));
  Object.values(ACTIVITY_ROLES).forEach((role) => assert.match(fn, new RegExp(`'${role}'`), `the rule allows the role ${role}`));
  assert.match(rules, /&& presenceKeysKnown\(request\.resource\.data\)\s*&& presenceHelpRequestValid\(request\.resource\.data\);/);
  assert.match(rules, /data\.helpRequestedAt > request\.time\.toMillis\(\) - 86400000\s*&& data\.helpRequestedAt < request\.time\.toMillis\(\) \+ 3600000/);
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
