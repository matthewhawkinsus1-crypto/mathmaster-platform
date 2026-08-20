// Adaptive routing for a LIVE student session.
//
// WHAT WAS MISSING. `pathSessionRouting` — diagnose, descend, bridge back,
// extend, verify retention — existed only in the browser bundle. The Teacher
// Path Simulator ran it and demonstrated the whole adaptive experience; the
// Cloud Function did not, so `issueNextQuestion` issued from the session's
// original target every single time. A real student who missed the same skill
// five times got five more questions on it. Everything the simulator showed a
// teacher about repair and bridge-back was true of the simulator and of nothing
// else.
//
// This module is the seam. The DECISIONS still come from the one shared engine
// in `functions/shared/pathSessionRouting.mjs`; what lives here is the part that
// is specific to being the server: reading mastery out of Firestore documents,
// keeping the route on the session document, and refusing to send a student
// somewhere the bank cannot supply a question.
//
// THREE RULES, each because its opposite is a real failure:
//
//   1. NEVER STRAND. If routing picks a skill and the bank turns out to have
//      nothing issuable for it, the session returns to its target and says so,
//      rather than throwing an error at a student who has just answered badly.
//
//   2. IN-SESSION EVIDENCE COUNTS. The stored mastery profile is written by an
//      asynchronous trigger, so it does not reflect the last five minutes. A
//      student who has just repaired a prerequisite has to be able to bridge
//      back inside the same session, so the session's own evidence is overlaid
//      on the stored profile.
//
//   3. THE STUDENT IS TOLD. Every decision carries the sentence the student
//      reads, built by the same function the teacher's route trace uses.

let routingModule = null;
async function routing() {
  if (!routingModule) routingModule = await import('../shared/pathSessionRouting.mjs');
  return routingModule;
}

let skillGraphModule = null;
async function skillGraph() {
  if (!skillGraphModule) skillGraphModule = await import('../shared/pathSkillGraph.mjs');
  return skillGraphModule;
}

