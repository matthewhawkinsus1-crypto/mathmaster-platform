// WHAT A TEACHER READS OF AN ATTEMPT FACT ("worth a conversation").
//
// The facts are recorded by the student's device
// (src/platform/signals/attemptSignalFacts.js) and stored under the student's
// roster row. This module turns one into a title and a sentence of facts:
// never a verdict, never a word about cheating, and nothing it was not told.
// It is teacher code: no student screen imports it.

import { ATTEMPT_SIGNAL_KIND, ATTEMPT_SIGNAL_KINDS } from '../signals/attemptSignalFacts.js';

export const WORTH_A_CONVERSATION = 'Worth a conversation';
export const WORTH_A_CONVERSATION_NOTE = 'Facts about an attempt, not findings. They never change a score, an attempt or mastery.';

const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
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

const factsSentence = (signal) => {
  if (signal.kind === ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT) {
    return `The page was hidden for ${awayWords(signal.awaySeconds)}. Within a minute of coming back, ${plural(Math.max(2, num(signal.partCount, 2)), 'part')} were answered and marked right.`;
  }
  if (signal.kind === ATTEMPT_SIGNAL_KIND.PASTED) {
    return `Something was pasted into the answer box of part ${num(signal.partIndex) + 1}. What was pasted is not recorded.`;
  }
  const parts = Math.max(1, num(signal.partCount, 1));
  return `${parts === 1 ? 'The answer was' : `All ${parts} parts were`} right on the first try, on a question of difficulty band ${num(signal.difficultyBand, 3)}, with no checkpoint, scratchpad or tool work to look at.`;
};

/**
 * One stored signal as the teacher reads it, or null for a record this build
 * does not know. `assignmentsById` gives the assignment's title when the
 * caller has it.
 */
export const describeAttemptSignal = (signal = {}, { assignmentsById = null } = {}) => {
  if (!ATTEMPT_SIGNAL_KINDS.includes(signal?.kind)) return null;
  const questionNumber = num(signal.questionIndex) + 1;
  const role = ROLE_LABEL[clean(signal.activityRole)] || '';
  const assignment = assignmentsById?.get?.(clean(signal.assignmentId)) || assignmentsById?.[clean(signal.assignmentId)] || null;
  const where = [
    clean(assignment?.title),
    role,
    `Question ${questionNumber}`,
    num(signal.attemptNumber, 1) > 1 ? `try ${num(signal.attemptNumber)}` : '',
  ].filter(Boolean).join(' · ');
  return {
    id: clean(signal.id),
    kind: signal.kind,
    title: ATTEMPT_SIGNAL_TITLE[signal.kind],
    facts: factsSentence(signal),
    where,
    assignmentId: clean(signal.assignmentId),
    questionIndex: num(signal.questionIndex),
    recordedAtMs: toMillis(signal.recordedAt),
    dismissed: Boolean(signal.dismissedAt),
  };
};

/**
 * The signals still worth a conversation: known kinds, not dismissed, newest
 * first, optionally for one assignment.
 */
export const openAttemptSignals = (signals = [], { assignmentId = null, assignmentsById = null } = {}) => (
  (Array.isArray(signals) ? signals : [])
    .filter((signal) => !assignmentId || clean(signal?.assignmentId) === clean(assignmentId))
    .map((signal) => describeAttemptSignal(signal, { assignmentsById }))
    .filter((entry) => entry && !entry.dismissed)
    .sort((a, b) => b.recordedAtMs - a.recordedAtMs
      || a.assignmentId.localeCompare(b.assignmentId)
      || a.questionIndex - b.questionIndex
      || a.kind.localeCompare(b.kind))
);
