// Assignment adaptation — three modes, and the lines none of them cross.
//
// The platform already had two delivery modes with one confusing name between
// them: `variantMode: 'shared' | 'personalized'`. "Personalized" meant *the
// numbers differ*, which is a real and useful thing, but it is not
// personalisation in any instructional sense — every student still got the same
// task at the same complexity. There was no way to express "same standard,
// pitched where this student actually is".
//
// So there are three modes, and the distinction between them is exactly what
// varies:
//
//   SHARED    everyone gets the same question instance.
//   VARIANT   same standard, same DOK, same difficulty — different numbers.
//   ADAPTIVE  same standard, and MathMaster may move family, difficulty, DOK
//             and context INSIDE bounds the author or teacher set.
//
// `'personalized'` maps to VARIANT, which is what it always meant, so every
// assignment written before this file keeps behaving exactly as it did.
//
// ------------------------------------------------------------------------
// THE THREE THINGS ADAPTATION MUST NEVER DO
//
// 1. CHANGE THE ASSIGNED STANDARD. A teacher assigning A.5C has made a
//    curricular decision. Adaptation pitches that standard differently; it does
//    not quietly substitute another one. This is not a configurable policy —
//    `preserveStandard` cannot be turned off for an assignment.
//
// 2. SECRETLY LEVEL AN ASSESSMENT. If a DOL, quiz or test is easier for one
//    student than another and nobody said so, the grades from it are not
//    comparable and the teacher does not know. Assessment roles collapse to the
//    assigned rigor unless a teacher has explicitly designed differentiated
//    assessment and said so.
//
// 3. SEND A STUDENT BELOW THE COURSE INSIDE AN ASSIGNMENT. Foundation Bridge
//    work is right, and it belongs in the Path where it is framed as a route
//    back. Inside an assignment it silently converts the teacher's grade-level
//    task into grade 6 work.
//
// Pure. No Firestore, no clock.

import { AUTHORED_CEILING } from '../path/recommendationV2.js';

/** How much of a question may vary between two students. */
export const VARIATION_MODE = Object.freeze({
  SHARED: 'shared',
  VARIANT: 'variant',
  ADAPTIVE: 'adaptive',
});

export const VARIATION_MODE_LABEL = Object.freeze({
  [VARIATION_MODE.SHARED]: 'Same question for everyone',
  [VARIATION_MODE.VARIANT]: 'Same task, different numbers',
  [VARIATION_MODE.ADAPTIVE]: 'Same standard, pitched to the student',
});

export const VARIATION_MODE_DETAIL = Object.freeze({
  [VARIATION_MODE.SHARED]: 'Every student sees the identical question instance. Use when you want to discuss one specific problem as a class.',
  [VARIATION_MODE.VARIANT]: 'Same standard, same depth, same complexity — only the numbers and context change. Discourages copying without changing what is being asked.',
  [VARIATION_MODE.ADAPTIVE]: 'Same standard you assigned. MathMaster may adjust complexity and depth inside the bounds set here, using what the student has actually shown.',
});

/**
 * The legacy vocabulary, mapped once.
 *
 * `'personalized'` is the old name for VARIANT and is still written by existing
 * assignments and by the authoring contract. It resolves here rather than in
 * eight call sites, and an unknown value falls back to VARIANT — the historical
 * default — rather than to ADAPTIVE, because silently upgrading an old
 * assignment into an adaptive one is precisely the kind of change a teacher did
 * not ask for.
 */
export const normalizeVariationMode = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === VARIATION_MODE.SHARED) return VARIATION_MODE.SHARED;
  if (value === VARIATION_MODE.ADAPTIVE) return VARIATION_MODE.ADAPTIVE;
  // 'personalized', 'variant', anything unrecognised, and absent.
  return VARIATION_MODE.VARIANT;
};

/** True when an authored/legacy value already named a mode we understand. */
export const isKnownVariationMode = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  return ['shared', 'personalized', 'variant', 'adaptive'].includes(value);
};

/**
 * ACTIVITY ROLES, GROUPED BY HOW MUCH ADAPTATION EACH CAN BEAR.
 *
 * These are instructional judgements, not preferences:
 *
 *   PRACTICE      the student is building fluency alone. This is where
 *                 adaptation does the most good and the least harm.
 *   INSTRUCTION   the teacher is modelling. If every screen shows different
 *                 mathematics the lesson stops being coherent.
 *   ASSESSMENT    the point is comparable evidence. Levelling it destroys that.
 */
const ROLE_GROUP = Object.freeze({
  PRACTICE: 'practice',
  INSTRUCTION: 'instruction',
  ASSESSMENT: 'assessment',
});

