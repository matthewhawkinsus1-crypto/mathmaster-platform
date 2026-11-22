// WHAT A TEACHER READS OF AN ATTEMPT FACT ("worth a conversation").
//
// The facts are recorded by the student's device
// (src/platform/signals/attemptSignalFacts.js) and stored beside the attempt,
// under the student's roster row. This module turns one into a title, a
// sentence of facts and its context: never a verdict, never a word about
// cheating, and nothing it was not told. Every place a signal is shown says
// it is not conclusive (NOT_CONCLUSIVE). It is teacher code: no student
// screen imports it.

import { ATTEMPT_SIGNAL_KIND, ATTEMPT_SIGNAL_KINDS } from '../signals/attemptSignalFacts.js';
import { supportShortLabel } from '../../../functions/shared/supportCatalog.mjs';

export const WORTH_A_CONVERSATION = 'Worth a conversation';
export const NOT_CONCLUSIVE = 'Not conclusive';
export const WORTH_A_CONVERSATION_NOTE = 'Facts about an attempt, not findings, and not conclusive on their own. They never change a score, an attempt or mastery.';
export const REVIEW_NOTE_MAX = 500;

const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
export const signalMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const awayWords = (seconds) => {
  const value = Math.max(0, Math.round(num(seconds)));
  if (value < 90) return `about ${plural(value, 'second')}`;
  return `about ${plural(Math.round(value / 60), 'minute')}`;
};

const ROLE_LABEL = Object.freeze({
  warmup: 'Warm-Up', classwork: 'Classwork', dol: 'DOL', practice: 'Practice', quiz: 'Quiz', test: 'Test',
  review: 'Review', corrections: 'Corrections',
});

export const ATTEMPT_SIGNAL_TITLE = Object.freeze({
  [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]: 'Left the page, then a burst of right parts',
  [ATTEMPT_SIGNAL_KIND.PASTED]: 'Pasted into a math box',
  [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY]: 'Right first time on a hard question, with no tool work',
});
// A few words for a count ("pasted into a math box on 6 of 40 answers").
export const ATTEMPT_SIGNAL_PHRASE = Object.freeze({
  [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]: 'left the page, then a burst of right parts',
  [ATTEMPT_SIGNAL_KIND.PASTED]: 'pasted into a math box',
  [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY]: 'right first time on a hard question with no tool work',
});

const factsSentence = (signal) => {
  if (signal.kind === ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT) {
    return `The page was hidden (another tab or app, or the screen turned off) for ${awayWords(signal.awaySeconds)}. Within a minute of coming back, ${plural(Math.max(2, num(signal.partCount, 2)), 'part')} were answered and marked right.`;
  }
  if (signal.kind === ATTEMPT_SIGNAL_KIND.PASTED) {
    return `Something was pasted into the answer box of part ${num(signal.partIndex) + 1}. What was pasted is not recorded.`;
  }
  const parts = Math.max(1, num(signal.partCount, 1));
  return `${parts === 1 ? 'The answer was' : `All ${parts} parts were`} right on the first try, on a question of difficulty band ${num(signal.difficultyBand, 3)}, with no checkpoint, scratchpad or tool work to look at.`;
};

// In the class's scheduled time or outside it, as the record says. A record
// that does not say is one the bell schedule could not answer for (no
// schedule yet, an A/B day not chosen, the period not on that day's
// schedule): that is said in words, never read as "outside".
// A reviewing teacher's note is the teacher's own words: not a recorded fact,
// and not generated evidence. Every screen, print and export says so.
export const TEACHER_NOTE_LABEL = 'Teacher-authored: written by the teacher, not a recorded fact or generated evidence.';
export const TEACHER_NOTE_HEADING = 'Teacher\'s note (the teacher\'s own words)';
export const SIGNALS_NOT_LOADED = 'Signals could not be loaded. That is a failed read, not an absence of signals.';
export const CLASS_TIME_NOT_KNOWN = 'Class time not known';
const classTimeWords = (signal) => (
  signal.duringClass === true ? 'During the class\'s scheduled time'
    : signal.duringClass === false ? 'Outside the class\'s scheduled time'
      : CLASS_TIME_NOT_KNOWN
);
const supportsWords = (signal) => {
  if (!Array.isArray(signal.supports)) return '';
  const labels = signal.supports.map((id) => supportShortLabel(id)).filter(Boolean);
  return labels.length ? `Supports in effect: ${labels.join(', ')}` : 'No supports in effect';
};

