/*
 * THE ONE ENTRY POINT: A FAMILY-BACKED SLOT -> ONE STUDENT'S QUESTION.
 *
 * The browser player, teacher preview, the printable worksheet, Recovery and
 * the server's re-grading all call `resolveFamilyQuestionInstance`. That is
 * the point: if they called different code, a student could be graded against
 * a question they never saw — which is exactly what the platform avoided for
 * generated questions by never grading them on the server at all.
 *
 * HOW A SLOT REFERENCES A FAMILY (assignment JSON):
 *
 *   {
 *     "type": "stepAlgebra",
 *     "prompt": "Solve for x.",
 *     "questionFamily": {
 *       "id": "linear.twoStepEquation",      // a platform family
 *       "version": 1,                        // optional; unpinned means v1
 *       "constraints": { "solutionRange": [-6, 6] },
 *       "tool": "stepAlgebra"                // optional; else the slot's type
 *     }
 *   }
 *
 * or, for a contextual problem that belongs to this assignment only:
 *
 *   {
 *     "type": "multiAnswer",
 *     "prompt": "... {{a}} ... {{b}} ...",
 *     "generator": { "parameters": {...}, "derived": {...}, "constraints": [...] },
 *     "answerFields": [{ "id": "answer", "answer": "{{ans}}" }],
 *     "questionFamily": { "scope": "assignment" }
 *   }
 *
 * THE SLOT KEY uses the question's immutable id, not its position. Positions
 * move — duplicating a question on a live assignment used to shift every later
 * index, and the old seeds (which included the index) moved every later
 * student's question with it. A question id does not move.
 *
 * Pure: no Firestore, no clock.
 */

import { describeConstraintIssue, resolveFamilyConstraints } from './questionFamilyContract.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from './questionFamilyEngine.mjs';
import { getPlatformQuestionFamily, hasPlatformQuestionFamily } from './questionFamilyRegistry.mjs';
import { buildTemplateFamily, hasLocalFamilyTemplate } from './questionFamilyTemplate.mjs';
import {
  ALLOCATION_BASIS,
  DELIVERY_PIN_VERSION,
  GENERATION_STRIDE,
  QUESTION_FAMILY_ENGINE,
  normalizeDeliveryPin,
} from './questionGenerationIdentity.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

export const FAMILY_RESOLUTION_ERROR = Object.freeze({
  NOT_FAMILY_BACKED: 'not_family_backed',
  FAMILY_UNKNOWN: 'family_unknown',
  FAMILY_VERSION_UNKNOWN: 'family_version_unknown',
  TEMPLATE_INVALID: 'template_invalid',
  NO_VALID_INSTANCES: 'family_has_no_valid_instances',
  ALL_INSTANCES_EXCLUDED: 'all_instances_excluded',
  PIN_MISMATCH: 'pin_mismatch',
  // A strict family (constraintPolicy 'strict') was asked for something it
  // cannot honour exactly. It generates nothing rather than the default: a
  // slot that asked for "no solution" must never quietly ask for one.
  CONSTRAINT_INVALID: 'constraint_invalid',
});

/** Is this slot opted into the question family engine at all? */
export const isFamilyBackedQuestion = (question) => isObject(question?.questionFamily);

/**
 * The reference as authored, normalized. Returns null for a slot that is not
 * family-backed; returns a reference with `error` for one that tries to be and
 * cannot (Pre-Flight reports those — they must never silently fall back to a
 * static question).
 */
export const normalizeQuestionFamilyReference = (question) => {
  if (!isFamilyBackedQuestion(question)) return null;
  const raw = question.questionFamily;
  const id = clean(raw.id || raw.familyId);
  const wantsLocal = clean(raw.scope).toLowerCase() === 'assignment' || raw.local === true;
  const scope = wantsLocal || (!id && hasLocalFamilyTemplate(question)) ? 'assignment' : 'platform';
  const version = Number(raw.version);
  return {
    scope,
    id: scope === 'platform' ? id : null,
    version: Number.isInteger(version) && version >= 1 ? version : null,
    constraints: isObject(raw.constraints) ? raw.constraints : {},
    tool: clean(raw.tool) || null,
    error: scope === 'platform' && !id ? FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN : null,
  };
};

