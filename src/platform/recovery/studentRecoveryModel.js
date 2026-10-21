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
    message: 'Keep answering Recovery practice questions to show what you know. Recovery unlocks when your recent Recovery practice shows mastery.',
  },
  [RECOVERY_STATE.UNLOCKED]: {
    badge: 'Unlocked',
    message: 'Your recent Recovery practice shows mastery. You can try again now.',
  },
  [RECOVERY_STATE.IN_PROGRESS]: {
    badge: 'In progress',
    message: 'Pick up where you left off.',
  },
  [RECOVERY_STATE.COMPLETED]: {
    badge: 'Complete',
    // Practice closes with the Recovery (canPractice is LOCKED/UNLOCKED only,
    // and the server refuses it): the copy promises nothing more (review of #464, m3).
    message: 'Your Recovery is finished. Your result is below.',
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
 * WHICH PRACTICE COUNTS — BY NAME (Recovery V2).
 *
 * The questions behind "Practice for …" always count. The assignment's own
 * Practice questions count too when they practise a skill the Warm-Up or DOL
 * assessed and the student answered them on their own, graded by MathMaster
 * (functions/shared/assignmentPracticeEvidence.mjs — the same rule the server
 * unlocks with). So the sentence names those questions, numbered exactly as
 * the student sees them, or says plainly why this assignment's Practice does
 * not count — "Practice inside the assignment" is never left to guesswork.
 */
const joinWords = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** [1, 2, 3, 4, 7, 9] → "Practice Q1–Q4, Q7 and Q9"; [] → "". */
export const practiceQuestionsText = (numbers = []) => {
  const sorted = [...new Set((Array.isArray(numbers) ? numbers : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!sorted.length) return '';
  const runs = [];
  sorted.forEach((number) => {
    const last = runs[runs.length - 1];
    if (last && number === last[1] + 1) last[1] = number;
    else runs.push([number, number]);
  });
  const parts = runs.flatMap(([from, to]) => {
    if (from === to) return [`Q${from}`];
    if (to === from + 1) return [`Q${from}`, `Q${to}`];
    return [`Q${from}–Q${to}`];
  });
  return `Practice ${joinWords(parts)}`;
};

/*
 * What the assignment's own Practice section contributes, in the student's
 * words:
 *   counts       some of its questions count → named
 *   otherSkills  it has Practice, none of it on this section's skills
 *   none         the assignment has no Practice section
 */
export const ASSIGNMENT_PRACTICE_ROLE = Object.freeze({
  COUNTS: 'counts',
  OTHER_SKILLS: 'otherSkills',
  NONE: 'none',
});

/*
 * A LOCKED RECOVERY SAYS EXACTLY WHAT UNLOCKS IT, AND WHERE.
 *
 * The bar comes from the policy (7 of the last 8 by default); the second half
 * says which practice counts (above).
 */
export const assignmentPracticeCountsSentence = ({ countingText = '', countingNumbers = [] } = {}) => {
  if (!countingText) return '';
  const one = countingNumbers.length === 1;
  return `${countingText} in this assignment ${one ? 'counts' : 'count'} when you answer ${one ? 'it' : 'them'} without a hint or help, and so do the questions behind “Practice for …”.`;
};

export const lockedRecoveryMessage = ({ requiredCorrect, windowSize, practiceRole = ASSIGNMENT_PRACTICE_ROLE.NONE, countingText = '', countingNumbers = [] } = {}) => {
  if (practiceRole === ASSIGNMENT_PRACTICE_ROLE.COUNTS && countingText) {
    return `Get ${requiredCorrect} of your last ${windowSize} practice questions right on your own to unlock a second try. ${assignmentPracticeCountsSentence({ countingText, countingNumbers })}`;
  }
  const lead = `Use “Practice for …” to answer new practice questions. Get ${requiredCorrect} of your last ${windowSize} right to unlock a second try.`;
  return practiceRole === ASSIGNMENT_PRACTICE_ROLE.OTHER_SKILLS
    ? `${lead} This assignment's own Practice questions practise other skills, so they do not count toward it.`
    : lead;
};

/** The assignment Practice account for one section, as the panel words it. */
export const describeAssignmentPractice = (assignmentPractice = null, projection = null) => {
  const considered = Array.isArray(assignmentPractice?.questions) ? assignmentPractice.questions : [];
  // Numbered as the student sees them: the logical position in the Practice
  // section (a replacement question sits where the question it replaced was).
  const numberOf = (entry) => {
    const projected = projection?.byStorageIndex?.get?.(entry.storageIndex);
    if (projected && Number.isInteger(projected.logicalPosition)) return projected.logicalPosition + 1;
    const match = /Q(\d+)$/.exec(String(entry.label || ''));
    return match ? Number(match[1]) : null;
  };
  const aligned = considered.filter((entry) => entry.aligned);
  const countedCorrect = aligned.filter((entry) => entry.counts).length;
  const role = !considered.length
    ? ASSIGNMENT_PRACTICE_ROLE.NONE
    : aligned.length ? ASSIGNMENT_PRACTICE_ROLE.COUNTS : ASSIGNMENT_PRACTICE_ROLE.OTHER_SKILLS;
  return {
    role,
    countingText: practiceQuestionsText(aligned.map(numberOf)),
    countingNumbers: aligned.map(numberOf).filter((n) => n !== null),
    // Already answered correctly on their own: in the meter now.
    countedCorrect,
  };
};

/*
 * WHEN THE ORIGINAL CLOSED, in the student's own time: the moment it closed,
 * or — for a section given on an earlier school day — that day.
 */
const formatDateKey = (dateKey) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export const originalClosedLabel = (opportunity = null, sectionName = '') => {
  if (!opportunity || opportunity.status !== 'closed') return null;
  const name = sectionName || 'original';
  const at = Number(opportunity.closedAtMs);
  if (Number.isFinite(at) && opportunity.closedAtMs !== null && opportunity.reason !== 'assignment-final-deadline') {
    return `Your ${name} closed ${formatRecoveryEndsAt(at)}.`;
  }
  const day = formatDateKey(opportunity.instructionDateKey);
  return day ? `Your ${name} was given in class on ${day} and is now closed.` : null;
};

export const KEPT_ORIGINAL_NOTE = 'Your teacher reviewed your Recovery and kept your original score.';
export const REPLACEMENT_ISSUED_NOTE = 'Your teacher added a new question to your Recovery. Your other answers are saved — just answer the new question and submit again.';

export const formatRecoveryEndsAt = (endsAtMs) => {
  const value = Number(endsAtMs);
  if (!Number.isFinite(value) || endsAtMs === null) return null;
  return new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const OPEN_STATES = new Set([RECOVERY_STATE.LOCKED, RECOVERY_STATE.UNLOCKED, RECOVERY_STATE.IN_PROGRESS]);

/**
 * The shared Recovery decision for one student and one assignment, per
 * Warm-Up/DOL section the student has: the context the server decides with
 * (buildSectionRecoveryContext), the student's original for it, and the
 * content projection. The student's panel and the teacher's class roster
 * (teacherRecoveryRoster.js) both read it, so they cannot disagree.
 */
export const studentRecoveryContexts = ({
  assignment = null,
  tracker = {},
  recoveryForAssignment = null,
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentProfile = null,
  overrides = null,
  // The student's Live Challenge Warm-Up credit, where the caller has it.
  challengeCredit = null,
  nowValue = Date.now(),
} = {}) => {
  if (!assignment?.id || !studentId) return { projection: null, sections: [] };
  const questions = getStoredAssignmentQuestions(assignment);
  const projection = projectCurrentAssignmentContent(assignment);
  // The original is this student's own section: a reduced-item-count
  // accommodation's omitted items are neither in the grade nor in Recovery
  // (the server's advanceSectionRecovery filters the same way).
  const originals = splitGradesBySection({ tracker, assignment, supportProfile: studentProfile });
  const omitted = studentOmittedIndices({ assignment, profile: studentProfile, tracker, nowValue });
  const sections = ['warmup', 'dol'].map((section) => {
    const sectionEntries = projection.entries
      .filter((entry) => entry.logicalRole === section && !omitted.has(entry.storageIndex))
      .map((entry) => ({ storageIndex: entry.storageIndex, question: questions[entry.storageIndex] }));
    if (!sectionEntries.length) return null;
    const original = originals[section] || {};
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
      challengeCredit,
      studentProfile,
      overrides,
      sectionModeFor: (role) => getSectionVariantMode(assignment, role),
      nowValue,
    });
    return { section, original, context };
  }).filter(Boolean);
  return { projection, sections };
};

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
  // teacherGradeOverridesByAssignment[assignment.id]: a Practice question a
  // teacher graded is not the student's own evidence (assignmentPracticeEvidence).
  overrides = null,
  nowValue = Date.now(),
} = {}) => {
  if (!assignment?.id || !studentId) return [];
  const { projection, sections } = studentRecoveryContexts({
    assignment,
    tracker,
    recoveryForAssignment,
    studentId,
    classId,
    classPeriod,
    schedule,
    studentProfile,
    overrides,
    nowValue,
  });
  return sections.map(({ section, original, context }) => {
    const { eligibility, mastery, record } = context;
    const practice = describeAssignmentPractice(context.assignmentPractice, projection);
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
        ? lockedRecoveryMessage({
          requiredCorrect: mastery.requiredCorrect,
          windowSize: mastery.windowSize,
          practiceRole: practice.role,
          countingText: practice.countingText,
          countingNumbers: practice.countingNumbers,
        })
        : copy.message,
      // Which practice counts, and how much of the meter each kind filled.
      assignmentPractice: practice,
      masterySources: mastery.sources || null,
      // When the original closed — the reason Recovery is open at all.
      originalClosedLabel: originalClosedLabel(context.opportunity, section === 'dol' ? 'DOL' : 'Warm-Up'),
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
