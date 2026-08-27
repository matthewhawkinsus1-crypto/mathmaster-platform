import { normalizeAssignmentV5, validateAssignmentV5, flattenV5Sections } from '../contract/assignmentSchemaV5.js';
import { validateQuestionsSemantics } from '../contract/semanticValidation.js';
import { validateAlignments, auditAlignmentSpecificity } from '../contract/alignments.js';
import { toEnforcedActivityPolicy } from '../policies/activityPolicies.js';
import { validateAssignmentInteractionContracts } from '../interaction/interactionContract.js';

const clean = (value) => String(value ?? '').trim();

const titleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  quiz: 'Quiz',
  test: 'Test',
}[role] || 'Section');

export const buildAssignmentV5PreflightModel = (input = {}, { titleOverride = null } = {}) => {
  const source = normalizeAssignmentV5({
    ...input,
    assignment: {
      ...(input?.assignment || {}),
      ...(clean(titleOverride) ? { title: clean(titleOverride) } : {}),
    },
  });

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
  const errors = [...structural.errors, ...semantic.errors, ...interaction.errors];
  const warnings = [...structural.warnings, ...semantic.warnings, ...interaction.warnings];

  questions.forEach((question, index) => {
    const alignment = validateAlignments(question, { label: `Question ${index + 1}` });
    errors.push(...alignment.errors);
    warnings.push(...alignment.warnings);
  });
  warnings.push(...auditAlignmentSpecificity(questions).warnings);

  return {
    assignmentV5: { ...source, sections },
    sections,
    questions,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    isValid: errors.length === 0,
  };
};

export const sectionVariantModeV5 = (assignmentV5 = {}, role) => (
  assignmentV5?.variantPolicy?.sectionModes?.[role]
  || assignmentV5?.variantPolicy?.mode
  || 'personalized'
);