const ROLE_GROUPS = Object.freeze({
  practice: ROLE_GROUP.PRACTICE,
  independentpractice: ROLE_GROUP.PRACTICE,
  intervention: ROLE_GROUP.PRACTICE,
  extension: ROLE_GROUP.PRACTICE,

  warmup: ROLE_GROUP.INSTRUCTION,
  classwork: ROLE_GROUP.INSTRUCTION,
  notesclasswork: ROLE_GROUP.INSTRUCTION,
  guidedpractice: ROLE_GROUP.INSTRUCTION,
  instruction: ROLE_GROUP.INSTRUCTION,
  prerequisite: ROLE_GROUP.INSTRUCTION,

  dol: ROLE_GROUP.ASSESSMENT,
  formative: ROLE_GROUP.ASSESSMENT,
  assessment: ROLE_GROUP.ASSESSMENT,
  quiz: ROLE_GROUP.ASSESSMENT,
  test: ROLE_GROUP.ASSESSMENT,
});

export const roleGroupFor = (activityRole) => (
  ROLE_GROUPS[String(activityRole || '').trim().toLowerCase()] || ROLE_GROUP.PRACTICE
);

export { ROLE_GROUP };

/**
 * What each kind of work adapts by DEFAULT, with no teacher configuration.
 *
 * "Teachers should not have to remember to enable useful personalization every
 * time." The corollary is that the defaults have to be right, because they are
 * what almost every assignment will actually use.
 *
 * `bandSpread` and `dokSpread` are how far from the ASSIGNED value adaptation
 * may move, in each direction, before the authored envelope is even consulted.
 */
export const ROLE_DEFAULTS = Object.freeze({
  [ROLE_GROUP.PRACTICE]: {
    enabled: true,
    bandSpread: 1,
    dokSpread: 1,
    // Below-course work belongs in the Path, where the student is told it is a
    // route back to the thing they were doing. Inside an assignment it just
    // replaces the teacher's task.
    allowFoundationBridge: false,
    allowCcmrTransfer: false,
  },
  [ROLE_GROUP.INSTRUCTION]: {
    enabled: true,
    // One band of give, and no change of cognitive demand: a warm-up or a
    // guided example has to stay the same task the teacher is talking about.
    bandSpread: 1,
    dokSpread: 0,
    allowFoundationBridge: false,
    allowCcmrTransfer: false,
  },
  [ROLE_GROUP.ASSESSMENT]: {
    // Not "adapt a little". Assessment rigor does not move per student unless a
    // teacher deliberately designed it to.
    enabled: false,
    bandSpread: 0,
    dokSpread: 0,
    allowFoundationBridge: false,
    allowCcmrTransfer: false,
  },
});

/** Honors practice may additionally reach for exam-style transfer. */
export const honorsAdjustment = (group) => (
  group === ROLE_GROUP.PRACTICE ? { allowCcmrTransfer: true } : {}
);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const intOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};

/**
 * A range that an author or teacher may narrow but never widen past what the
 * content can actually serve.
 */
const normalizeRange = (raw, { assigned, spread, min, max }) => {
  const fallback = [clamp(assigned - spread, min, max), clamp(assigned + spread, min, max)];
  if (!Array.isArray(raw) || raw.length !== 2) return fallback;
  const low = intOr(raw[0], fallback[0]);
  const high = intOr(raw[1], fallback[1]);
  if (low > high) return fallback;
  return [clamp(low, min, max), clamp(high, min, max)];
};

/**
 * The adaptive envelope for one question: what may move, and how far.
 *
 * Resolution order is deliberate — role defaults first, then the author's
 * declared policy, then the teacher's own setting. Each layer may only be as
 * permissive as the layer above allows, EXCEPT the explicit
 * `differentiatedAssessment` flag, which is the one way a teacher can open up
 * an assessment and which requires them to have said so out loud.
 */
