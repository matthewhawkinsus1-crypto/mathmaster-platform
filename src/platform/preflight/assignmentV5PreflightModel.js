import { normalizeAssignmentV5, validateAssignmentV5, flattenV5Sections } from '../contract/assignmentSchemaV5.js';
import { validateLessonSupportsV5 } from '../contract/lessonSupportsV5.js';
import { validateAssignmentQuestions } from '../../assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../contract/semanticValidation.js';
import { validateAlignments, auditAlignmentSpecificity } from '../contract/alignments.js';
import { prepareAssignmentForRuntime } from '../contract/storedAssignmentV5.js';
import { toEnforcedActivityPolicy } from '../policies/activityPolicies.js';
import { validateAssignmentInteractionContracts } from '../interaction/interactionContract.js';
import { auditAssignmentToolContracts } from '../contract/questionToolContract.js';
import { auditAssignmentWorksheetPrintability } from './worksheetPrintPreflight.js';
import { auditAssignmentSupportDifferentiation } from './supportDifferentiationPreflight.js';
import { auditAssignmentQuestionGeneration } from './questionGenerationPreflight.js';
import { auditAssignmentQuestionValues } from './questionValuePreflight.js';
import { auditAssignmentProcessMode } from './processModePreflight.js';
import { auditAssignmentGraphAccessibility } from './graphAccessibilityPreflight.js';
import { auditAssignmentSolutionReviews } from './solutionReviewPreflight.js';
import { auditAssignmentAttemptFeedback } from './attemptFeedbackPreflight.js';
import { auditAssignmentHiddenHints, auditAssignmentHintAnswers } from './hintAnswerPreflight.js';
import { auditAssignmentChoiceOptions } from './choiceOptionPreflight.js';
import { auditAssignmentSpanishVersions } from './spanishVersionPreflight.js';
import { auditAssignmentAnswerKeys } from './answerKeyPreflight.js';
import { auditAssignmentImpossibleItems } from './impossibleItemsPreflight.js';
import { auditAssignmentOtherQuestionReferences } from './otherQuestionReferencePreflight.js';
import { auditAssignmentGraphingCalculatorPrompts } from './graphingCalculatorPromptPreflight.js';
import { buildPreflightDiagnostics } from './preflightDiagnostics.js';
import { deriveAssignmentAuthoringState } from './assignmentAuthoringState.js';
import { analyzeClassworkPlannedTime } from '../teacher/classworkPacing.js';
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

// `assignment` is the Assignment V5 object the section belongs to: its
// `gradingPolicy.attemptPolicy` may declare unlimited attempts, and Pre-Flight
// shows the teacher the number the student will actually get.
const withRuntimeSectionMetadata = (section, index, assignment = null) => ({
  ...section,
  id: clean(section?.id) || `section-${index + 1}`,
  sectionId: clean(section?.id) || `section-${index + 1}`,
  title: clean(section?.title) || titleForRole(section?.role),
  policy: toEnforcedActivityPolicy(section?.role, assignment),
  questions: (section?.questions || []).map((question) => ({
    ...question,
    sectionId: question.sectionId || section?.id || `section-${index + 1}`,
    activityRole: question.activityRole || section?.role,
  })),
});

