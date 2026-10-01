/*
 * WHICH QUESTION IS YOURS: SEATS, VARIANTS AND THE DELIVERY PIN.
 *
 * THE PROBLEM WITH HASHING EACH STUDENT. The platform seeded every student's
 * question independently from (assignment, student, question, variant). That
 * is deterministic — a reload gives the same numbers — but it cannot make two
 * students DIFFERENT. Independent draws collide like birthdays: a template with
 * 72 possible questions handed to 28 students repeats one with probability
 * 1 - e^(-28*27/144) ≈ 99.5%. No amount of better hashing fixes that; it
 * needs coordination.
 *
 * THE COORDINATION: SEATS. Every student in a class is given a small integer
 * seat for an assignment — 0, 1, 2, ... in a fixed order, append-only, never
 * renumbered. Together with the engine's distinct instance list D (see
 * questionFamilyEngine.mjs):
 *
 *   allocationIndex = seat + variant * GENERATION_STRIDE
 *   your question   = D[allocationIndex]
 *
 * Distinct seats give distinct variant-0 indices 0..n-1, hence distinct
 * questions whenever the family has at least n of them. A student's later
 * variants (Practice "New Question") step by the stride. The stride is the
 * class's seat count, which makes (seat, variant) -> index a bijection: no
 * variant of any student lands on any other student's question, or on the
 * student's own earlier ones, until the family's distinct questions are used
 * up. (The stride can grow as students are seated; that is safe because every
 * delivered question is pinned — see below — so a recomputation never changes
 * a question someone has already seen.)
 *
 * WHERE SEATS LIVE. On the assignment document, per class, keyed by an OPAQUE
 * learner token — a one-way hash of (assignment, student) — never a student id.
 * Assignment documents are readable by every signed-in user, so a raw id there
 * would publish the roster; a token reveals nothing outside this assignment and
 * cannot be correlated across assignments. The token is a pseudonym, not a
 * security boundary, and is documented as such.
 *
 * WHO WRITES THEM. The teacher's app, which is the one place the roster is
 * known, seats every student of every assigned class when an assignment that
 * uses question families is published or the roster grows (see
 * src/platform/generation/generationSeatReconciler.js). A student the teacher's
 * app has not seated yet gets a PROVISIONAL seat above every taken seat, so
 * they can never collide with a seated classmate.
 *
 * THE DELIVERY PIN. Whatever a student was shown is pinned: the allocation
 * index, seat basis, family version and fingerprint travel with the attempt and
 * are stored on the question record. A later seat assignment, roster change or
 * device switch therefore never changes a question a student has already
 * answered — the pin, not a re-derivation, is the authority.
 *
 * Pure: no Firestore, no clock.
 */

import { hashString32 } from './questionFamilyEngine.mjs';

export const GENERATION_STRIDE = 64;
export const PROVISIONAL_SEAT_SPREAD = 16;
export const GENERATION_SEATS_FIELD = 'generationSeats';
export const GENERATION_SEATS_VERSION = 1;
export const QUESTION_FAMILY_ENGINE = 'questionFamily/1';
export const DELIVERY_PIN_VERSION = 1;

