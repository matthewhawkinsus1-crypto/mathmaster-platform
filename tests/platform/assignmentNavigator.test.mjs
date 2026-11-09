// Pass 3, RUN-5 / RUN-8 / RUN-9: what the assignment navigator says about a
// question and a section. Behaviour, from the pure model App.jsx renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outcomeWithheld,
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

test('RUN-9: out of tries on a question that offers a new version is not finished', () => {
  // Classwork / Practice / Warm-Up: "Request New Question" gives a fresh
  // version with full credit still reachable.
  const shown = describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: true });
  assert.equal(shown.status, QUESTION_STATUS.NEW_QUESTION);
  assert.equal(shown.label, 'Out of tries · new question available');
  assert.equal(shown.spoken, 'out of tries, a new question is available');
  // Not counted as done, and a tab lands on it.
  assert.equal(describeNavigatorSectionProgress({ questions: [shown, { status: QUESTION_STATUS.CORRECT }] }).done, 1);
  assert.equal(sectionLandingEntry({ entries: [
    { index: 1, viewable: true, workable: true, status: QUESTION_STATUS.CORRECT },
    { index: 2, viewable: true, workable: true, status: shown.status },
  ] }).index, 2);
  // In a closed section the request is locked too: closed.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: true, sectionClosed: true }).status, QUESTION_STATUS.CLOSED);
  // Held feedback still wins.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: true, feedbackHeld: true }).status, QUESTION_STATUS.SUBMITTED);
});

test('the outcome is withheld exactly when the question withholds it', () => {
  const attempted = { status: 'attempted', attemptCount: 1, totalAttempts: 1 };
  assert.equal(outcomeWithheld({ feedbackMode: 'immediate', record: attempted }), false);
  assert.equal(outcomeWithheld({ feedbackMode: 'teacherRelease', record: correct }), true);
  assert.equal(outcomeWithheld({ feedbackMode: 'teacherRelease', record: correct, released: true }), false);
  // A DOL ('afterAssignmentSubmit') with a teacher's extra try: after the
  // first try it is still open, and its outcome is not shown yet.
  assert.equal(outcomeWithheld({ feedbackMode: 'afterAssignmentSubmit', record: attempted }), true);
  assert.equal(describeNavigatorQuestion({ record: attempted, maximumAttempts: 2, feedbackHeld: outcomeWithheld({ feedbackMode: 'afterAssignmentSubmit', record: attempted }) }).status, QUESTION_STATUS.SUBMITTED);
  // Finished, its outcome is shown.
  assert.equal(outcomeWithheld({ feedbackMode: 'afterAssignmentSubmit', record: outOfTries }), false);
  assert.equal(outcomeWithheld({ feedbackMode: 'afterAssignmentSubmit', record: correct }), false);
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

// P-7, before the family engine: after a reload straight into an assignment
// the question a family slot dealt, and whether a question can vary, are not
// known until the engine lands. Counted on the stored slot, a Warm-Up 2 its one
// try had closed read "2 tries left"; guessed "cannot vary", a question with a
// new version waiting read "Closed" and counted as done.
test('P-7: an answered question whose tries are not known yet is neither counted nor labelled', () => {
  const closedAfterOneTry = { status: 'expired', attemptCount: 1, totalAttempts: 1, bestPartialCredit: 75 };
  // The stored slot's count (three) stands in for the dealt one's (one).
  const before = describeNavigatorQuestion({ record: closedAfterOneTry, maximumAttempts: 3, triesKnown: false });
  assert.equal(before.status, QUESTION_STATUS.PENDING);
  assert.equal(before.label, 'Loading…');
  assert.equal(before.spoken, 'loading');
  assert.equal(before.triesLeft, null, 'no count');
  // What it said: a count, and a state, that were never the student's.
  const counted = describeNavigatorQuestion({ record: closedAfterOneTry, maximumAttempts: 3 });
  assert.equal(counted.label, '75% so far · 2 tries left');
  // Once known, it says what it is.
  assert.equal(describeNavigatorQuestion({ record: closedAfterOneTry, maximumAttempts: 1, triesKnown: true }).label, 'Closed · 75% credit');
  // A missed try with tries left reads its count only once it is known.
  assert.equal(describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 3, triesKnown: false }).status, QUESTION_STATUS.PENDING);
  // Nothing that does not read the tries waits: not started, correct, held, locked.
  assert.equal(describeNavigatorQuestion({ record: null, maximumAttempts: 3, triesKnown: false }).status, QUESTION_STATUS.NOT_STARTED);
  assert.equal(describeNavigatorQuestion({ record: null, maximumAttempts: 3, triesKnown: false, sectionClosed: true }).label, 'Closed · not started');
  assert.equal(describeNavigatorQuestion({ record: correct, maximumAttempts: 3, triesKnown: false }).status, QUESTION_STATUS.CORRECT);
  assert.equal(describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 1, triesKnown: false, feedbackHeld: true }).status, QUESTION_STATUS.SUBMITTED);
  assert.equal(describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 3, triesKnown: false, available: false, lockedLabel: 'Opens 2:15 PM' }).status, QUESTION_STATUS.LOCKED);
});

