// TEACHER SIGNALS: FACTS ABOUT ONE ATTEMPT (docs/platform/SHOWING_THE_PROCESS.md, section 7).
//
// Three facts a student's device may notice about an attempt, each "worth a
// conversation" for the teacher and nothing more:
//
//   leftThenRight   the page was hidden (visibilitychange), and soon after it
//                   came back two or more parts were answered and marked right;
//   pasted          a paste into a math answer field: the fact and the part;
//   hardFirstTry    every part right on the first try, on a question of
//                   difficulty band 3 or higher, with no checkpoint and no
//                   tool moves.
//
// WHAT IS NEVER HERE. No keystroke, no screenshot, no camera, no response and
// no pasted text: a paste is read only for where it landed, and an answer only
// for "did this part change" and "was it marked right". The record that leaves
// the device (buildAttemptSignalRecord) is a closed list of counts and
// positions; firestore.rules refuses any other key.
//
// WHAT NEVER READS IT. No grade, attempt or mastery path:
// tests/platform/attemptSignalsNeverGrade.test.mjs reads every one of them.
//
// A student's device runs only this module and the store's writer; what the
// teacher reads is src/platform/teacher/attemptSignalsView.js.

import { normalizeStudentProfile } from '../../studentSupport.js';

export const ATTEMPT_SIGNAL_KIND = Object.freeze({
  LEFT_THEN_RIGHT: 'leftThenRight',
  PASTED: 'pasted',
  HARD_FIRST_TRY: 'hardFirstTry',
});
export const ATTEMPT_SIGNAL_KINDS = Object.freeze(Object.values(ATTEMPT_SIGNAL_KIND));
export const ATTEMPT_SIGNAL_SCHEMA_VERSION = 1;

// A hidden page shorter than this is a notification, an accidental tap or a
// support tool: the same floor as the Live view's focus-loss count (App.jsx).
export const MIN_AWAY_MS = 8000;
// "Soon after returning".
export const RETURN_WINDOW_MS = 60000;
export const MIN_BURST_PARTS = 2;
export const HARD_DIFFICULTY_BAND = 3;

// Limits the record is clamped to, and the rules check (firestore.rules
// attemptSignalValid).
export const MAX_QUESTION_INDEX = 999;
export const MAX_PART_INDEX = 49;
export const MAX_PART_COUNT = 50;
export const MAX_AWAY_SECONDS = 86400;
export const MAX_ATTEMPT_NUMBER = 99;
export const ATTEMPT_SIGNAL_ROLES = Object.freeze(['warmup', 'classwork', 'dol', 'practice', 'quiz', 'test', 'review', 'corrections']);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const clampInt = (value, min, max) => {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
};

/*
 * A SUPPORT THAT EXPLAINS THE PATTERN RAISES NO SIGNAL.
 *
 * Read aloud, translation and the glossary can move focus off the page (a
 * browser's own reader or translator, another tab), and See every part at
 * once shows the parts together, so several are answered together: none of
 * these students raises "left the page, then a burst of right parts". A
 * student whose response is written in a word processor pastes it in: no
 * "pasted" for them. Nothing in a support profile explains a first-try right
 * answer, so that fact has no exemption.
 */
const EXEMPTING_SUPPORTS = Object.freeze({
  [ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT]: ['text-to-speech', 'translation', 'glossary-lookup', 'every-part-at-once'],
  [ATTEMPT_SIGNAL_KIND.PASTED]: ['word-processor-response'],
  [ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY]: [],
});

/** The signal kinds this student's support profile explains, as a Set. */
export const exemptAttemptSignalKinds = (profile, { nowValue = Date.now() } = {}) => {
  const normalized = normalizeStudentProfile(profile || {}, { nowValue });
  const supports = new Set([...list(normalized.accommodations), ...list(normalized.modifications)]);
  const exempt = new Set();
  ATTEMPT_SIGNAL_KINDS.forEach((kind) => {
    if (EXEMPTING_SUPPORTS[kind].some((supportId) => supports.has(supportId))) exempt.add(kind);
  });
  // A translation language on the profile is a translation tool in use, with
  // or without the catalog entry beside it.
  if (clean(normalized.translationLanguage) && clean(normalized.translationLanguage).toLowerCase() !== 'en') {
    exempt.add(ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT);
  }
  return exempt;
};

/** The question's authored difficulty band, 0 when it has none. */
export const questionDifficultyBand = (question = {}) => {
  const band = Number(question?.difficultyBand ?? question?.cognitiveDemand?.difficultyBand ?? question?.difficulty);
  return Number.isFinite(band) ? Math.max(0, Math.floor(band)) : 0;
};

