'use strict';

const EXAM_POLICIES = Object.freeze({
  digitalSAT: Object.freeze({ examType: 'digitalSAT', title: 'Digital SAT Math', totalQuestions: 44, timeLimitSeconds: 70 * 60, calculatorMode: 'graphing', domainWeights: Object.freeze({ algebra: 0.35, advancedMath: 0.35, problemSolvingData: 0.15, geometryTrigonometry: 0.15 }) }),
  act: Object.freeze({ examType: 'act', title: 'ACT Mathematics', totalQuestions: 45, timeLimitSeconds: 50 * 60, calculatorMode: 'graphing', domainWeights: Object.freeze({ preparingHigherMath: 0.8, essentialSkills: 0.2 }) }),
  tsia2: Object.freeze({ examType: 'tsia2', title: 'TSIA2 Mathematics', totalQuestions: 20, timeLimitSeconds: null, calculatorMode: 'itemLevel', domainWeights: Object.freeze({ quantitativeReasoning: 0.25, algebraicReasoning: 0.25, geometricSpatial: 0.25, probabilisticStatistical: 0.25 }) }),
  asvab: Object.freeze({ examType: 'asvab', title: 'CAT-ASVAB Math Simulation', totalQuestions: 30, timeLimitSeconds: 86 * 60, calculatorMode: 'none', domainWeights: Object.freeze({ arithmeticReasoning: 0.5, mathematicsKnowledge: 0.5 }) }),
});

const { readStoredItem } = require('./secureItemStorage');
const navigation = require('./secureExamNavigation');

/*
 * The third integrity event pauses the session for proctor review. The
 * student's screen is told the limit (and warned before the last one), so a
 * lock is never a surprise.
 */
const INTEGRITY_LOCK_THRESHOLD = 3;

const TERMINAL_STATES = new Set(['submitted', 'time_expired', 'force_submitted']);
const LOCKED_STATES = new Set(['locked_integrity', 'locked_proctor']);

/*
 * COURSE TESTS SHARE THIS RUNTIME. THEY DO NOT FORK IT.
 *
 * A teacher-authored Test Cycle runs on the same sessions, the same integrity
 * logger, the same server-held grading, the same autosave, the same timers,
 * the same proctor actions and the same teacher-release feedback as the SAT,
 * ACT, TSIA2 and ASVAB simulations. The only difference is where the item
 * stream comes from: a simulation draws from its framework's exam-style bank,
 * and a course test issues an approved blueprint plan stored on the session.
 *
 * So `courseTest` is deliberately NOT in EXAM_POLICIES. Those four entries are
 * fixed published exam specifications — question count, timing and domain
 * weights set by the testing organisation — and nothing about a course test is
 * fixed that way. `policyFor` keeps returning null for it, which is what keeps
 * `createSecureExamSession` (the simulation-creating callable) from accepting a
 * course test through a path that would give it SAT timings.
 */
const COURSE_TEST_EXAM_TYPE = 'courseTest';

function isCourseTestSession(session) {
  return String(session?.examType || '') === COURSE_TEST_EXAM_TYPE;
}

function supportsExamType(examType) {
  return String(examType || '') === COURSE_TEST_EXAM_TYPE || Boolean(EXAM_POLICIES[String(examType || '')]);
}

function policyFor(examType) {
  return EXAM_POLICIES[String(examType || '')] || null;
}


function nextDomainId(session = {}) {
  const policy = policyFor(session.examType);
  const weights = policy?.domainWeights || {};
  const domains = Object.keys(weights);
  if (!domains.length) return null;

  const counts = Object.fromEntries(domains.map((id) => [id, 0]));
  // Every ISSUED item counts toward the balance — answered, skipped or open —
  // so skipping a question cannot tilt which domain is drawn next.
  navigation.issuedDomainIds(session).forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(counts, id)) counts[id] += 1;
  });
  const answered = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const nextNumber = answered + 1;
  return domains.slice().sort((left, right) => {
    const leftNeed = Number(weights[left] || 0) * nextNumber - counts[left];
    const rightNeed = Number(weights[right] || 0) * nextNumber - counts[right];
    return rightNeed - leftNeed || left.localeCompare(right);
  })[0] || null;
}

/*
 * AN UNTIMED EXAM HAS NO DEADLINE. NOT A DEADLINE OF ZERO.
 *
 * `timeLimitSeconds` is stored as `null` for every untimed session: a course
 * Test whose blueprint names no time limit, and TSIA2. `Number(null)` is 0 and
 * `Number.isFinite(0)` is true, so this used to read "no limit" as "a limit of
 * zero seconds" — every untimed session expired at the instant it started and
 * the first question was refused with deadline-exceeded. The same trap applied
 * to a session with no `startedAt`, whose deadline came out as the Unix epoch.
 *
 * Only a positive, finite number of seconds is a time limit. Anything else —
 * null, missing, 0, a string — means the exam is untimed, and nothing may turn
 * an expected-duration note into an enforced timer by accident.
 */
