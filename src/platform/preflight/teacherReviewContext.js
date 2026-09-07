import { teacherFlagNeedsReview } from './assignmentAuthoringState.js';

/*
 * WHAT THE TEACHER SAID ABOUT A QUESTION, KEPT WHERE THE REPAIR CAN SEE IT.
 *
 * A teacher who reviews an assignment knows things no validator does: that a
 * graph gives away the intercepts, that Classwork should stay more guided than
 * Practice, that this question must not become multiple choice. Those notes are
 * worth more than any diagnostic, and they are exactly what gets lost when a
 * question is handed to an AI for repair and comes back "fixed" in a way that
 * throws away the point the teacher was making.
 *
 * So flags live against the IMMUTABLE question id rather than a position. A
 * repaired question keeps its id, which means it keeps its history: reordering
 * a section, or replacing question 4's content entirely, does not silently move
 * a teacher's note onto a different question.
 *
 * FLAGS INHERIT DOWNWARD, NEVER SIDEWAYS. A question is governed by what the
 * teacher said about the assignment, about its section, and about that question
 * — and by nothing said about a different question. Repairing question 4 must
 * not be constrained by a note attached to question 7, which is how a
 * one-question repair quietly turns into a rewrite of the lesson.
 *
 * AI REPAIR NEVER CLOSES A TEACHER FLAG. An import can say "the revision that
 * may have addressed this was 13"; only a person can say it is fixed. That is
 * the whole reason markTeacherFlagPotentiallyAddressed() exists as something
 * separate from resolveTeacherReviewFlag(): a system that lets the repair mark
 * its own homework will report every teacher concern resolved and show the
 * teacher nothing to verify.
 */

export const REVIEW_FLAG_SCOPES = Object.freeze({
  ASSIGNMENT: 'assignment',
  SECTION: 'section',
  QUESTION: 'question',
});

// Broadest first. A repair reads these as rules to honour, and the useful
// reading order is the lesson, then the section, then this question. Ordering
// by scope rather than by when each note was typed keeps that shape stable no
// matter what order the teacher happened to raise them in.
const SCOPE_ORDER = [
  REVIEW_FLAG_SCOPES.ASSIGNMENT,
  REVIEW_FLAG_SCOPES.SECTION,
  REVIEW_FLAG_SCOPES.QUESTION,
];

const SCOPES = new Set(SCOPE_ORDER);

// 'open' plus the resolved vocabulary assignmentAuthoringState.js already
// recognises. Kept in one place so a status this module accepts can never be a
// status teacherFlagNeedsReview() fails to understand.
const SETTABLE_STATUSES = new Set(['open', 'fixed', 'resolved', 'dismissed', 'closed']);

const text = (value) => String(value ?? '').trim();
const scopeOf = (flag) => text(flag?.scope).toLowerCase();

export const emptyTeacherReviewContext = () => ({ flags: [] });

// Spread first: the review context grows over time (Step 6 adds diagnostic
// overrides beside the flags), and a normaliser that rebuilds it from a fixed
// shape silently drops whatever it has not been taught about. Adding a flag
// must never delete a teacher's override.
const normalizeContext = (context) => ({
  ...(context && typeof context === 'object' ? context : {}),
  flags: Array.isArray(context?.flags) ? context.flags : [],
});

