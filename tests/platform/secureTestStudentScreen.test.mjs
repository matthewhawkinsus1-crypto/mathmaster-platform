// WHAT A STUDENT WAS SHOWN WHEN THE SECURE TEST WAS TAKEN FOR REAL.
//
// Found on Oct 13, 2026 by taking a production Test Cycle as a student, start
// to finish (Review, a waiver, the Test with a reload and an integrity pause,
// release, Corrections, the Retest, the capped grade). The workflow held. These
// are the places where the screen said something that was not so, or left the
// student somewhere they should not have been:
//
//   - every question opened scrolled to its last answer box (Next is at the
//     bottom of a question and nothing scrolled back up);
//   - the browser stayed in full screen after the Test was turned in;
//   - the question could be read through the integrity pause;
//   - a waived Review was called complete;
//   - the card gave the Test's length over a "Start Retest" button;
//   - a submitted Retest was announced as "Test submitted";
//   - late work still open said only its past due date.

import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { TEST_CYCLE_STAGE as S } from '../../src/platform/assessment/testCycle.js';
import { finishedSummary } from '../../src/platform/assessment/secureExamNavigationModel.js';
import { reviewWasWaived, sittingFactsFor, testCycleCardDueFacts, testCycleDueFacts } from '../../src/platform/student/testCycleDiscovery.js';
import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';

const card = componentSource('src/components/student/TestCycleCard.jsx');
const exam = componentSource('src/components/assessment/SecureExamContainer.jsx');
const app = componentSource('src/App.jsx');

/* --- said as it is: the helpers ------------------------------------------ */

test('a Review is called waived only when the student is past it with its own gate unmet', () => {
  const waived = { stage: S.TEST, reviewProgress: { attempted: 1, total: 12, complete: false } };
  assert.equal(reviewWasWaived(waived), true);
  assert.equal(reviewWasWaived({ ...waived, stage: S.CORRECTIONS }), true, 'it stays true for the rest of the cycle');
  // Still in Review: nothing was waived, they simply have not finished.
  assert.equal(reviewWasWaived({ ...waived, stage: S.REVIEW }), false);
  // Finished it themselves.
  assert.equal(reviewWasWaived({ stage: S.TEST, reviewProgress: { attempted: 12, total: 12, complete: true } }), false);
  // A cycle with no Review questions, or a card that does not say.
  assert.equal(reviewWasWaived({ stage: S.TEST, reviewProgress: { attempted: 0, total: 0, complete: false } }), false);
  assert.equal(reviewWasWaived({ stage: S.TEST }), false);
  assert.equal(reviewWasWaived(), false);
});

test('a Retest that follows a Test is named a Retest and is not given the Test\'s length', () => {
  const delivery = { timed: false, questionCount: 10 };
  assert.deepEqual(sittingFactsFor({ stage: S.TEST, delivery }), { noun: 'Test', questionCount: 10 });
  assert.deepEqual(sittingFactsFor({ stage: S.REVIEW, delivery }), { noun: 'Test', questionCount: 10 });
  // In production the Retest after a 10-question Test had 7 questions.
  assert.deepEqual(sittingFactsFor({ stage: S.RETEST_READY, delivery }), { noun: 'Retest', questionCount: null });
  assert.deepEqual(sittingFactsFor({ stage: S.RETEST, delivery }), { noun: 'Retest', questionCount: null });
  // An external-original cycle's one secure sitting is its retest: the facts are that sitting's.
  assert.deepEqual(sittingFactsFor({ stage: S.RETEST_READY, delivery, policy: { external: true } }), { noun: 'Retest', questionCount: 10 });
  assert.deepEqual(sittingFactsFor({ stage: S.TEST }), { noun: 'Test', questionCount: null });
});

