/*
 * A RECOVERY, AS THE TEACHER AUDITS IT.
 *
 * One row per Warm-Up/DOL section that has a Recovery record: what the
 * original scored, what the Recovery scored, what was recorded and why, and
 * the Practice evidence that unlocked it. Read from the same projection every
 * grade surface uses (sectionRecoveryGrades.js), applied to the tracker after
 * teacher per-question overrides — so the Original shown is the original the
 * Recovery was actually compared against.
 *
 * Nothing here is shown for a student who never started Practice-based
 * Recovery, so the gradebook stays exactly as uncluttered as it was.
 */

import { itemStatusOf, normalizeRecoveryRecord, recoveryEvidenceItem } from '../../../functions/shared/sectionRecoveryRecord.mjs';
import { RECOVERY_TYPE } from '../../../functions/shared/recoveryPolicy.mjs';
import {
  RECOVERY_HOLD_REASON,
  RECOVERY_ITEM_STATUS,
  isGradedItemStatus,
  isLegacyUnavailableResult,
  itemSkillKey,
  itemWeight,
  recoveryAwaitsReplacementAnswer,
  scoreRecoveryEvidence,
} from '../../../functions/shared/sectionRecoveryEvidence.mjs';
import {
  heldRecoveryActionsFor,
  legacyUnavailableItemIds,
  recoveryNeedsLegacyCorrection,
} from '../../../functions/shared/sectionRecoveryResolution.mjs';
import { listPlatformQuestionFamilies } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { projectSectionRecoveryForAssignment } from '../grading/sectionRecoveryGrades.js';
import { splitGradesBySection } from '../teacher/gradeEvidence.js';
import { SCHOOL_TIME_ZONE, assignmentFinalCloseAt } from '../../../functions/shared/sectionDeadline.mjs';
import { buildWarmupChallengeGradeState, warmupChallengeScore } from '../../../functions/shared/warmupChallengeGrade.mjs';

export const SECTION_RECOVERY_AUDIT_LABEL = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

const STATUS_LABEL = Object.freeze({
  practicing: 'Practicing',
  unlocked: 'Unlocked',
  inProgress: 'In progress',
  completed: 'Completed',
  held: 'Held for review — MathMaster could not grade one or more questions',
});

/*
 * WHAT A TEACHER NEEDS TO ACT ON A RECOVERY MATHMASTER COULD NOT GRADE.
 *
 * Per question: which one (Recovery question n, from DOL Qn), what happened
 * to it, and — for a question MathMaster could not grade — why, in plain
 * words (PR #430's classifications). Never the pin, the fingerprint, the
 * generated numbers, the answer key or the student's raw answer.
 */
const ITEM_STATUS_LABEL = Object.freeze({
  [RECOVERY_ITEM_STATUS.CORRECT]: 'Correct',
  [RECOVERY_ITEM_STATUS.INCORRECT]: 'Incorrect',
  [RECOVERY_ITEM_STATUS.UNANSWERED]: 'No answer',
  [RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE]: 'MathMaster could not grade this question — not counted against the student',
  [RECOVERY_ITEM_STATUS.NEEDS_REVIEW]: 'Needs your review — not counted against the student',
});

export const RECOVERY_FAILURE_LABEL = Object.freeze({
  'pin-fingerprint-mismatch': 'The question was changed after this Recovery started, so MathMaster cannot rebuild the exact question the student was given.',
  'pin-family-mismatch': 'The question now uses a different question family or version than the one this Recovery was given.',
  'pin-family-version-unknown': 'The saved question names a question-family version MathMaster does not have.',
  'family-version-newer-than-client': 'The saved question uses a newer question-family version than MathMaster\'s grading server has.',
  'pin-slot-mismatch': 'The saved question record belongs to a different question.',
  'pin-not-allocated-to-student': 'The saved question record does not match this student.',
  'pin-malformed': 'The saved question record is damaged or in an old format.',
  'family-unknown': 'The question\'s question family no longer exists.',
  'family-unsatisfiable': 'The question\'s settings can no longer produce a valid question.',
  'generation-failed': 'The question could not be generated.',
  'resolution-exception': 'An unexpected error happened while MathMaster prepared the question.',
  'question-removed': 'This question is no longer part of the section for this student.',
  'grader-unavailable': 'MathMaster cannot mark this kind of question on the server.',
  'response-unreadable': 'MathMaster could not read the student\'s saved answer.',
  'grading-exception': 'An unexpected error happened while MathMaster marked the answer.',
  'reported-unavailable': 'The student\'s device could not show this question, but MathMaster can rebuild it.',
});

