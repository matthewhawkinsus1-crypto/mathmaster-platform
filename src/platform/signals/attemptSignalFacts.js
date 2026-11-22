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
import { derivedSupportIds, resolveEffectiveSupportPlan, supportAppliesToRole, translationLanguageOf } from '../../../functions/shared/supportProfileModel.mjs';
import { INCLUSION_IMPLIED_SUPPORT_IDS, SUPPORT_CATALOG } from '../../../functions/shared/supportCatalog.mjs';
import { lastPlatformLinkAt } from './signalPageNotes.js';

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
// A long absence is a locked screen while working on paper, or a tab left
// open overnight: not the pattern, and never raised.
export const MAX_AWAY_MS = 5 * 60000;
// "Soon after returning".
export const RETURN_WINDOW_MS = 60000;
// A link the platform itself opened in a new tab (a teacher's study sheet)
// hides the page: an absence that starts this soon after it is the link's.
export const PLATFORM_LINK_GRACE_MS = 5000;
export const MIN_BURST_PARTS = 2;
export const HARD_DIFFICULTY_BAND = 3;

// Limits the record is clamped to, and the rules check (firestore.rules
// attemptSignalValid).
export const MAX_QUESTION_INDEX = 999;
export const MAX_PART_INDEX = 49;
export const MAX_PART_COUNT = 50;
export const MAX_AWAY_SECONDS = 300;
export const MAX_ATTEMPT_NUMBER = 99;
// The supports a signal may name beside it: the catalog's own ids, and no
// more of them than the catalog holds (firestore.rules lists the same ids).
export const ATTEMPT_SIGNAL_SUPPORT_IDS = Object.freeze(SUPPORT_CATALOG.map((entry) => entry.id));
export const MAX_SIGNAL_SUPPORTS = ATTEMPT_SIGNAL_SUPPORT_IDS.length;
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
  if (translationLanguageOf(normalized.translationLanguage)) exempt.add(ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT);
  return exempt;
};

/**
 * The supports in effect for this student, on this kind of activity, today, as
 * catalog ids: stored beside each signal, so whoever reads it later reads it
 * with the supports the attempt was made under.
 *
 * "In effect" is the support plan's own answer (supportProfileModel.mjs):
 *   - a support limited to some activities (`appliesTo`) is named only on
 *     those: extra time on the DOL alone is not in effect on Classwork;
 *   - the supports inclusion brings with it are in effect for a student whose
 *     plan says inclusion, though no entry names them;
 *   - a translation language on the plan is the translation tool.
 * With no `activityRole`, every support on the plan is named. The list is
 * never cut short: it cannot hold more ids than the catalog has
 * (MAX_SIGNAL_SUPPORTS is the catalog's size, and firestore.rules allows as many).
 */
export const supportsInEffect = (profile, { nowValue = Date.now(), activityRole = null } = {}) => {
  const plan = resolveEffectiveSupportPlan(profile || {}, { nowValue });
  const known = new Set(ATTEMPT_SIGNAL_SUPPORT_IDS);
  const entries = [...list(plan.accommodations), ...list(plan.modifications)].map((entry) => clean(typeof entry === 'object' ? entry?.id : entry));
  const ids = new Set([
    ...entries,
    ...derivedSupportIds(plan),
    ...(plan.inclusionStatus === true ? INCLUSION_IMPLIED_SUPPORT_IDS : []),
  ].filter((id) => known.has(id) && supportAppliesToRole(plan, id, activityRole)));
  return [...ids].sort();
};

/** The question's authored difficulty band, 0 when it has none. */
export const questionDifficultyBand = (question = {}) => {
  const band = Number(question?.difficultyBand ?? question?.cognitiveDemand?.difficultyBand ?? question?.difficulty);
  return Number.isFinite(band) ? Math.max(0, Math.floor(band)) : 0;
};

/**
 * Did this attempt carry work a teacher can look at? A checkpoint on any
 * part, a tool's structured response, a composed question's stages, or work
 * the host noted (a scratchpad, a step). Whether the question is answered in
 * boxes at all is the engine's to say, from the module it drew
 * (`drawnInAnswerBoxes`): a type's name does not decide it.
 */
