import {
  flattenV5Sections,
  normalizeAssignmentV5,
  rebuildV5SectionsFromQuestions,
} from './assignmentSchemaV5.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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

export const inferStoredAssignmentCourseId = (assignment = {}, questions = assignment?.questions || []) => {
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

export const storedAssignmentToV5 = (assignment = {}, {
  titleOverride = null,
  questions = null,
  resetAssignmentKey = false,
} = {}) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    throw new Error('A stored assignment object is required.');
  }
  const sourceQuestions = Array.isArray(questions)
    ? questions
    : flattenV5Sections(assignment);
  const courseId = inferStoredAssignmentCourseId(assignment, sourceQuestions);
  if (!courseId) {
    throw new Error(
      'This saved assignment does not contain enough course/TEKS information to reconstruct Assignment V5 safely. Reopen it from its original V5 source before editing, duplicating, or exporting it.',
    );
  }

  const title = clean(titleOverride ?? assignment.title ?? assignment.assignment?.title);
  const sourceVariantPolicy = isObject(assignment.variantPolicy) ? assignment.variantPolicy : {};
  const sectionModes = isObject(sourceVariantPolicy.sectionModes)
    ? sourceVariantPolicy.sectionModes
    : isObject(assignment.sectionVariantModes) ? assignment.sectionVariantModes : {};

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
      mode: sourceVariantPolicy.mode || assignment.variantMode || 'personalized',
      sectionModes,
    },
    differentiationPolicy: assignment.differentiationPolicy,
    supportPolicy: assignment.supportPolicy,
    toolPolicy: assignment.toolPolicy,
    deliveryPolicy: assignment.deliveryPolicy,
    gradingPolicy: assignment.gradingPolicy,
    evidencePolicy: assignment.evidencePolicy,
    outputProfiles: assignment.outputProfiles,
    classroomIntegration: assignment.classroomIntegration,
    provenance: assignment.provenance,
    preflight: assignment.preflight,
  });
};

export const canonicalV5PersistencePatch = (assignmentV5 = {}) => ({
  schemaVersion: 5,
  title: assignmentV5.assignment?.title || '',
  courseId: assignmentV5.assignment?.courseId || null,
  folder: assignmentV5.assignment?.folder || null,
  instructionalPurpose: assignmentV5.assignment?.instructionalPurpose || 'lesson',
  gradingPurpose: assignmentV5.assignment?.gradingPurpose ?? null,
  sections: assignmentV5.sections || [],
  variantPolicy: assignmentV5.variantPolicy || {},
  variantMode: assignmentV5.variantPolicy?.mode || 'personalized',
  sectionVariantModes: assignmentV5.variantPolicy?.sectionModes || {},
  differentiationPolicy: assignmentV5.differentiationPolicy || null,
  supportPolicy: assignmentV5.supportPolicy || null,
  toolPolicy: assignmentV5.toolPolicy || null,
  deliveryPolicy: assignmentV5.deliveryPolicy || null,
  gradingPolicy: assignmentV5.gradingPolicy || null,
  evidencePolicy: assignmentV5.evidencePolicy || null,
  outputProfiles: assignmentV5.outputProfiles || null,
  classroomIntegration: assignmentV5.classroomIntegration || null,
  provenance: assignmentV5.provenance || null,
  preflight: assignmentV5.preflight || { required: true },
});

export default storedAssignmentToV5;