export const buildAssignmentV5PreflightModel = (input = {}, { titleOverride = null, teacherReviewContext = null, classSize = null } = {}) => {
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

  // Runtime compatibility repair is deliberately a read-time view here. The
  // Preflight renderer and interaction/worksheet audits should judge what the
  // current platform will actually show, but assignmentV5 below remains the
  // literal normalized persistence shape until the guarded teacher-side
  // persistence step explicitly stamps and saves a safe repair.
  const runtimeRepair = prepareAssignmentForRuntime(source, { source: 'preflight' });
  const runtimeSource = runtimeRepair.assignment;

  const structural = validateAssignmentV5(source);
  // Worked examples, reference cards, follow-through and checkpoints
  // (lessonSupportsV5.js): optional fields of new assignments, judged on the
  // stored assignment as the compiler judged them on the authored one. One
  // that carries none of them gains no error here. (Kept out of
  // validateAssignmentV5, which the student app loads, so the rules cost the
  // student's first load nothing.)
  const supports = validateLessonSupportsV5(source);
  structural.errors.push(...supports.errors);
  structural.warnings.push(...supports.warnings);
  const sections = (runtimeSource.sections || []).map((section, index) => withRuntimeSectionMetadata(section, index, runtimeSource));
  const persistenceSections = (source.sections || []).map((section, index) => withRuntimeSectionMetadata(section, index, source));

  const questions = flattenV5Sections({ ...runtimeSource, sections });

  // PRE-FLIGHT JUDGES WHAT STUDENTS WILL BE GIVEN.
  //
  // A question the teacher excluded (Exclude, Throw Out Safely, or a swap that
  // retires it) stays in the record so student history keeps its meaning, but
  // it is never delivered or graded. Judging it as deliverable is what
  // deadlocked the Question Editor: the defect that made the teacher retire a
  // question blocked the very save that retired it. So the delivery checks
  // below skip retired questions — and only those: every question that stays
  // active is judged exactly as before, labelled by its stored position, and
  // re-including a retired question puts it back under every check. What the
  // record must be to be SAVED (Firestore safety, the V5 schema, grade values)
  // is still judged on everything stored.
  const retiredQuestions = questions.flatMap((question, index) => (
    question?.teacherExcluded === true
      ? [{ questionId: clean(question?.questionId) || null, questionNumber: index + 1 }]
      : []
  ));
  const deliveredQuestions = questions.filter((question) => question?.teacherExcluded !== true);
  const deliveredOnly = { deliveredOnly: true };

  const runtimeContractErrors = [];
  try {
    validateAssignmentQuestions(questions, {
      variantMode: runtimeSource?.variantPolicy?.mode,
      ...deliveredOnly,
    });
  } catch (error) {
    runtimeContractErrors.push(String(error?.message || error));
  }
  const semantic = validateQuestionsSemantics(questions, deliveredOnly);
  const interaction = validateAssignmentInteractionContracts(questions, deliveredOnly);
  const worksheetPrint = auditAssignmentWorksheetPrintability({ ...runtimeSource, sections }, questions, deliveredOnly);
  const supportDifferentiation = auditAssignmentSupportDifferentiation({ ...runtimeSource, sections }, questions, deliveredOnly);
  const classworkPacing = analyzeClassworkPlannedTime({ ...runtimeSource, sections });
  // Question families, per-student uniqueness and Recovery readiness, judged
  // on the runtime view students will actually be given.
  const questionGeneration = auditAssignmentQuestionGeneration({ ...runtimeSource, sections }, questions, { classSize, ...deliveredOnly });
  // Question values: will the grade be computed the way the teacher expects?
  // Read-only, like every audit here — it never sets a value.
  const questionValues = auditAssignmentQuestionValues({ ...runtimeSource, sections }, questions);
  // Multiple Representations boards in Process Mode: every offered method can
  // be completed and is verified by the server on every version, and every
  // card the board asks for can be opened.
  const processMode = auditAssignmentProcessMode({ ...runtimeSource, sections }, questions);
  // Graph-reading items a screen reader cannot answer from (warning only).
  const graphAccessibility = auditAssignmentGraphAccessibility(questions, deliveredOnly);
  // Worked solutions that only state the answer or name no common error, and
  // choice reasons that can never be shown (HELP-11, HELP-18). ADVISORY: shown
  // in Pre-Flight's Check step, deliberately NOT a diagnostic group. Any
  // warning diagnostic makes the assignment "Needs Review", and a Needs Review
  // assignment is an unpublished draft students never see
  // (assignmentAvailability.js isUnpublishedDraft) — no real lesson authors a
  // commonError yet, so as a diagnostic this would hide every new import.
  const solutionReviews = auditAssignmentSolutionReviews(questions, deliveredOnly);

  // Practice items with no attempt feedback (warning only, and advisory: kept
  // out of the readiness diagnostics below — attemptFeedbackPreflight.js).
  const attemptFeedback = auditAssignmentAttemptFeedback(questions, deliveredOnly);
  // Hints that state what the student is asked to produce (warning only, and
  // advisory like attemptFeedback — hintAnswerPreflight.js).
  const hintAnswers = auditAssignmentHintAnswers(questions, deliveredOnly);
  // Teacher-written hints the runtime guard drops, with the reason (HELP-16):
  // advisory, like hintAnswers.
  const hiddenHints = auditAssignmentHiddenHints(questions, deliveredOnly);
  // Choice options worth the same as the key (GR06): advisory, like hintAnswers.
  const choiceOptions = auditAssignmentChoiceOptions(questions, deliveredOnly);
  // The teacher's own hints and worked solutions with no Spanish version, or
  // one that cannot be shown (TT22): advisory, like hintAnswers.
  const spanishVersions = auditAssignmentSpanishVersions(questions, deliveredOnly);
  // Typed keys that may be graded in another reading than the author's
  // (GR04), and "lowest terms" asked of a box that takes any equal value
  // (GR14), from answerKeyPreflight.js: advisory, like hintAnswers.
  const answerKeys = auditAssignmentAnswerKeys(questions, deliveredOnly);
  // Systems that cannot have exactly one solution as written, and a vertex or
  // center asked of a function that has none (TT04): advisory like the rest,
  // because a warning diagnostic would hide a deliberate dependent system's
  // lesson from its class.
  const impossibleItems = auditAssignmentImpossibleItems(questions, deliveredOnly);
  // Prompts that need another question's answer ("Use the prices you found"),
  // which a student can meet first or without that question
  // (otherQuestionReferencePreflight.js, #554 item 6): advisory like the rest.
  const otherQuestionReferences = auditAssignmentOtherQuestionReferences(questions, deliveredOnly);
  // Prompts that send students to a graphing calculator the question does not
  // give them, judged on the calculator a student actually gets with this
  // review's settings (graphingCalculatorPromptPreflight.js): advisory.
  const graphingCalculatorPrompts = auditAssignmentGraphingCalculatorPrompts(runtimeSource, questions, deliveredOnly);
  // Question ↔ tool contract: judged on the LITERAL record, because it also
  // reports records that only work because a runtime repair rescues them and
  // offers the safe repair that makes the saved assignment match.
  const toolContract = auditAssignmentToolContracts({ ...source, sections: persistenceSections });

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
    if (question?.teacherExcluded === true) return;
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
  const alignmentSpecificityWarnings = asMessages(auditAlignmentSpecificity(deliveredQuestions).warnings);

  const diagnosticGroups = [
    { source: 'persistence', severity: 'blocking', messages: persistenceErrors },
    { source: 'structural', severity: 'blocking', messages: asMessages(structural.errors) },
    { source: 'runtimeContract', severity: 'blocking', messages: runtimeContractErrors },
    { source: 'semantic', severity: 'blocking', messages: asMessages(semantic.errors) },
    { source: 'interaction', severity: 'blocking', messages: asMessages(interaction.errors) },
    { source: 'worksheetPrint', severity: 'blocking', messages: asMessages(worksheetPrint.errors) },
    { source: 'supportDifferentiation', severity: 'blocking', messages: asMessages(supportDifferentiation.errors) },
    { source: 'classworkPacing', severity: 'blocking', messages: asMessages(classworkPacing.errors) },
    { source: 'alignment', severity: 'blocking', messages: alignmentErrors },
    { source: 'toolContract', severity: 'blocking', messages: toolContract.errors },
    { source: 'questionGeneration', severity: 'blocking', messages: questionGeneration.errors },
    { source: 'questionValue', severity: 'blocking', messages: questionValues.errors },
    { source: 'processMode', severity: 'blocking', messages: processMode.errors },
    { source: 'persistence', severity: 'warning', messages: persistenceWarnings },
    { source: 'structural', severity: 'warning', messages: asMessages(structural.warnings) },
    { source: 'semantic', severity: 'warning', messages: asMessages(semantic.warnings) },
    { source: 'interaction', severity: 'warning', messages: asMessages(interaction.warnings) },
    { source: 'worksheetPrint', severity: 'warning', messages: asMessages(worksheetPrint.warnings) },
    { source: 'supportDifferentiation', severity: 'warning', messages: asMessages(supportDifferentiation.warnings) },
    { source: 'alignment', severity: 'warning', messages: alignmentWarnings },
    { source: 'alignmentProvenance', severity: 'warning', messages: alignmentProvenanceWarnings },
    { source: 'alignmentSpecificity', severity: 'warning', messages: alignmentSpecificityWarnings },
    { source: 'toolContract', severity: 'warning', messages: toolContract.warnings },
    { source: 'questionGeneration', severity: 'warning', messages: questionGeneration.warnings },
    { source: 'questionValue', severity: 'warning', messages: questionValues.warnings },
    { source: 'processMode', severity: 'warning', messages: processMode.warnings },
    { source: 'graphAccessibility', severity: 'warning', messages: graphAccessibility.warnings },
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
    assignmentV5: { ...source, sections: persistenceSections },
    sections,
    questions,
    runtimeRepair,
    classworkPacing,
    toolContract,
    questionGeneration,
    questionValues,
    processMode,
    // Advisory only (see above): never in errors, warnings or diagnostics.
    advisory: summarizeAdvisoryFindings({ solutionReviews, attemptFeedback, hintAnswers, hiddenHints, choiceOptions, spanishVersions, otherQuestionReferences, graphingCalculatorPrompts, answerKeys, impossibleItems }),
    solutionReviews,
    attemptFeedback,
    hintAnswers,
    hiddenHints,
    choiceOptions,
    spanishVersions,
    answerKeys,
    impossibleItems,
    otherQuestionReferences,
    graphingCalculatorPrompts,
    // Excluded questions Pre-Flight kept but did not judge for delivery.
    retiredQuestions,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    diagnostics,
    authoringState,
    isValid: uniqueErrors.length === 0,
  };
};