// A failure the question's own content causes: a replacement cannot be made
// until the question is fixed in the assignment.
const CONTENT_FAILURES = new Set(['family-unknown', 'family-unsatisfiable', 'generation-failed', 'question-removed', 'grader-unavailable', 'pin-family-version-unknown']);

const HOLD_REASON_LABEL = Object.freeze({
  [RECOVERY_HOLD_REASON.NEEDS_REVIEW]: 'MathMaster has work from the student that it could not grade.',
  [RECOVERY_HOLD_REASON.NO_GRADED_ITEMS]: 'MathMaster could not grade any question in this Recovery.',
  [RECOVERY_HOLD_REASON.SKILL_WITHOUT_EVIDENCE]: 'A skill this Recovery assesses has no question MathMaster could grade.',
  [RECOVERY_HOLD_REASON.TOO_LITTLE_EVIDENCE]: 'The questions MathMaster could grade carry less than half of this Recovery\'s weight.',
  [RECOVERY_HOLD_REASON.TOO_FEW_QUESTIONS]: 'Too few questions could be graded for this section.',
});

export const HELD_RECOVERY_ACTION_LABEL = Object.freeze({
  issueReplacement: 'Issue a replacement question',
  finalizeGraded: 'Finalize from the graded questions',
  keepOriginal: 'Keep the original score',
});

const FAMILY_TITLES = new Map(listPlatformQuestionFamilies().map((family) => [family.id, family.title || family.id]));
const skillLabel = (key) => FAMILY_TITLES.get(key) || (String(key).startsWith('slot:') ? 'a question of its own' : 'this assignment\'s own question');
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const round = (value) => Math.round(Number(value) * 100) / 100;

/** "DOL Q3": the source question's place in this student's section. */
const sectionQuestionLabel = (assignment, section, storageIndex) => {
  const entries = projectCurrentAssignmentContent(assignment).entries.filter((entry) => entry.logicalRole === section);
  const position = entries.findIndex((entry) => entry.storageIndex === storageIndex);
  return position >= 0 ? `${SECTION_RECOVERY_AUDIT_LABEL[section]} Q${position + 1}` : `${SECTION_RECOVERY_AUDIT_LABEL[section]} question (removed)`;
};

const auditItems = ({ record, assignment, section }) => {
  const excluded = new Set(record.evidence?.excludedItemIds || []);
  return (record.plan?.items || []).map((item, index) => {
    const result = record.results?.[item.itemId] || null;
    // A result written before results carried a status reads as it always
    // meant (sectionRecoveryRecord.mjs itemStatusOf) — including the old
    // 'question-unavailable' zero, which was a platform failure.
    const status = result ? itemStatusOf(result) : null;
    const legacyZero = isLegacyUnavailableResult(result);
    const legacyCounted = legacyZero && !record.legacyCorrection;
    return {
      itemId: item.itemId,
      position: index + 1,
      questionLabel: sectionQuestionLabel(assignment, section, item.storageIndex),
      status: status || 'notSubmitted',
      statusLabel: legacyCounted
        ? 'MathMaster could not reproduce this question — scored as 0 under the rule in place when this Recovery was submitted'
        : legacyZero
          ? 'MathMaster could not reproduce this question — left out of the score (corrected)'
          : status ? ITEM_STATUS_LABEL[status] || status : 'Not submitted yet',
      classification: result?.classification || null,
      classificationLabel: result?.classification ? RECOVERY_FAILURE_LABEL[result.classification] || 'MathMaster could not grade this question.' : null,
      countsTowardScore: legacyCounted || (result ? result.countsTowardScore !== false && isGradedItemStatus(status) : false),
      excluded: excluded.has(item.itemId),
      supersededBy: item.supersededBy || null,
      replaces: item.replaces || null,
      answerKept: Boolean(record.hold?.responses?.[item.itemId] || record.keptResponses?.[item.itemId]),
    };
  });
};

