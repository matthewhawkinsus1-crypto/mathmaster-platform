import {
  TEST_CYCLE_STAGE,
  isTestCycleAssignment,
  normalizeTestCyclePolicy,
  resolveAssessmentAvailability,
} from '../assessment/testCycle.js';
import { normalizeQuestionRecord } from '../../../functions/shared/attemptPolicy.mjs';
import { studentSkillName } from '../assessment/secureExamResultsModel.js';

/*
 * WHERE IS THIS STUDENT IN THIS TEST CYCLE — AS A LIST CAN SAY IT.
 *
 * Home and the Assignments Center showed a Test Cycle like any lesson: a
 * "PRACTICE" chip, "Current grade · if stopped now" computed from the Review,
 * a Start button, and — once every Review item was correct — a move to the
 * collapsed "Finished" group while the secure Test was still waiting. A student
 * could not tell from the list that their Test had unlocked, that results were
 * released, or that corrections were now required.
 *
 * This reads two things the student's own device already holds, and nothing
 * else:
 *
 *   the PROJECTION   grades/{studentId}.testCycleGrades[assignmentId], written
 *                    only by the server: stage, session states, correction
 *                    progress, the recorded grade once released, and when the
 *                    stage last changed
 *   the TRACKER      the same canonical Review records the server gates the
 *                    Test on (answered = attempted, correctness irrelevant)
 *
 * It is a DESCRIPTION, never a gate: the card still asks the server which stage
 * is open, and the server still enforces it. Nothing here can reveal a score
 * the teacher has not released, because the projection carries none until then.
 */

export const TEST_CYCLE_DISCOVERY = Object.freeze({
  OPENS_LATER: 'opensLater',
  PAUSED: 'paused',
  REVIEW: 'review',
  TEST_PENDING: 'testPending',
  TEST_READY: 'testReady',
  TEST_IN_PROGRESS: 'testInProgress',
  AWAITING_RESULTS: 'awaitingResults',
  CORRECTIONS: 'corrections',
  RETEST_PREPARING: 'retestPreparing',
  RETEST_READY: 'retestReady',
  RETEST_IN_PROGRESS: 'retestInProgress',
  AWAITING_RETEST_RESULTS: 'awaitingRetestResults',
  COMPLETE: 'complete',
});

const clean = (value) => String(value ?? '').trim();

/**
 * Review progress from the tracker, the way the server counts it
 * (functions/lib/testCycle.js `reviewProgress`).
 *
 * Ordinarily Review is done when every item is answered, right or wrong. A
 * policy with `review.minimumMastery` (the district DOL) also needs that
 * weighted mastery, from the server-derived exact credit
 * (`bestRawPartialCredit`), never the rounded display score.
 */
export const reviewProgressFromTracker = ({ questions = [], tracker = null, minimumMastery = null } = {}) => {
  const list = Array.isArray(questions) ? questions : [];
  const indices = list.reduce((found, question, index) => {
    if (question?.teacherExcluded !== true && clean(question?.activityRole).toLowerCase() === 'review') found.push(index);
    return found;
  }, []);
  if (minimumMastery !== null && minimumMastery !== undefined) {
    let possible = 0;
    let earned = 0;
    indices.forEach((index) => {
      const weight = Number(list[index]?.questionWeight) > 0 ? Number(list[index].questionWeight) : 1;
      possible += weight;
      earned += weight * (Math.max(0, Math.min(100, Number(tracker?.[index]?.bestRawPartialCredit) || 0)) / 100);
    });
    const mastery = possible > 0 ? (earned / possible) * 100 : 0;
    const threshold = Number.isFinite(Number(minimumMastery)) ? Math.max(0, Math.min(100, Number(minimumMastery))) : 80;
    const attempted = indices.filter((index) => Number(tracker?.[index]?.totalAttempts || tracker?.[index]?.attemptCount || 0) > 0
      || ['correct', 'attempted', 'expired'].includes(tracker?.[index]?.status)).length;
    return {
      total: indices.length, attempted, mastery, minimumMastery: threshold,
      complete: indices.length > 0 && attempted === indices.length && mastery >= threshold,
    };
  }
  const attempted = indices.filter((index) => {
    const record = normalizeQuestionRecord(tracker?.[index]);
    if (record.status !== 'unattempted') return true;
    if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
    return Number(record.bestPartialCredit ?? record.partialCredit ?? 0) > 0;
  }).length;
  return { total: indices.length, attempted, complete: indices.length > 0 && attempted === indices.length };
};

