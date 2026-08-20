// What one standard's Path content actually amounts to.
//
// The coverage index answers "can the server issue a question here?". That is a
// necessary question and it is not the interesting one: 97 standards answered
// yes while every single item was a text box asking for a letter. This module
// answers the question a teacher is really asking — "is this finished?" — and
// answers it in five states rather than two, because those five need five
// different pieces of work:
//
//   none              nobody has authored anything
//   authoredUnusable  content exists and the server cannot issue it
//   minimumOperational issuable, but placeholders: no interactions, no reviews
//   candidate         real content, still missing something specific
//   productionReady   enough polished, genuinely varied families for a session
//
// A five-question session is the unit. `productionReady` therefore means five
// production-quality families that do not repeat a representation or a task
// type — not five items that happen to exist.

import {
  QUESTION_QUALITY,
  auditPathQuestionQuality,
  detectDuplicateFamilies,
} from './pathQuestionQuality.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

export const SESSION_QUESTION_COUNT = 5;

/** A session's worth of polished families. */
export const PRODUCTION_FAMILIES_REQUIRED = SESSION_QUESTION_COUNT;

/**
 * How many genuinely different things a session should ask.
 *
 * Three, not five: some standards honestly only support two or three
 * representations, and demanding five would push authors into inventing a
 * contrived graph for a factoring question.
 */
export const DISTINCT_REPRESENTATIONS_REQUIRED = 3;
export const DISTINCT_TASK_TYPES_REQUIRED = 3;

/** Difficulty and depth both have to move across a session. */
export const DISTINCT_BANDS_REQUIRED = 2;
export const DISTINCT_DOK_REQUIRED = 2;

export const CONTENT_STATE = Object.freeze({
  NONE: 'none',
  AUTHORED_UNUSABLE: 'authoredUnusable',
  MINIMUM_OPERATIONAL: 'minimumOperational',
  CANDIDATE: 'candidate',
  PRODUCTION_READY: 'productionReady',
});

export const CONTENT_STATE_LABELS = Object.freeze({
  [CONTENT_STATE.NONE]: 'No content',
  [CONTENT_STATE.AUTHORED_UNUSABLE]: 'Authored but not issuable',
  [CONTENT_STATE.MINIMUM_OPERATIONAL]: 'Operational placeholders',
  [CONTENT_STATE.CANDIDATE]: 'Candidate content',
  [CONTENT_STATE.PRODUCTION_READY]: 'Production quality',
});

/** Ordered worst to best, so a course summary can be sorted meaningfully. */
export const CONTENT_STATE_ORDER = Object.freeze([
  CONTENT_STATE.NONE,
  CONTENT_STATE.AUTHORED_UNUSABLE,
  CONTENT_STATE.MINIMUM_OPERATIONAL,
  CONTENT_STATE.CANDIDATE,
  CONTENT_STATE.PRODUCTION_READY,
]);

const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))];

/**
 * Analyse one standard.
 *
 * @param items  the bank records aligned to this standard
 * @param plans  `buildIssuePlan` results by bank id — the SAME issuability
 *               check the runtime runs, passed in rather than recomputed so
 *               the two definitions cannot drift
 */
