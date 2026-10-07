/*
 * WHAT A STUDENT SEES ABOUT RECOVERY, IN THEIR WORDS.
 *
 * Built from the same shared context the server decides with
 * (functions/shared/sectionRecoveryService.mjs), so the panel never offers
 * something the server would refuse. The browser cannot read attendance, so it
 * never promises an excused make-up; the server decides that when the student
 * starts.
 *
 * Language rules (from the brief): short, encouraging, never punitive, and no
 * internal vocabulary — no "seed", "family", "variant", "allocation", "token".
 * Nothing is shown while the original Warm-Up/DOL is still available.
 */

import { getSectionVariantMode } from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { splitGradesBySection } from '../teacher/gradeEvidence.js';
import {
  RECOVERY_STATE,
  buildSectionRecoveryContext,
  nextRecoveryPracticeItem,
} from '../../../functions/shared/sectionRecoveryService.mjs';
import { buildSectionRecoveryGradeState } from '../../../functions/shared/sectionRecoveryGrade.mjs';
import { activeRecoveryPlanItems } from '../../../functions/shared/sectionRecoveryRecord.mjs';
import { isGradedItemStatus } from '../../../functions/shared/sectionRecoveryEvidence.mjs';
import { studentOmittedIndices } from '../../../functions/shared/reducedWorkload.mjs';

export const SECTION_RECOVERY_LABEL = Object.freeze({ dol: 'DOL Recovery', warmup: 'Warm-Up Recovery' });

const STATE_COPY = Object.freeze({
  // The message is replaced by lockedRecoveryMessage, which names the bar.
  [RECOVERY_STATE.LOCKED]: {
    badge: 'Locked',
    message: 'Continue Practice to show what you know. Recovery unlocks when your recent Practice shows mastery.',
  },
  [RECOVERY_STATE.UNLOCKED]: {
    badge: 'Unlocked',
    message: 'Your recent Practice shows mastery. You can try again now.',
  },
  [RECOVERY_STATE.IN_PROGRESS]: {
    badge: 'In progress',
    message: 'Pick up where you left off.',
  },
  [RECOVERY_STATE.COMPLETED]: {
    badge: 'Complete',
    message: 'Your Recovery is finished. Practice stays open whenever you want more.',
  },
  // Submitted, but MathMaster could not grade enough of it to score it. The
  // brief's words: what happened, that the work is safe, and who decides —
  // never "incorrect", never a score.
  [RECOVERY_STATE.HELD]: {
    badge: 'Under review',
    message: 'Your completed Recovery work has been saved. MathMaster could not grade one or more required questions, so your Recovery is being held for review.',
  },
  [RECOVERY_STATE.CLOSED]: {
    badge: 'Closed',
    message: 'The final submission date passed before this Recovery was submitted, so your original score stands.',
  },
});

/** "Fri, Oct 3, 11:59 PM" in the viewer's own time, or null. */
/** "MathMaster could not grade 1 Recovery question. It did not count against your score." */
export const excludedRecoveryNote = (count) => (count > 0
  ? `MathMaster could not grade ${count} Recovery question${count === 1 ? '' : 's'}. ${count === 1 ? 'It' : 'They'} did not count against your score.`
  : null);

/*
 * A LOCKED RECOVERY SAYS EXACTLY WHAT UNLOCKS IT, AND WHERE.
 *
 * "Recovery unlocks when your recent Practice shows mastery" sent students to
 * the assignment's own Practice section, which never counts: only the
 * questions behind "Practice for …" do. So the sentence names the bar from the
 * policy (7 of the last 8 by default) and says which practice counts.
 */
export const lockedRecoveryMessage = ({ requiredCorrect, windowSize } = {}) => (
  `Use “Practice for …” to answer new practice questions. Get ${requiredCorrect} of your last ${windowSize} right to unlock a second try. Practice inside the assignment does not count toward it.`
);

export const KEPT_ORIGINAL_NOTE = 'Your teacher reviewed your Recovery and kept your original score.';
export const REPLACEMENT_ISSUED_NOTE = 'Your teacher added a new question to your Recovery. Your other answers are saved — just answer the new question and submit again.';

