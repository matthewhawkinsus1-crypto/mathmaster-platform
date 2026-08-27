import { flattenV5Sections } from './assignmentSchemaV5.js';

export const runtimeQuestionsFromAssignment = (assignment = {}) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return [];
  if (Number(assignment.schemaVersion) !== 5) return [];
  return flattenV5Sections(assignment);
};

export const hydrateAssignmentRuntime = (assignment = {}) => ({
  ...assignment,
  // Runtime-only projection. Firestore persists sections[] as the sole content
  // source of truth; student/teacher components may keep using assignment.questions
  // while the remaining readers are migrated incrementally.
  questions: runtimeQuestionsFromAssignment(assignment),
});

export const runtimeQuestionCount = (assignment = {}) => runtimeQuestionsFromAssignment(assignment).length;

export default hydrateAssignmentRuntime;
