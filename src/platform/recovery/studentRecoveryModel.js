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

export const SECTION_RECOVERY_LABEL = Object.freeze({ dol: 'DOL Recovery', warmup: 'Warm-Up Recovery' });

const STATE_COPY = Object.freeze({
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
  [RECOVERY_STATE.CLOSED]: {
    badge: 'Closed',
    message: 'The final submission date passed before this Recovery was submitted, so your original score stands.',
  },
});

/** "Fri, Oct 3, 11:59 PM" in the viewer's own time, or null. */
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
  const sections = splitGradesBySection({ tracker, assignment });
  return ['warmup', 'dol'].map((section) => {
    const sectionEntries = entries
      .filter((entry) => entry.logicalRole === section)
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
    return {
      section,
      label: SECTION_RECOVERY_LABEL[section],
      state: eligibility.state,
      badge: copy.badge,
      message: copy.message,
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
      plan: record?.plan || null,
      result: completedState ? {
        original: completedState.originalMissing ? 'Missing' : `${completedState.originalScore}%`,
        recovery: `${completedState.rawRecoveryScore}%`,
        final: `${completedState.recordedScore}%`,
      } : null,
      nextPracticeItem: nextRecoveryPracticeItem(context),
      questionsByIndex: context.questionsByIndex,
    };
  }).filter(Boolean);
};
