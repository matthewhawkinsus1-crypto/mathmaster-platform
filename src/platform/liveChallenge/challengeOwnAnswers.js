/*
 * A STUDENT'S OWN ANSWERS IN THE RECAP, KEPT ON THE DEVICE THEY ANSWERED ON (LC19).
 *
 * The recap of a finished game lists every round the student played: how it
 * went, and the worked solution. It could not show what they TYPED, so a
 * student could not hold their answer against the solution. The server keeps
 * whether an answer was right and what it earned, not what it said: a receipt
 * is a verdict and its points, and the match result and every document a
 * classmate can read carry no answer, on purpose.
 *
 * The device that sent the answer has it, so it keeps a short, readable copy
 * of the answers the server confirmed, and the recap shows them beside the
 * rounds' results. That makes "theirs only" true by construction: an answer
 * never leaves the device it was typed on a second time, and a classmate's
 * answer is not in anything the recap is built from.
 *
 * WHAT THIS DOES NOT DO. The copy is on one device. A student who played on a
 * Chromebook and opens the recap on a phone sees their rounds and the worked
 * solutions without their own answers, and so does a student whose browser
 * keeps no storage (a private window). Showing it everywhere means the server
 * keeping what each student typed (in the match result, which a report and an
 * export are built from, or in each student's own summary), which is a
 * retention decision and a larger change; docs/architecture/
 * live-challenge-shell.md says what it would need.
 *
 * WHAT IS KEPT: at most four short rows per round (a typed answer, the choice
 * they made in its own words, or what a tool says they built: the same words
 * the released review of a test reads back, secureToolWorkSummary.js), keyed by
 * student, game and round, for the last few games and a month. Never the
 * question, never a verdict.
 *
 * Pure: storage is passed in (window.localStorage in the app, a Map in tests),
 * and every read and write is guarded, so a browser that refuses storage shows
 * a recap without answers and nothing else changes.
 */

import { describeToolWork, rawToolWorkOf } from '../assessment/secureToolWorkSummary.js';

export const OWN_ANSWER_STORAGE_PREFIX = 'mathmaster.liveChallenge.ownAnswers.v1';
export const OWN_ANSWER_MAX_ROWS = 4;
export const OWN_ANSWER_MAX_TEXT = 160;
export const OWN_ANSWER_MAX_LATEX = 240;
// The last few games, for about a month: a recap is looked at soon after the game.
export const OWN_ANSWER_KEEP_GAMES = 8;
export const OWN_ANSWER_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/*
 * AN ANSWER THAT IS MATHEMATICS. The math editor saves LaTeX (a typed 3/4 is
 * `\frac34`), which a screen must typeset rather than print. This is the
 * released review's own rule (secureExamResultsModel.answerIsLatex), decided
 * from the value; it is repeated here, not imported, because that module
 * carries the exam registries and this one loads with the game. A test holds
 * the two to the same answers.
 */