test('P-7: out of tries, a question not known to vary yet is pending where its section could offer a new version', () => {
  const before = describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: false, replacementKnown: false });
  assert.equal(before.status, QUESTION_STATUS.PENDING);
  // Guessed "no", it read closed, and closed counts as done.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: false }).status, QUESTION_STATUS.CLOSED);
  // Known, either way.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementAvailable: true }).status, QUESTION_STATUS.NEW_QUESTION);
  // A closed section offers nothing, so it is closed whichever it is.
  assert.equal(describeNavigatorQuestion({ record: outOfTries, maximumAttempts: 3, replacementKnown: false, sectionClosed: true }).status, QUESTION_STATUS.CLOSED);
  // Tries left: the offer does not come into it.
  assert.equal(describeNavigatorQuestion({ record: missedOnce, maximumAttempts: 3, replacementKnown: false }).label, '2 tries left');
});

test('P-7: a section waiting on a pending question shows no count, and a tab lands on known work first', () => {
  const pending = describeNavigatorQuestion({ record: { status: 'expired', attemptCount: 1, totalAttempts: 1 }, maximumAttempts: 3, triesKnown: false });
  const progress = describeNavigatorSectionProgress({ questions: [pending, { status: QUESTION_STATUS.CORRECT }] });
  assert.equal(progress.pending, true);
  assert.equal(progress.done, null, 'it may be one done of two, or two');
  assert.equal(progress.label, 'Loading…');
  assert.equal(progress.allCorrect, false);
  const known = describeNavigatorSectionProgress({ questions: [{ status: QUESTION_STATUS.CLOSED }, { status: QUESTION_STATUS.CORRECT }] });
  assert.deepEqual([known.pending, known.done, known.label], [false, 2, '2/2']);
  // A question known to be unfinished comes before one that may be closed.
  const entries = [
    { index: 1, viewable: true, workable: true, status: QUESTION_STATUS.PENDING },
    { index: 2, viewable: true, workable: true, status: QUESTION_STATUS.TRY_AGAIN },
  ];
  assert.equal(sectionLandingEntry({ entries }).index, 2);
  // With nothing else to work, the pending one: it may still be open.
  assert.equal(sectionLandingEntry({ entries: [entries[0], { index: 2, viewable: true, workable: true, status: QUESTION_STATUS.CORRECT }] }).index, 1);
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
    role: 'classwork', label: 'the Classwork', nowValue: now, hasWork: true,
    manualState: { enabled: true, isOpen: false, status: 'closed', override: { state: 'closed' } },
  });
  assert.equal(closedByTeacher.state, SECTION_ACCESS.READ_ONLY);
  assert.equal(closedByTeacher.short, 'Closed by your teacher');
  assert.match(closedByTeacher.reason, /^Your teacher closed the Classwork\. Your work stays here/);
  // No work in it: no promise about work.
  const closedNoWork = describeSectionAccess({
    role: 'classwork', label: 'the Classwork', nowValue: now,
    manualState: { enabled: true, isOpen: false, status: 'closed', override: { state: 'closed' } },
  });
  assert.equal(closedNoWork.state, SECTION_ACCESS.READ_ONLY);
  assert.equal(closedNoWork.reason, 'Your teacher closed the Classwork. You cannot submit until it is opened again.');
  // A label that starts a sentence is capitalised; mid-sentence it is not.
  const waiting = describeSectionAccess({ role: 'dol', label: 'the Exit ticket (DOL)', timedDol: true, nowValue: now, formatTime, dolState: { enabled: true, status: 'waiting', opensAt: at(14, 15) } });
  assert.equal(waiting.reason, 'The Exit ticket (DOL) opens at 14:15.');
  const timeUp = describeSectionAccess({ role: 'dol', label: 'the Exit ticket (DOL)', timedDol: true, nowValue: now, dolState: { enabled: true, status: 'ended' } });
  assert.equal(timeUp.reason, 'Time is up for the Exit ticket (DOL). Ask your teacher if you missed it.');

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

test('a section on another class day names the day, never the stored key', () => {
  const formatDate = (date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  const dol = (instructionDateKey) => describeSectionAccess({ role: 'dol', label: 'the Exit ticket (DOL)', timedDol: true, nowValue: now, formatDate, dolState: { enabled: true, status: 'notToday', instructionDateKey } });
  // now is Wed Oct 14, 2026.
  const future = dol('2026-10-19');
  assert.equal(future.short, 'Opens Mon 10/19');
  assert.equal(future.reason, 'The Exit ticket (DOL) opens in class on Mon 10/19.');
  const past = dol('2026-10-12');
  assert.equal(past.short, 'Closed');
  assert.equal(past.reason, 'The Exit ticket (DOL) was open in class on Mon 10/12. It is closed now.');
  const today = dol('2026-10-14');
  assert.equal(today.short, 'Opens in class');
  for (const access of [future, past, today]) assert.doesNotMatch(`${access.short} ${access.reason}`, /\d{4}-\d{2}-\d{2}/);
  // The default wording is a day too.
  assert.match(describeSectionAccess({ role: 'warmup', label: 'the Warm-Up', nowValue: now, warmupState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-19' } }).short, /^Opens \w{3}, Oct 19$/);
});

test('a preview and post-deadline practice open everything', () => {
  const access = describeSectionAccess({ role: 'dol', timedDol: true, unrestricted: true, dolState: { enabled: true, status: 'waiting' } });
  assert.equal(access.state, SECTION_ACCESS.OPEN);
});
