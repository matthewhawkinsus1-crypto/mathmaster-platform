/*
 * CORRECTIONS: TEACHING, BUILT FROM ONE STUDENT'S OWN FAILED TEST.
 *
 * Corrections are generated automatically after a Test is RELEASED and scored
 * below the passing threshold. They are the instructional half of the cycle and
 * they are deliberately NOT secure: hints, worked guidance, rich tools and
 * repeated attempts are the whole point. Nothing here can move a recorded
 * grade — `gradeImpact` is 'none' on every plan this module builds, and the
 * grade rule in testCycleGrade.mjs has no correction input at all.
 *
 * WHAT MAKES THIS DIFFERENT FROM "SHOW THEM THE ANSWERS".
 *
 * A correction that replays the secure Test item with the key exposed teaches a
 * student one answer. Every correction target here carries:
 *
 *   - the ACTUAL evidence it came from (which instance, which slot, what score)
 *   - PARALLEL families to practise on, with the exact instance the student
 *     already saw explicitly forbidden
 *   - a required amount of SUCCESSFUL evidence before it is complete
 *
 * WHEN A MISCONCEPTION CANNOT BE INFERRED, IT IS NOT INVENTED.
 *
 * Error metadata is used when the evidence carries it and is otherwise absent,
 * and the plan says so: `diagnosis: 'standard'` targets the missed standard and
 * family, which is a true statement about what went wrong. Naming a
 * misconception nobody observed would put a diagnosis in a teacher's mouth and
 * send a student to remediate something they may not have.
 *
 * Pure by construction: no Firestore, no network, no clock of its own.
 */

