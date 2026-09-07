import { normalizeAssignmentV5, validateAssignmentV5, flattenV5Sections } from '../contract/assignmentSchemaV5.js';
import { validateQuestionsSemantics } from '../contract/semanticValidation.js';
import { validateAlignments, auditAlignmentSpecificity } from '../contract/alignments.js';
import { toEnforcedActivityPolicy } from '../policies/activityPolicies.js';
import { validateAssignmentInteractionContracts } from '../interaction/interactionContract.js';
import { auditAssignmentWorksheetPrintability } from './worksheetPrintPreflight.js';
import { auditAssignmentSupportDifferentiation } from './supportDifferentiationPreflight.js';
import { buildPreflightDiagnostics } from './preflightDiagnostics.js';
import { deriveAssignmentAuthoringState } from './assignmentAuthoringState.js';
import {
  findFirestoreUnsafeNestedArrays,
  repairKnownFirestoreNestedArrays,
} from '../persistence/firestoreAssignmentSafety.js';

const clean = (value) => String(value ?? '').trim();

const titleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  quiz: 'Quiz',
  test: 'Test',
}[role] || 'Section');

const asMessages = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);

// Overrides ride with the review context in the Repair Center, and on the
// assignment itself for a stored draft. Readiness must see them either way, or
// a teacher's override applies on screen and vanishes on reload.
const diagnosticOverridesFrom = (assignmentV5 = {}, teacherReviewContext = null) => {
  const candidates = [
    teacherReviewContext?.diagnosticOverrides,
    assignmentV5?.teacherReviewContext?.diagnosticOverrides,
    assignmentV5?.authoringReview?.diagnosticOverrides,
  ];
  return candidates.find(Array.isArray) || [];
};

const teacherFlagsFrom = (assignmentV5 = {}) => {
  const candidates = [
    assignmentV5?.authoringReview?.teacherFlags,
    assignmentV5?.review?.teacherFlags,
    assignmentV5?.reviewState?.teacherFlags,
    assignmentV5?.preflight?.teacherFlags,
  ];
  return candidates.find(Array.isArray) || [];
};

const explicitlyPublished = (assignmentV5 = {}) => (
  clean(assignmentV5?.authoringReview?.state).toLowerCase() === 'published'
  || clean(assignmentV5?.review?.status).toLowerCase() === 'published'
  || clean(assignmentV5?.authoringState).toLowerCase() === 'published'
);