const generatedFlagId = () => `flag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Record a teacher flag. Returns a new context; the input is never mutated, so
 * a caller holding the previous context still holds what it had.
 *
 * A section or question flag without a target is rejected rather than stored:
 * an untargeted section flag would inherit into every question in the
 * assignment, which is the opposite of what the teacher asked for.
 */
export const addTeacherReviewFlag = (context, flag = {}, options = {}) => {
  const scope = scopeOf(flag);
  if (!SCOPES.has(scope)) {
    throw new Error(`A teacher review flag needs a scope of assignment, section, or question (received "${flag?.scope}").`);
  }

  const targetId = text(flag.targetId) || null;
  if (scope !== REVIEW_FLAG_SCOPES.ASSIGNMENT && !targetId) {
    throw new Error(`A ${scope} review flag needs the id of the ${scope} it belongs to.`);
  }

  const timestamp = text(options.nowIso) || new Date().toISOString();
  const revision = Number.isFinite(Number(options.assignmentRevision))
    ? Number(options.assignmentRevision)
    : null;

  const recorded = {
    id: text(options.flagId) || generatedFlagId(),
    scope,
    targetId: scope === REVIEW_FLAG_SCOPES.ASSIGNMENT ? null : targetId,
    category: text(flag.category) || 'general',
    severity: text(flag.severity) || 'needsEditing',
    note: text(flag.note),
    status: 'open',
    assignmentRevision: revision,
    potentiallyAddressedByRevision: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const current = normalizeContext(context);
  return { ...current, flags: [...current.flags, recorded] };
};

/** Every flag that governs one question: its own, its section's, the assignment's. */
export const reviewContextForQuestion = (context, { sectionId = null, questionId = null } = {}) => {
  const section = text(sectionId);
  const question = text(questionId);

  return normalizeContext(context).flags
    .filter((flag) => {
      const scope = scopeOf(flag);
      if (scope === REVIEW_FLAG_SCOPES.ASSIGNMENT) return true;
      if (scope === REVIEW_FLAG_SCOPES.SECTION) return Boolean(section) && text(flag.targetId) === section;
      if (scope === REVIEW_FLAG_SCOPES.QUESTION) return Boolean(question) && text(flag.targetId) === question;
      return false;
    })
    // Stable within a scope: Array.prototype.sort keeps insertion order for
    // equal keys, so two question flags stay in the order the teacher raised
    // them while still sitting below the section note that governs both.
    .sort((left, right) => SCOPE_ORDER.indexOf(scopeOf(left)) - SCOPE_ORDER.indexOf(scopeOf(right)));
};

/**
 * The subset of that context a repair must honour.
 *
 * A flag with no note constrains nothing, and a flag the teacher has already
 * closed is history rather than a requirement — sending either to a repair adds
 * noise that competes with the constraints that do matter. A flag an import
 * merely marked as potentially addressed is still open, so it still constrains:
 * nobody has verified it yet.
 */
export const teacherRepairConstraintsForQuestion = (context, target = {}) => (
  reviewContextForQuestion(context, target).filter((flag) => flag.note && teacherFlagNeedsReview(flag))
);

const updateFlag = (context, flagId, update) => {
  const id = text(flagId);
  const current = normalizeContext(context);
  const index = current.flags.findIndex((flag) => text(flag.id) === id);
  if (index === -1) throw new Error(`No teacher review flag with id "${flagId}" exists on this assignment.`);

  const flags = [...current.flags];
  flags[index] = { ...flags[index], ...update };
  return { ...current, flags };
};

/**
 * Record that a repair MIGHT have addressed a flag. Deliberately leaves the
 * status open: the flag came from a person, and only a person closes it.
 */
export const markTeacherFlagPotentiallyAddressed = (context, flagId, options = {}) => {
  const revision = Number.isFinite(Number(options.assignmentRevision))
    ? Number(options.assignmentRevision)
    : null;
  return updateFlag(context, flagId, {
    potentiallyAddressedByRevision: revision,
    updatedAt: text(options.nowIso) || new Date().toISOString(),
  });
};

/** The teacher's verdict on a flag. This is the only way a flag stops being open. */
export const resolveTeacherReviewFlag = (context, flagId, options = {}) => {
  const status = text(options.status).toLowerCase();
  if (!SETTABLE_STATUSES.has(status)) {
    throw new Error(`"${options.status}" is not a teacher review flag status.`);
  }
  return updateFlag(context, flagId, {
    status,
    updatedAt: text(options.nowIso) || new Date().toISOString(),
  });
};

export default {
  REVIEW_FLAG_SCOPES,
  addTeacherReviewFlag,
  emptyTeacherReviewContext,
  markTeacherFlagPotentiallyAddressed,
  resolveTeacherReviewFlag,
  reviewContextForQuestion,
  teacherRepairConstraintsForQuestion,
};
