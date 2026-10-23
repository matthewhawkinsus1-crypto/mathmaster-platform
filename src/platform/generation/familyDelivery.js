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
import { familySlotKey, isFamilyBackedQuestion } from '../../../functions/shared/questionFamilySlot.mjs';
import { deliveryPinStore, readLocalDeliveryPin } from './familyDeliveryPins.js';
import { deliveryPinAllocationProblem } from '../../../functions/shared/questionFamilyGrading.mjs';
import {
  ALLOCATION_BASIS,
  allocationIndexFor,
  learnerToken,
  normalizeDeliveryPin,
  readGenerationSeats,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../../functions/shared/questionGenerationIdentity.mjs';

// Whether a question can come back as a different one: it resolves a family's
// definition, so App takes it from here, with the engine (not its first load).
export { canGenerateDistinctVariants } from '../../../functions/shared/questionVariability.mjs';

// Device pins live in their own module (no family engine); re-exported here
// so every existing import keeps working.
export {
  LOCAL_DELIVERY_PIN_PREFIX,
  localDeliveryPinKey,
  readLocalDeliveryPin,
  writeLocalDeliveryPin,
} from './familyDeliveryPins.js';

/*
 * WOULD THE SERVER GRADE AGAINST THIS PIN?
 *
 * The same check ingestion runs (deliveryPinAllocationProblem): the pin is for
 * this slot, names a seat this student holds, an index the allocation formula
 * produces, and a walk that lands on its fingerprint. A pin that fails it is
 * one the server would refuse — a classmate's pin, another slot's — so
 * showing it would only collect work that can never be credited.
 *
 * One judgement is left to the server: a seated pin whose learner token this
 * copy of the assignment does not list at all. That is a seat map not loaded
 * yet (or a snapshot older than the seat), not evidence of another student.
 */
const pinRefusalFor = ({ assignment, question, storageIndex, pin, studentId }) => {
  if (!pin || !studentId) return { refusal: null, walkRefused: false };
  let refusal = null;
  try {
    refusal = deliveryPinAllocationProblem({ assignment, question, questionIndex: storageIndex, pin, studentId });
  } catch {
    // App.jsx builds this context while rendering, outside any question
    // boundary. A check that cannot run passes no judgement; the generator
    // (inside the boundary) still replays the pin and fails closed itself.
    return { refusal: null, walkRefused: false };
  }
  if (refusal === 'pin-seat-unverifiable') return { refusal: null, walkRefused: false };
  if (refusal === 'pin-seat-not-held' && pin.basis === ALLOCATION_BASIS.SEATED) {
    const token = learnerToken(assignment?.id, studentId);
    const listed = Object.values(readGenerationSeats(assignment).byClassId).some((seats) => Object.hasOwn(seats, token));
    if (!listed) return { refusal: null, walkRefused: false };
  }
  // The allocation is right but walking it does not land on the pinned
  // fingerprint. Whether that is a stale family (the replay fails and is
  // classified there) or a steered `resolvedIndex` (the replay succeeds on an
  // instance this student was never dealt) is the generator's call.
  if (refusal === 'pin-index-not-allocated' && pin.index === allocationIndexFor(pin)) return { refusal: null, walkRefused: true };
  return { refusal, walkRefused: false };
};

/**
 * Everything the generator needs to resolve this student's instance of a
 * family-backed slot, or null for a slot that is not family-backed (which then
 * generates exactly as it always did).
 *
 * `pinSource` tells the generator how much the pin is worth: a `canonical`
 * pin is authoritative (graded history refers to it) and is never swapped for
 * another instance; a `device` pin may yield to a fresh allocation. A
 * canonical pin this build cannot read sets `pinUnreadable`, and one the
 * server would refuse sets `pinRefusal` (`pinWalkRefused` when only the walk
 * to its fingerprint fails); a refused device pin is dropped and named in
 * `devicePinRefused` (src/platform/generation/familyPinReplay.js).
 * Nothing here writes: the record and the device pin are read, never changed.
 * The dropped device pin is replaced when the question that WAS shown is
 * reported (writeLocalDeliveryPin, `devicePinDropped`).
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
  store = deliveryPinStore(),
} = {}) => {
  if (!assignment?.id || !isFamilyBackedQuestion(question)) return null;
  const variant = normalizeQuestionRecord(record).variantIndex;
  const slotKey = familySlotKey({ assignmentId: assignment.id, question, storageIndex });
  const rawCanonical = preview ? null : record?.familyDelivery;
  const canonicalPin = normalizeDeliveryPin(rawCanonical);
  // A replacement clears the pin to null; anything else that does not parse
  // is a stored pin this build cannot read.
  const pinUnreadable = !preview && rawCanonical !== null && rawCanonical !== undefined && !canonicalPin;
  const localPin = preview || !studentId ? null : readLocalDeliveryPin({ studentId, slotKey, variant, store });
  const canonicalApplies = canonicalPin?.variant === variant;
  const verify = (pin) => pinRefusalFor({ assignment, question, storageIndex, pin, studentId });
  const deviceCandidate = !canonicalApplies && !pinUnreadable && localPin?.variant === variant ? localPin : null;
  const verdict = canonicalApplies ? verify(canonicalPin) : deviceCandidate ? verify(deviceCandidate) : { refusal: null, walkRefused: false };
  const pinRefusal = canonicalApplies ? verdict.refusal : null;
  const devicePinRefused = deviceCandidate ? verdict.refusal : null;
  const pin = canonicalApplies
    ? canonicalPin
    : deviceCandidate && !devicePinRefused ? deviceCandidate : null;
  const seatInfo = preview || !studentId ? null : resolveLearnerSeat({ assignment, studentId, classId });
  return {
    assignmentId: assignment.id,
    storageIndex,
    slotKey,
    variant,
    allocation: resolveGenerationAllocation({ sectionMode, seatInfo, variant, preview }),
    pin,
    pinSource: canonicalApplies || pinUnreadable ? 'canonical' : pin ? 'device' : null,
    pinUnreadable,
    pinRefusal,
    pinWalkRefused: Boolean(pin) && verdict.walkRefused,
    devicePinRefused,
  };
};
