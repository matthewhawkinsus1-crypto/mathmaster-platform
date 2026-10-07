/*
 * ONE TEACHER ROW, READ IN PLAIN WORDS — AND ONLY THE ACTIONS THAT APPLY.
 *
 * The Test Cycle table used to put eight buttons on every student row whatever
 * their state: "Waive Review" next to a student who had finished the cycle,
 * "Reset Test session" (which force-submits a Test) one tap from a student
 * mid-exam, and nothing that said who was in progress, who had submitted and
 * was waiting for the teacher, or how far Review and Corrections had got.
 *
 * This projects a row from `listTeacherTestCycleRecords` (server-computed
 * stage, review progress, session states and the canonical grade numbers)
 * into column text and the subset of teacher actions that make sense for that
 * student now. It decides nothing about grades or stages; the server does.
 * Pure: no React, no Firestore.
 */

export const TEACHER_BUCKET_LABEL = Object.freeze({
  notStarted: 'Not started',
  inReview: 'In Review',
  readyForTest: 'Ready for Test',
  testing: 'Testing now',
  awaitingRelease: 'Submitted — release needed',
  passed: 'Passed',
  inCorrections: 'In corrections',
  retestOpen: 'Retest open',
  retestAwaitingRelease: 'Retest submitted — release needed',
  complete: 'Complete',
  retestClosed: 'Retest closed',
  needsAttention: 'Needs attention — Test locked',
});

/** The order a teacher scans for "who needs me?". */
export const TEACHER_BUCKET_ORDER = Object.freeze([
  'needsAttention', 'awaitingRelease', 'retestAwaitingRelease', 'testing', 'readyForTest', 'inReview', 'notStarted',
  'inCorrections', 'retestOpen', 'passed', 'complete', 'retestClosed',
]);

const progress = (done, total) => (Number(total) > 0 ? `${Number(done) || 0}/${Number(total)}` : '—');

/*
 * An EXTERNAL-ORIGINAL cycle (the district DOL) has no MathMaster Test: the
 * original score comes from another system, and the one secure session — the
 * record's `test` — is the retest. The same rows read in those words.
 */
const EXTERNAL_BUCKET_LABEL = Object.freeze({
  readyForTest: 'Ready for retest',
  testing: 'Retesting now',
  awaitingRelease: 'Retest submitted — release needed',
  passed: 'Complete',
  retestClosed: 'Retest closed',
  needsAttention: 'Needs attention — retest locked',
});

export const describeTeacherRow = (row = {}, { external = false } = {}) => {
  const review = row.review || {};
  const test = row.test || {};
  const retest = row.retest || {};
  const corrections = row.corrections || {};
  const controls = row.teacherControls || {};

  const masteryGated = review.minimumMastery !== undefined && review.minimumMastery !== null;
  const reviewText = controls.reviewWaived
    ? 'Waived'
    : review.complete
      ? 'Done'
      : masteryGated
        ? `${progress(review.attempted, review.total)} · ${Math.floor(Number(review.mastery) || 0)}% of ${review.minimumMastery}%`
        : progress(review.attempted, review.total);

  const attention = row.attention || null;
  const lockedText = attention
    ? (attention.lockedBy === 'teacher'
      ? 'Locked by you'
      : `Locked · ${attention.violationCount || 0} integrity event${attention.violationCount === 1 ? '' : 's'}`)
    : null;
  const sessionText = (session, { opened }, stageId) => {
    if (attention && attention.stage === stageId) return lockedText;
    if (session.state === 'released') return 'Released';
    if (session.state === 'submitted') return 'Submitted · release needed';
    if (session.state === 'inProgress') return `In progress ${progress(session.answeredQuestions, session.totalQuestions)}`;
    if (session.state === 'assigned') return opened;
    return '—';
  };
  // No session is "Not opened" whatever the stage. A student whose Review was
  // waived (or finished) before sessions were opened is at the Test stage with
  // nothing to enter, and a bare dash there hid that the teacher still owes them one.
  const testText = !test.examSessionId
    ? 'Not opened'
    : sessionText(test, { opened: row.stage === 'test' ? 'Ready' : 'Opened' }, 'test');

  let correctionsText = '—';
  if (controls.correctionsWaived || corrections.waived) correctionsText = 'Waived';
  else if (corrections.complete) correctionsText = Number(corrections.total) > 0 ? 'Complete' : 'Nothing to correct';
  else if (corrections.required) correctionsText = progress(corrections.completedTargets, corrections.total);
  else if (test.state === 'released') correctionsText = 'Not required';

  const retestText = controls.retestDisabled && retest.state !== 'released'
    ? 'Closed'
    : sessionText(retest, { opened: 'Ready' }, 'retest');

  if (external) {
    return {
      bucketLabel: EXTERNAL_BUCKET_LABEL[row.bucket] || TEACHER_BUCKET_LABEL[row.bucket] || row.statusLabel || '—',
      reviewText,
      testText: row.originalTestGrade === null || row.originalTestGrade === undefined ? 'Not entered' : 'Entered',
      correctionsText: 'Not used',
      retestText: controls.retestDisabled && test.state !== 'released'
        ? 'Closed'
        : sessionText(test, { opened: 'Ready' }, 'test'),
      needsRelease: test.state === 'submitted',
    };
  }
  return {
    bucketLabel: TEACHER_BUCKET_LABEL[row.bucket] || row.statusLabel || '—',
    reviewText,
    testText,
    correctionsText,
    retestText,
    needsRelease: test.state === 'submitted' || retest.state === 'submitted',
  };
};

