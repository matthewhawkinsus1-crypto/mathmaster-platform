// The Path Session state machine.
//
// One place decides what happens after a question is finalized. Not the player,
// not the container, not the simulator — they all render whatever this issues.
// That is the property that makes the student experience and the teacher
// simulation agree: they run the same function over the same evidence.
//
// Four rules are load-bearing, and each one exists because its opposite is the
// standard failure of adaptive systems:
//
//   1. A WRONG ANSWER IS NOT REMEDIATION. Attempts within a question are for
//      assistance. Only a FINALIZED question becomes evidence, and one miss is
//      not a diagnosis — the student may simply have slipped.
//
//   2. REMEDIATION IS AN EXCURSION. Being routed from A.5C to A.5A does not
//      make A.5A the new destination. The origin, the reason, the depth and the
//      condition for coming back are all recorded, and the student is returned
//      automatically when the repair holds.
//
//   3. DIAGNOSE BEFORE YOU DESCEND. `planRemediation` already refuses to walk
//      the prerequisite chain on an assumption; this file does not second-guess
//      it. If the prerequisites are solid the work belongs here, with support.
//
//   4. DESCENT ENDS. Past the depth limit a teacher is involved, not another
//      level of the graph.
//
// Pure. No clock, no storage, no React.

import { REMEDIATION_ACTION, planCoveredRemediation, planRemediation } from './pathRemediationPlan.mjs';
import { describeSkill } from './pathSkillGraph.mjs';

export const PATH_ACTION = Object.freeze({
  CONTINUE: 'continue',
  SUPPORTED_RETRY: 'supported_retry',
  DIAGNOSE: 'diagnose',
  DESCEND: 'descend',
  BRIDGE: 'bridge',
  RETURN_TO_ORIGIN: 'return_to_origin',
  ENRICHMENT: 'enrichment',
  VERIFY_RETENTION: 'verify_retention',
  TEACHER_SUPPORT: 'teacher_support',
  COMPLETE: 'complete',
});

// How much of the prerequisite has to hold before the excursion ends. Not
// mastery: the student is going back to the skill that sent them here, and
// requiring mastery of the repair would keep them away longer than the gap
// justifies.
export const DEFAULT_RETURN_THRESHOLD = 0.7;

// One miss is a slip. Two finalized misses on the same skill in one session is
// a pattern worth acting on.
export const MISSES_BEFORE_ROUTING = 2;

// Past this many excursions deep, the answer is a person.
export const MAX_EXCURSION_DEPTH = 2;

export const MASTERY_FOR_ENRICHMENT = 0.9;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const masteryOf = (masteryBySkill, skillId) => {
  const entry = masteryBySkill?.[skillId];
  if (entry == null) return null;
  return typeof entry === 'number' ? clamp01(entry) : clamp01(entry.mastery);
};

/**
 * The excursion record. Everything needed to get back, written down at the
 * moment the student is sent away.
 */
export const beginExcursion = ({ originSkillId, targetSkillId, reason, depth = 0, returnThreshold = DEFAULT_RETURN_THRESHOLD }) => ({
  originSkillId,
  targetSkillId,
  reason,
  depth: depth + 1,
  returnThreshold,
  startedAt: null,
});

/**
 * Has the repair held well enough to go back?
 *
 * Deliberately not "is it mastered". The excursion ends when the prerequisite
 * stops being the obstacle, which is a lower bar than mastering it.
 */
export const excursionSatisfied = ({ excursion, masteryBySkill }) => {
  if (!excursion?.targetSkillId) return false;
  const mastery = masteryOf(masteryBySkill, excursion.targetSkillId);
  return mastery != null && mastery >= (excursion.returnThreshold ?? DEFAULT_RETURN_THRESHOLD);
};

const step = (action, extra = {}) => ({ action, ...extra });

/**
 * Decide what the student does next.
 *
 * `outcome` describes the question that has just been FINALIZED — not an
 * attempt within it. `sessionEvidence` is what has happened on the current
 * skill during this session, which is how a pattern is told from a slip.
 */