export const resolveAdaptivePolicy = ({
  question = null,
  activityRole = null,
  variationMode = null,
  honors = false,
  teacherPolicy = null,
} = {}) => {
  const role = activityRole || question?.activityRole || question?.purpose || 'practice';
  const group = roleGroupFor(role);
  const mode = normalizeVariationMode(variationMode ?? question?.variantMode);

  const assignedDok = clamp(intOr(question?.dok, 2), 1, AUTHORED_CEILING.dok);
  const assignedBand = clamp(intOr(question?.difficultyBand, 3), 1, AUTHORED_CEILING.difficultyBand);

  const base = { ...ROLE_DEFAULTS[group], ...(honors ? honorsAdjustment(group) : {}) };
  const authored = question?.adaptivePolicy || null;
  const teacher = teacherPolicy || null;

  // Only ADAPTIVE mode adapts. SHARED and VARIANT keep the assigned rigor by
  // definition — that is what distinguishes them.
  let enabled = mode === VARIATION_MODE.ADAPTIVE && base.enabled;

  // The one deliberate opening. A teacher who has designed a differentiated
  // assessment says so explicitly; nothing infers it.
  const differentiated = Boolean(teacher?.differentiatedAssessment);
  if (group === ROLE_GROUP.ASSESSMENT && mode === VARIATION_MODE.ADAPTIVE && differentiated) {
    enabled = true;
  }

  // An author may switch adaptation off for a question that genuinely cannot
  // bear it, and a teacher may switch it off for their class. Neither can
  // switch it ON where the role forbids it.
  if (authored && authored.enabled === false) enabled = false;
  if (teacher && teacher.enabled === false) enabled = false;

  const bandSpread = group === ROLE_GROUP.ASSESSMENT && !differentiated ? 0 : base.bandSpread;
  const dokSpread = group === ROLE_GROUP.ASSESSMENT && !differentiated ? 0 : base.dokSpread;

  const difficultyRange = normalizeRange(authored?.difficultyRange, {
    assigned: assignedBand, spread: bandSpread, min: 1, max: AUTHORED_CEILING.difficultyBand,
  });
  const dokRange = normalizeRange(authored?.dokRange, {
    assigned: assignedDok, spread: dokSpread, min: 1, max: AUTHORED_CEILING.dok,
  });

  return {
    mode,
    activityRole: role,
    roleGroup: group,
    enabled,
    assignedDok,
    assignedBand,
    difficultyRange,
    dokRange,
    // Never optional, and never read from configuration. An assignment names a
    // standard; adaptation pitches it, it does not replace it.
    preserveStandard: true,
    allowFoundationBridge: false,
    allowCcmrTransfer: Boolean(base.allowCcmrTransfer && authored?.allowCcmrTransfer !== false),
    differentiatedAssessment: differentiated,
  };
};

/**
 * What this student should actually get, and the record of why.
 *
 * Returns the assigned values unchanged whenever adaptation is off, so a caller
 * never has to branch. `adapted` says whether anything moved, and `reason` is
 * written for a teacher rather than for a log.
 */
export const resolveAdaptedTarget = ({
  question = null,
  profile = null,
  activityRole = null,
  variationMode = null,
  honors = false,
  teacherPolicy = null,
  recentFailureBand = null,
} = {}) => {
  const policy = resolveAdaptivePolicy({ question, activityRole, variationMode, honors, teacherPolicy });
  const { assignedDok, assignedBand } = policy;

  const unchanged = (reason) => ({
    dok: assignedDok,
    difficultyBand: assignedBand,
    assignedDok,
    assignedBand,
    adapted: false,
    reason,
    policy,
  });

  if (!policy.enabled) {
    if (policy.roleGroup === ROLE_GROUP.ASSESSMENT) {
      return unchanged('assessment_rigor_is_the_same_for_every_student');
    }
    if (policy.mode === VARIATION_MODE.SHARED) return unchanged('shared_question');
    if (policy.mode === VARIATION_MODE.VARIANT) return unchanged('same_task_different_numbers');
    return unchanged('adaptation_turned_off_for_this_question');
  }

  // Nothing to adapt FROM. A student the platform has not yet learned anything
  // about gets exactly what the teacher assigned, which is the right default
  // and not a failure.
  if (!profile?.baseline?.established) {
    return unchanged('not_enough_evidence_to_adapt_yet');
  }

  const stable = profile.difficultyProfile?.stableBand ?? null;
  if (stable == null) {
    // Below level, holding at no band. Pitch to the bottom of the envelope
    // rather than guessing a number that has no evidence behind it.
    const band = policy.difficultyRange[0];
    return {
      dok: clamp(assignedDok, policy.dokRange[0], policy.dokRange[1]),
      difficultyBand: band,
      assignedDok,
      assignedBand,
      adapted: band !== assignedBand,
      reason: 'not_yet_holding_at_any_complexity',
      policy,
    };
  }

  // A recent miss ABOVE where the student is stable is a complexity signal —
  // the same rule the Path uses. Answer it inside the assignment's envelope
  // rather than concluding anything about the standard.
  let band = stable;
  let reason = 'pitched_to_this_student_s_working_complexity';
  if (recentFailureBand != null && recentFailureBand > stable) {
    band = stable;
    reason = 'recent_miss_at_higher_complexity_on_this_standard';
  }

  const dok3 = profile.dokProfile?.['3'];
  const readyForDepth = Boolean(dok3?.confident && dok3.accuracy >= 0.7);
  let dok = readyForDepth ? Math.max(assignedDok, policy.dokRange[1]) : assignedDok;
  if (readyForDepth && dok > assignedDok) reason = 'reasoning_evidence_supports_more_depth';

  // THE ENVELOPE IS THE LAST WORD. Whatever the profile suggests, the result
  // stays inside what the author and teacher permitted — and inside what the
  // content bank can actually serve.
  band = clamp(band, policy.difficultyRange[0], policy.difficultyRange[1]);
  dok = clamp(dok, policy.dokRange[0], policy.dokRange[1]);

  const adapted = band !== assignedBand || dok !== assignedDok;
  return {
    dok,
    difficultyBand: band,
    assignedDok,
    assignedBand,
    adapted,
    reason: adapted ? reason : 'this_student_is_already_at_the_assigned_level',
    policy,
  };
};

