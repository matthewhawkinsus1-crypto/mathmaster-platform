/*
 * THE BROWSER SIDE OF A FAMILY-BACKED QUESTION: WHICH ONE, AND KEEPING IT.
 *
 * `buildStudentFamilyContext` gathers what the shared engine needs to pick
 * THIS student's question — their seat, the variant, the section mode — and,
 * most importantly, any delivery pin that already says which question they
 * were shown. A pin always wins over a fresh allocation:
 *
 *   canonical record's pin   (server-written at the first submission; every
 *                             device sees it)
 *   > this device's pin      (written the first time the question rendered)
 *   > a fresh allocation     (seat + variant, from the assignment's seat map)
 *
 * so a reload, a remount, the teacher's app seating the class a minute later,
 * or a Chromebook restart can never swap the numbers under a student who has
 * started working.
 *
 * The device pin is keyed by student, so a shared Chromebook never shows one
 * student another student's pin, and it holds no answer: only which entry of
 * the class-wide list was shown (the same thing the question itself displays).
 */

import { normalizeQuestionRecord } from '../../attemptPolicy.js';
import { familySlotKey, isFamilyBackedQuestion } from '../../../functions/shared/questionFamilyInstance.mjs';
import {
  normalizeDeliveryPin,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../../functions/shared/questionGenerationIdentity.mjs';

export const LOCAL_DELIVERY_PIN_PREFIX = 'mm.familyDelivery.v1';

const storage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const localDeliveryPinKey = ({ studentId, slotKey, variant }) => (
  `${LOCAL_DELIVERY_PIN_PREFIX}|${String(studentId || '')}|${String(slotKey || '')}|v${Math.max(0, Number(variant) || 0)}`
);

export const readLocalDeliveryPin = ({ studentId, slotKey, variant, store = storage() } = {}) => {
  if (!studentId || !slotKey || !store) return null;
  try {
    const raw = store.getItem(localDeliveryPinKey({ studentId, slotKey, variant }));
    return raw ? normalizeDeliveryPin(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/**
 * Pin what was shown, once. An existing pin is never overwritten: the first
 * rendering is the one the student may already be working on.
 */
export const writeLocalDeliveryPin = ({ studentId, delivery, store = storage() } = {}) => {
  const pin = normalizeDeliveryPin(delivery);
  if (!studentId || !pin || !pin.slot || !store) return false;
  const key = localDeliveryPinKey({ studentId, slotKey: pin.slot, variant: pin.variant });
  try {
    if (store.getItem(key)) return false;
    store.setItem(key, JSON.stringify(pin));
    return true;
  } catch {
    return false;
  }
};

/**
 * Everything the generator needs to resolve this student's instance of a
 * family-backed slot, or null for a slot that is not family-backed (which then
 * generates exactly as it always did).
 */
export const buildStudentFamilyContext = ({
  assignment = null,
  question = null,
  storageIndex = 0,
  studentId = null,
  classId = null,
  sectionMode = 'personalized',
  record = null,
  preview = false,
  store = storage(),
} = {}) => {
  if (!assignment?.id || !isFamilyBackedQuestion(question)) return null;
  const variant = normalizeQuestionRecord(record).variantIndex;
  const slotKey = familySlotKey({ assignmentId: assignment.id, question, storageIndex });
  const canonicalPin = preview ? null : normalizeDeliveryPin(record?.familyDelivery);
  const localPin = preview || !studentId ? null : readLocalDeliveryPin({ studentId, slotKey, variant, store });
  const pin = canonicalPin?.variant === variant
    ? canonicalPin
    : localPin?.variant === variant ? localPin : null;
  const seatInfo = preview || !studentId ? null : resolveLearnerSeat({ assignment, studentId, classId });
  return {
    assignmentId: assignment.id,
    storageIndex,
    slotKey,
    variant,
    allocation: resolveGenerationAllocation({ sectionMode, seatInfo, variant, preview }),
    pin,
    pinSource: pin === canonicalPin && pin ? 'canonical' : pin ? 'device' : null,
  };
};
