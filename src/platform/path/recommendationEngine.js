// The pacing-aware adaptive path engine.
//
// This deliberately does NOT return a nextSkillId. It returns every skill the
// student could work on, classified and ranked, with reason codes — because
// several skills are frequently equally valid and collapsing that to one choice
// is what turns an adaptive system into a rigid sequence.
//
// Five dimensions are kept separate on purpose, and must stay separate:
//
//   prerequisite readiness  — can the student mathematically attempt this?
//   curriculum timing       — is now the right point in the year for it?
//   recommendation priority — of the allowed options, which helps most?
//   availability            — is the student permitted to choose it?
//   required work           — does a teacher or a deficit override choice?
//
// Collapsing them into `if (mastery > 0.8) next() else remediate()` is the one
// outcome this file exists to prevent.

import { getSkillGraph, describeSkill, resolveSkillAnywhere } from './skillGraph.js';
import { TIMING, classifySkillTiming, normalizeClassPacing, resolveCoursePolicy } from './curriculumPacing.js';

export const STATUS = Object.freeze({
  REQUIRED: 'required',
  REMEDIATION: 'remediation',
  RECOMMENDED: 'recommended',
  PRIORITY: 'priority',
  AVAILABLE: 'available',
  EXTENSION: 'extension',
  FUTURE: 'future',
  LOCKED: 'locked',
  MASTERED: 'mastered',
});

export const REASON = Object.freeze({
  PREREQS_MASTERED: 'prerequisites_mastered',
  PREREQ_GAP: 'prerequisite_gap',
  PREREQ_SEVERE_GAP: 'prerequisite_severe_gap',
  ALIGNED_CURRENT: 'aligned_with_current_instruction',
  REVIEW_WINDOW: 'earlier_in_the_course',
  WITHIN_ACCELERATION: 'within_acceleration_horizon',
  BEYOND_ACCELERATION: 'beyond_acceleration_horizon',
  TEACHER_PRIORITY: 'teacher_priority',
  TEACHER_UNLOCK: 'teacher_unlocked',
  TEACHER_HIDDEN: 'teacher_hidden',
  ASSIGNMENT_RELEVANCE: 'current_assignment_relevance',
  REQUIRED_ASSIGNMENT: 'required_assignment',
  LOW_RECENT_ACCURACY: 'recent_accuracy_below_threshold',
  STRONG_MASTERY: 'mastery_supports_extension',
  ALREADY_MASTERED: 'already_mastered',
  AVOIDED: 'repeatedly_passed_over',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
  PROVISIONAL_PACING: 'pacing_is_provisional',
});

// Mastery below this on a required prerequisite is a severe gap: the skill is
// locked outright rather than merely discouraged.
export const SEVERE_GAP_MASTERY = 0.4;
export const MASTERED_THRESHOLD = 0.9;
export const LOW_ACCURACY_THRESHOLD = 0.6;
// Enough attempts before mastery is treated as trustworthy for acceleration.
export const CONFIDENT_ATTEMPTS = 6;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// Average evidence strength across a skill's required prerequisites: high
// mastery from two questions should not unlock acceleration the way high
// mastery from thirty does.
const evidenceStrengthFor = (masteryBySkill, prerequisites = []) => {
  const required = (prerequisites || []).filter((entry) => entry.required);
  const values = required
    .map((entry) => masteryFor(masteryBySkill, entry.skillId)?.evidenceStrength)
    .filter((value) => value != null);
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

const masteryFor = (masteryBySkill, skillId) => {
  const entry = masteryBySkill?.[skillId];
  if (!entry) return null;
  if (typeof entry === 'number') return { mastery: clamp01(entry), attempts: 0, recentAccuracy: null, evidenceStrength: 0 };
  return {
    mastery: clamp01(entry.mastery),
    attempts: Math.max(0, Number(entry.attempts) || 0),
    recentAccuracy: entry.recentAccuracy == null ? null : clamp01(entry.recentAccuracy),
    evidenceStrength: clamp01(entry.evidenceStrength ?? (Math.min(1, (Number(entry.attempts) || 0) / CONFIDENT_ATTEMPTS))),
  };
};

/**
 * Stage 3 — mathematical readiness, evaluated per skill against its own
 * prerequisites. Never against "everything numbered before it".
 */
export const evaluatePrerequisites = (skill, masteryBySkill) => {
  const required = (skill.prerequisites || []).filter((entry) => entry.required);
  const supportive = (skill.prerequisites || []).filter((entry) => !entry.required);

  const unmet = [];
  const severe = [];
  required.forEach((entry) => {
    const state = masteryFor(masteryBySkill, entry.skillId);
    const mastery = state?.mastery ?? 0;
    // No evidence at all is not a gap. A student who has never touched a
    // prerequisite is unproven, not deficient, and locking on that would stop
    // every new student from starting anything.
    if (!state) return;
    if (mastery < SEVERE_GAP_MASTERY) severe.push(entry.skillId);
    else if (mastery < entry.minimumMastery) unmet.push(entry.skillId);
  });

  const supportiveShortfall = supportive.filter((entry) => {
    const state = masteryFor(masteryBySkill, entry.skillId);
    return state && state.mastery < entry.minimumMastery;
  }).map((entry) => entry.skillId);

  const scored = required.map((entry) => masteryFor(masteryBySkill, entry.skillId)?.mastery ?? null).filter((value) => value != null);
  const readiness = scored.length ? scored.reduce((total, value) => total + value, 0) / scored.length : 1;

  return {
    readiness: clamp01(readiness),
    unmetPrerequisites: unmet,
    severeGaps: severe,
    supportiveShortfall,
    hasEvidence: scored.length > 0,
  };
};

const overrideFor = (overrides, skillId) => (Array.isArray(overrides) ? overrides : [])
  .filter((entry) => entry?.skillId === skillId)
  .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt).getTime() >= Date.now())
  .pop() || null;

