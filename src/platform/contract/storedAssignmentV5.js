import {
  flattenV5Sections,
  normalizeAssignmentV5,
  rebuildV5SectionsFromQuestions,
} from './assignmentSchemaV5.js';
import { repairKnownFirestoreNestedArrays } from '../persistence/firestoreAssignmentSafety.js';
import { repairAssignmentForCurrentRuntime } from '../assignments/assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const validRuntimeCompatibility = (value) => {
  if (!isObject(value)) return null;
  const repairVersion = Number(value.repairVersion);
  const repairedAt = clean(value.repairedAt);
  const repairKeys = Array.isArray(value.repairKeys)
    ? [...new Set(value.repairKeys.map(clean).filter(Boolean))]
    : [];
  if (!Number.isInteger(repairVersion) || repairVersion < 1 || !repairedAt || !repairKeys.length) return null;
  return { repairVersion, repairedAt, repairKeys };
};

/**
 * Canonical runtime readers.
 *
 * Assignment V5 is now the only assignment contract. These helpers deliberately
 * do not fall back to retired flat runtime/persistence mirrors. If a record is
 * not V5 or does not contain sections/policies, it is treated as incomplete
 * rather than silently reviving legacy state.
 */
export const getStoredAssignmentQuestions = (assignment = {}) => {
  if (!isObject(assignment) || Number(assignment.schemaVersion) !== 5) return [];
  return flattenV5Sections(assignment);
};

/**
 * Build the compatibility view used by current renderers and validators.
 *
 * This is intentionally pure. The saved Assignment V5 object remains the
 * literal source of truth until an explicit teacher-side persistence flow
 * chooses to write a repair in a later step. Runtime consumers can therefore
 * benefit from known platform corrections without changing student progress or
 * silently rewriting the library record.
 */
export const prepareAssignmentForRuntime = (assignment = {}, context = {}) => (
  repairAssignmentForCurrentRuntime(assignment, {
    ...context,
    source: context?.source || 'storedAssignmentV5',
  })
);

export const getRuntimeAssignmentQuestions = (assignment = {}, context = {}) => {
  const prepared = prepareAssignmentForRuntime(assignment, context);
  return getStoredAssignmentQuestions(prepared.assignment);
};

export const getStoredVariantPolicy = (assignment = {}) => (
  Number(assignment?.schemaVersion) === 5 && isObject(assignment?.variantPolicy)
    ? assignment.variantPolicy
    : {}
);

export const getStoredAssignmentVariantMode = (assignment = {}) => {
  const policy = getStoredVariantPolicy(assignment);
  return clean(policy.mode).toLowerCase() || 'personalized';
};

export const getStoredSectionVariantModes = (assignment = {}) => {
  const policy = getStoredVariantPolicy(assignment);
  return isObject(policy.sectionModes) ? policy.sectionModes : {};
};

export const getStoredSectionVariantMode = (assignment = {}, activityRole = '') => {
  const role = clean(activityRole).toLowerCase();
  const sectionModes = getStoredSectionVariantModes(assignment);
  return clean(sectionModes?.[role]).toLowerCase()
    || getStoredAssignmentVariantMode(assignment);
};

export const getStoredAssignmentTypeProjection = (assignment = {}) => {
  if (Number(assignment?.schemaVersion) !== 5) return 'practice';
  const roles = (Array.isArray(assignment?.sections) ? assignment.sections : [])
    .map((section) => clean(section?.role).toLowerCase())
    .filter(Boolean);

  if (!roles.length) return 'practice';
  const unique = new Set(roles);

  if (unique.size === 1) {
    const [onlyRole] = [...unique];
    if (onlyRole === 'test') return 'test';
    if (onlyRole === 'quiz') return 'quiz';
    if (onlyRole === 'warmup') return 'warmup';
    if (onlyRole === 'classwork') return 'notesClasswork';
    return 'practice';
  }

  // Quiz/Test are designed as separate assignments. Preserve their identity if
  // they are the dominant summative role, but a lesson bundle with classwork or
  // warm-up remains a notes/classwork assignment.
  if (unique.has('classwork') || unique.has('warmup')) return 'notesClasswork';
  if (unique.has('test')) return 'test';
  if (unique.has('quiz')) return 'quiz';
  return 'practice';
};