const REASON_TEXT = Object.freeze({
  assessment_rigor_is_the_same_for_every_student: 'Assessment — same rigor for every student.',
  shared_question: 'Shared question — everyone saw this exact item.',
  same_task_different_numbers: 'Same task, different numbers.',
  adaptation_turned_off_for_this_question: 'Adaptation is off for this question.',
  not_enough_evidence_to_adapt_yet: 'Not enough evidence about this student yet — they got what you assigned.',
  this_student_is_already_at_the_assigned_level: 'This student is already working at the assigned level.',
  not_yet_holding_at_any_complexity: 'Not yet holding at any complexity — pitched to the most accessible version you allowed.',
  pitched_to_this_student_s_working_complexity: 'Pitched to the complexity this student is currently holding.',
  recent_miss_at_higher_complexity_on_this_standard: 'Recent miss on this standard at a higher complexity — retried lower before concluding anything.',
  reasoning_evidence_supports_more_depth: 'Strong reasoning evidence — same complexity, more demanding thinking.',
});

/**
 * One line a teacher can read on a results screen.
 *
 * "If two students receive different adaptive Practice, the teacher must be
 * able to see why." Not a log line, and not a score: a sentence.
 */
export const describeAdaptation = (target) => {
  if (!target) return '';
  const text = REASON_TEXT[target.reason] || String(target.reason || '').replace(/_/g, ' ');
  if (!target.adapted) return text;
  return `Assigned DOK ${target.assignedDok} · Band ${target.assignedBand} → received DOK ${target.dok} · Band ${target.difficultyBand}. ${text}`;
};

/**
 * The record stored alongside a delivered question, so the reason survives long
 * after the session that produced it.
 */
export const adaptationRecord = ({ target, teksCode = null, studentId = null }) => {
  if (!target) return null;
  return {
    studentId,
    teksCode,
    assignedDok: target.assignedDok,
    assignedBand: target.assignedBand,
    deliveredDok: target.dok,
    deliveredBand: target.difficultyBand,
    adapted: target.adapted,
    reasonCode: target.reason,
    reason: describeAdaptation(target),
    mode: target.policy?.mode || null,
    activityRole: target.policy?.activityRole || null,
    // The standard is asserted, not derived, so a reader never has to trust
    // that nothing swapped it.
    standardPreserved: true,
  };
};

/**
 * WHAT THE STUDENT ACTUALLY RECEIVED — the single source of truth.
 *
 * THE BUG THIS EXISTS TO CLOSE. The evidence event for an assignment question
 * read its DOK and difficulty from the QUESTION TEMPLATE. But the template is
 * not what the student answered: `applyAdaptiveDifferentiation` could already
 * swap in a different band's content, and adaptive assignments now move the band
 * deliberately. So a student could answer a Band 2 version and have Band 3
 * recorded — and since those events are the input to every mastery profile,
 * every DOK and difficulty conclusion downstream was drawn from what the
 * question CLAIMED rather than from what was delivered.
 *
 * Both the generator and the evidence writer call this, so the two cannot
 * disagree. It is pure and deterministic in its inputs, which is what lets the
 * evidence writer recompute it at grade time rather than threading the rendered
 * instance back up through the component tree.
 */
export const resolveDeliveredQuestionMetadata = ({
  question = null,
  learningProfile = null,
  activityRole = null,
  variationMode = null,
  honors = false,
  teacherPolicy = null,
  recentFailureBand = null,
} = {}) => {
  const target = resolveAdaptedTarget({
    question, profile: learningProfile, activityRole, variationMode, honors, teacherPolicy, recentFailureBand,
  });
  return {
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    adapted: target.adapted,
    // THE EXPLANATION, CARRIED WITH THE DELIVERY.
    //
    // The evidence writer reads `delivered.reason` and stores it on the event,
    // and this resolver never returned one — so every adapted assignment
    // question in the database recorded `adaptation.reason: null`. The engine
    // knew why it moved the rigor, the field to hold that answer existed, and
    // the two were never connected. A teacher opening the adaptation report saw
    // that something changed and nothing about why, which is the "AI
    // recommended" opacity the design explicitly forbids.
    reasonCode: target.reason,
    reason: describeAdaptation(target),
    target,
  };
};

export default resolveAdaptedTarget;