/**
 * The scoring model. Every term is separate and signed so a teacher-facing
 * explanation can name the ones that actually moved the number.
 */
export const scoreSkill = ({ readiness, timing, teacherPriority, assignmentRelevance, mastery, recentAccuracy, avoidanceCount, extensionReady }) => {
  const terms = {
    prerequisiteReadiness: readiness * 0.30,
    curriculumTiming: timing === TIMING.CURRENT ? 0.30
      : timing === TIMING.REVIEW ? 0.12
        : timing === TIMING.AHEAD ? 0.08 : 0,
    teacherPriority: teacherPriority ? 0.20 : 0,
    assignmentRelevance: assignmentRelevance ? 0.12 : 0,
    learningGap: recentAccuracy != null && recentAccuracy < LOW_ACCURACY_THRESHOLD ? 0.14 : 0,
    accelerationReadiness: extensionReady ? 0.06 : 0,
    // Path balance: pressure grows with how long a valid, current skill has
    // been passed over, but never all at once.
    pathBalance: Math.min(0.18, Math.max(0, Number(avoidanceCount) || 0) * 0.06),
    excessiveAdvancementPenalty: timing === TIMING.FUTURE ? -0.35 : 0,
    // A skill already mastered should not crowd out unlearned material.
    masteredPenalty: mastery != null && mastery >= MASTERED_THRESHOLD ? -0.4 : 0,
  };
  const score = Object.values(terms).reduce((total, value) => total + value, 0);
  return { score: Number(Math.max(0, Math.min(1, score)).toFixed(4)), terms };
};

/**
 * Confidence rises with evidence. A new student gets several suggestions
 * offered tentatively rather than one presented as certain.
 */
export const evaluateConfidence = (masteryBySkill) => {
  const entries = Object.values(masteryBySkill || {});
  const attempts = entries.reduce((total, entry) => total + (Number(entry?.attempts) || 0), 0);
  if (attempts >= 40) return { level: 'high', attempts, message: 'This is your strongest next step.' };
  if (attempts >= 12) return { level: 'medium', attempts, message: 'This looks like a good next step.' };
  return { level: 'low', attempts, message: 'Here are several good places to begin.' };
};

/**
 * The whole engine. Deterministic, explainable, and returning categories rather
 * than a single answer.
 */