const evidenceSummaryOf = (record, items) => {
  const active = items.filter((item) => !item.supersededBy && item.status !== 'notSubmitted');
  if (!active.length) return null;
  const weightOf = (item) => itemWeight(record.results?.[item.itemId]?.weight);
  const graded = active.filter((item) => isGradedItemStatus(item.status));
  const plannedWeight = round(active.reduce((sum, item) => sum + weightOf(item), 0));
  const gradedWeight = round(graded.reduce((sum, item) => sum + weightOf(item), 0));
  const planItems = (record.plan?.items || []).filter((item) => !item.supersededBy);
  const coveredSkills = new Set(planItems.filter((item) => record.results?.[item.itemId] && isGradedItemStatus(itemStatusOf(record.results[item.itemId]))).map(itemSkillKey));
  const missing = [...new Set(planItems.map(itemSkillKey))].filter((skill) => !coveredSkills.has(skill));
  return `MathMaster graded ${graded.length} of ${plural(active.length, 'question')} (${gradedWeight} of ${plannedWeight} points of weight).`
    + (missing.length ? ` No graded question for: ${missing.map(skillLabel).join('; ')}.` : '');
};

const recommendedActionFor = ({ record, items, actions, awaitingStudent = false, windowEnded = false }) => {
  if (awaitingStudent) {
    const graded = items.filter((item) => !item.supersededBy && isGradedItemStatus(item.status)).length;
    const decide = [
      ...(actions.includes('finalizeGraded') ? [`finalize from the ${plural(graded, 'question')} MathMaster could grade`] : []),
      'keep the original score',
    ].join(', or ');
    return windowEnded
      ? `The final submission date passed before the student answered the replacement question. To release it, ${decide}. Until then no Recovery score counts, and Classroom and Grade Transfer wait.`
      : `The student can answer the replacement question until their final submission date. You can also ${decide} now. Until then no Recovery score counts, and Classroom and Grade Transfer wait.`;
  }
  const failing = items.filter((item) => !item.supersededBy && (item.status === RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE || item.status === RECOVERY_ITEM_STATUS.NEEDS_REVIEW));
  const contentProblem = failing.filter((item) => CONTENT_FAILURES.has(item.classification));
  const graded = items.filter((item) => !item.supersededBy && isGradedItemStatus(item.status)).length;
  const options = [
    contentProblem.length
      ? `fix ${contentProblem.map((item) => item.questionLabel).join(', ')} in the assignment and then issue a replacement question`
      : 'issue a replacement question so the student can answer it',
    ...(actions.includes('finalizeGraded') ? [`finalize from the ${plural(graded, 'question')} MathMaster could grade`] : []),
    'keep the original score',
  ];
  const lead = record.hold?.reason === RECOVERY_HOLD_REASON.NEEDS_REVIEW ? 'Review it, then ' : 'To release it, ';
  const last = options.pop();
  return `${lead}${options.length ? `${options.join(', ')}, or ${last}` : last}. Until then no Recovery score counts, and Classroom and Grade Transfer wait.`;
};

export const LEGACY_CORRECTION_LABEL = 'Re-score without the questions MathMaster could not reproduce';

/** What a Recovery scored under the old rule counted, and what it would be without the zeros. */
const legacyNoticeOf = (record, legacyZeros) => {
  const zeros = new Set(legacyZeros);
  const evidence = (record.plan?.items || [])
    .filter((item) => !item.supersededBy && !zeros.has(item.itemId))
    .map((item) => recoveryEvidenceItem(item, record.results?.[item.itemId]));
  const { rawScore } = scoreRecoveryEvidence(evidence);
  return `MathMaster could not reproduce ${plural(zeros.size, 'question')} in this Recovery, and the rule in place when it was submitted scored ${zeros.size === 1 ? 'it' : 'them'} as 0`
    + ` — a platform failure counted as a wrong answer. Recovery ${percent(record.rawScore)} as recorded`
    + (rawScore === null ? '; nothing else in it was graded.' : `; ${percent(rawScore)} over the questions MathMaster graded.`);
};

const resolutionLabelOf = (resolution, formatWhenValue) => {
  if (!resolution?.action) return null;
  const by = resolution.actor?.email || 'a teacher';
  const when = formatWhenValue(resolution.at);
  const what = (resolution.rawScoreBefore !== undefined
    ? 'Re-scored without the questions MathMaster could not reproduce'
    : {
      finalizeGraded: 'Finalized from the graded questions',
      keepOriginal: 'Closed keeping the original score',
      issueReplacement: 'Replacement question issued',
    }[resolution.action]) || resolution.action;
  return `${what} by ${by}${when ? ` (${when})` : ''}${resolution.note ? ` — "${resolution.note}"` : ''}.`;
};