export const ALLOCATION_BASIS = Object.freeze({
  SEATED: 'seated',
  PROVISIONAL: 'provisional',
  SHARED: 'shared',
  PREVIEW: 'preview',
  ANONYMOUS: 'anonymous',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hex = (value) => value.toString(16).padStart(8, '0');

/** One-way pseudonym for (assignment, student). Null without a student. */
export const learnerToken = (assignmentId, studentId) => {
  const student = clean(studentId);
  if (!student) return null;
  const text = `mmLearner|${clean(assignmentId)}|${student}`;
  return `lt${hex(hashString32(text))}${hex(hashString32(text, 0x9e3779b9))}`;
};

const TOKEN_PATTERN = /^lt[0-9a-f]{16}$/;
const validSeat = (value) => Number.isInteger(value) && value >= 0 && value < GENERATION_STRIDE * 4;

/** The seat map as stored, with anything malformed dropped rather than trusted. */
export const readGenerationSeats = (assignment) => {
  const raw = isObject(assignment?.[GENERATION_SEATS_FIELD]) ? assignment[GENERATION_SEATS_FIELD] : {};
  const byClassId = {};
  Object.entries(isObject(raw.byClassId) ? raw.byClassId : {}).forEach(([classId, seats]) => {
    const id = clean(classId);
    if (!id || !isObject(seats)) return;
    const valid = {};
    Object.entries(seats).forEach(([token, seat]) => {
      if (TOKEN_PATTERN.test(token) && validSeat(Number(seat))) valid[token] = Number(seat);
    });
    byClassId[id] = valid;
  });
  return { version: GENERATION_SEATS_VERSION, byClassId };
};

/**
 * This student's seat for this assignment.
 *
 * Their current class is checked first. A student who changed classes keeps
 * the seat — and so the questions — they already had. Anyone not yet seated
 * gets a provisional seat strictly above every seat taken in their class.
 */
export const resolveLearnerSeat = ({ assignment = null, assignmentId = null, studentId = null, classId = null } = {}) => {
  const resolvedAssignmentId = clean(assignmentId) || clean(assignment?.id);
  const token = learnerToken(resolvedAssignmentId, studentId);
  if (!token) return { token: null, seat: 0, basis: ALLOCATION_BASIS.ANONYMOUS, classId: clean(classId) || null };
  const seats = readGenerationSeats(assignment);
  const currentClass = clean(classId);
  const classSeats = currentClass ? seats.byClassId[currentClass] : null;
  const classSize = (entry) => (entry && Object.keys(entry).length
    ? Math.max(...Object.values(entry)) + 1
    : 0);
  if (classSeats && Object.prototype.hasOwnProperty.call(classSeats, token)) {
    return { token, seat: classSeats[token], basis: ALLOCATION_BASIS.SEATED, classId: currentClass, classSize: classSize(classSeats) };
  }
  for (const [otherClassId, other] of Object.entries(seats.byClassId)) {
    if (Object.prototype.hasOwnProperty.call(other, token)) {
      return { token, seat: other[token], basis: ALLOCATION_BASIS.SEATED, classId: otherClassId, classSize: classSize(other) };
    }
  }
  const next = classSize(classSeats);
  const seat = Math.min(GENERATION_STRIDE - 1, next + (hashString32(token) % PROVISIONAL_SEAT_SPREAD));
  return { token, seat, basis: ALLOCATION_BASIS.PROVISIONAL, classId: currentClass || null, classSize: next };
};

/**
 * The step between one student's variants: the class's seat count, at least
 * one past this seat, and never more than GENERATION_STRIDE.
 */
export const variantStrideFor = (seatInfo = null) => {
  const seat = Math.max(0, Math.floor(Number(seatInfo?.seat) || 0));
  const size = Math.max(0, Math.floor(Number(seatInfo?.classSize) || 0));
  return Math.min(GENERATION_STRIDE, Math.max(1, size, seat + 1));
};

/**
 * Seats to add for students who do not have one yet. Append-only.
 *
 * New students are seated in token order into the lowest free seats, so two
 * teacher tabs computing this from the same map and roster write the same
 * thing. Existing seats are never moved or reused.
 */
export const planSeatAdditions = ({ assignment = null, assignmentId = null, classId = '', studentIds = [] } = {}) => {
  const resolvedAssignmentId = clean(assignmentId) || clean(assignment?.id);
  const id = clean(classId);
  if (!resolvedAssignmentId || !id) return {};
  const seats = readGenerationSeats(assignment);
  const classSeats = seats.byClassId[id] || {};
  const seatedAnywhere = new Set(Object.values(seats.byClassId).flatMap((entry) => Object.keys(entry)));
  const taken = new Set(Object.values(classSeats));
  const pending = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(clean).filter(Boolean))]
    .map((studentId) => learnerToken(resolvedAssignmentId, studentId))
    .filter((token) => token && !seatedAnywhere.has(token))
    .sort();
  const additions = {};
  let next = 0;
  pending.forEach((token) => {
    while (taken.has(next)) next += 1;
    additions[token] = next;
    taken.add(next);
    next += 1;
  });
  return additions;
};

