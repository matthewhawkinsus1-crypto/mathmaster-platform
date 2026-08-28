import { flattenV5Sections } from './assignmentSchemaV5.js';

export const runtimeQuestionsFromAssignment = (assignment = {}) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return [];
  if (Number(assignment.schemaVersion) !== 5) return [];
  return flattenV5Sections(assignment);
};

export const hydrateAssignmentRuntime = (assignment = {}) => ({
  ...assignment,
  // Renderer-only projection. Firestore persists sections[] as the sole content
  // source of truth; core lifecycle, policy, and dashboard decisions must read
  // canonical V5 sections/policies directly. Mature renderers may temporarily
  // consume assignment.questions until their UI loops are migrated.
  questions: runtimeQuestionsFromAssignment(assignment),
});

export const runtimeQuestionCount = (assignment = {}) => runtimeQuestionsFromAssignment(assignment).length;

export default hydrateAssignmentRuntime;
