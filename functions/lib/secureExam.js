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

function deadlineFor(session, _now = Date.now()) {
  if (!Number.isFinite(Number(session?.startedAt)) || !Number.isFinite(Number(session?.timeLimitSeconds))) return null;
  return Number(session.startedAt) + (Number(session.timeLimitSeconds) + Number(session.addedTimeSeconds || 0)) * 1000;
}

function isExpired(session, now = Date.now()) {
  const deadline = deadlineFor(session, now);
  return deadline != null && now >= deadline;
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
    hasOpenQuestion: Boolean(currentQuestion),
    answeredQuestions: responseValues.length,
    ...(teacher ? {
      scorePercent: safe.feedbackReleased && responseValues.length
        ? Math.round(responseValues.reduce((sum, item) => sum + Number(item?.grading?.score || 0), 0) / responseValues.length * 100)
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
    correctQuestions,
    scorePercent: items.length
      ? Math.round(items.reduce((sum, item) => sum + Number(item.grading.score || 0), 0) / items.length * 100)
      : 0,
    items,
  };
}

module.exports = { COURSE_TEST_EXAM_TYPE, EXAM_POLICIES, LOCKED_STATES, TERMINAL_STATES, deadlineFor, isCourseTestSession, isExpired, nextDomainId, policyFor, publicQuestion, publicReview, publicSession, supportsExamType };