export const familySlotKey = ({ assignmentId = '', question = null, storageIndex = 0 } = {}) => {
  const slot = clean(question?.questionId) || clean(question?.id) || `index-${Math.max(0, Number(storageIndex) || 0)}`;
  return `${clean(assignmentId) || 'assignment'}|${slot}`;
};

/**
 * The family, constraints and tool for one slot — or a reason it has none.
 *
 * `support` is a student support modification the family has narrowed
 * constraints for (e.g. "reduce-complexity"); it is ignored when the family
 * declares nothing for it.
 */
export const resolveQuestionFamilyDefinition = (question, { slotKey = '', support = null } = {}) => {
  const reference = normalizeQuestionFamilyReference(question);
  if (!reference) return { error: FAMILY_RESOLUTION_ERROR.NOT_FAMILY_BACKED, issues: [] };
  if (reference.error) return { error: reference.error, reference, issues: [] };

  let family;
  if (reference.scope === 'assignment') {
    try {
      family = buildTemplateFamily(question, { slotKey });
    } catch (error) {
      return {
        error: FAMILY_RESOLUTION_ERROR.TEMPLATE_INVALID,
        reference,
        issues: Array.isArray(error?.templateIssues) ? error.templateIssues : [String(error?.message || 'template_invalid')],
      };
    }
  } else {
    family = getPlatformQuestionFamily(reference.id, reference.version);
    if (!family) {
      return {
        error: hasPlatformQuestionFamily(reference.id)
          ? FAMILY_RESOLUTION_ERROR.FAMILY_VERSION_UNKNOWN
          : FAMILY_RESOLUTION_ERROR.FAMILY_UNKNOWN,
        reference,
        issues: [],
      };
    }
  }

  const supportKey = clean(support);
  const supportOverrides = supportKey && isObject(family.supportConstraints?.[supportKey])
    ? family.supportConstraints[supportKey]
    : null;
  const constraints = resolveFamilyConstraints(family, { ...reference.constraints, ...supportOverrides });
  if (constraints.fatal) {
    return {
      error: FAMILY_RESOLUTION_ERROR.CONSTRAINT_INVALID,
      reference,
      family,
      constraintIssues: constraints.issues,
      issues: constraints.issues.map((issue) => describeConstraintIssue(issue, `${family.id} v${family.version}`)),
    };
  }

  const requestedTool = reference.tool;
  const slotType = clean(question?.type);
  const tool = requestedTool && family.tools[requestedTool]
    ? requestedTool
    : !requestedTool && slotType && family.tools[slotType]
      ? slotType
      : family.defaultTool;
  const toolIssue = requestedTool && !family.tools[requestedTool]
    ? { code: 'tool_not_supported', requested: requestedTool, used: tool }
    : null;

  return {
    error: null,
    family,
    reference,
    constraintValues: constraints.values,
    constraintIssues: constraints.issues,
    tool,
    toolIssue,
    support: supportOverrides ? supportKey : null,
    issues: [],
  };
};

const EXCLUSION_SKIP_LIMIT = 400;

/**
 * One student's instance of one slot.
 *
 * `allocation` comes from questionGenerationIdentity.resolveGenerationAllocation
 * (or a stored delivery pin). `excludeFingerprints` is how Recovery asks for "a
 * question this student has not already seen": the walk moves forward past any
 * excluded fingerprint, deterministically, so a reload lands on the same one.
 *
 * Never throws. A slot that cannot produce a question returns `{ error }`, and
 * the caller shows that ONE question as unavailable — exactly how the legacy
 * generator contained its failures.
 */
