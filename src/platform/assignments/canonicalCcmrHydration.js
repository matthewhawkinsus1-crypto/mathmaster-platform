import { compileAuthoringIntentV5 } from '../contract/authoringIntentV5.js';
import { normalizeAssignmentV5 } from '../contract/assignmentSchemaV5.js';
import { buildAssignmentV5PreflightModel } from '../preflight/assignmentV5PreflightModel.js';

const clean = (value) => String(value ?? '').trim();

const bankDocumentId = (question = {}) => (
  clean(question?.ccmrSource?.source) === 'auditedBank'
    ? clean(question?.ccmrSource?.documentId)
    : ''
);

const assertSameShape = (baseSections, hydratedSections, compiledSections) => {
  if (
    baseSections.length !== hydratedSections.length
    || baseSections.length !== compiledSections.length
  ) {
    throw new Error('CCMR hydration changed the assignment section structure. MathMaster stopped before changing the reviewed lesson.');
  }

  baseSections.forEach((baseSection, sectionIndex) => {
    const baseQuestions = Array.isArray(baseSection?.questions) ? baseSection.questions : [];
    const hydratedQuestions = Array.isArray(hydratedSections[sectionIndex]?.questions)
      ? hydratedSections[sectionIndex].questions
      : [];
    const compiledQuestions = Array.isArray(compiledSections[sectionIndex]?.questions)
      ? compiledSections[sectionIndex].questions
      : [];
    if (
      baseQuestions.length !== hydratedQuestions.length
      || baseQuestions.length !== compiledQuestions.length
    ) {
      throw new Error('CCMR hydration changed the assignment question count. MathMaster stopped before changing the reviewed lesson.');
    }
  });
};

/**
 * The CCMR service returns a mixed document when it enriches an already-reviewed
 * assignment: unchanged questions are canonical runtime contracts, while newly
 * sourced audited-bank questions are authoring intent. Recompiling that entire
 * mixed document is unsafe because the authoring compiler is intentionally not
 * an inverse of the runtime compiler.
 *
 * Compile the server result only as a source for the newly injected bank items,
 * then lay those items back onto the exact reviewed canonical assignment.
 */
export const applyCcmrHydrationToCanonicalAssignment = ({
  baseAssignmentV5,
  hydratedAssignment,
} = {}) => {
  const base = normalizeAssignmentV5(baseAssignmentV5);
  const hydrated = hydratedAssignment && typeof hydratedAssignment === 'object'
    ? hydratedAssignment
    : base;

  const compiledHydrated = compileAuthoringIntentV5(hydrated).package;
  const baseSections = Array.isArray(base.sections) ? base.sections : [];
  const hydratedSections = Array.isArray(hydrated.sections) ? hydrated.sections : [];
  const compiledSections = Array.isArray(compiledHydrated.sections) ? compiledHydrated.sections : [];
  assertSameShape(baseSections, hydratedSections, compiledSections);

  let replacements = 0;
  const sections = baseSections.map((baseSection, sectionIndex) => {
    const hydratedSection = hydratedSections[sectionIndex];
    const compiledSection = compiledSections[sectionIndex];
    return {
      ...baseSection,
      questions: (baseSection.questions || []).map((baseQuestion, questionIndex) => {
        const hydratedQuestion = hydratedSection.questions[questionIndex];
        const compiledQuestion = compiledSection.questions[questionIndex];

        const hydratedDocumentId = bankDocumentId(hydratedQuestion);
        const baseDocumentId = bankDocumentId(baseQuestion);
        const injectedAuditedItem = Boolean(hydratedDocumentId)
          && hydratedDocumentId !== baseDocumentId;

        if (!injectedAuditedItem) return baseQuestion;
        replacements += 1;
        return compiledQuestion;
      }),
    };
  });

  const candidate = normalizeAssignmentV5({
    ...base,
    sections,
  });
  const model = buildAssignmentV5PreflightModel(candidate);
  if (!model.isValid) {
    throw new Error(
      `The audited CCMR enrichment did not pass MathMaster's assignment checks:\n${model.errors.join('\n')}`,
    );
  }

  return {
    assignmentV5: model.assignmentV5,
    questions: model.questions,
    replacements,
  };
};

export default applyCcmrHydrationToCanonicalAssignment;
