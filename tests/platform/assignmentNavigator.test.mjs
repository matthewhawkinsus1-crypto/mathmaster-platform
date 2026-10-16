// Pass 3, RUN-5 / RUN-8 / RUN-9: what the assignment navigator says about a
// question and a section. Behaviour, from the pure model App.jsx renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTION_STATUS,
  SECTION_ACCESS,
  describeNavigatorQuestion,
  describeNavigatorSectionProgress,
  describeSectionAccess,
  sectionLandingEntry,
} from '../../src/platform/student/assignmentNavigator.js';

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const missedOnce = { status: 'attempted', attemptCount: 1, totalAttempts: 1 };
const outOfTries = { status: 'expired', attemptCount: 3, totalAttempts: 3 };
const outOfTriesPartial = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };

test('RUN-5: a held question says submitted, never right or wrong', () => {
  for (const record of [correct, missedOnce, outOfTries]) {
    const shown = describeNavigatorQuestion({ record, maximumAttempts: 3, feedbackHeld: true });
    assert.equal(shown.status, QUESTION_STATUS.SUBMITTED);
    assert.equal(shown.spoken, 'submitted, feedback comes later');
    assert.doesNotMatch(`${shown.label} ${shown.spoken}`, /correct|another try|tries left|credit/i);
  }
  // Not answered yet: nothing to hide.
  assert.equal(describeNavigatorQuestion({ record: null, maximumAttempts: 1, feedbackHeld: true }).status, QUESTION_STATUS.NOT_STARTED);
  // Released: the verdict is back.
  assert.equal(describeNavigatorQuestion({ record: correct, maximumAttempts: 1, feedbackHeld: false }).status, QUESTION_STATUS.CORRECT);
});

test('RUN-5: a held section never shows Complete, even when every answer is right', () => {
  const questions = [correct, correct].map((record) => describeNavigatorQuestion({ record, maximumAttempts: 1, feedbackHeld: true }));
  const held = describeNavigatorSectionProgress({ questions, feedbackHeld: true });
  assert.equal(held.allCorrect, false);
  assert.equal(held.label, 'All submitted');
  // A held section with one right and one wrong reads the same.
  const mixed = [correct, outOfTries].map((record) => describeNavigatorQuestion({ record, maximumAttempts: 1, feedbackHeld: true }));
  assert.deepEqual(describeNavigatorSectionProgress({ questions: mixed, feedbackHeld: true }), held);
  // Held is enough on its own, even for states that were not masked.
  assert.equal(describeNavigatorSectionProgress({ questions: [{ status: QUESTION_STATUS.CORRECT }], feedbackHeld: true }).allCorrect, false);
  // Released and all right: Complete.
  const released = [correct, correct].map((record) => describeNavigatorQuestion({ record, maximumAttempts: 1 }));
  assert.equal(describeNavigatorSectionProgress({ questions: released }).label, 'Complete');
  assert.equal(describeNavigatorSectionProgress({ questions: released }).allCorrect, true);
});

test('RUN-9: out of tries is closed, not "needs another try"', () => {
  const shown = describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3 });
  assert.equal(shown.status, QUESTION_STATUS.CLOSED);
  assert.equal(shown.spoken, 'closed, no tries left');
  assert.equal(shown.label, 'Closed · no tries left');
  assert.equal(describeNavigatorQuestion({ record: outOfTriesPartial, maximumAttempts: 3 }).label, 'Closed · 50% credit');
  // A miss with tries left still needs another try, and says how many.
  const open = describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 3 });
  assert.equal(open.status, QUESTION_STATUS.TRY_AGAIN);
  assert.equal(open.label, '2 tries left');
  assert.equal(open.spoken, 'needs another try, 2 tries left');
  // A teacher's extra try reopens an expired question.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 5 }).status, QUESTION_STATUS.TRY_AGAIN);
});

test('RUN-9: a closed section overrides "tries left"', () => {
  const shown = describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 3, sectionClosed: true });
  assert.equal(shown.status, QUESTION_STATUS.CLOSED);
  assert.doesNotMatch(shown.label, /tries left/);
  assert.equal(describeNavigatorQuestion({ record: null, maximumAttempts: 3, sectionClosed: true }).label, 'Closed · not started');
  // A correct answer stays correct in a closed section.
  assert.equal(describeNavigatorQuestion({ record: correct, maximumAttempts: 3, sectionClosed: true }).status, QUESTION_STATUS.CORRECT);
});

test('a question whose section cannot open says why', () => {
  const shown = describeNavigatorQuestion({ record: null, maximumAttempts: 1, available: false, lockedLabel: 'Opens 2:15 PM' });
  assert.equal(shown.status, QUESTION_STATUS.LOCKED);
  assert.equal(shown.spoken, 'locked, Opens 2:15 PM');
});

test('RUN-9: a section tab lands on the next workable question, not an out-of-tries one', () => {
  const entries = [
    { index: 3, viewable: true, workable: true, status: QUESTION_STATUS.CLOSED },
    { index: 4, viewable: true, workable: true, status: QUESTION_STATUS.CORRECT },
    { index: 5, viewable: true, workable: true, status: QUESTION_STATUS.TRY_AGAIN },
  ];
  assert.equal(sectionLandingEntry({ entries }).index, 5);
  // Nothing left to work: the closed one opens for review, not a correct one.
  const finished = entries.map((entry) => (entry.index === 5 ? { ...entry, status: QUESTION_STATUS.CORRECT } : entry));
  assert.equal(sectionLandingEntry({ entries: finished }).index, 3);
  // A read-only section opens for review.
  const readOnly = entries.map((entry) => ({ ...entry, workable: false }));
  assert.equal(sectionLandingEntry({ entries: readOnly }).index, 3);
  // Nothing viewable: no landing, the tab says why instead.
  assert.equal(sectionLandingEntry({ entries: entries.map((entry) => ({ ...entry, viewable: false })) }), null);
});