const alignmentCodes = (question = {}) => {
  const codes = [];
  asArray(question.alignments).forEach((alignment) => {
    if (!isObject(alignment)) return;
    const framework = clean(alignment.framework).toLowerCase();
    if (framework === 'teks' || !framework) codes.push(clean(alignment.code));
  });
  [
    question.primaryTEKS,
    question.teks,
    question.standard,
    question.primaryStandard,
    ...asArray(question.standards),
  ].forEach((value) => {
    if (typeof value === 'string' || typeof value === 'number') codes.push(clean(value));
  });
  return codes.filter(Boolean);
};

export const inferStoredAssignmentCourseId = (
  assignment = {},
  questions = getStoredAssignmentQuestions(assignment),
) => {
  const direct = clean(
    assignment.courseId
    || assignment.assignment?.courseId
    || assignment.courseProfile?.course
    || assignment.course,
  );
  if (direct) return direct;

  const codes = [
    ...asArray(assignment.standards).map(clean),
    ...asArray(questions).flatMap(alignmentCodes),
  ].map((value) => value.toUpperCase());

  if (codes.some((code) => /^(?:A2|2A)[.\s:-]/.test(code))) return 'algebra2';
  if (codes.some((code) => /^A[.\s:-]/.test(code))) return 'algebra1';
  return null;
};

const reusableOutputProfiles = (assignment = {}) => {
  const outputProfiles = isObject(assignment.outputProfiles) ? { ...assignment.outputProfiles } : {};
  const canonicalNotes = isObject(outputProfiles.lessonNotesPdf) ? outputProfiles.lessonNotesPdf : {};
  const runtimeNotes = isObject(assignment.lessonResources?.notesPdf) ? assignment.lessonResources.notesPdf : {};
  const runtimeSections = Array.isArray(runtimeNotes.sections) ? runtimeNotes.sections : [];
  const canonicalSections = Array.isArray(canonicalNotes.sections) ? canonicalNotes.sections : [];

  if (!Object.keys(runtimeNotes).length) return outputProfiles;

  const {
    asset: _asset,
    ...portableRuntimeNotes
  } = runtimeNotes;
  return {
    ...outputProfiles,
    lessonNotesPdf: {
      ...portableRuntimeNotes,
      ...canonicalNotes,
      // A generated Storage asset belongs to one delivery, but the authored
      // note sections belong to the reusable lesson. Restore them when an older
      // library record kept them only in lessonResources.
      sections: canonicalSections.length ? canonicalSections : runtimeSections,
    },
  };
};

const reusableClassroomIntegration = (assignment = {}) => {
  const canonical = isObject(assignment.classroomIntegration) ? assignment.classroomIntegration : {};
  const runtime = isObject(assignment.classroomPackage) ? assignment.classroomPackage : {};
  if (!Object.keys(runtime).length) return canonical;

  const mergeNested = (key) => ({
    ...(isObject(runtime[key]) ? runtime[key] : {}),
    ...(isObject(canonical[key]) ? canonical[key] : {}),
  });

  return {
    ...runtime,
    ...canonical,
    topic: mergeNested('topic'),
    assignmentPost: mergeNested('assignmentPost'),
    resourcesPost: mergeNested('resourcesPost'),
    gradePassback: mergeNested('gradePassback'),
    additionalLinks: Array.isArray(canonical.additionalLinks)
      ? canonical.additionalLinks
      : (Array.isArray(runtime.additionalLinks) ? runtime.additionalLinks : []),
  };
};

