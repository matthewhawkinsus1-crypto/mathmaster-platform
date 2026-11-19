/*
 * WHAT A RECOVERY KEEPS ON THIS DEVICE, READ BACK AS A CLAIM.
 *
 * Besides its answers (recoveryAnswerDrafts.js), the Recovery runner keeps two
 * things in this browser's storage (SectionRecoveryRunner.jsx):
 *
 *   steps        each question's step record, as recordQuestionStep writes
 *                it: the tries Step Algebra's rejected moves spent, the
 *                board's equation and its step log;
 *   unavailable  the questions this device could not show, each with the
 *                word that says why (its classification).
 *
 * Both were read back as stored, and what is stored is whatever some build,
 * on some device, wrote, or damage left (toolDraftShape.js). A step record
 * holding a value that cannot be read as a number or a word threw as its
 * question opened: the question showed "This question could not be
 * displayed" on every reload until the Recovery was submitted, and one in the
 * try count threw above the question's own boundary, closing the whole
 * Recovery. A mark that was not a word (true, a number, a list) marked its
 * question "MathMaster could not grade this question", and Submit no longer
 * warned that it had no answer.
 *
 * Each store is read here as a draft is: a value of the right shape comes back
 * exactly as saved (the same object), a part of the wrong shape is dropped,
 * and nothing here throws.
 *
 *   - A step record is kept only as its writer leaves one: tried
 *     ("attempted"), or every try used ("expired", with at least one try
 *     counted), its try counts whole numbers. Its step log keeps the steps
 *     that are records, each step's numbers and words only when they are
 *     numbers and words; its board's equation is dropped when it has not two
 *     sides (the question's own then opens, as a draft's does). A record that
 *     is not one is not kept: its question opens as untried, never as tried
 *     or over. (Every try used on another device is the answer copy's
 *     `closed` flag, read apart.)
 *   - A mark that is not a classification is dropped: its question shows as
 *     itself, and Submit counts it as the student's own if it has no answer.
 *
 * Pure: the runner reads storage and passes the parsed value in.
 */
import { draftNormalizer, draftShape } from '../../tools/shared/toolDraftShape.js';

const { boolean, cell, list, map, nullable, number, oneOf, record, refine, required, text, where } = draftShape;

const count = () => number({ integer: true, min: 0 });
const words = (max) => text({ max });

// One step of the log (attemptPolicy.mjs recordQuestionStep's compact step).
const STEP_GRADE = record({
  variantIndex: count(),
  stepNumber: count(),
  kind: words(80),
  label: words(400),
  mode: words(40),
  productive: boolean(),
  accepted: boolean(),
  earned: number({ min: 0 }),
  possible: number({ min: 0 }),
  equationBefore: text(),
  equationAfter: text(),
  expectedTotalPoints: number({ min: 0 }),
  recordedAt: words(64),
});

// The board a step left (stepAlgebraStepVerification.mjs equationStatePatch,
// relationStatePatch). Its equation's sides as Step Algebra's draft reads them
// (algebraDraftState.js ALGEBRA_DRAFT_SHAPE).
const EQUATION = record({
  left: required(cell()),
  right: required(cell()),
  variable: nullable(words(40)),
  objective: nullable(record({
    kind: nullable(text()),
    variable: nullable(text()),
    simplifyRequired: nullable(boolean()),
    requireSimplifiedFinalForm: nullable(boolean()),
    targetForm: nullable(draftShape.either(text(), record({}))),
  })),
});
const ALGEBRA_STATE = record({
  equation: EQUATION,
  supportLevel: nullable(cell()),
  stepNumber: count(),
  relationState: nullable(record({})),
});

const SUPPORT_FLAGS = [
  'modified', 'hintUsed', 'teacherAssisted', 'scaffoldUsed', 'contextScaffoldUsed', 'backUpStepUsed',
  'feedbackAssisted', 'remediationUsed', 'workedExampleUsed', 'calculatorUsed', 'isMathematicallyIndependent',
];
const SUPPORT_USAGE = record({
  ...Object.fromEntries(SUPPORT_FLAGS.map((flag) => [flag, boolean()])),
  accommodations: list(words(120)),
  modifications: list(words(120)),
});

/** The statuses recordQuestionStep leaves on a record it wrote. */
export const RECOVERY_STEP_STATUSES = Object.freeze(['attempted', 'expired']);

// Only the keys a record's writer leaves (recordQuestionStep, and the board a
// step tool patches in). QuestionEngine reads more of a record than these (a
// deadline submission's origin and id, when its paused work is refreshed),
// and in this store any other key is damage: it is dropped, never read.
const onlyKnown = (piece, keys) => (value, note) => {
  const kept = piece(value, note);
  if (!kept || typeof kept !== 'object') return kept;
  if (Object.keys(kept).every((key) => keys.includes(key))) return kept;
  note('unknown-key');
  return Object.fromEntries(Object.entries(kept).filter(([key]) => keys.includes(key)));
};

const STEP_RECORD_FIELDS = {
  status: required(oneOf(RECOVERY_STEP_STATUSES)),
  attemptCount: required(count()),
  totalAttempts: count(),
  variantIndex: count(),
  timeSpent: number({ min: 0 }),
  lastAttemptAt: nullable(words(64)),
  questionDetails: text(),
  lastResponseKey: text(),
  stepGrades: list(STEP_GRADE),
  partialCredit: number(),
  bestPartialCredit: number(),
  stepCreditVersion: number(),
  algebraState: nullable(ALGEBRA_STATE),
  partGrades: list(record({})),
  supportUsage: SUPPORT_USAGE,
};

const STEP_RECORD = refine(onlyKnown(record(STEP_RECORD_FIELDS), Object.keys(STEP_RECORD_FIELDS)),
  (kept) => kept.status !== 'expired' || kept.attemptCount >= 1, { code: 'expired-without-a-try' });

// The word that says why a question could not be shown (QuestionEngine's
// failure classification, as the runner writes it: String(...) of a code).
export const MAX_UNAVAILABLE_CLASSIFICATION = 120;
const CLASSIFICATION = where(
  (value) => typeof value === 'string' && value.trim() !== '' && value.length <= MAX_UNAVAILABLE_CLASSIFICATION,
  { code: 'not-a-classification' },
);

const STEP_RECORDS = draftNormalizer(map(STEP_RECORD));
const UNAVAILABLE = draftNormalizer(map(CLASSIFICATION));

// Nothing stored is nothing to repair; anything else is read through the shape.
const readStore = (normalize, value) => {
  if (value === null || value === undefined) return { value: {}, issues: [] };
  const { value: kept, issues } = normalize(value);
  return { value: kept === undefined ? {} : kept, issues };
};

/** `{ [itemId]: step record }` as kept, and what was repaired. */
export const readRecoveryStepRecords = (value) => readStore(STEP_RECORDS, value);

/** `{ [itemId]: classification }` as kept, and what was repaired. */
export const readRecoveryUnavailable = (value) => readStore(UNAVAILABLE, value);