/* The external-original actions: Review, then the one secure retest session. */
const externalActionsForRow = (row, actions) => {
  const test = row.test || {};
  const controls = row.teacherControls || {};
  if (test.state === 'submitted') {
    actions.push({ key: 'release', label: 'Release retest result', kind: 'release', stage: 'test' });
  }
  if (!controls.reviewWaived && row.stage === 'review') {
    actions.push({
      key: 'waiveReview',
      action: 'waiveReview',
      label: 'Waive Review',
      detail: test.examSessionId
        ? 'Lets this student start the retest without finishing Review.'
        : 'Lets this student skip Review. Their retest session is not open yet: enter their original score and open retest sessions so they can start.',
      doneNote: test.examSessionId ? null : 'Their retest opens once you enter their original score and open retest sessions.',
    });
  }
  if (controls.reviewWaived && !['inProgress', 'submitted', 'released'].includes(test.state)) {
    actions.push({ key: 'requireReview', action: 'requireReview', label: 'Require Review', detail: 'Review must be finished again before the retest.' });
  }
  if (!controls.retestDisabled && test.state !== 'released') {
    actions.push({ key: 'disableRetest', action: 'disableRetest', label: 'Close retest', detail: 'This student can no longer retest; the original score stands.', confirm: true });
  }
  if (controls.retestDisabled && test.state !== 'released') {
    actions.push({ key: 'unlockRetest', action: 'unlockRetest', label: 'Reopen retest', detail: 'This student can take the retest again.' });
  }
  if (test.examSessionId) {
    actions.push({
      key: 'resetTest',
      action: 'resetSecureSession',
      stage: 'test',
      label: 'Reset Retest session',
      detail: test.state === 'released'
        ? 'Discards the released retest score and issues a new retest with different questions.'
        : 'Issues a new retest with different questions.',
      confirm: true,
    });
  }
  return actions;
};

/*
 * The actions that apply to this student now. Each names its consequence so
 * the menu can say it before the teacher commits; `confirm` marks the ones
 * that throw work away or change a grade path, which the panel asks about.
 */