export const storedAssignmentToV5 = (assignment = {}, {
  titleOverride = null,
  questions = null,
  resetAssignmentKey = false,
} = {}) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    throw new Error('A stored assignment object is required.');
  }
  if (Number(assignment.schemaVersion) !== 5) {
    throw new Error('Only Assignment V5 records can be reconstructed.');
  }

  // An explicit questions override is used only by controlled edit/repair flows.
  // Ordinary reads always derive question order and section identity from sections[].
  const sourceQuestions = Array.isArray(questions)
    ? questions
    : getStoredAssignmentQuestions(assignment);

  const courseId = inferStoredAssignmentCourseId(assignment, sourceQuestions);
  if (!courseId) {
    throw new Error(
      'This saved assignment does not contain enough course/TEKS information to reconstruct Assignment V5 safely. Reopen it from its original V5 source before editing, duplicating, or exporting it.',
    );
  }

  const title = clean(titleOverride ?? assignment.title ?? assignment.assignment?.title);
  const sourceVariantPolicy = getStoredVariantPolicy(assignment);
  const sectionModes = getStoredSectionVariantModes(assignment);
  const runtimeCompatibility = resetAssignmentKey ? null : validRuntimeCompatibility(assignment.runtimeCompatibility);

  return normalizeAssignmentV5({
    schemaVersion: 5,
    assignment: {
      ...(isObject(assignment.assignment) ? assignment.assignment : {}),
      id: resetAssignmentKey ? null : (clean(assignment.id) || null),
      assignmentKey: resetAssignmentKey ? null : (assignment.assignmentKey ?? assignment.assignment?.assignmentKey ?? null),
      title,
      courseId,
      folder: assignment.folder ?? assignment.assignment?.folder ?? null,
      instructionalPurpose: assignment.instructionalPurpose ?? assignment.assignment?.instructionalPurpose ?? 'lesson',
      gradingPurpose: assignment.gradingPurpose ?? assignment.assignment?.gradingPurpose ?? null,
    },
    sections: rebuildV5SectionsFromQuestions(assignment, sourceQuestions),
    variantPolicy: {
      ...sourceVariantPolicy,
      mode: getStoredAssignmentVariantMode(assignment),
      sectionModes,
    },
    differentiationPolicy: assignment.differentiationPolicy,
    supportPolicy: assignment.supportPolicy,
    toolPolicy: assignment.toolPolicy,
    deliveryPolicy: assignment.deliveryPolicy,
    gradingPolicy: assignment.gradingPolicy,
    evidencePolicy: assignment.evidencePolicy,
    outputProfiles: reusableOutputProfiles(assignment),
    classroomIntegration: reusableClassroomIntegration(assignment),
    provenance: assignment.provenance,
    preflight: assignment.preflight,
    ...(runtimeCompatibility ? { runtimeCompatibility } : {}),
  });
};

export const canonicalV5PersistencePatch = (assignmentV5 = {}) => {
  // Preflight normally hands persistence an already repaired V5 object. Run the
  // same deterministic coordinate repair again here so controlled save paths
  // cannot reintroduce Firestore-illegal point tuples between validation and
  // the final write assertion.
  const { value: safeAssignmentV5 } = repairKnownFirestoreNestedArrays(assignmentV5);
  const runtimeCompatibility = validRuntimeCompatibility(safeAssignmentV5.runtimeCompatibility);

  return {
    schemaVersion: 5,
    title: safeAssignmentV5.assignment?.title || '',
    courseId: safeAssignmentV5.assignment?.courseId || null,
    folder: safeAssignmentV5.assignment?.folder || null,
    instructionalPurpose: safeAssignmentV5.assignment?.instructionalPurpose || 'lesson',
    gradingPurpose: safeAssignmentV5.assignment?.gradingPurpose ?? null,
    sections: safeAssignmentV5.sections || [],
    variantPolicy: safeAssignmentV5.variantPolicy || {},
    differentiationPolicy: safeAssignmentV5.differentiationPolicy || null,
    supportPolicy: safeAssignmentV5.supportPolicy || null,
    toolPolicy: safeAssignmentV5.toolPolicy || null,
    deliveryPolicy: safeAssignmentV5.deliveryPolicy || null,
    gradingPolicy: safeAssignmentV5.gradingPolicy || null,
    evidencePolicy: safeAssignmentV5.evidencePolicy || null,
    outputProfiles: safeAssignmentV5.outputProfiles || null,
    classroomIntegration: safeAssignmentV5.classroomIntegration || null,
    provenance: safeAssignmentV5.provenance || null,
    preflight: safeAssignmentV5.preflight || { required: true },
    ...(runtimeCompatibility ? { runtimeCompatibility } : {}),
  };
};

export default storedAssignmentToV5;