export const getStudentPathOptions = ({
  courseId,
  masteryBySkill = {},
  pacing = {},
  pacingProvider = null,
  teacherOverrides = [],
  requiredSkillIds = [],
  assignmentSkillIds = [],
  avoidanceBySkill = {},
  courseProfile = null,
} = {}) => {
  const skills = getSkillGraph(courseId);
  const policy = resolveCoursePolicy(courseProfile);
  const settings = normalizeClassPacing({ accelerationRadius: policy.accelerationRadius, ...pacing });
  const confidence = evaluateConfidence(masteryBySkill);
  const requiredSet = new Set(requiredSkillIds);
  const assignmentSet = new Set(assignmentSkillIds);

  const rows = skills.map((skill) => {
    const prereq = evaluatePrerequisites(skill, masteryBySkill);
    const timingInfo = classifySkillTiming({ skillId: skill.skillId, provider: pacingProvider, pacing: settings });
    const override = overrideFor(teacherOverrides, skill.skillId);
    const state = masteryFor(masteryBySkill, skill.skillId);
    const mastery = state?.mastery ?? null;
    const reasons = [];

    // Stage 5 — teacher overrides. An unlock lifts a future skill into range;
    // it never lowers the prerequisite bar.
    let timing = timingInfo.timing;
    if (override?.action === 'open' || override?.action === 'recommend') {
      if (timing === TIMING.FUTURE) { timing = TIMING.AHEAD; reasons.push(REASON.TEACHER_UNLOCK); }
    }

    const teacherPriority = override?.action === 'priority' || override?.action === 'recommend';
    if (teacherPriority) reasons.push(REASON.TEACHER_PRIORITY);
    if (timingInfo.isProvisional && !timingInfo.unmapped) reasons.push(REASON.PROVISIONAL_PACING);

    if (timing === TIMING.CURRENT) reasons.push(REASON.ALIGNED_CURRENT);
    if (timing === TIMING.REVIEW) reasons.push(REASON.REVIEW_WINDOW);
    if (timing === TIMING.AHEAD) reasons.push(REASON.WITHIN_ACCELERATION);
    if (timing === TIMING.FUTURE) reasons.push(REASON.BEYOND_ACCELERATION);

    if (prereq.severeGaps.length) reasons.push(REASON.PREREQ_SEVERE_GAP);
    else if (prereq.unmetPrerequisites.length) reasons.push(REASON.PREREQ_GAP);
    else if (prereq.hasEvidence) reasons.push(REASON.PREREQS_MASTERED);
    else reasons.push(REASON.INSUFFICIENT_EVIDENCE);

    if (assignmentSet.has(skill.skillId)) reasons.push(REASON.ASSIGNMENT_RELEVANCE);
    if (requiredSet.has(skill.skillId)) reasons.push(REASON.REQUIRED_ASSIGNMENT);
    if (state?.recentAccuracy != null && state.recentAccuracy < LOW_ACCURACY_THRESHOLD) reasons.push(REASON.LOW_RECENT_ACCURACY);

    const avoidanceCount = Number(avoidanceBySkill?.[skill.skillId]) || 0;
    if (avoidanceCount > 0) reasons.push(REASON.AVOIDED);

    // Extension readiness is about what the student has ALREADY mastered, not
    // about the skill being offered — if they had mastered that, it would be
    // MASTERED rather than a challenge. It also requires real evidence, so a
    // brand-new student is never handed ahead-of-pace content on a default.
    const extensionReady = prereq.hasEvidence
      && prereq.readiness >= policy.extensionThreshold
      && evidenceStrengthFor(masteryBySkill, skill.prerequisites) >= 0.5;
    if (extensionReady) reasons.push(REASON.STRONG_MASTERY);

    const isMastered = mastery != null && mastery >= MASTERED_THRESHOLD;
    if (isMastered) reasons.push(REASON.ALREADY_MASTERED);

    const { score, terms } = scoreSkill({
      readiness: prereq.readiness,
      timing,
      teacherPriority,
      assignmentRelevance: assignmentSet.has(skill.skillId),
      mastery,
      recentAccuracy: state?.recentAccuracy ?? null,
      avoidanceCount,
      extensionReady,
    });

    // Stage 11 — final classification. Order matters: required work outranks
    // everything, a severe gap outranks a teacher's convenience, and future
    // content stays future no matter how capable the student is.
    let status;
    if (requiredSet.has(skill.skillId)) status = STATUS.REQUIRED;
    else if (isMastered) status = STATUS.MASTERED;
    else if (prereq.severeGaps.length && override?.action !== 'open') status = STATUS.LOCKED;
    else if (override?.action === 'hide') status = STATUS.LOCKED;
    else if (timing === TIMING.FUTURE) status = STATUS.FUTURE;
    else if (prereq.unmetPrerequisites.length) status = STATUS.REMEDIATION;
    // Teacher intent is checked BEFORE pacing here. A teacher who unlocks a
    // future skill and says "recommend this" has made a deliberate decision;
    // letting it fall into the generic available pile — where it scored below
    // ordinary current content — silently discarded that decision.
    else if (teacherPriority || avoidanceCount >= 3) status = STATUS.PRIORITY;
    else if (timing === TIMING.AHEAD) status = extensionReady ? STATUS.EXTENSION : STATUS.AVAILABLE;
    else if (timing === TIMING.CURRENT && score >= 0.55) status = STATUS.RECOMMENDED;
    else status = STATUS.AVAILABLE;

    if (override?.action === 'hide') reasons.push(REASON.TEACHER_HIDDEN);

    return {
      skillId: skill.skillId,
      label: describeSkill(skill.skillId).label,
      status,
      score,
      mastery,
      prerequisiteReadiness: prereq.readiness,
      curriculumTiming: timing,
      curriculumWindow: timingInfo.window,
      pacingIsProvisional: timingInfo.isProvisional,
      // Real-calendar extras, absent under the provisional provider.
      calendarTiming: timingInfo.calendarTiming || null,
      recommendationMode: timingInfo.recommendationMode || 'normal',
      instructionalDaysUntilStart: timingInfo.instructionalDaysUntilStart ?? 0,
      calendarDaysUntilStart: timingInfo.calendarDaysUntilStart ?? 0,
      curriculumTitle: timingInfo.window?.title || null,
      accelerationDistance: Math.max(0, timingInfo.distance),
      teacherPriority,
      unmetPrerequisites: [...prereq.severeGaps, ...prereq.unmetPrerequisites],
      // The remediation target: the weakest required prerequisite, so a caller
      // never has to guess where to send the student.
      remediationTarget: prereq.severeGaps[0] || prereq.unmetPrerequisites[0] || null,
      reasons,
      scoreTerms: terms,
    };
  });

  const byStatus = (status) => rows
    .filter((row) => row.status === status)
    .sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId));

  return {
    courseId,
    confidence,
    pacing: settings,
    pacingIsProvisional: Boolean(pacingProvider?.isProvisional),
    required: byStatus(STATUS.REQUIRED),
    remediation: byStatus(STATUS.REMEDIATION),
    priority: byStatus(STATUS.PRIORITY),
    recommended: byStatus(STATUS.RECOMMENDED),
    available: byStatus(STATUS.AVAILABLE),
    extension: byStatus(STATUS.EXTENSION),
    future: byStatus(STATUS.FUTURE),
    locked: byStatus(STATUS.LOCKED),
    mastered: byStatus(STATUS.MASTERED),
  };
};

