/*
 * TRIES ARE COUNTED ON THE QUESTION THE STUDENT WAS SHOWN (P-7).
 *
 * A Question Family slot is stored as a template with no answer fields, and
 * the question dealt from it can be all choices, which gets one try
 * (attemptPolicy.mjs isChoiceOnlyQuestion). QuestionEngine and the server
 * (submissionIngestion.mjs and the deadline finalizer: `family.question ||
 * question`) count tries on the dealt question. App.jsx counted them on the
 * stored slot, three. After one miss the screen said "0 tries left" while
 * Submit stayed on, and the next Submit said "Correct! This question is
 * complete." for an attempt the server refuses (a finished question records
 * nothing more), so the teacher never saw it.
 *
 * QuestionEngine reports each question it deals (onFamilyDelivery), and App
 * keeps it by slot and variant under `shownDeliveryKey`. Every count App makes
 * reads `countedQuestion`, which is that question, or the stored one where
 * nothing has been shown on this device yet. A teacher's preview keeps what it
 * showed under its own key: it is never a student's delivery, so a student's
 * submission can never pick it up as a pin.
 *
 * No family engine is imported here: App reads this on the first load.
 */
import { normalizeQuestionRecord } from '../../attemptPolicy.js';
import { familySlotKey, isFamilyBackedQuestion } from '../../../functions/shared/questionFamilySlot.mjs';

/** The key a shown delivery is kept under: its slot and variant, and whether a preview showed it. */
export const shownDeliveryKey = ({ slot = '', variant = 0, preview = false } = {}) => (
  `${preview ? 'preview|' : ''}${slot}|v${variant}`
);

/**
 * The question to count tries on for one stored slot.
 *
 * `shown` is App's map of what QuestionEngine reported showing
 * (key → { delivery, question }); `record` says which variant is current;
 * `fallback` is the question used where nothing was shown (App's own stored
 * question, as every count read before).
 */
export const countedQuestion = ({
  shown = null,
  assignmentId = '',
  storedQuestion = null,
  questionIndex = 0,
  record = null,
  fallback = storedQuestion,
  preview = false,
} = {}) => {
  if (!assignmentId || !isFamilyBackedQuestion(storedQuestion)) return fallback;
  const slot = familySlotKey({ assignmentId, question: storedQuestion, storageIndex: questionIndex });
  const variant = normalizeQuestionRecord(record).variantIndex;
  return shown?.get?.(shownDeliveryKey({ slot, variant, preview }))?.question || fallback;
};
