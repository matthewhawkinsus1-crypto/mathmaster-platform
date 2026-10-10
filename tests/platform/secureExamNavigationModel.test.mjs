/*
 * A SECURE TEST THE STUDENT MOVES AROUND IN — THE SCREEN'S READING OF IT.
 *
 * src/platform/assessment/secureExamNavigationModel.js is how the browser reads
 * the navigation block the server sends with every secure session: where
 * Previous and Next lead, what each square of the question list shows, what
 * the review before Submit lists, which words a refusal or a pause is shown
 * in, and the status a student reads on their list of tests.
 *
 * What is protected, in words:
 *   - the screen never offers a move the server refuses, and refuses nothing
 *     the server allows — checked position by position against the server's
 *     own rules (functions/lib/secureExamNavigation.js), through the PUBLIC
 *     navigation block, which is all a browser ever receives;
 *   - Next skips forward, Previous never enters a finished module, the end of
 *     module 1 is reviewed before module 2 opens, and the last question leads
 *     to the review;
 *   - the review counts blank questions as zero and lists only questions the
 *     student can still reach; nothing it or the question list holds is a
 *     verdict;
 *   - the student is warned the event BEFORE an integrity pause, including
 *     after a teacher resumes an integrity-paused test, and every message
 *     names everything that counts (leaving the window, copy, paste,
 *     right-click) — a refusal that does not say which pause it is never
 *     relabels the pause already on screen;
 *   - the start screen states the student's own time before Start (extended
 *     time included), and the time LEFT when they come back to a test whose
 *     clock kept running;
 *   - a failed call is read as a pause, a refusal, the end of time, or a
 *     connection problem — never confused with each other;
 *   - statuses and rules are in a student's words, with none of the old
 *     one-way rules ("one attempt", "cannot go back") or jargon.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  INTEGRITY_WARNING_TEXT,
  ITEM_STATUS,
  NAVIGATION_MESSAGES,
  classifySecureExamError,
  finishedSummary,
  integrityPauseText,
  integrityWarningDue,
  navigatorCells,
  nextActionLabel,
  nextTarget,
  pauseKind,
  pausedStatusAfterRefusal,
  pendingModuleEnd,
  previousTarget,
  readNavigation,
  resultsTimingText,
  reviewSummary,
  startScreenRules,
  startScreenTime,
  sessionWasReplaced,
  studentSessionStatus,
  targetFor,
  timeAllowance,
  timeAllowanceText,
  withReviewFlag,
} from '../../src/platform/assessment/secureExamNavigationModel.js';
import { INTEGRITY_EVENT_TYPES } from '../../src/platform/assessment/examIntegrityLogger.js';

const require_ = createRequire(import.meta.url);
const server = require_('../../functions/lib/secureExamNavigation.js');

/** A server-side session in the navigation shape: `answered`/`recorded` by position. */
const serverSession = ({ examType = 'digitalSAT', required = 6, issued = 0, closedThrough = 0, answered = [], recorded = [], flagged = [], modules } = {}) => {
  const itemOrder = Array.from({ length: issued }, (_, position) => `q${position}`);
  const items = Object.fromEntries(itemOrder.map((id, position) => [id, {
    position,
    state: recorded.includes(position) ? 'recorded' : 'open',
    hasWork: answered.includes(position) || recorded.includes(position),
    flagged: flagged.includes(position),
  }]));
  return {
    examType,
    requiredQuestions: required,
    navigation: {
      version: 1,
      mode: 'free',
      itemOrder,
      items,
      cursor: Math.max(0, issued - 1),
      closedThrough,
      modules: modules === undefined ? server.moduleLayoutFor(examType, required) : modules,
      upgradedFromLinear: false,
    },
  };
};
/** What the browser holds: the public session's navigation block, read by the model. */
const browserView = (session) => readNavigation({ requiredQuestions: session.requiredQuestions, navigation: server.publicNavigation(session) });