test('the final late date is said once the regular date has passed and while it is still ahead', () => {
  const dueAt = '2026-10-10T04:59:00.000Z';
  const lateDueAt = '2026-10-16T04:59:00.000Z';
  const at = (iso) => new Date(iso).getTime();
  assert.deepEqual(testCycleDueFacts({ dueAt, lateDueAt, now: at('2026-10-08T12:00:00Z') }), { dueAt, finalLateDueAt: null }, 'before the due date only the due date matters');
  assert.deepEqual(testCycleDueFacts({ dueAt, lateDueAt, now: at('2026-10-13T21:00:00Z') }), { dueAt, finalLateDueAt: lateDueAt });
  assert.deepEqual(testCycleDueFacts({ dueAt, lateDueAt, now: at('2026-10-17T00:00:00Z') }), { dueAt, finalLateDueAt: null }, 'a late date that has passed is not offered');
  assert.deepEqual(testCycleDueFacts({ dueAt, lateDueAt: dueAt, now: at('2026-10-13T21:00:00Z') }), { dueAt, finalLateDueAt: null }, 'no late window');
  assert.deepEqual(testCycleDueFacts({ dueAt, lateDueAt: { seconds: 1 }, now: at('2026-10-13T21:00:00Z') }), { dueAt, finalLateDueAt: null }, 'an unreadable late date is left out, not shown as Invalid Date');
  assert.deepEqual(testCycleDueFacts({ dueAt: null, lateDueAt }), { dueAt: null, finalLateDueAt: null });
});

test('a submitted Retest is announced as a Retest', () => {
  const done = { status: 'submitted', feedbackReleased: false, requiredQuestions: 7, answeredQuestions: 7 };
  const retest = finishedSummary({ ...done, courseTest: { cycleStage: 'retest' } }, { courseTest: true });
  assert.equal(retest.title, 'Retest submitted');
  assert.equal(retest.message, 'Your answers are turned in. You answered 7 of 7 questions. Your final grade appears after your teacher releases retest results.');
  const original = finishedSummary({ ...done, courseTest: { cycleStage: 'test' } }, { courseTest: true });
  assert.equal(original.title, 'Test submitted');
  assert.match(original.message, /Your score appears after your teacher releases results\.$/);
  assert.equal(finishedSummary({ status: 'force_submitted', courseTest: { cycleStage: 'retest' } }, { courseTest: true }).title, 'Your teacher turned in your retest');
  // A practice simulation has no cycle stage and is unchanged.
  assert.equal(finishedSummary({ ...done, courseTest: { cycleStage: 'retest' } }).title, 'Practice test submitted');
});

/* --- the card uses them --------------------------------------------------- */

test('the card says a waived Review was waived, in the phase list and where the Test unlocks', () => {
  assert.match(card, /import \{[^}]*\breviewWasWaived,[^}]*\bsittingFactsFor,[^}]*\btestCycleCardDueFacts,[^}]*\} from '\.\.\/\.\.\/platform\/student\/testCycleDiscovery\.js';/s);
  assert.match(card, /const reviewWaived = reviewWasWaived\(card\);/);
  const phases = region(card, '<ol aria-label="Test Cycle phases"', '</ol>', 'phase list');
  assert.match(phases, /phase\.id === 'review' && phase\.status === 'completed' && reviewWaived \? 'Waived by your teacher' : \(PHASE_STATUS_LABEL\[phase\.status\] \|\| phase\.status\)/);
  const unlocked = region(card, "card.stage === TEST_CYCLE_STAGE.TEST && card.canEnter && card.actionLabel === 'Start Test'", '</p>', 'unlocked notice');
  assert.match(unlocked, /\{reviewWaived \? 'Test unlocked — your teacher waived the rest of your Review\.' : 'Test unlocked — your Review is complete\.'\}/);
});