const now = new Date(2026, 9, 14, 13, 0);
const at = (hour, minute) => new Date(2026, 9, 14, hour, minute);
const formatTime = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

test('RUN-8: a DOL that has not opened says when, and cannot be opened', () => {
  const access = describeSectionAccess({
    role: 'dol', label: 'Exit ticket (DOL)', timedDol: true, nowValue: now, formatTime,
    dolState: { enabled: true, status: 'waiting', opensAt: at(14, 15) },
  });
  assert.equal(access.state, SECTION_ACCESS.LOCKED);
  assert.equal(access.viewable, false);
  assert.equal(access.short, 'Opens 14:15');
  assert.equal(access.reason, 'Exit ticket (DOL) opens at 14:15.');
});

test('RUN-8: a DOL the teacher closed and one whose time ran out say which, and stay viewable read-only', () => {
  const closed = describeSectionAccess({ role: 'dol', label: 'Exit ticket (DOL)', timedDol: true, nowValue: now, dolState: { enabled: true, status: 'ended', teacherClosed: true } });
  assert.equal(closed.state, SECTION_ACCESS.READ_ONLY);
  assert.equal(closed.short, 'Closed by your teacher');
  assert.equal(closed.viewable, true);
  assert.equal(closed.workable, false);
  const timeUp = describeSectionAccess({ role: 'dol', label: 'Exit ticket (DOL)', timedDol: true, nowValue: now, dolState: { enabled: true, status: 'ended', teacherClosed: false } });
  assert.equal(timeUp.short, 'Time is up');
  // "Your work stays here" only when there is work to look over.
  assert.equal(timeUp.reason, 'Time is up for Exit ticket (DOL). Ask your teacher if you missed it.');
  const timeUpWithWork = describeSectionAccess({ role: 'dol', label: 'Exit ticket (DOL)', timedDol: true, hasWork: true, nowValue: now, dolState: { enabled: true, status: 'ended', teacherClosed: false } });
  assert.equal(timeUpWithWork.reason, 'Time is up for Exit ticket (DOL). Your work stays here to look over.');
  assert.equal(closed.reason, 'Your teacher closed Exit ticket (DOL). Ask your teacher if you missed it.');
  const closedWithWork = describeSectionAccess({ role: 'dol', label: 'Exit ticket (DOL)', timedDol: true, hasWork: true, nowValue: now, dolState: { enabled: true, status: 'ended', teacherClosed: true } });
  assert.match(closedWithWork.reason, /Your work stays here to look over\.$/);
  const warmupClosed = (hasWork) => describeSectionAccess({ role: 'warmup', label: 'The Warm-Up', hasWork, nowValue: now, warmupState: { enabled: true, status: 'closed' } }).reason;
  assert.equal(warmupClosed(false), 'The Warm-Up is closed for today. Ask your teacher if you missed it.');
  assert.equal(warmupClosed(true), 'The Warm-Up is closed for today. Your work stays here to look over.');
});

test('RUN-8: Classwork the teacher closed stays viewable read-only; one never opened stays shut', () => {
  const closedByTeacher = describeSectionAccess({
    role: 'classwork', label: 'Classwork', nowValue: now,
    manualState: { enabled: true, isOpen: false, status: 'closed', override: { state: 'closed' } },
  });
  assert.equal(closedByTeacher.state, SECTION_ACCESS.READ_ONLY);
  assert.equal(closedByTeacher.short, 'Closed by your teacher');
  assert.match(closedByTeacher.reason, /work stays here/);

  const authoredLocked = { enabled: true, isOpen: false, status: 'closed', override: null };
  const neverOpened = describeSectionAccess({ role: 'classwork', label: 'Classwork', nowValue: now, manualState: authoredLocked });
  assert.equal(neverOpened.state, SECTION_ACCESS.LOCKED);
  assert.equal(neverOpened.short, 'Opens in class');
  // ... unless the student already has work in it.
  assert.equal(describeSectionAccess({ role: 'classwork', label: 'Classwork', nowValue: now, manualState: authoredLocked, hasWork: true }).state, SECTION_ACCESS.READ_ONLY);

  const scheduled = describeSectionAccess({
    role: 'classwork', label: 'Classwork', nowValue: now, formatTime,
    manualState: { enabled: true, isOpen: false, status: 'scheduled', lifecycle: { releaseAt: at(15, 5) } },
  });
  assert.equal(scheduled.short, 'Opens 15:05');
});

test('RUN-8: a Warm-Up closed for the period is read-only; one before class says when it opens', () => {
  assert.equal(describeSectionAccess({ role: 'warmup', label: 'Warm-Up', nowValue: now, warmupState: { enabled: true, status: 'closed' } }).state, SECTION_ACCESS.READ_ONLY);
  const waiting = describeSectionAccess({ role: 'warmup', label: 'Warm-Up', nowValue: now, formatTime, warmupState: { enabled: true, status: 'waiting', opensAt: at(13, 23) } });
  assert.equal(waiting.state, SECTION_ACCESS.LOCKED);
  assert.equal(waiting.short, 'Opens 13:23');
  assert.equal(describeSectionAccess({ role: 'warmup', label: 'Warm-Up', nowValue: now, warmupState: { enabled: true, status: 'active' } }).state, SECTION_ACCESS.OPEN);
});

test('a preview and post-deadline practice open everything', () => {
  const access = describeSectionAccess({ role: 'dol', timedDol: true, unrestricted: true, dolState: { enabled: true, status: 'waiting' } });
  assert.equal(access.state, SECTION_ACCESS.OPEN);
});
