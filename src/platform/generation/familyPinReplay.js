/*
 * WHEN A QUESTION FAMILY PIN WILL NOT REPLAY.
 *
 * A delivery pin names the exact family instance a student was shown
 * (functions/shared/questionGenerationIdentity.mjs). Most of the time it
 * replays, and the student sees the same numbers again. This module decides
 * what happens when it does not.
 *
 * WHICH PINS ARE AUTHORITATIVE
 *
 *   recovery    a Recovery item (Practice or the pinned assessment plan). The
 *               server marks the answer against exactly this pin.
 *   canonical   the question record's pin, written by the server when it
 *               accepted the student's first attempt or checkpoint. Graded
 *               history refers to it.
 *   device      written by this browser the first time the question rendered,
 *               before anything reached the server. Nothing was graded
 *               against it, so a fresh allocation may replace it (as before).
 *   none        no pin yet: a fresh allocation (seated, provisional, shared,
 *               or a teacher preview) chooses the instance.
 *
 * An authoritative pin that cannot replay is NEVER swapped for another
 * instance. Swapping it used to happen silently in the assignment player: the
 * replacement was reported back as "what was shown", travelled with the next
 * submission, and the server accepted it and overwrote the canonical pin. The
 * student kept spending attempts on a different question from the one their
 * history was graded against.
 *
 * Exactly one repair is allowed without a person: REBUILDING the same
 * instance. The pin's own allocation is walked the way the server verifies a
 * pin (deliveryPinAllocationProblem), and the result is used only if its
 * family, version and fingerprint all equal the pin's. Equal fingerprints in
 * one family version are the same question, so identity is proved, not
 * assumed. Everything else becomes a question-level failure with a
 * classification and a recovery the student screen can act on.
 *
 * Pure: no React, no storage.
 */

import {
  FAMILY_RESOLUTION_ERROR,
  familySlotKey,
  normalizeQuestionFamilyReference,
  resolveFamilyQuestionInstance,
} from '../../../functions/shared/questionFamilyInstance.mjs';
import { listPlatformQuestionFamilies } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { DELIVERY_PIN_VERSION, normalizeDeliveryPin } from '../../../functions/shared/questionGenerationIdentity.mjs';

export const FAMILY_PIN_KIND = Object.freeze({
  RECOVERY: 'recovery',
  CANONICAL: 'canonical',
  DEVICE: 'device',
  NONE: 'none',
});

export const QUESTION_RESOLUTION_FAILURE = Object.freeze({
  // The pin's family and version resolve, but the instance it names is not
  // there any more (constraints or generator changed), or the pin was edited.
  PIN_FINGERPRINT_MISMATCH: 'pin-fingerprint-mismatch',
  // The slot now points at a different family or family version than the pin
  // was written for (a migrated or edited question).
  PIN_FAMILY_MISMATCH: 'pin-family-mismatch',
  // The pin names a family version this build has never had.
  PIN_FAMILY_VERSION_UNKNOWN: 'pin-family-version-unknown',
  // The pin or slot names a family version NEWER than this build knows: the
  // tab outlived a deploy. Loading the current build is the fix.
  CLIENT_BUILD_BEHIND: 'family-version-newer-than-client',
  // The pin was written for another question slot.
  PIN_SLOT_MISMATCH: 'pin-slot-mismatch',
  // The pin names an instance this student was never allocated (a
  // classmate's seat, an index the allocation formula never produces, a
  // preview pin, a shared pin outside a shared section).
  PIN_NOT_ALLOCATED: 'pin-not-allocated-to-student',
  // The stored pin is truncated or from an unsupported legacy shape.
  PIN_MALFORMED: 'pin-malformed',
  FAMILY_UNKNOWN: 'family-unknown',
  // The family exists but cannot produce an instance under these constraints.
  FAMILY_UNSATISFIABLE: 'family-unsatisfiable',
  // A deterministic generation failure in a non-family template.
  GENERATION_FAILED: 'generation-failed',
  // An unexpected exception while preparing the question.
  RESOLUTION_EXCEPTION: 'resolution-exception',
});

export const QUESTION_RESOLUTION_RECOVERY = Object.freeze({
  // Preparing the question again is harmless and may succeed.
  RETRY: 'retry',
  // This tab's build is older than the content: load the current build.
  RELOAD: 'reload',
  // The saved question cannot be reproduced; a teacher (or the server repair
  // path) must act. Other questions stay available.
  NEEDS_REPAIR: 'needs-repair',
  // A stored legacy shape this build cannot read. Fail closed.
  LEGACY_UNSUPPORTED: 'legacy-unsupported',
});

