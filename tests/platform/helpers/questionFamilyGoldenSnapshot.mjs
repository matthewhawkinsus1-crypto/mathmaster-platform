/*
 * WHAT EVERY SHIPPED QUESTION FAMILY VERSION PRODUCES, AS ONE SNAPSHOT.
 *
 * A delivered family question is identified by its pin (family, version,
 * allocation index, fingerprint), and a pin is only worth anything if the same
 * build inputs keep producing the same instance forever. Nothing pinned that
 * until now: every pin in the suite was generated at runtime, so a change that
 * moved every student's question would have regenerated its own "expected"
 * value and passed.
 *
 * This snapshot is the record. scripts/capture-question-family-golden.mjs
 * wrote it ONCE from the build before the Question Family special-case work
 * (main at 9396a77); tests/platform/questionFamilyHistoricalPins.test.mjs
 * recomputes it from the current build and requires byte equality. It covers,
 * per family version:
 *
 *   sequences     the first instances of two slot seeds (fingerprints)
 *   support       the reduce-complexity list, where the family declares one
 *   seats         a 30-student class seated by the real allocator: the full
 *                 delivery pin of variants 0, 1 and 2 for every student
 *   built         a SHA-256 of every tool's built question for the first
 *                 instances — the bytes a student's screen is drawn from
 *   recovery      the Recovery plan pins the real planner writes after each
 *                 of the first students' originals
 *   capacity      what Pre-Flight reports for the default constraints
 *   profiles      (a family with concept constraints only — solutionCase,
 *                 distribute, the number forms) the same for each concept
 *                 setting a slot can ask for beyond the default: its
 *                 instance list, every seated student's pin and the built
 *                 bytes. A version 1 family has none, so its record is
 *                 exactly what was captured at 9396a77.
 *
 * Pure apart from the hash.
 */
import { createHash } from 'node:crypto';

import { resolveFamilyConstraints } from '../../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  createFamilyInstanceSequence,
  measureFamilyCapacity,
} from '../../../functions/shared/questionFamilyEngine.mjs';
import { resolveFamilyQuestionInstance } from '../../../functions/shared/questionFamilyInstance.mjs';
import {
  normalizeDeliveryPin,
  planSeatAdditions,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../../functions/shared/questionGenerationIdentity.mjs';
import { buildRecoveryAssessmentPlan } from '../../../functions/shared/sectionRecoveryPlan.mjs';

export const GOLDEN_ASSIGNMENT_ID = 'golden-assignment';
export const GOLDEN_CLASS_ID = 'golden-class';
export const GOLDEN_STUDENTS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => `golden-student-${String(index + 1).padStart(2, '0')}`),
);
const SEQUENCE_SEEDS = Object.freeze(['golden|slot-a', 'golden|slot-b']);
const SEQUENCE_LENGTH = 48;
const SUPPORT_LENGTH = 24;
const VARIANTS = Object.freeze([0, 1, 2]);
const BUILT_INSTANCES = 8;
const RECOVERY_STUDENTS = 6;
const PROFILE_LENGTH = 24;
const PROFILE_BUILT = 4;

const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The slot an assignment would author for this family version (no constraints: the default draw). */
export const goldenSlotFor = (family) => ({
  questionId: `golden-${family.id}-v${family.version}`,
  type: family.defaultTool,
  prompt: 'Answer the question.',
  activityRole: 'dol',
  questionFamily: { id: family.id, version: family.version },
});

/**
 * The concept settings a slot can ask for beyond the defaults — each other
 * value of every concept choice (solutionCase "none", distribute: true, …).
 */
export const goldenConceptProfiles = (family) => (family.conceptConstraints || []).flatMap((name) => {
  const knob = family.constraints?.[name];
  const values = knob?.kind === 'choice' ? knob.values : knob?.kind === 'boolean' ? [true, false] : [];
  return values
    .filter((value) => JSON.stringify(value) !== JSON.stringify(knob.default))
    .map((value) => ({ label: `${name}=${JSON.stringify(value)}`, constraints: { [name]: value } }));
});

/** The slot that asks for one concept setting. */
export const goldenProfileSlotFor = (family, profile) => ({
  ...goldenSlotFor(family),
  questionId: `golden-${family.id}-v${family.version}-${profile.label}`,
  questionFamily: { id: family.id, version: family.version, constraints: profile.constraints },
});

const goldenAssignment = (slots) => {
  const assignment = {
    id: GOLDEN_ASSIGNMENT_ID,
    schemaVersion: 5,
    assignedClassIds: [GOLDEN_CLASS_ID],
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: slots }],
  };
  assignment.generationSeats = {
    version: 1,
    byClassId: {
      [GOLDEN_CLASS_ID]: planSeatAdditions({ assignment, classId: GOLDEN_CLASS_ID, studentIds: GOLDEN_STUDENTS }),
    },
  };
  return assignment;
};