export const decideNextStep = ({
  courseId,
  currentSkillId,
  masteryBySkill = {},
  outcome = null,
  sessionEvidence = { finalized: 0, missed: 0, consecutiveMisses: 0 },
  excursion = null,
  requiredQuestions = 5,
  completedQuestions = 0,
  retentionConcern = false,
  maxDepth = MAX_EXCURSION_DEPTH,
  missesBeforeRouting = MISSES_BEFORE_ROUTING,
  // Whether a skill has practice content. Supplied by the caller — the server
  // reads the coverage index, the simulator reads its loaded bank — so this
  // file stays pure. Without it, routing can send a student to a standard with
  // nothing to practise, which is the dead end coverage exists to prevent.
  isCovered = null,
} = {}) => {
  // Student language, always. A path that explains itself with "texas:A.5A"
  // has not explained itself.
  const described = (skillId) => {
    const detail = describeSkill(skillId);
    return detail.studentLabel || detail.shortLabel || skillId;
  };

  // On an excursion and the repair has held: bridge back rather than dropping
  // the student straight into the skill that defeated them.
  if (excursion && excursionSatisfied({ excursion, masteryBySkill })) {
    return step(PATH_ACTION.BRIDGE, {
      skillId: excursion.targetSkillId,
      returnTo: excursion.originSkillId,
      excursion,
      reason: 'repair_condition_met',
      explanation: `${described(excursion.targetSkillId)} is holding, so one bridging question connects it back to ${described(excursion.originSkillId)}.`,
    });
  }

  // The session's work is done.
  if (completedQuestions >= requiredQuestions && !excursion) {
    return step(PATH_ACTION.COMPLETE, {
      skillId: currentSkillId,
      reason: 'required_questions_met',
      explanation: 'This session has the evidence it needed.',
    });
  }

  const mastery = masteryOf(masteryBySkill, currentSkillId);

  // A correct, finalized answer. Nothing to repair.
  if (outcome && outcome.isCorrect) {
    if (retentionConcern) {
      return step(PATH_ACTION.VERIFY_RETENTION, {
        skillId: currentSkillId,
        reason: 'retention_concern',
        explanation: 'This skill was strong before and has not been checked recently, so it is being verified rather than assumed.',
      });
    }
    if (!excursion && mastery != null && mastery >= MASTERY_FOR_ENRICHMENT) {
      return step(PATH_ACTION.ENRICHMENT, {
        skillId: currentSkillId,
        reason: 'mastery_supports_enrichment',
        explanation: `${described(currentSkillId)} is mastered, so the next question extends it rather than repeating it.`,
      });
    }
    return step(PATH_ACTION.CONTINUE, {
      skillId: currentSkillId,
      excursion,
      reason: 'evidence_supports_continuing',
      explanation: 'That was right. The session continues on this skill.',
    });
  }

  // A finalized miss. One is a slip; the session keeps going with support.
  const misses = Number(sessionEvidence?.missed) || 0;
  if (misses < missesBeforeRouting) {
    return step(PATH_ACTION.SUPPORTED_RETRY, {
      skillId: currentSkillId,
      excursion,
      reason: 'single_miss_is_not_a_diagnosis',
      explanation: 'One missed question is not a pattern. The next question stays on this skill, with support available.',
    });
  }

  // A pattern. Past the depth limit this stops being an algorithm's problem.
  const depth = Number(excursion?.depth) || 0;
  if (depth >= maxDepth) {
    return step(PATH_ACTION.TEACHER_SUPPORT, {
      skillId: currentSkillId,
      excursion,
      reason: 'descent_limit_reached',
      explanation: 'This has been routed as far as it should be routed. A teacher should look at it before the student goes further.',
    });
  }

  // Ask the existing planner. It refuses to descend on an assumption, and this
  // file does not argue with it.
  //
  // Bounded to ONE step on purpose. Unbounded, the planner answers "what is the
  // deepest root cause" — from A.5C with A.5A weak it walks past A.5A to
  // diagnose an unexamined grade-8 skill underneath it. That is the right
  // answer for the teacher's inspector and the wrong one for a session: the
  // evidence already says A.5A is weak, and A.5A is what the student can act on
  // now. The deeper analysis is still available to the inspector, which calls
  // this planner unbounded.
  const plan = typeof isCovered === 'function'
    ? planCoveredRemediation({ courseId, skillId: currentSkillId, masteryBySkill, maxDepth: 1, isCovered })
    : planRemediation({ courseId, skillId: currentSkillId, masteryBySkill, maxDepth: 1 });

  if (plan.action === REMEDIATION_ACTION.DESCEND && plan.targetSkillId) {
    return step(PATH_ACTION.DESCEND, {
      skillId: plan.targetSkillId,
      excursion: beginExcursion({
        originSkillId: excursion?.originSkillId || currentSkillId,
        targetSkillId: plan.targetSkillId,
        reason: 'prerequisiteGap',
        depth,
      }),
      plan,
      reason: 'prerequisite_gap_has_evidence',
      explanation: plan.explanation,
    });
  }

  if (plan.action === REMEDIATION_ACTION.DIAGNOSE && plan.targetSkillId) {
    return step(PATH_ACTION.DIAGNOSE, {
      skillId: plan.targetSkillId,
      // A diagnostic is not a descent: no excursion is opened, because the
      // student may be coming straight back.
      excursion,
      diagnosing: { originSkillId: currentSkillId, targetSkillId: plan.targetSkillId },
      plan,
      reason: 'prerequisite_evidence_missing',
      explanation: plan.explanation,
    });
  }

  // Prerequisites are solid, or there is nothing underneath. The work belongs
  // here, supported.
  return step(PATH_ACTION.SUPPORTED_RETRY, {
    skillId: currentSkillId,
    excursion,
    plan,
    reason: plan.action === REMEDIATION_ACTION.RETEACH_IN_PLACE ? 'prerequisites_intact' : 'nothing_to_route_to',
    explanation: plan.explanation || 'The difficulty is with this skill itself, so the next question stays here with more support.',
  });
};