export const resolveFamilyQuestionInstance = ({
  question = null,
  assignmentId = '',
  storageIndex = 0,
  slotKey: providedSlotKey = '',
  allocation = null,
  excludeFingerprints = [],
  support = null,
  // Replay mode: land on `allocation.index` exactly, with no exclusion walk.
  // Only reproduceFamilyQuestionFromPin sets it.
  exact = false,
  // Verification of a pin written before a wrapped student's earlier versions
  // were excluded as DELIVERED: walk the way that pin was allocated (earlier
  // versions excluded where each started). Only deliveryPinAllocationProblem
  // sets it; no new delivery is ever made this way.
  legacyWrapExclusion = false,
} = {}) => {
  const slotKey = clean(providedSlotKey) || familySlotKey({ assignmentId, question, storageIndex });
  const definition = resolveQuestionFamilyDefinition(question, { slotKey, support });
  if (definition.error) return { error: definition.error, issues: definition.issues || [], slotKey };

  const { family, constraintValues, tool } = definition;
  // A support modification reads from its own distinct list, so modified
  // students are still uniquely seated among themselves.
  const sequenceSeed = definition.support ? `${slotKey}|support:${definition.support}` : slotKey;
  const sequence = cachedFamilyInstanceSequence(family, constraintValues, sequenceSeed);

  const seat = Math.max(0, Math.floor(Number(allocation?.seat) || 0));
  const variant = Math.max(0, Math.floor(Number(allocation?.variant) || 0));
  const stride = Number.isInteger(Number(allocation?.stride)) && Number(allocation.stride) >= 1
    ? Math.min(GENERATION_STRIDE, Number(allocation.stride))
    : GENERATION_STRIDE;
  const requestedIndex = Number.isInteger(Number(allocation?.index)) && Number(allocation.index) >= 0
    ? Number(allocation.index)
    : seat + variant * stride;

  const resolveAt = (rawIndex) => {
    const direct = sequence.instanceAt(rawIndex);
    if (direct) return { instance: direct, index: rawIndex, wrapped: false };
    const count = sequence.distinctFound;
    if (!count) return { instance: null, index: rawIndex, wrapped: false };
    // The family has fewer distinct questions than this index. Repeats are
    // now unavoidable; the delivery says so (`wrapped`) and Pre-Flight warned.
    const wrappedIndex = rawIndex % count;
    return { instance: sequence.instanceAt(wrappedIndex), index: wrappedIndex, wrapped: true };
  };

  const requested = resolveAt(requestedIndex);
  if (!requested.instance) return { error: FAMILY_RESOLUTION_ERROR.NO_VALID_INSTANCES, issues: [], slotKey };

  const external = new Set(exact ? [] : (Array.isArray(excludeFingerprints) ? excludeFingerprints : []).map(clean).filter(Boolean));
  // Forward, deterministically, past every excluded fingerprint.
  const walkPast = (start, excludedSet) => {
    let current = start;
    let walkIndex = start.index;
    let steps = 0;
    while (current.instance && excludedSet.has(current.instance.fingerprint) && steps < EXCLUSION_SKIP_LIMIT) {
      walkIndex += 1;
      steps += 1;
      current = resolveAt(walkIndex);
    }
    return { located: current, skipped: steps };
  };
  const mostRecent = (list, count) => (count > 0 ? list.slice(-count) : []);

  // Once indices wrap, this student's own earlier variants are no longer
  // distinct by construction, so they are excluded explicitly — each by the
  // version it DELIVERED. An earlier variant that wrapped walked past its own
  // exclusions, so where it started is not what the student saw; excluding
  // starts let a long run of "New Question" cycle through a handful of
  // versions while the family still had others. At most the latest
  // (distinct − 1) are excluded: a student who has had every version starts
  // again at the one seen longest ago instead of being refused a question.
  const excluded = new Set(external);
  if (!exact && requested.wrapped && variant > 0 && legacyWrapExclusion) {
    for (let earlier = 0; earlier < variant; earlier += 1) {
      const prior = resolveAt(seat + earlier * stride).instance;
      if (prior) excluded.add(prior.fingerprint);
    }
  } else if (!exact && requested.wrapped && variant > 0) {
    const delivered = [];
    for (let earlier = 0; earlier < variant; earlier += 1) {
      const start = resolveAt(seat + earlier * stride);
      if (!start.instance) continue;
      const earlierExcluded = new Set(external);
      if (start.wrapped && earlier > 0) {
        mostRecent(delivered, sequence.distinctFound - 1).forEach((fingerprint) => earlierExcluded.add(fingerprint));
      }
      const { located: shown } = walkPast(start, earlierExcluded);
      if (shown.instance && !earlierExcluded.has(shown.instance.fingerprint)) delivered.push(shown.instance.fingerprint);
    }
    mostRecent(delivered, sequence.distinctFound - 1).forEach((fingerprint) => excluded.add(fingerprint));
  }

  const { located, skipped } = walkPast(requested, excluded);
  if (!located.instance || excluded.has(located.instance.fingerprint)) {
    return { error: FAMILY_RESOLUTION_ERROR.ALL_INSTANCES_EXCLUDED, issues: [], slotKey };
  }

  const instance = located.instance;
  return {
    error: null,
    slotKey,
    family,
    instance,
    question: buildFamilyQuestion({ family, instance, constraintValues, authored: question, tool }),
    delivery: {
      v: DELIVERY_PIN_VERSION,
      engine: QUESTION_FAMILY_ENGINE,
      familyId: family.id,
      familyVersion: family.version,
      slot: slotKey,
      variant,
      // The index ASKED for, which is what reproduces this delivery: walking
      // from it with the same exclusions lands on the same instance.
      index: requestedIndex,
      resolvedIndex: located.index,
      seat,
      stride,
      basis: allocation?.basis || ALLOCATION_BASIS.ANONYMOUS,
      fingerprint: instance.fingerprint,
      support: definition.support,
      // The request ran past the family's distinct questions, so this one may
      // also be a classmate's — even when the walk ended on an unwrapped index.
      wrapped: requested.wrapped || located.wrapped,
      skippedForExclusion: skipped,
    },
  };
};