test('every move the screen offers or refuses agrees with the server, position by position', () => {
  const scenarios = [];
  for (let issued = 0; issued <= 6; issued += 1) {
    scenarios.push(serverSession({ issued, answered: [0, 2].filter((p) => p < issued), flagged: [1].filter((p) => p < issued) }));
    if (issued >= 4) scenarios.push(serverSession({ issued, closedThrough: 3, answered: [0, 4].filter((p) => p < issued) }));
  }
  for (let issued = 0; issued <= 5; issued += 1) scenarios.push(serverSession({ examType: 'act', required: 5, issued }));
  // A session upgraded from the one-way runtime: locked answers, no modules.
  scenarios.push(serverSession({ required: 6, issued: 3, recorded: [0, 1], modules: null }));
  scenarios.push(serverSession({ examType: 'courseTest', required: 1, issued: 0 }));

  let compared = 0;
  for (const session of scenarios) {
    const view = browserView(session);
    for (let position = -1; position <= session.requiredQuestions; position += 1) {
      const expected = server.resolveTarget(session, { position });
      const actual = targetFor(view, position);
      const where = `${session.examType} issued=${session.navigation.itemOrder.length} closed=${session.navigation.closedThrough} position=${position}`;
      if (!expected.error) {
        assert.deepEqual([actual.kind, actual.position], ['open', expected.position], where);
      } else if (expected.error === 'module_end') {
        assert.equal(actual.kind, 'moduleEnd', where);
        assert.equal(actual.next.start, position, where);
        assert.equal(actual.finishing.number, actual.next.number - 1, where);
      } else {
        assert.equal(actual.kind, 'blocked', where);
        assert.equal(actual.reason, expected.error, where);
        // The student reads the server's own sentence either way.
        assert.equal(actual.message, expected.reason, where);
      }
      compared += 1;
    }
  }
  assert.ok(compared > 120, `compared ${compared} positions`);
});

test('Next skips forward, Previous never enters a finished module, the end of a module is reviewed first', () => {
  // Digital SAT, 4 questions: modules [0, 2) and [2, 4); two opened.
  let view = browserView(serverSession({ required: 4, issued: 2 }));
  assert.deepEqual(nextTarget(view, 0), { kind: 'open', position: 1 });
  const moduleEnd = nextTarget(view, 1);
  assert.equal(moduleEnd.kind, 'moduleEnd');
  assert.deepEqual([moduleEnd.finishing.number, moduleEnd.next.number, moduleEnd.position], [1, 2, 2]);
  assert.equal(nextActionLabel(moduleEnd), 'Review module 1');
  assert.deepEqual(pendingModuleEnd(view), moduleEnd, 'a server `module_end` refusal opens this same review');
  assert.deepEqual(previousTarget(view, 1), { kind: 'open', position: 0 });
  assert.equal(previousTarget(view, 0), null, 'nothing before the first question');

  // Module 2 opened (module 1 closed): Previous from its first question is off.
  view = browserView(serverSession({ required: 4, issued: 3, closedThrough: 2 }));
  assert.equal(previousTarget(view, 2), null, 'module 1 is closed');
  assert.deepEqual(nextTarget(view, 2), { kind: 'open', position: 3 }, 'Next on the last opened question opens the next one (skip)');
  assert.equal(pendingModuleEnd(view), null);
  assert.deepEqual(nextTarget(view, 3), { kind: 'review' }, 'the last question leads to the review');
  assert.equal(nextActionLabel({ kind: 'review' }), 'Review answers');
  assert.equal(nextActionLabel({ kind: 'open', position: 3 }), 'Next');

  // Without modules, Next simply walks on.
  view = browserView(serverSession({ examType: 'act', required: 3, issued: 1 }));
  assert.deepEqual(nextTarget(view, 0), { kind: 'open', position: 1 });
  assert.deepEqual(nextTarget(view, null), { kind: 'open', position: 0 }, 'no position yet: the server cursor');
});