const RECOVERY_FOR = Object.freeze({
  [QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_MISMATCH]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_VERSION_UNKNOWN]: QUESTION_RESOLUTION_RECOVERY.LEGACY_UNSUPPORTED,
  [QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND]: QUESTION_RESOLUTION_RECOVERY.RELOAD,
  [QUESTION_RESOLUTION_FAILURE.PIN_SLOT_MISMATCH]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.PIN_NOT_ALLOCATED]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED]: QUESTION_RESOLUTION_RECOVERY.LEGACY_UNSUPPORTED,
  [QUESTION_RESOLUTION_FAILURE.FAMILY_UNKNOWN]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED]: QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR,
  [QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION]: QUESTION_RESOLUTION_RECOVERY.RETRY,
});

export const recoveryForFailure = (classification) => (
  RECOVERY_FOR[classification] || QUESTION_RESOLUTION_RECOVERY.NEEDS_REPAIR
);

const clean = (value) => String(value ?? '').trim();

/** Which pin this host handed the generator, and whether it is authoritative. */
export const familyPinKind = (context = {}) => {
  if (context?.requirePin === true) return FAMILY_PIN_KIND.RECOVERY;
  if (context?.pinSource === FAMILY_PIN_KIND.DEVICE) return FAMILY_PIN_KIND.DEVICE;
  // A host that passes a pin without saying where it came from is treated as
  // authoritative: failing closed is the safe default.
  if (context?.pinSource === FAMILY_PIN_KIND.CANONICAL || context?.pin || context?.pinUnreadable) return FAMILY_PIN_KIND.CANONICAL;
  return FAMILY_PIN_KIND.NONE;
};

export const isAuthoritativePinKind = (kind) => kind === FAMILY_PIN_KIND.RECOVERY || kind === FAMILY_PIN_KIND.CANONICAL;

/*
 * A SHORT, NON-REVERSIBLE TAG FOR A FINGERPRINT.
 *
 * A fingerprint spells out the instance's generated values
 * ("linear.twoStepEquation:-3|-15|-12"), from which the answer follows. A
 * diagnostic needs to tell two pins apart, never to read the numbers, so it
 * carries this tag instead.
 */