function timeLimitSecondsOf(session) {
  const raw = session?.timeLimitSeconds;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function deadlineFor(session, _now = Date.now()) {
  const limit = timeLimitSecondsOf(session);
  const startedAt = Number(session?.startedAt);
  if (limit === null || session?.startedAt === null || session?.startedAt === undefined) return null;
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  const added = Math.max(0, Number(session.addedTimeSeconds) || 0);
  return startedAt + (limit + added) * 1000;
}

function isExpired(session, now = Date.now()) {
  const deadline = deadlineFor(session, now);
  return deadline != null && now >= deadline;
}

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/**
 * The score a secure session actually earned, as a percent of the plan.
 *
 * Deliberately divided by the PLANNED question count, not by the number the
 * student answered. A student who walks out after two of twenty questions has
 * not earned 100%; the unanswered eighteen are worth zero, which is ordinary
 * MathMaster assessment semantics and matches how the Test Cycle blueprint
 * weights a test.
 */
// `preservePrecision` keeps the unrounded percentage: an external-assessment
// retest compares it with a district cut score, where 69.99 is not 70.
function secureSessionScorePercent(session = {}, { preservePrecision = false } = {}) {
  const responses = Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {});
  const planned = Math.max(
    Number(session.requiredQuestions || 0),
    list(session.issuancePlan?.entries).length,
    responses.length,
  );
  if (!planned) return null;
  const earned = responses.reduce((sum, response) => sum + (Number(response?.grading?.score) || 0), 0);
  const score = (earned / planned) * 100;
  return preservePrecision ? score : Math.round(score);
}

/** Weighted alternative used when a blueprint gives targets different weights. */
function weightedSessionScorePercent(session = {}, { preservePrecision = false } = {}) {
  const plan = session.issuancePlan || {};
  const entries = list(plan.entries);
  if (!entries.length) return secureSessionScorePercent(session, { preservePrecision });
  const byInstance = new Map();
  Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {})
    .forEach((response) => byInstance.set(clean(response?.questionInstanceId), response));
  let earned = 0;
  let possible = 0;
  entries.forEach((entry) => {
    const weight = Number(entry.weight) > 0 ? Number(entry.weight) : 1;
    possible += weight;
    const response = byInstance.get(clean(entry.questionInstanceId));
    earned += weight * (Number(response?.grading?.score) || 0);
  });
  const score = possible > 0 ? (earned / possible) * 100 : null;
  return score === null || preservePrecision ? score : Math.round(score);
}


/*
 * ONE SCORE PER SESSION.
 *
 * A simulation's review has always reported the mean over the items the
 * student answered, which is that product's published semantics. A course
 * Test's score is the Test Cycle grade: weighted by blueprint slot and divided
 * by the PLANNED items, so an early submit cannot turn 2 correct answers into
 * "100%" on the review screen while the recorded grade says 8%.
 */
/*
 * A practice test is scored over every PLANNED question too. It used to be
 * the mean of the answered ones, so a student who answered 5 of 44 and got
 * them right read "100%" — a score no real test would ever report. Unanswered
 * questions are worth zero on a practice test exactly as on a course Test.
 */
function sessionScorePercent(session = {}) {
  if (isCourseTestSession(session)) return weightedSessionScorePercent(session);
  return secureSessionScorePercent(session) ?? 0;
}

function publicSession(session = {}, { teacher = false } = {}) {
  // `issuancePlan` names the approved family and the generator seed behind
  // every question the student has not reached yet. Handing it to a browser
  // would let a student reproduce their own exam before sitting it, so it is
  // stripped from BOTH the student and the teacher payload — a proctor reads
  // the plan through the separate teacher-only Test Cycle callable, which is
  // authenticated for that purpose.
  const { currentQuestion, responses, usedQuestionIds: _usedQuestionIds, issuancePlan: _issuancePlan, summary, createdBy: _createdBy, lastProctorActionBy: _lastProctorActionBy, feedbackReleasedBy: _feedbackReleasedBy, navigation: _navigation, ...safe } = session;
  const responseValues = responses && typeof responses === 'object' ? Object.values(responses) : [];
  return {
    ...safe,
    summary: {
      completedQuestions: Number(summary?.completedQuestions || 0),
      ...(teacher ? { correctQuestions: Number(summary?.correctQuestions || 0) } : {}),
    },
    expiresAt: deadlineFor(session),
    // Said outright so no screen has to infer "untimed" from a null, which is
    // exactly the inference that went wrong in `deadlineFor`.
    timed: timeLimitSecondsOf(session) !== null,
    timeLimitSeconds: timeLimitSecondsOf(session),
    hasOpenQuestion: Boolean(currentQuestion) || navigation.openItemIds(navigation.navigationOf(session)).length > 0,
    // Answers the student has (drafts with work, or recorded answers) — never
    // whether any of them is right.
    answeredQuestions: navigation.answeredCount(session),
    // Where the student is and which questions are answered or flagged. States
    // only: nothing about any item's content or correctness.
    navigation: navigation.publicNavigation(session),
    integrityLockThreshold: INTEGRITY_LOCK_THRESHOLD,
    ...(teacher ? {
      scorePercent: safe.feedbackReleased && (responseValues.length || isCourseTestSession(session) || Number(session.requiredQuestions) > 0)
        ? sessionScorePercent(session)
        : null,
    } : {}),
  };
}