// Question types whose answer is built in a tool: the tool's moves are the
// work, so "no tool work" can never be said of them.
const TOOL_BUILT_TYPES = [
  'functiongraph', 'modelinglab', 'relationshipmodel', 'stepalgebra', 'stepbystep', 'systemsworkspace',
  'sequenceexplorer', 'transformationslab', 'interactivegraph', 'composed', 'workflow', 'numberline', 'graph',
];

/**
 * Did this attempt carry work a teacher can look at? A checkpoint on any
 * part, a tool's structured response, a composed question's stages, or a
 * question whose answer is built in a tool.
 */
export const attemptHasToolWork = ({ question = {}, answerState = {}, toolWorkNoted = false } = {}) => {
  if (toolWorkNoted) return true;
  if (answerState?.toolResponse) return true;
  if (question?.checkpoint) return true;
  const fields = [...list(question?.answerFields), ...list(question?.responses), ...list(question?.responseFields)];
  if (fields.some((field) => field?.checkpoint)) return true;
  if (list(question?.workflow?.stages).length || list(question?.stages).length) return true;
  const type = clean(question?.type || question?.toolId).toLowerCase();
  return TOOL_BUILT_TYPES.some((token) => type.includes(token));
};

const partKey = (part, index) => clean(part?.id) || `#${index}`;

// The per-part values of an answer-box question, when the response key is the
// boxes' own map (MultiAnswerGrader). Compared in memory to see which part
// changed; never stored, never sent.
const partValuesFrom = (responseKey) => {
  if (typeof responseKey !== 'string' || !responseKey.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(responseKey);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * When the page was last away, and for how long. One clock for the page: a
 * student who leaves on one question and answers the next on returning is the
 * same pattern.
 */
export const createPageAwayClock = ({ now = () => Date.now() } = {}) => {
  let hiddenAt = 0;
  let lastReturn = null;
  return {
    pageHidden() {
      if (!hiddenAt) hiddenAt = now();
    },
    pageVisible() {
      if (!hiddenAt) return;
      const at = now();
      const awayMs = Math.max(0, at - hiddenAt);
      hiddenAt = 0;
      // A short absence leaves an earlier, longer one standing.
      if (awayMs >= MIN_AWAY_MS) lastReturn = { at, awayMs };
    },
    /** The return a moment at `time` falls soon after, or null. */
    returnBefore(time) {
      if (!lastReturn) return null;
      const since = time - lastReturn.at;
      return since >= 0 && since <= RETURN_WINDOW_MS ? lastReturn : null;
    },
  };
};

let sharedClock = null;
/** The page's own clock, listening to `visibilitychange` from first use. */
export const sharedPageAwayClock = () => {
  if (sharedClock) return sharedClock;
  sharedClock = createPageAwayClock();
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) sharedClock.pageHidden();
      else sharedClock.pageVisible();
    });
  }
  return sharedClock;
};

/**
 * One question's tracker. It is told when the answer changes, when a paste
 * lands and when an attempt is submitted, and answers with the facts that
 * attempt raised. It keeps no response: for each part, only when it last
 * changed and whether that was soon after a return.
 */
