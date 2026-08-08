'use strict';

const EXAM_POLICIES = Object.freeze({
  digitalSAT: Object.freeze({ examType: 'digitalSAT', title: 'Digital SAT Math', totalQuestions: 44, timeLimitSeconds: 70 * 60, calculatorMode: 'graphing' }),
  act: Object.freeze({ examType: 'act', title: 'ACT Mathematics', totalQuestions: 45, timeLimitSeconds: 50 * 60, calculatorMode: 'graphing' }),
  tsia2: Object.freeze({ examType: 'tsia2', title: 'TSIA2 Mathematics', totalQuestions: 20, timeLimitSeconds: null, calculatorMode: 'itemLevel' }),
  asvab: Object.freeze({ examType: 'asvab', title: 'CAT-ASVAB Math Simulation', totalQuestions: 30, timeLimitSeconds: 86 * 60, calculatorMode: 'none' }),
});

const TERMINAL_STATES = new Set(['submitted', 'time_expired', 'force_submitted']);
const LOCKED_STATES = new Set(['locked_integrity', 'locked_proctor']);

function policyFor(examType) {
  return EXAM_POLICIES[String(examType || '')] || null;
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
  const { currentQuestion, responses, usedQuestionIds: _usedQuestionIds, summary, createdBy: _createdBy, lastProctorActionBy: _lastProctorActionBy, feedbackReleasedBy: _feedbackReleasedBy, ...safe } = session;
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

module.exports = { EXAM_POLICIES, LOCKED_STATES, TERMINAL_STATES, deadlineFor, isExpired, policyFor, publicSession };
