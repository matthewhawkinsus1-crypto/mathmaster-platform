/*
 * WHY A RECOVERY ITEM'S FAMILY DID NOT REPRODUCE, OR COULD NOT GENERATE.
 *
 * In PR #430's vocabulary (PIN_REPLAY_FAILURE), shared by the server and the
 * student's browser. Moved out of sectionRecoveryEvidence.mjs, whose scoring
 * every student screen reads: these two read the Question Family registry
 * (the newest version a build ships), which must stay out of the student's
 * first load (scripts/check-first-load-budget.mjs).
 */
import { FAMILY_RESOLUTION_ERROR, normalizeQuestionFamilyReference } from './questionFamilyInstance.mjs';
import { listPlatformQuestionFamilies } from './questionFamilyRegistry.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { PIN_REPLAY_FAILURE } from './sectionRecoveryEvidence.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** The newest version of `familyId` this build ships, or null. */
const newestKnownVersion = (familyId) => {
  const id = clean(familyId);
  return listPlatformQuestionFamilies().find((family) => family.id === id)?.version ?? null;
};

/**
 * Why a Recovery item's pin did not reproduce, in PR #430's vocabulary.
 *
 * The same decision as classifyFamilyFailure in
 * src/platform/generation/familyPinReplay.js for a pinned question (a Recovery
 * item always has one), so the server and the student's browser name a
 * failure the same way.
 */
export const classifyRecoveryReproductionFailure = ({ question = null, pin = null, error = '', issues = [] } = {}) => {
  let reference = null;
  try { reference = normalizeQuestionFamilyReference(question); } catch { reference = null; }
  const normalizedPin = pin ? normalizeDeliveryPin(pin) : null;
  if (pin && !normalizedPin) return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  if (!pin) return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  if (error === FAMILY_RESOLUTION_ERROR.PIN_MISMATCH && list(issues).includes('pin_invalid')) {
    return PIN_REPLAY_FAILURE.PIN_MALFORMED;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN) {
    const newest = newestKnownVersion(reference?.id);
    return newest !== null && Number(reference?.version) > newest
      ? PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND
      : PIN_REPLAY_FAILURE.PIN_FAMILY_VERSION_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN) return PIN_REPLAY_FAILURE.FAMILY_UNKNOWN;
  if (error === FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID
    || error === FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES
    || error === FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED) {
    return PIN_REPLAY_FAILURE.FAMILY_UNSATISFIABLE;
  }
  // The slot resolved; compare what it resolves to with what the pin names.
  if (reference?.scope === 'platform' && reference.id && reference.id !== normalizedPin.familyId) {
    return PIN_REPLAY_FAILURE.PIN_FAMILY_MISMATCH;
  }
  const pinNewest = newestKnownVersion(normalizedPin.familyId);
  if (reference?.scope === 'platform' && pinNewest !== null && normalizedPin.familyVersion > pinNewest) {
    return PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND;
  }
  const slotVersion = reference?.scope === 'platform' ? (reference.version || 1) : null;
  if (slotVersion !== null && slotVersion !== normalizedPin.familyVersion) {
    return PIN_REPLAY_FAILURE.PIN_FAMILY_MISMATCH;
  }
  return PIN_REPLAY_FAILURE.PIN_FINGERPRINT_MISMATCH;
};

/**
 * Why a question could not produce a FRESH instance (no pin involved: a
 * teacher-requested replacement), in the same vocabulary.
 */
export const classifyFamilyGenerationError = ({ question = null, error = '' } = {}) => {
  let reference = null;
  try { reference = normalizeQuestionFamilyReference(question); } catch { reference = null; }
  if (error === FAMILY_RESOLUTION_ERROR.NOT_FAMILY_BACKED || error === FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN) {
    return PIN_REPLAY_FAILURE.FAMILY_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN) {
    const newest = newestKnownVersion(reference?.id);
    return newest !== null && Number(reference?.version) > newest
      ? PIN_REPLAY_FAILURE.CLIENT_BUILD_BEHIND
      : PIN_REPLAY_FAILURE.PIN_FAMILY_VERSION_UNKNOWN;
  }
  if (error === FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID
    || error === FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES
    || error === FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED) {
    return PIN_REPLAY_FAILURE.FAMILY_UNSATISFIABLE;
  }
  return PIN_REPLAY_FAILURE.GENERATION_FAILED;
};