export const attemptHasToolWork = ({ question = {}, answerState = {}, toolWorkNoted = false } = {}) => {
  if (toolWorkNoted) return true;
  if (answerState?.toolResponse) return true;
  if (question?.checkpoint) return true;
  const fields = [...list(question?.answerFields), ...list(question?.responses), ...list(question?.responseFields)];
  if (fields.some((field) => field?.checkpoint)) return true;
  return Boolean(list(question?.workflow?.stages).length || list(question?.stages).length);
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
export const createPageAwayClock = ({ now = () => Date.now(), linkAt = () => 0 } = {}) => {
  let hiddenAt = 0;
  let hiddenByPlatformLink = false;
  let platformLinkAt = 0;
  let lastReturn = null;
  let copiedInPage = false;
  return {
    /** The platform opened one of its own links in a new tab. */
    platformLinkOpened() {
      platformLinkAt = now();
    },
    pageHidden() {
      if (hiddenAt) return;
      hiddenAt = now();
      // The link's time: told to this clock, or noted for the page before this
      // module had loaded (signalPageNotes.js).
      const opened = Math.max(platformLinkAt, Number(linkAt()) || 0);
      hiddenByPlatformLink = opened > 0 && hiddenAt >= opened && hiddenAt - opened <= PLATFORM_LINK_GRACE_MS;
      platformLinkAt = 0;
      // What is on the clipboard after time elsewhere is not known to be ours.
      copiedInPage = false;
    },
    pageVisible() {
      if (!hiddenAt) return;
      const at = now();
      const awayMs = Math.max(0, at - hiddenAt);
      const excused = hiddenByPlatformLink;
      hiddenAt = 0;
      hiddenByPlatformLink = false;
      // Too short (a notification), too long (a locked screen, a tab left
      // open) or the platform's own link: none is a return to count from, and
      // an earlier one still stands.
      if (!excused && awayMs >= MIN_AWAY_MS && awayMs <= MAX_AWAY_MS) lastReturn = { at, awayMs };
    },
    /** The return a moment at `time` falls soon after, or null. */
    returnBefore(time) {
      if (!lastReturn) return null;
      const since = time - lastReturn.at;
      return since >= 0 && since <= RETURN_WINDOW_MS ? lastReturn : null;
    },
    /** A copy or cut inside the page: the clipboard holds the page's own text. */
    pageCopied() {
      copiedInPage = true;
    },
    /** The window lost focus: something else may have filled the clipboard. */
    pageBlurred() {
      copiedInPage = false;
    },
    /** Is the clipboard known to hold what was copied from this page? */
    clipboardIsFromPage() {
      return copiedInPage;
    },
  };
};

let sharedClock = null;
/** The page's own clock, listening to `visibilitychange` from first use. */
export const sharedPageAwayClock = () => {
  if (sharedClock) return sharedClock;
  sharedClock = createPageAwayClock({ linkAt: lastPlatformLinkAt });
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) sharedClock.pageHidden();
      else sharedClock.pageVisible();
    });
    // Copying the prompt's expression, or part (a)'s answer into part (b), is
    // the page's own text: a paste that follows it is not a signal. Only the
    // fact of the copy is noted, never what was copied.
    document.addEventListener('copy', () => sharedClock.pageCopied(), true);
    document.addEventListener('cut', () => sharedClock.pageCopied(), true);
    if (typeof window !== 'undefined') window.addEventListener?.('blur', () => sharedClock.pageBlurred());
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

    /**
     * A paste into a math answer field, by the part it landed in. Null when
     * the clipboard holds what was just copied from this page, and null for a
     * part past the last one a record can name (MAX_PART_INDEX): a fact that
     * named the wrong part, or two parts filed as one, would not be a fact.
     */
    pasteFact({ partIndex = 0, attemptNumber = 1 } = {}) {
      if (clock.clipboardIsFromPage?.()) return null;
      const part = Math.floor(Number(partIndex));
      if (!Number.isFinite(part) || part < 0 || part > MAX_PART_INDEX) return null;
      return {
        kind: ATTEMPT_SIGNAL_KIND.PASTED,
        partIndex: part,
        attemptNumber: clampInt(attemptNumber, 1, MAX_ATTEMPT_NUMBER),
      };
    },

    /**
     * The facts one submitted attempt raised. `attemptNumber` counts this
     * attempt (1 for the first); `gradedParts` are the parts as marked
     * ({ id, isCorrect, graded }); `drawnInAnswerBoxes` is the engine saying
     * the question was answered in boxes and nothing else (no tool on screen
     * whose moves are the work). Without it "no tool work" is never said.
     */
    attemptSubmitted({ question = {}, answerState = {}, gradedParts = null, isCorrect = false, attemptNumber = 1, drawnInAnswerBoxes = false } = {}) {
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
        && drawnInAnswerBoxes === true
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
 * (`recordedAt` is added by the store, as the server's time: the "when".)
 */
export const buildAttemptSignalRecord = ({ studentId, assignmentId, questionIndex, activityRole = null, fact = {}, duringClass = null, supports = null } = {}) => {
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
  // In the class's scheduled time or outside it, from the bell schedule; left
  // out when the schedule could not say. Nothing else about where the student
  // was is recorded or inferred.
  if (typeof duringClass === 'boolean') record.duringClass = duringClass;
  // The supports in effect for this attempt (catalog ids only).
  if (Array.isArray(supports)) {
    const known = new Set(ATTEMPT_SIGNAL_SUPPORT_IDS);
    record.supports = [...new Set(supports.map(clean).filter((id) => known.has(id)))].sort().slice(0, MAX_SIGNAL_SUPPORTS);
  }
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