function publicQuestion(question = {}, { examCalculatorMode = null } = {}) {
  // Secure simulations deliberately send less metadata than instructional Path.
  // TEKS, family slugs, DOK and assessment domains can all cue a student about
  // the kind of mathematics being tested. Keep those server-side until review.
  const {
    alignmentKey: _alignmentKey, familyId: _familyId, familyVersion: _familyVersion,
    activityRole: _activityRole, difficultyBand: _difficultyBand, dok: _dok,
    assessedConstruct: _assessedConstruct, assessmentContext: _assessmentContext,
    assessmentBridgeFramework: _assessmentBridgeFramework, adaptiveRigor: _adaptiveRigor,
    ...safe
  } = question || {};
  return { ...safe, examCalculatorMode: examCalculatorMode || null };
}

function stripReviewSecrets(value) {
  const forbidden = new Set([
    'expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading',
    'privateSupport', 'generatorParameters', 'gradingDefinition', 'solutionKey',
  ]);
  if (Array.isArray(value)) return value.map(stripReviewSecrets);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.entries(value).forEach(([key, child]) => {
    if (!forbidden.has(key)) result[key] = stripReviewSecrets(child);
  });
  return result;
}

/*
 * THE ANSWER AND THE WORKED SOLUTION, ONLY AFTER RELEASE.
 *
 * Finalize stores, server-side, what each item's correct answer looks like and
 * the item's own worked solution (`releasedSolution`). It travels to a
 * student's browser ONLY through this function, and this function returns
 * null until the session is finished AND its results are released — so the
 * answer can never reach a student while any item could still be answered.
 * The keys are deliberately not ones `stripReviewSecrets` removes; they are
 * built for display (a choice's label, never a choice id that could be
 * replayed) and bounded.
 */
function releasedSolutionOf(response = {}) {
  const solution = response?.releasedSolution;
  if (!solution || typeof solution !== 'object') return null;
  const answers = list(solution.answers).slice(0, 12).map((entry) => ({
    fieldId: clean(entry?.fieldId).slice(0, 120) || null,
    label: clean(entry?.label).slice(0, 200) || null,
    display: clean(entry?.display).slice(0, 400),
  })).filter((entry) => entry.display);
  const review = solution.review && typeof solution.review === 'object' ? {
    headline: clean(solution.review.headline).slice(0, 160) || null,
    reasoning: list(solution.review.reasoning).map((line) => clean(line).slice(0, 400)).filter(Boolean).slice(0, 8),
    commonError: clean(solution.review.commonError).slice(0, 400) || null,
    connection: clean(solution.review.connection).slice(0, 400) || null,
    answerSummary: clean(solution.review.answerSummary).slice(0, 240) || null,
  } : null;
  if (!answers.length && !review) return null;
  return { answers, review };
}

function reviewOrder(session = {}) {
  const order = navigation.navigationOf(session).itemOrder;
  const index = new Map(order.map((id, position) => [id, position]));
  return (left, right) => {
    const a = index.has(clean(left?.questionInstanceId)) ? index.get(clean(left.questionInstanceId)) : Number.MAX_SAFE_INTEGER;
    const b = index.has(clean(right?.questionInstanceId)) ? index.get(clean(right.questionInstanceId)) : Number.MAX_SAFE_INTEGER;
    return a - b || Number(left?.submittedAt || 0) - Number(right?.submittedAt || 0);
  };
}

/** Points earned and possible, as the score is computed — so the screen can say both. */
function scorePoints(session = {}) {
  const responses = Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {});
  if (isCourseTestSession(session) && list(session.issuancePlan?.entries).length) {
    const byInstance = new Map(responses.map((response) => [clean(response?.questionInstanceId), response]));
    let earned = 0;
    let possible = 0;
    list(session.issuancePlan.entries).forEach((entry) => {
      const weight = Number(entry.weight) > 0 ? Number(entry.weight) : 1;
      possible += weight;
      earned += weight * (Number(byInstance.get(clean(entry.questionInstanceId))?.grading?.score) || 0);
    });
    return { earnedPoints: Math.round(earned * 100) / 100, possiblePoints: Math.round(possible * 100) / 100, weighted: list(session.issuancePlan.entries).some((entry) => Number(entry.weight) > 0 && Number(entry.weight) !== 1) };
  }
  const planned = Math.max(Number(session.requiredQuestions || 0), responses.length);
  const earned = responses.reduce((sum, response) => sum + (Number(response?.grading?.score) || 0), 0);
  return { earnedPoints: Math.round(earned * 100) / 100, possiblePoints: planned, weighted: false };
}