export const allocationIndexFor = ({ seat = 0, variant = 0, stride = GENERATION_STRIDE } = {}) => (
  Math.max(0, Math.floor(Number(seat) || 0)) + Math.max(0, Math.floor(Number(variant) || 0)) * stride
);

/**
 * The allocation for one delivery.
 *
 *   shared mode   -> seat 0 for everyone: one question per variant, by design
 *   preview       -> seat 0, labelled so it is never mistaken for a student's
 *   otherwise     -> the student's own seat
 */
export const resolveGenerationAllocation = ({
  sectionMode = 'personalized',
  seatInfo = null,
  variant = 0,
  preview = false,
} = {}) => {
  const resolvedVariant = Math.max(0, Math.floor(Number(variant) || 0));
  // One seat, so each variant is simply the next question in the list.
  if (preview && !seatInfo) {
    return { basis: ALLOCATION_BASIS.PREVIEW, seat: 0, variant: resolvedVariant, stride: 1, index: resolvedVariant };
  }
  if (clean(sectionMode).toLowerCase() === 'shared') {
    return { basis: ALLOCATION_BASIS.SHARED, seat: 0, variant: resolvedVariant, stride: 1, index: resolvedVariant };
  }
  const seat = Math.max(0, Math.floor(Number(seatInfo?.seat) || 0));
  const stride = variantStrideFor(seatInfo);
  return {
    basis: seatInfo?.basis || ALLOCATION_BASIS.ANONYMOUS,
    seat,
    variant: resolvedVariant,
    stride,
    index: allocationIndexFor({ seat, variant: resolvedVariant, stride }),
  };
};

/* ---------------------------------------------------------------------------
 * Delivery pins.
 * ------------------------------------------------------------------------- */

const PIN_BASES = new Set(Object.values(ALLOCATION_BASIS));

/**
 * The pin as stored or transmitted, validated. Returns null for anything that
 * is not a well-formed pin — a malformed pin is ignored, never half-trusted.
 */
export const normalizeDeliveryPin = (raw) => {
  if (!isObject(raw)) return null;
  const familyId = clean(raw.familyId);
  const familyVersion = Number(raw.familyVersion);
  const variant = Number(raw.variant);
  const index = Number(raw.index);
  const resolvedIndex = raw.resolvedIndex === undefined || raw.resolvedIndex === null ? index : Number(raw.resolvedIndex);
  const seat = Number(raw.seat);
  const stride = raw.stride === undefined || raw.stride === null ? GENERATION_STRIDE : Number(raw.stride);
  const basis = clean(raw.basis);
  const fingerprint = clean(raw.fingerprint);
  if (!familyId || !Number.isInteger(familyVersion) || familyVersion < 1) return null;
  if (!Number.isInteger(variant) || variant < 0 || !Number.isInteger(index) || index < 0) return null;
  if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0) return null;
  if (!Number.isInteger(seat) || seat < 0 || !PIN_BASES.has(basis)) return null;
  if (!Number.isInteger(stride) || stride < 1 || stride > GENERATION_STRIDE) return null;
  if (!fingerprint || fingerprint.length > 400) return null;
  return {
    v: DELIVERY_PIN_VERSION,
    engine: QUESTION_FAMILY_ENGINE,
    familyId,
    familyVersion,
    slot: clean(raw.slot).slice(0, 240),
    variant,
    index,
    // Where the walk actually landed. Recovery skips fingerprints the student
    // has seen; replaying from `resolvedIndex` reproduces the delivery even
    // after that "seen" set has grown.
    resolvedIndex,
    seat,
    stride,
    basis,
    fingerprint,
    support: clean(raw.support) || null,
  };
};

export const buildDeliveryPin = ({ delivery = null } = {}) => normalizeDeliveryPin(delivery);

/** Does this pin describe the delivery the caller is about to make? */
export const deliveryPinApplies = (pin, { familyId, familyVersion, variant, slot, support = null } = {}) => {
  const normalized = normalizeDeliveryPin(pin);
  if (!normalized) return false;
  return normalized.familyId === clean(familyId)
    && normalized.familyVersion === Number(familyVersion)
    && normalized.variant === Number(variant)
    && (!slot || !normalized.slot || normalized.slot === clean(slot))
    && (normalized.support || null) === (clean(support) || null);
};