test('the question list: every state, the current square, what is reachable — and never a verdict', () => {
  const session = serverSession({ required: 6, issued: 4, closedThrough: 3, answered: [0, 3], flagged: [1, 3], recorded: [2] });
  const cells = navigatorCells(browserView(session), 3);
  assert.equal(cells.length, 6);
  assert.deepEqual(cells.map((cell) => cell.status), [ITEM_STATUS.ANSWERED, ITEM_STATUS.UNANSWERED, ITEM_STATUS.RECORDED, ITEM_STATUS.ANSWERED, ITEM_STATUS.NOT_OPENED, ITEM_STATUS.NOT_OPENED]);
  assert.deepEqual(cells.map((cell) => cell.reachable), [false, false, false, true, true, false], 'module 1 closed; only the next unopened question is reachable');
  assert.deepEqual(cells.map((cell) => cell.current), [false, false, false, true, false, false]);
  assert.equal(cells[1].flagged, true, 'a mark stays visible in a finished module…');
  assert.equal(cells[1].label, 'Question 2: no answer yet, marked for review, module finished', '…and says the module is finished');
  assert.equal(cells[3].label, 'Question 4: answered, marked for review, current question');
  assert.equal(cells[2].label, 'Question 3: answer recorded earlier, can\'t be changed, module finished');
  assert.equal(cells[4].label, 'Question 5: not opened yet');
  // The list knows whether a question has an answer — nothing else.
  assert.doesNotMatch(JSON.stringify(cells), /correct|score|grading|answerKey|solution/i);
});

test('the review before Submit: blanks count as zero, and it lists only what can still be reached', () => {
  const view = browserView(serverSession({ required: 6, issued: 4, closedThrough: 3, answered: [0, 3], flagged: [1, 3] }));
  const whole = reviewSummary(view);
  assert.deepEqual(
    { total: whole.total, answered: whole.answered, blank: whole.blank, unanswered: whole.unanswered, notOpened: whole.notOpened, firstNotOpened: whole.firstNotOpened, flagged: whole.flagged, finished: whole.finishedModules },
    { total: 6, answered: 2, blank: 4, unanswered: [], notOpened: [4, 5], firstNotOpened: 4, flagged: [3], finished: [1] },
    'question 2 (blank, closed) still counts as zero but is not offered; question 6 follows question 5',
  );

  // Before leaving module 1: only module 1, everything in it reachable.
  const moduleView = browserView(serverSession({ required: 4, issued: 2, answered: [0], flagged: [1] }));
  const module1 = reviewSummary(moduleView, { moduleNumber: 1 });
  assert.deepEqual([module1.total, module1.answered, module1.blank], [2, 1, 1]);
  assert.deepEqual([module1.unanswered, module1.flagged, module1.notOpened], [[1], [1], []]);

  // A recorded (locked) answer counts as answered.
  const legacy = reviewSummary(browserView(serverSession({ required: 3, issued: 2, recorded: [0], modules: null })));
  assert.deepEqual([legacy.answered, legacy.unanswered, legacy.firstNotOpened], [1, [1], 2]);
});

test('marking for review shows at once, on that question only', () => {
  const session = { examSessionId: 's', navigation: { items: [{ position: 0, questionInstanceId: 'a', flagged: false }, { position: 1, questionInstanceId: 'b', flagged: true }] } };
  const marked = withReviewFlag(session, 'a', true);
  assert.deepEqual(marked.navigation.items.map((item) => item.flagged), [true, true]);
  assert.deepEqual(withReviewFlag(marked, 'b', false).navigation.items.map((item) => item.flagged), [true, false]);
  assert.equal(session.navigation.items[0].flagged, false, 'the session itself is not mutated');
  const bare = { status: 'in_progress' };
  assert.equal(withReviewFlag(bare, 'a', true), bare);
});