import { normalizeTestBlueprint } from './testCycleBlueprint.mjs';
import { clampPercent, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { getMisconceptionCode, trustedMisconceptionFindings } from './misconceptionCodes.mjs';

/*
 * TEST CYCLE ERROR PATTERNS SPEAK THE CANONICAL REGISTRY.
 *
 * A Test Cycle response used to be read for a free-text `misconceptionCode` or
 * `errorPattern` (functions/lib/testCycle.js responsesForProfile), and any
 * string there became a named diagnosis. Nothing ever wrote one — and nothing
 * could prove one. A named error pattern is now ONLY a finding with server
 * provenance that passes the registry's trust gate
 * (misconceptionCodes.mjs trustedMisconceptionFindings): the same codes, the
 * same versions and the same teacher meaning as everywhere else in MathMaster.
 *
 *   new response evidence   `misconceptionEvidence` (the provenance block a
 *                           server classifier builds) → canonical code
 *   a legacy free string    unverifiable: never a diagnosis; the target is
 *                           the missed standard, exactly as with no label
 *   a future registry code  unknown to this build: dropped, never guessed
 *   a stored plan           unchanged: its `diagnosisDetail` was written when
 *                           it was built and is shown as written
 */
export const TEST_CYCLE_MISCONCEPTION_SOURCE = 'canonical-registry';

/** The canonical codes one Test Cycle response proves, through the trust gate. */
export const testCycleResponseMisconceptionCodes = (response) => trustedMisconceptionFindings({
  misconceptionEvidence: response?.misconceptionEvidence ?? response?.grading?.misconceptionEvidence ?? null,
}).map((finding) => finding.code);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const CORRECTION_DIAGNOSIS = Object.freeze({
  MISCONCEPTION: 'misconception',
  STANDARD: 'standard',
});

/**
 * One student's performance profile, per blueprint target.
 *
 * Built from released secure-test responses joined back to the issuance plan,
 * so every aggregate can name the instances it came from. A target with no
 * responses is reported with `attempted: 0` rather than dropped: "not reached"
 * and "got it wrong" are different facts and a correction plan must not
 * conflate them.
 */
export const buildPerformanceProfile = ({ blueprint = null, responses = [] } = {}) => {
  const normalized = normalizeTestBlueprint(blueprint);
  const byTarget = new Map();

  normalized.targets.forEach((target) => {
    byTarget.set(target.targetId, {
      targetId: target.targetId,
      alignmentKey: target.alignmentKey,
      label: target.label,
      dok: target.dok,
      difficultyBand: target.difficultyBand,
      representation: target.representation,
      toolId: target.toolId,
      weight: target.weight,
      anchor: target.anchor,
      familyIds: [...target.familyIds],
      questionCount: target.questionCount,
      attempted: 0,
      correct: 0,
      scoreSum: 0,
      missedEvidence: [],
      seenFamilyIds: [],
      seenInstanceIds: [],
      seenToolIds: [],
      misconceptions: [],
    });
  });

  list(responses).filter(isObject).forEach((response) => {
    const targetId = clean(response.targetId);
    const entry = byTarget.get(targetId);
    if (!entry) return;
    const score = clampPercent(Number(response.score) * 100, 0) / 100;
    const isCorrect = response.isCorrect === true;
    entry.attempted += 1;
    entry.correct += isCorrect ? 1 : 0;
    entry.scoreSum += Number.isFinite(score) ? score : 0;
    const familyId = clean(response.familyId);
    const instanceId = clean(response.questionInstanceId);
    if (familyId) entry.seenFamilyIds.push(familyId);
    if (instanceId) entry.seenInstanceIds.push(instanceId);
    if (clean(response.toolId)) entry.seenToolIds.push(clean(response.toolId));
    if (!isCorrect) {
      entry.missedEvidence.push({
        questionInstanceId: instanceId || null,
        slotId: clean(response.slotId) || null,
        familyId: familyId || null,
        score: Number.isFinite(score) ? score : 0,
        dok: Number(response.dok) || entry.dok,
        difficultyBand: Number(response.difficultyBand) || entry.difficultyBand,
        representation: clean(response.representation) || entry.representation,
        submittedAt: Number(response.submittedAt) || null,
      });
      // Only server-proved, canonical findings. Nothing is derived from a
      // wrong answer, and a free-text label is not evidence.
      entry.misconceptions.push(...testCycleResponseMisconceptionCodes(response));
    }
  });

  const targets = [...byTarget.values()].map((entry) => {
    const mastery = entry.attempted > 0 ? entry.scoreSum / entry.attempted : null;
    return {
      ...entry,
      seenFamilyIds: [...new Set(entry.seenFamilyIds)],
      seenInstanceIds: [...new Set(entry.seenInstanceIds)],
      seenToolIds: [...new Set(entry.seenToolIds)],
      misconceptions: [...new Set(entry.misconceptions)],
      missed: entry.attempted - entry.correct,
      mastery,
      // How much of this student's lost credit sits on this target. Weight is
      // included so a heavily weighted target that was half missed outranks a
      // light one that was missed entirely.
      weightedDeficit: mastery === null
        ? entry.weight * entry.questionCount
        : (1 - mastery) * entry.weight * entry.attempted,
    };
  });

  const attempted = targets.reduce((sum, target) => sum + target.attempted, 0);
  const scoreSum = targets.reduce((sum, target) => sum + target.scoreSum, 0);

  return {
    blueprintId: normalized.blueprintId,
    blueprintVersion: normalized.version,
    targets,
    attempted,
    overallScore: attempted > 0 ? Math.round((scoreSum / attempted) * 100) : null,
    // Weakest first, ties broken by weight then by target id so the order is
    // stable and auditable rather than dependent on Map iteration luck.
    weakestFirst: [...targets]
      .filter((target) => target.weightedDeficit > 0)
      .sort((left, right) => (
        right.weightedDeficit - left.weightedDeficit
        || right.weight - left.weight
        || left.targetId.localeCompare(right.targetId)
      )),
  };
};

/**
 * Should this student get Corrections at all?
 *
 * A passing Test produces no correction plan, and therefore no retest gate and
 * no retest, unless a teacher explicitly overrides — which is a control, not an
 * inference. See testCycleStages.
 */
export const correctionsAreDue = ({ releasedTestGrade = null, policy = null } = {}) => {
  const resolved = normalizeTestCyclePolicy(policy);
  if (!resolved) return false;
  if (releasedTestGrade === null || releasedTestGrade === undefined) return false;
  return clampPercent(releasedTestGrade) < resolved.passingScore;
};

const requiredEvidenceFor = (target) => Math.max(1, Math.min(3, target.missed || 1));

/**
 * The automatic correction plan.
 *
 * One correction target per weak blueprint target, weakest first, each one
 * pointing back at the evidence that produced it so a teacher opening the plan
 * can see exactly why the student is being sent there.
 */
export const buildCorrectionPlan = ({
  blueprint = null,
  profile = null,
  policy = null,
  releasedTestGrade = null,
  assignmentId = '',
  studentId = '',
  examSessionId = '',
  maxTargets = 8,
} = {}) => {
  const resolved = normalizeTestCyclePolicy(policy);
  if (!resolved) return null;
  const built = profile || buildPerformanceProfile({ blueprint, responses: [] });
  const grade = releasedTestGrade === null || releasedTestGrade === undefined
    ? built.overallScore
    : clampPercent(releasedTestGrade);
  if (!correctionsAreDue({ releasedTestGrade: grade, policy: resolved })) return null;

  const limit = Math.max(1, Math.min(20, Math.round(Number(maxTargets) || 8)));
  const targets = built.weakestFirst.slice(0, limit).map((target, index) => {
    // A registry code this build knows, or nothing (a code from a newer
    // registry degrades to the standard diagnosis).
    const misconceptionEntry = resolved.corrections.strategy === 'performanceTargeted'
      ? list(target.misconceptions).map((code) => getMisconceptionCode(code)).find(Boolean) || null
      : null;
    const misconception = misconceptionEntry?.id || null;
    const forbiddenInstanceIds = [...target.seenInstanceIds];
    const parallelFamilyIds = target.familyIds.filter((familyId) => !target.seenFamilyIds.includes(familyId));
    return {
      correctionId: `correction-${target.targetId}`,
      order: index + 1,
      targetId: target.targetId,
      alignmentKey: target.alignmentKey,
      label: target.label,
      dok: target.dok,
      difficultyBand: target.difficultyBand,
      representation: target.representation,
      toolId: target.toolId,
      // The tools this student met the standard with on the Test: a missed
      // graphing item is practised on the Graphing tool, where one exists.
      testToolIds: [...list(target.seenToolIds)],
      weight: target.weight,
      // A named misconception only when the evidence carried one.
      diagnosis: misconception ? CORRECTION_DIAGNOSIS.MISCONCEPTION : CORRECTION_DIAGNOSIS.STANDARD,
      misconception,
      // One teacher-facing meaning: the registry's own label and meaning.
      ...(misconceptionEntry ? {
        misconceptionLabel: misconceptionEntry.label,
        misconceptionCodeVersion: misconceptionEntry.version,
        misconceptionSource: TEST_CYCLE_MISCONCEPTION_SOURCE,
      } : {}),
      diagnosisDetail: misconceptionEntry
        ? `MathMaster identified "${misconceptionEntry.label}" on this standard in server-graded Test work. ${misconceptionEntry.teacherMeaning}`
        : `Targeting the missed standard ${target.alignmentKey || target.label}; no specific error pattern was recorded.`,
      // The teacher-visible mapping back to real failed Test evidence.
      evidence: target.missedEvidence.map((item) => ({ ...item })),
      missed: target.missed,
      attempted: target.attempted,
      mastery: target.mastery,
      // Practise on something else. The exact secure instances are forbidden,
      // and a parallel family is preferred over the one that was just missed.
      practiceFamilyIds: parallelFamilyIds.length ? parallelFamilyIds : [...target.familyIds],
      forbiddenInstanceIds,
      replaysSecureItem: false,
      requiredCorrectResponses: requiredEvidenceFor(target),
      correctResponses: 0,
      complete: false,
    };
  });

  return {
    planId: `corrections|${clean(assignmentId) || 'assignment'}|${clean(studentId) || 'student'}|${clean(built.blueprintId)}`,
    assignmentId: clean(assignmentId),
    studentId: clean(studentId),
    sourceExamSessionId: clean(examSessionId) || null,
    blueprintId: built.blueprintId,
    blueprintVersion: built.blueprintVersion,
    strategy: resolved.corrections.strategy,
    releasedTestGrade: grade,
    passingScore: resolved.passingScore,
    // Instructional, not secure. Both facts are read by the runtime, not just
    // documented here: the corrections surface refuses to launch the secure
    // container, and the grade rule has no correction input.
    secure: false,
    hintsAllowed: true,
    gradeImpact: 'none',
    targets,
    complete: targets.length === 0,
  };
};

/**
 * Record one successful correction response.
 *
 * Only correct responses advance a target, which is what "require successful
 * evidence before marking that correction target complete" means in code. An
 * incorrect attempt is not punished and not counted — corrections are practice.
 */
export const applyCorrectionEvidence = (plan, evidence = {}) => {
  if (!isObject(plan)) return plan;
  const correctionId = clean(evidence.correctionId);
  const isCorrect = evidence.isCorrect === true;
  const targets = list(plan.targets).map((target) => {
    if (clean(target.correctionId) !== correctionId || !isCorrect || target.complete) return target;
    const correctResponses = Number(target.correctResponses || 0) + 1;
    return {
      ...target,
      correctResponses,
      complete: correctResponses >= Number(target.requiredCorrectResponses || 1),
      completedAt: correctResponses >= Number(target.requiredCorrectResponses || 1)
        ? Number(evidence.at) || null
        : target.completedAt || null,
    };
  });
  return {
    ...plan,
    targets,
    complete: targets.length > 0 && targets.every((target) => target.complete === true),
  };
};

export const correctionPlanProgress = (plan) => {
  const targets = list(plan?.targets);
  const complete = targets.filter((target) => target.complete === true).length;
  return {
    total: targets.length,
    complete,
    remaining: Math.max(0, targets.length - complete),
    // An empty plan is complete: there was nothing to correct.
    allComplete: targets.length === 0 || complete === targets.length,
  };
};