/**
 * A remediation excursion that remembers where it came from. Guardrail 4: a
 * student must always have a route back to the skill that sent them away.
 */
export const beginRemediation = ({ originSkillId, targetSkillId }) => ({
  originSkillId,
  targetSkillId,
  startedAt: Date.now(),
  origin: describeSkill(originSkillId),
  target: describeSkill(targetSkillId),
});

export const shouldReturnFromRemediation = ({ excursion, masteryBySkill, minimumMastery = 0.7 }) => {
  if (!excursion?.targetSkillId) return false;
  const state = masteryFor(masteryBySkill, excursion.targetSkillId);
  return Boolean(state && state.mastery >= minimumMastery);
};

/**
 * Student-facing sentence for one recommendation. Reason codes exist so this
 * can be generated reliably rather than written per screen.
 */
export const explainForStudent = (row) => {
  if (!row) return '';
  if (row.status === STATUS.REQUIRED) return 'Your teacher assigned this.';
  if (row.status === STATUS.REMEDIATION) return 'Strengthening this will help with a skill you recently found difficult.';
  if (row.status === STATUS.EXTENSION) return "Challenge available because you've mastered what comes before it.";
  if (row.status === STATUS.LOCKED) return 'This needs an earlier skill first.';
  if (row.status === STATUS.FUTURE) return 'This skill is not in your learning window yet.';
  if (row.reasons.includes(REASON.TEACHER_PRIORITY)) return 'Your teacher marked this as a priority.';

  // With a real calendar the countdown is the most useful thing to say, and it
  // comes from the provider rather than being written into a screen. Students
  // see calendar days because that is how they think about "next week"; the
  // engine keeps instructional days for its own arithmetic.
  if (row.calendarTiming === 'upcoming') {
    const days = Math.max(0, Number(row.calendarDaysUntilStart) || 0);
    if (days > 0) return `You're ready early — your class reaches this in ${days} day${days === 1 ? '' : 's'}.`;
    return "You're ready early — your class reaches this shortly.";
  }
  if (row.reasons.includes(REASON.ALIGNED_CURRENT)) return 'Your class is working on this now.';
  if (row.reasons.includes(REASON.REVIEW_WINDOW)) return 'Your class has already covered this. Strengthening it is worthwhile.';
  return 'This is a good option right now.';
};

export const resolveRemediationSkill = (skillId) => resolveSkillAnywhere(skillId);