test('the warning comes the event before an integrity pause — including after a teacher resumes one', () => {
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 2, lockThreshold: 3, warning: true }), true, 'the server says so');
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 2, lockThreshold: 3 }), true, 'one short of the limit');
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 1, lockThreshold: 3 }), false);
  // A resumed integrity pause keeps its count at the limit: the next event pauses again.
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 3, lockThreshold: 3 }), true);
  assert.equal(integrityWarningDue({ status: 'locked_integrity', violationCount: 3, lockThreshold: 3, warning: true }), false, 'a paused test shows the pause, not the warning');
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 0, lockThreshold: 1 }), false, 'nothing has happened yet');
  assert.equal(integrityWarningDue({ status: 'in_progress', violationCount: 2 }), true, 'the default limit is 3');
  assert.equal(pauseKind('locked_proctor'), 'teacher');
  assert.equal(pauseKind('locked_integrity'), 'integrity');
  assert.equal(pauseKind('in_progress'), null);
});

test('a failed call is a pause, a refusal, the end of time, a closed question or a connection problem', () => {
  const error = (code, message, details) => Object.assign(new Error(message), { code, ...(details ? { details } : {}) });
  assert.deepEqual(classifySecureExamError(error('functions/failed-precondition', 'This exam is locked. Ask the proctor to review the session.', { status: 'locked_proctor' })),
    { kind: 'locked', status: 'locked_proctor', message: 'This exam is locked. Ask the proctor to review the session.' });
  assert.equal(classifySecureExamError(error('functions/failed-precondition', 'x', { status: 'locked_integrity' })).status, 'locked_integrity');
  const refusal = classifySecureExamError(error('functions/failed-precondition', 'This is the end of module 1.', { navigation: 'module_end' }));
  assert.deepEqual([refusal.kind, refusal.reason, refusal.message], ['navigation', 'module_end', 'This is the end of module 1.']);
  assert.equal(classifySecureExamError(error('failed-precondition', '', { navigation: 'not_reached' })).message, NAVIGATION_MESSAGES.not_reached);
  assert.equal(classifySecureExamError(error('functions/deadline-exceeded', 'The exam time has expired.')).kind, 'expired');
  // The SDK reports a call that simply took too long with the same code.
  assert.equal(classifySecureExamError(error('functions/deadline-exceeded', 'deadline-exceeded')).kind, 'network');
  assert.equal(classifySecureExamError(error('functions/deadline-exceeded', 'deadline-exceeded'), { expiresAt: 1000, now: 2000 }).kind, 'expired');
  assert.deepEqual(classifySecureExamError(error('functions/failed-precondition', 'This exam is locked. Ask the proctor to review the session.')).status, null, 'an older server: paused, kind unknown');
  assert.equal(classifySecureExamError(error('functions/failed-precondition', 'A locked exam must be resolved by the proctor.')).kind, 'locked');
  assert.equal(classifySecureExamError(error('functions/failed-precondition', 'This exam has already been submitted.')).kind, 'finished');
  assert.equal(classifySecureExamError(error('functions/failed-precondition', 'That question is no longer active.')).kind, 'itemClosed');
  assert.equal(classifySecureExamError(error('functions/unavailable', 'Failed to fetch')).kind, 'network');
  assert.equal(classifySecureExamError(error('functions/invalid-argument', 'This answer is too large to record.')).kind, 'other');
  assert.equal(classifySecureExamError(null).kind, 'other');
});