export const createAttemptSignalTracker = ({ clock = sharedPageAwayClock(), now = () => Date.now() } = {}) => {
  // partKey -> { token, afterReturn: { awayMs } | null }
  const parts = new Map();
  let seeded = false;
  let toolWorkNoted = false;

  return {
    /** The answer as the response module reports it (parts, responseKey). */
    noteAnswerState(answerState = {}) {
      const reported = list(answerState?.parts);
      if (!reported.length) return;
      const values = partValuesFrom(answerState?.responseKey);
      const at = now();
      reported.forEach((part, index) => {
        const key = partKey(part, index);
        const token = values && clean(part?.id) && Object.hasOwn(values, part.id)
          ? `v:${JSON.stringify(values[part.id] ?? '')}`
          : `c:${part?.isCorrect === true}`;
        const previous = parts.get(key);
        if (previous && previous.token === token) return;
        // What is on screen when the question opens (a restored draft) is not
        // something the student did just now.
        const returned = seeded && previous ? clock.returnBefore(at) : null;
        parts.set(key, { token, afterReturn: returned ? { awayMs: returned.awayMs } : null });
      });
      seeded = true;
    },

    /** A scratchpad saved, a step checked: work the teacher can open. */
    noteToolWork() {
      toolWorkNoted = true;
    },

    /** A paste into a math answer field, by the part it landed in. */
    pasteFact({ partIndex = 0, attemptNumber = 1 } = {}) {
      return {
        kind: ATTEMPT_SIGNAL_KIND.PASTED,
        partIndex: clampInt(partIndex, 0, MAX_PART_INDEX),
        attemptNumber: clampInt(attemptNumber, 1, MAX_ATTEMPT_NUMBER),
      };
    },

    /**
     * The facts one submitted attempt raised. `attemptNumber` counts this
     * attempt (1 for the first); `gradedParts` are the parts as marked
     * ({ id, isCorrect, graded }).
     */
    attemptSubmitted({ question = {}, answerState = {}, gradedParts = null, isCorrect = false, attemptNumber = 1 } = {}) {
      const facts = [];
      const marked = list(gradedParts ?? answerState?.parts);
      const attempt = clampInt(attemptNumber, 1, MAX_ATTEMPT_NUMBER);

      const burst = marked
        .map((part, index) => (part?.isCorrect === true && part?.graded !== false ? parts.get(partKey(part, index)) : null))
        .filter((entry) => entry?.afterReturn);
      if (burst.length >= MIN_BURST_PARTS) {
        facts.push({
          kind: ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT,
          partCount: clampInt(burst.length, MIN_BURST_PARTS, MAX_PART_COUNT),
          awaySeconds: clampInt(Math.max(...burst.map((entry) => entry.afterReturn.awayMs)) / 1000, 0, MAX_AWAY_SECONDS),
          attemptNumber: attempt,
        });
      }

      const band = questionDifficultyBand(question);
      const everyPartRight = isCorrect === true
        && marked.every((part) => part?.graded === false || part?.isCorrect === true);
      if (
        attempt === 1
        && everyPartRight
        && band >= HARD_DIFFICULTY_BAND
        && !attemptHasToolWork({ question, answerState, toolWorkNoted })
      ) {
        facts.push({
          kind: ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY,
          difficultyBand: clampInt(band, HARD_DIFFICULTY_BAND, 9),
          partCount: clampInt(Math.max(1, marked.length), 1, MAX_PART_COUNT),
          attemptNumber: 1,
        });
      }

      // Each part's "soon after returning" is spent by the attempt it was in.
      parts.forEach((entry) => { entry.afterReturn = null; });
      return facts;
    },
  };
};

/**
 * One document per fact: a question raises each kind once (a paste once per
 * part), and the first one stands. firestore.rules holds the id to this.
 */
export const attemptSignalDocumentId = ({ assignmentId, questionIndex, kind, partIndex = 0 } = {}) => {
  const base = `${clean(assignmentId)}__${clampInt(questionIndex, 0, MAX_QUESTION_INDEX)}__${clean(kind)}`;
  return kind === ATTEMPT_SIGNAL_KIND.PASTED ? `${base}__${clampInt(partIndex, 0, MAX_PART_INDEX)}` : base;
};

/**
 * The stored record: positions and counts, and nothing a fact could carry in
 * by another name. Null when the fact names no known kind or no assignment.
 * (`recordedAt` is added by the store, as the server's time.)
 */
export const buildAttemptSignalRecord = ({ studentId, assignmentId, questionIndex, activityRole = null, fact = {} } = {}) => {
  const kind = clean(fact?.kind);
  const student = clean(studentId);
  const assignment = clean(assignmentId);
  if (!ATTEMPT_SIGNAL_KINDS.includes(kind) || !student || !assignment || assignment.length > 200) return null;
  const record = {
    schemaVersion: ATTEMPT_SIGNAL_SCHEMA_VERSION,
    studentId: student,
    assignmentId: assignment,
    questionIndex: clampInt(questionIndex, 0, MAX_QUESTION_INDEX),
    kind,
    attemptNumber: clampInt(fact.attemptNumber, 1, MAX_ATTEMPT_NUMBER),
  };
  const role = clean(activityRole).toLowerCase();
  if (ATTEMPT_SIGNAL_ROLES.includes(role)) record.activityRole = role;
  if (kind === ATTEMPT_SIGNAL_KIND.PASTED) {
    record.partIndex = clampInt(fact.partIndex, 0, MAX_PART_INDEX);
  }
  if (kind === ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT) {
    record.partCount = clampInt(fact.partCount, MIN_BURST_PARTS, MAX_PART_COUNT);
    record.awaySeconds = clampInt(fact.awaySeconds, 0, MAX_AWAY_SECONDS);
  }
  if (kind === ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY) {
    record.partCount = clampInt(fact.partCount, 1, MAX_PART_COUNT);
    record.difficultyBand = clampInt(fact.difficultyBand, HARD_DIFFICULTY_BAND, 9);
  }
  return record;
};