const LATEX_MARKUP = /\\[A-Za-z]+|\\[{}%$]|[\^_]\{/;
const UNESCAPED_DOLLAR = /(^|[^\\])\$/;
export const answerIsLatex = (value) => {
  const text = clean(value);
  return Boolean(text) && LATEX_MARKUP.test(text) && !UNESCAPED_DOLLAR.test(text);
};

export const OWN_ANSWER_FORMAT = Object.freeze({
  // What the student typed or a tool says they built: shown as it is.
  TEXT: 'text',
  // The math editor's LaTeX: typeset.
  LATEX: 'latex',
  // A choice's own words, authored (they may carry `$…$` math): through MathText.
  AUTHORED: 'authored',
});

const clip = (text) => (text.length > OWN_ANSWER_MAX_TEXT ? `${text.slice(0, OWN_ANSWER_MAX_TEXT - 1)}…` : text);

// The answer field that is a set of choices (LiveChallengeFieldQuestion's own
// list: a test holds the two together). Its answer is stored as the runtime id
// of the choice, which the student read as the choice's words.
export const CHOICE_FIELD_PROFILES = Object.freeze([
  'choice', 'multiplechoice', 'multiple-choice', 'singlechoice', 'single-choice', 'select',
]);
const profileOf = (field) => String(field?.inputProfile ?? field?.inputMode ?? field?.type ?? '').trim().toLowerCase();

/**
 * The rows that say what a student answered, from the question they were asked
 * and the payload their device sent, or null when there is nothing to say
 * (blank, a tool with no summary, a payload this cannot read).
 *
 * @returns {Array<{ label: string, value: string, format: string }> | null}
 */
export const ownAnswerRows = ({ question = null, responsePayload = null } = {}) => {
  try {
    if (!isObject(responsePayload)) return null;
    const toolId = clean(question?.pathToolId);
    let rows = [];
    if (toolId) {
      rows = describeToolWork(toolId, rawToolWorkOf(responsePayload)).map((row) => ({
        label: clean(row.label), value: clip(clean(row.value)), format: OWN_ANSWER_FORMAT.TEXT,
      }));
    } else if (isObject(responsePayload.responses)) {
      const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
      const questionChoices = Array.isArray(question?.choices) ? question.choices : [];
      const entries = Object.entries(responsePayload.responses);
      // The order the student met the fields in, then anything the fields do not name.
      const rank = (fieldId) => {
        const index = fields.findIndex((field) => String(field?.id) === String(fieldId));
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      entries.sort((left, right) => rank(left[0]) - rank(right[0]));
      rows = entries.map(([fieldId, raw]) => {
        const field = fields.find((entry) => String(entry?.id) === String(fieldId)) || null;
        const choices = Array.isArray(field?.choices) && field.choices.length ? field.choices : questionChoices;
        const choiceOf = (entry) => choices.find((candidate) => String(candidate?.id ?? candidate?.value) === String(entry)) || null;
        const picks = Array.isArray(raw) ? raw : [raw];
        // A choice field, or an answer no field names that is a choice's id.
        const isChoice = field ? CHOICE_FIELD_PROFILES.includes(profileOf(field)) : picks.every((entry) => choiceOf(entry));
        let value;
        let authored = false;
        if (isChoice) {
          const chosen = picks.map(choiceOf);
          // An id no choice answers to is not something to show ("choice-9").
          if (!chosen.length || chosen.some((choice) => !choice)) return null;
          value = chosen.map((choice) => clean(choice.label ?? choice.text ?? choice.value)).filter(Boolean).join(', ');
          authored = true;
        } else {
          value = picks.map((entry) => clean(entry)).filter(Boolean).join(', ');
        }
        const latex = !authored && answerIsLatex(value);
        // A cut LaTeX would not typeset: too long to keep whole, it is not kept.
        if (latex && value.length > OWN_ANSWER_MAX_LATEX) return null;
        return {
          label: entries.length > 1 ? clean(field?.label) : '',
          value: latex ? value : clip(value),
          format: authored ? OWN_ANSWER_FORMAT.AUTHORED : (latex ? OWN_ANSWER_FORMAT.LATEX : OWN_ANSWER_FORMAT.TEXT),
        };
      }).filter(Boolean);
    }
    rows = rows.filter((row) => row.value).slice(0, OWN_ANSWER_MAX_ROWS);
    return rows.length ? rows : null;
  } catch {
    return null;
  }
};

/* ------------------------------- the device's copy ------------------------------- */

const part = (value) => encodeURIComponent(String(value ?? ''));
const studentPrefix = (studentId) => `${OWN_ANSWER_STORAGE_PREFIX}/${part(studentId)}/`;
const gameKey = (studentId, roomId) => `${studentPrefix(studentId)}${part(roomId)}`;

const readGame = (storage, key) => {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return isObject(parsed) && isObject(parsed.rounds) ? parsed : null;
  } catch {
    return null;
  }
};

/** Rows read back from storage: only what this module could have written. */
const readRows = (value) => {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((row) => isObject(row) && typeof row.value === 'string' && row.value.trim()
    && Object.values(OWN_ANSWER_FORMAT).includes(row.format))
    .slice(0, OWN_ANSWER_MAX_ROWS)
    .map((row) => ({ label: typeof row.label === 'string' ? row.label : '', value: row.value, format: row.format }));
  return rows.length ? rows : null;
};

/**
 * Forget the student's old games: anything past a month, and all but the last
 * few. Other students' copies on the same device are never touched.
 */
export const forgetOldOwnAnswers = ({ storage, studentId, nowMs = Date.now() } = {}) => {
  try {
    if (!storage || !studentId) return 0;
    const prefix = studentPrefix(studentId);
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
    }
    const games = keys.map((key) => ({ key, savedAt: Number(readGame(storage, key)?.savedAt) || 0 }))
      .sort((left, right) => right.savedAt - left.savedAt);
    const drop = games.filter((game, position) => position >= OWN_ANSWER_KEEP_GAMES || nowMs - game.savedAt > OWN_ANSWER_KEEP_MS);
    drop.forEach((game) => storage.removeItem(game.key));
    return drop.length;
  } catch {
    return 0;
  }
};

/** Keep one round's rows for this student and game. Returns whether it was kept. */
export const rememberOwnAnswer = ({ storage, studentId, roomId, roundIndex, rows, nowMs = Date.now() } = {}) => {
  try {
    const round = Number(roundIndex);
    const kept = readRows(rows);
    if (!storage || !studentId || !roomId || !Number.isInteger(round) || round < 0 || !kept) return false;
    const key = gameKey(studentId, roomId);
    const game = readGame(storage, key) || { rounds: {} };
    storage.setItem(key, JSON.stringify({ version: 1, savedAt: nowMs, rounds: { ...game.rounds, [String(round)]: kept } }));
    forgetOldOwnAnswers({ storage, studentId, nowMs });
    return true;
  } catch {
    return false;
  }
};

/** Build a round's rows from what was asked and sent, and keep them. */
export const keepOwnAnswer = ({ storage, studentId, roomId, roundIndex, question, responsePayload, nowMs = Date.now() } = {}) => (
  rememberOwnAnswer({ storage, studentId, roomId, roundIndex, rows: ownAnswerRows({ question, responsePayload }), nowMs })
);

/** This student's kept answers for a game: `{ [roundIndex]: rows }`, empty when there are none. */
export const recallOwnAnswers = ({ storage, studentId, roomId } = {}) => {
  const answers = {};
  try {
    if (!storage || !studentId || !roomId) return answers;
    const game = readGame(storage, gameKey(studentId, roomId));
    Object.entries(game?.rounds || {}).forEach(([round, rows]) => {
      const index = Number(round);
      const kept = readRows(rows);
      if (Number.isInteger(index) && index >= 0 && kept) answers[index] = kept;
    });
  } catch {
    return {};
  }
  return answers;
};