export const formatRecoveryEndsAt = (endsAtMs) => {
  const value = Number(endsAtMs);
  if (!Number.isFinite(value) || endsAtMs === null) return null;
  return new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const OPEN_STATES = new Set([RECOVERY_STATE.LOCKED, RECOVERY_STATE.UNLOCKED, RECOVERY_STATE.IN_PROGRESS]);

/**
 * The student's Recovery summary for one assignment: one entry per Warm-Up/DOL
 * section the student should currently see. Hidden, unavailable and not-needed
 * sections produce no entry at all.
 */
export const buildStudentRecoverySummary = ({
  assignment = null,
  tracker = {},
  recoveryForAssignment = null,
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentProfile = null,
  nowValue = Date.now(),
} = {}) => {
  if (!assignment?.id || !studentId) return [];
  const questions = getStoredAssignmentQuestions(assignment);
  const entries = projectCurrentAssignmentContent(assignment).entries;
  // The original is this student's own section: a reduced-item-count
  // accommodation's omitted items are neither in the grade nor in Recovery
  // (the server's advanceSectionRecovery filters the same way).
  const sections = splitGradesBySection({ tracker, assignment, supportProfile: studentProfile });
  const omitted = studentOmittedIndices({ assignment, profile: studentProfile, tracker, nowValue });
  return ['warmup', 'dol'].map((section) => {
    const sectionEntries = entries
      .filter((entry) => entry.logicalRole === section && !omitted.has(entry.storageIndex))
      .map((entry) => ({ storageIndex: entry.storageIndex, question: questions[entry.storageIndex] }));
    if (!sectionEntries.length) return null;
    const original = sections[section] || {};
    const context = buildSectionRecoveryContext({
      assignment,
      section,
      sectionEntries,
      questions,
      tracker,
      sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted || 0, total: original.total || 0 },
      record: recoveryForAssignment?.[section] || null,
      studentId,
      classId,
      classPeriod,
      schedule,
      supportEvents: null,
      studentProfile,
      sectionModeFor: (role) => getSectionVariantMode(assignment, role),
      nowValue,
    });
    const { eligibility, mastery, record } = context;
    if (!eligibility.studentVisible) return null;
    const copy = STATE_COPY[eligibility.state] || STATE_COPY[RECOVERY_STATE.LOCKED];
    const completedState = eligibility.state === RECOVERY_STATE.COMPLETED && record?.status === 'completed'
      ? buildSectionRecoveryGradeState({
        section,
        originalScore: original.total ? original.score : null,
        originalAttempted: (original.attempted || 0) > 0,
        rawRecoveryScore: record.rawScore,
        type: record.type,
        capOverride: record.cap,
        policy: context.policy,
      })
      : null;
    // A teacher kept the original: there is no Recovery score to show.
    const keptOriginal = Boolean(completedState) && completedState.rawRecoveryScore === null;
    const excludedCount = completedState ? (record.evidence?.excludedItemIds || []).length : 0;
    // A Recovery a teacher repaired: the questions already graded are kept and
    // never asked again; only the new ones are open.
    const activeItems = record?.plan ? activeRecoveryPlanItems(record) : [];
    const submittedItemIds = activeItems
      .filter((item) => isGradedItemStatus(record?.results?.[item.itemId]?.status))
      .map((item) => item.itemId);
    const repaired = eligibility.state === RECOVERY_STATE.IN_PROGRESS && activeItems.some((item) => item.replaces);
    const note = keptOriginal
      ? KEPT_ORIGINAL_NOTE
      : completedState
        ? excludedRecoveryNote(excludedCount)
        : repaired ? REPLACEMENT_ISSUED_NOTE : null;
    return {
      section,
      label: SECTION_RECOVERY_LABEL[section],
      state: eligibility.state,
      badge: copy.badge,
      message: eligibility.state === RECOVERY_STATE.LOCKED
        ? lockedRecoveryMessage({ requiredCorrect: mastery.requiredCorrect, windowSize: mastery.windowSize })
        : copy.message,
      masteryPercent: mastery.percent,
      masteryCorrect: mastery.correct,
      masteryWindow: mastery.windowSize,
      masteryRequired: mastery.requiredCorrect,
      practiceRemaining: mastery.remainingItems,
      // The Recovery end date: the assignment's final submission date.
      endsAtMs: eligibility.endsAtMs ?? null,
      endsAtLabel: OPEN_STATES.has(eligibility.state) ? formatRecoveryEndsAt(eligibility.endsAtMs) : null,
      canPractice: [RECOVERY_STATE.LOCKED, RECOVERY_STATE.UNLOCKED].includes(eligibility.state),
      canStart: eligibility.state === RECOVERY_STATE.UNLOCKED,
      canContinue: eligibility.state === RECOVERY_STATE.IN_PROGRESS,
      held: eligibility.state === RECOVERY_STATE.HELD,
      // The questions to show: never one a teacher replaced.
      plan: record?.plan ? { ...record.plan, items: activeItems } : null,
      submittedItemIds,
      note,
      result: completedState ? {
        original: completedState.originalMissing ? 'Missing' : `${completedState.originalScore}%`,
        recovery: keptOriginal ? 'Not scored' : `${completedState.rawRecoveryScore}%`,
        final: completedState.recordedScore === null ? '—' : `${completedState.recordedScore}%`,
      } : null,
      nextPracticeItem: nextRecoveryPracticeItem(context),
      questionsByIndex: context.questionsByIndex,
    };
  }).filter(Boolean);
};