test('statuses are a student\'s words; a practice test says its results come right after Submit', () => {
  const label = (status, extra = {}) => studentSessionStatus({ status, ...extra }).label;
  assert.equal(label('not_started'), 'Not started');
  assert.equal(label('in_progress'), 'In progress');
  assert.equal(label('locked_proctor'), 'Paused by your teacher');
  assert.equal(label('locked_integrity'), 'Paused — ask your teacher');
  assert.equal(label('submitted'), 'Submitted');
  assert.equal(label('force_submitted'), 'Submitted by your teacher');
  assert.equal(label('time_expired'), 'Time ran out');
  assert.equal(label('submitted', { feedbackReleased: true }), 'Results ready');
  assert.equal(label('time_expired', { feedbackReleased: true }), 'Results ready');
  assert.equal(label('something_new'), 'Not available yet');
  assert.equal(label('in_progress', { feedbackReleased: true }), 'In progress', 'released results are not shown before the test is finished');
  // An attempt a teacher's reset replaced keeps its release on the server, but the list does not offer it.
  assert.equal(label('force_submitted', { feedbackReleased: true, resetAt: 1_700_000_000_000 }), 'Replaced by a new attempt');
  assert.equal(sessionWasReplaced({ status: 'force_submitted', feedbackReleased: true, resetAt: 1_700_000_000_000 }), true);
  assert.equal(sessionWasReplaced({ status: 'submitted', feedbackReleased: true }), false);
  assert.equal(resultsTimingText({ status: 'force_submitted', resetAt: 1_700_000_000_000 }), null, 'no "waiting for results" on a replaced attempt');
  for (const raw of ['not_started', 'in_progress', 'locked_proctor', 'locked_integrity', 'submitted', 'force_submitted', 'time_expired']) {
    assert.doesNotMatch(label(raw), /_/, `${raw} is shown as words`);
  }

  const practice = { examType: 'digitalSAT', releasePolicy: 'automatic' };
  assert.equal(resultsTimingText({ ...practice, status: 'not_started' }), 'Results are ready right after you submit.');
  assert.equal(resultsTimingText({ ...practice, status: 'submitted', feedbackReleased: true }), null);
  assert.equal(resultsTimingText({ examType: 'courseTest', releasePolicy: 'automatic', status: 'in_progress' }), null, 'a course Test is never released automatically');
  assert.equal(resultsTimingText({ examType: 'act', releasePolicy: 'teacher', status: 'submitted' }), 'Your teacher hasn\'t released results yet.');
  assert.equal(resultsTimingText({ examType: 'act', status: 'submitted' }), 'Your teacher hasn\'t released results yet.', 'a session from before release policies');
});

test('time: the session\'s own limit, a teacher\'s added minutes, and extended time named', () => {
  assert.deepEqual(timeAllowance({ timed: false, timeLimitSeconds: null }), { timed: false, minutes: null, extended: false });
  assert.deepEqual(timeAllowance({ timed: true, timeLimitSeconds: 1440, addedTimeSeconds: 300, extendedTimeMultiplier: 1.5 }), { timed: true, minutes: 29, extended: true });
  assert.equal(timeAllowanceText(timeAllowance({ timeLimitSeconds: 1440, extendedTimeMultiplier: 1.5 })), '24 minutes (includes your extended time)');
  assert.equal(timeAllowanceText(timeAllowance({ timeLimitSeconds: 60 })), '1 minute');
  assert.equal(timeAllowance({ timeLimitSeconds: 6 }).minutes, 1, 'a timed test never reads as 0 minutes, which the start screen would call untimed');
  assert.equal(timeAllowanceText(timeAllowance({ timeLimitSeconds: null })), 'Untimed');
});

test('the finished screen offers results only when they were released', () => {
  const practice = finishedSummary({ status: 'submitted', feedbackReleased: true, requiredQuestions: 10, answeredQuestions: 7 });
  assert.equal(practice.canSeeResults, true);
  assert.equal(practice.title, 'Practice test submitted');
  assert.equal(practice.message, 'Your answers are turned in. You answered 7 of 10 questions. Your results are ready.');
  const course = finishedSummary({ status: 'submitted', feedbackReleased: false, requiredQuestions: 25, answeredQuestions: 25 }, { courseTest: true });
  assert.equal(course.canSeeResults, false);
  assert.match(course.message, /Your score appears after your teacher releases results\.$/);
  assert.equal(finishedSummary({ status: 'time_expired', requiredQuestions: 2, answeredQuestions: 1 }).title, 'Time is up');
  assert.equal(finishedSummary({ status: 'force_submitted', requiredQuestions: 2 }).title, 'Your teacher turned in your test');
});