let coverageModule = null;
async function coverage() {
  if (!coverageModule) coverageModule = await import('../shared/pathCoverage.mjs');
  return coverageModule;
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const displayCode = (value) => String(value || '').replace(/^texas:/i, '').trim().toUpperCase();

/** An empty per-skill evidence record, in the shape the routing engine reads. */
const emptyEvidence = () => ({ finalized: 0, correct: 0, missed: 0, consecutiveMisses: 0 });

/**
 * Mastery per skill, from the stored profile plus what has happened in this
 * session.
 *
 * The stored profile is authoritative for everything the student did before
 * today. It is written by a Firestore trigger AFTER the evidence document is
 * created, so it lags the current session by at least one round trip — which is
 * exactly the window in which a repair excursion needs to notice that the
 * repair has held. So in-session evidence is blended in: once a skill has two
 * finalized questions this session, the session's own success rate is used when
 * it is the more recent and more relevant number.
 */
async function buildMasteryBySkill({ profiles = {}, evidenceBySkill = {} }) {
  const graph = await skillGraph();
  const mastery = {};

  Object.entries(profiles).forEach(([code, profile]) => {
    const estimate = Number(profile?.mastery?.estimate);
    if (!Number.isFinite(estimate)) return;
    mastery[graph.teksSkillId(code)] = {
      mastery: clamp01(estimate / 100),
      attempts: Math.max(0, Number(profile?.dimensions?.eligibleGradeLevelEvents) || 0),
    };
  });

  Object.entries(evidenceBySkill).forEach(([skillId, evidence]) => {
    const finalized = Number(evidence?.finalized) || 0;
    if (finalized < 2) return;
    const sessionMastery = clamp01((Number(evidence?.correct) || 0) / finalized);
    const stored = mastery[skillId];
    mastery[skillId] = {
      // The session's evidence is the fresher signal, and on a repair excursion
      // it is the ONLY signal that can say the repair worked. Blending rather
      // than replacing keeps a single lucky session from erasing a long record.
      mastery: stored ? clamp01((stored.mastery * stored.attempts + sessionMastery * finalized) / (stored.attempts + finalized)) : sessionMastery,
      attempts: (stored?.attempts || 0) + finalized,
    };
  });

  return mastery;
}

/** The course a session belongs to, from the standard it targets. */
function courseIdFor(code) {
  const clean = displayCode(code);
  if (clean.startsWith('A2.')) return 'algebra2';
  if (clean.startsWith('A.')) return 'algebra1';
  if (clean.startsWith('8.')) return 'grade8';
  if (clean.startsWith('7.')) return 'grade7';
  return 'grade6';
}

/**
 * A predicate the routing engine can ask "does this skill have content?".
 *
 * Fails CLOSED when the index is missing: an unknown skill is one nobody has
 * confirmed content for, and guessing yes is how a student ends up on a
 * standard with nothing to practise.
 */
async function buildCoverageGate(indexesByCourse = {}) {
  const [{ isSkillLaunchable }, graph] = await Promise.all([coverage(), skillGraph()]);
  return (skillId) => {
    const code = graph.teksCodeFromSkillId(skillId) || skillId;
    return Object.values(indexesByCourse).some((index) => isSkillLaunchable(index, code));
  };
}

/**
 * Decide what happens after a finalized question, and produce the next session
 * state.
 *
 * Pure with respect to Firestore: it takes the session and the facts, and
 * returns the fields to write. The caller does the writing inside its
 * transaction.
 */
async function routeAfterFinalizedQuestion({
  session,
  skillCode,
  isCorrect,
  profiles = {},
  coverageIndexes = {},
  retentionConcern = false,
}) {
  const [route, graph] = await Promise.all([routing(), skillGraph()]);
  const skillId = graph.teksSkillId(skillCode);
  const targetCode = displayCode(session?.target?.alignmentKey);

  // Record what just happened, per skill.
  const evidenceBySkill = { ...(session.evidenceBySkill || {}) };
  const evidence = { ...emptyEvidence(), ...(evidenceBySkill[skillId] || {}) };
  evidence.finalized += 1;
  if (isCorrect) {
    evidence.correct = (evidence.correct || 0) + 1;
    evidence.consecutiveMisses = 0;
  } else {
    evidence.missed += 1;
    evidence.consecutiveMisses += 1;
  }
  evidenceBySkill[skillId] = evidence;

  const masteryBySkill = await buildMasteryBySkill({ profiles, evidenceBySkill });
  const isCovered = await buildCoverageGate(coverageIndexes);

  const summary = session.summary || {};
  const completedQuestions = Number(summary.completedQuestions || 0);

  const decision = session.diagnosing
    ? route.resolveDiagnostic({
      diagnosing: session.diagnosing,
      isCorrect,
      excursion: session.excursion || null,
    })
    : route.decideNextStep({
      courseId: courseIdFor(targetCode),
      currentSkillId: skillId,
      masteryBySkill,
      outcome: { isCorrect },
      sessionEvidence: evidence,
      excursion: session.excursion || null,
      requiredQuestions: Number(session.requiredQuestions || 5),
      completedQuestions,
      retentionConcern,
      isCovered,
    });

  const { PATH_ACTION } = route;
  let status = session.status;
  let teacherMessage = session.teacherMessage || null;
  let nextSkillCode = skillCode;

  if (decision.action === PATH_ACTION.TEACHER_SUPPORT) {
    status = 'teacherSupportNeeded';
    teacherMessage = decision.explanation;
  } else if (decision.action === PATH_ACTION.COMPLETE) {
    status = 'completed';
  } else {
    // BRIDGE and RETURN_TO_ORIGIN both end the excursion: the next question is
    // asked on the skill the student is going back to.
    const nextSkillId = decision.action === PATH_ACTION.BRIDGE ? decision.returnTo : decision.skillId;
    nextSkillCode = displayCode(graph.teksCodeFromSkillId(nextSkillId) || skillCode);
  }

  // NEVER STRAND. A route into a standard the bank cannot serve returns to the
  // target instead of throwing at the student.
  const endsExcursion = decision.action === PATH_ACTION.BRIDGE || decision.action === PATH_ACTION.RETURN_TO_ORIGIN;
  let excursion = endsExcursion ? null : (decision.excursion ?? null);
  let diagnosing = decision.action === PATH_ACTION.DIAGNOSE ? decision.diagnosing : null;
  let strandedFrom = null;
  if (status === 'active' && nextSkillCode !== targetCode && !isCovered(graph.teksSkillId(nextSkillCode))) {
    strandedFrom = nextSkillCode;
    nextSkillCode = targetCode;
    excursion = null;
    diagnosing = null;
  }

  const studentNotice = route.explainStepForStudent(decision);

  return {
    decision,
    status,
    teacherMessage,
    evidenceBySkill,
    currentSkillCode: nextSkillCode,
    excursion,
    diagnosing,
    // Everything a student banner or a teacher route trace needs, and nothing
    // that would let the browser reconstruct an answer.
    lastDecision: {
      action: decision.action,
      reason: decision.reason,
      explanation: decision.explanation,
      skillId: decision.skillId || null,
      returnTo: decision.returnTo || null,
      excursion: decision.excursion ? { originSkillId: decision.excursion.originSkillId, targetSkillId: decision.excursion.targetSkillId, depth: decision.excursion.depth } : null,
      studentHeadline: studentNotice?.headline || null,
      studentMessage: studentNotice?.message || null,
      studentTone: studentNotice?.tone || null,
      contentUnavailableFor: strandedFrom,
    },
    routeEntry: {
      at: `question ${completedQuestions + 1}`,
      action: decision.action,
      skillCode: nextSkillCode,
      reason: strandedFrom ? 'content_unavailable_returned_to_target' : decision.reason,
      explanation: strandedFrom
        ? `${decision.explanation} There is no published practice content for ${strandedFrom}, so the session returned to ${targetCode}.`
        : decision.explanation,
      wasCorrect: isCorrect === true,
    },
  };
}

module.exports = {
  buildCoverageGate,
  buildMasteryBySkill,
  courseIdFor,
  displayCode,
  emptyEvidence,
  routeAfterFinalizedQuestion,
  routing,
  skillGraph,
};
