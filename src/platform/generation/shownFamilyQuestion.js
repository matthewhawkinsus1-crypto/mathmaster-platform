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
 * reads `countedQuestion`, which is that question. A teacher's preview keeps
 * what it showed under its own key: it is never a student's delivery, so a
 * student's submission can never pick it up as a pin.
 *
 * WHERE NOTHING HAS BEEN SHOWN, THE PIN SAYS WHAT WAS DEALT. After a reload
 * the question list counted a slot the student had not opened again on that
 * device on the stored slot, so a Warm-Up 2 closed after its one try read
 * "2 tries left"; the teacher's case review and a live correction's repair
 * retry, which no screen of the student's informs, did the same. They now
 * hand `countedQuestion` a `deal`: the question the slot's delivery pin names,
 * rebuilt as the server rebuilds it to count (dealtFamilyQuestion.js). Only
 * where neither gives a question is the stored slot counted, as before.
 *
 * No family engine is imported here: App reads this on the first load. The
 * `deal` comes from the engine, where the caller has it.
 *
 * BEFORE THE ENGINE, NOTHING IS COUNTED ON A STAND-IN. After a reload straight
 * into an assignment, App has no `deal` until the engine lands (prefetched
 * from Home, so on a reload this is the moment the question shows "Loading
 * this question…"), and nothing has been shown on the new page. countedQuestion
 * can then only hand back the stored slot, and the question list read a
 * Warm-Up 2 its one try had closed as "2 tries left". `countedQuestionKnown`
 * says when that is so, from the same inputs, and the list says nothing about
 * the slot's tries until it is not (assignmentNavigator.js PENDING).
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
 * `deal`, where nothing was shown, is asked for the question the slot's pin
 * dealt (`{ slot, variant, storedQuestion, questionIndex, record }` → a
 * question or null; never for a preview, which pins nothing); `fallback` is
 * the question used where neither gives one (the caller's stored question, as
 * every count read before).
 */
export const countedQuestion = ({
  shown = null,
  deal = null,
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
  const seen = shown?.get?.(shownDeliveryKey({ slot, variant, preview }))?.question;
  if (seen) return seen;
  if (preview || typeof deal !== 'function') return fallback;
  return deal({ slot, variant, storedQuestion, questionIndex, record }) || fallback;
};

/**
 * Does `countedQuestion`, given the same input, name the question the slot's
 * tries are counted on? Yes for every slot but a family slot nothing has shown
 * on this device when there is no `deal` to ask (App before the family engine
 * has loaded): its answer would be the stored slot standing in for what was
 * dealt. A `deal` that names nothing (no pin for the variant) is an answer: the
 * stored slot, as before. A preview pins nothing and is never dealt, so it
 * counts on what it showed or on the stored slot, as always.
 */
export const countedQuestionKnown = ({
  shown = null,
  deal = null,
  assignmentId = '',
  storedQuestion = null,
  questionIndex = 0,
  record = null,
  preview = false,
} = {}) => {
  if (!assignmentId || !isFamilyBackedQuestion(storedQuestion) || preview || typeof deal === 'function') return true;
  const slot = familySlotKey({ assignmentId, question: storedQuestion, storageIndex: questionIndex });
  const variant = normalizeQuestionRecord(record).variantIndex;
  return Boolean(shown?.get?.(shownDeliveryKey({ slot, variant }))?.question);
};