/*
 * THE ADVISORY FINDINGS, COUNTED (TT14, TT21, TT22). Worked solutions, attempt
 * feedback, hints that state the answer, hints the leak guard hides, choice
 * options worth the key and the Spanish for a teacher's own hints and worked
 * solutions stay advice: a warning in readiness would make the
 * assignment "Needs Review", which students never see (the owner's call: they
 * stay advisory). Pre-Flight shows how many there are so they are not missed;
 * nothing here changes whether the assignment is ready. So do the two prompt
 * notes of #554 item 6: a prompt that needs another question's answer, and a
 * prompt that names a graphing calculator the question does not give. And so
 * do the two panels the count used to leave out: the answer keys to check
 * (answerKeyPreflight.js) and the questions to double-check
 * (impossibleItemsPreflight.js), advice in their own panels like the rest.
 *
 * Each group is named for what one of its notes is, in the plural (`label`)
 * and the singular (`singular`): "1 prompt that needs another question's
 * answer", never "1 prompts…". A worked-solution or Spanish note can cover
 * many questions at once, so those are counted as notes; a choice note is
 * one choice box's, and a question can have several, so those are counted
 * as boxes.
 */
export const ADVISORY_FINDING_GROUPS = Object.freeze([
  Object.freeze({ id: 'solutionReviews', singular: 'note on worked solutions', label: 'notes on worked solutions' }),
  Object.freeze({ id: 'attemptFeedback', singular: 'Practice question with no attempt feedback', label: 'Practice questions with no attempt feedback' }),
  Object.freeze({ id: 'hintAnswers', singular: 'hint that states the answer', label: 'hints that state the answer' }),
  Object.freeze({ id: 'hiddenHints', singular: 'hint students will not see', label: 'hints students will not see' }),
  Object.freeze({ id: 'choiceOptions', singular: 'choice box with an option worth the same as the key', label: 'choice boxes with options worth the same as the key' }),
  Object.freeze({ id: 'spanishVersions', singular: 'note on Spanish for hints and worked solutions', label: 'notes on Spanish for hints and worked solutions' }),
  Object.freeze({ id: 'otherQuestionReferences', singular: 'prompt that needs another question\'s answer', label: 'prompts that need another question\'s answer' }),
  Object.freeze({ id: 'graphingCalculatorPrompts', singular: 'prompt that names a graphing calculator students do not get', label: 'prompts that name a graphing calculator students do not get' }),
  Object.freeze({ id: 'answerKeys', singular: 'answer key to check', label: 'answer keys to check' }),
  Object.freeze({ id: 'impossibleItems', singular: 'note to double-check', label: 'notes to double-check' }),
]);

/** Each group with notes, its label in the number its count needs, and the total. */
export const summarizeAdvisoryFindings = (audits = {}) => {
  const groups = ADVISORY_FINDING_GROUPS
    .map(({ id, singular, label }) => {
      const count = Array.isArray(audits?.[id]?.warnings) ? audits[id].warnings.length : 0;
      return { id, label: count === 1 ? singular : label, count };
    })
    .filter((group) => group.count > 0);
  return { total: groups.reduce((sum, group) => sum + group.count, 0), groups };
};

/** The words Review's Check step shows: "1 hint that states the answer, 2 answer keys to check". */
export const advisoryCountsText = (advisory = {}) => (Array.isArray(advisory?.groups) ? advisory.groups : [])
  .map((group) => `${group.count} ${group.label}`)
  .join(', ');

/** "1 suggestion" or "3 suggestions". */
export const advisoryTotalText = (advisory = {}) => {
  const total = Number(advisory?.total) || 0;
  return total === 1 ? '1 suggestion' : `${total} suggestions`;
};

export const sectionVariantModeV5 = (assignmentV5 = {}, role) => (
  assignmentV5?.variantPolicy?.sectionModes?.[role]
  || assignmentV5?.variantPolicy?.mode
  || 'personalized'
);