export const teacherActionsForRow = (row = {}, { external = false } = {}) => {
  const test = row.test || {};
  const retest = row.retest || {};
  const controls = row.teacherControls || {};
  const stage = row.stage;
  const testReleased = test.state === 'released';
  const actions = [];

  // A locked Test is a student waiting: unlocking comes first, and says what
  // it does. (Review the integrity events in the Secure Exams monitor.)
  if (row.attention?.kind === 'locked' && row.attention.examSessionId) {
    actions.push({
      key: 'unlock',
      kind: 'unlock',
      examSessionId: row.attention.examSessionId,
      label: row.attention.stage === 'retest' || external ? 'Unlock the locked retest' : 'Unlock the locked Test',
      detail: 'The student continues where they stopped, with the answers already recorded.',
    });
  }
  if (external) return externalActionsForRow(row, actions);
  if (test.state === 'submitted' || retest.state === 'submitted') {
    actions.push({ key: 'release', label: test.state === 'submitted' ? 'Release Test result' : 'Release retest result', kind: 'release', stage: test.state === 'submitted' ? 'test' : 'retest' });
  }
  if (!testReleased && !controls.reviewWaived && stage === 'review') {
    actions.push({
      key: 'waiveReview',
      action: 'waiveReview',
      label: 'Waive Review',
      detail: test.examSessionId
        ? 'Lets this student start the Test without finishing Review.'
        : 'Lets this student skip Review. Their Test is not open yet, so open it afterwards with "Open this student\'s Test session".',
      // Said after it succeeds: the waiver alone does not let them start.
      doneNote: test.examSessionId ? null : 'Their Test is not open yet. Use "Open this student\'s Test session" below so they can start it.',
    });
  }
  /*
   * Waiving Review (or finishing it) before any Test session exists leaves the
   * student at the Test stage with nothing to enter: their card says "Your
   * teacher has not opened the secure test session yet." The class-wide button
   * fixes it but is a screen away from the row, so the row offers it for this
   * student. It is the same callable, scoped to one student; the server still
   * checks they are in the assignment's audience and re-runs preflight.
   */
  if (!test.examSessionId && (controls.reviewWaived || stage === 'test')) {
    actions.push({
      key: 'openTest',
      kind: 'openSession',
      label: 'Open this student\'s Test session',
      detail: 'Issues this student\'s secure Test now so they can start it.',
    });
  }
  if (controls.reviewWaived && !['inProgress', 'submitted', 'released'].includes(test.state)) {
    actions.push({ key: 'requireReview', action: 'requireReview', label: 'Require Review', detail: 'Review must be finished again before the Test.' });
  }
  if (stage === 'corrections') {
    actions.push({ key: 'waiveCorrections', action: 'waiveCorrections', label: 'Waive corrections', detail: 'Opens the retest now without corrections.' });
  }
  if (testReleased && (controls.correctionsWaived || !controls.requireCorrections) && !retest.examSessionId) {
    actions.push({ key: 'requireCorrections', action: 'requireCorrections', label: 'Require corrections', detail: 'Corrections must be finished before the retest.' });
  }
  if (testReleased && !retest.examSessionId && (stage === 'passed' || stage === 'corrections' || stage === 'retestClosed')) {
    actions.push({ key: 'unlockRetest', action: 'unlockRetest', label: 'Unlock retest', detail: stage === 'passed' ? 'Gives a passing student a retest. It can only raise the grade, to the cap.' : 'Opens the retest now.' });
  }
  if (testReleased && !controls.retestDisabled && retest.state !== 'released' && stage !== 'passed') {
    actions.push({ key: 'disableRetest', action: 'disableRetest', label: 'Close retest', detail: 'This student can no longer retest; the recorded grade stands.', confirm: true });
  }
  if (test.examSessionId) {
    actions.push({
      key: 'resetTest',
      action: 'resetSecureSession',
      stage: 'test',
      label: 'Reset Test session',
      detail: test.state === 'released'
        ? 'Discards the released Test score and issues a new Test with different questions.'
        : test.state === 'inProgress'
          ? 'Ends the Test this student is taking now and issues a new one.'
          : 'Issues a new Test with different questions.',
      confirm: true,
    });
  }
  if (retest.examSessionId) {
    actions.push({ key: 'resetRetest', action: 'resetSecureSession', stage: 'retest', label: 'Reset Retest session', detail: 'Discards this retest and issues a new one.', confirm: true });
  }
  if (testReleased) actions.push({ key: 'plans', kind: 'plans', label: 'View correction and retest plans' });
  return actions;
};