const percent = (value) => (Number.isFinite(Number(value)) && value !== null ? `${Math.round(Number(value))}%` : '—');

const formatWhen = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
};

/**
 * The audit rows for one student and one assignment ([] when there is no
 * Recovery record at all).
 */
export const buildTeacherRecoveryAudit = ({ student = null, assignment = null, nowValue = Date.now() } = {}) => {
  const records = student?.sectionRecoveryByAssignment?.[assignment?.id];
  if (!assignment?.id || !records || typeof records !== 'object') return [];
  // The Recovery end date: this student's final submission date.
  const endsAtMs = assignmentFinalCloseAt(assignment, SCHOOL_TIME_ZONE, student?.id || null, student?.profile || null);
  const windowEnded = endsAtMs !== null && Number(nowValue) > endsAtMs;
  const correctedTracker = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  )?.[assignment.id] || {};
  // The Original is over this student's required items: an item their
  // reduced-item-count accommodation omits is neither in the original nor
  // credited by the Recovery (the same resolver every grade surface uses).
  const supportProfile = student?.profile || null;
  const originals = splitGradesBySection({ tracker: correctedTracker, assignment, supportProfile });
  const { states } = projectSectionRecoveryForAssignment({
    tracker: correctedTracker,
    assignment,
    recoveryByAssignment: student.sectionRecoveryByAssignment,
    challengeByAssignment: student.warmupChallengeByAssignment || null,
    supportProfile,
  });
  return ['warmup', 'dol'].map((section) => {
    const record = normalizeRecoveryRecord(records[section], section);
    if (!record) return null;
    const original = originals?.[section] || {};
    const state = states?.[section] || null;
    const evidence = record.masteryEvidence;
    const practiced = record.practice.items.length;
    const held = record.status === 'held';
    // Held while the student answers the replacement questions a teacher
    // issued; past their final submission date it waits for the teacher.
    const awaitingStudent = recoveryAwaitsReplacementAnswer(record);
    // Completed before this policy with a platform failure scored as 0.
    const legacyZeros = record.status === 'completed' ? legacyUnavailableItemIds(record) : [];
    const legacyUncorrected = recoveryNeedsLegacyCorrection(record, section);
    const items = record.plan ? auditItems({ record, assignment, section }) : [];
    const actions = heldRecoveryActionsFor(record, section);
    const resolution = record.hold?.resolution || (record.holdHistory || []).at(-1)?.resolution || record.legacyCorrection || null;
    const hasUngraded = items.some((item) => item.status === RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE || item.status === RECOVERY_ITEM_STATUS.NEEDS_REVIEW);
    return {
      section,
      label: `${SECTION_RECOVERY_AUDIT_LABEL[section]} Recovery`,
      status: record.status === 'inProgress' && windowEnded ? 'closed' : record.status,
      statusLabel: record.status === 'inProgress' && windowEnded
        ? 'Closed — not submitted by the final submission date (original stands)'
        : awaitingStudent
          ? windowEnded
            ? 'Held for review — the student did not answer the replacement question by their final submission date'
            : 'Held — replacement question issued, waiting for the student\'s answer'
          : legacyUncorrected
            ? 'Completed — scored before MathMaster stopped counting questions it could not grade'
            : STATUS_LABEL[record.status] || record.status,
      awaitingStudent,
      typeLabel: record.type === RECOVERY_TYPE.EXCUSED_MAKE_UP ? 'Excused make-up (full credit available)' : record.type ? `Recovery (counts up to ${record.cap ?? '—'}%)` : null,
      original: original.attempted ? percent(original.score) : 'Missing',
      recovery: record.status === 'completed' && record.rawScore !== null && record.rawScore !== undefined ? percent(record.rawScore) : '—',
      // While held, the original is what every surface shows — and it waits.
      final: state?.recordedScore !== null && state?.recordedScore !== undefined
        ? percent(state.recordedScore)
        : held || (record.status === 'completed' && (record.rawScore === null || record.rawScore === undefined))
          ? (original.attempted ? percent(original.score) : '—')
          : '—',
      reason: state?.reason || null,
      held,
      heldReason: held ? HOLD_REASON_LABEL[record.hold?.reason] || 'MathMaster could not grade this Recovery.' : null,
      legacyNotice: legacyUncorrected ? legacyNoticeOf(record, legacyZeros) : null,
      items,
      evidenceSummary: hasUngraded ? evidenceSummaryOf(record, items) : null,
      recommendedAction: legacyUncorrected
        ? (actions.length
          ? 'To correct it, re-score it without the questions MathMaster could not reproduce. The change is recorded with your name and sent on to Classroom and Grade Transfer.'
          : 'MathMaster graded none of its other questions, so there is nothing to re-score from; the original score is what counts.')
        : held ? recommendedActionFor({ record, items, actions, awaitingStudent, windowEnded }) : null,
      actions,
      // The words for an action on this row, where they differ from a hold's.
      actionLabels: legacyUncorrected ? { finalizeGraded: LEGACY_CORRECTION_LABEL } : {},
      resolution: resolutionLabelOf(resolution, formatWhen),
      evidence: evidence?.met
        ? `Unlocked after Practice mastery: ${evidence.correct} of the last ${evidence.windowSize} correct (${evidence.percent}%).`
        : evidence && evidence.masteryRequired === false
          ? 'Unlocked as an excused make-up.'
          : `${practiced} Practice question${practiced === 1 ? '' : 's'} answered so far.`,
      unlockedAt: formatWhen(record.unlockedAt),
      completedAt: formatWhen(record.completedAt),
      history: record.history,
    };
  }).filter(Boolean);
};