// `withSolutions: false` holds the correct answers and worked solutions back
// (a course Test whose class is still testing — see courseAnswersReleased in
// index.js); the score and the student's own answers, right or wrong, remain.
function publicReview(session = {}, { withSolutions = true } = {}) {
  if (!TERMINAL_STATES.has(session.status) || session.feedbackReleased !== true) return null;
  const order = navigation.navigationOf(session).itemOrder;
  const items = Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {})
    .sort(reviewOrder(session))
    .map((response) => ({ ...response, questionSnapshot: readStoredItem(response?.questionSnapshot || null) }))
    .map((response, index) => ({
      questionInstanceId: response?.questionInstanceId || null,
      // The question number the student saw while testing.
      position: order.includes(clean(response?.questionInstanceId)) ? order.indexOf(clean(response.questionInstanceId)) : index,
      bankQuestionId: response?.bankQuestionId || null,
      alignmentKeys: Array.isArray(response?.alignmentKeys) ? response.alignmentKeys.slice(0, 12) : [],
      questionType: response?.questionType || null,
      // The Rich Tool the work was built in, so review can describe it.
      pathToolId: response?.pathToolId || response?.questionSnapshot?.pathToolId || null,
      familyId: response?.familyId || null,
      assessmentDomainId: response?.assessmentDomainId || null,
      targetId: response?.targetId || null,
      planWeight: Number(response?.planWeight) > 0 ? Number(response.planWeight) : null,
      unanswered: response?.unanswered === true,
      grading: {
        score: Number(response?.grading?.score || 0),
        isCorrect: Boolean(response?.grading?.isCorrect),
      },
      responsePayload: stripReviewSecrets(response?.responsePayload || { responses: {} }),
      questionSnapshot: stripReviewSecrets(response?.questionSnapshot || null),
      solution: withSolutions ? releasedSolutionOf(response) : null,
      submittedAt: Number(response?.submittedAt || 0) || null,
    }));
  const correctQuestions = items.filter((item) => item.grading.isCorrect).length;
  const answeredQuestions = items.filter((item) => !item.unanswered).length;
  return {
    session: publicSession(session),
    answeredQuestions,
    plannedQuestions: Math.max(Number(session.requiredQuestions || 0), items.length),
    correctQuestions,
    scorePercent: sessionScorePercent(session) ?? 0,
    ...scorePoints(session),
    // Both kinds of test now count unanswered questions as zero. A course Test
    // can also weight questions differently, which the screen explains.
    scoreBasis: isCourseTestSession(session) ? 'plannedWeighted' : 'planned',
    ...(withSolutions ? {} : { solutionsHeld: true }),
    items,
  };
}

/*
 * NOT AN OPEN BOOK FOR ANOTHER ATTEMPT.
 *
 * A released course Test's or Retest's review carries every answer and worked
 * solution. While the same student has another attempt of the cycle open — the
 * Retest, or the new Test or Retest a teacher's reset assigned — that review
 * stays closed. It opens again once that attempt is submitted, when its
 * answers can no longer change. `record` is the student's Test Cycle record;
 * returns the refusal, or null.
 */
const OPEN_ATTEMPT_STATES = new Set(["assigned", "inProgress"]);
function courseReviewBlockedBy(record, { examSessionId, cycleStage } = {}) {
  const open = [["test", record?.test], ["retest", record?.retest]].find(([, slot]) => (
    slot && slot.examSessionId && String(slot.examSessionId) !== String(examSessionId) && OPEN_ATTEMPT_STATES.has(slot.state)
  ));
  if (!open) return null;
  if (open[0] === "retest" && String(cycleStage || "") !== "retest") {
    return { reason: "retest_open", message: "Your Test review opens again when you finish your Retest." };
  }
  return { reason: "attempt_open", message: "This review opens again when you finish the test you are taking now." };
}

module.exports = { COURSE_TEST_EXAM_TYPE, courseReviewBlockedBy, EXAM_POLICIES, INTEGRITY_LOCK_THRESHOLD, releasedSolutionOf, scorePoints, LOCKED_STATES, TERMINAL_STATES, deadlineFor, isCourseTestSession, isExpired, nextDomainId, policyFor, publicQuestion, publicReview, publicSession, secureSessionScorePercent, sessionScorePercent, supportsExamType, timeLimitSecondsOf, weightedSessionScorePercent };
