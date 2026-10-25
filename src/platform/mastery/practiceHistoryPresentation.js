// PRACTICE HISTORY, IN A STUDENT'S WORDS.
//
// The log named supports by their storage ids — "textToSpeech",
// "mathScaffold", even "modification:reduce-complexity" — and a student
// surface must never say "modification" at all: the support catalog's
// studentLabel exists precisely because a teacher's word can say IEP, 504 or
// modified (functions/shared/supportCatalog.mjs). Names now come from that
// catalog, a support with no student name is not shown, and an id this build
// does not recognise is not shown either — never a raw id.
//
// It also stopped silently at the most recent answers. It now says how many
// it is showing and that older answers still count, and adds a summary by
// week so the cap reads as "these weeks", not as "everything I ever did".
//
// Pure: the timeline itself is still evidenceTimelineService's.

import { studentFacingLabel } from '../../../functions/shared/supportCatalog.mjs';
import { CATALOG_ID_FOR_SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';
import { weekKeyFor } from '../../../functions/shared/weeklyPathGrade.mjs';
import { weekOfLabel } from './progressPresentation.js';

/** How many answers Practice History loads: the fetch and the notice share it. */
export const PRACTICE_HISTORY_EVENT_LIMIT = 300;

// Help with the mathematics itself is recorded per attempt (supportUsage
// flags), not in the support catalog. These names follow the words the mastery
// checklist already uses with students ("hints, worked steps").
const ATTEMPT_HELP_NAMES = Object.freeze({
  hint: 'Hint',
  workedExample: 'Worked steps',
  mathScaffold: 'Step-by-step help',
  contextScaffold: 'Help understanding the problem',
  remediation: 'Review lesson',
  teacherAssistance: 'Help from your teacher',
  calculator: 'Calculator',
});

/**
 * The name a student sees for one recorded support, or null when it is not
 * shown to students. The Path records canonical ids (textToSpeech);
 * assignments record catalog ids (text-to-speech). Both reach the catalog.
 */
export const studentSupportName = (supportType) => {
  const raw = String(supportType ?? '').trim();
  if (!raw || raw.startsWith('modification:')) return null;
  if (Object.hasOwn(ATTEMPT_HELP_NAMES, raw)) return ATTEMPT_HELP_NAMES[raw];
  const catalogId = Object.hasOwn(CATALOG_ID_FOR_SUPPORT, raw) ? CATALOG_ID_FOR_SUPPORT[raw] : raw;
  return studentFacingLabel(catalogId);
};

/** Distinct student-facing names, in first-seen order. */
export const studentSupportNames = (supportTypes = []) => [
  ...new Set((Array.isArray(supportTypes) ? supportTypes : []).map(studentSupportName).filter(Boolean)),
];

/**
 * The attempt chip. The classifier's own words stand, except the one that
 * names a modification ("Modified evidence"): a student is told only that the
 * work was a version adjusted for them.
 */
export const studentAttemptLabel = (classification = {}) => (
  classification?.key === 'modified' ? 'Adjusted version' : (classification?.label || 'Answer')
);

/** "Showing your 300 most recent answers…" — only when the list is actually capped. */
export const practiceHistoryCapNotice = ({ loaded = 0, limit = PRACTICE_HISTORY_EVENT_LIMIT } = {}) => (
  Number(loaded) >= Number(limit)
    ? `Showing your ${limit} most recent answers. Older answers still count toward your mastery.`
    : null
);

const eventMillis = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One row per week (newest first) of the timeline items shown: answers, how
 * many were correct, how many on your own.
 *
 * When the loaded list reached its limit, older answers exist that are not in
 * it, and the cut falls inside the week of the oldest answer LOADED — whatever
 * skill filter the timeline shows. That week (and anything older) is partial.
 */
export const summarizePracticeByWeek = (timeline = [], {
  loadedEvents = [],
  limit = PRACTICE_HISTORY_EVENT_LIMIT,
} = {}) => {
  const loaded = Array.isArray(loadedEvents) ? loadedEvents : [];
  const oldestLoadedAt = loaded.reduce((oldest, event) => {
    const at = eventMillis(event?.occurredAt);
    return at > 0 && (oldest === null || at < oldest) ? at : oldest;
  }, null);
  const capped = loaded.length >= Number(limit);
  const byWeek = new Map();
  (Array.isArray(timeline) ? timeline : []).forEach((item) => {
    const at = Number(item?.timestamp);
    if (!Number.isFinite(at) || at <= 0) return;
    const weekKey = weekKeyFor(at);
    const row = byWeek.get(weekKey) || { weekKey, answers: 0, correct: 0, onYourOwn: 0 };
    row.answers += 1;
    if (item.isCorrect) row.correct += 1;
    if (item.classification?.isIndependent) row.onYourOwn += 1;
    byWeek.set(weekKey, row);
  });
  const cutWeekKey = capped && oldestLoadedAt ? weekKeyFor(oldestLoadedAt) : null;
  return [...byWeek.values()]
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
    .map((row) => ({
      ...row,
      label: weekOfLabel(row.weekKey),
      accuracy: Math.round((row.correct / row.answers) * 100),
      partial: Boolean(cutWeekKey && row.weekKey <= cutWeekKey),
    }));
};

// "SEE THE SOLUTION" ON A MISSED PATH QUESTION (MP18).
//
// Practice History was read-only: a missed question offered no way to see
// why. A My Math Path question the student finished without getting right
// now offers its worked solution, from the same review the session's end
// screen shows (getMyPathSessionRecap), fetched only when asked for. The
// review is released only for a finished session, so the solution is too.
//
// Not offered: "Try a similar one". The review hands this screen the question
// as the student saw it, and no generator builds a sibling from that (none of
// the 3,337 Path templates' questions, in that shape, matched a family that
// makes one), so a new question would need a new server call and a way to
// practise it unscored. Assignment misses keep their own review in Review My
// Work.

const textOf = (value) => String(value ?? '').trim();

/**
 * The session and question whose solution a Practice History answer can open,
 * or null. Only a My Math Path answer that CLOSED its question without getting
 * it right: an earlier miss on a question later answered right has nothing
 * to review, and the review is keyed by the session and the question.
 */
export const practiceHistorySolutionSource = (event = {}) => {
  if (event?.source?.kind !== 'myMathPath') return null;
  if (event?.performance?.status !== 'finalized' || event?.performance?.isCorrect === true) return null;
  const sessionId = textOf(event.source.activitySessionId);
  const questionInstanceId = textOf(event.questionSnapshot?.questionInstanceId);
  return sessionId && questionInstanceId ? { sessionId, questionInstanceId } : null;
};

export const PRACTICE_SOLUTION = Object.freeze({
  READY: 'ready',
  NOT_FINISHED: 'notFinished',
  NOT_AVAILABLE: 'notAvailable',
  ERROR: 'error',
});

const NOT_FINISHED_MESSAGE = 'You can see the solution once you finish this session.';
const NOT_AVAILABLE_MESSAGE = 'This solution cannot be shown here. Your teacher can go over it with you.';
const ERROR_MESSAGE = 'The solution could not load. Your work is saved.';

/**
 * What the solution panel shows, from the session's review (or the error the
 * request ended with). READY carries the review's own item for the question.
 */
export const describePracticeHistorySolution = ({ recap = null, error = null, questionInstanceId = '' } = {}) => {
  if (error) {
    const code = textOf(error?.code).replace(/^functions\//, '');
    if (code === 'failed-precondition') return { state: PRACTICE_SOLUTION.NOT_FINISHED, message: NOT_FINISHED_MESSAGE };
    if (code === 'not-found') return { state: PRACTICE_SOLUTION.NOT_AVAILABLE, message: NOT_AVAILABLE_MESSAGE };
    return { state: PRACTICE_SOLUTION.ERROR, message: ERROR_MESSAGE };
  }
  if (!recap || recap.available === false) return { state: PRACTICE_SOLUTION.NOT_FINISHED, message: NOT_FINISHED_MESSAGE };
  const wanted = textOf(questionInstanceId);
  const item = (Array.isArray(recap.items) ? recap.items : []).find((entry) => wanted && textOf(entry?.questionInstanceId) === wanted);
  // Not in the review: answered before reviews were recorded.
  return item
    ? { state: PRACTICE_SOLUTION.READY, item }
    : { state: PRACTICE_SOLUTION.NOT_AVAILABLE, message: NOT_AVAILABLE_MESSAGE };
};
