'use strict';

const EXAM_POLICIES = Object.freeze({
  digitalSAT: Object.freeze({ examType: 'digitalSAT', title: 'Digital SAT Math', totalQuestions: 44, timeLimitSeconds: 70 * 60, calculatorMode: 'graphing', domainWeights: Object.freeze({ algebra: 0.35, advancedMath: 0.35, problemSolvingData: 0.15, geometryTrigonometry: 0.15 }) }),
  act: Object.freeze({ examType: 'act', title: 'ACT Mathematics', totalQuestions: 45, timeLimitSeconds: 50 * 60, calculatorMode: 'graphing', domainWeights: Object.freeze({ preparingHigherMath: 0.8, essentialSkills: 0.2 }) }),
  tsia2: Object.freeze({ examType: 'tsia2', title: 'TSIA2 Mathematics', totalQuestions: 20, timeLimitSeconds: null, calculatorMode: 'itemLevel', domainWeights: Object.freeze({ quantitativeReasoning: 0.25, algebraicReasoning: 0.25, geometricSpatial: 0.25, probabilisticStatistical: 0.25 }) }),
  asvab: Object.freeze({ examType: 'asvab', title: 'CAT-ASVAB Math Simulation', totalQuestions: 30, timeLimitSeconds: 86 * 60, calculatorMode: 'none', domainWeights: Object.freeze({ arithmeticReasoning: 0.5, mathematicsKnowledge: 0.5 }) }),
});

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
  Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {}).forEach((response) => {
    const id = String(response?.assessmentDomainId || '');
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
function sessionScorePercent(session = {}) {
  if (isCourseTestSession(session)) return weightedSessionScorePercent(session);
  const responseValues = Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {});
  if (!responseValues.length) return 0;
  return Math.round(responseValues.reduce((sum, item) => sum + Number(item?.grading?.score || 0), 0) / responseValues.length * 100);
}

function publicSession(session = {}, { teacher = false } = {}) {
  // `issuancePlan` names the approved family and the generator seed behind
  // every question the student has not reached yet. Handing it to a browser
  // would let a student reproduce their own exam before sitting it, so it is
  // stripped from BOTH the student and the teacher payload — a proctor reads
  // the plan through the separate teacher-only Test Cycle callable, which is
  // authenticated for that purpose.
  const { currentQuestion, responses, usedQuestionIds: _usedQuestionIds, issuancePlan: _issuancePlan, summary, createdBy: _createdBy, lastProctorActionBy: _lastProctorActionBy, feedbackReleasedBy: _feedbackReleasedBy, ...safe } = session;
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
    hasOpenQuestion: Boolean(currentQuestion),
    answeredQuestions: responseValues.length,
    ...(teacher ? {
      scorePercent: safe.feedbackReleased && (responseValues.length || isCourseTestSession(session))
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

function publicReview(session = {}) {
  if (!TERMINAL_STATES.has(session.status) || session.feedbackReleased !== true) return null;
  const items = Object.values(session.responses && typeof session.responses === 'object' ? session.responses : {})
    .sort((a, b) => Number(a?.submittedAt || 0) - Number(b?.submittedAt || 0))
    .map((response) => ({
      questionInstanceId: response?.questionInstanceId || null,
      bankQuestionId: response?.bankQuestionId || null,
      alignmentKeys: Array.isArray(response?.alignmentKeys) ? response.alignmentKeys.slice(0, 12) : [],
      questionType: response?.questionType || null,
      familyId: response?.familyId || null,
      assessmentDomainId: response?.assessmentDomainId || null,
      grading: {
        score: Number(response?.grading?.score || 0),
        isCorrect: Boolean(response?.grading?.isCorrect),
      },
      responsePayload: stripReviewSecrets(response?.responsePayload || { responses: {} }),
      questionSnapshot: stripReviewSecrets(response?.questionSnapshot || null),
      submittedAt: Number(response?.submittedAt || 0) || null,
    }));
  const correctQuestions = items.filter((item) => item.grading.isCorrect).length;
  return {
    session: publicSession(session),
    answeredQuestions: items.length,
    plannedQuestions: Math.max(Number(session.requiredQuestions || 0), items.length),
    correctQuestions,
    scorePercent: sessionScorePercent(session) ?? 0,
    // A course Test counts unanswered items as zero; a simulation reports the
    // mean of what was answered. The screen says which, so neither surprises.
    scoreBasis: isCourseTestSession(session) ? 'plannedWeighted' : 'answered',
    items,
  };
}

module.exports = { COURSE_TEST_EXAM_TYPE, EXAM_POLICIES, LOCKED_STATES, TERMINAL_STATES, deadlineFor, isCourseTestSession, isExpired, nextDomainId, policyFor, publicQuestion, publicReview, publicSession, secureSessionScorePercent, sessionScorePercent, supportsExamType, timeLimitSecondsOf, weightedSessionScorePercent };