test('the start rules describe moving around, and none of the one-way rules or jargon remain', () => {
  const course = startScreenRules({ courseTest: true, questionCount: 25, allowance: { timed: true, minutes: 45 }, calculatorMode: 'none' }).join('\n');
  for (const rule of [/25 questions\. You have 45 minutes/, /skip a question and come back to it/, /Mark any question for review/, /change any answer until you submit/, /save automatically/, /There is no calculator/, /after 3 times in all, the test pauses until your teacher lets you continue/, /blank count as zero/]) {
    assert.match(course, rule);
  }
  const practice = startScreenRules({ questionCount: 10, allowance: { timed: true, minutes: 24, extended: true }, modules: true, automaticResults: true }).join('\n');
  assert.match(practice, /This includes your extended time\./);
  assert.match(practice, /2 modules/);
  assert.match(practice, /ready as soon as you submit/);
  assert.doesNotMatch(practice, /calculator/i, 'a simulation\'s calculator is the item\'s to show');
  assert.match(startScreenRules({ allowance: null }).join('\n'), /If this test is timed, the timer starts when you press Start/);
  assert.match(startScreenRules({ courseTest: true, allowance: { timed: false } }).join('\n'), /This test is not timed\. Take the time you need\./);
  for (const rules of [course, practice]) {
    assert.doesNotMatch(rules, /one attempt|cannot go back|can't go back to (?!module)|monitored web delivery|lockdown|proctor/i);
  }
});

test('the start screen states the student\'s own time before Start, and the time LEFT when they come back', () => {
  const now = Date.UTC(2026, 9, 7, 14, 0, 0);
  // Not started: the student's list carries the extension the server will apply at Start.
  const projected = startScreenTime({ session: { status: 'not_started', timed: true, timeLimitSeconds: 2700, baseTimeLimitSeconds: 1800, extendedTimeMultiplier: 1.5 }, now });
  assert.deepEqual(projected, { timed: true, minutes: 45, extended: true, resuming: false, minutesLeft: null });
  assert.match(startScreenRules({ courseTest: true, allowance: projected }).join('\n'), /You have 45 minutes, starting when you press Start\. The timer stays on screen\. This includes your extended time\./);

  // A course Test opened from its card before the session is known: the delivery facts, extension included.
  const fromCard = startScreenTime({ delivery: { timed: true, timeLimitMinutes: 45, baseTimeLimitMinutes: 30, extendedTimeMultiplier: 1.5 }, courseTest: true, now });
  assert.deepEqual(fromCard, { timed: true, minutes: 45, extended: true, resuming: false, minutesLeft: null });
  assert.equal(startScreenTime({ delivery: { timed: true, timeLimitMinutes: 30 }, courseTest: true }).extended, false);
  assert.equal(startScreenTime({ delivery: { timed: false, timeLimitMinutes: null }, courseTest: true }).timed, false);
  assert.equal(startScreenTime({ delivery: { timed: true, timeLimitMinutes: 30 } }), null, 'a practice test does not read a course Test\'s delivery facts');
  assert.equal(startScreenTime({}), null);
  // Once the session is known it wins over the card.
  assert.equal(startScreenTime({ session: { status: 'not_started', timeLimitSeconds: 1800 }, delivery: { timed: true, timeLimitMinutes: 99 }, courseTest: true }).minutes, 30);

  // Coming back: the clock kept running, so the student is told what is left.
  const resumed = startScreenTime({ session: { status: 'in_progress', timed: true, timeLimitSeconds: 2700, extendedTimeMultiplier: 1.5, expiresAt: now + 12.2 * 60000 }, now });
  assert.deepEqual([resumed.resuming, resumed.minutesLeft], [true, 13]);
  const resumedRules = startScreenRules({ courseTest: true, allowance: resumed }).join('\n');
  assert.match(resumedRules, /Your timer started when you first pressed Start and has kept running: about 13 minutes are left\./);
  assert.doesNotMatch(resumedRules, /starting when you press Start/);
  assert.equal(startScreenTime({ session: { status: 'locked_proctor', timeLimitSeconds: 600, expiresAt: now + 60000 }, now }).minutesLeft, 1, 'a paused test comes back the same way');
  assert.match(startScreenRules({ allowance: { timed: true, minutes: 10, resuming: true, minutesLeft: 1 } }).join('\n'), /about 1 minute is left\./);
  assert.equal(startScreenTime({ session: { status: 'in_progress', timeLimitSeconds: 600, expiresAt: now - 5000 }, now }).minutesLeft, 0);
  assert.match(startScreenRules({ allowance: { timed: true, minutes: 10, resuming: true, minutesLeft: 0 } }).join('\n'), /Your time for this test is up\. Open the test to turn in your saved answers\./);
  assert.match(startScreenRules({ allowance: { timed: true, minutes: 10, resuming: true, minutesLeft: null } }).join('\n'), /has kept running\. It stays on screen\./);
  const untimed = startScreenTime({ session: { status: 'in_progress', timed: false, timeLimitSeconds: null }, now });
  assert.deepEqual([untimed.timed, untimed.resuming], [false, true]);
  assert.match(startScreenRules({ courseTest: true, allowance: untimed }).join('\n'), /This test is not timed\./);
});

test('integrity messages name everything that counts toward the pause', () => {
  // Every event the logger records, and the words a student would recognise it by.
  const words = {
    [INTEGRITY_EVENT_TYPES.TAB_SWITCH]: /(leav(e|ing)|left) (it|the test window)/,
    [INTEGRITY_EVENT_TYPES.WINDOW_BLUR]: /(leav(e|ing)|left) (it|the test window)/,
    [INTEGRITY_EVENT_TYPES.FULLSCREEN_EXIT]: /(leav(e|ing)|left) (it|the test window)/,
    [INTEGRITY_EVENT_TYPES.COPY_PASTE_ATTEMPT]: /copy, paste/,
    [INTEGRITY_EVENT_TYPES.CONTEXT_MENU]: /right-click/,
    [INTEGRITY_EVENT_TYPES.SHORTCUT_ATTEMPT]: /copy, paste/,
  };
  const rules = startScreenRules({ allowance: null, lockThreshold: 3 }).join('\n');
  for (const type of Object.values(INTEGRITY_EVENT_TYPES)) {
    assert.ok(words[type], `a new integrity event (${type}) needs words in the warning, the pause and the start rules`);
    for (const [name, text] of [['warning', INTEGRITY_WARNING_TEXT], ['pause', integrityPauseText(3)], ['start rules', rules]]) {
      assert.match(text, words[type], `${name} names ${type}`);
    }
  }
  assert.equal(INTEGRITY_WARNING_TEXT, 'One more time leaving the test window, or trying to copy, paste or right-click, will pause the test for your teacher.');
  assert.equal(integrityPauseText(3), 'The test paused because you left the test window or tried to copy, paste or right-click 3 times in all. Your answers are saved. Raise your hand — your teacher can let you continue.');
  assert.match(integrityPauseText(5), /5 times in all/);
  assert.match(integrityPauseText(), /3 times in all/, 'the default limit');
  assert.match(rules, /after 3 times in all, the test pauses/);
});

test('a refusal that says only "paused" keeps the pause already on screen', () => {
  assert.equal(pausedStatusAfterRefusal('locked_integrity', 'in_progress'), 'locked_integrity');
  assert.equal(pausedStatusAfterRefusal('locked_proctor', 'locked_integrity'), 'locked_proctor', 'a refusal that names the pause wins');
  assert.equal(pausedStatusAfterRefusal(null, 'locked_integrity'), 'locked_integrity', 'finalize\'s refusal does not relabel an integrity pause');
  assert.equal(pausedStatusAfterRefusal(null, 'locked_proctor'), 'locked_proctor');
  assert.equal(pausedStatusAfterRefusal(null, 'in_progress'), 'locked_proctor', 'nothing on screen yet: the teacher\'s, until the server says');
  assert.equal(pausedStatusAfterRefusal('something_else', 'in_progress'), 'locked_proctor');
});