/**
 * Sections of this assignment whose grade includes a completed Recovery — one
 * with a Recovery score (a teacher who closed a held Recovery keeping the
 * original recorded none, and nothing was replaced).
 */
export const completedRecoverySections = (student = null, assignmentId = null) => {
  const records = student?.sectionRecoveryByAssignment?.[assignmentId];
  if (!records || typeof records !== 'object') return new Set();
  return new Set(['warmup', 'dol'].filter((section) => {
    const record = normalizeRecoveryRecord(records[section], section);
    return record?.status === 'completed' && record.rawScore !== null && record.rawScore !== undefined && Number.isFinite(Number(record.rawScore));
  }));
};

/** Sections of this assignment whose Recovery is HELD, waiting for this teacher. */
export const heldRecoverySections = (student = null, assignmentId = null) => {
  const records = student?.sectionRecoveryByAssignment?.[assignmentId];
  if (!records || typeof records !== 'object') return new Set();
  return new Set(['warmup', 'dol'].filter((section) => normalizeRecoveryRecord(records[section], section)?.status === 'held'));
};

/**
 * The Live Challenge Warm-Up result, as the teacher audits it: the rounds the
 * student got right out of the rounds they could play, and what the Warm-Up
 * records (the higher of that and any authored Warm-Up work). Null without a
 * measurable result.
 */
export const buildTeacherWarmupChallengeAudit = ({ student = null, assignment = null } = {}) => {
  const credit = student?.warmupChallengeByAssignment?.[assignment?.id];
  if (!assignment?.id || !credit) return null;
  const correctedTracker = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  )?.[assignment.id] || {};
  const authored = splitGradesBySection({ tracker: correctedTracker, assignment, supportProfile: student?.profile || null }).warmup || {};
  const state = buildWarmupChallengeGradeState({ credit, originalScore: authored.attempted ? authored.score : null });
  if (!state) return null;
  return {
    label: 'Warm-Up · Live Challenge',
    challenge: `${state.correct} of ${state.roundsAvailable} rounds correct (${state.challengeScore}%)`,
    authored: authored.attempted ? percent(authored.score) : '—',
    final: percent(state.recordedScore),
    reason: state.source === 'challenge'
      ? 'The Live Challenge result is the Warm-Up grade. Challenge points are not part of the grade.'
      : 'The authored Warm-Up work scored higher than the Live Challenge result, so it is kept.',
  };
};

/** Does this student's Warm-Up grade come from a Live Challenge result? */
export const warmupChallengeCounts = (student = null, assignmentId = null) => (
  warmupChallengeScore(student?.warmupChallengeByAssignment?.[assignmentId]) !== null
);