/** The one sentence that says what unlocks the secure session. */
export const reviewRequirementText = (review = {}, noun = 'test') => (
  review?.minimumMastery !== undefined && review?.minimumMastery !== null
    ? `Answer every Review question and earn at least ${review.minimumMastery}% to unlock your ${noun} (now ${Math.floor(Number(review.mastery) || 0)}%).`
    : `Answer every Review question to unlock your ${noun}.`
);

const percent = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

export const describeTestCycleForStudent = ({
  assignment = null,
  projection = null,
  questions = [],
  tracker = null,
  nowValue = Date.now(),
} = {}) => {
  if (!isTestCycleAssignment(assignment)) return null;
  const policy = normalizeTestCyclePolicy(assignment.assessmentPolicy);
  const availability = resolveAssessmentAvailability({ assignment, now: nowValue });
  const review = reviewProgressFromTracker({ questions, tracker, minimumMastery: policy?.review?.minimumMastery ?? null });
  // An external-original cycle (the district DOL) has one secure session, and
  // it is the RETEST of a score the teacher entered from another system.
  const external = Boolean(policy?.externalAssessment);
  const noun = external ? 'Retest' : 'Test';
  const view = projection && typeof projection === 'object' ? projection : null;
  const stage = clean(view?.stage);
  const testState = clean(view?.testState) || 'none';
  const retestState = clean(view?.retestState) || 'none';
  const recorded = percent(view?.recordedGrade);
  const reviewRequired = policy ? policy.review.required : true;
  const reviewDone = !reviewRequired || review.total === 0 || review.complete || view?.reviewComplete === true
    || ['inProgress', 'submitted', 'released'].includes(testState);

  const result = (key, fields) => ({
    key,
    stage: stage || null,
    availability,
    review,
    recordedGrade: recorded,
    stageChangedAt: Number(view?.stageChangedAt) || null,
    tone: 'notStarted',
    actionRequired: false,
    done: false,
    started: true,
    waitingOnTeacher: false,
    ...fields,
  });

  if (!availability.open && availability.reason === 'scheduled') {
    return result(TEST_CYCLE_DISCOVERY.OPENS_LATER, {
      label: 'Opens later', detail: 'Review and Test open at the scheduled time.', tone: 'locked', started: false, actionLabel: 'Not open yet',
    });
  }
  if (!availability.open) {
    return result(TEST_CYCLE_DISCOVERY.PAUSED, {
      label: availability.reason === 'archived' ? 'Closed' : 'Paused', detail: availability.message, tone: 'locked', started: false, actionLabel: 'View',
    });
  }

  if (external && (!view || (stage === 'retestClosed' && recorded === null))) {
    return result(TEST_CYCLE_DISCOVERY.PAUSED, {
      label: stage === 'retestClosed' ? 'Retest unavailable' : 'Retest not open',
      detail: 'Your teacher opens a retest after entering your original score, when it is below passing.',
      tone: 'locked', started: false, actionLabel: 'View',
    });
  }
  if (['passed', 'complete', 'retestClosed'].includes(stage)) {
    return result(TEST_CYCLE_DISCOVERY.COMPLETE, {
      label: recorded === null ? 'Complete' : `Complete · ${recorded}%`,
      detail: stage === 'retestClosed' ? 'Your teacher has closed retesting. Your recorded grade is final.' : 'Your recorded grade is final.',
      tone: 'complete', done: true, actionLabel: 'View results',
    });
  }
  if (stage === 'retestSubmitted' || retestState === 'submitted') {
    return result(TEST_CYCLE_DISCOVERY.AWAITING_RETEST_RESULTS, {
      label: 'Retest submitted', detail: 'Your final grade appears when your teacher releases retest results.',
      tone: 'pending', done: true, waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (stage === 'retest' || retestState === 'assigned' || retestState === 'inProgress') {
    const resuming = retestState === 'inProgress';
    return result(resuming ? TEST_CYCLE_DISCOVERY.RETEST_IN_PROGRESS : TEST_CYCLE_DISCOVERY.RETEST_READY, {
      label: resuming ? 'Retest in progress' : 'Retest ready',
      detail: resuming ? 'Your answers are saved. Resume your retest.' : 'Your retest is unlocked.',
      tone: 'inProgress', actionRequired: true, actionLabel: resuming ? 'Resume Retest' : 'Start Retest',
    });
  }
  if (stage === 'retestReady') {
    return result(TEST_CYCLE_DISCOVERY.RETEST_PREPARING, {
      label: 'Retest being prepared', detail: 'It will appear here when it opens.', tone: 'pending', waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (stage === 'corrections') {
    const total = Number(view?.correctionsTotal || 0);
    const doneCount = Number(view?.correctionsCompleted || 0);
    return result(TEST_CYCLE_DISCOVERY.CORRECTIONS, {
      label: total ? `Corrections · ${doneCount} of ${total}` : 'Corrections required',
      detail: 'Finish your corrections to unlock a retest.',
      tone: 'inProgress', actionRequired: true, actionLabel: doneCount > 0 ? 'Continue Corrections' : 'Start Corrections',
    });
  }
  if (stage === 'awaitingRelease' || testState === 'submitted') {
    return result(TEST_CYCLE_DISCOVERY.AWAITING_RESULTS, {
      // Deliberately says nothing about corrections or a retest: a student who
      // has not been given a score has not been told they failed.
      label: `${noun} submitted`, detail: 'Your score appears when your teacher releases results.',
      tone: 'pending', done: true, waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (testState === 'inProgress') {
    return result(TEST_CYCLE_DISCOVERY.TEST_IN_PROGRESS, {
      label: `${noun} in progress`, detail: `Your answers are saved. Resume your ${noun.toLowerCase()}.`, tone: 'inProgress', actionRequired: true, actionLabel: `Resume ${noun}`,
    });
  }
  if (reviewDone) {
    // The Test opens when the teacher has opened sessions (a projection
    // exists, so a record exists) — otherwise Review is done and the Test is
    // waiting on the teacher, which is a different thing to tell a student.
    return view && testState === 'assigned'
      ? result(TEST_CYCLE_DISCOVERY.TEST_READY, {
        label: `${noun} ready`, detail: `Your Review is complete. Your secure ${noun.toLowerCase()} is unlocked.`, tone: 'inProgress', actionRequired: true, actionLabel: `Start ${noun}`,
      })
      : result(TEST_CYCLE_DISCOVERY.TEST_PENDING, {
        label: 'Review complete', detail: `Your teacher has not opened the secure ${noun.toLowerCase()} yet.`, tone: 'pending', waitingOnTeacher: true, actionLabel: 'View',
      });
  }
  return result(TEST_CYCLE_DISCOVERY.REVIEW, {
    label: review.total ? `Review · ${review.attempted} of ${review.total}` : 'Review',
    detail: reviewRequirementText(review, noun.toLowerCase()),
    tone: review.attempted > 0 ? 'inProgress' : 'notStarted',
    started: review.attempted > 0,
    actionRequired: true,
    actionLabel: review.attempted > 0 ? 'Continue Review' : 'Start Review',
  });
};

/*
 * "NEW" WITHOUT A NOTIFICATION SYSTEM.
 *
 * The projection says when the stage last changed. The device remembers when
 * the student last opened this cycle's card. If the first is later, something
 * happened they have not seen — Test unlocked, results released, retest open —
 * and the list says so once. Per device, best effort: losing it only loses a
 * badge, never a state.
 */
const SEEN_PREFIX = 'mm-test-cycle-seen:';

export const markTestCycleSeen = (studentId, assignmentId, at = Date.now()) => {
  try { window.localStorage.setItem(`${SEEN_PREFIX}${studentId}:${assignmentId}`, String(at)); } catch { /* best effort */ }
};

export const testCycleHasUnseenChange = (studentId, assignmentId, stageChangedAt) => {
  if (!stageChangedAt) return false;
  try {
    const seen = Number(window.localStorage.getItem(`${SEEN_PREFIX}${studentId}:${assignmentId}`) || 0);
    return Number(stageChangedAt) > seen;
  } catch { return false; }
};

/*
 * WHEN AN OPEN CARD MUST ASK THE SERVER AGAIN.
 *
 * The card is a callable result; the live grade document is what tells it
 * something changed. Every projection field the card's state depends on is in
 * this key, because the server writes in steps: a release records the score
 * first and attaches the corrections plan second. With only the stage in the
 * key, the second write changed nothing the card watched, and a student sat at
 * "Corrections being prepared" until they reloaded. The same happens for a
 * retest session that is opened after the stage already says Retest.
 */
export const buildTestCycleCardRefreshKey = ({ projection = null, reviewRecords = null } = {}) => {
  const value = projection && typeof projection === 'object' ? projection : {};
  const review = reviewRecords && typeof reviewRecords === 'object' ? reviewRecords : {};
  const reviewState = Object.keys(review).sort()
    .map((index) => `${index}:${review[index]?.status || ''}:${Number(review[index]?.attempts || review[index]?.totalAttempts || 0)}`)
    .join(',');
  return [
    value.stage || '',
    value.stageChangedAt || '',
    value.recordedGrade ?? '',
    value.reviewComplete === true ? 'r' : '',
    value.testState || '',
    value.retestState || '',
    value.correctionsTotal ?? '',
    value.correctionsCompleted ?? '',
    reviewState,
  ].join('|');
};

/*
 * WHY THIS CORRECTION, IN A STUDENT'S WORDS.
 *
 * The plan's `diagnosisDetail` is written for the teacher ("Targeting the
 * missed standard texas:A.3C; no specific error pattern was recorded"). A
 * student needs what happened and what to do, without standard codes. A named
 * error pattern is mentioned only when the evidence recorded one — never
 * invented — exactly as the plan decides.
 */
export const describeCorrectionTargetForStudent = (target = {}) => {
  const missed = Math.max(0, Math.round(Number(target?.missed) || 0));
  const what = missed > 0
    ? `You missed ${missed} Test question${missed === 1 ? '' : 's'} on this skill.`
    : 'This skill needs another look before your Retest.';
  const why = target?.diagnosis === 'misconception'
    ? ' Your answers showed a specific mistake pattern, and these questions practise exactly that.'
    : '';
  return `${what}${why} Practise it here on new questions — never the Test questions themselves.`;
};

/**
 * The skill a correction target names, as a heading. The plan copies the
 * blueprint label, which normalizeTestBlueprint fills with the standard's code
 * when the teacher wrote none — "texas:A.3B" is not a heading for a student.
 */
export const correctionTargetTitle = (target = {}) => (
  studentSkillName({ label: target?.label, alignmentKey: target?.alignmentKey }, 'This skill')
);

/*
 * WHAT THE CARD SAYS AROUND THE ACTION — DESCRIPTIONS, NEVER GATES.
 *
 * Everything below shapes server fields for the student's card. None of it
 * decides what a student may enter: the stage, `canEnter` and every session id
 * still come from `getStudentTestCycle`, and the server re-checks entry.
 */

const S = TEST_CYCLE_STAGE;
const skillLabel = (label, alignmentKey, fallback) => studentSkillName({ label, alignmentKey }, fallback);
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

/** The secure session the list describes has started: the card says "Resume", or the server marks its phase in progress. */
const secureSessionUnderWay = (card = {}) => /^resume\b/i.test(clean(card?.actionLabel))
  || (Array.isArray(card?.phases) && card.phases.some((phase) => ['test', 'retest'].includes(phase?.id) && phase?.status === 'inProgress'));

/**
 * "What's on this test": the blueprint's skills (card.testSkills) before the
 * student sits the secure session they describe.
 *
 * The Test — or an external cycle's one secure Retest — is issued from that
 * blueprint, so its skills and question counts are exactly what the student
 * will meet. An ordinary Retest is NOT: it is rebuilt from what this student
 * missed (testCycleRetest.mjs: shorter than the Test, mostly the missed
 * skills, some anchors from the rest), so before a Retest the card lists the
 * skills without counts and says how the Retest leans — not that every skill
 * will be on it.
 *
 * A STUDY GUIDE, NOT A KEY. Questions are issued target by target, so skills
 * listed in blueprint order with their counts would say which questions test
 * which standard — the cue each secure question is stripped of. The rows are
 * sorted by name, and the list is shown only BEFORE the session starts: once a
 * Test or Retest is under way there is nothing left to prepare for, and the
 * list beside it would only be a map of it. Afterwards it goes for good.
 */
export const testSkillsSection = (card = {}) => {
  const skills = Array.isArray(card?.testSkills) ? card.testSkills : [];
  if (!skills.length || secureSessionUnderWay(card)) return null;
  const external = Boolean(card?.policy?.external);
  const stage = clean(card?.stage);
  const rows = skills.map((skill, index) => ({
    key: clean(skill?.alignmentKey) || clean(skill?.label) || `skill-${index}`,
    label: skillLabel(skill?.label, skill?.alignmentKey, 'Other questions'),
    questionCount: count(skill?.questionCount),
  })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
    || left.key.localeCompare(right.key));
  if ([S.REVIEW, S.TEST].includes(stage)) {
    return { title: `What's on your ${external ? 'Retest' : 'Test'}`, note: null, showCounts: true, rows };
  }
  if (!external && [S.CORRECTIONS, S.RETEST_READY, S.RETEST].includes(stage)) {
    return {
      title: 'What\'s on your Retest',
      note: 'Your Retest is drawn from these Test skills — mostly the ones you missed.',
      showCounts: false,
      rows,
    };
  }
  return null;
};

/**
 * Whether the retest rule ("If you retest, your retest can raise your grade up
 * to 70%…") still means anything to this student. A student who passed, or
 * whose cycle is finished or closed, is not going to retest, and reading about
 * a cap reads as being told they failed. That includes a student whose
 * recorded grade is already passing when a teacher has opened a retest for
 * them anyway: a cap below their grade cannot raise it.
 */
export const retestPolicyRelevant = (card = {}) => {
  const stage = clean(card?.stage);
  if ([S.PASSED, S.COMPLETE, S.RETEST_CLOSED].includes(stage)) return false;
  const recorded = percent(card?.grade?.recordedGrade);
  const passing = percent(card?.policy?.passingScore);
  return !(Number.isFinite(recorded) && Number.isFinite(passing) && recorded >= passing);
};

/*
 * "REVIEW MY TEST" — THE RELEASED TEST, REACHABLE WHILE IT CAN STILL TEACH.
 *
 * Once a Test's results are released its review (answers, worked solutions)
 * belongs to the student, and Corrections is exactly when they need it. It is
 * offered only at stages where NO secure item can be answered: never during a
 * Retest that is assigned or in progress, because the Test's worked solutions
 * would then sit one tap away from a parallel secure question.
 *
 * `testReviewExamSessionId` names the original Test's released session, and a
 * server that sends the field decides alone: it sends null while a Retest is
 * assigned or under way — even at "retestClosed", since closing retesting does
 * not end a Retest already issued — exactly when getStudentSecureExamReview
 * would refuse the review. Only an older server, which never sent the field,
 * falls back to `reviewExamSessionId` (the Test's session at every one of
 * these stages except a completed retest). In Passed and Complete the main
 * action already opens `reviewExamSessionId`, so a button that would open the
 * same session is not drawn — which also keeps an older server's Retest
 * session from being labelled "my Test".
 */
const TEST_REVIEW_STAGES = new Set([S.CORRECTIONS, S.RETEST_READY, S.RETEST_SUBMITTED, S.RETEST_CLOSED, S.PASSED, S.COMPLETE]);

export const testReviewSessionIdFor = (card = {}) => {
  const stage = clean(card?.stage);
  if (!TEST_REVIEW_STAGES.has(stage)) return null;
  const primary = clean(card?.reviewExamSessionId);
  const sentByServer = Boolean(card) && Object.prototype.hasOwnProperty.call(card, 'testReviewExamSessionId');
  const id = sentByServer ? clean(card.testReviewExamSessionId) : primary;
  if (!id) return null;
  if ([S.PASSED, S.COMPLETE].includes(stage) && id === primary) return null;
  return id;
};

/** An external cycle's one secure session is the student's Retest, and the button says so. */
export const testReviewLabel = (card = {}) => (card?.policy?.external ? 'Review my Retest' : 'Review my Test');

/**
 * The Review, skill by skill (card.reviewBySkill), for the Review stage.
 *
 * What unlocks the Test is still the teacher's Review rule (answer every
 * question, or reach the mastery bar). This is what the student can USE: how
 * they are doing on each skill so far, weakest first, so the practise link next
 * to a weak skill is the obvious next tap. Skills they have not started go
 * last, and get no practise link (`canPractise`): there is nothing to call
 * weak yet, and the Review questions themselves — what unlocks the Test — are
 * the next thing to do there.
 */
export const reviewSkillRows = (reviewBySkill) => (Array.isArray(reviewBySkill) ? reviewBySkill : [])
  .map((skill, index) => {
    const total = count(skill?.total);
    const attempted = Math.min(total, count(skill?.attempted));
    const correct = Math.min(attempted, count(skill?.correct));
    const left = total - attempted;
    const alignmentKey = clean(skill?.alignmentKey) || null;
    return {
      key: alignmentKey || `other-${index}`,
      alignmentKey,
      label: skillLabel(skill?.label, skill?.alignmentKey, 'Other Review questions'),
      attempted,
      correct,
      total,
      order: index,
      canPractise: Boolean(alignmentKey) && attempted > 0,
      summary: attempted === 0
        ? `Not started · ${total} ${total === 1 ? 'question' : 'questions'}`
        : left > 0
          ? `${correct} of ${attempted} correct so far · ${left} still to answer`
          : `${correct} of ${total} correct`,
    };
  })
  .filter((row) => row.total > 0)
  .sort((left, right) => {
    if ((left.attempted > 0) !== (right.attempted > 0)) return left.attempted > 0 ? -1 : 1;
    if (!left.attempted) return left.order - right.order;
    return (left.correct / left.attempted) - (right.correct / right.attempted)
      || (right.attempted - right.correct) - (left.attempted - left.correct)
      || left.order - right.order;
  });