const sequenceFingerprints = (family, values, seed, length) => {
  const sequence = createFamilyInstanceSequence(family, values, seed);
  const fingerprints = [];
  for (let index = 0; index < length; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    fingerprints.push(instance.fingerprint);
  }
  return fingerprints;
};

const supportFingerprints = (family, slot) => {
  if (!family.supportConstraints?.['reduce-complexity']) return null;
  const fingerprints = [];
  for (let index = 0; index < SUPPORT_LENGTH; index += 1) {
    const result = resolveFamilyQuestionInstance({
      question: slot,
      assignmentId: GOLDEN_ASSIGNMENT_ID,
      storageIndex: 0,
      support: 'reduce-complexity',
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
    });
    fingerprints.push(result.error ? `error:${result.error}` : result.delivery.fingerprint);
  }
  return fingerprints;
};

const builtHashes = (family, values, count = BUILT_INSTANCES) => {
  const sequence = createFamilyInstanceSequence(family, values, SEQUENCE_SEEDS[0]);
  return Object.fromEntries(Object.keys(family.tools).sort().map((tool) => {
    const hashes = [];
    for (let index = 0; index < count; index += 1) {
      const instance = sequence.instanceAt(index);
      if (!instance) break;
      hashes.push(sha256(buildFamilyQuestion({
        family,
        instance,
        constraintValues: values,
        authored: { questionId: 'golden-built', type: tool, prompt: 'Answer the question.', activityRole: 'dol' },
        tool,
      })));
    }
    return [tool, hashes];
  }));
};

/** Every concept setting's list, seat pins and built bytes; null for a family without concept constraints. */
const profileSnapshots = (family, assignment) => {
  const profiles = goldenConceptProfiles(family);
  if (!profiles.length) return null;
  return Object.fromEntries(profiles.map((profile) => {
    const { values } = resolveFamilyConstraints(family, profile.constraints);
    const slot = goldenProfileSlotFor(family, profile);
    const seats = Object.fromEntries(GOLDEN_STUDENTS.map((studentId) => {
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: GOLDEN_CLASS_ID });
      const result = resolveFamilyQuestionInstance({
        question: slot,
        assignmentId: GOLDEN_ASSIGNMENT_ID,
        storageIndex: 0,
        allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 }),
      });
      return [studentId, result.error ? { error: result.error } : normalizeDeliveryPin(result.delivery)];
    }));
    return [profile.label, {
      constraints: profile.constraints,
      sequence: sequenceFingerprints(family, values, SEQUENCE_SEEDS[0], PROFILE_LENGTH),
      seats,
      built: builtHashes(family, values, PROFILE_BUILT),
    }];
  }));
};

/**
 * The snapshot of `families` (frozen family objects), keyed `id@version`.
 * `measureCapacity: false` skips the exhaustive capacity walk (tests that only
 * need pins stay fast).
 */
export const computeQuestionFamilyGoldenSnapshot = (families, { measureCapacity = true } = {}) => {
  const slots = families.map(goldenSlotFor);
  const assignment = goldenAssignment(slots);
  const questionsByIndex = Object.fromEntries(slots.map((slot, index) => [index, slot]));
  const snapshot = {};
  families.forEach((family, storageIndex) => {
    const slot = slots[storageIndex];
    const { values } = resolveFamilyConstraints(family, {});
    const seats = {};
    GOLDEN_STUDENTS.forEach((studentId) => {
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: GOLDEN_CLASS_ID });
      seats[studentId] = VARIANTS.map((variant) => {
        const result = resolveFamilyQuestionInstance({
          question: slot,
          assignmentId: GOLDEN_ASSIGNMENT_ID,
          storageIndex,
          allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant }),
        });
        return result.error ? { error: result.error } : normalizeDeliveryPin(result.delivery);
      });
    });
    const recovery = GOLDEN_STUDENTS.slice(0, RECOVERY_STUDENTS).map((studentId) => {
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: GOLDEN_CLASS_ID });
      const original = seats[studentId][0];
      const plan = buildRecoveryAssessmentPlan({
        assignmentId: GOLDEN_ASSIGNMENT_ID,
        section: 'dol',
        readySlots: [{ storageIndex, questionId: slot.questionId, ready: true }],
        questionsByIndex,
        seatInfo,
        seenFingerprints: original.fingerprint ? [original.fingerprint] : [],
      });
      return (plan.items || []).map((item) => normalizeDeliveryPin(item.pin));
    });
    snapshot[`${family.id}@${family.version}`] = {
      sequences: Object.fromEntries(SEQUENCE_SEEDS.map((seed) => [seed, sequenceFingerprints(family, values, seed, SEQUENCE_LENGTH)])),
      support: supportFingerprints(family, slot),
      seats,
      built: builtHashes(family, values),
      recovery,
      ...(measureCapacity ? { capacity: measureFamilyCapacity(family, values) } : {}),
    };
    const profiles = profileSnapshots(family, assignment);
    if (profiles) snapshot[`${family.id}@${family.version}`].profiles = profiles;
  });
  return snapshot;
};