/**
 * One stored signal as the teacher reads it, or null for a record this build
 * does not know. `assignmentsById` gives the assignment's title when the
 * caller has it; `formatWhen` turns its time into words (the caller's own
 * date format), and is left out where no clock is wanted.
 */
export const describeAttemptSignal = (signal = {}, { assignmentsById = null, formatWhen = null } = {}) => {
  if (!ATTEMPT_SIGNAL_KINDS.includes(signal?.kind)) return null;
  const questionNumber = num(signal.questionIndex) + 1;
  const role = clean(signal.activityRole);
  const assignment = assignmentsById?.get?.(clean(signal.assignmentId)) || assignmentsById?.[clean(signal.assignmentId)] || null;
  const recordedAtMs = signalMillis(signal.recordedAt);
  const reviewedAtMs = signalMillis(signal.dismissedAt);
  const reviewed = Boolean(signal.dismissedAt);
  const when = recordedAtMs && typeof formatWhen === 'function' ? clean(formatWhen(recordedAtMs)) : '';
  const where = [
    clean(assignment?.title),
    ROLE_LABEL[role] || '',
    `Question ${questionNumber}`,
    num(signal.attemptNumber, 1) > 1 ? `try ${num(signal.attemptNumber)}` : '',
  ].filter(Boolean).join(' · ');
  return {
    id: clean(signal.id),
    kind: signal.kind,
    title: ATTEMPT_SIGNAL_TITLE[signal.kind],
    facts: factsSentence(signal),
    where,
    when,
    // The context recorded with the fact, each a line of its own or ''.
    classTime: classTimeWords(signal),
    supports: supportsWords(signal),
    notConclusive: NOT_CONCLUSIVE,
    assignmentId: clean(signal.assignmentId),
    assignmentTitle: clean(assignment?.title),
    questionIndex: num(signal.questionIndex),
    partIndex: signal.kind === ATTEMPT_SIGNAL_KIND.PASTED ? num(signal.partIndex) : null,
    activityRole: role,
    duringClass: typeof signal.duringClass === 'boolean' ? signal.duringClass : null,
    supportIds: Array.isArray(signal.supports) ? signal.supports.map(clean).filter(Boolean) : null,
    recordedAtMs,
    // Reviewed (the stored fields are dismissedAt / dismissedByEmail): who,
    // when and the teacher's own note. A reviewed signal stays in the record.
    reviewed,
    dismissed: reviewed,
    reviewedAtMs,
    reviewedBy: clean(signal.dismissedByEmail),
    reviewNote: clean(signal.reviewNote),
    // The note is the teacher's own words, and is labelled so wherever it is shown or exported.
    reviewNoteLabel: clean(signal.reviewNote) ? TEACHER_NOTE_LABEL : '',
  };
};

const newestFirst = (a, b) => b.recordedAtMs - a.recordedAtMs
  || a.assignmentId.localeCompare(b.assignmentId)
  || a.questionIndex - b.questionIndex
  || a.kind.localeCompare(b.kind);

/** Every known signal, described, newest first, optionally for one assignment. */
export const describeAttemptSignals = (signals = [], { assignmentId = null, assignmentsById = null, formatWhen = null } = {}) => (
  (Array.isArray(signals) ? signals : [])
    .filter((signal) => !assignmentId || clean(signal?.assignmentId) === clean(assignmentId))
    .map((signal) => describeAttemptSignal(signal, { assignmentsById, formatWhen }))
    .filter(Boolean)
    .sort(newestFirst)
);

/** The signals that still need attention: not yet reviewed. */
export const openAttemptSignals = (signals = [], options = {}) => describeAttemptSignals(signals, options).filter((entry) => !entry.reviewed);

/** The signals a teacher has reviewed: kept, with who, when and their note. */
export const reviewedAttemptSignals = (signals = [], options = {}) => describeAttemptSignals(signals, options).filter((entry) => entry.reviewed);

/** One question's signals in an assignment, oldest first (the order they happened). */
export const questionAttemptSignals = (signals = [], { assignmentId, questionIndex, formatWhen = null } = {}) => (
  describeAttemptSignals(signals, { assignmentId, formatWhen })
    .filter((entry) => entry.questionIndex === num(questionIndex, -1))
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs || a.kind.localeCompare(b.kind))
);