/*
 * THE QUESTION A VALIDATOR JUDGES FOR A FAMILY SLOT.
 *
 * A template is not a question — `"{{m}}"` is not a slope, and a rich tool's
 * own schema rightly refuses a board whose line cannot be derived. Every check
 * that asks "could a student be given this?" (semantic validation, a registry
 * tool's schema, the runtime contract) therefore judges a generated PREVIEW,
 * from this one fixed allocation, so they all judge the same instance and
 * agree with each other. `index` walks further previews for a sampled check.
 *
 * Never throws: `{ error, issues }` for a slot that cannot generate, which the
 * caller reports with `familyResolutionMessage` (one wording, so Pre-Flight's
 * de-duplication folds the runtime-contract and semantic reports together).
 */
export const FAMILY_PREVIEW_ASSIGNMENT_ID = 'semantic-check';

export const resolveFamilyPreviewInstance = (question, { index = 0 } = {}) => {
  const position = Math.max(0, Math.floor(Number(index) || 0));
  return resolveFamilyQuestionInstance({
    question,
    assignmentId: FAMILY_PREVIEW_ASSIGNMENT_ID,
    storageIndex: 0,
    allocation: { seat: position, variant: 0, stride: 1, index: position, basis: ALLOCATION_BASIS.PREVIEW },
  });
};

export const familyResolutionMessage = (label, preview = {}) => (
  `${label} references a Question Family that cannot generate questions (${preview.error}${preview.issues?.length ? `: ${preview.issues.join('; ')}` : ''}). Students would see "This question could not be prepared" instead of a question.`
);

/**
 * Re-create exactly the question a delivery pin describes.
 *
 * Used wherever a question must be the one the student SAW rather than the one
 * a fresh allocation would choose today: a reload after the teacher's app
 * seated the student, a second device, and the server re-grading an attempt.
 * The fingerprint is checked, so a slot whose family or constraints were edited
 * since the pin was written is reported (`pin_mismatch`) instead of silently
 * swapped.
 */
export const reproduceFamilyQuestionFromPin = ({
  question = null,
  assignmentId = '',
  storageIndex = 0,
  pin = null,
} = {}) => {
  const normalized = normalizeDeliveryPin(pin);
  if (!normalized) return { error: FAMILY_RESOLUTION_ERROR.PIN_MISMATCH, issues: ['pin_invalid'] };
  const slotKey = normalized.slot || familySlotKey({ assignmentId, question, storageIndex });
  const result = resolveFamilyQuestionInstance({
    question,
    assignmentId,
    storageIndex,
    slotKey,
    support: normalized.support,
    exact: true,
    allocation: {
      seat: normalized.seat,
      variant: normalized.variant,
      stride: normalized.stride,
      index: normalized.resolvedIndex,
      basis: normalized.basis,
    },
  });
  if (result.error) return result;
  if (result.family.id !== normalized.familyId
    || result.family.version !== normalized.familyVersion
    || result.instance.fingerprint !== normalized.fingerprint) {
    return { error: FAMILY_RESOLUTION_ERROR.PIN_MISMATCH, issues: ['fingerprint_changed'], slotKey };
  }
  return {
    ...result,
    delivery: {
      ...result.delivery,
      // Report the pin's own identity, not the replay's.
      index: normalized.index,
      resolvedIndex: normalized.resolvedIndex,
      basis: normalized.basis,
    },
    reproduced: true,
  };
};
