/*
 * THIS DEVICE'S DELIVERY PINS: READ AND WRITTEN WITHOUT THE FAMILY ENGINE.
 *
 * Which instance of a family-backed slot this device showed, keyed by student
 * (a shared Chromebook never shows one student another's pin) and holding no
 * answer. Kept apart from familyDelivery.js, which checks pins by walking a
 * family and so brings every family's generator: App reads and writes pins
 * from here and loads that module with the question runtime, keeping the
 * registry out of the student's first load (scripts/check-first-load-budget.mjs).
 */
import { normalizeDeliveryPin } from '../../../functions/shared/questionGenerationIdentity.mjs';

export const LOCAL_DELIVERY_PIN_PREFIX = 'mm.familyDelivery.v1';

export const deliveryPinStore = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const localDeliveryPinKey = ({ studentId, slotKey, variant }) => (
  `${LOCAL_DELIVERY_PIN_PREFIX}|${String(studentId || '')}|${String(slotKey || '')}|v${Math.max(0, Number(variant) || 0)}`
);

export const readLocalDeliveryPin = ({ studentId, slotKey, variant, store = deliveryPinStore() } = {}) => {
  if (!studentId || !slotKey || !store) return null;
  try {
    const raw = store.getItem(localDeliveryPinKey({ studentId, slotKey, variant }));
    return raw ? normalizeDeliveryPin(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/**
 * Pin what was shown, once. A pin this device can still use is never
 * overwritten: the first rendering is the one the student may already be
 * working on.
 *
 * Two pins ARE replaced, by the delivery that was actually shown in their
 * place — the only question the student can now be working on:
 *
 *   - a stored pin this build cannot read (truncated, not JSON, a legacy
 *     shape). readLocalDeliveryPin already treats it as no pin, so every
 *     render fell back to the current allocation;
 *   - a pin the question dropped (`devicePinDropped`: the rendered question
 *     carries `familyPinNotice`, problemGenerator.js) — one the server would
 *     refuse, or one that no longer replays.
 *
 * Kept, either one went on being dropped on every render, so the question
 * followed whatever the allocation was at that moment: a provisional student
 * seated by the teacher's app, or a seat map that had not loaded yet, swapped
 * the numbers under a student who had started working (PR #430 review). Once
 * replaced, the pin holds the shown question still. The student's work is
 * untouched either way: drafts are keyed by question and variant, never by the
 * instance (questionDraftStorage.js buildQuestionDraftKey).
 */
export const writeLocalDeliveryPin = ({ studentId, delivery, store = deliveryPinStore(), devicePinDropped = false } = {}) => {
  const pin = normalizeDeliveryPin(delivery);
  if (!studentId || !pin || !pin.slot || !store) return false;
  const key = localDeliveryPinKey({ studentId, slotKey: pin.slot, variant: pin.variant });
  try {
    const raw = store.getItem(key);
    if (raw) {
      let existing = null;
      try { existing = normalizeDeliveryPin(JSON.parse(raw)); } catch { existing = null; }
      // Unreadable: replaced. Readable: kept, unless the question dropped it
      // and showed a different instance.
      if (existing && (!devicePinDropped || existing.fingerprint === pin.fingerprint)) return false;
    }
    store.setItem(key, JSON.stringify(pin));
    return true;
  } catch {
    return false;
  }
};