export const analyzeStandardContent = ({ displayCode = '', items = [], plans = {} } = {}) => {
  const active = list(items).filter((item) => item?.active !== false);
  const issuable = [];
  const unusable = [];

  active.forEach((item) => {
    const plan = plans[item.id];
    if (plan?.issuable) issuable.push(item);
    else unusable.push({ id: item.id, reason: plan?.reason || 'not_evaluated' });
  });

  const audits = issuable.map((item) => ({ item, audit: auditPathQuestionQuality(item) }));
  const production = audits.filter((entry) => entry.audit.level === QUESTION_QUALITY.PRODUCTION);
  const candidate = audits.filter((entry) => entry.audit.level === QUESTION_QUALITY.CANDIDATE);
  const operational = audits.filter((entry) => entry.audit.level === QUESTION_QUALITY.OPERATIONAL);
  const blockedButIssuable = audits.filter((entry) => entry.audit.level === QUESTION_QUALITY.BLOCKED);

  const representations = unique(audits.map((entry) => entry.audit.representation));
  const interactions = unique(audits.map((entry) => entry.audit.interaction));
  const taskTypes = unique(audits.map((entry) => entry.audit.taskType));
  const bands = unique(audits.map((entry) => entry.audit.difficultyBand)).sort((a, b) => a - b);
  const dokLevels = unique(audits.map((entry) => entry.audit.dok)).sort((a, b) => a - b);
  const withSolutionReview = audits.filter((entry) => entry.audit.hasSolutionReview).length;
  const withTool = audits.filter((entry) => entry.audit.usesTool).length;
  const duplicates = detectDuplicateFamilies(issuable);

  // Representations and task types measured over the POLISHED families, because
  // variety supplied only by placeholder items is variety a student will not
  // actually meet once the selector prefers production content.
  const productionRepresentations = unique(production.map((entry) => entry.audit.representation));
  const productionTaskTypes = unique(production.map((entry) => entry.audit.taskType));

  const blockers = [];
  const warnings = [];

  if (!active.length) blockers.push('No content has been authored for this standard.');
  else if (!issuable.length) {
    blockers.push(`All ${active.length} authored item(s) fail the server issue check: ${unique(unusable.map((entry) => entry.reason)).join(', ')}.`);
  } else if (issuable.length < SESSION_QUESTION_COUNT) {
    blockers.push(`Only ${issuable.length} of the ${SESSION_QUESTION_COUNT} families a session needs can be issued.`);
  }

  if (issuable.length && production.length < PRODUCTION_FAMILIES_REQUIRED) {
    warnings.push(`${production.length} of ${PRODUCTION_FAMILIES_REQUIRED} families are production quality.`);
  }
  if (issuable.length && withSolutionReview < issuable.length) {
    warnings.push(`${issuable.length - withSolutionReview} issuable item(s) have no solution review.`);
  }
  if (issuable.length && productionRepresentations.length < DISTINCT_REPRESENTATIONS_REQUIRED) {
    warnings.push(`Polished content covers ${productionRepresentations.length} representation(s); a session should span at least ${DISTINCT_REPRESENTATIONS_REQUIRED}.`);
  }
  if (issuable.length && productionTaskTypes.length < DISTINCT_TASK_TYPES_REQUIRED) {
    warnings.push(`Polished content covers ${productionTaskTypes.length} kind(s) of thinking; a session should span at least ${DISTINCT_TASK_TYPES_REQUIRED}.`);
  }
  if (issuable.length && bands.length < DISTINCT_BANDS_REQUIRED) {
    warnings.push('Every item sits at one difficulty band.');
  }
  if (issuable.length && dokLevels.length < DISTINCT_DOK_REQUIRED) {
    warnings.push('Every item sits at one DOK level.');
  }
  duplicates.forEach((entry) => {
    warnings.push(`${entry.count} families ask the same task in the same way (${entry.ids.join(', ')}).`);
  });
  blockedButIssuable.forEach((entry) => {
    const first = entry.audit.blockers[0];
    warnings.push(`${entry.item.id}: ${first ? first.message : 'fails the question quality audit.'}`);
  });

  let state = CONTENT_STATE.NONE;
  if (!active.length) state = CONTENT_STATE.NONE;
  else if (!issuable.length) state = CONTENT_STATE.AUTHORED_UNUSABLE;
  else if (
    production.length >= PRODUCTION_FAMILIES_REQUIRED
    && productionRepresentations.length >= DISTINCT_REPRESENTATIONS_REQUIRED
    && productionTaskTypes.length >= DISTINCT_TASK_TYPES_REQUIRED
    && bands.length >= DISTINCT_BANDS_REQUIRED
    && dokLevels.length >= DISTINCT_DOK_REQUIRED
    && !duplicates.length
  ) {
    state = CONTENT_STATE.PRODUCTION_READY;
  } else if (production.length + candidate.length >= 1 && operational.length < issuable.length) {
    state = CONTENT_STATE.CANDIDATE;
  } else {
    state = CONTENT_STATE.MINIMUM_OPERATIONAL;
  }

  return {
    displayCode,
    state,
    stateLabel: CONTENT_STATE_LABELS[state],
    authoredCount: list(items).length,
    activeCount: active.length,
    issuableCount: issuable.length,
    productionCount: production.length,
    candidateCount: candidate.length,
    operationalCount: operational.length,
    qualityBlockedCount: blockedButIssuable.length,
    representations,
    productionRepresentations,
    interactions,
    taskTypes,
    productionTaskTypes,
    bands,
    dokLevels,
    solutionReviewCount: withSolutionReview,
    toolBackedCount: withTool,
    duplicateFamilies: duplicates,
    unusable: unusable.slice(0, 25),
    blockers,
    warnings,
    // The gate a student surface consults: can a session actually run here?
    studentReady: issuable.length >= SESSION_QUESTION_COUNT,
  };
};

/** A one-line summary for a course. */
export const summarizeStandardStates = (records = []) => {
  const counts = Object.fromEntries(CONTENT_STATE_ORDER.map((state) => [state, 0]));
  list(records).forEach((record) => {
    if (counts[record?.state] !== undefined) counts[record.state] += 1;
  });
  return {
    ...counts,
    total: list(records).length,
    productionReadyPercent: list(records).length
      ? Math.round((counts[CONTENT_STATE.PRODUCTION_READY] / list(records).length) * 100)
      : 0,
  };
};

export default analyzeStandardContent;