test('the card describes the sitting that is actually ahead, and the dates that still apply', () => {
  const facts = region(card, '{/* The facts a student would otherwise have to ask about. */}', '<div style={{ display: \'flex\', gap: 10, flexWrap: \'wrap\' }}>', 'facts');
  assert.match(card, /const sitting = sittingFactsFor\(card\);/);
  assert.match(facts, /`\$\{sitting\.noun\} is not timed\.`/);
  assert.match(facts, /`\$\{sitting\.noun\} is timed: \$\{card\.delivery\.timeLimitMinutes\} minutes once you start/);
  // The count comes from the helper, never straight from the Test's delivery facts.
  assert.match(facts, /\{sitting\.questionCount \? ` \$\{sitting\.questionCount\} questions\. You can change your answers until you submit\.` : ' You can change your answers until you submit\.'\}/);
  assert.doesNotMatch(executableSource(facts), /card\.delivery\.questionCount/);
  // The dates for the stage the student is at (testCycleCardDueFacts, tested below).
  assert.match(card, /const due = testCycleCardDueFacts\(\{ card, dueAt, lateDueAt, classLateDueAt \}\);/);
  assert.match(facts, /Due \{formatDateTime\(due\.dueAt\)\}\.\{due\.finalLateDueAt \? ` Late work is still open: final late due \$\{formatDateTime\(due\.finalLateDueAt\)\}\.` : ''\}/);
});

test('the app hands the card THIS student\'s due and final late dates, from the assignment it is showing (PR-19)', () => {
  const screen = region(app, "if (studentDashboardMode === 'testCycle' && activeTestCycleAssignmentId) {", "if (studentDashboardMode === 'secureExams') {", 'Test Cycle screen');
  // Defined where it is used: App.jsx is not imported by any test and lint has
  // no no-undef here, so an undefined name would only fail in the browser.
  assert.match(screen, /const activeTestCycleAssignment = assignments\.find\(\(assignment\) => assignment\.id === activeTestCycleAssignmentId\) \|\| null;/);
  // The student's own lifecycle (extension and extra time resolved), not the
  // class-level fields of the shared document.
  assert.match(screen, /const activeTestCycleDates = activeTestCycleAssignment\s*\?\s*getAssignmentLifecycle\(activeTestCycleAssignment, Date\.now\(\), \{ studentId: user\.id \}\)\s*:\s*null;/);
  assert.match(screen, /<TestCycleCard[\s\S]*?dueAt=\{activeTestCycleDates\?\.dueAt \|\| null\}[\s\S]*?lateDueAt=\{activeTestCycleDates\?\.lateDueAt \|\| null\}/);
  // The class's date goes only to `classLateDueAt` (Corrections and the Retest
  // close at it unless the server's home window says otherwise), never to `lateDueAt`.
  assert.doesNotMatch(executableSource(screen), /lateDueAt=\{activeTestCycleAssignment/);
  assert.match(screen, /classLateDueAt=\{activeTestCycleAssignment\?\.lateDueAt \|\| activeTestCycleAssignment\?\.lateDueDate \|\| null\}/);
  // ...and it is imported, so the call is not a ReferenceError in the browser.
  assert.match(app, /import \{[^}]*\bgetAssignmentLifecycle,[^}]*\} from '\.\/assignmentLifecycle';/);
  assert.match(card, /export const TestCycleCard = \(\{[^)]*\bdueAt = null, lateDueAt = null, classLateDueAt = null,/);
});

test('an extended student\'s card says late work is still open, until THEIR date, after the class\'s has passed', () => {
  const classLate = Date.parse('2026-10-09T04:59:59.999Z');
  const theirLate = Date.parse('2026-10-14T04:59:59.999Z');
  const assignment = {
    id: 'tc', dueAt: '2026-10-06T04:59:59.999Z', lateDueAt: '2026-10-09T04:59:59.999Z',
    studentOverrides: { S1: { lateDueAt: '2026-10-14T04:59:59.999Z', extension: { meetingsGranted: 3 } } },
  };
  const afterClassLate = Date.parse('2026-10-10T17:00:00Z');
  const own = getAssignmentLifecycle(assignment, afterClassLate, { studentId: 'S1' });
  assert.equal(own.lateDueAt.getTime(), theirLate);
  assert.deepEqual(
    testCycleDueFacts({ dueAt: own.dueAt, lateDueAt: own.lateDueAt, now: afterClassLate }).finalLateDueAt,
    new Date(theirLate).toISOString(),
  );
  // What the card was given before: the class's date, which had passed — no
  // "late work is still open" at all for a student who may still work.
  assert.equal(testCycleDueFacts({ dueAt: assignment.dueAt, lateDueAt: assignment.lateDueAt, now: afterClassLate }).finalLateDueAt, null);
  // In Corrections and the Retest the card says the close the server enforces
  // (its home window, or the class's date when none is enforced), never the
  // student's later date, which the server would refuse.
  const facts = (stage, schedule) => testCycleCardDueFacts({
    card: { stage, dueAt: assignment.dueAt, schedule }, dueAt: own.dueAt, lateDueAt: own.lateDueAt, classLateDueAt: assignment.lateDueAt, now: afterClassLate,
  }).finalLateDueAt;
  assert.equal(facts('test', null), new Date(theirLate).toISOString(), 'ahead of the Test: their own date');
  const homeClose = Date.parse('2026-10-11T04:59:59.999Z');
  assert.equal(facts('corrections', { followUp: { enforced: true, closesAt: homeClose } }), new Date(homeClose).toISOString());
  assert.equal(facts('retest', { followUp: { enforced: false } }), null, 'no home window: the class date, which has passed');
  assert.equal(facts('review', { missedTest: true, followUp: { enforced: true, closesAt: homeClose } }), new Date(homeClose).toISOString(), 'missed the Test');
  // A classmate without the extension keeps the class's date.
  assert.equal(getAssignmentLifecycle(assignment, afterClassLate, { studentId: 'S2' }).lateDueAt.getTime(), classLate);
});

/* --- the secure exam ------------------------------------------------------ */

test('a new question, and the answer review, open at the top of the exam', () => {
  const effect = region(exam, 'const shownRef = useRef(null);', '}, [position, view.kind]);', 'scroll effect');
  // What is on screen is the question position or the review; a change of
  // either scrolls, the first render does not.
  assert.match(effect, /const shown = view\.kind === 'question' \? `question:\$\{position\}` : view\.kind;/);
  assert.match(effect, /if \(before === null \|\| before === shown\) return;\s*scrollExamToTop\(rootRef\.current\);/);
  const helper = region(exam, 'const scrollExamToTop = (root) => {', '};', 'scroll helper');
  assert.match(helper, /window\.scrollTo\(\{ top: pageTop < window\.innerHeight \? 0 : pageTop, left: 0, behavior: 'instant' \}\)/);
  // The ref it scrolls is the exam's own root element.
  assert.match(exam, /return <div ref=\{rootRef\} data-secure-exam-status=\{session\.status\}/);
});

test('full screen is given back when the test is turned in and when the exam screen is left', () => {
  assert.match(exam, /const finished = Boolean\(session\?\.examSessionId\) && terminal\.has\(session\.status\);\s*useEffect\(\(\) => \{ if \(finished\) leaveFullscreen\(\); \}, \[finished\]\);\s*useEffect\(\(\) => \(\) => leaveFullscreen\(\), \[\]\);/);
  const helper = region(exam, 'const leaveFullscreen = () => {', '};', 'leave helper');
  assert.match(helper, /!document\.fullscreenElement/);
  assert.match(helper, /document\.exitFullscreen\(\)\.catch\(/);
  // Never during a test under way: that would be counted as leaving it.
  assert.equal(executableSource(exam).split('leaveFullscreen()').length - 1, 2, 'only the finished effect and the unmount cleanup call it');
});

test('nothing of the test can be read through a pause', () => {
  const pause = region(exam, '<Dialog ref={pauseRef} role="alertdialog"', '>', 'pause dialog');
  assert.match(pause, /background: PAUSE_SCREEN_BACKGROUND,/);
  assert.doesNotMatch(pause, /rgba\(/);
  const value = exam.match(/const PAUSE_SCREEN_BACKGROUND = '([^']+)';/);
  assert.ok(value, 'the pause background is a named constant');
  assert.match(value[1], /^#[0-9a-f]{6}$/i, 'a colour with no alpha channel');
});