export const buildAssignmentV5PreflightModel = (input = {}, { titleOverride = null, teacherReviewContext = null } = {}) => {
  const normalizedSource = normalizeAssignmentV5({
    ...input,
    assignment: {
      ...(input?.assignment || {}),
      ...(clean(titleOverride) ? { title: clean(titleOverride) } : {}),
    },
  });

  // Coordinate pairs such as [[3, 0], [5, 0]] are natural authoring JSON but
  // illegal Firestore values because an array cannot directly contain another
  // array. Repair only known point-list fields; anything else remains visible
  // to the generic detector below and becomes a blocking Preflight error.
  const firestoreRepair = repairKnownFirestoreNestedArrays(normalizedSource);
  const source = firestoreRepair.value;
  const firestoreUnsafePaths = findFirestoreUnsafeNestedArrays(source);

  const structural = validateAssignmentV5(source);
  const sections = (source.sections || []).map((section, index) => ({
    ...section,
    id: clean(section.id) || `section-${index + 1}`,
    sectionId: clean(section.id) || `section-${index + 1}`,
    title: clean(section.title) || titleForRole(section.role),
    policy: toEnforcedActivityPolicy(section.role),
    questions: (section.questions || []).map((question) => ({
      ...question,
      sectionId: question.sectionId || section.id || `section-${index + 1}`,
      activityRole: question.activityRole || section.role,
    })),
  }));

  const questions = flattenV5Sections({ ...source, sections });
  const semantic = validateQuestionsSemantics(questions);
  const interaction = validateAssignmentInteractionContracts(questions);
  const worksheetPrint = auditAssignmentWorksheetPrintability({ ...source, sections }, questions);
  const supportDifferentiation = auditAssignmentSupportDifferentiation({ ...source, sections }, questions);

  const persistenceErrors = firestoreUnsafePaths.map((path) => (
    `Firestore cannot save an array directly inside another array (found at ${path}). MathMaster cannot safely auto-repair this structure because it is not a recognized coordinate-pair list.`
  ));
  const persistenceWarnings = firestoreRepair.repairCount > 0
    ? [`MathMaster auto-repaired ${firestoreRepair.repairCount} coordinate pair${firestoreRepair.repairCount === 1 ? '' : 's'} into Firestore-safe point objects before save.`]
    : [];
  const alignmentErrors = [];
  const alignmentWarnings = [];
  const alignmentProvenanceWarnings = [];

  questions.forEach((question, index) => {
    const alignment = validateAlignments(question, { label: `Question ${index + 1}` });
    alignmentErrors.push(...asMessages(alignment.errors));
    alignmentWarnings.push(...asMessages(alignment.warnings));

    const assessmentContext = question?.assessmentContext;
    const directExamStyle = assessmentContext?.examStyle === true
      && ['digitalSAT', 'act', 'tsia2', 'asvab'].includes(String(assessmentContext?.framework || ''));
    if (directExamStyle && question?.ccmrSource?.source !== 'auditedBank') {
      alignmentProvenanceWarnings.push(`Question ${index + 1} is direct ${assessmentContext.framework} practice but is not sourced from the audited CCMR V2.1 assignment bank. Its alignment can still validate, but MathMaster cannot label its provenance as bank-backed.`);
    }
  });
  const alignmentSpecificityWarnings = asMessages(auditAlignmentSpecificity(questions).warnings);

  const diagnosticGroups = [
    { source: 'persistence', severity: 'blocking', messages: persistenceErrors },
    { source: 'structural', severity: 'blocking', messages: asMessages(structural.errors) },
    { source: 'semantic', severity: 'blocking', messages: asMessages(semantic.errors) },
    { source: 'interaction', severity: 'blocking', messages: asMessages(interaction.errors) },
    { source: 'worksheetPrint', severity: 'blocking', messages: asMessages(worksheetPrint.errors) },
    { source: 'supportDifferentiation', severity: 'blocking', messages: asMessages(supportDifferentiation.errors) },
    { source: 'alignment', severity: 'blocking', messages: alignmentErrors },
    { source: 'persistence', severity: 'warning', messages: persistenceWarnings },
    { source: 'structural', severity: 'warning', messages: asMessages(structural.warnings) },
    { source: 'semantic', severity: 'warning', messages: asMessages(semantic.warnings) },
    { source: 'interaction', severity: 'warning', messages: asMessages(interaction.warnings) },
    { source: 'worksheetPrint', severity: 'warning', messages: asMessages(worksheetPrint.warnings) },
    { source: 'supportDifferentiation', severity: 'warning', messages: asMessages(supportDifferentiation.warnings) },
    { source: 'alignment', severity: 'warning', messages: alignmentWarnings },
    { source: 'alignmentProvenance', severity: 'warning', messages: alignmentProvenanceWarnings },
    { source: 'alignmentSpecificity', severity: 'warning', messages: alignmentSpecificityWarnings },
  ];

  const errors = diagnosticGroups
    .filter((group) => group.severity === 'blocking')
    .flatMap((group) => group.messages);
  const warnings = diagnosticGroups
    .filter((group) => group.severity === 'warning')
    .flatMap((group) => group.messages);
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const diagnostics = buildPreflightDiagnostics({
    groups: diagnosticGroups,
    sections,
    // The normalized model normally preserves questionId, but the original
    // input remains the identity fallback while older V5 payloads migrate.
    identitySections: Array.isArray(input?.sections) ? input.sections : null,
  });
  const authoringState = deriveAssignmentAuthoringState({
    diagnostics,
    teacherFlags: teacherFlagsFrom(source),
    published: explicitlyPublished(source),
    diagnosticOverrides: diagnosticOverridesFrom(source, teacherReviewContext),
  });

  return {
    assignmentV5: { ...source, sections },
    sections,
    questions,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    diagnostics,
    authoringState,
    isValid: uniqueErrors.length === 0,
  };
};

export const sectionVariantModeV5 = (assignmentV5 = {}, role) => (
  assignmentV5?.variantPolicy?.sectionModes?.[role]
  || assignmentV5?.variantPolicy?.mode
  || 'personalized'
);
