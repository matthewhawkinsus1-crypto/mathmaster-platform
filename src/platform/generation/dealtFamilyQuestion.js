/*
 * THE QUESTION A FAMILY SLOT'S PIN DEALT, WHERE NO SCREEN HAS SAID (P-7).
 *
 * A slot's tries are counted on the question the student was dealt
 * (shownFamilyQuestion.js countedQuestion). App learns it from QuestionEngine
 * as the question is shown. Three counts are made where nothing has been
 * shown:
 *
 *   - the question list after a reload, for a slot the student has not
 *     opened again on this device (a Warm-Up 2 closed after its one try read
 *     "2 tries left": the stored slot has no answer fields, three tries);
 *   - the teacher's case review (caseReview/attemptAnalysis.js);
 *   - a live correction's repair retry (assignment/liveQuestionCorrection.js).
 *
 * Each reads the slot's delivery pin, this device's and the question
 * record's (the server writes the record's with the first answer), and
 * rebuilds the question it names exactly as the server does to count the
 * next answer: questionFamilyGrading.mjs resolveServerGradingQuestion, the
 * device's pin first, then the record's, each only for the current variant.
 * A slot with no pin for its variant, or a pin that does not rebuild, deals
 * nothing (null), and the count stays on the stored slot, as before.
 *
 * Every family's generator comes with this module, so App reaches it through
 * the family engine (familyDelivery.js), never from the first load.
 *
 * Pure. A caller that asks on every render passes `cache` (a WeakMap): a
 * slot is rebuilt once per copy of its assignment and per pin.
 */
import { normalizeQuestionRecord } from '../../../functions/shared/attemptPolicy.mjs';
import { isFamilyBackedQuestion } from '../../../functions/shared/questionFamilySlot.mjs';
import { resolveServerGradingQuestion } from '../../../functions/shared/questionFamilyGrading.mjs';
import { normalizeDeliveryPin } from '../../../functions/shared/questionGenerationIdentity.mjs';

// What names a pin's instance, for the cache.
const pinKey = (pin) => {
  const normalized = normalizeDeliveryPin(pin);
  if (!normalized) return '-';
  return [
    normalized.familyId, normalized.familyVersion, normalized.slot, normalized.variant, normalized.seat,
    normalized.stride, normalized.index, normalized.basis, normalized.fingerprint, normalized.support || '',
  ].join(':');
};

/**
 * The question the slot's pin dealt, or null.
 *
 * @param {object} input
 * @param {object} input.assignment   the stored assignment (its id and seat map)
 * @param {object} input.question     the stored slot (getStoredAssignmentQuestions)
 * @param {number} input.questionIndex its storage index
 * @param {object} [input.record]     the slot's question record (its variant, and the canonical pin)
 * @param {object} [input.devicePin]  the pin this device wrote when it showed the slot
 * @param {string} [input.studentId]
 * @param {string} [input.classId]
 * @param {WeakMap} [input.cache]     assignment → (key → question | null)
 */
export const dealtFamilyQuestion = ({
  assignment = null,
  question = null,
  questionIndex = 0,
  record = null,
  devicePin = null,
  studentId = null,
  classId = null,
  cache = null,
} = {}) => {
  if (!assignment?.id || !isFamilyBackedQuestion(question)) return null;
  const variantIndex = normalizeQuestionRecord(record).variantIndex;
  const key = [questionIndex, question.questionId || question.id || '', variantIndex, pinKey(record?.familyDelivery), pinKey(devicePin), studentId || '', classId || ''].join('|');
  const remembered = cache?.get?.(assignment);
  if (remembered?.has(key)) return remembered.get(key);
  let dealt = null;
  try {
    const resolved = resolveServerGradingQuestion({
      assignment,
      question,
      questionIndex,
      variantIndex,
      canonicalRecord: record,
      claimedDelivery: devicePin,
      studentId,
      classId,
    });
    dealt = resolved.familyBacked && resolved.question ? resolved.question : null;
  } catch {
    // A count is never the place a question fails: the stored slot stands.
    dealt = null;
  }
  if (cache?.set) {
    const entries = remembered || new Map();
    entries.set(key, dealt);
    if (!remembered) cache.set(assignment, entries);
  }
  return dealt;
};