export const fingerprintDigest = (fingerprint) => {
  const text = clean(fingerprint);
  if (!text) return null;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(36)}`;
};

/** The newest version of `familyId` this build ships, or null. */
const newestKnownVersion = (familyId) => {
  const id = clean(familyId);
  return listPlatformQuestionFamilies().find((family) => family.id === id)?.version ?? null;
};

/** Map a refusal from deliveryPinAllocationProblem onto a classification. */
export const classifyPinRefusal = (refusal) => {
  const code = clean(refusal);
  if (code === 'pin-slot-mismatch') return QUESTION_RESOLUTION_FAILURE.PIN_SLOT_MISMATCH;
  if (code === 'pin-invalid') return QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED;
  return QUESTION_RESOLUTION_FAILURE.PIN_NOT_ALLOCATED;
};

/**
 * Why a family slot could not produce its question, as a classification.
 * `pin` is set when an authoritative pin failed to replay.
 */
export const classifyFamilyFailure = ({ question = null, pin = null, error = '', issues = [] } = {}) => {
  const reference = normalizeQuestionFamilyReference(question);
  const normalizedPin = pin ? normalizeDeliveryPin(pin) : null;
  if (pin && !normalizedPin) return QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED;
  if (error === FAMILY_RESOLUTION_ERROR.PIN_MISMATCH && (issues || []).includes('pin_invalid')) {
    return QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN) {
    const newest = newestKnownVersion(reference?.id);
    return newest !== null && Number(reference?.version) > newest
      ? QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND
      : QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_VERSION_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN) return QUESTION_RESOLUTION_FAILURE.FAMILY_UNKNOWN;
  if (error === FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID
    || error === FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES
    || error === FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED) {
    return QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE;
  }
  if (normalizedPin) {
    // The slot resolved; compare what it resolves to with what the pin names.
    if (reference?.scope === 'platform' && reference.id && reference.id !== normalizedPin.familyId) {
      return QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_MISMATCH;
    }
    const pinNewest = newestKnownVersion(normalizedPin.familyId);
    if (reference?.scope === 'platform' && pinNewest !== null && normalizedPin.familyVersion > pinNewest) {
      return QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND;
    }
    const slotVersion = reference?.scope === 'platform' ? (reference.version || 1) : null;
    if (slotVersion !== null && slotVersion !== normalizedPin.familyVersion) {
      return QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_MISMATCH;
    }
    return QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH;
  }
  return QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED;
};

/**
 * Rebuild exactly the instance `pin` names, or return null.
 *
 * Walks from the pin's ALLOCATED index (not its stored `resolvedIndex`), with
 * the same two wrap rules the server accepts, and keeps the result only if
 * family id, family version and fingerprint all equal the pin's. A pin
 * written before `resolvedIndex` existed, or with a damaged one, is healed
 * this way; nothing that could be a different question ever is.
 *
 * The rebuilt delivery keeps the pin's identity (slot, family, version,
 * variant, seat, index, basis, fingerprint). Only `resolvedIndex`, the
 * locator, is corrected to where the walk really landed.
 */
export const rebuildFamilyQuestionFromPin = ({ question = null, assignmentId = '', storageIndex = 0, pin = null } = {}) => {
  const normalized = normalizeDeliveryPin(pin);
  if (!normalized) return null;
  const slotKey = normalized.slot || familySlotKey({ assignmentId, question, storageIndex });
  for (const legacyWrapExclusion of [false, true]) {
    const walked = resolveFamilyQuestionInstance({
      question,
      assignmentId,
      storageIndex,
      slotKey,
      support: normalized.support,
      legacyWrapExclusion,
      allocation: {
        seat: normalized.seat,
        variant: normalized.variant,
        stride: normalized.stride,
        index: normalized.index,
        basis: normalized.basis,
      },
    });
    if (walked.error) continue;
    if (walked.family.id !== normalized.familyId
      || walked.family.version !== normalized.familyVersion
      || walked.instance.fingerprint !== normalized.fingerprint) continue;
    return {
      ...walked,
      delivery: {
        ...walked.delivery,
        index: normalized.index,
        basis: normalized.basis,
        rebuiltFromPin: true,
      },
      rebuilt: true,
    };
  }
  return null;
};

/*
 * WHAT A FAILED QUESTION TELLS SUPPORT.
 *
 * Enough to find and repair the exact slot — assignment, question, family and
 * version on both sides, which pin, the classification — and nothing that
 * identifies the student (no id, no seat) or reveals the question (no raw
 * fingerprint, no generated values, no answer).
 */
export const familyResolutionDiagnostics = ({
  question = null,
  context = {},
  pin = null,
  pinKind = FAMILY_PIN_KIND.NONE,
  classification = QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED,
  detail = '',
} = {}) => {
  // Called while reporting a failure, possibly one this very question caused:
  // reading it again must not throw a second time.
  let reference = null;
  try { reference = normalizeQuestionFamilyReference(question); } catch { reference = null; }
  let questionId = null;
  let activityRole = null;
  try {
    questionId = clean(question?.questionId) || clean(question?.id) || null;
    activityRole = clean(question?.activityRole) || null;
  } catch { /* unreadable question: identified by the context alone */ }
  const normalizedPin = normalizeDeliveryPin(pin);
  return {
    assignmentId: clean(context?.assignmentId) || null,
    questionId,
    storageIndex: Number.isInteger(context?.storageIndex) ? context.storageIndex : null,
    activityRole,
    familyId: reference?.scope === 'platform' ? reference.id : reference ? 'assignment-template' : null,
    familyVersion: reference?.scope === 'platform' ? (reference.version || 1) : null,
    variant: Number.isInteger(context?.variant) ? context.variant : null,
    pinKind,
    pinVersion: pin ? DELIVERY_PIN_VERSION : null,
    pinFamilyId: normalizedPin?.familyId || null,
    pinFamilyVersion: normalizedPin?.familyVersion ?? null,
    pinBasis: normalizedPin?.basis || null,
    pinFingerprint: fingerprintDigest(normalizedPin?.fingerprint),
    classification,
    detail: clean(detail).slice(0, 80) || null,
  };
};

/** An Error the generator throws for a classified failure. */
export const questionResolutionError = ({ message, generationReason, classification, diagnostics }) => {
  const error = new Error(message);
  error.generationReason = generationReason;
  error.resolutionFailure = {
    classification,
    recovery: recoveryForFailure(classification),
    diagnostics,
  };
  return error;
};

/**
 * Classify any error the generator caught, for the question-level error.
 * A classified family failure keeps its own classification; a generator's
 * own refusal is deterministic (repairing the content fixes it); anything
 * else is an unexpected exception, which a retry may clear.
 */
export const resolutionFailureForError = (error, question = null) => {
  if (error?.resolutionFailure?.classification) return error.resolutionFailure;
  const deterministic = Boolean(error?.generationReason || error?.reason)
    || /^Could not generate/i.test(String(error?.message || ''));
  const classification = deterministic
    ? QUESTION_RESOLUTION_FAILURE.GENERATION_FAILED
    : QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION;
  return {
    classification,
    recovery: recoveryForFailure(classification),
    diagnostics: familyResolutionDiagnostics({ question, classification, detail: error?.name || '' }),
  };
};