/**
 * What a diagnostic told us.
 *
 * Passing means the prerequisite was not the problem — the student goes back up
 * WITH support rather than deeper down, which is the whole point of diagnosing
 * before descending.
 */
const studentName = (skillId) => {
  const detail = describeSkill(skillId);
  return detail.studentLabel || detail.shortLabel || skillId;
};

export const resolveDiagnostic = ({ diagnosing, isCorrect, excursion = null }) => {
  if (!diagnosing) return null;
  if (isCorrect) {
    return step(PATH_ACTION.RETURN_TO_ORIGIN, {
      skillId: diagnosing.originSkillId,
      excursion,
      reason: 'diagnostic_cleared_prerequisite',
      explanation: `${studentName(diagnosing.targetSkillId)} is not what is holding this up, so you are going back to ${studentName(diagnosing.originSkillId)} with more support.`,
    });
  }
  return step(PATH_ACTION.DESCEND, {
    skillId: diagnosing.targetSkillId,
    excursion: beginExcursion({
      originSkillId: excursion?.originSkillId || diagnosing.originSkillId,
      targetSkillId: diagnosing.targetSkillId,
      reason: 'diagnosticConfirmedGap',
      depth: Number(excursion?.depth) || 0,
    }),
    reason: 'diagnostic_confirmed_gap',
    explanation: 'The diagnostic confirmed the gap, so the work moves to the prerequisite.',
  });
};

/**
 * The sentence a teacher reads in the simulator, and the one a student's
 * "why am I here?" would be built from.
 */
export const explainStep = (decision) => decision?.explanation || '';

// --- What the student is told -------------------------------------------------
//
// `explanation` above is written for the route trace a teacher reads: it names
// the rule that fired. A student needs the same fact in the second person, with
// the skill's own name and no engine vocabulary at all. Composing it here — off
// the same decision object — is what keeps the two from disagreeing.

const STUDENT_HEADLINE = {
  [PATH_ACTION.DESCEND]: 'Building up to this',
  [PATH_ACTION.DIAGNOSE]: 'Quick check first',
  [PATH_ACTION.BRIDGE]: 'Back to where you were',
  [PATH_ACTION.RETURN_TO_ORIGIN]: 'Back to where you were',
  [PATH_ACTION.ENRICHMENT]: 'Challenge',
  [PATH_ACTION.VERIFY_RETENTION]: 'Quick retention check',
  [PATH_ACTION.SUPPORTED_RETRY]: 'Staying with this skill',
  [PATH_ACTION.TEACHER_SUPPORT]: 'Check in with your teacher',
  [PATH_ACTION.CONTINUE]: '',
  [PATH_ACTION.COMPLETE]: 'Session complete',
};

/**
 * The banner a student sees when the path changes direction.
 *
 * Returns null for a decision that is not a change of direction — a session
 * that announces "the session continues on this skill" after every correct
 * answer is noise, and noise is how real explanations stop being read.
 */
export const explainStepForStudent = (decision) => {
  if (!decision?.action) return null;
  const name = (skillId) => studentName(skillId);
  const headline = STUDENT_HEADLINE[decision.action];

  switch (decision.action) {
    case PATH_ACTION.DESCEND:
      return {
        headline,
        message: `${name(decision.skillId)} is what this builds on, so you are working on that for a few questions. You will come back to ${name(decision.excursion?.originSkillId || decision.skillId)}.`,
        tone: 'support',
      };
    case PATH_ACTION.DIAGNOSE:
      return {
        headline,
        message: `One question on ${name(decision.skillId)} first, to find out whether that is what is making this harder.`,
        tone: 'support',
      };
    case PATH_ACTION.BRIDGE:
      return {
        headline,
        message: `${name(decision.skillId)} is holding now, so this question connects it back to ${name(decision.returnTo)}.`,
        tone: 'return',
      };
    case PATH_ACTION.RETURN_TO_ORIGIN:
      return {
        headline,
        message: `${name(decision.skillId)} is where the work belongs, and you are going back to it with more support.`,
        tone: 'return',
      };
    case PATH_ACTION.ENRICHMENT:
      return {
        headline,
        message: `You have shown you can do ${name(decision.skillId)}, so the next question pushes it further instead of repeating it.`,
        tone: 'challenge',
      };
    case PATH_ACTION.VERIFY_RETENTION:
      return {
        headline,
        message: 'You learned this a while ago. This is a short check that it has stayed with you.',
        tone: 'retention',
      };
    case PATH_ACTION.SUPPORTED_RETRY:
      return {
        headline,
        message: `The next question stays on ${name(decision.skillId)}, with more support available.`,
        tone: 'support',
      };
    case PATH_ACTION.TEACHER_SUPPORT:
      return {
        headline,
        message: 'Your work is saved. Check in with your teacher before you carry on with this skill.',
        tone: 'teacher',
      };
    default:
      return null;
  }
};
